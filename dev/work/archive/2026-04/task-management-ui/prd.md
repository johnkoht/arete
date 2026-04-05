# PRD: Task Management UI

## Goal

Build a clean, interactive Tasks page in the web app (`arete view`) inspired by Things 3, with tabs (Today/Upcoming/Anytime/Someday), quick scheduling, and AI-driven suggestions. This replaces direct markdown file editing for task management.

## Context

- **TaskService already exists** with `listTasks()`, `completeTask()`, `addTask()`, `moveTask()` — this PRD adds `updateTask()` and builds the UI layer
- **Task IDs** are 8-char sha256 hashes of normalized text
- **Optimistic updates** must use `cancelQueries()` + plural `getQueriesData`/`setQueriesData` forms
- **Stale closure prevention**: use refs for callbacks reading state

## Wire Format Specification

All API responses follow these contracts:

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

interface ErrorResponse {
  error: string;
  field?: string;   // for validation errors
  id?: string;      // for not found errors
  stale?: boolean;  // for conflict errors
}
```

---

## Tasks

### Task 1: Core TaskService.updateTask() Method

**Description**: Add `updateTask(id, updates)` method to existing TaskService in `packages/core/src/services/tasks.ts`.

**Implementation Details**:
- Signature: `updateTask(id: string, updates: { due?: string | null }): Promise<WorkspaceTask>`
- Updates task metadata; text and ID remain unchanged
- Throws `TaskNotFoundError` for unknown ID
- Throws `AmbiguousIdError` if ID prefix matches multiple tasks
- File written atomically (no partial updates on error)
- Follow existing `completeTask()` pattern for file read/write

**Acceptance Criteria**:
1. `updateTask` adds `@due(YYYY-MM-DD)` to task without existing date
2. `updateTask` modifies existing `@due` date
3. `updateTask` removes `@due` when `due=null`
4. `updateTask` preserves other metadata (`@area`, `@person`, `@from`)
5. `updateTask` throws `TaskNotFoundError` for non-existent ID
6. `updateTask` throws `AmbiguousIdError` for ambiguous prefix
7. `updateTask` is atomic — file unchanged on validation error
8. Method exported from tasks.ts
9. Errors are typed exports (`TaskNotFoundError`, `AmbiguousIdError`)

---

### Task 2: Backend Write Lock Utility

**Description**: Create `withFileLock(filePath, fn)` in `packages/apps/backend/src/services/locks.ts` to prevent concurrent write corruption.

**Implementation Details**:
- Mutex per file path using async queue pattern
- Lock timeout: 5 seconds (prevents deadlock)
- Release lock in finally block (even on error)
- Similar pattern to existing `withSlugLock` in meetings routes

**Acceptance Criteria**:
1. Concurrent writes to same file are serialized (not interleaved)
2. Writes to different files proceed in parallel
3. Lock is released on function error
4. Lock times out after 5 seconds with descriptive error
5. Utility exported from locks.ts

---

### Task 3: Backend Tasks API Routes (CRUD)

**Description**: Create task API routes in `packages/apps/backend/src/routes/tasks.ts` with GET, PATCH, DELETE endpoints.

**Implementation Details**:
- `GET /api/tasks` — list with filters (`filter=today|upcoming|anytime|someday`, `waitingOn=true`) + pagination (`limit`, `offset`)
- `PATCH /api/tasks/:id` — update task per wire format; uses `withFileLock()`
- `DELETE /api/tasks/:id` — delete task; uses `withFileLock()`
- "today" filter: `@due(today)` UNION `must` bucket, deduped, sorted (overdue first by days desc, then today)
- Register routes in backend server.ts

**Acceptance Criteria**:
1. GET returns paginated list with total count
2. GET filter=today includes `must` bucket tasks
3. GET filter=today includes `@due(today)` tasks
4. GET filter=today dedupes tasks matching both criteria
5. GET filter=today sorts overdue before today (by days overdue desc)
6. GET `waitingOn=true` filters to tasks with `@from(commitment:*)`
7. GET returns 400 for invalid filter param
8. PATCH updates completion status
9. PATCH updates due date
10. PATCH clears due date when `due=null`
11. PATCH moves between destinations
12. PATCH returns 404 for unknown ID
13. PATCH returns 400 for invalid due date format
14. DELETE removes task from file
15. DELETE returns 404 for unknown ID
16. Concurrent PATCH requests are serialized (no file corruption)

---

### Task 4: Backend Suggestions Endpoint

**Description**: Create `GET /api/tasks/suggested` endpoint for AI-driven task recommendations.

**Implementation Details**:
- Parse weekPriorities from `now/week.md` "## Priorities" section
- Assemble simplified ScoringContext (todayMeetingAttendees: [], weekPriorities from parsed file)
- Call `scoreTasks()` from `packages/core/src/services/task-scoring.ts`
- Return top 10 scored tasks with breakdown

**Acceptance Criteria**:
1. Returns scored tasks sorted by score descending
2. Respects `ScoringContext.referenceDate`
3. Parses weekPriorities from week.md correctly
4. Returns empty array when no tasks
5. Excludes completed tasks
6. Handles missing week.md gracefully (empty priorities array)
7. Handles malformed week.md (no Priorities section)

---

### Task 5: Frontend Types and API Client

**Description**: Add task types and API client functions to the web app.

**Implementation Details**:
- Add types to `packages/apps/web/src/api/types.ts` matching wire format
- Add `packages/apps/web/src/api/tasks.ts` with fetch functions:
  - `fetchTasks(filter, options)` → `TasksListResponse`
  - `fetchTaskSuggestions()` → `TaskSuggestionsResponse`
  - `updateTask(id, updates)` → `{ task: TaskWire }`
  - `deleteTask(id)` → void
- Type mapping in API layer (not components)
- Error messages include context (field, ID, etc.)

**Acceptance Criteria**:
1. `fetchTasks` maps wire format correctly to frontend types
2. `fetchTasks` handles empty response
3. `fetchTaskSuggestions` handles empty suggestions
4. `updateTask` sends correct PATCH body
5. `deleteTask` sends DELETE request
6. `fetchTasks` throws on network error with actionable message
7. `fetchTasks` throws on 500 with error from body
8. `fetchTasks` throws on 400 with field-specific error
9. `fetchTasks` throws on 404 with task ID

---

### Task 6: Frontend Hooks with Race Condition Protection

**Description**: Create TanStack Query hooks for tasks with optimistic updates and race condition protection.

**Implementation Details**:
- Add `packages/apps/web/src/hooks/tasks.ts`:
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
- Use ref pattern to avoid stale closure bugs

**Acceptance Criteria**:
1. `useTasks` refetches on filter change
2. `useTasks` uses correct staleTime (30s)
3. `useUpdateTask` optimistically updates cache
4. `useUpdateTask` rolls back on error
5. `useUpdateTask` calls `cancelQueries` before optimistic update
6. `useCompleteTask` invalidates queries on success
7. `useCompleteTask` ignores duplicate calls while pending
8. `useUpdateTask` debounces rapid calls (100ms)
9. Mutations use ref pattern to avoid stale closure bugs

---

### Task 7: Frontend Avatar Component

**Description**: Create reusable Avatar component for displaying person initials.

**Implementation Details**:
- Create `packages/apps/web/src/components/Avatar.tsx`
- Props: `name: string`, `size?: 'sm' | 'md'`
- Compute initials from name (first letter of first two words)
- Include Tooltip with full name (use existing shadcn Tooltip)
- Accessible via aria-label

**Acceptance Criteria**:
1. Renders initials from name ("John Doe" → "JD")
2. Renders single initial for single word name
3. Shows tooltip on hover with full name
4. Handles empty name gracefully (shows "?")
5. Has accessible label via aria-label

---

### Task 8: Frontend TasksPage Error Boundary

**Description**: Add error boundary wrapper to TasksPage for graceful error handling.

**Implementation Details**:
- Create error boundary component or use react-error-boundary
- Wrap TasksPage content in error boundary
- On error: show "Something went wrong" message with retry button
- Log error to console (structured object with component stack)

**Acceptance Criteria**:
1. Error boundary catches child component errors
2. Error boundary shows "Something went wrong" message
3. Retry button re-mounts children (resets error state)
4. Error is logged with component stack

---

### Task 9: Frontend TasksPage Shell with Tabs

**Description**: Create the main TasksPage component with tab navigation.

**Implementation Details**:
- Add route `/tasks` to App.tsx
- Add to sidebar navigation
- Tab navigation: Today, Upcoming, Anytime, Someday
- Waiting On filter toggle (URL param `?waitingOn=true`)
- Tab via URL param `?tab=today` (default: today)
- Empty states per tab with role="status":
  - Today: CheckCircle icon, "No tasks for today", "Add tasks from your workspace or schedule existing tasks."
  - Upcoming: Calendar icon, "No scheduled tasks", "Schedule tasks to see them here."
  - Anytime: Inbox icon, "Your backlog is empty", "Tasks without dates appear here."
  - Someday: Archive icon, "Nothing on the back burner", "Defer tasks here for later."
- Use existing shadcn Tabs component

**Acceptance Criteria**:
1. Renders all four tabs (Today, Upcoming, Anytime, Someday)
2. Tab click updates URL param `?tab=`
3. URL param selects correct tab on page load
4. Waiting On toggle updates URL param `?waitingOn=true`
5. Shows correct empty state per tab
6. Empty states have `role="status"` for accessibility
7. Loading state shows skeleton
8. Error state shows error message with retry
9. Arrow keys navigate between tabs
10. Tabs have correct `aria-selected` state
11. Page renders at 375px viewport without horizontal scroll

---

### Task 10: Frontend Task List with Line Items

**Description**: Build the task list component with interactive line items.

**Implementation Details**:
- Task row: checkbox, Avatar (if person), description, schedule badge
- Commitment badge if `from?.type === 'commitment'`: "High priority, 14 days open"
- Checkbox click → `useCompleteTask()` mutation
- During mutation: checkbox shows spinner (disabled)
- On success: task row fades out (300ms transition), removed from list
- On error: toast "Failed to complete task", row stays
- Keyboard: Space/Enter on focused row completes task
- Long text truncates with ellipsis

**Acceptance Criteria**:
1. Renders task text and checkbox
2. Renders Avatar with person initials when person exists
3. Renders schedule badge with correct icon per destination
4. Renders commitment badge when `from` exists
5. Checkbox click calls complete mutation
6. Checkbox shows spinner during mutation
7. Completed task fades out (300ms)
8. Failed completion shows toast error
9. Space key completes focused task
10. Rapid checkbox clicks don't create duplicate mutations
11. Long task text truncates with ellipsis

---

### Task 11: Frontend Quick Schedule Popup

**Description**: Build the schedule popup for quick date assignment.

**Implementation Details**:
- Click schedule badge → shadcn Popover
- Options: Today / Tomorrow / Pick date / Anytime / Someday
- Date picker: shadcn Calendar (install via `npx shadcn-ui@latest add calendar` if not present)
- On selection → `useUpdateTask()` with new `due` value
- Popup closes after selection; focus returns to trigger badge
- Full keyboard accessibility:
  - Escape closes popup
  - Arrow Up/Down navigate options
  - Enter selects highlighted option
  - Focus trapped within popup
  - `role="listbox"` on popup, `role="option"` on options

**Acceptance Criteria**:
1. Clicking badge opens popover
2. Selecting Today sets due to today's date
3. Selecting Tomorrow sets due to tomorrow's date
4. Selecting Anytime clears due date (`due=null`)
5. Selecting Someday moves to someday destination
6. Escape key closes popover
7. Arrow keys navigate options
8. Enter selects highlighted option
9. Popup closes after selection
10. Focus returns to trigger after close
11. Popup has `role="listbox"`, options have `role="option"`

---

### Task 12: Frontend Today View with Suggestions

**Description**: Build the Today tab with tasks and AI suggestions sections.

**Implementation Details**:
- Top section: "Tasks" — due today + overdue (sorted: overdue first by days desc)
- Bottom section: "Suggested" — from `/api/tasks/suggested`
- Sections load independently (suggestions can fail without breaking tasks)
- Suggestions show skeleton while loading
- Action buttons on suggestions: Set Today / Schedule / Punt
- Toast confirms each action
- Partial failure handling: show error state for failed section, keep other section working

**Acceptance Criteria**:
1. Renders tasks section with overdue sorted first
2. Renders suggestions section separately
3. Suggestions skeleton while loading
4. Tasks visible when suggestions fail
5. Suggestions visible when tasks fail (with tasks error state)
6. Set Today button updates due to today's date
7. Schedule button opens date picker
8. Punt button moves to anytime destination
9. Toast confirms successful action
10. Toast shows error on failed action

---

## Test-First Enforcement

Each task requires TWO commits minimum:
1. `test(task-ui): add tests for <task>` — tests only, must fail or skip
2. `feat(task-ui): implement <task>` — implementation that makes tests pass

**Reviewer Checklist** (enforced per task):
- [ ] Test commit is separate from implementation
- [ ] Tests fail/skip before implementation commit
- [ ] Tests pass after implementation commit
- [ ] Test count matches AC count ± 10%

---

## Out of Scope (V1)

- Creating new tasks from UI
- Editing task text from UI
- Discard action (Phase 2)
- Calendar integration for suggestions
- Drag-and-drop (Phase 2)
- Today + This Evening split

---

## Phase 2 (Separate PRD)

13. Frontend: Upcoming view — group by date, collapse distant dates
14. Frontend: Drag-and-drop — @dnd-kit with keyboard support, optimistic updates
15. Frontend: Waiting On filter — full implementation
16. Discard action — persistence model + UI
