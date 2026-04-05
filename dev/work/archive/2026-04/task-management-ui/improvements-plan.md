# Task Management UI Improvements Plan

## Context

The Task Management UI is functional with core features (Today/Upcoming/Anytime/Someday tabs, task completion, AI suggestions), but testing revealed several bugs and UX gaps that need addressing before release.

**Branch:** `feature/task-management-ui`
**Primary Files:**
- `packages/apps/web/src/components/TodayView.tsx` - Today tab with tasks + suggestions
- `packages/apps/web/src/components/TaskList.tsx` - Reusable task list component
- `packages/apps/web/src/components/SchedulePopup.tsx` - Schedule dropdown (Today/Tomorrow/etc.)
- `packages/apps/web/src/pages/TasksPage.tsx` - Main tabs page
- `packages/apps/web/src/hooks/tasks.ts` - React Query hooks with mutations

---

## Plan:

### 1. [BUG] Fix Cache Invalidation for Suggestions "Set Today"
**Problem:** When clicking "Set Today" on a suggestion, the item appears in Today but also remains in the Suggestions section (duplicate).

**Root Cause Analysis:** The `useUpdateTask` hook invalidates `['tasks']` queries, but suggestions use `['tasks', 'suggested']` query key. Additionally, the backend's suggested endpoint may continue returning the task since it doesn't filter by due date.

**Acceptance Criteria:**
- [ ] After "Set Today" is clicked, the suggestion disappears from the Suggestions section
- [ ] The task appears in the Today tasks section (no duplicate)
- [ ] No flash of stale data during transition
- [ ] Works for both "Set Today" and scheduled dates

**Implementation:**
- Update `useUpdateTask` in `hooks/tasks.ts` to also invalidate `['tasks', 'suggested']`
- Add optimistic update for suggestions removal
- Verify backend `/api/tasks/suggested` filters out tasks with due dates

**Test Requirements:**
- Unit test: mutation invalidates suggestions cache
- Integration test: Set Today removes item from suggestions, adds to Today

---

### 2. [BUG] Fix Suggestions Schedule Button
**Problem:** Schedule button in the Suggestions section doesn't work.

**Root Cause Analysis:** In `TodayView.tsx`, the Schedule button uses a `Popover` with `Calendar`. The `handleSchedule` callback is wired but may not be calling mutation correctly (missing options object or wrong update payload).

**Acceptance Criteria:**
- [ ] Clicking Schedule button opens calendar popup
- [ ] Selecting a date closes popup and updates task due date
- [ ] Task disappears from Suggestions after scheduling
- [ ] Toast confirms "Task scheduled"

**Implementation:**
- Trace `handleSchedule` in `SuggestionRow` component
- Ensure `mutate` call matches pattern used in `handleSetToday`
- Verify calendar `onSelect` event fires correctly

**Test Requirements:**
- Existing test in `TodayView.test.tsx` ("updates task due date when date is selected") - verify it passes
- Add test for Schedule button visibility and interaction

---

### 3. [BUG] Fix Calendar Popup Positioning
**Problem:** Calendar popup appears off-screen or clipped.

**Root Cause Analysis:** The `Popover` from shadcn/ui defaults to `align="center"` with no collision boundary handling. When triggered near screen edges, content overflows.

**Acceptance Criteria:**
- [ ] Calendar popup fully visible regardless of trigger position
- [ ] Popup repositions when near viewport edges (collision detection)
- [ ] Works in both Today view suggestions and TaskList SchedulePopup

**Implementation:**
- In `SchedulePopup.tsx` and `TodayView.tsx`, update `PopoverContent` props:
  ```tsx
  <PopoverContent 
    align="start" 
    side="bottom" 
    sideOffset={4}
    collisionPadding={8}
    avoidCollisions={true}
  />
  ```
- Test in narrow viewport scenarios

**Test Requirements:**
- Manual visual test: open popup near right edge, bottom edge
- Unit test: PopoverContent has collision props configured

---

### 4. [BUG] Fix Someday Tab "Today" Button
**Problem:** From Someday tab, clicking "Today" in SchedulePopup doesn't move the task to Today view.

**Root Cause Analysis:** `SchedulePopup.tsx` sends `{ due: formatDate(getToday()) }` but doesn't set `destination`. Tasks in Someday have `destination: 'someday'` - they need `destination: 'today'` or the backend needs to infer this from due date.

**Acceptance Criteria:**
- [ ] Clicking "Today" from Someday tab moves task to Today view
- [ ] Task no longer appears in Someday tab
- [ ] Clicking "Tomorrow" schedules for tomorrow and shows in Upcoming
- [ ] Pick date with future date shows in Upcoming

**Implementation:**
- Update `SchedulePopup.tsx` `handleSelect` for 'today' case:
  ```tsx
  case 'today':
    mutate({
      id: taskId,
      updates: { due: formatDate(getToday()), destination: 'must' },
    });
  ```
- Consider: should "Tomorrow" also set a destination? Check backend filtering logic.

**Test Requirements:**
- Unit test: Today action sends destination update
- Integration test: task moves from Someday to Today

---

### 5. [BUG] Fix "Upcoming" Tab Not Showing Scheduled Items
**Problem:** After scheduling a task for a future date, it doesn't appear in Upcoming tab.

**Root Cause Analysis:** Need to verify: (1) Backend `/api/tasks?filter=upcoming` includes scheduled tasks, (2) Frontend cache invalidation includes upcoming, (3) Task `destination` is set correctly.

**Acceptance Criteria:**
- [ ] Scheduling a task for tomorrow shows it in Upcoming tab
- [ ] Scheduling for next week shows in Upcoming
- [ ] Task no longer shows in original tab (Someday/Anytime)

**Implementation:**
- Debug backend: check `upcoming` filter query (should be: has `due` date in future, not in past)
- Verify cache invalidation for filter-specific queries
- May need to update `destination` when scheduling

**Test Requirements:**
- API test: `/api/tasks?filter=upcoming` returns tasks with future due dates
- Integration test: schedule from Anytime → verify shows in Upcoming

---

### 6. [BUG] Fix Toast Visibility (Dark Theme)
**Problem:** Toast messages too dark, blend with dark background.

**Root Cause Analysis:** `sonner.tsx` uses `group-[.toaster]:bg-background` which in dark mode is nearly black. Toast needs distinct styling.

**Acceptance Criteria:**
- [ ] Toast messages clearly visible in both light and dark themes
- [ ] Success toasts have appropriate green/positive styling
- [ ] Error toasts have appropriate red/negative styling
- [ ] Sufficient contrast for accessibility (WCAG AA)

**Implementation:**
- Update `sonner.tsx` toastOptions:
  ```tsx
  toastOptions={{
    classNames: {
      toast: "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:shadow-lg",
      success: "group-[.toaster]:bg-green-900/90 group-[.toaster]:text-green-100 group-[.toaster]:border-green-700",
      error: "group-[.toaster]:bg-red-900/90 group-[.toaster]:text-red-100 group-[.toaster]:border-red-700",
    },
  }}
  ```

**Test Requirements:**
- Visual test: verify toast contrast in dark mode
- Consider Storybook story for toast variants

---

### 7. [FEATURE] Enhanced Completion Animation
**Problem:** Task completion is abrupt - no visual feedback before removal.

**Acceptance Criteria:**
- [ ] On complete: checkbox shows checkmark icon (✓)
- [ ] Text grays out / strikes through
- [ ] Row fades out over ~1.5-2 seconds
- [ ] Animation cancellable if user undoes (future: undo toast)

**Implementation:**
In `TaskList.tsx`:
- Add `completedTasks` state tracking recently completed IDs
- Render checkmark icon instead of checkbox when completed
- Apply CSS classes: `line-through text-muted-foreground opacity-50`
- Use CSS transition: `transition-all duration-[1500ms]`
- After animation, task removed by query invalidation

**Test Requirements:**
- Unit test: completing task adds to fadingTasks set
- Unit test: completed row has correct CSS classes
- Visual/integration test: verify animation timing

---

### 8. [FEATURE] Today Completed Tasks Section
**Problem:** After completing Today tasks, no way to see what was done.

**Acceptance Criteria:**
- [ ] "Completed" section appears at bottom of Today view when there are completed tasks
- [ ] Shows tasks completed today only
- [ ] Collapsed by default with count badge, expandable
- [ ] Tasks show strikethrough styling

**Implementation:**
- Add `useTasks('today', { completed: true })` hook or modify endpoint
- Add backend support: `/api/tasks?filter=today&completed=true`
- In `TodayView.tsx`, add collapsible "Completed (N)" section below suggestions

**Test Requirements:**
- API test: filter returns completed tasks
- Unit test: section shows/hides based on completed count
- Unit test: expand/collapse functionality

---

### 9. [FEATURE] Completed Tab
**Problem:** No way to see all completed tasks across time.

**Acceptance Criteria:**
- [ ] "Completed" tab appears after Someday in tab list
- [ ] Shows recently completed tasks (last 7 days by default)
- [ ] Grouped by completion date
- [ ] Option to clear/archive old completed tasks (future)

**Implementation:**
- Add to `TAB_VALUES` in `TasksPage.tsx`: `['today', 'upcoming', 'anytime', 'someday', 'completed']`
- Add backend filter: `/api/tasks?filter=completed`
- Render with date grouping

**Test Requirements:**
- API test: completed filter works
- Unit test: Completed tab appears and fetches correct data
- Unit test: date grouping displays correctly

---

### 10. [FEATURE] Task Schedule Trigger for Today Items
**Problem:** Today tasks have no way to reschedule (push to tomorrow, someday, etc.)

**Acceptance Criteria:**
- [ ] Each Today task shows a small schedule trigger (e.g., "Today" badge with calendar icon)
- [ ] Clicking trigger opens "When?" popup
- [ ] Options: Tomorrow, Pick Date, Anytime, Someday
- [ ] Selecting option updates task and moves to appropriate view

**Implementation:**
Already partially done: `TaskList.tsx` includes `<SchedulePopup>` for each task. Verify it's working in Today context:
- Check if SchedulePopup appears for Today tab tasks
- May need to conditionally show/hide based on tab context
- Ensure mutations work correctly

**Test Requirements:**
- Unit test: SchedulePopup renders for Today tasks
- Integration test: rescheduling Today task to Tomorrow moves it

---

### 11. [FEATURE] Area/Project Tags on Tasks
**Problem:** Tasks don't show their context (which area or project they belong to).

**Acceptance Criteria:**
- [ ] Tasks with `area` show area name as subtle badge
- [ ] Tasks with `project` show project name as subtle badge
- [ ] Tags clickable to filter (future enhancement)
- [ ] Tags don't overflow layout on small screens

**Implementation:**
In `TaskList.tsx`, add after task text:
```tsx
{task.area && (
  <Badge variant="outline" className="text-xs ml-2">
    {task.area}
  </Badge>
)}
{task.project && (
  <Badge variant="outline" className="text-xs ml-2">
    {task.project}
  </Badge>
)}
```

**Test Requirements:**
- Unit test: area badge renders when area exists
- Unit test: project badge renders when project exists
- Unit test: no badges when both null

---

### 12. [DESIGN] Things 3 Style "When?" Dropdown
**Problem:** Current SchedulePopup is functional but not delightful.

**Acceptance Criteria:**
- [ ] Compact dropdown with: Today, Tomorrow, 3-week mini calendar, Someday, Anytime
- [ ] Mini calendar shows current month with navigation
- [ ] Selected date highlighted
- [ ] ">" expand button to show full month view
- [ ] Keyboard navigation (arrow keys, Enter to select)

**Implementation:**
Redesign `SchedulePopup.tsx`:
- Replace list with horizontal layout for quick options
- Add inline 3-week calendar preview (3 rows of days)
- "More dates" button expands to full month
- Style to match Things 3 aesthetic (clean, minimal)

**Test Requirements:**
- Unit tests for all existing SchedulePopup tests continue to pass
- New tests for calendar navigation
- New tests for expand/collapse

---

## Implementation Order (Dependencies)

```
Phase 1: Bug Fixes (Blocking)
├── Task 1: Cache invalidation for suggestions ← Most impactful bug
├── Task 2: Fix Schedule button ← Blocked by Task 1 understanding
├── Task 4: Fix Someday→Today ← Similar mutation issues
└── Task 5: Fix Upcoming tab ← Related to cache/destination logic

Phase 2: Bug Fixes (Polish)
├── Task 3: Calendar positioning ← Independent, low risk
└── Task 6: Toast visibility ← Independent, low risk  

Phase 3: Core Features
├── Task 7: Completion animation ← Foundation for UX
├── Task 10: Schedule trigger for Today ← May already work, verify
└── Task 11: Area/project tags ← Simple additive change

Phase 4: Completed Tasks
├── Task 8: Today completed section ← Requires backend support
└── Task 9: Completed tab ← Extends Task 8 pattern

Phase 5: Design Polish
└── Task 12: Things 3 dropdown ← Extensive redesign, do last
```

---

## Test-First Approach

**Before each task:**
1. Write failing tests that verify the acceptance criteria
2. Run tests to confirm they fail (red)
3. Implement the fix/feature
4. Verify tests pass (green)
5. Refactor if needed

**Existing test files to extend:**
- `TodayView.test.tsx` - Suggestions actions, Today section
- `TaskList.test.tsx` - Completion, scheduling, badges
- `SchedulePopup.test.tsx` - Dropdown behavior, positioning
- `TasksPage.test.tsx` - Tab navigation, filters

**New test files needed:**
- Consider: `hooks/tasks.test.tsx` - mutation side effects
- Consider: API mocks for backend filters

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cache invalidation causes flicker | Medium | Medium | Use optimistic updates with rollback |
| Backend filter logic differs from frontend expectations | Medium | High | Verify API contracts with integration tests |
| Animation performance on large lists | Low | Medium | Use CSS transforms, virtualize if needed |
| Breaking existing tests | Medium | Medium | Run full test suite after each task |

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 | 4 bug fixes | 4-6 hours |
| Phase 2 | 2 polish bugs | 1-2 hours |
| Phase 3 | 3 features | 3-4 hours |
| Phase 4 | 2 features | 4-6 hours (includes backend) |
| Phase 5 | 1 design | 4-6 hours |
| **Total** | **12 tasks** | **16-24 hours** |

