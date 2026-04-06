# Product Simplification — Phase 2: Plumbing Gaps Learnings

**Date**: 2026-04-04
**Plan**: product-simplification-phase2
**Execution**: Single sub-orchestrator in worktree (worktree-agent-a1506182)

## What Was Built

1. **Jaccard dedup in TaskService.addTask()** — Before inserting, checks all existing open tasks. Fast-path: `@from(commitment:id)` exact match returns existing. Jaccard >= 0.8 similarity returns existing. Searches both week.md and tasks.md. Returns existing task (no error) on dedup.

2. **existingTasks in MeetingContextBundle** — `buildMeetingContext()` now reads `now/week.md` and `now/tasks.md`, extracts open task texts (capped at 20), and includes them in the bundle. `buildContextSection()` in meeting-extraction.ts renders "Existing Tasks" section in the extraction prompt.

3. **daily-plan dedup instruction** — Added explicit dedup check step to daily-plan SKILL.md §7 (Write Today Section): do not re-state tasks already tracked in Must/Should/Could sections.

4. **week-plan commitment dedup** — week-plan SKILL.md §3.1 now shows `(already a task: "text")` for commitments with existing `@from(commitment:id)` linked tasks, preventing double-creation.

5. **Confidence threshold raised** — `DEFAULT_CONFIDENCE_INCLUDE` changed from `0.5` to `0.65` in `meeting-processing.ts`. Updated 8 affected tests.

## Key Metrics

- 5/5 tasks completed
- ~25 new tests (tasks dedup: 5, meeting-extraction existingTasks: 4, meeting-processing threshold: ~16 updated)
- 2437 total tests pass, 0 fail
- Files changed: ~25 (source + dist + tests + skills)

## Key Learnings

### Jaccard dedup in service layer
- Reusing `normalizeForJaccard` and `jaccardSimilarity` from `meeting-extraction.ts` was the right call — no new library, consistent tokenization. Import across services is fine in core.
- Dedup reads ALL tasks before every addTask() call. For small files (week.md = 20-50 lines), this is acceptable. If performance becomes an issue, a lazy-read pattern could cache within a request context.
- Returning the existing task (not an error) is the right API contract — callers get a valid task back and can proceed without special-casing.

### Confidence threshold migration
- The 0.5 → 0.65 change broke 8 tests. Predicted correctly in pre-mortem. Always grep affected confidence values in tests before changing threshold constants.
- Tests that used `0.6` as "a moderate confidence item" needed updating — they were testing status (pending/approved) logic, not the threshold itself. Use `0.7` as the representative "below auto-approve but above include threshold" value.

### Optional field pattern
- Adding `existingTasks?: string[]` as an optional field to `MeetingContextBundle` was clean: zero breaking changes to 10+ existing construction sites. Conditional spread `...(existingTasks.length > 0 && { existingTasks })` keeps the field absent when empty.

### Skill dedup is advisory
- Skill instructions are advisory to the LLM — the write-time Jaccard dedup in TaskService is the real backstop. Skill instructions improve LLM behavior but the code guarantees correctness.
