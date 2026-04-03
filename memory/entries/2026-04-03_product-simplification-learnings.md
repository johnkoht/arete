# Product Simplification — Phase 1 Learnings

**Date**: 2026-04-03
**Plans**: winddown-source-sync (tiny), task-integration-gaps (small), memory-l3-revamp (medium)
**Execution**: 3 parallel sub-orchestrators in worktrees, engineering-lead review, 1 critical fix

## What Was Built

- **Winddown source sync**: daily-winddown recording pull made integration-agnostic (checks arete.yaml)
- **Task integration gaps**: @due(today) lifecycle for daily plan ↔ Task UI Today view alignment, SSE file watchers for task file changes, confirmed meeting→task path already implemented
- **Memory L3 revamp**: AreaMemoryService for computed area summaries, decision compaction, `arete memory refresh` CLI, L3 searchable via QMD, freshness signals in `arete status`, wired into weekly-winddown

## Key Metrics

- 3/3 plans completed, 0 failures
- 30 new tests (19 area-memory, 9 watcher, 2 web hooks)
- 2653 total tests pass, 0 fail
- 1 critical bug caught in engineering review (heading level mismatch in parseMemorySections)
- 54 files changed, +3244/-86 lines

## Learnings

### Execution
- **Sub-orchestrator pattern works well for parallel plans** — each agent got clean context via worktree isolation. The winddown sync (tiny) finished in 5 min while the others ran for 15-30 min. No conflicts between agents.
- **Cherry-pick over merge for worktree integration** — worktrees branch from HEAD at creation time, not from the integration branch. Cherry-picking commits into the integration branch and rebuilding dist is cleaner than merging divergent histories.
- **Dist conflicts are expected and harmless** — every cherry-pick produces dist/ conflicts. Resolution: take theirs, rebuild, commit. Could be automated.

### Architecture
- **Gap 1 (meeting→task) was already implemented** — `approveMeeting()` in backend already creates commitments AND tasks via `createTaskFn` factory wiring. The sub-orchestrator discovered this during orientation, saving significant effort. Lesson: always verify gaps exist in code before building fixes.
- **parseMemorySections heading level mismatch** — the L3 agent used `###` regex to parse decisions, but real workspace decisions use `##` headings with `- **Date**: YYYY-MM-DD` on body lines. Tests used the wrong format too, masking the bug. Lesson: test with REAL data formats from the user's workspace, not invented formats.
- **QMD scope widening (items → full memory dir)** — simplest approach to make L3 searchable. Changed one path. Required updating 5 test occurrences. Clean and minimal.

### Process
- **Engineering-lead review caught a real bug** — the heading format mismatch would have caused empty "Recent Decisions" in area summaries for every real workspace. Review paid for itself.
- **Builder's workspace is the test oracle** — checking arete-reserv's actual `decisions.md` format revealed the heading mismatch before shipping. Always validate against the real workspace.
