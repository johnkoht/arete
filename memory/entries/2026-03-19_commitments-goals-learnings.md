# Commitments + Goals — Learnings (Phase 4)

**PRD**: `dev/work/plans/commitments-goals-transcripts/prd.md`
**Executed**: 2026-03-19
**Duration**: ~30 minutes

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 3/3 complete |
| First-Attempt Success | 100% |
| Iterations | 0 |
| Tests Added | 8 |
| Pre-Mortem Risks | 0/4 materialized |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? |
|------|--------------|---------------------|
| Empty goals state | No | Yes (skip with message) |
| Breaking existing commitments.json | No | Yes (optional field) |
| CLI UX confusion | No | Yes (numbered list) |
| Web vs CLI inconsistency | No | Documented |

## What Worked Well

1. **Scope reduction via reviews**: Original Phase 4 had 6 tasks (goals + transcripts). PM review recommended splitting — Phase 4 became 3 tasks (goals only), transcripts deferred to validation.

2. **Clear heuristic cut**: PM review identified heuristic goal inference as over-engineered for v1. Manual linking with 3-5 goals is fast enough.

3. **Dual approval flow handling**: Task 3 required understanding CLI vs backend approval paths. Solution: sync commitments with goalSlug *before* refreshPersonMemory in backend, avoiding dedup issues.

## Key Decisions

1. **Manual linking, not heuristic**: Users pick from numbered list, no auto-inference
2. **CLI-first**: Web UI goal linking deferred to Phase 5
3. **Inline prompt for few goals**: 1-2 goals use "Link to Q1-2? [y/N]", 3+ use numbered list

## Architecture Notes

- `PersonActionItem` now has `goalSlug?: string` — flows through extraction pipeline
- `CommitmentsService.sync()` copies goalSlug from PersonActionItem to Commitment
- Backend `/api/meetings/:slug/approve` accepts `{ goalSlug?: string }` in body
- CLI syncs commitments directly after approval (no backend call)

## Phase 5 Backlog (Deferred)

These items were intentionally deferred:
- **Web UI goal linking**: Goal dropdown in meeting triage
- **Transcript merge validation**: Check if dual-source users exist
- **Heuristic goal inference**: Only if users request it

---

## Summary

Clean execution of Phase 4. The key success factor was scope reduction via PM + Eng Lead reviews — cutting heuristic inference and deferring transcripts reduced a 6-task plan to 3 tasks. All tasks completed on first attempt with 8 new tests.

Commitments can now be linked to goals during `arete meeting approve`, displayed in `arete commitments list`, and persisted through the full pipeline.
