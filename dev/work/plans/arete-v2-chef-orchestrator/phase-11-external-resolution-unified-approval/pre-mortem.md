# Phase 11 v2 Pre-Mortem

**Authored**: 2026-06-06
**Plan**: phase-11-external-resolution-unified-approval/plan.md (v2 — post PM + eng-lead REVISE BEFORE BUILD)
**Stance**: pessimistic — imagining v2 has shipped 6 weeks from now and failed

## Verdict: PROCEED WITH MITIGATIONS

v2 is the most-reviewed plan in this stack. Two REVISE-BEFORE-BUILD passes folded in cleanly: Goal 2 split to followup-2, Goal 4 deferred, C1-C5 fixed, G1-G6 addressed. The substrate inventory is honest about Phase 10 dependencies. The first-week `[[confirm]]` gate is the right trust posture.

What kills this in 6 weeks is **not** the code — the code is well-spec'd. What kills it is the **soak compounding** problem: Phase 10 (14d soak) + followup-2 (7d soak) + Phase 11 (14d soak) chain together with overlapping windows, and when something regresses we won't know which phase to blame. F1 captures this. F2 captures the `[[confirm]]` UX failure mode the PM review pushed for — the gate is right but the workflow around it is fragile. F3 is the conditional-gate-for-11c rationalization risk; the gate itself is correct but its activation timing is wrong. F4 is a Gmail-provider second-order: the `EmailThread` shape change breaks an inbound caller during 11-pre and we discover it during 11a build.

The M-class concerns are mostly things v2 explicitly accepted as residuals (recipient mapping gaps, parser ambiguity bug-class) plus one new one (golden-set labeling timing).

What this pre-mortem ISN'T flagging: HIGH-only auto-resolve threshold (right), MEDIUM-never-writes (right), precision floor ≥0.95 (right), the substrate inventory (thorough), `unresolveSuppressedUntil` as structured field (correct fix for PM G5), cache depth = `max(14, today-min(open_commit.date))` (correct). Those are the work the reviews locked down.

---

## Top failure modes (F-class — must mitigate before build)

### F1: Soak attribution collapses under three overlapping phases — Phase 10 + followup-2 + Phase 11 in soak simultaneously, regression cause unattributable

**Scenario**: Phase 10 ships day 0. 14-day soak runs. Day 14: Phase 10 declared "soak passed with caveats" — one minor R4 self-stakeholder edge case still under investigation but not blocking. Followup-2 ships day 16. Followup-2 7-day soak starts. Day 21: followup-2 soak still running but trending positive (3 chef-skips, 0 overrides). Phase 11 11-pre kicks off day 17, 11a builds days 19-28. Phase 11 ships day 29. 14-day Phase 11 soak starts.

Day 35: John runs winddown. Notices a wrong auto-resolve — commitment "Send Lindsay the deck" was auto-resolved against a Sent email that was actually a draft to a different deck. He `[[unresolve]]`s it. Investigates. The recipient was wrong in `stakeholders[]` — should have been `lindsay-calar`, was `lindsay-gray`. Pulls up `resolution-decisions.log`: LLM SAME decision, recipient match passed, evidence URL checks out structurally.

Now: **was this caused by Phase 10's parser ambiguity bug-class (N1 Lindsay-Calar/Lindsay-Gray) that "shipped with caveats"?** Or Phase 11's recipient match logic? Or followup-2's frontmatter mutation that wrote stakeholders the chef-skip path didn't validate? Three phases in soak, all touching `stakeholders[]` in some way, and the failure point is at the intersection.

The plan's AC0 says "Phase 10 parser at golden-set precision ≥0.85 with NO open ambiguity bugs (G4 — load-bearing)." Good in theory. In practice, "no open bugs" is a binary the reviewer applies at Phase 11 build start — if Phase 10 ships with "soak passed with caveats" and an N1 bug is downgraded to "edge case, not blocking," Phase 11 inherits the bug. The gate's verb is "no open" but the reality is "tier-1 bugs closed, tier-2 known issues accepted."

Beyond bug attribution: latency attribution also breaks. Phase 10's AC13 said extract latency ≤5s additional. Phase 11's AC12 says winddown latency ≤2s additional **on top of Phase 10's ≤5s**. If actual measured latency at day 35 is 12s on a fresh winddown, was it Phase 10 (5s budgeted), Phase 11 (2s budgeted), or compound effect (Phase 10 batching primitive now serializes against Phase 11 auto-resolve's LLM calls)? The 7s overrun has multiple plausible homes.

**Leading indicators**:
- Phase 10 soak retro contains the phrase "with caveats" or "minor open issues." Day 14 retro doc shape matters here — if it's clean PROCEED, F1 risk drops materially; if it's PROCEED-WITH-CAVEATS, F1 is live.
- Followup-2 ships during Phase 11 11-pre build. The 7-day followup-2 soak overlaps Phase 11 11a build. If 11a needs to read meeting frontmatter to identify still-staged items (G1 ordering rule, AC8), followup-2's frontmatter shape changes underneath 11a's code as 11a is being written.
- Phase 11 build report cites Phase 10's `Stakeholder[]` shape as input to recipient match. If there's any in-flight Phase 10 fix that touches `Stakeholder.role` enum values, 11a's matching logic forks.

**Probability**: High. Three phases, two with overlapping soak windows, all touching the same data model surface (`stakeholders[]` + meeting frontmatter + `commitments.json`). Soak hygiene typically degrades when phases stack like this.

**Impact**: High. When a regression hits during compound soak, the team's instinct is to revert *something* — and picking the wrong something extends the recovery window. Worst case: Phase 11 gets reverted to fix what was actually a Phase 10 parser bug, losing 14 days of Phase 11 soak progress.

**Mitigation**:
1. **Hard gate on Phase 10 retro language**: AC0 needs a non-fuzzy criterion. Strengthen to "Phase 10 retro must be PROCEED (not PROCEED-WITH-CAVEATS, not PROCEED-WITH-OPEN-ISSUES). Any caveat tier-N bug is treated as blocking for Phase 11 11a until closed." This makes the parser-bug load-bearing constraint enforceable instead of judgment-call.
2. **Phase attribution log**: every Phase 11 mutation writes `phase: 'p11-11a'` (or similar) to `resolution-decisions.log`. Phase 10's `dedup-decisions.log` and followup-2's `chef-skip-log.md` already have phase context implicit in their file paths. The shared field at audit-log level lets "what phase touched this commitment last" be a `grep` instead of forensics.
3. **Sequence followup-2 soak to COMPLETE before Phase 11 ships**: plan says "depends on Phase 10 followup-2 (chef-mutates-staged-status) shipped + 7d soak success." Strengthen: "followup-2 soak fully closed (Day 7 retro written + accepted) before Phase 11 build kickoff, not just before Phase 11 ship." If followup-2 has caveats too, Phase 11 build doesn't start. This pushes Phase 11 right by ~7 days in the worst case but eliminates compound-soak attribution.
4. **Latency budget tracking with phase attribution**: per-winddown invocation log should record phase-attributed latency line items: `phase-10-dedup: 3.1s; phase-11-resolve: 1.4s; phase-10-followup-2-frontmatter-read: 0.2s`. This is ~10 LOC and makes AC12 verifiable.

**Plan reference**: AC0 line 399, line 6 (depends-on), §"Soak observability" lines 519-526.

---

### F2: `[[confirm]]` first-week UX fails not from false positives but from user inattention — backlog of staged-pending-confirm entries accumulates, then bulk-confirmed-without-reading

**Scenario**: Day 1 post-ship. Chef runs winddown at 6:30pm. Two HIGH matches → both staged for confirm. Chef surfaces "Staged for confirm (2): ai_0042, ai_0089." John reads, recognizes both, mentally agrees, but doesn't add `[[confirm]]` directives because he's tired and the directive UX requires editing a curated-view file. He closes the winddown.

Day 2: chef re-surfaces both (correct — silence != confirm). One more HIGH match. Now "Staged for confirm (3)."

Day 3: AC11 day-3 soft prompt fires: "Auto-resolves look right? `[[confirm-all-week-1]]` if yes, review the list below if no." John reads. Glances at the 3 entries. They look right. Adds `[[confirm-all-week-1]]`. Saves.

Day 4: next winddown processes the directive. Three commitments flip to user-resolved. **Two of them were correct, one was a false positive — `ai_0042` was a draft commitment ("Draft response to Stephanie") that the LLM matched against a Sent email that was actually a different response to a different Stephanie. John didn't catch it because he was scanning the LIST not the EVIDENCE.**

The PM review's whole point of the `[[confirm]]` gate was to eliminate the silent-write trust crater. But the gate degrades into "John approves a list" if the per-entry review friction is high relative to the volume. The day-3 `[[confirm-all-week-1]]` escape hatch is exactly the failure-mode it's named after — passive vote of confidence. AC11 cites it but doesn't gate against it: "Day-3 prompt catches passive-vote-of-confidence." It actually *enables* passive vote.

Worse: in week 1, the user has ZERO calibration on what LLM precision actually looks like. If John approves `[[confirm-all-week-1]]` on day 3, the day-7 promote-to-auto-mutate check ("zero rollbacks in week 1") passes — but it passes because John didn't audit, not because the LLM was correct. Week 2 starts with full auto-mutate and the first auto-resolve to drift produces a silent commitment drop.

The eng-lead Q7 caveat ("zero unresolves in 7d is either 'auto-resolve is perfect' OR 'user didn't notice'") is exactly this. v2 cites the caveat and adds the day-3 prompt as the mitigation. But the day-3 prompt is itself a passive-vote-enabling surface.

**Leading indicators**:
- Build a one-week shadow soak BEFORE flipping `[[confirm-all-week-1]]` on. During the shadow, chef SURFACES staged-for-confirm entries with full evidence inline (URL + LLM reasoning) and tracks (a) how long John spends reviewing each, (b) per-entry confirm vs. ignore rate. If review-time-per-entry is <10s on average, F2 is live — the per-entry friction isn't high enough relative to the scanning impulse.
- During week-1 of real soak, log every `[[confirm-all-week-1]]` invocation. If it fires on day 3 with N≥3 staged entries (i.e., the user is bulk-approving accumulation rather than reviewing each), assume passive vote and don't promote at day 7.

**Probability**: High. This is exactly the "user attention budget" failure pattern. The PM review's first-week confirm gate is right in mechanism; the day-3 escape hatch undermines it. Builders default to escape hatches; users default to using escape hatches.

**Impact**: High. The whole point of week-1 trust-building is to discover false positives BEFORE auto-mutate kicks in. If discovery rate is artificially-zero because user approved-without-reading, the trust hand-off to week-2 happens against a false signal. The first week-2 false positive then writes silently, the user discovers it days later, and the trust crater is exactly the one v2 was built to avoid.

**Mitigation**:
1. **Remove `[[confirm-all-week-1]]` from AC11**: the bulk-confirm directive is a foot-gun for the exact UX it's trying to support. Keep the day-3 soft prompt but make it "review the list below; if any look wrong, `[[unresolve <id>]]`." The default action is REVIEW, not bulk-confirm. Per-entry `[[confirm <id>]]` remains the only confirm path. Forces engagement at per-entry granularity.
2. **Promotion-to-week-2 gate requires AT LEAST ONE `[[confirm <id>]]` during week 1**: the AC2a "zero rollbacks → promote" check is currently necessary but not sufficient. Strengthen: "promote to auto-mutate at day 7 requires (a) zero `[[unresolve]]` actions in week 1 AND (b) at least one `[[confirm <id>]]` action OR explicit user statement 'staged-for-confirm look right, promote.'" Zero engagement during week 1 is treated as "needs another week" — extend confirm-gate by 7 days.
3. **Inline evidence in staged-for-confirm list**: chef-curated "Staged for confirm" section shows each entry with FULL evidence inline (URL + LLM reasoning + recipient + sent-at), not just commitment text. Forces the user's eye to the audit signal at the same surface they'd add the directive. Adds vertical space but the n is small (1-3 per day typical).
4. **Add `[[unconfirm <id>]]` directive**: if user `[[confirm]]`s wrong, what's the recovery? `[[unresolve]]` resets a USER-resolved entry per AC6a but it errors with "Use `arete commitments reopen <id>` instead." Add `[[unconfirm <id>]]` that works on entries resolvedBy='user' AND `resolvedAt` within last 24h — reverts back to staged-for-confirm + clears the user-resolve. Closes the "I confirmed but then realized" hole. Without this, AC6a's "user-resolved entries are not [[unresolve]]-eligible" creates an unrecoverable wrong-confirm.

**Plan reference**: AC2a line 405, AC11 line 449 (day-3 prompt), AC6a line 430, §End-to-end flow lines 217-222.

---

### F3: 11c conditional gate is evaluated at the wrong moment — Phase 10 soak retro is too close to Phase 10 ship to capture the steady-state workflow signal, GO/NO-GO is decided on adrenaline data

**Scenario**: Phase 10 ships day 0. Day 14: 14-day soak retro. John has spent two weeks aggressively reviewing per-meeting UIs because the new dupe-badge UX is novel and he's auditing it. Items/day metric reads high (because he's running more extracts than usual to test the badge flow). Dupe percent reads HIGH (because he's deliberately running same-topic meetings back-to-back to test cross-meeting dedup). Context-switching reads HIGH (because he's testing the per-meeting workflow under deliberate stress).

The 11c gate evaluates on day 14 data. Items/day ≥15 → check. ≥5 meetings → check. ≥30% dupes → check. Context-switching >2 min/day → check. John says "yeah, per-meeting at this volume feels chunky." All four GO criteria met. GO fires. 11c builds.

Three weeks later, after 11c ships, John's actual steady-state usage has reverted: 5-8 items/day across 2-3 meetings, dupes back to ~10% because he's not deliberately stress-testing, context-switching is fine. The unified approval surface he built for is the wrong tool for the actual workflow. Sunk cost is 5-7 days of build + a new code surface to maintain.

The plan acknowledges the gate is "biased toward NO-GO by construction" (Hard part 5). But it sets the gate timing as "after 14d Phase 10 soak" — i.e., during the period of maximum novelty-driven workflow distortion. The bias-toward-NO-GO assumption ("post-soak John will have habit-locked on per-meeting") collides with the timing reality ("post-soak John has been actively testing the new UX for 14 days and his workflow is not yet at steady-state").

**Leading indicators**:
- Phase 10 14-day soak generates daily extract counts. If the variance across the 14 days is high (e.g., 5 extracts on some days, 25 on others), it's not yet steady-state. Compare to Phase 8/9 post-soak daily extract counts — if Phase 10 soak average is ≥2x the historical baseline, the gate criteria are inflated.
- John's context-switching self-report at day 14 retro: does he say "I'm running more extracts than usual to test" or "this is roughly my normal volume"? If the former, the gate inputs are unreliable.

**Probability**: Medium. The plan author is aware of the bias but timed the gate at a moment when the bias might not apply.

**Impact**: Medium. Wrong-direction decision wastes 5-7 days of build effort and adds a surface that needs ongoing maintenance. Recoverable (could deprecate 11c later) but expensive.

**Mitigation**:
1. **Defer 11c GO/NO-GO decision to day 28** (two weeks after Phase 10 soak ends, not at soak end). Gives John two weeks of post-soak steady-state usage before the gate fires. The numeric criteria evaluate against day 14-28 data, not day 0-14. This pushes 11c ship right by ~2 weeks but produces a better GO/NO-GO signal.
2. **Add a "steady-state confirmation" criterion**: gate requires "John's day-21-28 daily extract volume is within 30% of his Phase 9 pre-Phase-10 baseline." This catches the novelty-distortion case explicitly — if volume is still elevated, defer the gate further.
3. **Make NO-GO the default at day 14 regardless of metrics**, with EXPLICIT user-driven re-evaluation at day 28+. AC9 currently says default NO-GO but allows GO if criteria fire during soak retro. Strengthen: at day 14, default NO-GO with no override. If at day 28+ John says "per-meeting still doesn't scale," THEN evaluate gate criteria against the day 21-28 window. Forces the GO decision to be against settled data, not soak-period data.

**Plan reference**: Hard part 5 lines 176-184, AC9 line 445, §"Conditional gate criteria for 11c" lines 545-562.

---

### F4: Gmail provider `EmailThread` shape change in 11-pre breaks inbound `pullGmailHelper` callers during 11a build — discovered when 11a tests run, blocks 11a by 2-3 days

**Scenario**: Day 1 of 11-pre. Engineer extends `EmailThread` shape — adds `to`, `cc`, `body`, `attachments`, `sentAt` as new fields. Plan AC1/R10 says these default to `[]` / empty string when not fetched. `fetchBody: boolean` is opt-in. Engineer ships 11-pre with tests covering the new fields' presence.

Day 4: 11-pre merges. Day 5: engineer starts 11a, wires the new cache layer to the recipient pre-filter. Runs the existing pullGmailHelper test suite as part of CI. Two tests fail: the inbound triage test expects `EmailThread` to be JSON-serialized with a specific key order or specific keys-only set, and the new fields (defaulting to `[]` / `''`) are now present in serialization. Snapshot tests don't match.

Or alternatively: the inbound `pullGmailHelper` caller in `packages/runtime/skills/some-other-skill/SKILL.md` reads `EmailThread` and the prompt template includes `${thread.from}` but the prompt instruction is "if there are any other fields like to/cc, ignore them" — now there *are* other fields, the prompt instruction was speculative, and the LLM gets confused by the empty `to: []` and `cc: []` fields appearing in serialized context.

Or third alternative: an `arete pull gmail` cache file written by 11-pre has the new shape, but during the 11-pre soak window an old version of inbound triage code reads it (CI was green but production binary hadn't redeployed). The old reader chokes on unknown keys depending on its parser strictness.

Plan eng R10 says "EmailThread shape change breaks existing inbound callers" with mitigation "fetchBody is opt-in, new fields default empty." That handles the SEMANTIC compat case. It does NOT handle the SERIALIZATION shape change, the prompt-template surface, or the cache-file backward-incompat case.

**Leading indicators**:
- 11-pre build day 1: grep for all consumers of `EmailThread` in the codebase. If the count is >2 and any of them serialize-then-template, R10 mitigation is incomplete.
- 11-pre tests don't include "round-trip an EmailThread through inbound pullGmailHelper, assert no new fields appear in serialized output unless fetchBody=true." If that test isn't in the spec, this surface is uncovered.
- `arete pull gmail` cache file format: if 11-pre writes `.arete/cache/gmail-sent-YYYY-MM-DD.json` with the new shape but does NOT version the cache file, mixed-version reads silently break.

**Probability**: Medium. Type-shape extensions are typically backward compat at the type level but breaking at the serialization/cache/template layer. Eng C1 mitigation is well-targeted at the semantic break but not the surface-area break.

**Impact**: Medium. Discovered during 11a build, costs ~2 days to fix (add cache-file versioning, gate new fields behind fetchBody at serialization level, update prompt templates). Doesn't lose data but extends the build window past v2's 11-15 day estimate.

**Mitigation**:
1. **Cache file format versioning**: `.arete/cache/gmail-sent-YYYY-MM-DD.json` writes `{ version: 2, threads: [...] }` instead of bare array. Reader checks version; v1 cache files (none exist yet, so trivial) get migrated or rejected with clear error.
2. **Inbound caller audit in 11-pre AC1**: AC1 strengthening — "before merging 11-pre, run `grep -rn EmailThread packages/` and verify every consumer either (a) doesn't serialize the threads OR (b) explicitly handles the new fields. List of audited callers committed to build report."
3. **Serialization gate on new fields**: when `fetchBody=false`, the new fields are NOT included in the serialized JSON at all (not even as `[]`). Reader code that hasn't been updated continues to see the v1 shape. This is opt-in at BOTH the fetch level AND the serialization level. Costs one extra path in the serializer.
4. **Add a 1-day "11-pre soak"**: 11-pre merges, then 1 day of inbound-triage normal usage before 11a build starts. Catches any inbound regression before 11a code exists to be blocked by it.

**Plan reference**: Hard part 2 lines 148-159, R10 line 497, AC1 line 401.

---

## Medium-risk modes (M-class — consider mitigating, low-cost)

### M1: 50-pair golden set labeling falls to John during 11a build week — ~45 min of his time not budgeted, golden set ships incomplete or AC3a gate can't fire

**Scenario**: 11a build day 1. Engineer starts pipeline implementation. Day 3: engineer ready to test against golden set. Where is it? Plan AC3a says "committed BEFORE 11a build with 50 hand-labeled pairs drawn from arete-reserv real data." Who labeled it? When?

The plan implies John labels it. 50 pairs × ~30-60s of judgment per pair = 25-50 minutes. That's not enormous, but it's not budgeted anywhere — neither in the build phase estimates (11-pre 2-3d / 11a 7-9d / 11-audit 2-3d, no row for "John golden-set labeling") nor in any pre-condition AC.

Realistic failure: engineer asks John at day 3 for the golden set. John says "I'll do it tonight." Three days later, golden set has 12 labeled pairs (John got distracted). Engineer can't run AC3a precision gate. Two options: (a) ship 11a without precision gate, accept the risk (violates plan's commitment to ≥0.95 floor before auto-mutate), (b) block 11a build until golden set lands (loses 3-5 days).

The Phase 10 golden set (`golden-set-from-triage-2026-06-03.md`) had 30 pairs and was authored same-day as the triage that generated them. Different dynamic: triage WAS the labeling exercise. Phase 11 has no equivalent natural labeling event — it requires going back through Gmail Sent and hand-matching to commitments, which is a separate cognitive task.

**Leading indicators**:
- 11a build kickoff day: does `golden-set-phase-11.md` exist with ≥50 entries? If not, F-risk is live.
- 11-pre completion + 1 day: schedule a "golden-set lab session" with John explicitly. If it's not on the calendar, the labeling won't happen organically.

**Probability**: Medium-high. Labeling tasks routinely slip when not explicitly scheduled.

**Impact**: Medium. Either ships without precision floor (compromises trust posture) or blocks 11a (extends timeline).

**Mitigation**:
1. **Add as a 11-pre deliverable**: golden-set labeling completes during the 11-pre window, not before 11a. Schedule explicitly as a 1-hour John session at 11-pre day 2. Budget impact: +1 hour of John's time during 11-pre, not net new days.
2. **Seed from existing data more aggressively**: 6 anchor positives from 6/03 triage + auto-generate ~30 synthetic negatives from `commitments.json` + `gmail-sent-*.json` cross-product where stakeholder mismatch is mechanical. That's 36 of 50 with minimal John labeling time. Remaining 14 are the ambiguous/hard cases that need human judgment.
3. **Block 11a build at precision-gate time, not build start**: 11a can build the pipeline without the golden set; the AC3a measurement happens at end of 11a. If golden set isn't ready by then, AC3a doesn't fire and 11a ships as MEDIUM-only-surface (no auto-mutate) per the plan's fallback at line 409.

**Plan reference**: AC3a line 409, Build phase 11a tests line 366.

---

### M2: Phase 10 followup-2's `staged_item_skip_reason` collision with Phase 11's auto-resolve evidence — both can fire on the same item in same winddown

**Scenario**: Winddown 6:30pm. Chef gathers candidates. Item `ai_0089` is staged in today's john-jamie meeting. Item is "Share Notion doc with Jamie." Chef detects:
- Slack DM evidence (followup-2 path): chef writes `staged_item_status[ai_0089] = 'skipped'` + `staged_item_skip_reason[ai_0089] = { evidence: 'slack-dm', ... }`.
- Gmail Sent evidence (Phase 11 11a path): a separate Sent email to Jamie also exists matching the artifact.

Plan G1 (AC8) handles the case where item is in `commitments.json` OR still-staged but not both: "commitments.json FIRST → if already-committed, 11a auto-resolve path; if still-staged, defer to followup-2's chef-mutate path. Never both for the same id in the same winddown."

But what if the staged item has TWO evidence sources from TWO providers? Plan's ordering rule routes to followup-2 (still-staged → chef-mutate). Followup-2 writes the Slack evidence. Phase 11's 11a pipeline runs, checks "still-staged?", confirms, and... defers per AC8. Result: only the Slack evidence is recorded; the Gmail Sent evidence isn't logged anywhere visible.

Then `arete meeting approve` runs. `commitApprovedItems` skips the item (correct). Commitment is never created. Gmail evidence is in the cache but never written to `source_external[]` because no commitment exists. Audit trail is one-source instead of two-source.

This isn't a data loss exactly — the item was correctly skipped — but it's an audit-completeness regression. Six months later, when John asks "did I send Jamie the Notion doc via Gmail or Slack?", `commitments.json` has no entry, followup-2's `chef-skip-log.md` shows Slack only, Phase 11's `resolution-decisions.log` shows nothing (because the pipeline deferred).

**Leading indicators**:
- Phase 11 build day: ask whether 11a logs a `RESOLVE-DEFERRED-TO-FOLLOWUP-2` line when AC8 step 2 fires (still-staged path). If no log line, the deferral is silent.
- followup-2 + Phase 11 interaction test: synthesize a staged item with BOTH Slack and Gmail evidence. Run winddown. Assert at least one log line per evidence source (even if only one path writes structurally).

**Probability**: Low-medium. Requires both evidence types for same item — possible but not common.

**Impact**: Low. Audit completeness regression. Not a trust crater, not a data loss. Surfaces only when user retrospectively asks "what evidence existed for this skip?"

**Mitigation**:
1. **11a logs `RESOLVE-DEFERRED` when AC8 step 2 fires**: even if no structural write, emit log line with the evidence URL and the followup-2 commitment-id reference. Cross-referenceable post-hoc.
2. **followup-2's `staged_item_skip_reason.evidence` accepts multi-source string**: when 11a defers to followup-2, the chef-skip writer appends "+gmail:<thread-id>" to the evidence field. Preserves multi-source provenance at the structural level.

**Plan reference**: AC8 line 440, G1 fix in v1→v2 table line 30.

---

### M3: Cache fetch cost is Gmail API quota, not LLM — when commitment dated 6 months ago triggers `max(14, today-min(open_commit.date))` cache depth of ~180 days

**Scenario**: John has one straggler open commitment from 2025-12-15 (about 6 months ago — accumulated from a backlog that never got triaged). Today is 2026-06-12. Cache depth rule fires: `max(14, 180) = 180 days`. The Gmail Sent pull command fetches 180 days of Sent threads. That's potentially 2000-5000 Sent emails (heavy senders) × `format: 'full'` × MIME walk + attachment metadata.

Gmail API has rate limits per quota unit and per user. `messages.get` with `format: 'full'` costs more quota units than `format: 'metadata'`. At 5 quota units per `format: 'full'` call × 5000 calls = 25,000 quota units. Default per-user quota is ~250 per second. The pull takes ~100 seconds at API rate-limit-saturation. That's fine for a one-time pull but punishing if the cache rebuilds daily.

The plan's cache writer ships once per day per `arete pull gmail --sent --days <N>`. The cache file is dated `.arete/cache/gmail-sent-YYYY-MM-DD.json` — implies daily regeneration. AC1 says "cache regenerates daily." For a normal 14-day depth that's fine. For a 180-day depth that's a 100-second pull every morning.

More acute: memory. 5000 threads × ~10KB per thread (body text + attachment metadata) = ~50MB in memory during cache load. Node default heap is fine but the recipient pre-index has to scan all 5000 → not just a fixed cost, but linear-in-cache-size.

The plan's cost cap (AC4) is for LLM spend, not Gmail API spend. The hybrid pre-filter throttles LLM cost downstream, but pre-filter input scales with cache size.

The user can manually resolve the 6-month-old commitment to make this go away. But the plan doesn't surface the cache-depth value to the user — they don't know they have a 180-day commitment forcing the pull.

**Leading indicators**:
- Phase 11 deployment: check workspace's oldest open commitment. If older than 30 days, cache depth is >30. If older than 90 days, F-risk applies.
- 11a soak day 1: time the pull command. If wall-time > 15s, the cache depth is heavy.

**Probability**: Medium. Workspace has accumulated commitments across multiple triage cycles; backlog stragglers are typical.

**Impact**: Low-medium. Slow daily pull, large memory footprint, but recoverable by user manually resolving the straggler.

**Mitigation**:
1. **Surface cache depth in winddown summary**: chef header shows "Gmail Sent cache: 180 days (driven by open commitment from 2025-12-15)." Visible signal that the depth is unusual.
2. **Cap cache depth at 90 days with warning**: AC3b currently says cache extends back to commitment date. Hard cap at 90 days. Older commitments get a winddown warning "open commitment dated >90d; cache won't reach it for auto-resolve. Consider manual resolve or accepting older commitments may not auto-resolve."
3. **Incremental cache pull**: pull only the delta since last cache file (not full N-day pull every morning). `gmail.history.list` API supports this — would require tracking `historyId` in cache metadata. Defers to a followup if not done in 11-pre.

**Plan reference**: AC1 line 401, AC3b line 411, Hard part 3 lines 162-166.

---

### M4: `unresolveSuppressedUntil` 14d is hardcoded; user wants permanent suppress for a commitment they'll never get evidence for

**Scenario**: John has a commitment "Catch up with David about the org redesign — informal, no specific deliverable." It's outbound, has a recipient stakeholder. Gmail Sent shows a thread to David titled "checking in" that the LLM matches with HIGH confidence. John knows the email was unrelated (a different context with David) — `[[unresolve]]`s. Plan G5: `unresolveSuppressedUntil = now + 14d`.

15 days later, same pipeline runs. Same Gmail thread is still in the cache (it's been 15+ days since cache cutoff... wait, no — cache is `max(14, today-min(open_commit.date))`. If this commitment is still open at day 16, cache extends back to encompass the original thread). Same recipient, same artifact (no clear artifact, just "checking in"), same LLM SAME decision. Auto-resolve fires again.

John `[[unresolve]]`s again. Day 30: same thread, same loop. There's no permanent-suppress mechanism for this evidence-commitment pair. User has to either (a) manually resolve the commitment with a fake completion to make it stop, (b) `[[unresolve]]` every 14 days indefinitely, (c) wait for the cache to rotate the thread out, which won't happen as long as commitment is open.

The plan acknowledges R6 (resolved-but-actually-unresolved loop) and AC6b mitigation, but the mitigation is "14d window," not "permanent." Eng-lead MC10 noted "where is the sticky-unresolve cache stored?" but assumed 14d was the right number.

**Leading indicators**:
- 14-day Phase 11 soak: any commitment with ≥2 `[[unresolve]]` actions on the same evidence URL.
- `resolution-decisions.log`: grep for repeat (commitment_id, evidence_url) pairs across UNRESOLVE entries.

**Probability**: Low. Edge case for "low-artifact informal commitments" specifically. Most commitments either have clear artifact (won't false-positive) or are resolved by user manually if low-artifact.

**Impact**: Low. User burned by repeated 14d loops; recoverable by manually resolving with fake completion.

**Mitigation**:
1. **Second `[[unresolve]]` on same (commitment, evidence) pair sets permanent suppress**: parser detects repeat — if `resolution-decisions.log` shows prior UNRESOLVE for same pair within 30d, the new `[[unresolve]]` sets `unresolveSuppressedUntil = '9999-12-31'` (sentinel for permanent). One-line behavioral change, captures the "I really mean it this time" signal.
2. **`[[unresolve <id> --permanent]]` directive flavor**: explicit user opt-in. Documentation surfaces the flag when chef detects a second `[[unresolve]]` of same evidence.

**Plan reference**: AC6 line 422, AC6b line 432, R6 line 493, Q5/G5 v1→v2 table line 34.

---

### M5: Owner-as-sender + self-recipient edge case — calendar invites and personal drafts trigger false-positive auto-resolve

**Scenario**: John has a commitment "Send myself the quarterly review template." Outbound (in the v2 model — owner is John, recipient is John as `role: 'self'`). Gmail Sent contains a calendar invite copy that John sent to himself (calendar default behavior), or a draft saved-to-self. The Sent thread has To: john.koht@reserv.com. Recipient pre-filter: stakeholders includes `{slug: 'john-koht', role: 'self'}`. The recipient match logic in plan §"Auto-resolve LLM prompt" assumes "recipient slug → email." If `role: 'self'` stakeholders are eligible for recipient matching, ANY self-sent email is a candidate. LLM might call SAME on a calendar-invite-to-self that has nothing to do with the template.

Phase 10's M2 (in Phase 10 pre-mortem) flagged that R4 needs to filter `role: 'self'` from set-overlap. Phase 11's recipient pre-filter inherits the same surface area but the plan doesn't explicitly say "recipient match excludes role: 'self' stakeholders."

The 11a pipeline §"Auto-resolve LLM prompt" line 286 shows the prompt format with "intended recipient: <recipient slug>". If the parser produced `role: 'self'` stakeholders, this template fills `intended recipient: john-koht`, and the LLM gets a perfectly valid-looking prompt. It'll happily SAME on calendar-invite-to-self.

**Leading indicators**:
- 11a build: grep for "role" filter in recipient match logic. If absent or includes 'self', F-risk live.
- Workspace check: count of commitments with `stakeholders: [{role: 'self', ...}]`. If non-zero, this surface is reachable.

**Probability**: Low-medium. Self-reminders aren't super common but they exist. Calendar self-invites are very common.

**Impact**: Low-medium. False-positive auto-resolve on self-reminders. Recoverable via `[[unresolve]]` but a class of false positives v2 didn't enumerate.

**Mitigation**:
1. **Recipient match filter excludes `role: 'self'` stakeholders**: parallel to Phase 10 M2 fix. One-line filter in the pre-filter step.
2. **AC2 test case for self-recipient**: commitment with `stakeholders: [{slug: 'john-koht', role: 'self'}]` + Sent to john.koht@reserv.com → pipeline does NOT pre-filter through to LLM. Returns no-match cleanly.

**Plan reference**: §"Auto-resolve LLM prompt" lines 286-298, AC2 line 403, Pre-condition `Stakeholder.role` line 99.

---

## Low-risk modes / accepted residuals

- **R8 recipient email mapping incomplete**: plan accepts as graceful degradation with backfill nudge. AC3a recall floor 0.50 is the cushion. Not a pre-mortem risk.
- **R1 false-positive auto-resolve as trust crater**: comprehensively mitigated by AC2a confirm gate, AC3a precision floor, AC6 unresolve path, AC11 banner. The PM-recommended `[[confirm]]` UX *mechanism* is right; F2 above flags the *UX failure mode* of that mechanism, not the mechanism itself.
- **R3 Phase 10 parser ambiguity bug-class**: AC0 gates Phase 11 on it. F1 above is the meta-version (gate is judgment-call when retro is "with caveats"); R3 itself is captured.
- **R4 cost overrun on catch-up**: AC4 separate $3 ceiling. Adequate.
- **R5 cache window depth**: AC3b explicit. Adequate. M3 above is a different angle (Gmail API cost, not coverage gap).
- **R7 `[[unresolve]]` only catches what John notices**: F2 captures this in a stronger form (the inverse — `[[confirm]]` also depends on noticing).
- **R9 11c gate rationalization**: F3 above is the sharper version (gate timing, not gate criteria).

---

## Probed and ruled out

- **Cost projection $0.50/$1.50/$3 catch-up**: AC4 is calibrated for LLM. M3 surfaces the Gmail API quota angle which is orthogonal. Plan's LLM-cost framing is correct as far as it goes.
- **Conditional 11c gate ambiguity from Phase 10 soak**: F3 covers it; the "judgment call" risk is real but bounded by Hard part 5's bias-toward-NO-GO framing. Mitigation is timing, not criteria.
- **Phase 10 followup-2 dependency ordering**: M2 covers the structural collision case; ordering rule G1 itself is sound.
- **Golden-set sourcing**: M1 above. Real risk but bounded mitigation.
- **First-week banner + day-3 prompt**: F2 captures the day-3 prompt failure mode. Banner itself is fine.
- **Owner-as-personSlug recipient matching**: M5 above. Edge case, low frequency.

---

## Recommended plan v3 additions

Concrete diffs to apply before 11-pre starts:

1. **F1**: Hard-gate AC0 on Phase 10 retro language ("PROCEED only, no caveats"). Add phase-attribution field to all Phase 11 mutations. Sequence followup-2 soak to COMPLETE (not just start) before Phase 11 build kickoff. Add latency budget tracking with phase line items.

2. **F2**: Remove `[[confirm-all-week-1]]` from AC11. Promotion-to-week-2 gate requires ≥1 `[[confirm <id>]]` AND zero rollbacks (currently only the latter). Inline full evidence in staged-for-confirm chef section. Add `[[unconfirm <id>]]` directive (24h window) for wrong-confirms.

3. **F3**: Defer 11c GO/NO-GO to day 28, not day 14. Add steady-state confirmation criterion (day-21-28 volume within 30% of Phase 9 baseline). Default NO-GO at day 14 with no override; re-evaluate at day 28+.

4. **F4**: Cache file format versioning. Inbound `EmailThread` caller audit in 11-pre AC1. Serialization gate on new fields (excluded when `fetchBody=false`). 1-day "11-pre soak" before 11a build.

5. **M1**: Golden-set labeling as explicit 11-pre deliverable + scheduled 1-hour John session at 11-pre day 2. Seed from synthetic negatives more aggressively (target 36 of 50 auto-generated). 11a builds without blocking on golden-set; AC3a fires at 11a end.

6. **M2**: 11a logs `RESOLVE-DEFERRED` line when AC8 step 2 fires. followup-2's `staged_item_skip_reason.evidence` accepts multi-source string.

7. **M3**: Surface cache depth in winddown summary. Hard cap at 90 days with warning for older commitments. Incremental cache pull (gmail.history.list) as 11-pre stretch goal.

8. **M4**: Second `[[unresolve]]` on same (commitment, evidence) pair sets permanent suppress (sentinel date). Document `--permanent` directive flavor.

9. **M5**: Recipient match filter excludes `role: 'self'` stakeholders. AC2 test case for self-recipient negative.

---

## Soak observability — what to watch (Phase 11-specific)

**Daily during 14-day Phase 11 soak:**

1. **Staged-for-confirm queue depth + confirm rate** — daily count of `resolveStagedAt`-set commitments vs. `[[confirm]]` directives processed. Trigger: queue depth > 5 with confirm rate <50% = F2 materializing; review per-entry friction.

2. **Phase attribution log** — every winddown report shows time breakdown by phase (phase-10-dedup / phase-10-followup-2-frontmatter / phase-11-resolve). Trigger: any single phase exceeds budgeted latency for 3+ consecutive winddowns.

3. **Repeat-evidence UNRESOLVE pairs** — grep `resolution-decisions.log` for (commitment_id, evidence_url) pairs appearing in ≥2 UNRESOLVE lines. Trigger: any repeat = M4 materializing; surface permanent-suppress option to user.

4. **Gmail Sent cache size + pull latency** — cache file size daily + pull wall-time. Trigger: pull > 30s OR cache > 30MB = M3 materializing; consider depth cap.

5. **Cross-phase commitment-id collisions** — any commitment touched by Phase 10 dedup AND followup-2 chef-skip AND Phase 11 auto-resolve in same week. Trigger: ≥1 such collision = F1/M2 materializing; investigate attribution.

6. **`[[unconfirm]]` actions** — count of wrong-confirm recoveries (if M2 mitigation #4 lands). Trigger: ≥1/week = AC3a precision below 0.95 in practice; investigate.

**Rollback triggers (priority order):**

- **F1 (attribution collapse)**: feature-flag-off Phase 11 only (leave Phase 10 + followup-2 running). Investigate. Re-attempt Phase 11 ship only after Phase 10 retro is clean.
- **F2 (passive confirm pattern detected)**: extend confirm-gated mode by 7 days. If still passive after 14 days, demote 11a to MEDIUM-only surface (no auto-mutate).
- **F3 (11c built then unused)**: deprecate 11c surface with documentation; don't auto-remove (sunk cost is sunk).
- **F4 (inbound regression during 11-pre)**: 11-pre cache versioning + serialization gates apply; redeploy 11-pre with fixes.

**Soak-success criteria (declare Phase 11 done at +14d):**

- AC12 manual: ≤1 false-positive auto-resolve/week post-trust-phase; ≥3 genuine/week; zero false-positive week-1 staged events.
- AC3a golden-set precision holds ≥0.95 on re-evaluated 50-pair set at week 2.
- Combined Phase 10 + Phase 11 cost stays under $1.50/day median.
- ≥1 `[[unresolve]]` actually used (validates AC6) OR explicit user statement "no rollbacks needed."
- ≥1 `[[confirm <id>]]` actually used during week 1 (validates per-entry engagement, blocks F2).
- Phase 11c GO/NO-GO decision documented in retro at day 28 (not day 14 — per F3 mitigation).

---

## What this pre-mortem is betting

v2 is the most-reviewed plan in this refactor. The code architecture is sound. F1 (soak attribution under three-phase compounding) is the highest-confidence risk because it lives at the seam where the plan trusts upstream phases' soak verdicts to be clean — and 6 weeks out, "clean" is unlikely. F2 (`[[confirm]]` UX degradation into passive vote) is the highest workflow risk because it determines whether the trust-building mechanism actually builds trust or merely simulates it. F3 (11c gate timing) is the smallest scope but the easiest to mis-decide. F4 (Gmail provider serialization break) is the most boring but the most likely to extend the build window by 2-3 days.

Mitigate F1-F4 with the recommended v3 edits (~1 day of plan revision + 2-3 days of additional 11-pre work for cache versioning + caller audit + 1-day 11-pre soak) and ship.

If F1 cannot be mitigated (Phase 10 retro lands with caveats and the project doesn't want to delay Phase 11), demote Phase 11 11a to "MEDIUM-only surface, no auto-mutate" for the entire soak window. The unified approval surface (11c) stays default-NO-GO. That's a clean degraded ship that preserves Phase 11's value as a surface-only audit tool while waiting for Phase 10's caveats to close.

The bets v2 makes (HIGH-only writes, confirm gate, structured suppress, conditional 11c, golden-set precision floor) are sound. The soak compounding and the workflow-UX failure modes are what need v3-level attention.
