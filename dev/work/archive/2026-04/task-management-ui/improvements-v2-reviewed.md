# Task Management UI Improvements v2 — Reviewed Plan

> **Reviewer**: Engineering Lead
> **Date**: 2026-04-02
> **Status**: Reviewed with corrections

---

## Review Summary

The original plan correctly identifies the core bugs but has **significant inaccuracies** in the implementation details for 2 of 3 critical fixes. Phase 2 and 3 are generally sound but Phase 3 can be deferred.

### Key Findings

1. **PATCH bug** ✅ Confirmed exactly as described — `if/else if` chain is mutually exclusive
2. **Completed filter** ⚠️ TWO bugs, not one — `completed` AND `completed-today` both missing from `validFilters`
3. **No `completedAt` field exists** ❌ Plan's sort-by-completedAt is impossible — `TaskMetadata` has no timestamp
4. **`updateTask` in core only accepts `{ due }` updates** — area/project support genuinely needs to be added
5. **No "my identity" in workspace config** — Task 5 needs design decision before implementation
6. **`fetchCompletedTodayTasks` already exists on frontend** — calls `filter=completed-today` which also 400s

---

## Answers to Open Questions

### Q1: PATCH endpoint — exact bug?
**Confirmed**: Lines 167-192 of `tasks.ts`. It's a strict `if/else if/else if` chain:
- `if (body.destination !== undefined)` → only runs moveTask, ignores `due`
- `else if (body.completed !== undefined)` → only runs completeTask
- `else if ('due' in body)` → only runs updateTask with due

The frontend's `handleSetToday` sends `{ due: getTodayString(), destination: 'must' }` and `handleSchedule` sends `{ due: dateStr, destination }` — both hit the first branch, so `due` is silently dropped.

### Q2: Completed tasks — how are they stored?
**`WorkspaceTask.completed`** is a boolean derived from `[x]` vs `[ ]` in markdown. There is **NO `completedAt` timestamp** anywhere in the task model. `TaskMetadata` fields are: `area`, `project`, `person`, `from`, `due`. That's it.

Implications:
- Cannot sort completed tasks by completion date
- Cannot filter "completed today" without filesystem metadata (file mtime) or adding a `@completedAt()` tag
- The plan's `completed-today` filter in `fetchCompletedTodayTasks` is aspirational — both the filter AND the data model need work

### Q3: Area/project on WorkspaceTask?
**`metadata.area`** and **`metadata.project`** exist on `TaskMetadata` and are parsed from `@area(slug)` and `@project(slug)` tags. The `enrichTask` function already returns them. However, **`TaskService.updateTask()` only accepts `{ due?: string | null }`** — it does NOT support updating area or project. Task 9 in the plan correctly identifies this needs to be added.

### Q4: "My tasks" — owner identity?
**No workspace config with owner identity exists** in the task or backend codebase. Options:
- Read from `.arete/config.yaml` if it exists (needs investigation)
- Accept as env var or backend config
- Defer Task 5 until identity system exists

### Q5: Other backend filter bugs?
**Yes — `completed-today` filter is also missing.** The frontend's `fetchCompletedTodayTasks()` sends `filter=completed-today` which returns 400. The `validFilters` array is `['today', 'upcoming', 'anytime', 'someday']` — missing both `completed` and `completed-today`.

---

## Phase 1: Critical Backend Fixes (Corrected)

### Task 1: Fix PATCH to Handle Multiple Fields Together

**Problem**: `if/else if` chain makes `destination`, `completed`, and `due` mutually exclusive.

**File**: `packages/apps/backend/src/routes/tasks.ts` (lines ~167-192)

**Fix approach**: Replace mutual exclusion with sequential processing:
```typescript
const services = await createServices(workspaceRoot);
const foundTask = await services.tasks.findTask(id);
if (!foundTask) {
  return c.json({ error: `No task found matching id "${id}"` }, 404);
}

let task = foundTask;

// Process destination (move)
if (body.destination !== undefined) {
  task = await withFileLock(foundTask.source.file, () =>
    services.tasks.moveTask(id, body.destination!)
  );
}

// Process due date
if ('due' in body) {
  task = await withFileLock(task.source.file, () =>
    services.tasks.updateTask(task.id, { due: body.due })
  );
}

// Process completion (should be last — triggers side effects)
if (body.completed !== undefined && body.completed) {
  const result = await withFileLock(task.source.file, () =>
    services.tasks.completeTask(task.id)
  );
  task = result.task;
}
```

**Edge case**: After `moveTask`, the task's `source.file` may change (e.g., week.md → tasks.md for anytime). The second `withFileLock` must use the UPDATED task's file path, not the original. The code above handles this correctly by using `task.source.file` after move.

**ACs**:
- [ ] `{ due: '2026-04-05', destination: 'must' }` updates BOTH fields
- [ ] `{ destination: 'anytime' }` alone still works
- [ ] `{ due: '2026-04-05' }` alone still works
- [ ] `{ completed: true }` alone still works
- [ ] `{ due: '2026-04-05', destination: 'should', completed: true }` — all three work (edge case)
- [ ] Cross-file move + due update (e.g., anytime → must + due) works correctly
- [ ] "No valid updates" 400 when body is empty `{}`

**Tests** (in `packages/apps/backend/test/routes/tasks.test.ts`):
1. PATCH with `{ due, destination }` → both fields updated on returned task
2. PATCH with only `{ destination }` → moves task, due unchanged
3. PATCH with only `{ due }` → due updated, destination unchanged
4. PATCH with only `{ completed: true }` → completes task
5. PATCH with `{ due, destination }` cross-file (anytime→must) → both correct
6. PATCH with empty body → 400
7. PATCH with invalid due format → 400

**Estimate**: 1.5 hours

---

### Task 2: Add `completed` and `completed-today` Filters

**Problem**: TWO missing filters:
1. `completed` — used by TasksPage Completed tab (sends `?filter=completed`)
2. `completed-today` — used by TodayView's CompletedSection (sends `?filter=completed-today`)

**File**: `packages/apps/backend/src/routes/tasks.ts`

**Implementation**:
```typescript
const validFilters = ['today', 'upcoming', 'anytime', 'someday', 'completed', 'completed-today'];

// In filter logic:
} else if (filterParam === 'completed') {
  filteredTasks = allTasks.filter(t => t.completed);
  // Sort: no completedAt available, so sort by source order (reverse for "recent last")
  // Or sort by due date if available as a proxy
} else if (filterParam === 'completed-today') {
  // Without completedAt, we cannot truly filter by "completed today"
  // Options:
  //   A. Return ALL completed tasks (same as 'completed') — least surprising
  //   B. Return completed tasks that had @due(today) — misleading
  //   C. Add @completedAt() tag to completeTask and filter on it
  // RECOMMENDATION: Option C (add completedAt to metadata) for correctness
}
```

**Critical design decision**: Without `completedAt` in the task model, `completed-today` is meaningless. **Recommendation**: Add `@completedAt(YYYY-MM-DD)` tag support as part of this task:

1. Add `completedAt` to `TaskMetadata` type
2. Update `parseMetadata` to handle `@completedAt()`
3. Update `formatTask` to write `@completedAt()`
4. Update `completeTask` to set `completedAt` to today's date
5. Filter `completed-today` by `completedAt === today`
6. Sort `completed` by `completedAt` descending (with fallback for legacy tasks without it)

**Files touched**:
- `packages/core/src/models/tasks.ts` — add `completedAt` to `TaskMetadata`
- `packages/core/src/services/tasks.ts` — parseMetadata, formatTask, completeTask
- `packages/apps/backend/src/routes/tasks.ts` — validFilters, filter logic

**ACs**:
- [ ] `GET /api/tasks?filter=completed` returns 200 with completed tasks
- [ ] `GET /api/tasks?filter=completed-today` returns 200 with tasks completed today
- [ ] Completed tasks sorted by completedAt descending
- [ ] Legacy completed tasks (without completedAt) still appear in completed filter
- [ ] `completeTask` now adds `@completedAt(YYYY-MM-DD)` to the task line
- [ ] TasksPage Completed tab loads without error
- [ ] TodayView Completed section shows today's completions

**Tests**:
1. `completed` filter returns only `completed: true` tasks
2. `completed` filter excludes incomplete tasks
3. `completed-today` filter returns only tasks with `completedAt === today`
4. `completed-today` filter excludes tasks completed on other days
5. `completed-today` filter excludes legacy completed tasks without `completedAt` (or includes them — design choice)
6. `completeTask` sets `completedAt` in metadata
7. `parseMetadata` extracts `@completedAt()` tag
8. `formatTask` writes `@completedAt()` tag
9. Sort order: most recently completed first

**Estimate**: 2.5 hours (was 1hr — much larger scope due to completedAt)

---

### Task 3: Verify End-to-End Scheduling Flow

Same as original plan, but add:

**Additional ACs**:
- [ ] Schedule task for tomorrow: PATCH sends `{ due, destination }` → both saved
- [ ] Completed task in Completed tab shows completedAt date
- [ ] TodayView CompletedSection shows task just completed (after invalidation)

**Estimate**: 0.5 hours

---

## Phase 2: Frontend Polish

### Task 4: Move Person Avatar to Right Side

**Current layout** (verified in TaskList.tsx and TodayView.tsx):
```
[checkbox] [avatar] [text] [area] [project] [commitment] [schedule]
```

**Target**:
```
[checkbox] [text] [area] [project] [avatar] [schedule]
```

**Files**: Both `TaskList.tsx` and `TodayView.tsx` (TasksSection AND CompletedSection AND SuggestionRow)

**ACs** (same as plan, plus):
- [ ] Change applied in ALL four places: TaskList, TodayView TasksSection, TodayView CompletedSection, TodayView SuggestionRow
- [ ] Avatar tooltip shows person name

**Estimate**: 0.5 hours

---

### Task 5: Differentiate My Tasks vs Delegated

**BLOCKED**: No owner identity exists in workspace config or task system. 

**Recommendation**: Defer to Phase 4 or add a minimal config step:
1. Check if `.arete/config.yaml` has an `owner` or `user` field
2. If not, skip differentiation (all tasks look the same)
3. If yes, compare `task.person?.slug` to config owner slug

**If proceeding**, the safest approach is Option B (accept as prop/context from a config hook). This avoids hardcoding and works if config exists.

**Estimate**: 1 hour IF config exists, 2+ hours if config needs to be built

---

### Task 6: Slow Down Completion Animation

**Files**: `TaskList.tsx` line 62 and `TodayView.tsx` (TasksSection)

**Current**: `duration-[1500ms]` and timeout of 2000ms
**Target**: `duration-[3000ms]` and timeout of 3500ms

**Must update in ALL places**:
- `TaskList.tsx`: `duration-[1500ms]` (2 occurrences in className) + `setTimeout` 2000ms
- `TodayView.tsx` TasksSection: `duration-[1500ms]` (2 occurrences) + `setTimeout` 2000ms

**ACs**:
- [ ] All `duration-[1500ms]` → `duration-[3000ms]` 
- [ ] All fade timeouts → 3500ms (animation + 500ms buffer)
- [ ] No orphan references to old timing values

**Estimate**: 0.25 hours

---

## Phase 3: Area/Project Assignment (Can Defer)

### Task 7: Backend - List Available Areas
Same as plan. **One addition**: verify `areas/` directory path relative to workspace root.

### Task 8: Backend - List Available Projects  
Same as plan.

### Task 9: Core - Update Task Area/Project

**Important correction**: `TaskService.updateTask()` currently only accepts `{ due?: string | null }`. The signature needs to be expanded:

```typescript
async updateTask(
  taskId: string,
  updates: { due?: string | null; area?: string | null; project?: string | null },
): Promise<WorkspaceTask>
```

And the PATCH endpoint body type needs updating too:
```typescript
const body = await c.req.json<{
  completed?: boolean;
  due?: string | null;
  destination?: TaskDestination;
  area?: string | null;
  project?: string | null;
}>();
```

**ACs** (same as plan, plus):
- [ ] `updateTask` signature expanded to accept area/project
- [ ] PATCH endpoint passes area/project to updateTask
- [ ] Wire format already includes area/project (confirmed: `enrichTask` already maps these)

### Task 10: Frontend - Area/Project Selector
Same as plan.

---

## Testing Strategy (Expanded)

### Backend Unit Tests (`packages/apps/backend/test/routes/tasks.test.ts`)

**PATCH endpoint**:
| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | due + destination together | `{ due: '2026-04-05', destination: 'must' }` | Both fields on returned task |
| 2 | destination only | `{ destination: 'anytime' }` | Moved, due unchanged |
| 3 | due only | `{ due: '2026-04-05' }` | Due updated, position unchanged |
| 4 | completed only | `{ completed: true }` | Task completed |
| 5 | cross-file move + due | `{ destination: 'anytime', due: '2026-04-10' }` | Both, even across files |
| 6 | empty body | `{}` | 400 error |
| 7 | invalid due format | `{ due: 'not-a-date' }` | 400 error |
| 8 | all three fields | `{ due, destination, completed }` | All processed |
| 9 | nonexistent task | `{ due: '...' }` on bad ID | 404 |

**Filters**:
| # | Test | Input | Expected |
|---|------|-------|----------|
| 10 | completed filter | `?filter=completed` | Only `completed: true` tasks |
| 11 | completed excludes incomplete | `?filter=completed` | No incomplete tasks |
| 12 | completed-today | `?filter=completed-today` | Only tasks with today's completedAt |
| 13 | completed-today excludes yesterday | `?filter=completed-today` | No tasks from yesterday |
| 14 | invalid filter | `?filter=invalid` | 400 with valid filter list |

### Core Unit Tests (`packages/core/test/services/tasks.test.ts`)

| # | Test | Expected |
|---|------|----------|
| 15 | completeTask sets completedAt | `metadata.completedAt === today` |
| 16 | parseMetadata handles @completedAt | Correct extraction |
| 17 | formatTask writes @completedAt | Tag in output |
| 18 | updateTask with area | @area tag added |
| 19 | updateTask with project | @project tag added |
| 20 | updateTask with area=null | @area tag removed |
| 21 | updateTask preserves other tags | due, person, from unchanged |

### Frontend Tests

| # | Test | File |
|---|------|------|
| 22 | Avatar renders after text, before schedule | TaskList.test |
| 23 | Avatar position in TodayView | TodayView.test |
| 24 | Completion animation is 3s | TaskList.test (check className) |
| 25 | Completed tab shows tasks | TasksPage.test |

---

## Risk Assessment

### High Risk
1. **`completedAt` migration**: Existing completed tasks have no `completedAt`. The `completed` filter works (boolean check), but `completed-today` will miss legacy tasks. **Mitigation**: Accept that pre-migration completed tasks won't show in "completed today" — this is fine since the feature is new.

2. **File locking with sequential operations**: Task 1's fix runs moveTask then updateTask sequentially with separate locks. If another request modifies the same file between the two operations, data could be lost. **Mitigation**: Wrap both in a single lock scope, or re-read after move.

### Medium Risk
3. **Task ID stability after move**: `computeTaskId()` uses text hash. After moveTask, the ID stays the same (text doesn't change). The second `updateTask` call with the same ID should find the task in its new location. **Verified**: moveTask calls `addTask` which preserves text, so ID is stable. ✅

4. **Cross-file moves**: Moving from `week.md` (must) to `tasks.md` (anytime) and then updating due — the file lock must use the destination file, not source. Plan's fix handles this correctly.

### Low Risk
5. **Animation timing**: Simple CSS change, low risk.
6. **Avatar repositioning**: Layout-only change, testable visually.

---

## Implementation Order (Corrected)

```
Phase 1: Critical Fixes (sequential — each builds on previous)
├── Task 2: completedAt model + completed/completed-today filters (2.5 hrs)
│   (Do first: model change is foundational)
├── Task 1: PATCH multi-field handling (1.5 hrs)
│   (Depends on Task 2 if we want PATCH completion to write completedAt)
└── Task 3: E2E verification (0.5 hr)

Phase 2: Frontend Polish (parallel-safe after Phase 1)
├── Task 4: Avatar position (0.5 hr)
├── Task 6: Animation timing (0.25 hr)
└── Task 5: My vs delegated (DEFER — needs identity system)

Phase 3: Area/Project (defer to separate PRD)
├── Tasks 7-10 (6-7 hrs)
```

**Revised Total Estimate**: 
- Phase 1: 4.5 hours
- Phase 2: 0.75 hours (deferring Task 5)
- Phase 3: 6-7 hours (deferred)
- **MVP: ~5.25 hours**

---

## Open Decisions for Builder

1. **Task 5 (my vs delegated)**: Defer until identity system exists, or build minimal config now?
2. **Phase 3 (area/project)**: Ship as separate PRD, or include in this build?
3. **Legacy completed tasks**: Should `completed-today` filter show ALL legacy completed tasks (no completedAt), or exclude them? Recommend: exclude (new feature, no historical expectation).
4. **Score display on suggestions**: Keep or hide? (Original plan question, still open)
