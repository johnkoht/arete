---
title: "Product Simplification — Phase 3: Hierarchy Tightening"
slug: product-simplification-phase3
status: draft
size: medium
tags: [runtime, core, cli, goals, projects, areas, tasks]
created: "2026-04-04"
updated: "2026-04-04"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 5
---

# Product Simplification — Phase 3: Hierarchy Tightening

Make relationships between goals, projects, areas, and tasks automatic instead of optional. Soft constraints and auto-population — not hard enforcement.

## Context

This worktree is branched from `worktree-product-simplification-p2` (NOT `product-simplification`). Phase 2 changes (Jaccard dedup in addTask, existingTasks in MeetingContextBundle, confidence threshold 0.65) are NOT in this branch. We implement Phase 3 on top of what's in `worktree-product-simplification-p2`.

## Pre-Analysis: What Already Exists

### Task 5 — Commitment inherits goal/area (PARTIALLY DONE)
The CLI `meeting approve` command (packages/cli/src/commands/meeting.ts L1169-1238) already:
- Extracts `meetingArea` from meeting frontmatter `area:` field
- Prompts user to select a goal (`selectedGoalSlug`)
- Passes both to `services.commitments.create()` and `services.tasks.addTask()`

The backend `approveMeeting()` (packages/apps/backend/src/services/workspace.ts L626-726) also:
- Reads `meetingArea` from frontmatter
- Accepts `goalSlug` in options
- Passes both to commitment/task creation

The `CommitmentsService.create()` (packages/core/src/services/commitments.ts) accepts `goalSlug` and `area` options and stores them on the commitment.

**VERDICT**: Task 5 is already implemented for the meeting→commitment path. The only gap is that commitments created via `arete people memory refresh` (person-signals.ts) don't have area — but those come from person file checkboxes, not meetings, so area isn't inferable. Mark as DONE.

### Task 3 — Tasks inherit scope (PARTIALLY DONE)
- Meeting approval already passes `area` to task creation
- `TaskService.addTask()` already accepts `metadata: TaskMetadata` with `area`, `project`, `person`, `from`
- `@from(commitment:id)` and `@from(meeting:date)` patterns already exist (from Phase 2)
- What's missing: when creating tasks from commitment context, the `project` field is not propagated. But project linkage to meetings doesn't exist in the data model — meetings have `area` in frontmatter but not `projectSlug`. 

**VERDICT**: Area inheritance from meeting→task is done. Project inheritance not applicable (projects aren't linked from meetings). Task 3 is functionally done for the achievable scope. Mark as DONE.

## The 3 Real Gaps

### Gap 1: Goals require area (quarter-plan skill)
**Current state**: quarter-plan SKILL.md guides user through 3-5 outcomes. The `Goal` type supports optional `area` field. The template (`quarter-goals.md`) doesn't include `area` in its frontmatter.

**Fix needed**:
1. Add `area:` field to the `quarter-goals.md` template
2. Update quarter-plan SKILL.md Step 2 to ask "Which area does this goal belong to?" — prompt user to select from `areas/*.md` or enter a new area slug
3. Update quarter-plan SKILL.md Step 3 to include flagging goals without area

### Gap 2: Projects link to goals (general-project skill)
**Current state**: general-project SKILL.md creates a project folder and README. No goal linkage asked.

**Fix needed**:
1. Update general-project SKILL.md to add Step 1.5: "Which goal does this project advance?" — read active goals, present selection, store in README frontmatter-style metadata
2. Update `general-project/templates/project.md` to include a `## Goal Linkage` section

### Gap 3: Week planning scopes by area (week-plan skill)
**Current state**: week-plan SKILL.md reads goals with `area:` field and presents all together. No area-scoping step.

**Fix needed**:
1. Add Step 1.5 to week-plan SKILL.md: "Which areas are you focusing on this week?" — list areas, let user select, scope goal and project gathering to those areas
2. Still show all commitments (commitments aren't yet reliably area-tagged, graceful degradation)

## Steps

### Step 1: Update quarter-goals.md template to include area field

**File**: `packages/runtime/skills/quarter-plan/templates/quarter-goals.md`

**What already exists**: Template has `id`, `title`, `status`, `quarter`, `type`, `orgAlignment`, `successCriteria` frontmatter fields. No `area`.

**Gap**: `area` field missing from template.

**Fix**: Add `area:` field to frontmatter (empty string or null as default).

**Acceptance criteria**: Template includes `area: ""` or `area: null` in frontmatter. GoalParserService already handles optional `area` — no core changes needed.

**Test plan**: No new test — template change is human-readable content. Goal parser already has tests for `area` field parsing.

### Step 2: Update quarter-plan SKILL.md to require area

**File**: `packages/runtime/skills/quarter-plan/SKILL.md`

**What already exists**: Step 2 captures title, success criteria, org alignment. No area prompt.

**Gap**: Users can create goals without area association.

**Fix**: 
- Add sub-step in Step 2: after capturing the goal's title, ask "Which area does this goal belong to?" List available areas from `areas/*.md` or let user type a slug.
- If no areas exist: note "No areas configured — add areas later" and proceed.
- In Step 3 (file creation): include `area:` in the generated frontmatter.
- Optional flagging: after creating all goals, show which ones lack an area association.

**Design principle**: Soft constraint — if user says "none" or skips, goal is created without area. No blocking.

**Acceptance criteria**: 
- quarter-plan workflow prompts for area on each goal
- Generated files include `area: <slug>` or `area: ""` in frontmatter
- Graceful if no areas exist

**Test plan**: Skill file is markdown — no unit tests. Manual review of workflow.

### Step 3: Update general-project SKILL.md to link to goals

**File**: `packages/runtime/skills/general-project/SKILL.md`
**File**: `packages/runtime/skills/general-project/templates/project.md` (or wherever the template lives)

**What already exists**: Workflow creates project folder + README from template. No goal linkage.

**Gap**: Projects created without knowing which goal they advance.

**Fix**:
- Add Step 1.5 between current Step 1 (Project Setup) and Step 2 (Categorize Work Type): "Which goal does this project advance?"
- Read active goals via `arete goals list --json` (if CLI command exists) or instruct to read `goals/*.md`
- If goals exist: show numbered list with title + id, let user select or say "none"
- Store the goal linkage in the README under `## Goal` section header
- If no goals exist: skip gracefully with note "No quarter goals configured — link later by editing README"

**Acceptance criteria**:
- general-project workflow asks about goal linkage
- README includes goal reference if user provided one
- Graceful if no goals

**Test plan**: Skill file is markdown — no unit tests.

### Step 4: Update general-project templates/project.md to include goal section

**File**: `packages/runtime/skills/general-project/templates/project.md`

**What already exists**: Check template content for current sections.

**Gap**: No standardized place to record goal linkage in project READMEs.

**Fix**: Add `## Goal` section (or `## Linked Goal`) to the template.

**Acceptance criteria**: Template includes a Goal/Linked Goal section.

### Step 5: Update week-plan SKILL.md to scope by area

**File**: `packages/runtime/skills/week-plan/SKILL.md`

**What already exists**: Step 1 gathers all goals across all areas. Step 2 asks priorities. Step 3 builds task list from all backlog.

**Gap**: No area-scoping step. User sees all goals/tasks undifferentiated.

**Fix**:
- Add Step 1.5 after context gathering: "Which areas are you focusing on this week?"
  - List areas from `areas/*.md`
  - If only 1 area: auto-select (no prompt needed)
  - If 2-4 areas: present quick multi-select
  - If 5+ areas: present numbered list with multi-select
- Filter goals display to selected areas (goals without area appear separately as "Unscoped goals")
- Filter project display to selected areas
- Commitments shown unfiltered (area tagging is partial — graceful degradation)
- Still show all tasks from backlog (tasks may not be area-tagged)

**Acceptance criteria**:
- week-plan asks "Which areas this week?" when multiple areas exist
- Goals shown scoped to selected areas
- Unscoped goals (no area) shown in separate section
- Graceful: if no areas, skip area-scoping step entirely

**Test plan**: Skill file is markdown — no unit tests.

## Files to Change

### Skills (markdown)
1. `packages/runtime/skills/quarter-plan/SKILL.md` — add area prompt to Step 2
2. `packages/runtime/skills/quarter-plan/templates/quarter-goals.md` — add `area:` field
3. `packages/runtime/skills/general-project/SKILL.md` — add goal linkage step
4. `packages/runtime/skills/general-project/templates/project.md` — add Goal section
5. `packages/runtime/skills/week-plan/SKILL.md` — add area-scoping step

### Core / CLI (no TypeScript changes needed)
The existing `Goal` type already has `area?: string`. The `GoalParserService` already handles the field. No TypeScript changes needed for goal area support.

For project→goal linkage: this is a skill-level convention stored in README, not in a typed model. No TypeScript changes.

## Quality Gates

Skills are markdown files — no typecheck/test gates needed. However, after changing skill files, verify:
1. `npm run build` — regenerates dist/ (skills are copied to dist)
2. `npm run typecheck` — ensure no TypeScript regressions in other files
3. `npm test` — ensure no regressions

## Already Done (Don't Rebuild)

- **Task 3 (Tasks inherit scope)**: Area inheritance from meeting→task works via `meetingArea` in meeting approve flow. Project inheritance not applicable (meetings don't carry projectSlug).
- **Task 5 (Commitment inherits goal/area)**: Meeting approve CLI and backend both pass `area` and `goalSlug` to commitment/task creation.
