# Task Management UI v2 Improvements — Learnings

**Branch**: `feature/task-management-ui`
**Date**: 2026-04-02
**Context**: User testing revealed bugs and UX gaps after initial 12-task PRD build

## What Was Fixed/Added

### Critical Bugs Fixed
- **PATCH endpoint**: `if/else if` chain made destination+due mutually exclusive — changed to sequential processing
- **UTC timezone**: Backend used `toISOString()` for date filters — wrong after ~7pm in US timezones. Fixed with local date construction
- **Debounce dropping mutations**: `useUpdateTask` had 100ms debounce + `isPending` guard that silently dropped button clicks
- **setQueriesData crash**: Broad queryKey `['tasks']` matched `SuggestedTask[]` cache (array, not object) — TypeError crashed `onMutate`, preventing PATCH from firing
- **Missing filters**: Backend didn't support `completed` or `completed-today` filters

### Features Added
- `@completedAt(YYYY-MM-DD)` tag — auto-set on completion
- `uncompleteTask()` — restore completed tasks
- Area/project assignment dropdowns
- Things 3 style "When?" schedule popup
- Grouped upcoming view (by day/week/month)
- Collapsible suggestions section
- Human-friendly schedule labels (Today/Tomorrow/Apr 5 instead of must/should)
- Completion animation (8s fade with strikethrough)

## Key Learnings

### 1. Don't debounce deliberate user actions
Button clicks (schedule, complete) are one-shot actions. The debounce+pending guard was designed for typing inputs and actively harmful for button clicks — it silently dropped mutations.

### 2. setQueriesData with broad keys can crash on mismatched shapes
`queryClient.setQueriesData({ queryKey: ['tasks'] })` matches ALL caches starting with 'tasks' including ones storing different types (arrays vs objects). Always add shape guards.

### 3. UTC dates in Node.js are wrong for local-time features
`new Date().toISOString().split('T')[0]` returns UTC date. At 9 PM CDT, UTC is already tomorrow. Use `new Date(now.getFullYear(), now.getMonth(), now.getDate())` for local dates.

### 4. Unit tests with mocks miss integration bugs
All tests passed while the app was completely broken. Tests mocked `fetch` at the exact right timing, never testing the debounce path or the cache shape mismatch that only occurs when multiple hooks are mounted simultaneously.

### 5. Suggestions must filter out acted-on tasks
The suggestions endpoint initially returned ALL incomplete tasks scored. After a user schedules a task, it must disappear from suggestions (filter by: no due date, not in must bucket).

## Corrections Applied
- Backend date handling: local dates everywhere
- Hook mutations: direct `mutation.mutate()`, no debounce
- Cache invalidation: `refetchType: 'active'` to prevent N refetches per mutation
- Suggestions: exclude scheduled tasks from endpoint
