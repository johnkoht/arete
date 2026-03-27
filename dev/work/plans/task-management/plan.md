---
title: Task Management
slug: task-management
status: building
size: large
tags: [tasks, commitments, planning, web-app]
created: 2026-03-27T05:24:53.863Z
updated: 2026-03-27T22:30:00.000Z
completed: null
execution: dev/executions/task-management/
has_review: true
has_pre_mortem: true
has_prd: true
steps: 18
---

# Task Management System

## Goal

Unify task and commitment management into a single system with GTD buckets, intelligent agent selection, and interactive UI for review/approval.

## Context

Tasks and commitments are currently created in multiple places with no single source of truth. Weekly/daily planning creates tasks locally. Meeting processing creates commitments separately. No inbox for quick capture. Agents can't intelligently select tasks.

## Persona Council Summary

- **Harvester**: Needs zero-friction inbox, async triage, silent commitment resolution. Won't use Review UI.
- **Architect**: Wants metadata, traceability, scoring transparency. Will use everything.
- **Preparer**: Cares about output quality. Task scoring must show meeting relevance + relationship context.

**Key decisions**: Triage must be skippable. Review UI is opt-in. Scoring shows reasons. Commitment resolution is silent.

## Task Location Mental Model

| Location | Contents | When used |
|----------|----------|-----------|
| `week.md ## Inbox` | Quick capture, unsorted | Anytime during the week |
| `week.md ## Tasks` | Must/Should/Could | Active this week |
| `week.md ## Waiting On` | they_owe_me items | Populated from commitments |
| `tasks.md ## Anytime` | Ready when capacity | Pulled into week during planning |
| `tasks.md ## Someday` | Ideas, might-do | Monthly review |

**Plan:**

### Phase 1: Core Task System

1. **Create Task Store Structure** — Create `now/tasks.md` with GTD buckets (Anytime, Someday). Task format supports `@area()`, `@project()`, `@person()`, `@from()`, `@due()` metadata.
   - Template with `## Anytime` and `## Someday` sections
   - Task format: `- [ ] Description @area(slug) @project(slug) @person(slug) @from(type:id) @due(date)`
   - `arete install` creates empty `now/tasks.md`
   - `arete update` adds file to existing workspaces if missing
   - Tasks without metadata work (plain `- [ ] Task`)
   - Documentation: clear mental model of where tasks live (week.md = this week, tasks.md = later)

2. **Update week.md Structure** — Add Inbox and Waiting On sections, rename Outcomes to Weekly Priorities. Structure: Weekly Priorities, Today, Inbox, Tasks (Must/Should/Could), Waiting On, Daily Progress.
   - Sections: Weekly Priorities, Today, Inbox, Tasks (Must/Should/Could), Waiting On, Daily Progress
   - Inbox accepts plain text (Harvester path — agent infers metadata later)
   - Waiting On format: `- [ ] Person: What they owe @person(slug) @from(commitment:id)`
   - Backward compatible: existing `## Outcomes` reads as Weekly Priorities
   - Missing sections created on first use

3. **Create TaskService in Core** — Service for reading/writing tasks with metadata parsing. Methods: `listTasks()`, `addTask()`, `completeTask()`, `moveTask()`.
   - `listTasks(options?)` — filter by area/project/person/due, reads both files
   - `addTask(task, destination)` — adds to specified section
   - `completeTask(taskId)` — marks done, returns linked commitment ID
   - `moveTask(taskId, destination)` — moves between sections/files
   - Metadata parsing extracts all `@tag(value)` into typed fields
   - Entity inference: "rollout strategy" → project:rollout-strategy
   - If inference ambiguous, returns `needsClarification: true` with candidates
   - Unit tests for CRUD, metadata parsing, cross-file reads

4. **Link Commitments to Tasks** — When `i_owe_them` commitment created, also create linked task with `@from(commitment:id)`. Completing task auto-resolves commitment.
   - `CommitmentsService.create()` accepts `createTask: boolean` (default: true for i_owe_them)
   - Task includes `@from(commitment:id)` reference
   - `they_owe_me` → NO task created (goes to Waiting On)
   - Task completion auto-resolves linked commitment (NO PROMPT — Harvester requirement)
   - If ambiguous commitment match → return `needsConfirmation: true`
   - Unit tests for create-with-task, complete-resolves-commitment

5. **Update process-meetings for Task Creation** — Meeting approval creates commitments + tasks together. Task inherits area from meeting, person from counterparty.
   - Approved `i_owe_them` → commitment + task (linked)
   - Approved `they_owe_me` → commitment + Waiting On entry
   - Task inherits `@area()` from meeting, `@person()` from counterparty, `@due()` if mentioned
   - Urgency inference: "urgent/this week" → Must; "important" → Should; "when you can" → Anytime
   - If urgency unclear, agent asks (but doesn't block — can default to Should)

### Phase 2: Planning Skills Integration

6. **Update week-plan to Pull from Task Store** — Week planning pulls existing tasks from tasks.md (Anytime) and commitments instead of creating from scratch.
   - Gathers: tasks.md (Anytime), commitments without linked tasks, carryover from last week
   - Presents candidates grouped by source
   - User selects Must/Should/Could destinations
   - Selected tasks MOVED (not copied) from tasks.md → week.md
   - Dedup: if task text exists in week.md, skip
   - Asks about remaining Anytime: "Leave or move to Someday?"

7. **Update daily-plan with Task Scoring** — Smart task selection using scoring algorithm (due date + commitment weight + meeting relevance + week priority). LLM reasoning suggests 3-5 tasks.
   - Scoring: due date (0-40), commitment weight (0-25), meeting relevance (0-20), week priority (0-15)
   - Relationship health modifier: needs_attention person → +10
   - Today's meetings: task relates to attendee/area → +20 ("prep for X")
   - Time fit: deep work penalized if <2hrs focus available
   - SCORING TRANSPARENCY (Architect/Preparer requirement): show brief reason per task
   - LLM layer: top candidates + context → recommend 3-5 with explanations
   - User confirms/adjusts recommendations

8. **Add Inbox Processing to Daily Winddown** — Process `week.md ## Inbox` items during triage. Infer area/project/person, recommend destination.
   - Reads `week.md ## Inbox`
   - For each item: parse text, infer metadata, recommend destination
   - Destinations: Must/Should/Could, Anytime/Someday, Create Commitment
   - TRIAGE MUST BE SKIPPABLE (Harvester requirement): high confidence → auto-place; low confidence → leave in inbox
   - On confirmation: move items, add metadata, clear inbox
   - "Skip" → item stays in inbox for next triage

### Phase 3: Pull In Winddown Skills

9. **Pull daily-winddown into Areté** — Copy from arete-reserv to `packages/runtime/skills/daily-winddown/`. Update to use new task system.
   - Copy to `packages/runtime/skills/daily-winddown/`
   - Update Phase 3b triage to use new destinations
   - Add inbox processing step (Step 8 logic)
   - Use TaskService for task creation (not direct writes)
   - Use linked commitments
   - Remove workspace-specific refs (Krisp → generic recording pull)
   - Add to AGENTS.md skills index

10. **Pull weekly-winddown into Areté (local-only)** — Copy from arete-reserv, remove ALL Notion references. Use local files only: week.md, tasks.md, goals/, commitments.
    - Copy to `packages/runtime/skills/weekly-winddown/`
    - Remove "Subagent: Pull Notion state" from Phase 1
    - Remove "Push review to Notion" from Phase 5
    - Remove all `arete notion` commands
    - Replace with local reads: week.md, tasks.md, goals/*.md, commitments
    - Thread arcs use `arete search --timeline` (local memory)
    - Context health checks local files
    - Weekly review writes to week.md
    - Add to AGENTS.md skills index

### Phase 4: Interactive Review UI

11. **Create /review Page in Web App** — Aggregated review page showing all pending tasks, staged decisions/learnings, commitments to create. Quick approve/skip controls.
    - Route `/review` in web app
    - Sections: Tasks to Create, Decisions & Learnings, Commitments
    - Per-item: Approve / Skip / Edit controls
    - Task destination selector dropdown (Must/Should/Could/Anytime/Someday)
    - Bulk actions: Approve All, Skip All
    - "Done Reviewing" button (prominent)
    - MUST BE FAST (Preparer requirement): <30 seconds to complete typical triage
    - Loading state, empty state with dashboard link

12. **Add --path and --wait Flags to arete view** — `arete view --path /review` opens specific route. `arete view --wait` blocks until completion signal.
    - `arete view --path /review` opens browser to that route
    - `arete view --wait` creates `.arete/.review-session-{uuid}`, blocks until completion
    - Session file: `{ sessionId, createdAt, status: "pending" }`
    - Polls every 500ms for `.arete/.review-complete-{sessionId}`
    - `--timeout <seconds>` (default 300), returns `{ timedOut: true }` on timeout
    - `--json --wait` returns structured result

13. **Implement File-Based Completion Signal** — Backend `POST /api/review/complete` writes `.arete/.review-complete-{session}` file. CLI detects and returns.
    - `POST /api/review/complete` endpoint
    - Request: `{ sessionId, approvedItems, skippedItems }`
    - Writes `.arete/.review-complete-{sessionId}` with summary JSON
    - CLI reads, returns to agent, deletes session + complete files
    - Validates sessionId matches active session

14. **Integrate Review UI into Daily Winddown** — After meeting processing, run `arete view --path /review --wait`. Agent continues after completion.
    - After meeting processing, if staged items exist:
    - REVIEW UI IS OPT-IN (Harvester requirement): check skill config or flag
    - If enabled: `arete view --path /review --wait --timeout 300`
    - On completion: read approved items, continue with creation
    - On timeout: notify user, offer CLI triage
    - If no staged items: skip UI
    - FALLBACK PATH (Harvester path): if UI disabled or fails, use CLI triage in terminal

## Out of Scope

- Notion integration (explicitly removed)
- Task dependencies/blocking relationships
- Recurring tasks
- Task history/analytics dashboard
- Mobile UI

## Risks

- **Large scope (14 steps)** — Mitigate by building phase by phase
- **Skill migration** — daily-winddown/weekly-winddown may have workspace-specific refs
- **Backward compatibility** — Existing week.md files need to work
- **File signal race conditions** — Need proper session ID handling

