---
title: Task Management UI — Phase 2
slug: task-management-ui-phase-2
status: idea
priority: high
size: medium
tags: [web, tasks, ux]
created: 2026-04-04T00:00:00.000Z
updated: 2026-04-04T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Task Management UI — Phase 2

## Context

Phase 1 shipped all 12 steps (+ bonus items) and is live on main. It covers:
- Full CRUD API with file locking and pagination
- AI-powered task suggestions with scoring
- Web UI with 5 tabs (Today/Upcoming/Anytime/Someday/Completed)
- Quick schedule popover, avatar component, error boundaries
- Integration with daily-plan and daily-winddown skills
- SSE events for real-time updates

See archived plan `dev/work/archive/2026-04/task-management-ui/` for full Phase 1 details.

## Outstanding Work

### 1. Drag-and-drop reordering
- Use @dnd-kit with keyboard support
- Optimistic updates on drop
- Reorder within tab + move between destinations (e.g., drag from Anytime → Today)
- Accessibility: keyboard DnD with clear announcements

### 2. Waiting On filter (full implementation)
- Currently a basic filter toggle; needs full implementation
- Filter to tasks with `@from(commitment:*)` across all tabs
- Show commitment context inline (who owes what, days open)
- Quick actions: nudge, mark resolved

### 3. Discard action
- Requires persistence model for discarded tasks (don't delete, mark as discarded)
- UI: swipe-to-discard or explicit button
- Undo support (toast with undo action)
- Discarded tasks recoverable from a "Discarded" view

### 4. Task creation from UI
- Currently out of scope — tasks can only come from markdown files
- Add inline task creation (quick-add input at top of each tab)
- Assign area/project/person during creation
- Write back to correct markdown file based on destination

## Out of Scope
- Today + This Evening split
- Calendar integration for suggestions (separate plan)
- Recurring tasks
