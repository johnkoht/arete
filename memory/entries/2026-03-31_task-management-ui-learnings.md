# Task Management UI — Learnings

**PRD**: `dev/work/plans/task-management-ui/prd.md`
**Executed**: 2026-03-30 to 2026-03-31
**Branch**: `feature/task-management-ui`

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 12/12 |
| First-Attempt Success | 83% (10/12 first attempt, 2 with fixes) |
| Iterations | 2 (lock timeout fix, ErrorBoundary fix) |
| Tests Added | ~200 |
| Commits | 27 |

## What Was Built

Interactive Task Management page for the Areté web app:
- **Backend**: `TaskService.updateTask()`, `withFileLock()` utility, Tasks API routes (GET/PATCH/DELETE), Suggestions endpoint
- **Frontend**: Types/API client, TanStack Query hooks with optimistic updates, Avatar, ErrorBoundary, TasksPage with tabs (Today/Upcoming/Anytime/Someday), TaskList, SchedulePopup with calendar, TodayView with suggestions

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Fresh context = missing TaskService patterns | No | Explicit file references | Yes |
| TanStack Query v5 API mismatch | No | Reference existing hooks | Yes |
| Test-first commits forgotten | No | Explicit prompts | Yes |
| Concurrent write race conditions | No | withFileLock utility | Yes |
| Optimistic update cache corruption | No | cancelQueries + plural forms | Yes |
| Stale closure bug | No | Ref pattern documented | Yes |

## What Worked Well

- **Test-first enforcement**: Two commits per task caught issues early (jsdom scrollIntoView, vi.hoisted for mocks)
- **Existing patterns**: Following meetings.ts, withSlugLock, and hooks patterns accelerated implementation
- **Typed error exports**: TaskNotFoundError/AmbiguousIdError from core enabled proper HTTP status mapping

## What Didn't Work

- **prd.json status not updated atomically**: Build continued but prd.json showed 0/12 until manual reconstruction
- **Vitest worker accumulation**: Running `npm test` repeatedly spawned persistent workers (~12 × 2GB RAM)
- **Long subagent sessions hit rate limits**: 77-minute session hit API limits mid-execution

## Recommendations

**Continue** (patterns to repeat):
- Test-first with two commits per task
- withFileLock for concurrent writes
- Optimistic updates with cancelQueries + plural forms

**Stop** (patterns to avoid):
- Long subagent sessions without checkpoints
- Relying on prd.json status (use git commits as source of truth)

**Start** (new practices to adopt):
- Kill vitest processes between tasks or use `--run` flag
- Update prd.json after EACH task, not at end
- Chunk large PRDs into smaller subagent calls

## Documentation Updated

- `packages/apps/web/LEARNINGS.md` — DELETE 204 handling, jsdom scrollIntoView gotcha
- `packages/apps/backend/LEARNINGS.md` — (no updates needed, followed existing patterns)

## Key Files

### Backend
- `packages/core/src/services/tasks.ts` — updateTask method
- `packages/apps/backend/src/services/locks.ts` — withFileLock utility
- `packages/apps/backend/src/routes/tasks.ts` — API routes

### Frontend
- `packages/apps/web/src/api/tasks.ts` — API client
- `packages/apps/web/src/hooks/tasks.ts` — TanStack Query hooks
- `packages/apps/web/src/pages/TasksPage.tsx` — Main page
- `packages/apps/web/src/components/TaskList.tsx` — Task list
- `packages/apps/web/src/components/SchedulePopup.tsx` — Date picker
- `packages/apps/web/src/components/TodayView.tsx` — Today tab with suggestions
