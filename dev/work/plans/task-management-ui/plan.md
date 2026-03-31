---
title: Task Management Ui
slug: task-management-ui
status: idea
size: large
tags: []
created: 2026-03-30T03:35:49.116Z
updated: 2026-03-31T03:55:04.273Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 8
---

# Task Management UI

## Problem

Tasks in markdown files (`now/tasks.md`, `now/week.md`) have verbose inline metadata (`@from(commitment:13b257c8)`) that makes them hard to scan. There's no visual UI for task management — only the raw markdown files.

## Solution

Build a clean, interactive Tasks page in the web app (`arete view`) inspired by Things 3, with tabs, quick scheduling, drag-and-drop, and intelligence-driven suggestions.

## Design Decisions

### Tab Structure

| Tab | Content |
|-----|---------|
| **Today** | Due today + overdue (top), AI-suggested priorities (bottom) |
| **Upcoming** | Future dated tasks grouped by date (see format below) |
| **Anytime** | Backlog with no date |
| **Someday** | On hold, maybe never |
| **Waiting On** | Filter showing tasks/commitments others owe you |

### Upcoming View Format
```
31 Tomorrow
- [ ] Task 1
- [ ] Task 2

1 Wednesday  
- [ ] Task 1

2 Thursday
- [ ] Task 1

April 7-30 (collapsed)
May (collapsed)
June (collapsed)
...
```

### Task Line Item
- **Checkbox** — complete task
- **Avatar** — initials with tooltip (person related to task)
- **Description** — task text
- **Schedule badge** — shows current bucket/date:
  - ⭐ Today
  - 📅 Apr 1 (specific date)
  - 🔄 Anytime  
  - 📦 Someday
- **Click badge** → Quick schedule popup: Today / Tomorrow / Date picker / Anytime / Someday
- **Commitment info** — if linked, show "High priority, 14 days open"

### Today's "Suggested" Section
Real tasks surfaced by intelligence. User can:
- Set due today
- Schedule for future date
- Punt to Anytime/Someday
- Discard (hide from suggestions)

Suggestion signals (V1, simple heuristic):
- Tasks linked to today's meetings (by person)
- High-priority commitments aging >7 days
- Oldest tasks in Anytime

### Must/Should/Could Buckets
**Decision: Keep for now** — retain existing buckets during testing. Document that we may remove them if the new date-based model works well. The current weekly structure in `week.md` remains valid; UI can read/write to these sections.

**Future consideration**: If date-based scheduling proves sufficient, deprecate Must/Should/Could in favor of pure GTD (Today/Anytime/Someday) + smart suggestions.

## Technical Foundation

**Existing:**
- `TaskService` with `listTasks`, `addTask`, `completeTask`, `moveTask`, `deleteTask`
- Destinations: `inbox`, `must`, `should`, `could`, `anytime`, `someday`
- `AvatarStack` component
- `CommitmentsPage` as UI reference

**Needs:**
- Backend routes: `/api/tasks/*`
- Drag-and-drop: `@dnd-kit/core`
- Task model updates: ensure `@due(YYYY-MM-DD)` is fully supported
- Suggestion logic in backend (meeting context + commitment priority)

## Out of Scope (V1)

- Today + This Evening split (Phase 2)
- Magic Plus draggable add button (Phase 2)
- Multi-select with swipe gesture (Phase 2)
- Calendar events displayed in Today (fast follow)
- Creating new tasks from UI (use existing markdown/skills)
- Editing task text from UI

## Risks

1. **Task model mismatch**: Current model uses buckets (must/should/could), new model emphasizes dates. May need migration or dual support.
2. **Suggestion quality**: Simple heuristics may surface irrelevant tasks. Start conservative.
3. **Drag-and-drop complexity**: Cross-section drag with different data sources (tasks vs commitments in Waiting On).

---

Plan:

1. **Backend: Tasks API routes**
   - GET /api/tasks (list with filters: destination, due date range, person)
   - POST /api/tasks (create)
   - PATCH /api/tasks/:id (update: complete, move, reschedule)
   - DELETE /api/tasks/:id
   - GET /api/tasks/suggested (today's suggestions based on meetings + commitments)
   - AC: All CRUD operations work, tests pass

2. **Frontend: TasksPage shell with tabs**
   - Add route /tasks to App.tsx
   - Add to sidebar navigation
   - Implement tab navigation: Today, Upcoming, Anytime, Someday
   - Waiting On as filter toggle
   - AC: Can navigate between tabs, empty states shown

3. **Frontend: Task list with line items**
   - Task row: checkbox, avatar, description, schedule badge
   - Show commitment info if linked (priority, age)
   - Complete task on checkbox click (auto-resolve linked commitment)
   - AC: Tasks display correctly, completion works

4. **Frontend: Quick schedule popup**
   - Click schedule badge → popup with: Today / Tomorrow / Date picker / Anytime / Someday
   - Update task on selection
   - AC: Can reschedule any task via popup

5. **Frontend: Today view with suggestions**
   - Top section: Due today + overdue
   - Bottom section: Suggested tasks
   - Suggested tasks show action buttons (Set Today / Schedule / Punt / Discard)
   - AC: Suggestions appear, actions work

6. **Frontend: Upcoming view**
   - Group tasks by date
   - Show day number + weekday name
   - Collapse distant dates (rest of month, future months)
   - AC: Future tasks grouped correctly

7. **Frontend: Drag-and-drop between sections**
   - Install @dnd-kit/core
   - Drag task from one section to another (e.g., Anytime → Today)
   - Update task destination on drop
   - AC: Can drag tasks between sections, persists correctly

8. **Frontend: Waiting On filter**
   - Filter toggle shows tasks/commitments where others owe you
   - Display person avatar prominently
   - AC: Filter shows correct items

---

**Size**: Large (8 steps)

**Recommendation**: Run `/pre-mortem` before execution. Consider splitting into two phases:
- Phase 1 (steps 1-5): Core functionality, shippable
- Phase 2 (steps 6-8): Upcoming view, drag-and-drop, Waiting On

## Phase 2 Ideas (documented for later)
- Today + This Evening split
- Magic Plus (draggable add button)
- Multi-select with swipe gesture
- Calendar events in Today view
- Remove Must/Should/Could buckets if date-based model proves sufficient