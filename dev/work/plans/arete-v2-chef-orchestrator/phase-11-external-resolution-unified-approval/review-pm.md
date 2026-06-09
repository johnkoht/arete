# Phase 11 Plan Review — PM Pass

**Reviewer**: senior PM (independent perspective; did not draft)
**Reviewed**: 2026-06-05
**Plan**: phase-11-external-resolution-unified-approval/plan.md (v1)
**Verdict**: REVISE BEFORE BUILD — and split 11b out as a Phase 10 followup-2 NOW

## Verdict reasoning

The plan correctly diagnoses both empirical signals — 5% triage density (6/113 on 6/03) and the CT2 catch (6/04). The architectural moves are mostly right. But the plan packages four very-different-risk-profile features into one phase, and one of them (11b chef-mutates-staged-status) is materially less risky than the others, has a fresh tonight-incident as its proof point, doesn't depend on Gmail being plumbed, and shouldn't wait for Phase 10's 14-day soak to even start. Shipping 11b as Phase 10 followup-2 right now is the most actionable scope call. It closes CT2 structurally and doesn't entangle with the trust-crater risks of 11a.

For the rest: 11a (Gmail auto-resolve) is the right *eventual* bet but the precision-floor framing is statistical when the user-experience problem is single-incident. 11c is correctly conditional but its gate criteria need sharpening before the gate is even meaningful. 11d (decision auto-stale) is the most underspecified — "stale" as a behavior hasn't been pinned down past "30d no reference" and that threshold will misfire on real strategic decisions that don't get name-checked every month.

## What the plan gets right

- **Catches CT2 same-day**. Folding tonight's incident into the goal set with frontmatter mutation as the structural enforcer is the right move. The CT2-as-AC7 reproduction test is specific and executable.
- **HIGH-only auto-resolve, MEDIUM never writes** (Hard part 1 + AC3 + Q6). Correctly identifies the asymmetry: false positive is a trust crater; false negative is just "you'll resolve it manually next triage like you do today."
- **Precision floor ≥0.95 on a 50-pair golden set** drawn from the 6/03 triage's RESOLVE rows (3 deliverables × 2 IDs each = 6 anchor positives). Borrows Phase 10 golden-set methodology cleanly.
- **Audit trail surfaces** — `arete resolve --explain`, `[[unresolve]]`, `dev/diary/resolution-decisions.log`. The recovery path exists.
- **Atomicity for chef-mutates-frontmatter** (Hard part 5 + AC7a/b/c) — lockfile + mtime guard + body comment alongside frontmatter + re-extract preservation. Comprehensive.
- **Default = don't build 11c**. Correctly states the unified surface is conditional, not assumed.
- **`source_external[]` reserved in Phase 10** prevents a second migration — good forward-planning.

## Workflow gaps that need addressing (PM lens)

### G1: Mid-day approval, then end-of-day chef detects dupe via a later meeting

**Scenario**: John approves the John/Jamie 11am 1:1 at 11:30am with `ai_0042` ("Share Notion doc with Jamie") staged. Chef runs at 6pm winddown. Chef detects the Slack DM that fulfilled it, but `ai_0042` is no longer a *staged* item — it's already a *committed* commitment. Does chef route to 11a auto-resolve path (commitment-level) or 11b chef-mutate-staged path? Plan implies "both pipelines run" but doesn't sequence them.

**Real-world friction**: If chef-mutate fires AFTER apply has already created the commitment, the frontmatter write is dead-letter. The actual right action is auto-resolve the commitment. Plan needs an explicit ordering rule: **at chef run, for each candidate item, check commitments.json FIRST → if already a committed entry, route to 11a auto-resolve; if still staged, route to 11b mutate.**

**Recommendation**: Add AC: "staged item already approved before chef runs → 11a auto-resolve path; staged item still staged → 11b mutate path. Never both."

### G2: Async Fathom review 3 days late (Phase 10 G2 re-test)

**Scenario**: Monday meeting reviewed Thursday. Tuesday Gmail evidence exists. Plan claims (AC3b) the temporal window uses `commitment.date` not `createdAt`, which would correctly accept Tuesday's evidence for the Monday-dated commitment.

**Real-world friction**: This only works if the Gmail Sent cache covers a wide-enough window. Plan says "last 14 days at session start" — which works for Monday-Thursday. But the cache is keyed by *winddown date*, not *commitment date*. If a Fathom review is 5+ days late and the cache is only 14 days deep, edge cases at the boundary will silently drop.

**Recommendation**: Verify AC3b explicitly. Add a test case: "commitment dated 14 days ago, Sent on day 13, winddown on day 0 → must still auto-resolve" — the cache must reach back to the commitment date, not just 14 days from now.

### G3: Skipped weekend → Monday batch winddown

**Scenario**: John doesn't run winddown Sat-Sun. Monday batch covers Fri PM + weekend Slacks + Mon's meetings. Plan's 14-day cache window is fine for this case. But: Phase 10's reactive dedup pipeline runs at extract time; Phase 11's auto-resolve runs at winddown. If 4 days of accumulated unresolved-but-evident commitments hit the same winddown, the cost cap ($0.50 median / $1.50 heavy) is for *one* winddown. Does it hold when N=4 days?

**Real-world friction**: AC4 says "median $0.50 / heavy $1.50" but doesn't specify whether "heavy" includes catch-up days. A Monday batch over 70+ open commitments × 4 days of new Sent evidence could push past $1.50.

**Recommendation**: Test cost cap explicitly under catch-up-day conditions. Either widen AC4 to define "heavy" inclusive of 4-day catch-up, or add a separate budget for batch winddowns ($3 ceiling).

### G4: Wrong recipient resolution — Lindsay-Calar vs Lindsay-Gray

**Scenario**: Commitment "Send Lindsay the deck" with stakeholders=[lindsay-gray]. Workspace also has lindsay-calar with email. Both have `email:` fields populated. Hybrid pipeline finds Gmail Sent to `lindsay.calar@...` matching artifact "deck.pdf". Auto-resolves the lindsay-GRAY commitment.

**Plan's handling**: The pipeline does "recipient match: do any of c.stakeholders[] map to email addresses in any cached thread?" — this is per-stakeholder, so lindsay-calar wouldn't match a lindsay-gray-stakeholder commitment. Good in principle. BUT: this depends on parser correctly tagging `stakeholders` from extraction. If Phase 10's parser still has any residual Lindsay-ambiguity (the N1 bug class), Phase 11 inherits it AT WORSE COST — wrong commitment auto-resolved silently.

**Recommendation**: Make the dependency explicit. AC: "Phase 11 inherits Phase 10's parser; any parser fix lands in both phases atomically. If Phase 10's parser has open ambiguity bugs at Phase 11 ship time, BLOCK Phase 11 11a until resolved." This is the load-bearing constraint and the plan doesn't say it.

### G5: First-week-auto-resolve-is-wrong UX

**Scenario**: Day 3 of Phase 11 soak. Auto-resolve fires on a commitment that John actually had NOT completed. He sees it in the "Auto-resolved today" section, says "wait, no, I didn't send that yet," adds `[[unresolve <id>]]`. Next winddown reopens it. But the SAME Gmail thread is still in the 14-day cache. R10 names this loop and adds a "unresolve sticky for 14d" mitigation.

**Real-world friction**: 14d sticky is correct mechanism but underspecified — what record persists? Plan says "marker in resolution-decisions.log" but the log is append-only text. Querying it on every auto-resolve check adds latency and is fragile to log rotation/cleanup. This should be a structured field on the commitment (`autoResolveSuppressedUntil: <date>` or `[unresolveActions: [{at, evidenceUrl}]]`).

**Recommendation**: Make R10 mitigation a first-class commitment field, not log-grep. Add AC: "after `[[unresolve]]`, commitment carries a 14d suppress marker for the specific `(commitment_id, evidence_url)` pair. Same evidence within 14d cannot re-resolve."

### G6: Decision auto-stale buries a "to revisit later" decision

**Scenario**: John makes a decision 2026-04-01: "Defer roadmap automation until Q3." It's intentionally a future-revisit item. 60 days pass. No references. Phase 11d auto-stales it. John doesn't notice the stale tag (because there are 4 other stale decisions and he's not auditing decisions.md daily). Q3 starts. He should be acting on it but it's tagged stale.

**Real-world friction**: Decision auto-stale at 30d is too aggressive for strategic decisions and too lenient for operational ones. Plan acknowledges this (Hard part 4) but the v1 answer ("30d across the board, tune in soak") is hand-wavy.

**Recommendation**: Defer 11d to Phase 12 (or a Phase 11 followup). Decision-shaped data doesn't have the empirical pain signal that commitments do. The 6/03 triage was a *commitments* triage; the parallel for decisions has zero evidence in the data so far. Don't auto-anything on decisions until there's lived pain.

## Scope recommendations

### Strongest recommendation: 11b ships NOW as Phase 10 followup-2

**Why this is the right move**:
- **Fresh empirical signal**: tonight's 6/04 winddown shows the gap in production. No need for a soak to confirm.
- **No Gmail dependency**: 11b's chef detection works against whatever evidence chef can already see (Slack hits in chef output today, Gmail later in 11a). The frontmatter mutation + apply-honors-marker mechanism is provider-agnostic.
- **Lower trust risk**: chef-mutate happens BEFORE apply, surfaces in winddown ("Skipped on apply" section), is user-visible before being acted on. False positives surface as visible items John can override. Compare to 11a where auto-resolve happens TO an existing commitment — the user has to *audit* to discover it.
- **Smaller surface**: 3-4 days estimate is right-sized for a followup.
- **Plan agrees but doesn't act**: line 591 says "Phase 11b is REQUIRED, not conditional — even if 11a's precision misses the 0.95 floor, 11b still ships." If 11b stands alone, it should ship alone.

**The split**:
- **Phase 10 followup-2 (NEW — ~3-4 days, ship immediately after Phase 10 soak success)**: 11b chef-mutates-staged-status + atomic-write infrastructure + AC7/7a/7b/7c + CT2 reproduction test. Uses chef's existing same-meeting evidence detection (Slack DM hits, in-meeting mentions) — no Gmail provider required.
- **Phase 11 (revised)**: 11a + 11c-conditional + 11-audit. Defer 11d to Phase 12.

### Trim 11d (decision auto-stale) entirely from Phase 11

The signal density for decision-rot doesn't exist in the data. The 6/03 triage was all commitments. Phase 11 is acting on lived pain (CT2 + 5% triage); 11d would be acting on theoretical pain. Defer.

### 11c gate criteria need to be sharper

Hard part 6's criteria ("15+ items/day, 5+ meetings, 30%+ dupes, >2min context-switching") are reasonable but the gate decision happens AFTER 14d Phase 10 soak. By then, builder muscle memory will have adapted to per-meeting + dupe badges. The 14-day window biases toward "don't build" because John will have habit-locked. That might be the right answer, but the plan should call it out: **the gate is biased toward NO-GO and that's intentional**. If after 14d John says "fine, per-meeting works," that's a valid signal even if items/day was 20+.

### Sizing reality check

Plan claims 17-25d total, 12-19d if 11c is NO-GO. Removing 11b (splits to followup-2) and 11d (deferred): Phase 11 becomes 11a (~7-10d) + 11-audit (~2-3d) + maybe 11c (~5-7d if GO). That's 9-20 days, which is a tighter and more honest spread for "one phase."

## User-trust risks

### Risk: First-week auto-resolve wrong call — UX recovery

Plan has `[[unresolve]]` + first-week banner + sticky suppress. What's missing: a **"trust slider"** for week 1. Two modes:
- **Conservative (default for first 7d)**: HIGH-confidence auto-resolve still requires `[[confirm <id>]]` directive at end of winddown to actually mutate `commitments.json`. Chef stages the resolve; user confirms next winddown.
- **Standard (after 7d if zero rollbacks)**: HIGH → auto-mutates as plan describes.

This costs 1 extra winddown cycle of latency for the first week but eliminates the "discovered 3 days later" trust crater. Recommend as AC.

### Risk: Decision auto-stale buries genuine "revisit later" decisions

Already covered in G6. Defer 11d.

### Risk: `[[unresolve]]` only catches what John notices

The banner + winddown "Auto-resolved today" section helps. But on a heavy day with 5+ auto-resolves, John will skim. Recommendation: **for the first 7 days, EVERY auto-resolve gets a `[[confirm]]` requirement (above)**. After that, the banner + section is enough. Bias toward conservative on first-week trust-building.

### Risk: 11b chef-mutate happens silently if user doesn't read frontmatter

AC7c (body audit comment) addresses this. Good. But the *winddown* "Skipped on apply" section is the primary surface. Make sure that section is visually distinct and surfaces *every* skip, not roll-up. If chef skips 3 staged items via mutation, winddown shows all 3 with evidence URLs.

## Q1-Q7 stance with PM reasoning

- **Q1 (recipient email mapping — required vs graceful)**: Agreed with plan's lean — graceful degradation. Phase 10's people-memory hygiene work hasn't backfilled emails uniformly, and gating on it would block 80% of cases for 20% precision gain. Surface missing-email nudge in winddown is the right pattern.

- **Q2 (artifact extraction — regex vs LLM)**: Lean toward **dual approach**, not single LLM. Use cheap regex/NN extraction as pre-filter signal (input to LLM prompt), but let LLM make the final SAME/DIFFERENT call. Plan's single-LLM approach is simpler but loses a useful signal feature. Add to prompt: "Artifact keyword candidates from commitment: [extracted_NN]; check against sent body."

- **Q3 (MEDIUM-flagged → `[[confirm <id>]]` directive)**: Convert to user-resolve. Agreed with plan. Preserves `resolvedBy: 'user'` semantics. The directive surface stays uniform with `[[unresolve]]` + `[[unmerge]]` + `[[archive]]`.

- **Q4 (decision auto-stale threshold)**: N/A — defer 11d to Phase 12. If forced to answer for v1: 60d, not 30d. Strategic decisions get name-checked monthly at best.

- **Q5 (11c GO/NO-GO decision-maker)**: John alone, with PM consultation. Per memory ("John is both builder AND primary daily user"), he is the user. PM consults on metric interpretation but the lived experience is his. Don't over-process this.

- **Q6 (`resolvedConfidence: MEDIUM` ever in commitments.json)**: Winddown-surface-only in v1. Agreed. If a MEDIUM converts to user-confirmed resolve via `[[confirm]]`, it becomes `resolvedBy: 'user'` + `resolvedConfidence: 'HIGH'` (user confirmation is the source of HIGH).

- **Q7 (first-week banner auto-removal logic)**: 7d OR first `[[unresolve]]` is right for the banner. But layer the **`[[confirm]]` requirement** (recommended above) underneath it, which adds a real-trust gate independent of the banner.

## Final recommendation

**Action this week**:
1. **Split 11b out as Phase 10 followup-2**. Build immediately, ship right after Phase 10 soak. Don't wait for Phase 11.
2. **Defer 11d to Phase 12**. No empirical signal for decision-rot pain.

**Action after Phase 10 soak**:
3. **Revise Phase 11** to: 11a (Gmail auto-resolve, ~7-10d) + 11-audit (~2-3d) + 11c-conditional (~5-7d if GO). Total: 9-20d.
4. **Add G1-G5 ACs** to Phase 11 revision: sequence ordering (G1), temporal window cache depth (G2), catch-up cost cap (G3), parser-dependency lock (G4), structured `[[unresolve]]` suppress field (G5).
5. **Add first-week `[[confirm]]` requirement** to 11a auto-resolve path. HIGH stages a resolve; user confirms next winddown. After 7d zero-rollback, demote to auto-mutate.
6. **Sharpen 11c gate** with explicit "biased toward NO-GO" framing. John's lived experience trumps the numeric criteria.

If Phase 11 is restructured this way, it's a strong APPROVE. As written (4 goals bundled, 11b waiting on Phase 10 soak unnecessarily, 11d underspecified), REVISE BEFORE BUILD.
