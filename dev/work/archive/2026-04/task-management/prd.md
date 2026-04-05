# PRD: Task Management System

## Goal

Unify task and commitment management into a single system with GTD buckets, intelligent agent selection, and interactive UI for review/approval. Reduce PM friction by providing zero-friction inbox capture (Harvester), scoring transparency (Architect), and fast triage (<30s, Preparer).

## Memory Context

- **Week.md reconciliation exists** — Reuse Jaccard matching pattern from `meeting-extraction.ts` for task dedup (threshold 0.6 for abbreviated text)
- **Commitments already link to goals** — Follow `goalSlug` linking pattern with numbered list selection UX
- **Services use StorageAdapter** — TaskService must NOT use direct `fs` calls; inject `StorageAdapter`
- **CLI: established patterns** — Match existing UX (numbered lists, checkboxes) from `arete meeting approve` and `arete calendar`

## Pre-Mortem Mitigations Applied

- **R2 (Backward compatibility)**: week.md reads both `## Outcomes` and `## Weekly Priorities`; sections created on first use
- **R3 (Commitment-task linkage)**: Use transactional create; add rollback on failure; test orphan detection
- **R5 (Scoring fragility)**: Pure scoring functions; test each dimension; show breakdown in output
- **R7 (Metadata parsing)**: Define grammar; handle malformed input gracefully

---

## Phase 1: Core Task System

### Task 1: Create Task Store Structure

Create `now/tasks.md` with GTD buckets. Define task format with metadata tags.

**Files to modify:**
- `packages/runtime/templates/workspace/now/tasks.md` (new)
- `packages/cli/src/commands/install.ts` — add tasks.md to workspace creation
- `packages/cli/src/commands/update.ts` — add tasks.md to existing workspaces if missing

**Acceptance Criteria:**
- [ ] Template at `packages/runtime/templates/workspace/now/tasks.md` with `## Anytime` and `## Someday` sections
- [ ] Task format documented: `- [ ] Description @area(slug) @project(slug) @person(slug) @from(type:id) @due(date)`
- [ ] `arete install` creates `now/tasks.md` in new workspaces
- [ ] `arete update` adds file to existing workspaces if missing (preserve existing content)
- [ ] Tasks without metadata work (plain `- [ ] Task` is valid)
- [ ] Unit tests for install/update behavior

**Depends on:** None

---

### Task 2: Update week.md Structure

Add Inbox, Waiting On sections. Rename Outcomes to Weekly Priorities. Support backward compatibility.

**Files to modify:**
- `packages/runtime/templates/workspace/now/week.md`
- `packages/core/src/services/week.ts` (if exists) or document format in LEARNINGS.md

**Acceptance Criteria:**
- [ ] week.md template has sections: Weekly Priorities, Today, Inbox, Tasks (Must/Should/Could), Waiting On, Daily Progress
- [ ] Inbox accepts plain text (no metadata required)
- [ ] Waiting On format: `- [ ] Person: What they owe @person(slug) @from(commitment:id)`
- [ ] Backward compatible: reading code handles both `## Outcomes` and `## Weekly Priorities`
- [ ] Missing sections created on first use (not required to exist)
- [ ] Document section semantics in `now/LEARNINGS.md` or similar

**Depends on:** None (can run parallel with Task 1)

---

### Task 3: Create TaskService in Core

Core service for task CRUD with metadata parsing. Follows `StorageAdapter` pattern (no direct fs).

**Files to create/modify:**
- `packages/core/src/services/tasks.ts` (new)
- `packages/core/src/services/index.ts` — export TaskService
- `packages/core/src/factory.ts` — add to AreteServices
- `packages/core/test/services/tasks.test.ts` (new)

**Acceptance Criteria:**
- [ ] `TaskService` class with constructor accepting `StorageAdapter` and workspace paths
- [ ] `listTasks(options?)` — filter by area/project/person/due; reads both `tasks.md` and `week.md`
- [ ] `addTask(task, destination)` — adds to specified section (Inbox, Must, Should, Could, Anytime, Someday)
- [ ] `completeTask(taskId)` — marks done, returns linked commitment ID if present
- [ ] `moveTask(taskId, destination)` — moves between sections/files
- [ ] Metadata parsing extracts all `@tag(value)` into typed `TaskMetadata` fields
- [ ] Returns `needsClarification: true` with candidates if entity inference ambiguous
- [ ] Unit tests for: CRUD, metadata parsing, cross-file reads, edge cases (no metadata, malformed @tags)
- [ ] No direct `fs` calls — all I/O through StorageAdapter

**Depends on:** Tasks 1, 2 (needs file structure)

---

### Task 4: Link Commitments to Tasks

When `i_owe_them` commitment created, also create linked task. Completing task auto-resolves commitment (silently per Harvester requirement).

**Files to modify:**
- `packages/core/src/services/commitments.ts` — add `createTask: boolean` option
- `packages/core/src/services/tasks.ts` — add `@from(commitment:id)` handling
- `packages/core/test/services/commitments.test.ts` — add linking tests
- `packages/core/test/services/tasks.test.ts` — add commitment resolution tests

**Acceptance Criteria:**
- [ ] `CommitmentsService.create()` accepts `createTask: boolean` (default: true for `i_owe_them`)
- [ ] Created task includes `@from(commitment:id)` reference pointing to commitment hash
- [ ] `they_owe_me` commitments do NOT create tasks (go to Waiting On via separate flow)
- [ ] `TaskService.completeTask()` auto-resolves linked commitment (NO PROMPT — Harvester requirement)
- [ ] If ambiguous commitment match, return `needsConfirmation: true` with candidates
- [ ] Transactional: if task creation fails, commitment creation rolls back
- [ ] Unit tests for: create-with-task, complete-resolves-commitment, orphan detection, rollback

**Depends on:** Task 3 (needs TaskService)

---

### Task 5: Update process-meetings for Task Creation

Meeting approval creates commitments + tasks together. Apply urgency inference for bucket placement.

**Files to modify:**
- `packages/core/src/services/meeting-processing.ts`
- `packages/cli/src/commands/meeting.ts` — ensure task creation in approve flow
- `packages/apps/backend/src/routes/meetings.ts` — ensure task creation in backend approve

**Acceptance Criteria:**
- [ ] Approved `i_owe_them` action items → commitment + linked task (uses Task 4 flow)
- [ ] Approved `they_owe_me` action items → commitment + Waiting On entry in week.md
- [ ] Task inherits `@area()` from meeting area, `@person()` from counterparty, `@due()` if mentioned
- [ ] Urgency inference: "urgent/this week/ASAP" → Must; "important" → Should; "when you can/sometime" → Anytime
- [ ] If urgency unclear, default to Should (don't block, per Harvester)
- [ ] Unit tests for: urgency inference mapping, metadata inheritance, CLI path, backend path

**Depends on:** Task 4 (needs commitment-task linking)

---

### Task 6: Phase 1 Verification Gate

Verify Phase 1 is complete before proceeding. Run full test suite, verify TaskService works end-to-end.

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (no regressions)
- [ ] Manual verification: `arete install` creates both files; TaskService can list/add/complete tasks
- [ ] All Phase 1 tasks marked complete in prd.json

**Depends on:** Tasks 1-5

---

## Phase 2: Planning Skills Integration

### Task 7: Update week-plan to Pull from Task Store

Week planning pulls existing tasks from tasks.md (Anytime bucket) and open commitments.

**Files to modify:**
- `packages/runtime/skills/week-plan/SKILL.md`

**Acceptance Criteria:**
- [ ] week-plan gathers candidates from: `tasks.md` (Anytime), open commitments without linked tasks, carryover from last week
- [ ] Candidates grouped by source in presentation
- [ ] User selects Must/Should/Could destinations (numbered list per collaboration.md)
- [ ] Selected tasks MOVED (not copied) from tasks.md → week.md
- [ ] Dedup: if task text already exists in week.md, skip with note
- [ ] Asks about remaining Anytime items: "Leave in Anytime or move to Someday?"
- [ ] Skill file updated with clear workflow steps

**Depends on:** Task 6 (Phase 1 complete)

---

### Task 8: Update daily-plan with Task Scoring

Smart task selection using scoring algorithm. LLM layer recommends top 3-5 tasks with explanations.

**Files to create/modify:**
- `packages/core/src/services/task-scoring.ts` (new) — pure scoring functions
- `packages/core/test/services/task-scoring.test.ts` (new)
- `packages/runtime/skills/daily-plan/SKILL.md`

**Acceptance Criteria:**
- [ ] Scoring function: `scoreTask(task, context): { score: number, breakdown: ScoreBreakdown }`
- [ ] Dimensions: due date (0-40), commitment weight (0-25), meeting relevance (0-20), week priority (0-15)
- [ ] Modifiers: `needs_attention` person → +10; task relates to today's meeting attendee/area → +20
- [ ] Time fit penalty: deep work task penalized if <2hrs focus available
- [ ] `breakdown` shows per-dimension scores with brief reason (Architect/Preparer requirement)
- [ ] daily-plan skill uses scoring to select top candidates, LLM recommends 3-5 with explanations
- [ ] User confirms/adjusts recommendations (not forced to accept)
- [ ] Unit tests for: each scoring dimension, edge cases (no meetings, no due date), combined scoring

**Depends on:** Task 7 (uses week.md tasks)

---

### Task 9: Add Inbox Processing to Daily Winddown

Process `week.md ## Inbox` items during triage. Support skippable triage (Harvester requirement).

**Files to modify:**
- `packages/runtime/skills/daily-winddown/SKILL.md` (or will be created in Task 11)

**Acceptance Criteria:**
- [ ] Reads `week.md ## Inbox` items
- [ ] For each item: parse text, infer metadata (@area, @project, @person), recommend destination
- [ ] Destinations: Must/Should/Could (week.md), Anytime/Someday (tasks.md), Create Commitment
- [ ] Confidence-based auto-placement: high confidence (>0.8) → auto-place; low confidence → leave in inbox
- [ ] "Skip" option leaves item in inbox for next triage
- [ ] On confirmation: move items, add metadata, clear from inbox
- [ ] Document workflow in skill file

**Depends on:** Task 7 (uses week.md structure)

**Note:** If daily-winddown doesn't exist yet (Task 11), this task creates a stub or defers to Task 11.

---

### Task 10: Phase 2 Verification Gate

Verify Phase 2 is complete. Test planning skills work with new task system.

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (no regressions)
- [ ] Manual verification: week-plan pulls from tasks.md; daily-plan shows scoring breakdown
- [ ] All Phase 2 tasks marked complete

**Depends on:** Tasks 7-9

---

## Phase 3: Pull In Winddown Skills

### Task 11: Pull daily-winddown into Areté

Copy from `~/code/arete-reserv` to `packages/runtime/skills/daily-winddown/`. Update to use new task system.

**Pre-task:** Read `~/code/arete-reserv/.cursor/skills/daily-winddown/` and document all external references to remove.

**Files to create:**
- `packages/runtime/skills/daily-winddown/SKILL.md`

**Acceptance Criteria:**
- [ ] Skill copied from arete-reserv with proper attribution comment
- [ ] All Krisp-specific references replaced with generic "recording pull"
- [ ] Uses `TaskService` for task creation (not direct file writes)
- [ ] Uses linked commitments (Task 4 flow)
- [ ] Inbox processing step incorporated (Task 9 logic)
- [ ] Added to AGENTS.md skills index
- [ ] No broken references or missing dependencies

**Depends on:** Task 10 (Phase 2 complete)

---

### Task 12: Pull weekly-winddown into Areté (local-only)

Copy from arete-reserv, remove ALL Notion references. Local files only.

**Pre-task:** Read `~/code/arete-reserv/.cursor/skills/weekly-winddown/` and create checklist of Notion refs to remove.

**Files to create:**
- `packages/runtime/skills/weekly-winddown/SKILL.md`

**Acceptance Criteria:**
- [ ] Skill copied from arete-reserv with proper attribution comment
- [ ] "Subagent: Pull Notion state" REMOVED from Phase 1
- [ ] "Push review to Notion" REMOVED from Phase 5
- [ ] All `arete notion` commands REMOVED
- [ ] Replaced with local reads: week.md, tasks.md, `goals/*.md`, commitments
- [ ] Thread arcs use `arete search --timeline` (local memory)
- [ ] Context health checks local files only
- [ ] Weekly review writes to week.md
- [ ] Added to AGENTS.md skills index
- [ ] No broken references or Notion dependencies

**Depends on:** Task 11

---

### Task 13: Phase 3 Verification Gate

Verify pulled skills work without external dependencies.

**Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `grep -r "notion" packages/runtime/skills/daily-winddown packages/runtime/skills/weekly-winddown` returns no matches
- [ ] Manual verification: skills load without error
- [ ] All Phase 3 tasks marked complete

**Depends on:** Tasks 11-12

---

## Phase 4: Interactive Review UI

### Task 14: Create Backend API for Review

Add `/api/review` endpoints for aggregated review data and completion signal.

**Files to create/modify:**
- `packages/apps/backend/src/routes/review.ts` (new)
- `packages/apps/backend/src/routes/index.ts` — register routes

**API Design:**
```
GET /api/review/pending
  Returns: { tasks: Task[], decisions: Decision[], learnings: Learning[], commitments: Commitment[] }
  Source: reads from staging files/memory

POST /api/review/complete
  Body: { sessionId: string, approved: string[], skipped: string[] }
  Action: writes `.arete/.review-complete-{sessionId}` file
  Returns: { success: true }
```

**Acceptance Criteria:**
- [ ] `GET /api/review/pending` returns aggregated pending items from relevant sources
- [ ] `POST /api/review/complete` writes completion file for CLI polling
- [ ] Session ID validation (must match active session)
- [ ] Error handling for missing workspace, invalid session
- [ ] Unit tests for both endpoints

**Depends on:** Task 13 (Phase 3 complete)

---

### Task 15: Create /review Page in Web App

Aggregated review page with quick approve/skip controls.

**Files to create/modify:**
- `packages/apps/web/src/app/review/page.tsx` (new)
- `packages/apps/web/src/app/review/ReviewClient.tsx` (new)
- `packages/apps/web/src/components/nav/Sidebar.tsx` — add Review link

**Acceptance Criteria:**
- [ ] Route `/review` renders ReviewClient
- [ ] Sections: Tasks to Create, Decisions & Learnings, Commitments
- [ ] Per-item controls: Approve / Skip / Edit (dropdown or buttons)
- [ ] Task destination selector dropdown (Must/Should/Could/Anytime/Someday)
- [ ] Bulk actions: "Approve All", "Skip All" buttons
- [ ] Prominent "Done Reviewing" button (calls POST /api/review/complete)
- [ ] MUST BE FAST: <30 seconds to complete typical triage (Preparer requirement)
- [ ] Loading state, empty state with dashboard link
- [ ] Responsive design

**Depends on:** Task 14 (API exists)

---

### Task 16: Add --path and --wait Flags to arete view

CLI flags for opening specific routes and blocking until completion.

**Files to modify:**
- `packages/cli/src/commands/view.ts`

**Acceptance Criteria:**
- [ ] `arete view --path /review` opens browser to that route
- [ ] `arete view --wait` creates `.arete/.review-session-{uuid}`, blocks until completion
- [ ] Session file format: `{ sessionId, createdAt, status: "pending" }`
- [ ] Polls every 500ms for `.arete/.review-complete-{sessionId}`
- [ ] `--timeout <seconds>` option (default 300), returns `{ timedOut: true }` on timeout
- [ ] `--json --wait` returns structured result with approved/skipped items
- [ ] Cleanup: deletes session files after read
- [ ] Unit tests for: session creation, polling, timeout, cleanup

**Depends on:** Task 15 (UI exists)

---

### Task 17: Integrate Review UI into Daily Winddown

After meeting processing, optionally invoke review UI.

**Files to modify:**
- `packages/runtime/skills/daily-winddown/SKILL.md`

**Acceptance Criteria:**
- [ ] After meeting processing, if staged items exist, check skill config for `useReviewUI`
- [ ] REVIEW UI IS OPT-IN (Harvester requirement): default false, enable via flag/config
- [ ] If enabled: `arete view --path /review --wait --timeout 300`
- [ ] On completion: read approved items from completion file, continue with creation
- [ ] On timeout: notify user, offer CLI triage fallback
- [ ] If no staged items: skip UI entirely
- [ ] FALLBACK PATH (Harvester): if UI disabled or fails, use CLI triage in terminal
- [ ] Document opt-in behavior in skill file

**Depends on:** Task 16

---

### Task 18: Final Documentation and Cleanup

Update all documentation, LEARNINGS.md, and capabilities catalog.

**Files to modify:**
- `packages/core/src/services/LEARNINGS.md` — add TaskService gotchas
- `packages/runtime/skills/LEARNINGS.md` — add winddown skill notes
- `dev/catalog/capabilities.json` — add TaskService, update CommitmentsService
- `.agents/sources/shared/cli-commands.md` — add task commands if any
- `AGENTS.md` — regenerate to include new skills

**Acceptance Criteria:**
- [ ] TaskService documented in services LEARNINGS.md (constructor pattern, metadata parsing)
- [ ] Winddown skills documented in skills LEARNINGS.md
- [ ] Capabilities catalog updated with TaskService entry
- [ ] AGENTS.md skills index includes daily-winddown and weekly-winddown
- [ ] All TODO/FIXME comments addressed or tracked

**Depends on:** Task 17

---

## Out of Scope

- Notion integration (explicitly removed per plan)
- Task dependencies/blocking relationships
- Recurring tasks
- Task history/analytics dashboard
- Mobile UI

## Success Criteria

- [ ] All 18 tasks complete
- [ ] Zero test regressions
- [ ] Typecheck passes
- [ ] daily-winddown and weekly-winddown work without Notion
- [ ] Review UI triage completes in <30 seconds for typical load
- [ ] Commitment-task linkage works bidirectionally
