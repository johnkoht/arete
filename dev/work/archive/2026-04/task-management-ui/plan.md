---
title: Task Management Ui
slug: task-management-ui
status: building
size: large
tags: []
created: 2026-03-30T03:35:49.116Z
updated: 2026-03-31T04:49:26.007Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 23
---

# Task Management UI

## Problem

Tasks in markdown files (`now/tasks.md`, `now/week.md`) have verbose inline metadata (`@from(commitment:13b257c8)`) that makes them hard to scan. There's no visual UI for task management — only the raw markdown files.

## Solution

Build a clean, interactive Tasks page in the web app (`arete view`) inspired by Things 3, with tabs, quick scheduling, and intelligence-driven suggestions.

---

## Test-First Enforcement

**Commit Convention**: Each step requires TWO commits minimum:
1. `test(task-ui): add tests for <step>` — tests only, must fail or skip
2. `feat(task-ui): implement <step>` — implementation that makes tests pass

**Reviewer Checklist** (enforced per step):
- [ ] Test commit is separate from implementation
- [ ] Tests fail/skip before implementation commit
- [ ] Tests pass after implementation commit
- [ ] Test count matches requirement count ± 10%

---

## Wire Format Specification

### GET /api/tasks

Query params: `filter=today|upcoming|anytime|someday`, `waitingOn=true`, `limit=50`, `offset=0`

```typescript
// Response: 200 OK
interface TasksListResponse {
  tasks: TaskWire[];
  total: number;
  offset: number;
  limit: number;
}
```

### GET /api/tasks/suggested

```typescript
// Response: 200 OK
interface TaskSuggestionsResponse {
  suggestions: ScoredTaskWire[];
  contextLevel: 'simplified' | 'full';
}
```

### PATCH /api/tasks/:id

```typescript
// Request:
interface TaskUpdateRequest {
  completed?: boolean;
  destination?: TaskDestination;
  due?: string | null;  // ISO date YYYY-MM-DD or null to clear
}
// Response: 200 OK → { task: TaskWire }
// Response: 400 → { error: string, field?: string }
// Response: 404 → { error: "Task not found", id: string }
// Response: 409 → { error: "Task modified", stale: true }
```

### DELETE /api/tasks/:id

```typescript
// Response: 204 No Content
// Response: 404 → { error: "Task not found", id: string }
```

### Error Response Contract (all endpoints)

```typescript
interface ErrorResponse {
  error: string;
  field?: string;   // for validation errors
  id?: string;      // for not found errors
  stale?: boolean;  // for conflict errors
}
```

### Common Types

```typescript
interface TaskWire {
  id: string;               // 8-char content hash
  text: string;
  destination: TaskDestination;
  due: string | null;       // ISO date YYYY-MM-DD
  area: string | null;
  project: string | null;
  person: { slug: string; name: string } | null;
  from: { 
    type: 'commitment'; 
    id: string; 
    text: string;
    priority: 'high' | 'medium' | 'low';
    daysOpen: number;
  } | null;
  completed: boolean;
  source: { file: string; section: string };
}

type TaskDestination = 'inbox' | 'must' | 'should' | 'could' | 'anytime' | 'someday';

interface ScoredTaskWire extends TaskWire {
  score: number;            // 0-100
  breakdown: {
    dueDate: number;
    commitment: number;
    meetingRelevance: number;
    weekPriority: number;
  };
}
```

---

## Design Decisions

### Tab Structure

| Tab | Content |
|-----|---------|
| **Today** | Due today + overdue (top), AI-suggested priorities (bottom) |
| **Upcoming** | Future dated tasks grouped by date |
| **Anytime** | Backlog with no date |
| **Someday** | On hold, maybe never |

**Waiting On**: Filter toggle (not a tab) — filters to tasks with `@from(commitment:*)`.

### Data Model Mapping

- **Today** = `@due(today)` OR `must` bucket. Sort: overdue first (by days desc), then today.
- **Upcoming** = `@due(future)` grouped by date
- **Anytime** = `anytime` destination
- **Someday** = `someday` destination

### Scheduling Semantics

Scheduling adds/updates `@due(YYYY-MM-DD)`. Task stays in its bucket. Badge reflects date.

### Suggestions (V1 Simplified)

Using `task-scoring.ts` with simplified context:
- `todayMeetingAttendees: []` (calendar integration deferred)
- `weekPriorities: string[]` (parsed from week.md)
- Other fields: defaults

### Discard Action

**Deferred to Phase 2** — requires persistence model.

---

## Out of Scope (V1)

- Creating new tasks from UI
- Editing task text from UI
- Discard action (Phase 2)
- Calendar integration for suggestions
- Drag-and-drop (Phase 2)
- Today + This Evening split

---

Plan:

1. **Core: TaskService.updateTask() method**
   - Signature: `updateTask(id: string, updates: { due?: string | null }): Promise<WorkspaceTask>`
   - Updates task metadata; text and ID remain unchanged
   - Throws `TaskNotFoundError` for unknown ID
   - Throws `AmbiguousIdError` if ID prefix matches multiple tasks
   - File written atomically (no partial updates on error)
   - **Test Requirements:**
     - `test: updateTask adds @due to task without date`
     - `test: updateTask modifies existing @due date`
     - `test: updateTask removes @due when due=null`
     - `test: updateTask preserves other metadata (@area, @person, @from)`
     - `test: updateTask throws TaskNotFoundError for non-existent ID`
     - `test: updateTask throws AmbiguousIdError for ambiguous prefix`
     - `test: updateTask is atomic — file unchanged on validation error`
   - AC: All 7 tests pass; method exported; errors are typed

2. **Backend: Write lock utility**
   - Create `withFileLock(filePath, fn)` in `backend/src/services/locks.ts`
   - Mutex per file path; async queue for concurrent requests
   - Lock timeout: 5 seconds (prevents deadlock)
   - **Test Requirements:**
     - `test: concurrent writes to same file are serialized`
     - `test: writes to different files proceed in parallel`
     - `test: lock is released on function error`
     - `test: lock times out after 5 seconds with error`
   - AC: All 4 tests pass; utility exported

3. **Backend: Tasks API routes (CRUD)**
   - `GET /api/tasks` — list with filters + pagination per wire format
   - `PATCH /api/tasks/:id` — update per wire format; uses `withFileLock()`
   - `DELETE /api/tasks/:id` — delete; uses `withFileLock()`
   - "today" filter: `@due(today)` UNION `must` bucket, deduped, sorted (overdue first)
   - **Test Requirements:**
     - `test: GET returns paginated list with total count`
     - `test: GET filter=today includes must bucket tasks`
     - `test: GET filter=today includes @due(today) tasks`
     - `test: GET filter=today dedupes tasks matching both criteria`
     - `test: GET filter=today sorts overdue before today`
     - `test: GET waitingOn=true filters by @from(commitment:*)`
     - `test: GET returns 400 for invalid filter param`
     - `test: PATCH updates completion status`
     - `test: PATCH updates due date`
     - `test: PATCH clears due date when due=null`
     - `test: PATCH moves between destinations`
     - `test: PATCH returns 404 for unknown ID`
     - `test: PATCH returns 400 for invalid due date format`
     - `test: DELETE removes task from file`
     - `test: DELETE returns 404 for unknown ID`
     - `test: concurrent PATCH requests are serialized (no corruption)`
   - AC: All 16 tests pass; responses match wire format exactly

4. **Backend: Suggestions endpoint**
   - `GET /api/tasks/suggested`
   - Parses weekPriorities from `now/week.md` "## Priorities" section
   - Assembles simplified ScoringContext; calls `scoreTasks()`
   - Returns top 10 scored tasks
   - **Test Requirements:**
     - `test: returns scored tasks sorted by score descending`
     - `test: respects ScoringContext.referenceDate`
     - `test: parses weekPriorities from week.md`
     - `test: returns empty array when no tasks`
     - `test: excludes completed tasks`
     - `test: handles missing week.md gracefully (empty priorities)`
     - `test: handles malformed week.md (no Priorities section)`
   - AC: All 7 tests pass; response matches SuggestionsResponse wire format

5. **Frontend: Types and API client**
   - Add types to `src/api/types.ts` matching wire format specification above
   - Add `src/api/tasks.ts` with fetch functions
   - Type mapping in API layer (not components)
   - **Test Requirements:**
     - `test: fetchTasks maps wire format correctly`
     - `test: fetchTasks handles empty response`
     - `test: fetchTaskSuggestions handles empty suggestions`
     - `test: updateTask sends correct PATCH body`
     - `test: deleteTask sends DELETE request`
     - `test: fetchTasks throws on network error with actionable message`
     - `test: fetchTasks throws on 500 with error from body`
     - `test: fetchTasks throws on 400 with field-specific error`
     - `test: fetchTasks throws on 404 with task ID`
   - AC: All 9 tests pass; types exported; error messages include context

6. **Frontend: Hooks with race condition protection**
   - Add `src/hooks/tasks.ts`:
     - `useTasks(filter, options)` — TanStack Query v5
     - `useTaskSuggestions()` — for Today view
     - `useUpdateTask()` — mutation with optimistic update
     - `useCompleteTask()` — mutation for checkbox
   - Query config: `staleTime: 30_000`, `gcTime: 300_000`
   - Optimistic update pattern (per LEARNINGS.md):
     1. `cancelQueries` before update
     2. `getQueriesData`/`setQueriesData` (plural) for pagination
     3. Rollback in `onError`
   - Race condition protection: mutations debounced 100ms; ignore duplicate calls while pending
   - **Test Requirements:**
     - `test: useTasks refetches on filter change`
     - `test: useTasks uses correct staleTime (30s)`
     - `test: useUpdateTask optimistically updates cache`
     - `test: useUpdateTask rolls back on error`
     - `test: useUpdateTask calls cancelQueries before optimistic update`
     - `test: useCompleteTask invalidates queries on success`
     - `test: useCompleteTask ignores duplicate calls while pending`
     - `test: useUpdateTask debounces rapid calls (100ms)`
     - `test: mutations use ref pattern to avoid stale closure`
   - AC: All 9 tests pass; hooks exported; no stale closure bugs

7. **Frontend: Avatar component**
   - Create `src/components/Avatar.tsx` for single-person display
   - Props: `name: string`, `size?: 'sm' | 'md'`
   - Computes initials from name (first letter of first two words)
   - Includes Tooltip with full name
   - **Test Requirements:**
     - `test: renders initials from name ("John Doe" → "JD")`
     - `test: renders single initial for single word name`
     - `test: shows tooltip on hover`
     - `test: handles empty name gracefully (shows "?")`
     - `test: has accessible label via aria-label`
   - AC: All 5 tests pass; component matches design system

8. **Frontend: TasksPage error boundary**
   - Wrap TasksPage content in React Error Boundary
   - On error: show "Something went wrong" with retry button
   - Log error to console (structured object)
   - **Test Requirements:**
     - `test: error boundary catches child component errors`
     - `test: error boundary shows error message`
     - `test: retry button re-mounts children`
     - `test: error is logged with component stack`
   - AC: All 4 tests pass; page doesn't crash on component errors

9. **Frontend: TasksPage shell with tabs**
   - Add route `/tasks` to App.tsx
   - Add to sidebar navigation
   - Tab navigation: Today, Upcoming, Anytime, Someday
   - Waiting On filter toggle (URL param `?waitingOn=true`)
   - Tab via URL param `?tab=today` (default: today)
   - **Empty States** (with role="status"):
     - Today: CheckCircle icon, "No tasks for today", "Add tasks from your workspace or schedule existing tasks."
     - Upcoming: Calendar icon, "No scheduled tasks", "Schedule tasks to see them here."
     - Anytime: Inbox icon, "Your backlog is empty", "Tasks without dates appear here."
     - Someday: Archive icon, "Nothing on the back burner", "Defer tasks here for later."
   - **Test Requirements:**
     - `test: renders all four tabs`
     - `test: tab click updates URL param`
     - `test: URL param selects correct tab on load`
     - `test: Waiting On toggle updates URL param`
     - `test: shows correct empty state per tab`
     - `test: empty state has role="status"`
     - `test: loading state shows skeleton`
     - `test: error state shows error message with retry`
     - `test: Arrow keys navigate between tabs`
     - `test: tabs have correct aria-selected state`
     - `test: page renders at 375px viewport without horizontal scroll`
   - AC: All 11 tests pass; tabs keyboard accessible; mobile doesn't overflow

10. **Frontend: Task list with line items**
    - Task row: checkbox, Avatar, description, schedule badge
    - Commitment badge if `from?.type === 'commitment'`: "High priority, 14 days open"
    - Checkbox click → `useCompleteTask()` mutation
    - During mutation: checkbox shows spinner (disabled)
    - On success: task row fades out (300ms), removed from list
    - On error: toast "Failed to complete task", row stays
    - Keyboard: Space/Enter on focused row completes task
    - **Test Requirements:**
      - `test: renders task text and checkbox`
      - `test: renders Avatar with person initials`
      - `test: renders schedule badge with correct icon per destination`
      - `test: renders commitment badge when from exists`
      - `test: checkbox click calls complete mutation`
      - `test: checkbox shows spinner during mutation`
      - `test: completed task fades out`
      - `test: failed completion shows toast`
      - `test: Space key completes focused task`
      - `test: rapid checkbox clicks don't create duplicate mutations`
      - `test: long task text truncates with ellipsis`
    - AC: All 11 tests pass; completion feedback is clear; keyboard works

11. **Frontend: Quick schedule popup**
    - Click schedule badge → shadcn Popover
    - Options: Today / Tomorrow / Pick date / Anytime / Someday
    - Date picker: shadcn Calendar (add via `npx shadcn-ui@latest add calendar`)
    - On selection → `useUpdateTask()` with new `due` value
    - Popup closes after selection; focus returns to trigger badge
    - **Accessibility:**
      - Escape closes popup
      - Arrow Up/Down navigate options
      - Enter selects highlighted option
      - Focus trapped within popup
      - `role="listbox"` on popup, `role="option"` on options
    - **Test Requirements:**
      - `test: clicking badge opens popover`
      - `test: selecting Today sets due to today's date`
      - `test: selecting Tomorrow sets due to tomorrow`
      - `test: selecting Anytime clears due date (due=null)`
      - `test: selecting Someday moves to someday destination`
      - `test: Escape key closes popover`
      - `test: Arrow keys navigate options`
      - `test: Enter selects highlighted option`
      - `test: popup closes after selection`
      - `test: focus returns to trigger after close`
      - `test: popup has role="listbox"`
    - AC: All 11 tests pass; fully keyboard accessible; focus managed

12. **Frontend: Today view with suggestions**
    - Top section: "Tasks" — due today + overdue (sorted: overdue first)
    - Bottom section: "Suggested" — from `/api/tasks/suggested`
    - Sections load independently (suggestions can fail without breaking tasks)
    - Suggestions skeleton while loading
    - Action buttons on suggestions: Set Today / Schedule / Punt
    - Toast confirms each action
    - **Test Requirements:**
      - `test: renders tasks section with overdue first`
      - `test: renders suggestions section separately`
      - `test: suggestions skeleton while loading`
      - `test: tasks visible when suggestions fail`
      - `test: suggestions visible when tasks fail (with tasks error state)`
      - `test: Set Today button updates due to today`
      - `test: Schedule button opens date picker`
      - `test: Punt button moves to anytime`
      - `test: toast confirms successful action`
      - `test: toast shows error on failed action`
    - AC: All 10 tests pass; partial failure handled gracefully

---

**Phase 2** (separate PRD after Phase 1 ships):

13. **Frontend: Upcoming view** — group by date, collapse distant dates
14. **Frontend: Drag-and-drop** — @dnd-kit with keyboard support, optimistic updates
15. **Frontend: Waiting On filter** — full implementation
16. **Discard action** — persistence model + UI

---

**Size**: Large (12 steps in Phase 1)
**Total Test Requirements**: 114 tests

## Pre-Mortem Risks & Mitigations

See `pre-mortem.md` for full analysis. Key mitigations:

1. **Date vs Bucket**: "Today" = `@due(today)` OR `must` bucket
2. **Missing updateTask()**: Added as Step 1
3. **Concurrent writes**: withFileLock utility (Step 2)
4. **Race conditions**: Debounced mutations, duplicate call protection (Step 6)
5. **Partial failure**: Independent loading for tasks/suggestions (Step 12)
6. **Error handling**: Error boundary (Step 8), typed error responses