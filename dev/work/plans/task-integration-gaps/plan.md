---
title: Task Integration Gaps
slug: task-integration-gaps
status: building
size: small
steps: 4
---

# Task Integration Gaps

## Problem

The task-management-ui landed TaskService, task scoring, and a web UI. Three integration gaps prevent full connectivity between the task system, meetings, daily planning, and real-time UI updates.

## Analysis

### Gap 1: Meeting -> Task (direct path) — ALREADY SOLVED

After code review, this gap is already fully addressed:
- `approveMeeting()` in `packages/apps/backend/src/services/workspace.ts` (lines 579-771) already creates commitments AND tasks from approved action items
- For `i_owe_them`: creates commitment + task with urgency-based bucket via `inferUrgency()`
- For `they_owe_me`: creates commitment + Waiting On entry in week.md
- Factory wiring in `packages/core/src/factory.ts` already sets up `createTaskFn` on CommitmentsService

**No work needed for Gap 1.**

### Gap 2: Daily plan <-> Today view alignment

The daily-plan skill writes a free-form `## Today` section in week.md. The Task UI Today view shows `@due(today)` items from Must/Should. These don't see each other.

**Solution**: Update the daily-plan skill to:
1. Tag selected priority tasks with `@due(YYYY-MM-DD)` in Must/Should sections
2. Write `## Today` as a generated read-only snapshot referencing those tasks
3. Daily-winddown should clear `@due` tags from previous day's items

### Gap 3: SSE file-change events for tasks

When tasks are completed in the web UI (changing `- [ ]` to `- [x]`), no SSE event fires. The backend has SSE infrastructure (`broadcastSseEvent` in server.ts, `useProcessingEvents` hook in web) but only for `meeting:processed`.

**Solution**: Add a task file watcher and broadcast `task:changed` events. Frontend subscribes and invalidates task-related query caches.

## Steps

### Step 1: Update daily-plan skill to use @due as canonical source
**Files**: `packages/runtime/skills/daily-plan/SKILL.md`
**AC**:
- Skill instructs agent to tag selected tasks with `@due(YYYY-MM-DD)` in Must/Should sections
- `## Today` section is documented as a generated snapshot (read-only)
- References daily-winddown for `@due` cleanup
**Test**: Manual skill review (SKILL.md is an LLM template, not executable code)

### Step 2: Update daily-winddown skill to clear stale @due tags
**Files**: `packages/runtime/skills/daily-winddown/SKILL.md`
**AC**:
- Skill instructs agent to clear `@due` tags from previous day's incomplete items
- Documents the @due lifecycle: set by daily-plan, cleared by daily-winddown
**Test**: Manual skill review

### Step 3: Add task file watcher to backend
**Files**: `packages/apps/backend/src/services/watcher.ts`, `packages/apps/backend/src/index.ts`
**AC**:
- `startTaskFileWatcher()` watches `now/week.md` and `now/tasks.md`
- On change, broadcasts `task:changed` SSE event via `broadcastSseEvent`
- Debounced (500ms) to handle rapid writes
- Uses testDeps injection pattern (consistent with meeting watcher)
- Cleanup function returned and called on SIGTERM/SIGINT
**Test**: Unit tests with mock fs.watch, consistent with watcher.test.ts pattern

### Step 4: Frontend subscribes to task:changed SSE events
**Files**: `packages/apps/web/src/hooks/useProcessingEvents.ts`
**AC**:
- Hook listens for `task:changed` events in addition to `meeting:processed`
- On `task:changed`, invalidates `['tasks']` and `['review']` query keys
- Shows a subtle toast notification
**Test**: Unit test extending existing useProcessingEvents.test.tsx

## Risks

1. **Skill changes are non-testable code** — SKILL.md files are LLM templates. Quality depends on clear instructions.
2. **File watcher on macOS** — `fs.watch` can be noisy. Debouncing mitigates this.
3. **Multiple rapid writes** — Task operations may trigger multiple change events. Debouncing handles this.
