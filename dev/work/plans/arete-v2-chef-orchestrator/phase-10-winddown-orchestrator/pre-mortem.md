# Phase 10 Pre-Mortem

**Authored**: 2026-06-03
**Plan**: phase-10-winddown-orchestrator/plan.md (v2, second pass)
**Stance**: pessimistic — imagining this has shipped and failed four weeks from now

## Verdict: PROCEED WITH MITIGATIONS

Two review passes have done the heavy lifting on architecture, factual errors, and scope discipline. The plan is genuinely tight at the code level. The failure modes that remain are the ones that live *between* the code and John's workflow: the LLM batching prerequisite that the codebase may not actually support, the migration delta-diff that legitimately wants to land during a 113→72 triage week, the dupe-badge UX that goes stale the moment a second meeting extracts. None of these are blockers — they are mitigation-before-build items, mostly small.

The single highest-confidence concern is **F1 (LLM batching as an assumed primitive)** because AC13 fails by construction if the AIService can't batch and the build doesn't budget for adding it. The second is **F2 (the per-meeting UI dupe-badge mental model is racy)** because the entire user-facing surface of Phase 10 hinges on badge correctness across two extracts that touch the same canonical 30 minutes apart. The rest are slower-burn.

What this pre-mortem ISN'T flagging: the golden set (30 pairs is right), the migration grouping logic (sound), R4 dual-shape reads (AC0a covers it), `[[unmerge]]` recovery semantics (Q7 right). Those are the work the reviews already locked down.

---

## Top failure modes (F-class — must mitigate before build)

### F1: AIService doesn't support batched LLM calls today; AC13 fails by construction in 10b-min

**Scenario**: Build week 2 of 10b-min. Engineer implements hybrid pipeline. Wires up the candidate pre-filter (deterministic, ~1 day). Reaches "LLM cross-check, batched per extract" and discovers `AIService.complete()` is single-prompt-in / single-response-out today — no native batching surface, no `batched=true` flag, no array-result parsing helper. Engineer has two choices: (a) build batching as a sub-task inside 10b-min (3-5 extra days, including parsing/error/partial-failure semantics), or (b) ship serial calls and explain in the build report. They pick (b) because 10b-min is already 5-7 days planned. Serial 10-items × 5-candidates × 600ms = **30s per extract**. AC13 ≤5s gate misses by 6x. Soak ships anyway because feature flag default-on; week 1 John runs three extracts, notices each takes 30s longer, gets grumpy. Build report says "batching deferred to followup" — but the followup is now blocking real soak. We either ship a degraded user experience for two weeks or revert the feature flag and lose the soak window.

The plan's spec says **"REQUIRED batched (PM v2)"** at line 342 and notes "If AIService batching not yet supported in the codebase, build it in 10b-min as a sub-task." The escape valve is there — but it doesn't *budget* the time. 10b-min is 5-7 days. Batching as a sub-task is plausibly 3-5 days when you include error handling for partial-success batches (3 of 5 pairs parse, 2 fail — what do we do?), prompt-output schema design (JSON array? Newline-delimited?), and tests. That pushes 10b-min to 8-12 days, which the plan does not account for.

**Leading indicators (during 10a-pre, before 10b-min ships)**:
- Day 1 of 10b-min: engineer greps `AIService` / `LLMClient` / `complete` in core codebase. If the result count is small AND no existing usage shows array-out shape, batching does not exist today.
- AC0b baseline latency captures `arete meeting extract <slug>` time. If baseline is already 3-5s on typical meetings, the headroom for ≤5s extra is gone — serial dedup calls would put us at 30-35s.

**Probability**: High. The plan introduces batching as a requirement based on cost-savings reasoning, not on a codebase audit. Eng v2 review walked through the math (5-8s batched, 30-40s serial) but didn't verify the batching primitive exists.

**Impact**: High. AC13 failure means the feature ships degraded OR reverts immediately. Either way the 14-day soak doesn't start clean.

**Mitigation**:
1. **Pre-build codebase check (half-day, before 10a-pre kickoff)**: grep `AIService` / `callLLM` usage in core; identify whether any existing call site batches multiple prompts → single response. If no, file a 10a-pre dependency: "build `AIService.completeBatch(prompts: string[]) → BatchedResult[]` with partial-failure handling. Estimated 3 days." This becomes a 4th 10a-pre task.
2. **Plan edit**: change 10b-min duration from 5-7 days to 7-10 days and explicitly call out that batching is a deliverable, not an assumption. Move "build batching" to 10a-pre so 10b-min can assume it.
3. **AC13 fallback**: if batching slips, ship feature-flag-OFF by default, run a one-week shadow soak where dedup runs but does not block extract (writes to log only). Compare extract latencies. Promote to default-on only when AC13 measurably holds.

**Plan reference**: line 342, AC13 line 593-597, §Hard part 4 line 152.

---

### F2: Per-meeting dupe-badge UX goes stale the moment a second extract runs against the same canonical — user sees inconsistent badges across meetings

**Scenario**: Tuesday 11am, John runs `arete meeting extract john-lindsay-tuesday-1on1`. The extract pulls "Talk to Dave about staffing" — first time it appears today, so it's the canonical. No badge in meeting A's staged section. John reads through meeting A in the UI, approves the item. commitments.json now has canonical `c8e3d2` with `source_meetings: [john-lindsay-tuesday-1on1]`.

Tuesday 4pm, John runs `arete meeting extract glance-2-sync`. The extract pulls "Going to chat with Dave on the staffing plan" — hybrid hits, fast-tier LLM says SAME, attached as dupe to canonical `c8e3d2`. Meeting B's staged section now correctly shows: `[ai_0043] Going to chat with Dave on the staffing plan ↪ canonical in john-lindsay-tuesday-1on1`.

But meeting A's staged section was written at 11am. It still shows the item as a normal staged item — NO badge, no "↪ also voiced in glance-2-sync" indicator. From John's perspective in the per-meeting UI:
- Open meeting B → "this is a dupe, see meeting A"
- Open meeting A → looks like a singleton

When John goes to the winddown's "Deduped today" section, he sees the merge. But if John doesn't run winddown, or skims it, the per-meeting badge UX has lied: meeting A IS part of a dupe pair and the UI doesn't say so.

The reverse case is worse: if John approves meeting B FIRST (4pm-extract becomes canonical because A wasn't extracted yet), then runs `arete meeting extract john-lindsay-tuesday-1on1` at 5pm catch-up, the parser correctly attaches A's item as dupe → meeting A's badge points at meeting B. Fine. But if John ALREADY ran meeting A's extract earlier (no dedup yet because B wasn't extracted), meeting A's item is canonical and meeting B's item is dupe. Order-of-extract determines canonicity. **This is non-deterministic from John's mental model — he doesn't track extract order, he tracks meeting times.**

The plan does not specify whether meeting A's staged section gets rewritten when meeting B's later extract makes it part of a dupe pair. AC6 specifies the dupe item's badge but is silent on retroactive marking of the canonical's stage.

**Leading indicators (would emerge in 10b-min testing)**:
- Build a 2-meeting fixture: extract A, extract B, inspect both meeting files. If meeting A's staged section is byte-identical before and after B's extract, this failure mode is live.
- During soak, John runs winddown and sees "Deduped today: 3 merges." Then opens meeting A from earlier that day — staged section shows no badges. Asks "why does the winddown say there are merges but the meeting doesn't?"

**Probability**: Medium-high. The plan describes dupe badges as a feature of meeting B (the later extract) but doesn't say what happens to meeting A. Implementations typically take the path of least resistance: write the badge on the new extract, leave the old one alone. That's the buggy default.

**Impact**: Medium. Doesn't lose data. Does erode trust in the dedup surface — "the UI says different things in different places" — which is exactly the bloat-distrust loop the phase is trying to solve.

**Mitigation**:
1. **Add AC6a**: when extract B determines item is a dupe of canonical in meeting A, meeting A's staged section file gets rewritten to add a `↩ also voiced in <meeting-B-slug>` reverse-badge. This is a write-to-other-meeting-file action — risky if user has the meeting A file open in their editor. Use mtime-based optimistic check + best-effort write (fall back to log entry if A has been edited since).
2. **Alternative if AC6a is too invasive**: surface the inconsistency in the winddown by listing meeting-A as well — "this merge spans john-lindsay-tuesday-1on1 (canonical, no badge) and glance-2-sync (dupe, badged)." User understands which way to read it. Easier to build but pushes responsibility onto the user.
3. **Document in SKILL.md**: dupe badges represent "this item references a canonical found elsewhere." The canonical itself is NOT badged — that's by design (it's the source of truth). John needs this mental model upfront or he'll read inconsistency as a bug.

**Plan reference**: AC6 line 564-567, §"Per-meeting UI dupe badges" line 366-374.

---

### F3: `[[unmerge]]` discoverability is zero — user sees a wrong merge, doesn't know the recovery directive exists, silently distrusts the feature

**Scenario**: Day 6 of soak. John reviews winddown's "Deduped today" section. Sees: `MERGE ai_0089 → canon_a4b1c2 ("send Lindsay the deck" attached to "send Anthony the deck")`. The fast-tier LLM made an error — these are distinct (different recipients) and the slug-overlap pre-filter SHOULD have caught it but didn't (Jaccard ≥ 0.6 fired on "send X the deck" because of the high token overlap, slug filter passed because both mention `lindsay` AND `anthony` due to a transcript where both names were in the body).

John reads the merge, feels confusion, doesn't remember the `[[unmerge]]` directive (it was specified in the plan but not surfaced in the winddown output). Looks at the dedup-decisions.log — sees a one-liner with jaccard score 0.71 and "fast-tier SAME" — doesn't know what to do with that. Either:
- Manually edits commitments.json to split (high-friction, error-prone)
- Runs `arete commitments resolve <id>` on one of them (wrong, marks done not undeduped)
- Shrugs and accepts the merge

Over 14 days, this happens 3-4 times. John's subjective AC13 "feels right ≥85%" trends down. He attributes the failure to "the LLM is too aggressive" rather than "I never recovered the false positives, so they accumulated." Phase 10 gets a soft "didn't really help" verdict despite the recovery path existing in code.

The plan specifies `[[unmerge]]` exists (AC8) and tests it works mechanically (AC8 line 571-577). It does NOT specify HOW John learns the directive exists when he needs it. The winddown's "Deduped today" section doesn't print `[[unmerge]]` as a hint inline. The `--explain` verb is available but you have to know the commitment ID.

**Leading indicators**:
- Open the winddown markdown output spec. Does the "Deduped today" section emit a footer like "to undo a merge, append `[[unmerge: <id>]]` to this view and re-run winddown"? The plan §end-to-end flow lines 215-225 doesn't show one.
- During build, ask the build agent to produce a sample winddown output with 2 merges. Look at whether `[[unmerge]]` is mentioned. If absent → F3 is live.

**Probability**: High. The pattern "feature exists, user doesn't discover it" is the modal failure of CLI features without inline help. Phase 8 prereq-check had this exact failure mode (per Phase 9 pre-mortem F4 reference).

**Impact**: High. The entire safety story for fast-tier LLM ("over-merges recoverable via unmerge") depends on the recovery path being USED. If discoverability fails, the safety net doesn't exist for the user even though it exists in code.

**Mitigation**:
1. **Inline directive hints in winddown output**: every "Deduped today" merge entry includes the line `→ disagree? Add [[unmerge: <new-id>]] to this view before re-running winddown.` Adds 1 line per merge; high-signal at low cost.
2. **Inline ID in `--explain` hint**: every merge entry also prints `→ details: arete dedup --explain <canonical-id>`. Same line, two affordances.
3. **First-week onboarding banner**: 10b-aux build step adds a one-time banner at top of "Deduped today" section: "NEW: dedup decisions are surfaced here. To undo any merge, see `[[unmerge]]` directive (week-1 audit feature)." Banner self-removes after 7 days OR after first `[[unmerge]]` use.

**Plan reference**: AC8 line 571-577, §Soak observability line 661-687.

---

### F4: Migration delta-diff during a 113→72 triage week renders an unreadable 40-row delta; user re-confirms blindly or aborts the apply

**Scenario**: The triage data file is dated 2026-06-03 and was the empirical anchor for Phase 10's scope. John ran a 113→72 manual triage that same day. The plan's dry-run window is 3-5 days. So the realistic sequence is:

- Day 0: AC0b baseline captured. `arete commitments migrate --to-v2 --dry-run` runs. Generates `migration-diff.md`. Shows expected groupings — ~600 commitments → ~440 groups (assumes 25% parser-bug mirror collapse). John reviews diff. Looks good.
- Day 1: John runs his manual triage. Drops 28 parser-bug mirrors via `arete commitments resolve` or direct file edits. Resolves 6 already-done items. Consolidates 4 groups (7 eliminated). commitments.json is now at 72 open + resolved-trail.
- Day 2-3: John does normal work. 5-10 new extracts happen. New commitments accrue.
- Day 4: John runs `arete commitments migrate --to-v2 --apply`. AC1g kicks in: delta-diff regenerated at apply time. Compares current state to dry-run snapshot.

**The delta is enormous.** Dry-run snapshot had 113 open + N resolved. Apply state has 72 open + many-resolved-during-triage + 5-10 new. The delta-diff shows:
- 41+ rows "resolved during dry-run window" (manual triage impact)
- 5-10 rows "new since dry-run"
- All the original parser-bug-mirror collapses now no longer apply because mirrors were already manually dropped

AC1g says "if delta differs by > 5 affected groups OR > 10 new rows: surface delta-diff alongside the original; require user to re-confirm before writing." With 50+ affected rows, AC1g triggers. John gets a delta-diff. The delta is dense — every manually-resolved item shows as a "would-have-been-grouped-with-X, now-resolved-skipped" row. John can't tell which delta entries indicate actual migration risk vs. which are just noise from his own triage.

Two failure paths:
- **Path A**: John re-confirms blindly because the delta looks like noise. Apply runs. Migration succeeds but quietly does the wrong thing for 2 rows (because some dry-run-resolved items had subtle group-membership changes the original dry-run diff would have flagged). Discovered post-soak.
- **Path B**: John aborts the apply. Re-runs `--dry-run` against current state. Gets a CLEAN diff (no delta because it's the new snapshot). Approves. Apply runs. Risk: the new dry-run diff was approved in 30 seconds, not 3 days. The "3-5 day soak" protection is gone.

**Leading indicators**:
- Dry-run runs on 2026-06-03 (today). Current open-commitment count = 72 (post-triage). Migration applies against ~72-ish state.
- OR: if dry-run runs BEFORE the triage stabilizes, the delta-diff during apply WILL be large and AC1g will trigger.

**Probability**: High for this specific 2026-06-03 timeline. The triage data file IS the negative-test set; running migration in proximity to that triage is exactly when delta-diff goes haywire.

**Impact**: Medium. Doesn't lose data (snapshot exists, restore works). Does undermine the "3-5 day dry-run is the safety net" design — if the user reflexively re-confirms a large delta, the design intent collapses.

**Mitigation**:
1. **Sequence the migration AFTER triage stabilization, not before.** Add a 10a-pre note: "if commitments.json is undergoing active manual triage when dry-run kicks off, wait for triage to stabilize (no resolves/edits for 24h) before starting the dry-run window. This makes delta-diff at apply time meaningful." For 2026-06-03 specifically: triage was 6/3; dry-run starts no earlier than 6/4 evening.
2. **Delta-diff readability**: AC1g currently says "surface delta-diff alongside original." Strengthen: categorize delta rows by reason — `resolved-during-window`, `new-during-window`, `group-membership-changed`, `parser-output-changed`. User reads only `group-membership-changed` + `parser-output-changed` to decide; ignores the noise rows. Plain text would be a single column header in the delta-diff.
3. **Force re-confirm even on small deltas**: AC1g threshold of "5 groups OR 10 rows" is generous. Tighten to "any group-membership or parser-output change" requires re-confirm. Resolved/new rows are tallied but don't trigger re-confirm.

**Plan reference**: AC1g line 543-544, golden-set-from-triage line 11-18 (113→72 context).

---

### F5: Concurrent extract + winddown lock contention — winddown holds the lock for 5 minutes, extract waits 30s then forcibly steals via stale-lock TTL, both writes corrupt

**Scenario**: Day 9 soak. Tuesday evening. John kicks off `/daily-winddown` at 6:30pm — long-running, takes 4-6 minutes because it does the full Phase 8 R4 reconcile pass + Phase 10 dedup-decision surfacing. Mid-winddown (3 min in), Krisp finishes processing a late-arriving meeting transcript. The arete watcher (or John in another terminal) fires `arete pull krisp && arete meeting extract <new-slug>`. The extract reaches the dedup hybrid stage; needs to read commitments.json.

`proper-lockfile` provides the lock. Winddown has held it since 6:30pm. Extract waits. After 30s TTL, `proper-lockfile`'s stale-lock detection kicks in. PID check: winddown's PID is alive → lock is NOT stale → extract continues to wait. Good behavior.

But wait — does winddown actually HOLD the lock for the full 4-6 minutes? The plan says `CommitmentsService.save()` acquires the lock. Winddown does many things; it doesn't necessarily hold the lock the whole time. So actually the lock contention is on the SPECIFIC moments winddown is in a save() — which are brief. Extract's wait should be sub-second in practice. Lock-as-described is fine.

HOWEVER: if R4 reconciler or "Deduped today" surfacing writes to commitments.json (e.g., updates `source_meetings` for any merge surfaced from today's earlier extracts), that's a save(). The extract's save() and winddown's save() both happen in the 6-minute window. `proper-lockfile` correctly serializes them. Fine.

The real failure mode is more subtle: **two concurrent extracts** (not extract + winddown). User opens two terminals, each kicks off `arete meeting extract` on different meetings. Both reach hybrid dedup. Both want to read commitments.json + same-day-staged-items in OTHER meetings. Extract 1 acquires lock, reads, computes deltas, releases. Extract 2 acquires lock, reads, computes deltas — but Extract 2's read sees Extract 1's writes, so the "same-day-staged-items in OTHER meetings" set has changed underneath the dedup pass. If Extract 2's items happen to match Extract 1's newly-written canonical, the dedup pass works correctly (later items dedup against earlier writes). If Extract 2's items match Extract 1's items but Extract 1 wrote them as canonicals before Extract 2 started, that's fine.

The genuine edge case: **the SAME item extracted in two meetings, both extracts running concurrently**. Extract 1 starts reading at T=0. At T=0, commitments.json has no canonical for this item. Extract 1 decides "no match, register new canonical." Extract 2 starts reading at T=1ms. Also sees no canonical (Extract 1 hasn't written yet). Also decides "no match, register new canonical." Both write canonicals. Now there are TWO canonicals for the same logical item, in commitments.json, both with `source_meetings: [their own meeting]`. The lock serializes the WRITES but doesn't serialize the READ-decide-WRITE atomically.

`proper-lockfile` is a write lock per the eng v2 recommendation. The READ-MODIFY-WRITE pattern requires holding the lock across all three. Plan line 463 says "CommitmentsService.save() acquires exclusive file lock" — that's the save(), not the read. If the lock is acquired in save() only, read-decide-write isn't atomic.

**Leading indicators**:
- 10a-pre code review: does `CommitmentsService` expose a `withLock(fn)` pattern that wraps read+modify+save, or only `save(commitments)` taking the lock at write time? If only save(), this failure mode is live.
- Concurrency test (plan line 467) — eng v2 review noted it "will catch this IF the test actually drives two concurrent runs." Verify the test drives two extracts of the SAME item in different meetings, not just two arbitrary concurrent writes.

**Probability**: Low-medium. John typically doesn't run two extracts in parallel terminals, but the watcher case + manual catch-up creates the window.

**Impact**: Medium. Produces a duplicate canonical that won't dedup further (different hashes if extract texts happen to differ slightly, identical hashes if they don't — in the identical-hash case the duplicate fails at write-collision OR last-writer-wins).

**Mitigation**:
1. **Expose `CommitmentsService.withLock(fn)`** — wraps read+modify+save inside the lock. Refactor extract's dedup pipeline to call this. Adds ~20 LOC.
2. **AC11 concurrency test refinement**: test must drive two concurrent extracts of the SAME-text item in different meetings. Assert post-condition: exactly ONE canonical, one dupe attached.
3. **If withLock is too invasive in 10a-pre**: ship lock-on-save only, accept this edge case for soak, document as known limitation. Probability is low enough this is acceptable trade-off.

**Plan reference**: R12 line 626, AC11 concurrency test line 467.

---

## Medium-risk modes (M-class — consider mitigating, low-cost)

### M1: Cost projection at fast tier underestimates real-workspace candidate density by 2-4x

**Scenario**: Plan estimates $0.05-$0.15 per winddown based on "10 staged items × ≤5 candidates × $0.001/call." But the workspace has 113-145 open commitments at any given time (per triage data). The same-day window means each new extract cross-references against same-day staged items in OTHER meetings + commitments.json filtered to same-day. The "≤5 candidates" cap assumes the hybrid pre-filter (Jaccard ≥0.6 + slug overlap + direction match) narrows to ~5. With 113-145 open commitments, the pre-filter's Jaccard step is the bottleneck: how many of 145 share ≥0.6 token overlap with a typical new extract?

Empirical guess: 10-20 candidates per item on a busy day (lots of staffing-related items, lots of Lindsay-mentions, lots of POP project items). Pre-filter cap of 5 trims, but the cap is arbitrary — if 15 candidates pass pre-filter, we drop 10 and risk recall loss. If we honor the cap, the LLM call is still 5 pairs × 10 items = 50 LLM pair-evals = $0.05 at fast (matches projection). If we DON'T cap and run all 15 candidates per item, it's 150 evals × $0.001 = $0.15 (still under ceiling).

So actually the cost projection is roughly right at fast tier even with denser candidate sets. The risk is **recall**, not cost: if real-workspace has 10-20 candidates passing pre-filter but we cap at 5, the LLM may not see the actually-matching pair. Golden-set precision passes (because golden set was curated to have clear matches in the top 5), but production has the matching pair as candidate #8.

**Probability**: Medium. The triage data file itself notes 28 parser-bug mirrors — many of them text-similar within the same parser-bug cohort.

**Impact**: Low-medium. Reduces recall, doesn't increase cost. Surfaces as "Phase 10 didn't catch this dupe" — moderate trust hit.

**Mitigation**: log pre-filter candidate counts to dedup-decisions.log. Soak metric: if ≥10% of decisions had pre-filter candidate count > 5, the cap is too tight; raise to 10 or remove cap.

**Plan reference**: §"Hard part 4" line 152, §"Cost estimate v2" line 360.

---

### M2: R4 reconciler dual-shape read has a subtle off-by-one in set-overlap on v2-shape data; tests pass on v1, silent fail on v2

**Scenario**: AC0a requires R4 reads both shapes during dry-run window. Implementation: `function getCounterpartySlugs(c: Commitment): string[] { return c.stakeholders ? c.stakeholders.map(s => s.slug) : [c.personSlug]; }`. R4 then computes `setOverlap(commitmentSlugs, meetingAttendeeSlugs)`. Looks right.

But stakeholders[] includes role='self' for self-reminders. Self-reminders should NOT match a recurring meeting attendee even if the owner is on the attendee list. If `getCounterpartySlugs` includes the `self` role slug (john-koht), R4 set-overlap includes john-koht ∩ attendees → matches → R4 fires Rule 4 close-proposal on a self-reminder commitment. Wrong.

v1 shape didn't have this problem because v1's `personSlug` for self-reminders was the owner, but Rule 4 was guarded ("counterparty must be non-owner" or similar). The plan doesn't say whether R4 filters out role='self' stakeholders before computing overlap.

**Probability**: Medium. Easy to miss when writing the R4 rewrite. Tests for AC12 (line 591-592) check positive cases (overlap matches) but not the self-stakeholder negative case.

**Impact**: Medium. R4 misfires on self-reminders in recurring meetings. False close-proposals in "Closed today (proposed)." User approves blindly → real self-reminder gets closed silently.

**Mitigation**: AC12 add a test case: `stakeholders: [{slug: 'john-koht', role: 'self'}]` against any recurring meeting attendee list → set-overlap should return 0 (self role excluded from overlap calc). Implementation: filter role !== 'self' before overlap.

**Plan reference**: AC0a line 530, AC12 line 591-592, R4 rewrite §"Phase 8 reconciler interaction" line 436-452.

---

### M3: 5th counterparty parser pattern — multi-name natural language ("send X to Lindsay and Anthony") not in spec

**Scenario**: Plan covers 4 cases in `extractCounterpartiesFromText`: self-pattern, arrow, natural-language single-name, owner-only. Production has multi-name natural language: "Send X to Lindsay and Anthony", "Talk to Dave and Philip about staffing", "Coordinate with Lindsay, Anthony, and Greg." Parser spec is silent. Implementation either:
- Picks first match → loses other recipients
- Errors out → migration row marked ambiguous (acceptable but high false-ambiguous-rate)
- Returns all matches → could over-stakeholder if "and" separator parses wrong

Triage data has at least one such case: "Coral Trucking exec summary" likely involves multiple parties. The 28 DROP rows are all single-counterparty patterns, so the golden set won't expose this gap.

**Probability**: Medium. Real workspace text has these constructions; golden set doesn't have them.

**Impact**: Low-medium. Migration produces incomplete stakeholder lists. Surfaces as "I thought I sent that to both Lindsay AND Anthony but it shows only Lindsay" during soak review.

**Mitigation**:
1. Add to parser spec Step 2.5: "for 'X and Y' or 'X, Y, and Z' constructions following 'to'/'with'/'for', resolve each name independently; union stakeholders with role=recipient."
2. Add parser unit test: `"Send the deck to Lindsay and Anthony"` → stakeholders includes both.
3. If implementation gets too hairy, mark these rows ambiguous in migration-diff and let user disambiguate.

**Plan reference**: §"Hard part 3" line 131-146, §"Migration plan" line 289-294.

---

### M4: Phase 9 soak entropy collides with Phase 10 — 14-day Phase 9 soak still running when Phase 10 ships, signal attribution breaks

**Scenario**: Phase 9 is in soak (14d). Phase 10 builds for 3-4 weeks. If Phase 9 soak hasn't completed when 10a-pre lands (or worse, when 10a apply runs), signals overlap. Phase 9's AC8a stance refresh contaminated person files (per Phase 9 pre-mortem F1). Phase 10's R4 rewrite reads stakeholders[] which depends on person directory resolution. If Phase 9's hallucinated stances bleed into person directory state (do they? — depends on whether stances affect aliases/display name resolution), the C2 parser's natural-language resolution misroutes.

This is unlikely but not zero. More realistically: Phase 10's R4 wall-time delta competes with Phase 8's AC11 wall-time hard-stop. If Phase 8 soak is still running, R4 changes the inputs underneath that soak.

Plan acknowledges this (R9 line 624) but says "Phase 9 doesn't write commitments; it reads." That's true for commitments. Phase 9 DOES write person files (AC8a). Person files are inputs to Phase 10's parser.

**Probability**: Low. Phase 9 person-file writes happen at AC8a time (one-shot), not continuously. By the time Phase 10's parser runs, person files are stable.

**Impact**: Low. Worst case is parser resolves to a hallucinated alias if Phase 9 wrote one. Manifests as migration-diff ambiguity.

**Mitigation**: phase 10's 10a-pre includes a person-directory sanity check: verify all internal/*.md frontmatter parses, no broken aliases. Should be a no-op if Phase 9 worked correctly.

**Plan reference**: R9 line 624, Phase 9 AC8a interaction.

---

### M5: `arete dedup` hygiene verb ships but is never run; historical bloat continues

**Scenario**: 10e ships the verb. AC10/AC10a defines correct behavior. Reactive dedup (10b-min) prevents NEW bloat. But the verb is manual-only and historical decisions.md/learnings.md (which already have years of dupes) sit unprocessed. John never runs it because:
- He's busy
- Reactive prevents new bloat so the problem feels "solved"
- Running it on historical files would be a 3-5 day dry-run + review cycle (per AC10a) that he doesn't have appetite for

Six months later, decisions.md is 50% smaller per Phase 10 forward-impact, but the historical 50% is still 50% dupes — the file is still bloated, just at a slower growth rate.

**Probability**: High. User memory file shows John's pattern of building tools and not always running them (the memory_l3 feedback case).

**Impact**: Low. Forward-fix works. Historical never gets cleaned. Acceptable if we're honest about it.

**Mitigation**: 
1. Honest documentation: "10e is for when historical bloat becomes a problem. Forward-fix is the primary value of Phase 10."
2. Optional: add a scheduled-run signal — winddown reports decisions.md growth metrics; when historical bloat is causing the metric to look weird, surface "consider running `arete dedup --scope decisions`."
3. Don't try to force the verb to run. Accept that history is history.

**Plan reference**: 10e build phase line 508-516, §"Memory file dedup" line 384.

---

### M6: User runs `arete commitments restore` AFTER a post-migration extract; mixed-shape state

**Scenario**: Day 4 post-migration. John runs an extract — it writes a v2-shape commitment to commitments.json. Day 5: John discovers a migration problem (some commitment merged that shouldn't have). Runs `arete commitments restore --from .arete/commitments.pre-phase-10.json`. Restore overwrites commitments.json with v1 shape. But the v2-shape commitment written on Day 4 is now LOST — it wasn't in the v1 snapshot.

Or worse: restore preserves the new v2 entry (somehow merges it in), and now commitments.json has v1-shape entries + the one v2-shape entry → reader code chokes on mixed shape.

Eng N4 acknowledged partial-failure recovery (AC1f). But post-apply rollback is the unspecified case.

**Probability**: Medium. Restore-after-discovery is exactly what would happen if migration misfires.

**Impact**: Medium-high. Could lose post-migration commitments OR produce mixed-shape file that breaks reads.

**Mitigation**:
1. **AC1d strengthening**: `arete commitments restore --from <path>` requires a confirmation prompt: "Restoring will REPLACE current commitments.json. Any commitments added since the snapshot will be lost. Continue? [y/N]" Snapshot date should be displayed.
2. **Restore captures current state too**: before restore, snapshot current commitments.json to `.arete/commitments.pre-restore-<timestamp>.json`. Two-level rollback.
3. **Document the right workflow**: "If you need to undo a migration AND keep post-migration writes, use `arete dedup --explain <id>` + `[[unmerge]]` to surgically fix specific entries; use restore only if migration is fundamentally broken and you accept losing post-migration writes."

**Plan reference**: AC1d line 547-548, R1 mitigation line 622.

---

## Low-risk modes / accepted residuals

- **`textVariants` cap=5 eviction policy oldest-first**: covered in Q3, dropping oldest is right (newest wording usually most accurate). Not a pre-mortem risk.
- **Cron-scheduled hygiene deferred**: explicitly deferred per Q6; M5 above already handles the soft case.
- **`createdAt` backfill sentinel using `date` value**: PM v2 review #2 flagged this; low-risk in practice, documented.
- **AC5 decisions.md 50% growth-rate metric**: PM v2 already softened this to "soft indicator, not pass/fail." Caveat in plan line 673. Not a pre-mortem risk.
- **R5 threshold mis-tune blocks soak**: plan's conservative initial settings + tuning loop is the right approach. Not a pre-mortem risk.
- **Phase 11 deferrals (10c/10d)**: scope discipline locked. Not a pre-mortem risk.

---

## Probed and ruled out

- **#1 Per-meeting UI mental model under unified flow**: NOT a current risk because v2 deferred unified approval to Phase 11. Per-meeting + badges is what ships. F2 above is the real per-meeting risk.
- **#7 Phase 9 soak compound**: M4 covers the realistic version; person-file write isolation makes it Low.
- **#8 Cost density at fast tier**: M1 covers it; cost stays in budget even at higher candidate density. Risk is recall, not cost.
- **#11 Decisions/learnings dedup at apply causing topic-page churn**: ruled out — topic pages read decisions.md content via `retrieveRelevant` re-reading from disk (per Phase 9 pre-mortem M5 finding). Dedup changes what's IN the file but topic re-rendering picks up fresh content on next index. No churn cascade.
- **#13 Background `arete dedup` never used**: M5 above; honest non-issue.
- **#10 LLM batching primitive**: NOT ruled out — promoted to F1.

---

## Recommended plan v3 additions

Concrete diffs to apply before 10a-pre starts:

1. **Pre-build codebase check for AIService batching primitive** (F1). Half-day investigation; if absent, add batching as a 10a-pre deliverable and extend 10b-min from 5-7 to 7-10 days.

2. **AC6a: dupe-reverse-badge on canonical's meeting** (F2). When later extract attaches dupe, rewrite earlier meeting's staged section with `↩ also voiced in <new-meeting>` reverse-badge. Mtime check + best-effort write.

3. **Inline `[[unmerge]]` hint in "Deduped today" output** (F3). Per-merge: `→ disagree? [[unmerge: <id>]] in this view, re-run winddown.` Per-merge: `→ details: arete dedup --explain <id>`. First-week banner at section top.

4. **Sequence migration AFTER triage stabilization** (F4). 10a-pre dry-run starts no earlier than 24h after the last manual triage write. For 2026-06-03 specifically: dry-run kicks off 6/4 evening or later. Categorize delta-diff rows by `resolved-during-window` / `new-during-window` / `group-membership-changed` / `parser-output-changed`. Only the latter two trigger re-confirm.

5. **`CommitmentsService.withLock(fn)` wrapping read-modify-write** (F5). Refactor extract's dedup pipeline to use it. AC11 concurrency test asserts single canonical post-condition under same-text concurrent extracts.

6. **Parser multi-name natural-language support** (M3). Step 2.5 for `X and Y` / `X, Y, and Z` constructions. One unit test.

7. **R4 self-stakeholder exclusion** (M2). Filter role !== 'self' before set-overlap. Add to AC12 tests.

8. **Restore command confirmation + two-level snapshot** (M6). Prompt before restore. Snapshot current commitments.json to `.arete/commitments.pre-restore-<ts>.json` before overwriting.

9. **Pre-filter candidate-count logging** (M1). Every dedup decision logs `pre-filter-candidates: N`. Soak metric: if median N > 5, raise cap.

10. **Honest doc on `arete dedup` historical scope** (M5). Forward-fix is primary; historical cleanup is optional, requires intentional soak cycle.

---

## Soak observability — what to watch (Phase 10-specific)

**Daily during the 14-day Phase 10 soak:**

1. **Dedup-decisions log volume + UNMERGE count** — `wc -l dev/diary/dedup-decisions.log` + `grep UNMERGE dev/diary/dedup-decisions.log | wc -l`. Trigger: > 5 UNMERGE/week = semantic dedup misfiring (R3) OR F3 materializing (user not finding the directive — distinguish via whether unmerges are happening at all).

2. **Per-meeting extract latency** — log extract wall-time on each `arete meeting extract` invocation. Compare against AC0b baseline. Trigger: > 5s extra median = AC13 fail; profile batching status (F1).

3. **Pre-filter candidate count distribution** — daily aggregate of candidate counts from log. Trigger: median > 5 = cap too tight (M1).

4. **Reverse-badge consistency** — spot-check 1 meeting per day. Open meeting A's staged section, then meeting B's; verify badges match (F2).

5. **Phase 8 R4 wall-time delta** — Phase 8 AC11 hard-stop. Compare pre-Phase-10 baseline to post-merge. Trigger: > 60s drift = R4 set-overlap impl needs tuning (M2).

6. **Decisions.md growth rate** — per plan line 673, soft indicator. Trigger: ≥2 visible dupes in any 7-day window = forward-fix failing.

**Rollback triggers (during soak, priority order):**

- **F1 (latency)**: feature-flag-off the cross-meeting dedup pass on extract. Background `arete dedup` catches up later.
- **F2 (badge inconsistency)**: defer to winddown surfacing only; remove per-meeting badges. Lower-value but consistent.
- **F3 (no unmergss + visible bad merges)**: add inline directive hints (mitigation #3 above) as hotfix.
- **F4 (migration delta unreadable)**: abort apply, re-run dry-run against current state. Lose 3-5 day safety window but accept it.
- **F5 (duplicate canonicals)**: surgical fix via `arete dedup --scope commitments --apply` to consolidate dupes; tighten locking; ship as hotfix.

**Soak-success criteria (declare Phase 10 done at +14d):**

- AC13 manual: dedup feels right ≥85%, no silently-dropped commitments, ≤1 false-positive merge/week recoverable via `[[unmerge]]`.
- ≥2 `[[unmerge]]` actions used during soak (validates F3 mitigation worked — user found the directive).
- Median extract latency < AC0b baseline + 5s (validates F1).
- Zero duplicate-canonical reports (validates F5).
- Reverse-badge spot-checks pass on 5/5 sampled meetings (validates F2).
- Decisions.md visible-dupe count ≤1 per 7-day window (validates AC5).

---

## What this pre-mortem is betting

The plan is tight. Two review passes did real work. F1 (batching) is the highest-confidence risk because it's the one place where "the code says it works" depends on a primitive that may not exist. F2 (badge consistency) is the highest workflow risk because it determines whether the user trusts the surface. F3 (unmerge discoverability) is the highest soft-risk because it determines whether the safety net is actually used. F4 (migration delta during triage week) is the timing-specific risk for the 2026-06-03 window.

Mitigate those four with the recommended plan v3 edits (~1 day of plan revision + ~3 days of additional 10a-pre work for batching) and ship. The bets in the plan (data model (a) is right, hybrid + fast tier beats either alone, per-meeting UI continues to work, same-day window is enough) are sound and the soak validates them.

If F1 cannot be mitigated (batching is too expensive to add in 10a-pre), demote the phase to "10b-min ships feature-flag-OFF, runs as shadow log only, promote after batching lands separately." That's a clean degraded shipping path that preserves the migration value of 10a.
