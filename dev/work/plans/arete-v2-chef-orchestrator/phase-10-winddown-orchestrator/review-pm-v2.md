# Phase 10 v2 — PM Re-Review

**Reviewer**: senior PM (same as v1 review)
**Reviewed**: 2026-06-03
**Plan**: phase-10-winddown-orchestrator/plan.md (v2)
**Verdict**: APPROVE WITH MINOR

## v1 → v2 changes — did they land?

| v1 ID | What v1 flagged | v2 fix (citation) | Sufficient? |
|-------|-----------------|-------------------|-------------|
| G1 | Mid-day approval vs winddown dedup unclear | plan line 25 (changelog) + line 89 (non-goals) + line 325 (pipeline cross-refs commitments.json) | YES. v2 commits to per-meeting approval as primary, dedup cross-references already-approved commitments.json, so 11am-approve + 4pm-meeting case is covered. Could be more explicit in ACs that the 4pm dupe self-attaches without re-prompting, but the architecture supports it. |
| G2 | Async Fathom temporal window gated on createdAt | plan line 26 + line 254 (`date` retained as meeting-date anchor) + Q5 resolution line 615 | YES. v2 explicitly says temporal queries use `date` (meeting date), not `createdAt`. The `createdAt` field is added but reserved for canonical-pick tie-breaking + textVariants eviction, not the temporal window. Cleanly fixed. |
| G3 | Weekend/skipped-day catch-up | plan line 27 (changelog) | PARTIAL. The changelog row says "dedup window honors meeting dates, not 'today'". But v2 explicitly ships SAME-DAY window only (lines 73, 476, Q4). So multi-day catch-up isn't actually solved in 10b-min — it depends on the post-soak cross-day extension. Acceptable given scope trim, but I'd want the plan to call this out as an explicit non-goal for week 1, not bury it in a changelog row. **Minor — should be stated in Non-goals section explicitly.** |
| G4 | Mid-stream edits break hash | plan line 28 (claims `[[edit]]` directive) | NO — not landed. The changelog row says v2 adds `[[edit]]` directive. I cannot find any `[[edit]]` implementation in the build phases, ACs, or architecture sections. Only `[[unmerge]]` is detailed (10b-aux). The `textVariants[]` cap=5 is mentioned but no flow for "user edits canonical text → old text moves to textVariants, ID stable, dedup pointers preserved." **This is a real gap. Either implement, or move to Phase 11 with explicit acknowledgement.** |
| G5 | Chat-first at 22+ items slower | plan line 29 + lines 80-89 (unified surface deferred entirely) + line 225 ("Critical: this is NOT a SKILL.md rewrite") | YES, decisively. Per-meeting UI stays; unified approval defers to Phase 11. This is the right call. |
| G6 | Stakeholder role flattening | plan line 30 + `Stakeholder { role: ... }` interface lines 234-237 + AC1a line 521 | YES. The `role: 'recipient' \| 'sender' \| 'mentioned' \| 'self'` enum is exactly what was needed. AC1a directly tests recipient detection. Good. |
| MV1 | `--explain` for audit | plan line 31 + lines 383-397 + AC7 line 548 | YES. `arete dedup --explain <id>` is in 10b-aux, output format spec'd, fixture-validated. Clean. |
| MV2 | `[[unmerge]]` for recovery | plan line 32 + lines 399-404 + AC8 line 550 + Q7 line 620 | YES. Directive parsing, source_meetings update, log entry all spec'd. Q7 (default to original extracted text on unmerge) is the right call. |
| MV3 | Decision log for soak | plan line 33 + lines 406-412 + AC9 line 557 | YES. Log format defined, best-effort write semantics, AC9 covers emission. |

**Score: 7 of 9 cleanly landed. G3 partial (non-goal not explicit). G4 not landed despite being claimed in changelog.**

## Verdict reasoning

v2 is materially better. The scope trim is principled (10c + 10d both deferred with reasoning that matches my v1 rec), the eng-lead's factual corrections are absorbed cleanly (createdAt, owner-as-personSlug parser, restore verb), and the MV1-3 week-1 controls actually appear in 10b-aux as real build work with real ACs — not as future-work hand-waves. The plan author engaged with each gap I raised rather than papering over them. The owner-as-personSlug parser work (Hard Part 3, AC1a/AC1b, dedicated parser tests) is a genuine improvement that the triage data validates: 28 of 113 commitments (25%) being parser-bug mirrors means this code path will be exercised heavily on day one.

The two issues — G3 partial coverage and G4 missing implementation — are not blockers. G3 is honest scope management slightly mis-communicated; G4 is a real omission that should be filed as a Phase 10 followup OR explicitly deferred to Phase 11 (don't leave the changelog claiming a fix that isn't implemented). With one revision pass to fix the G4 changelog discrepancy and call out the G3 same-day-only window in Non-goals, this is GO.

## New concerns introduced by v2 (if any)

1. **AC11 cost-cap escape valve is loose.** v2 starts at fast tier with a $0.50 median ceiling, but AC11a says if golden-set fails and we promote to standard, the ceiling shifts to $1.50/$5. That's a 3-10x cost increase silently authorized by AC3a failing. **Should require an explicit user-confirm before the tier promotion takes effect**, not an automatic flip. Otherwise we discover the cost shift only at the end of week 1.

2. **`createdAt` backfill sentinel uses `date` value (line 281).** This means existing commitments have `createdAt == date` (meeting date), not their actual write time. Anywhere `createdAt` is used for tie-breaking or textVariants eviction-ordering, old vs new entries are not directly comparable. Low-risk in practice but worth documenting that `createdAt` is "first observation time, sentinel-backfilled for pre-migration entries."

3. **Per-meeting extract latency budget (≤5s extra, AC13).** With 5-candidate LLM cross-check at fast tier, 5s is tight. If the LLM call serializes per pair instead of batching, this will blow. Plan mentions "batched if possible" (line 337) but doesn't commit to it. **Add an explicit batching requirement** or risk AC13 failing in week 1 not because of dedup quality but because of latency.

4. **AC5 decisions.md dedup ratio (~50%) in soak success criteria (line 654).** That's a specific number with no evidence behind it. I'd phrase it as "noticeably reduced growth rate, John subjectively confirms dupes are not appearing" rather than a quantitative gate that could fail for reasons unrelated to the feature.

## Was the trim right?

**Yes, defensibly correct given the triage data.**

The triage finding (113 commitments, 28 parser-bug mirrors, 7 cross-meeting consolidations, 6 already-done, 2 user-judgment) maps to v2 scope as follows:

- **28 parser-bug mirrors (25%)** → 10a migration with owner-as-personSlug parser solves directly. This is the largest cohort and v2 nails it.
- **7 cross-meeting consolidations (6%)** → 10b reactive dedup solves directly. Smaller cohort than expected, but still pain.
- **6 already-done (5%)** → would require 10c (external-source resolution). DEFERRED to Phase 11. This is the cohort the trim leaves on the table.
- **2 user-judgment (2%)** → not automatable in any phase.

So 31% of the pain (parser + cross-meeting) is in-scope for v2; 5% (auto-resolution) is deferred. 5% is real but not load-bearing — current "Closed today (proposed)" reconciler already catches calendar/in-meeting-mention resolutions, and the v1 review correctly flagged 10c as the highest trust-crater feature. **5% pain at high trust-crater risk is the right thing to defer.** If post-soak John reports "I keep finding open commitments I already closed via Slack" frequently, Phase 11 picks it up.

**10d deferral**: also right. The triage doesn't show a unified-approval-surface need — it shows a dedup need. Per-meeting UI + badges is the cheaper proof; ship that first.

## Bureaucratic-bloat check

Plan grew from ~600 to ~750 lines despite scope trim. Where did the lines go?

- **Hard parts section grew** (Hard part 3 owner-as-personSlug is genuinely new and non-trivial — justified).
- **Changelog table at top** (~25 lines) — useful for review traceability; could compress to a sentence post-approval, but for review pass it earns its space.
- **Soak observability + rollback section** (~30 lines, new) — proportionate. Matches how John actually does soak (`wc -l` + tail + spot-check is exactly his style for the slack-digest soak per memory). Not over-instrumented. The 5 daily-observation items are each a one-liner shell check, not a dashboard.
- **ACs expanded** from ~10 to ~15 (AC1a/1b/1c/1d/3a/4a/5a/11a all new sub-ACs) — most are real test specs that prevent v1's hand-waves. Earned.
- **References section** doubled (line numbers added) — good for build, removable post-merge.

**Verdict on bloat**: ~80% of the growth is load-bearing detail that v1 was missing (eng C1-C6 fixes, MV1-3 controls, the owner-as-personSlug parser). The remaining 20% (changelog table, expanded references) is review-cycle scaffolding that can collapse once approved. **Not bureaucratic bloat. The depth is proportionate to a smaller but better-specified scope.**

## AC13 measurability

"Dedup feels right ≥85%" is the right kind of subjective gate for a soak phase, but the plan should give John a concrete observation method. Recommend adding to Soak observability §1: "Weekly: John skims dev/diary/dedup-decisions.log, tallies disagree-count / total-decisions. If <15% disagree, AC13 passes for that week." That's a 5-minute weekly check with a real artifact, not a vibes-check.

## Soak observability section — does it match John's style?

Mostly yes. The five daily checks (lines 639-643) are: `wc -l` on log, spot-check migration-diff, latency log, Phase 8 wall-time, decisions.md growth. All are CLI one-liners that fit John's "tail and grep" soak pattern (per his slack-digest soak observation in memory). The `wc -l` weekly tracking of decisions.md (line 643) is exactly his style.

**Minor over-instrumentation risk**: "log extract time before/after Phase 10" (line 641) — requires a baseline measurement that should be captured BEFORE 10b-min lands, not discovered mid-soak. Add a 10a-pre task: "capture current `arete meeting extract` p50/p95 latency on 10 reference meetings for AC13 baseline."

## Final recommendation

**GO TO PRE-MORTEM** with two minor revisions required first:

1. **Fix G4 changelog**: either implement `[[edit]]` directive in 10b-aux alongside `[[unmerge]]`, or remove the G4 row from the changelog and add to Non-goals with "user edits to canonical text are out of scope for v2; will trigger re-extraction as net-new commitment until Phase 11."

2. **Tighten G3 in Non-goals**: add explicit line "v2 dedup window is same-day only. Multi-day catch-up (Friday meetings reviewed Monday) processes Friday meetings as today's batch; cross-day dedup deferred until post-soak."

Both are 5-line edits. Then pre-mortem and build.

The author did the work. v1 wasn't ignored. The architecture is now defensible at the scope level, the eng-lead's factual blocking issues are resolved, and the week-1 controls (MV1-3) are real build items not future-work. Triage data validates the trim. Ship it.
