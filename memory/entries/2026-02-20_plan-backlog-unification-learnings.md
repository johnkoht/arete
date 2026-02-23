# Plan & Backlog Unification — PRD Execution Learnings

**Date**: 2026-02-20
**PRD**: plan-and-backlog-ux-updates
**Type**: PRD execution learnings

## Metrics

- **Tasks**: 8/8 complete (100%)
- **First-attempt success**: 87.5% (7/8 — A4 required 1 iteration for missing slug display)
- **Iterations**: 1 (A4: reviewer caught missing slug in status display)
- **Tests added**: ~45 new tests across commands, widget, and persistence
- **Total tests**: 301 passing, 0 failures
- **Commits**: 9 (8 task commits + 1 iteration fix)
- **Files changed**: 68 (code + migrated data + docs)

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Effective |
|------|-------------|---------------------|
| ctx.ui.custom access | Yes | Yes — added to CommandContext with unknown types |
| Auto-save race | No | Yes — verified guard (todoItems >= 2) |
| Test/function coupling | No | Yes — removed together |
| Existing handlePlanStatus | No | Yes — read first, extended |
| SelectList imports | No | Yes — verified beforehand |
| Footer overflow | No | Yes — truncation logic |
| Slug collisions | No | N/A — zero collisions |
| Docs references | Yes | Yes — comprehensive grep |

## What Worked Well

1. **Stub pattern for cross-task dependencies**: Keeping deprecated functions as throwing stubs in A1 so A3 could cleanly remove them without breaking typecheck between tasks. This avoided task-ordering problems.
2. **Pure function extraction for testability**: `preparePlanListItems()`, `parsePlanListFilter()`, `buildPlanFooter()` — extracting pure helpers made complex UI logic fully testable without TUI infrastructure.
3. **Reviewer pre-work sanity checks**: Caught the DEFAULT_BACKLOG_DIR dependency issue in A3 and the typecheck-will-fail issue in A1 before development started. Saved at least one iteration each.
4. **Comprehensive grep for doc updates**: `rg "backlog"` found 2 files not in the original task spec (reviewer.md, build-agents.ts). Systematic search > manual enumeration.
5. **Preset.ts as reference pattern**: The pi example extension was the perfect template for SelectList + DynamicBorder + Container usage.

## What Didn't Work

1. **A4 missed slug in status display**: The AC explicitly said "slug" but the developer's initial implementation omitted it. Reviewer caught it — reinforces value of AC-by-AC verification.
2. **PRD AC vs task description misalignment**: A1's PRD AC said "DEFAULT_BACKLOG_DIR export removed" but the task needed to keep it (commands.ts still imports). Task description was corrected but PRD wasn't updated. Future PRDs should note when task-level AC overrides PRD-level AC.

## Subagent Insights

- Developers consistently praised detailed task prompts with specific line numbers and file references
- The "read these files first" pattern prevented assumptions and reduced iterations
- Pure function extraction was the most impactful pattern for testability
- Token usage was moderate (~10-15K per task, ~5K for simple tasks)

## Recommendations for Next PRD

1. **Continue**: Reviewer pre-work sanity checks, stub pattern for cross-task deps, pure function extraction, comprehensive doc grep
2. **Stop**: Writing PRD-level AC that conflicts with task-level AC
3. **Start**: Adding "verify typecheck passes across ALL modules" as an explicit pre-work check when removing exports
