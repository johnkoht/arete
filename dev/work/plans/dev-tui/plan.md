---
title: Dev Tui
slug: dev-tui
status: draft
size: small
tags: []
created: 2026-03-01T05:13:47.559Z
updated: 2026-03-01T05:14:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

# Dev TUI Enhancements

## Problem
During Areté development, the Pi TUI lacks persistent visual context about the active plan and build progress. The footer status line is compact but easy to miss. During `/build`, PRD-based task progress only shows in the footer — there's no at-a-glance task list visible near the input area.

## Size: Small (3 steps)

## Plan:

### 1. Custom header showing active plan context
**What**: Replace Pi's default header with a custom header that shows the current plan name, status, and key info when plan mode or build mode is active. Fall back to default header when no plan is active.

**Details**:
- Use `ctx.ui.setHeader()` in `session_start` event
- Show: Plan title, status (`idea → draft → planned → building → complete`), size, gate checkboxes
- During `/build`: show plan title + progress (task count)
- When no plan is active: restore the default Pi header (`setHeader(undefined)`)
- Header should update when plan state changes (hook into existing `updateStatus()`)

**Acceptance Criteria**:
- [ ] Header displays plan title, status, and size when a plan is open
- [ ] Header updates when status transitions (e.g., `draft → planned → building`)
- [ ] Header shows build progress during execution mode
- [ ] Default Pi header restores when no plan is active
- [ ] Theme colors used consistently (accent for title, muted for metadata)

### 2. Enhanced build task list widget
**What**: Expand the existing todo widget to show PRD task progress during `/build`, not just todo-based plans. Currently the widget only shows todo items — PRD-based builds only show progress in the footer.

**Details**:
- Extend `renderTodoWidget()` in `widget.ts` to also handle PRD tasks from `execution-progress.ts`
- Show task list with status indicators: `☐ pending`, `⏳ in_progress`, `☑ complete`
- Use `ctx.ui.setWidget("plan-tasks", lines)` positioned above the editor (default placement)
- Include current task highlighting (bold or accent color for the active task)
- Cap visible lines (e.g., show 6 tasks max with scroll indicator if more)

**Acceptance Criteria**:
- [ ] PRD-based builds show task list widget above editor (not just footer)
- [ ] Each task shows status icon: `☐` pending, `⏳` in_progress, `☑` complete
- [ ] Current task is visually highlighted
- [ ] Widget updates after each turn (`turn_end` event)
- [ ] Long task lists are capped with a count indicator (e.g., `+3 more`)
- [ ] Todo-based builds continue to work as before

### 3. Tests for new widget rendering
**What**: Add tests for the new header rendering and enhanced task widget.

**Details**:
- Add tests to `widget.test.ts` for PRD task list rendering
- Test header rendering for each plan state (no plan, plan mode, build mode, complete)
- Test task list truncation and status icon rendering

**Acceptance Criteria**:
- [ ] Tests cover PRD task rendering (pending, in_progress, complete states)
- [ ] Tests cover header content for each plan lifecycle state
- [ ] Tests cover task list truncation when > max visible tasks
- [ ] All existing widget tests continue to pass
- [ ] `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` passes

## Out of Scope
- **Split-pane scrolling** (fixed input + scrollable response) — requires Pi core TUI changes, not extension work
- **Custom footer changes** — the existing footer status is sufficient and well-tested
- **Build mode tool restrictions** — plan mode already handles this via prompt guidance

## Risks
- **Header real estate**: Takes vertical space. On small terminals, could push content off-screen. Mitigation: keep to 1-2 lines max, clear when no plan active.
- **Widget clutter**: Header AND widget above editor could feel like too much chrome. Mitigation: only show task widget during build mode, not during planning.
- **State sync**: Header needs to update in sync with plan state transitions. Mitigation: hook into existing `updateStatus()` call.
