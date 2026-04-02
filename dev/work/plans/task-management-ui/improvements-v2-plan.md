# Task Management UI Improvements v2

## Context

After user testing, several bugs were discovered and UX improvements identified.

**Critical Bugs (blocking functionality):**
- Backend PATCH doesn't handle `due` + `destination` together
- Backend doesn't support `filter=completed`
- Due dates not being saved → Upcoming tab empty

**UX Improvements:**
- Layout: Move person avatar to right side
- Styling: Differentiate my tasks vs delegated
- Edit: Allow assigning area/project to tasks
- Animation: Slow down completion fade (1.5s → 3s)

---

## Phase 1: Critical Backend Fixes

### Task 1: Fix PATCH to Handle `due` + `destination` Together

**Problem**: Backend has `if/else if` logic that only processes ONE of: destination, completed, due.

**File**: `packages/apps/backend/src/routes/tasks.ts`

**Current (broken)**:
```typescript
if (body.destination !== undefined) {
  // Move task — due is IGNORED
} else if (body.completed !== undefined) {
  // Complete
} else if ('due' in body) {
  // Update due — only runs if no destination
}
```

**Fix**: Process destination AND due when both provided:
```typescript
if (body.destination !== undefined || 'due' in body) {
  // Handle move + due date together
  const foundTask = await services.tasks.findTask(id);
  if (body.destination) {
    task = await services.tasks.moveTask(id, body.destination);
  }
  if ('due' in body) {
    task = await services.tasks.updateTask(task?.id ?? id, { due: body.due });
  }
}
```

**ACs**:
- [ ] Sending `{ due: '2026-04-05', destination: 'must' }` updates BOTH fields
- [ ] Sending only `{ destination: 'anytime' }` still works
- [ ] Sending only `{ due: '2026-04-05' }` still works
- [ ] Task appears in correct tab after update

**Tests**:
- Unit: PATCH with due+destination updates both
- Unit: PATCH with only destination moves task
- Unit: PATCH with only due updates date
- Integration: Schedule task for tomorrow → appears in Upcoming

---

### Task 2: Add `completed` Filter to Backend

**Problem**: `validFilters` doesn't include 'completed', causing 400 error.

**File**: `packages/apps/backend/src/routes/tasks.ts`

**Implementation**:
1. Add 'completed' to `validFilters` array
2. Add filter logic:
```typescript
} else if (filterParam === 'completed') {
  // Completed tasks, most recent first
  filteredTasks = allTasks
    .filter(t => t.completed)
    .sort((a, b) => {
      // Sort by completion date descending
      const aDate = a.metadata.completedAt ?? '';
      const bDate = b.metadata.completedAt ?? '';
      return bDate.localeCompare(aDate);
    });
}
```

**ACs**:
- [ ] GET `/api/tasks?filter=completed` returns 200
- [ ] Returns only completed tasks
- [ ] Sorted by completion date (most recent first)
- [ ] Completed tab loads without error

**Tests**:
- Unit: completed filter returns completed tasks
- Unit: completed filter excludes incomplete tasks
- Unit: sorted by completion date

---

### Task 3: Verify End-to-End Scheduling Flow

After Tasks 1 & 2, verify full flow works:
1. Schedule task for tomorrow from Anytime → appears in Upcoming
2. Schedule task for today from Someday → appears in Today
3. Complete task in Today → appears in Completed tab

**ACs**:
- [ ] Tomorrow scheduling: task in Upcoming tab
- [ ] Today scheduling from Someday: task in Today tab
- [ ] Complete: task in Completed tab and Today completed section

---

## Phase 2: Frontend Polish

### Task 4: Move Person Avatar to Right Side

**Files**: `TaskList.tsx`, `TodayView.tsx`

**Layout change**:
```
Before: [checkbox] [avatar] [text] [area] [project] [schedule]
After:  [checkbox] [text] [area] [project] [avatar] [schedule]
```

**ACs**:
- [ ] Avatar appears right of task text, left of schedule trigger
- [ ] Avatar only shows for tasks with assigned person
- [ ] Layout doesn't break on narrow screens

---

### Task 5: Differentiate My Tasks vs Delegated

**Requires**: Know who "me" is. Options:
- A. Read from workspace config (`.arete/config.yaml`)
- B. Accept as prop/context
- C. Hardcode for now, make configurable later

**Styling**:
- My tasks: Normal weight, full opacity
- Delegated: Slightly muted (`opacity-80`), maybe subtle badge "delegated to [Name]"

**ACs**:
- [ ] Tasks I own appear with normal styling
- [ ] Tasks assigned to others appear slightly muted
- [ ] Can tell at a glance which are mine vs delegated

---

### Task 6: Slow Down Completion Animation

**Files**: `TaskList.tsx`, `TodayView.tsx`

**Change**: `duration-[1500ms]` → `duration-[3000ms]`

**ACs**:
- [ ] Fade animation takes ~3 seconds
- [ ] Strikethrough and gray appear immediately
- [ ] Smooth transition, not jarring

---

## Phase 3: Area/Project Assignment

### Task 7: Backend - List Available Areas

**Endpoint**: GET `/api/areas`

**Implementation**:
- Read `areas/` directory
- Parse frontmatter for name, description
- Return list of `{ slug, name }`

**ACs**:
- [ ] Returns list of areas with slug and name
- [ ] Empty list if no areas directory

---

### Task 8: Backend - List Available Projects

**Endpoint**: GET `/api/projects`

**Implementation**:
- Read `projects/` directory
- Parse frontmatter for name, description, status
- Return list of `{ slug, name, status }`

**ACs**:
- [ ] Returns list of projects with slug, name, status
- [ ] Excludes archived/completed projects (optional filter)

---

### Task 9: Core - Update Task Area/Project

**Method**: `TaskService.updateTask(id, { area?, project? })`

**Implementation**:
- Add/update `@area(slug)` tag in task line
- Add/update `@project(slug)` tag in task line
- Handle removal (set to null)

**ACs**:
- [ ] Can add area to task without area
- [ ] Can change existing area
- [ ] Can remove area (set to null)
- [ ] Same for project
- [ ] Existing metadata (@due, @person) preserved

---

### Task 10: Frontend - Area/Project Selector

**Component**: `TaskMetadataEditor` or inline in task row

**UI Options**:
A. Click area/project badge to open dropdown
B. Hover reveals edit button
C. Right-click context menu

**Implementation**:
- Fetch areas/projects via hooks
- Combobox with search
- Update via useUpdateTask mutation

**ACs**:
- [ ] Can assign area from dropdown
- [ ] Can assign project from dropdown
- [ ] Can clear area/project
- [ ] Optimistic update shows immediately
- [ ] Works on tasks without existing area/project

---

## Testing Strategy

### Unit Tests

**Backend (`packages/apps/backend/test/routes/tasks.test.ts`)**:
- PATCH with due+destination: updates both fields
- PATCH with only destination: moves task
- PATCH with only due: updates date
- GET filter=completed: returns completed tasks only
- GET filter=completed: sorted by completion date
- GET /api/areas: returns area list
- GET /api/projects: returns project list

**Core (`packages/core/test/services/tasks.test.ts`)**:
- updateTask with area: adds @area tag
- updateTask with project: adds @project tag
- updateTask with area=null: removes @area tag
- updateTask preserves other metadata

**Frontend (`packages/apps/web/test/`)**:
- TaskList: avatar renders on right side
- TaskList: delegated tasks have muted styling
- TaskList: completion animation duration is 3s
- TaskMetadataEditor: shows area dropdown
- TaskMetadataEditor: selecting area calls mutation

### Integration Tests

**End-to-End Flows**:
1. Schedule task for tomorrow → verify in Upcoming
2. Schedule task for today from Someday → verify in Today
3. Complete task → verify in Completed tab
4. Assign area → verify badge appears
5. Clear area → verify badge removed

### Manual Testing Checklist

- [ ] Schedule from Anytime → Tomorrow → check Upcoming tab
- [ ] Schedule from Someday → Today → check Today tab
- [ ] Complete task in Today → check fade animation (3s)
- [ ] Complete task → check Completed tab loads
- [ ] Verify person avatar on right side
- [ ] Test area/project assignment (when implemented)

---

## Implementation Order

```
Phase 1: Critical Fixes (must do first)
├── Task 1: PATCH due+destination (1-2 hrs)
├── Task 2: completed filter (1 hr)
└── Task 3: E2E verification (0.5 hr)

Phase 2: Frontend Polish (parallel-safe)
├── Task 4: Avatar position (0.5 hr)
├── Task 5: My vs delegated (1 hr)
└── Task 6: Animation timing (0.25 hr)

Phase 3: Area/Project (can defer)
├── Task 7: GET /api/areas (1 hr)
├── Task 8: GET /api/projects (1 hr)
├── Task 9: Core updateTask area/project (2 hrs)
└── Task 10: Frontend selector (2-3 hrs)
```

**Total Estimate**: 10-12 hours

---

## Questions for Review

1. **My tasks identification**: How do we know who "me" is? Config file? Profile slug?
2. **Area/project assignment priority**: Is this Phase 3 work essential for MVP, or can it ship later?
3. **Score display**: Keep showing AI score on suggestions, or hide it?
