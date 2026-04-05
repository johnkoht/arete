# Self-Review: Product Simplification Phase 2

**Date**: 2026-04-04
**Reviewer**: Sub-orchestrator (self-review before execution)

## Acceptance Criteria Review

| AC | Status | Notes |
|----|--------|-------|
| Task 1: Jaccard dedup in addTask() | Plan looks solid | Uses existing jaccardSimilarity from meeting-extraction.ts — no new deps |
| Task 2: existingTasks in MeetingContextBundle | Plan looks solid | Requires type change + prompt update |
| Task 3: daily-plan dedup instruction | Plan looks solid | Documentation change, low risk |
| Task 4: week-plan commitment dedup | Plan looks solid | Documentation + backstop from Task 1 |
| Task 5: threshold 0.65 | Plan looks solid | Single constant change |

## Risk Assessment

### Task 1 (Jaccard dedup in addTask)
- **Risk**: Breaking existing callers that expect addTask to always insert. Mitigation: return existing task instead of error — behavior is additive not breaking.
- **Risk**: Performance — reading all tasks before every addTask. Mitigation: only reads from the target file (not both files); for small week.md/tasks.md this is acceptable.
- **Risk**: Wrong Jaccard math. Mitigation: test with verified math (see LEARNINGS.md gotcha on Jaccard test strings).

### Task 2 (existingTasks in context)
- **Risk**: `existingTasks` field is optional — callers that don't populate it get the same behavior. Safe.
- **Risk**: Prompt length increase. Mitigation: cap at 20 tasks in the context section.
- **Risk**: This is advisory context — LLM may still re-extract. Mitigation: the Jaccard dedup in processMeetingExtraction handles reconciliation even if LLM repeats.

### Task 3 & 4 (skill dedup)
- **Risk**: Skills are instructions to the LLM, not code — no typecheck or test coverage. Mitigation: instructions are clear and precise.

### Task 5 (threshold 0.65)
- **Risk**: Raising threshold means some valid items get filtered. This is the intended behavior — 0.5 is too permissive per the plan.
- **Risk**: Tests that test items at confidence 0.5-0.64 now fail. Mitigation: update tests to reflect new boundary.

## Code Quality Review

- All changes follow StorageAdapter pattern (no direct fs)
- Jaccard dedup reuses existing functions (no new library)
- Optional field approach is backward-compatible
- Constant change is minimal blast radius

## Verdict

Plan is sound. Proceed to pre-mortem then build.
