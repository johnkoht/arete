---
title: Task Management Ui
slug: task-management-ui
status: idea
size: tiny
tags: []
created: 2026-03-30T03:35:49.116Z
updated: 2026-03-31T03:18:49.195Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Task Management UI

## Problem

Tasks in markdown files (`now/tasks.md`, `now/week.md`) have verbose inline metadata (`@from(commitment:13b257c8)`) that makes them hard to scan. There's no visual UI for task management — only the raw markdown files.

## Vision

A clean, interactive task management page in the web app (`arete view`) with:
- **Tabs/Filters**: All (grouped by section), Today, Anytime, Someday
- **Task Items**: Checkbox, owner avatar (initials + tooltip), description, due date, age
- **Drag-and-drop**: Move tasks between sections
- **Bulk selection**: Toggle selection mode, multi-select, then Move to / Archive / Mark complete

## Open Questions (awaiting answers)

### 1. "Today" tab definition
What should "Today" show?
- **Option A**: Must + Should (the urgent weekly stuff) ← recommended
- **Option B**: Only tasks with `@due(today)`
- **Option C**: A separate "Today" bucket manually curated each morning

### 2. Owner vs Person semantics
Current `@person(slug)` seems to mean different things:
- In "Waiting On" section = who owes you (their task)
- In Must/Should sections = related person (your task)

Should we distinguish visually? (e.g., their avatar with amber dot = waiting on them)

### 3. Age tracking
To show "how long it's been open":
- **Infer from source**: Parse date from `@from(meeting:slug)` or look up commitment ← recommended for v1
- **Add creation date**: Start adding `@created(YYYY-MM-DD)` to new tasks
- **Skip for now**: Ship without age, add later

### 4. "Archive" action definition
How does Archive differ from Completed or Someday?
- Is it "done but keep for reference"?
- Or "delete/hide permanently"?

### 5. "Waiting On" treatment
week.md has a "Waiting On" section. Should this be:
- A separate tab (All / Today / **Waiting** / Anytime / Someday)
- Visible in All view as its own section
- A toggle filter ("Show tasks I'm waiting on")

## Technical Foundation (discovered)

**Existing services:**
- `TaskService` in `packages/core/src/services/tasks.ts` with: `listTasks`, `addTask`, `completeTask`, `moveTask`, `findTask`, `deleteTask`
- Task destinations: `inbox`, `must`, `should`, `could`, `anytime`, `someday`
- Auto-resolve linked commitments on task completion

**Existing UI patterns:**
- `AvatarStack` component with initials + tooltips
- `CommitmentsPage` as reference for table layout, filters, actions

**Needs to be added:**
- Backend API routes for tasks (`/api/tasks/*`)
- Drag-and-drop library (recommend `@dnd-kit/core`)
- TasksPage component

## Rough Plan (pending answers to open questions)

1. Add Tasks API routes to backend
2. Add drag-and-drop library
3. Build TasksPage with tabs and task list
4. Add drag-and-drop between sections
5. Add bulk selection mode with actions
6. Add to sidebar navigation

**Size estimate**: Medium-Large (5-6 steps)

---

*Status: Awaiting answers to open questions before finalizing plan*