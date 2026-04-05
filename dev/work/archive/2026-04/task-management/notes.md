# Task Management — Expanded Acceptance Criteria

## Persona Council Summary

- **Harvester**: Needs zero-friction inbox, async triage, silent commitment resolution. Won't use Review UI.
- **Architect**: Wants metadata, traceability, scoring transparency. Will use everything.
- **Preparer**: Cares about output quality. Task scoring must show meeting relevance + relationship context.

**Key decisions**: Triage must be skippable. Review UI is opt-in. Scoring shows reasons. Commitment resolution is silent.

---

## Phase 1: Core Task System

### 1. Create Task Store Structure

- [ ] Template with `## Anytime` and `## Someday` sections
- [ ] Task format: `- [ ] Description @area(slug) @project(slug) @person(slug) @from(type:id) @due(date)`
- [ ] `arete install` creates empty `now/tasks.md`
- [ ] `arete update` adds file to existing workspaces if missing
- [ ] Tasks without metadata work (plain `- [ ] Task`)
- [ ] Documentation: clear mental model of where tasks live (week.md = this week, tasks.md = later)

### 2. Update week.md Structure

- [ ] Sections: Weekly Priorities, Today, Inbox, Tasks (Must/Should/Could), Waiting On, Daily Progress
- [ ] Inbox accepts plain text (Harvester path — agent infers metadata later)
- [ ] Waiting On format: `- [ ] Person: What they owe @person(slug) @from(commitment:id)`
- [ ] Backward compatible: existing `## Outcomes` reads as Weekly Priorities
- [ ] Missing sections created on first use

### 3. Create TaskService in Core

- [ ] `listTasks(options?)` — filter by area/project/person/due, reads both files
- [ ] `addTask(task, destination)` — adds to specified section
- [ ] `completeTask(taskId)` — marks done, returns linked commitment ID
- [ ] `moveTask(taskId, destination)` — moves between sections/files
- [ ] Metadata parsing extracts all `@tag(value)` into typed fields
- [ ] Entity inference: "rollout strategy" → project:rollout-strategy (Architect gets explicit, Harvester gets magic)
- [ ] If inference ambiguous, returns `needsClarification: true` with candidates
- [ ] Unit tests for CRUD, metadata parsing, cross-file reads

### 4. Link Commitments to Tasks

- [ ] `CommitmentsService.create()` accepts `createTask: boolean` (default: true for i_owe_them)
- [ ] Task includes `@from(commitment:id)` reference
- [ ] `they_owe_me` → NO task created (goes to Waiting On)
- [ ] Task completion auto-resolves linked commitment (**NO PROMPT** — Harvester requirement)
- [ ] If ambiguous commitment match → return `needsConfirmation: true`
- [ ] Unit tests for create-with-task, complete-resolves-commitment

### 5. Update process-meetings for Task Creation

- [ ] Approved `i_owe_them` → commitment + task (linked)
- [ ] Approved `they_owe_me` → commitment + Waiting On entry
- [ ] Task inherits `@area()` from meeting, `@person()` from counterparty, `@due()` if mentioned
- [ ] Urgency inference: "urgent/this week" → Must; "important" → Should; "when you can" → Anytime
- [ ] If urgency unclear, agent asks (but doesn't block — can default to Should)

---

## Phase 2: Planning Skills Integration

### 6. Update week-plan to Pull from Task Store

- [ ] Gathers: tasks.md (Anytime), commitments without linked tasks, carryover from last week
- [ ] Presents candidates grouped by source
- [ ] User selects Must/Should/Could destinations
- [ ] Selected tasks MOVED (not copied) from tasks.md → week.md
- [ ] Dedup: if task text exists in week.md, skip
- [ ] Asks about remaining Anytime: "Leave or move to Someday?"

### 7. Update daily-plan with Task Scoring

- [ ] Scoring: due date (0-40), commitment weight (0-25), meeting relevance (0-20), week priority (0-15)
- [ ] Relationship health modifier: needs_attention person → +10
- [ ] Today's meetings: task relates to attendee/area → +20 ("prep for X")
- [ ] Time fit: deep work penalized if <2hrs focus available
- [ ] **SCORING TRANSPARENCY** (Architect/Preparer requirement): show brief reason per task
  - Example: "Send API docs to Sarah — due today, meeting with Sarah at 2pm, relationship needs attention"
- [ ] LLM layer: top candidates + context → recommend 3-5 with explanations
- [ ] User confirms/adjusts recommendations

### 8. Add Inbox Processing to Daily Winddown

- [ ] Reads `week.md ## Inbox`
- [ ] For each item: parse text, infer metadata, recommend destination
- [ ] Destinations: Must/Should/Could, Anytime/Someday, Create Commitment
- [ ] If inference unclear, ask — but **TRIAGE MUST BE SKIPPABLE** (Harvester requirement)
  - No response in 10 seconds → proceed with defaults
  - High confidence → auto-place; Low confidence → leave in inbox
- [ ] On confirmation: move items, add metadata, clear inbox
- [ ] "Skip" → item stays in inbox for next triage

---

## Phase 3: Pull In Winddown Skills

### 9. Pull daily-winddown into Areté

- [ ] Copy to `packages/runtime/skills/daily-winddown/`
- [ ] Update Phase 3b triage to use new destinations
- [ ] Add inbox processing step (Step 8 logic)
- [ ] Use TaskService for task creation (not direct writes)
- [ ] Use linked commitments
- [ ] Remove workspace-specific refs (Krisp → generic recording pull)
- [ ] Add to AGENTS.md skills index

### 10. Pull weekly-winddown into Areté (local-only)

- [ ] Copy to `packages/runtime/skills/weekly-winddown/`
- [ ] Remove "Subagent: Pull Notion state" from Phase 1
- [ ] Remove "Push review to Notion" from Phase 5
- [ ] Remove all `arete notion` commands
- [ ] Replace with local reads: week.md, tasks.md, goals/*.md, commitments
- [ ] Thread arcs use `arete search --timeline` (local memory)
- [ ] Context health checks local files
- [ ] Weekly review writes to week.md
- [ ] Add to AGENTS.md skills index

---

## Phase 4: Interactive Review UI

### 11. Create /review Page in Web App

- [ ] Route `/review` in web app
- [ ] Sections: Tasks to Create, Decisions & Learnings, Commitments
- [ ] Per-item: Approve / Skip / Edit controls
- [ ] Task destination selector dropdown (Must/Should/Could/Anytime/Someday)
- [ ] Bulk actions: Approve All, Skip All
- [ ] "Done Reviewing" button (prominent)
- [ ] **MUST BE FAST** (Preparer requirement): <30 seconds to complete typical triage
- [ ] Loading state, empty state with dashboard link

### 12. Add --path and --wait Flags to arete view

- [ ] `arete view --path /review` opens browser to that route
- [ ] `arete view --wait` creates `.arete/.review-session-{uuid}`, blocks until completion
- [ ] Session file: `{ sessionId, createdAt, status: "pending" }`
- [ ] Polls every 500ms for `.arete/.review-complete-{sessionId}`
- [ ] `--timeout <seconds>` (default 300), returns `{ timedOut: true }` on timeout
- [ ] `--json --wait` returns structured result

### 13. Implement File-Based Completion Signal

- [ ] `POST /api/review/complete` endpoint
- [ ] Request: `{ sessionId, approvedItems, skippedItems }`
- [ ] Writes `.arete/.review-complete-{sessionId}` with summary JSON
- [ ] CLI reads, returns to agent, deletes session + complete files
- [ ] Validates sessionId matches active session

### 14. Integrate Review UI into Daily Winddown

- [ ] After meeting processing, if staged items exist:
  - [ ] **REVIEW UI IS OPT-IN** (Harvester requirement): check skill config or flag
  - [ ] If enabled: `arete view --path /review --wait --timeout 300`
  - [ ] On completion: read approved items, continue with creation
  - [ ] On timeout: notify user, offer CLI triage
- [ ] If no staged items: skip UI
- [ ] **FALLBACK PATH** (Harvester path): if UI disabled or fails, use CLI triage in terminal
- [ ] CLI triage presents items, collects approvals, continues

---

## Additional Notes

### Task Location Mental Model

| Location | Contents | When used |
|----------|----------|-----------|
| `week.md ## Inbox` | Quick capture, unsorted | Anytime during the week |
| `week.md ## Tasks` | Must/Should/Could | Active this week |
| `week.md ## Waiting On` | they_owe_me items | Populated from commitments |
| `tasks.md ## Anytime` | Ready when capacity | Pulled into week during planning |
| `tasks.md ## Someday` | Ideas, might-do | Monthly review |

### Deferred to v2

- Task history/analytics (Architect will ask)
- Task dependencies/blocking
- Recurring tasks
