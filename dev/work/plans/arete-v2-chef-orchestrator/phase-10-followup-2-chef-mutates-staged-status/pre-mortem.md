# Phase 10 followup-2 Pre-Mortem

**Authored**: 2026-06-06
**Plan**: phase-10-followup-2-chef-mutates-staged-status/plan.md (v2, post-review)
**Stance**: pessimistic — imagining this has shipped and failed three weeks from now

## Verdict: PROCEED WITH MITIGATIONS

PM and eng-lead reviews of v1 did the heavy lifting on the trust model (week-1 `[[confirm-skip]]` gate), atomicity (meeting-file lockfile is REQUIRED not optional), and prerequisite mis-tensing. v2 lands those edits. The CT2 walkthrough holds end-to-end; the zero-LOC apply path is verified; the audit log converged to the Phase 9 shape.

The failure modes that remain are workflow-shaped, not architecture-shaped: (F1) the `[[confirm-skip]]` accumulation pattern where the user just stops engaging; (F2) the merge-semantics edge case where extract races chef and clobbers `staged_item_skip_reason` even WITH the lock (because lock serializes writes but doesn't define field-ownership); (F3) `[[unskip]]` parser ambiguity rules look right in the AC but the resolver scan strategy is under-specified; (F4) git pollution from `chef-skip-log.md` writes; (F5) does v2 actually solve CT2 — yes, with one caveat about week-1 user-skim.

The highest-confidence risk is **F2 (extract-write semantics)** — even with the lockfile from Step 2, the plan's "merge semantics" prose (re-extract preserves chef entries, extract owns its 5 sibling fields) needs a concrete arbitration rule for the case where extract's write follows chef's write in the same lock-acquire/release/acquire cycle.

What this pre-mortem ISN'T flagging: the sibling-field shape (eng C3 was right), the zero-LOC apply path (verified), the audit log format (converged), the lockfile decision (eng C2 closed it), the `[[confirm-skip]]` first-week gate (PM C1 right call). Those are work the reviews already locked down.

---

## Top failure modes (F-class — must mitigate before build)

### F1: `[[confirm-skip]]` accumulation — user ignores the directive across multiple winddowns; chef-proposed backlog grows; signal is silently lost

**Scenario**: Day 3 of soak. Chef proposes skipping `ai_0042`. Winddown view shows "add `[[confirm-skip ai_0042]]` to confirm." John skims, doesn't confirm, doesn't unskip — just clicks `approve all staged`. Per AC8, ai_0042's `staged_item_status` is `'pending'`, so it stages normally and gets committed (this is the failure-safe path; chef-proposed lapses harmlessly). Audit log records PROPOSE but no CONFIRM, no UNSKIP.

Day 5: chef proposes ai_0089. Same pattern. John skims, approves all, commits anyway.

Day 7: ship sentinel hits +7d. AC8 demotion logic checks `grep -c "UNSKIP" chef-skip-log.md`. Result is `0`. **Demotion fires automatically: chef switches to direct `'skipped'` write.** But the demotion was triggered on the absence of UNSKIP, not the presence of CONFIRM. The PROPOSE-without-CONFIRM pattern means: user never engaged with the directive; chef's signal was effectively ignored 100% of the time during week-1; but the demotion criterion ("zero false-positives") fires regardless because no one used the override either. The system concludes "the user trusts chef-skip" when actually the user just ignored everything.

Now in week-2, chef writes `'skipped'` directly. ai_0099 fires. John skims winddown, doesn't notice, clicks approve. **Item silently dropped.** If ai_0099 was actually a real commitment (chef was wrong but never got challenged because user didn't engage with proposals either), it disappears. After 30 days of stagnation, the pending-confirm backlog is invisible (it's not a backlog because the items DID commit, just without honoring chef's skip signal).

The plan's R6 acknowledges this and leans NO on auto-expiry, claiming "chef-proposed lapses naturally because `staged_item_status = 'pending'`." That's correct for the SAFETY case (no silent skip during week-1) but WRONG for the LEARNING case (we can't tell if zero overrides = user trust or = user disengagement).

**Leading indicators**:
- Daily soak metric: PROPOSE count - CONFIRM count. If ratio > 5:1 across week-1, user is not engaging.
- Day-7 audit log: zero CONFIRM AND zero UNSKIP entries → demotion criterion is meaningless. Don't auto-demote on this state.

**Probability**: Medium-high. User memory: "Builder AND primary daily user" — John can build the gate and then skim the directive because he authored it; the same pattern that motivated `feedback_l3_memory.md` ("L3 memory should be automated").

**Impact**: Medium. Worst case is silent demotion to a feature that the user never validated; week-2+ misfires go undetected for the same reason.

**Mitigation**:
1. **Strengthen AC8 demotion criterion**: require BOTH zero UNSKIP AND at-least-one CONFIRM during week-1 for auto-demotion. Otherwise extend the gate by 7 more days (keep chef-proposed) and surface "no confirmations observed — extending soak."
2. **Day-3 nudge in winddown**: if PROPOSE count > 0 AND CONFIRM count == 0 AND > 48h since first PROPOSE, surface a soft "you have N chef-proposed skips that have not been confirmed. To confirm them, add `[[confirm-skip <id>]]`; to override, `[[unskip <id>]]`; to ignore, do nothing (item stages normally)." Once per winddown, not per directive.
3. **30-day pending-confirm purge**: chef-proposed entries with `setAt < now - 30d` AND no follow-up directive get a one-time "stale chef-proposed" log entry + retained in audit log; the `staged_item_skip_reason` entry stays (audit value preserved) but is dropped from active winddown surfacing.

**Plan reference**: AC8 (line 218+), R6 (Risks section).

---

### F2: Meeting-file lockfile race — extract clobbers chef's `staged_item_skip_reason` despite the lock

**Scenario**: Tuesday 6:00pm. Chef SKILL invokes `writeChefSkipToFile` on `john-jamie-2026-06-04.md`. `MeetingService.writeWithLock` acquires lock at T=0, reads file, mutator runs (sets `staged_item_status[ai_0042] = 'skipped'` + `staged_item_skip_reason[ai_0042]`), tmp+rename, releases lock at T=200ms.

Tuesday 6:00:01pm. Async Fathom transcript arrives. The arete watcher (or manual `arete meeting extract`) fires on the same meeting. Extract reads file (now contains chef's writes), starts LLM extract for staged items, computes new sibling fields. Extract finishes at T=8s, calls `writeWithLock` to update frontmatter. Acquires lock at T=8s.

**Question**: does extract's update preserve `staged_item_skip_reason`?

The plan's Step 5 says yes — re-extract preservation logic merges chef entries forward. The §"Merge semantics" subsection says: "chef's `staged_item_skip_reason` entries take precedence over extract's wholesale rewrite; extract still rewrites `staged_item_source`, `staged_item_confidence`, etc. wholesale."

BUT: the implementation lives in `meeting.ts:1103-1108` extract path, which is the OTHER side of the lock. If Step 5 is correctly implemented, extract's mutator reads the existing file (sees chef's `skip_reason`), merges forward, writes back. If Step 5 is INCORRECTLY implemented (or has a bug), extract's wholesale rewrite of sibling fields could include `staged_item_skip_reason = {}` (initialized empty during extract's LLM-shape rewrite) and clobber chef's write. The lock doesn't protect against this — it only serializes; it doesn't enforce per-field ownership.

**The lockfile from Step 2 (`MeetingService.writeWithLock`) closes the WRITE race (no torn writes, no two concurrent writers). It does NOT close the SEMANTIC race (extract's writer correctly reads + merges chef's entries before writing).** Step 5's merge logic is the semantic protection. If Step 5 is buggy, chef's writes are lost.

The plan's §"Merge semantics" describes the rule but doesn't enforce it at the type level. The mutator function passed to `writeWithLock` is freeform — there's no type-system guard that says "extract's mutator must preserve `staged_item_skip_reason` from `current`."

**Leading indicators**:
- Step 5 unit tests: synthetic chef-skip + extract-with-mocked-LLM round-trip. If the test asserts `staged_item_skip_reason[ai_0042]` is preserved, the contract holds. If the test only checks `staged_item_status[ai_0042] === 'skipped'`, it's incomplete (status could be preserved while reason is dropped).
- Real-world: 6/04-style winddown → chef-skip → late-arriving Fathom transcript triggers extract → check meeting file frontmatter. If `staged_item_status` shows `'skipped'` but `staged_item_skip_reason` is missing, F2 has fired.

**Probability**: Medium. Step 5 is explicitly in scope; the merge semantics are documented. But the codepath is `meeting.ts:1103-1108` — the same wholesale-rewrite that motivated the followup. Easy to get the merge wrong if the reviewer doesn't read the v2 §"Merge semantics" subsection carefully.

**Impact**: Medium-high. If `staged_item_skip_reason` is dropped but `staged_item_status` stays `'skipped'`, the apply still drops the item (zero-LOC filter at staged-items.ts:487), BUT the "Skipped on Apply" section at AC3 fails (no reason to display), the APPLY-SKIP audit line at AC9 has no reason, and the user override path via `[[unskip]]` works only by ID (no reason context for user to remember why chef proposed).

**Mitigation**:
1. **Tighten merge contract at type-system level**: define `type ExtractMutator = (current: MeetingFrontmatter) => Omit<MeetingFrontmatter, 'staged_item_skip_reason'> & { staged_item_skip_reason: typeof current.staged_item_skip_reason }` — TypeScript enforces preservation.
2. **AC5 strengthening**: explicitly assert in re-extract preservation test that `staged_item_skip_reason` survives byte-for-byte (not just keys preserved — full nested shape preserved).
3. **Defensive read in apply path**: if `staged_item_status[id] === 'skipped'` AND `staged_item_skip_reason[id]` is absent, the "Skipped on Apply" section emits `reason: <unknown, possibly cleared by re-extract — check audit log>`. Soft fallback.
4. **Audit log SKIP entries carry full payload** (current plan): user can recover the reason from `chef-skip-log.md` via `grep` if the frontmatter loses it. Already in the plan; reinforces the safety net.

**Plan reference**: §"Re-extract preservation" + §"Merge semantics" (Architecture); AC5; Step 5.

---

### F3: `[[unskip <id>]]` parser ambiguity — id-alone matches in 2+ meetings; resolver scan strategy unspecified

**Scenario**: Monday morning batch winddown covers Friday + weekend. Three meetings on Friday all have staged items in the `ai_004x` range. Chef proposed skipping `ai_0042` (in `john-jamie-friday-am`) AND `ai_0043` (in `glance-2-friday`). User reviews Monday, decides to override `ai_0042`, adds `[[unskip ai_0042]]` to the winddown view. Re-runs winddown.

Parser scans for `[[unskip ai_0042]]`. The id-alone resolver kicks in: "search staged sections of meetings active in past 7 days." Found in `john-jamie-friday-am`. Good — flip status.

But wait: what if `ai_0042` ALSO exists in `glance-2-friday`? IDs are per-meeting-scoped (auto-incremented within each meeting), not globally unique. Both meetings could have `ai_0042`. The plan says: "Ambiguous id-alone (matches in 2+ meetings) NO-OPs and surfaces 'please qualify' in next winddown" (AC6). Good for SAFETY.

But the **scan strategy itself is under-specified**. "Search staged sections of meetings active in past 7 days" — what counts as "active"? Any meeting file with `mtime` in last 7d? Any meeting with `staged_item_status` map populated? Any meeting referenced in the current winddown's `now/archive/`? Each gives different results:

- **By mtime**: includes meetings the user re-extracted but never staged. Picks up false matches.
- **By staged-status presence**: misses meetings where extract already cleared sibling fields (post-apply).
- **By winddown archive**: only sees meetings explicitly named in the current winddown's body — but `ai_0042` might be in a meeting NOT in this winddown if user did a partial batch.

The plan picks "active in past 7 days" but doesn't define active. Resolver could scan ALL meeting files in the workspace, but that's O(N) where N grows; on a 6-month workspace with 200+ meetings, it's a 200-file disk scan per directive.

**Leading indicators**:
- Step 6 implementation: which method does the resolver use? Check the PR.
- Resolver perf: time `[[unskip ai_0042]]` parse-and-resolve on a workspace with 50 meetings vs 500 meetings. If linear scaling is visible, the strategy is brute-force.

**Probability**: Medium. The PM C4 + AC6 design got id-alone vs slug-qualified right at the directive surface, but the resolver internals are an implementation detail Step 6 has to nail.

**Impact**: Low-medium. Worst case: resolver picks wrong meeting (silent flip on a different `ai_0042` than user intended). Even worse: ambiguity check fires false-positives on stale meeting files. Both manifest as user confusion: "I unsked ai_0042 but it's still skipped."

**Mitigation**:
1. **Spec the resolver scan strategy in Step 6**: "scan meeting files where `staged_item_status` is populated (non-empty map) — these are the only files where unskip has any effect." Cap at N=50 most-recent-mtime if list exceeds.
2. **Disambiguation precedence rule (concrete)**: if id-alone matches 2+ candidates → emit "ambiguous: ai_0042 found in [john-jamie-friday, glance-2-friday]; please use `[[unskip <slug>:ai_0042]]`" in next winddown. NO-OP all matches. If id-alone matches 0 candidates → emit "no match for ai_0042 — may have already been processed or cleared on apply." Add to AC6.
3. **Resolver returns full provenance**: every directive resolution writes an audit log entry with `{action, id, qualifier, resolvedTo, candidateCount}` so soak can spot resolver misses.

**Plan reference**: AC6, HP4, Step 6.

---

### F4: `chef-skip-log.md` pollutes `git status` — every winddown leaves uncommitted lines

**Scenario**: John's `dev/diary/` is git-tracked (per `feedback_commit_dist.md` pattern: "Always commit dist/ build artifacts"). Phase 9 set the precedent with `brief-invocations.log` — but Phase 9's log is also in `dev/diary/`. After every winddown, `chef-skip-log.md` gets new lines. `git status` shows `modified: dev/diary/chef-skip-log.md`. Every git status, every git diff, every commit prep is polluted by audit log churn.

If the user commits the log file (per Phase 9 precedent), then audit log is git-tracked and grows monotonically in the repo. After 6 months, the file is 5000+ lines. `git log dev/diary/chef-skip-log.md` is itself noisy (a commit per day or per winddown).

If the user does NOT commit the log (gitignored), then the soak observability requires the log file to exist locally — which it does — but the file isn't versioned, so a `git clean -fd` or a fresh clone loses the audit history.

Phase 9 verified this isn't a blocker for `brief-invocations.log`. Let me check the verdict.

**How Phase 9 resolved it**: per `packages/cli/src/commands/intelligence.ts:842-851`, the log writer creates `dev/diary/` if missing and appends `${ISO} ${mode} ${JSON.stringify(input)}\n` per invocation. Best-effort, no gitignore guidance in the code. The convention is that `dev/diary/` IS the soak-observability scratch space — user CHOOSES whether to gitignore or commit based on their workflow.

**Probability**: Medium. The pollution is real but transient — once the user gets used to seeing `chef-skip-log.md` in git status, they either gitignore it or accept the noise.

**Impact**: Low. Doesn't break functionality. Erodes attention budget — every git status has noise that the user must learn to ignore. Counter to the "winddown bloat is the antagonist" stance (per `project_arete_v2_direction.md`).

**Mitigation**:
1. **Pre-build check**: verify Phase 9's `brief-invocations.log` is gitignored in this repo (`grep "brief-invocations" .gitignore`). If yes, add `dev/diary/chef-skip-log.md` to the same `.gitignore` block. If no (Phase 9 didn't gitignore it), follow the same precedent.
2. **Document the convention** in plan §"Audit log": "chef-skip-log.md is local-only audit; gitignore alongside brief-invocations.log."
3. **Soak observability fallback**: if user gitignores the log AND wants to share findings, `grep | jq` produces a parseable subset they can paste into a soak review document. The raw log doesn't need to be versioned.

**Plan reference**: §"Audit log" architecture section; references to Phase 9 precedent.

---

### F5: Week-1 user skims winddown, doesn't add `[[confirm-skip]]`, doesn't add `[[unskip]]` either — CT2 commits anyway

**Scenario**: Walk through tonight's 6/04 winddown end-to-end with v2 logic active and ship date = 6/04 (day-0 of week-1):

1. **6/04 ~11am**: John runs `arete meeting extract john-jamie-am-claim-review`. ai_0042 staged with `staged_item_status[ai_0042] = 'pending'`.
2. **6/04 daytime**: John DMs Jamie the Notion link.
3. **6/04 ~6pm winddown**: Chef Rule 1/Rule 4 reconcile → "concrete match" skip-stage for ai_0042. **With v2 active**: ship sentinel says day-0 (within week-1) → chef calls `writeChefSkipToFile(... setBy: 'chef-proposed')`. Per AC8: `staged_item_status[ai_0042]` STAYS `'pending'`; `staged_item_skip_reason[ai_0042] = { ..., setBy: 'chef-proposed' }`; PROPOSE audit line written.
4. **Winddown curated view**: surfaces "Chef proposes skipping ai_0042 — already fulfilled via slack-dm [[confirm-skip ai_0042]]" (per AC8 surface).
5. **6/04 evening**: John skims winddown. He sees the chef-proposed line but doesn't add `[[confirm-skip]]`. Doesn't unskip either. Clicks `approve all staged`.
6. **`commitApprovedItems` runs**: `staged_item_status[ai_0042] === 'pending'` → filter `v === 'approved'` rejects it → **ai_0042 is NOT committed** (staged_item_status is 'pending' so filter drops it).

Wait — but `'pending'` items are also dropped by the apply filter (filter accepts only `'approved'`). So in week-1, a chef-proposed skip leaves the item at `'pending'`, which means apply DROPS IT regardless. **The CT2 commitment is NOT created.**

But that's the same outcome as week-2 (where status is `'skipped'`). So week-1 chef-proposed and week-2 chef both achieve the same end-state (no CT2 commit)?

Re-reading AC8 more carefully: "User omits directive: status remains `'pending'`; apply stages normally (chef-proposed lapses harmlessly)." But "apply stages normally" means it stays as a pending staged item — does that mean the item REMAINS in `staged_item_status` map as pending and gets re-surfaced for next-time approval? Or does it get committed?

Looking at the `commitApprovedItems` filter: `Object.entries(statusMap).filter(([, v]) => v === 'approved')`. `'pending'` items are NOT included in the commit set. They stay in frontmatter post-commit? Let's check the cleanup: lines 575-579 delete ALL sibling fields including `staged_item_status` after commit. So the pending item just gets dropped from frontmatter on commit — it doesn't become a commitment, but it ALSO doesn't get re-surfaced (frontmatter is wiped).

**So the actual flow is**: in week-1, if user does nothing, chef-proposed ai_0042 has `'pending'` status → apply filter drops it → frontmatter cleared → item is gone. **Same end-state as week-2 chef-direct 'skipped': no commitment created.**

This means the week-1 gate provides ZERO additional safety for the happy path (chef right). It only helps if chef is WRONG and the user wants to undo. In that case:
- Week-1 (chef-proposed): user adds `[[unskip ai_0042]]` → status flips to `'pending'` (from already-pending; no-op essentially) → next apply still drops it. **Wait, this is wrong.** If chef is wrong and item should commit, the user needs status to be `'approved'`, not `'pending'`. The `[[unskip]]` directive flips skip back to pending, but `'pending'` items still don't commit.

**This is a real bug in v2 design.** Let me re-read AC6: "Parser flips status to `'pending'`, deletes `staged_item_skip_reason[ai_0042]`, appends UNSKIP audit line." Pending != approved. So `[[unskip]]` just un-skips the item back to staging-pending, and the user still has to APPROVE it on next apply (via standard staging flow). That makes sense if the apply UI re-surfaces pending items for approval — BUT only if the frontmatter ISN'T cleared on a no-op apply.

**Resolving the confusion**: a commit run only clears frontmatter for the items it ACTUALLY processed. If `commitApprovedItems` only processes status==='approved', the cleanup at 575-579 clears EVERYTHING regardless (it's a wholesale delete). So even pending items lose their frontmatter on the next apply. That makes the unskip flow broken: user unsks → status now pending → next apply clears all sibling fields → pending item gone.

**This is F5's core finding**: the week-1 chef-proposed state ('pending' + skip_reason 'chef-proposed') has an interaction with apply cleanup that isn't specified. Either:
- Apply must NOT clear frontmatter for items it didn't commit (preserve pending for next time). OR
- Apply must only clear sibling fields for items it explicitly committed. OR
- The week-1 gate must use a different status mechanic (e.g., `'pending'` + `skip_reason: chef-proposed` → apply skips it but ALSO preserves frontmatter for next round).

**Probability**: Medium-high. This is a subtle interaction the plan v2 doesn't explicitly address.

**Impact**: High. If the user unsks a chef-proposed during week-1, the item disappears on next apply instead of going back into staging. Trust crater.

**Mitigation**:
1. **Spec apply cleanup carefully**: `commitApprovedItems` cleanup at 575-579 should ONLY clear sibling fields for IDs that were committed (i.e., status was 'approved'). Pending items + their sibling fields stay in frontmatter for next apply.
2. **OR rework week-1 gate**: chef-proposed writes `staged_item_status[id] = 'approved'` with `skip_reason: chef-proposed`, and the apply path has a NEW check: "if status === 'approved' AND skip_reason.setBy === 'chef-proposed' AND ship-date < 7d ago → treat as skipped, surface in 'Awaiting confirm' section, do NOT commit." This is more invasive but makes the week-1 semantics first-class.
3. **AC8 strengthening**: explicit acceptance test for "week-1 chef-proposed + user does nothing → next apply → item lapses to staging-pending, NOT cleared from frontmatter." Verifies the interaction explicitly.

**Plan reference**: AC3 (cleanup at 575-579), AC6 (unskip flow), AC8 (chef-proposed week-1 path), §"Architecture > `staged_item_skip_reason` cleanup on commit."

---

## Medium-risk modes (M-class — consider mitigating, low-cost)

### M1: Audit log readability — `jq` works but `grep` requires JSON-escape awareness

**Scenario**: Soak review day 8. John runs `grep "SKIP " chef-skip-log.md | wc -l` (the v1 query). Returns 0 hits, because v2's format is `${ISO} chef-skip {"action":"SKIP",...}` — there's no bare "SKIP " token, it's wrapped in JSON. Correct query is `grep '"action":"SKIP"' chef-skip-log.md | wc -l`.

User updates the grep. Now wants to find "all chef-skips in last week." JSON-quoted ISO timestamps require careful regex: `grep '^2026-06-0[1-7]' chef-skip-log.md | jq -r 'select(.action == "SKIP")'` — except that's a `grep | jq` pipe where jq receives `${ISO} chef-skip ${JSON}` format which is NOT valid JSON line input. User needs `awk '{$1=$2=""; print}' | jq` to strip the prefix.

**Probability**: High. v2 format gives `jq` superpowers IF you strip the prefix; raw `grep` requires JSON-escape literacy.

**Impact**: Low. Soak findings still recoverable, just ergonomic friction.

**Mitigation**:
1. Document common queries in plan §"Soak observability": include the awk-strip recipe and 3 canonical grep+jq invocations.
2. Optional helper: `arete chef-skip-log query --action SKIP --since 2026-06-01` that does the prefix-strip + jq internally. Defer to followup unless soak demands it.

**Plan reference**: §"Soak observability + rollback" first 6 bullets.

---

### M2: `'pending'` ambiguity during week-1 — chef's pending vs extract's pending indistinguishable

**Scenario**: Chef writes chef-proposed for ai_0042 — `staged_item_status[ai_0042] = 'pending'` + `staged_item_skip_reason[ai_0042] = { setBy: 'chef-proposed' }`. Extract also writes `'pending'` for default-staged items at `meeting-processing.ts:476, 518, 557` (these set `status` from a variable, but the var resolves to 'pending' in default branches). For ai_0043 (a normal staged item the user hasn't acted on), `staged_item_status[ai_0043] = 'pending'` with NO `staged_item_skip_reason` entry.

Distinguishing them in week-1 winddown:
- chef-proposed: `staged_item_status === 'pending'` AND `staged_item_skip_reason[id].setBy === 'chef-proposed'`.
- extract-default: `staged_item_status === 'pending'` AND `staged_item_skip_reason[id]` is undefined.

The discriminator is the presence/setBy of `staged_item_skip_reason`. This works. But the SKILL.md prose has to know to surface only the chef-proposed subset in the "Chef proposes skipping" section, not all pending items.

**Probability**: Low. The discriminator is clean. Just needs SKILL.md prose to be explicit.

**Impact**: Low. Worst case: SKILL.md emits all pending items as "chef proposes" which the user immediately recognizes as a SKILL.md bug.

**Mitigation**: SKILL.md prose (Step 6) explicitly: "filter pending items by `staged_item_skip_reason[id]?.setBy === 'chef-proposed'`; do NOT surface bare-pending items in this section."

**Plan reference**: AC8 + Step 6 SKILL.md prose updates.

---

### M3: First-ship sentinel collision with worktree workflow

**Scenario**: `.arete/phase-10-followup-2-ship-date.json` records ship date. User maintains multiple worktrees per memory `feedback_branch_isolation.md`. Build in worktree A; sentinel file is written there. User merges to main, deletes worktree A. Sentinel file is gone from main (it was a build artifact in the worktree). Week-1 demotion logic in production checks for the sentinel — finds it missing — assumes "never shipped" or "still week-1 forever."

**Probability**: Low. The sentinel SHOULD be committed (it's a runtime config, not a build artifact). Per `feedback_commit_dist.md` precedent.

**Impact**: Low. If sentinel is missing, demotion logic should default to "ship is recent (within 7d)" and keep the chef-proposed gate active conservatively — failing safe.

**Mitigation**: 
1. Commit `.arete/phase-10-followup-2-ship-date.json` as part of the build PR.
2. Demotion logic defaults to chef-proposed (week-1 behavior) if sentinel is missing or unparseable. Fail-closed semantics.
3. Document in plan §"Pre-conditions" #4.

**Plan reference**: Pre-condition #4, AC7.

---

### M4: Audit log Phase 9 format alignment misses one nuance — `mode` field semantics

**Scenario**: Phase 9 format is `${ISO} ${mode} ${JSON.stringify(input)}`. v2 plan uses `${ISO} chef-skip ${JSON.stringify(payload)}`. The middle field — Phase 9's `mode` — was meant to be a high-level invocation mode (e.g., `brief-typed`, `brief-cli`). v2's middle field is `chef-skip` for ALL events (SKIP, PROPOSE, UNSKIP, CONFIRM, ABSTAIN, APPLY-SKIP). This is fine; just different semantic.

But if someone tries to grep Phase 9 vs v2 logs uniformly (e.g., "all telemetry events in `dev/diary/*.log`"), they'd expect the middle field to be a discriminator. In Phase 9 it's an event-type token; in v2 it's a constant module-name token. The action discriminator is INSIDE the JSON payload.

**Probability**: Low. Soak observability is module-specific (different log files); no one's grepping across both today.

**Impact**: Low. Minor ergonomic inconsistency.

**Mitigation**: Option (a) use the action as the mode: `${ISO} chef-skip:SKIP ${JSON.stringify(...)}` — slight format extension, retains Phase 9 spirit. Option (b) document the divergence in plan §"Audit log" — "chef-skip log uses module-name as mode token; action is inside payload (richer than Phase 9 since this module has more event types)."

**Plan reference**: §"Audit log" architecture section.

---

## Probed and ruled out

- **CT2 mechanically solved by v2** (Task 7 of pre-mortem brief): YES, mostly. The data path closes: chef writes → frontmatter mutates → apply filter drops → no commitment. F5 above is the one caveat — apply cleanup interaction with un-committed pending items needs spec-tightening.
- **`writeWithLock` PID race**: `proper-lockfile`'s stale-check on PID is solid; the 30s TTL is conservative. Not a pre-mortem risk.
- **Body-comment idempotence (MC2 from eng review)**: addressed in v2 Step 2 explicitly. Not a residual risk.
- **Orphan ID semantics**: MC3 from eng review — out-of-scope rename detection is acknowledged in plan §Non-goals.
- **Phase 11 interaction**: Phase 11 explicitly defers — no scope overlap.
- **Three-surface visibility (HP2)**: PM C2 + plan AC1/AC7 nail the hint persistence. Not a residual.

---

## Soak observability — what to watch (followup-2-specific)

**Daily during 14-day soak:**

1. **Engagement signal (F1)**: PROPOSE count vs CONFIRM+UNSKIP count for the day. If PROPOSE > 3 AND CONFIRM+UNSKIP == 0 for 3 consecutive days, user is not engaging — surface in next winddown.
2. **Merge semantics audit (F2)**: spot-check 1 chef-skipped meeting per day. After any re-extract on it, verify `staged_item_skip_reason` survives. If lost, F2 fired.
3. **Resolver perf (F3)**: log resolver wall-time per directive parse. If > 100ms median, scan strategy is brute-force; tighten the candidate set.
4. **Git status pollution (F4)**: `git status` at end of each soak day. If `chef-skip-log.md` appears modified AND it's not gitignored, gitignore it.
5. **Apply cleanup interaction (F5)**: after first user `[[unskip]]` event, verify the unsked item is staged-pending in NEXT apply, not cleared. If cleared, F5 fired — emergency hotfix needed.

**Rollback triggers (priority order)**:
- **F5 (apply cleanup interaction)**: feature-flag-off chef-proposed week-1 path; revert to direct skip (week-2 behavior) globally. Accept the trust trade for the cleanup safety.
- **F2 (extract clobbers skip_reason)**: feature-flag-off re-extract preservation; chef-skip works for non-re-extracted meetings only. Document the limitation.
- **F1 (accumulation)**: extend week-1 gate by 7 days; surface day-3 nudge as built-in.
- **F4 (git pollution)**: gitignore in hotfix; no functional rollback needed.

**Soak-success criteria (+14d)**:
- ≥1 `[[confirm-skip]]` AND ≥1 `[[unskip]]` used → AC6 + AC8 recovery paths both validated.
- Zero F5 fires (no unsked item lost to apply cleanup).
- Demotion fires automatically at +7d AND PROPOSE→CONFIRM rate > 50% (F1 mitigation #1).
- F2: zero observed `skip_reason` losses after re-extract.

---

## What this pre-mortem is betting

v2 plan is significantly tighter than v1 — PM + eng reviews did real work and v2 lands all blocking findings. The remaining failure modes are workflow-shaped (F1: user engagement; F5: apply cleanup interaction) and merge-semantics-shaped (F2). F3/F4 are smaller residuals.

**F5 is the highest-confidence concrete risk** because it points to an unspecified interaction between AC8's week-1 'pending' status and AC3's frontmatter cleanup. Without F5's mitigation #1 (only-clear-committed-IDs) or mitigation #2 (rework week-1 gate to 'approved' + soft-skip flag), the chef-proposed gate has a latent bug where unsked items disappear from staging. This is a small spec gap to close in v3 but the bug-shape is non-trivial.

**F1 (engagement)** is the next-highest because it determines whether the gate actually validates anything. v2's demotion criterion is "zero UNSKIPs" — too weak. Need "≥1 CONFIRM" too.

**F2 (extract clobber)** is plausible because Step 5 is implementation-detail-sensitive; the type-system mitigation (#1) is cheap and forces correctness.

Mitigate F1+F2+F5 in plan v3 (~½ day of plan revision, no scope growth) and ship. The structural CT2 fix lands; the trust model holds with the engagement-strengthening; the merge-semantics close with the type-tightening. The bets in the plan (sibling-field shape, zero-LOC apply, meeting-file lockfile, week-1 confirm gate, JSON audit log) are sound.

If F5 cannot be cleanly resolved without scope growth, fall back to v2's direct-skip mechanic for week-1 too (drop the chef-proposed gate entirely; accept the trust trade; rely on visibility surfaces + `[[unskip]]` for recovery). That degrades the PM C1 protection but ships unambiguous semantics.
