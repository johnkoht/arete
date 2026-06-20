---
title: "Product Simplification — Unified Plan"
slug: product-simplification
status: in-progress
size: large
tags: [core, cli, runtime, web, backend, tasks, dedup, extraction, goals, projects, areas, review, ux]
created: "2026-04-04"
updated: "2026-04-11"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 10
---

# Product Simplification — Unified Plan

Reduce duplication, tighten the goal/project/area hierarchy, and streamline review UX. Combines Phases 2-4 into one actionable plan.

## Status Summary

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 2 | Plumbing gaps (dedup, extraction, threshold) | 3/5 done |
| Phase 3 | Hierarchy tightening (goals, projects, areas) | 4/5 done |
| Phase 4 | Review UX (bulk approve, auto-approve, summary) | Active work |

---

## Phase 2: Plumbing Gaps (remaining)

### DONE: Jaccard dedup in `TaskService.addTask()`
`TaskService.addTask()` checks `@from(commitment:id)` exact match and Jaccard >= 0.8 before inserting. Returns existing task on dedup.

### DONE: Pass existingTasks to meeting extraction context
`MeetingContextBundle` includes `existingTasks` from week.md/tasks.md. Extraction prompt shows "Existing Tasks" section so LLM avoids re-proposing tracked tasks.

### DONE: Raise confidence threshold 0.5 -> 0.65
`DEFAULT_CONFIDENCE_INCLUDE` is 0.65 in `packages/core/src/services/meeting-processing.ts`.

### Task P2-A: Planning skill dedup (daily-plan)
- [ ] Add explicit dedup instruction to `packages/runtime/skills/daily-plan/SKILL.md`
- Instruction: before writing tasks to week.md, check existing tasks; if normalized text matches (ignore case, whitespace, metadata tags), skip with a note
- Align to the dedup standard already documented in `week-plan` SKILL.md section 3.4

**Files**: `packages/runtime/skills/daily-plan/SKILL.md`

### Task P2-B: Commitment -> task auto-promotion during week-plan
- [ ] Update `packages/runtime/skills/week-plan/SKILL.md` section 3.2
- When displaying "From Open Commitments", check `now/tasks.md` and `now/week.md` for existing tasks with `@from(commitment:HASH_PREFIX)`
- Show "(already a task)" for commitments that already have linked tasks; skip auto-create
- Write-time Jaccard dedup from addTask() serves as backstop

**Files**: `packages/runtime/skills/week-plan/SKILL.md`

---

## Phase 3: Hierarchy Tightening (remaining)

### DONE: Tasks inherit scope
Meeting approve flow passes `meetingArea` to `addTask()`. `TaskMetadata` already has `area`, `project`, `person`, `from` fields. Project inheritance N/A (meetings don't carry projectSlug).

### DONE: Commitment inherits goal/area
CLI `meeting approve` and backend `approveMeeting()` both extract `area` from meeting frontmatter and accept `goalSlug`, passing both to commitment/task creation.

### DONE: general-project links to goals
Updated `packages/runtime/skills/general-project/SKILL.md` with goal linkage step and `packages/runtime/skills/general-project/templates/project.md` with Linked Goal section.

### DONE: week-plan scopes by area
Updated `packages/runtime/skills/week-plan/SKILL.md` with area-scoping step. Auto-skips if 1 area; multi-select for 2+. Unscoped goals shown in neutral "Goals without area" section.

### Task P3-A: quarter-plan area frontmatter
- [ ] Add `area: ""` field to `packages/runtime/skills/quarter-plan/templates/quarter-goals.md` frontmatter
- [ ] Update `packages/runtime/skills/quarter-plan/SKILL.md` Step 2 to prompt "Which area does this goal belong to?" after capturing title
  - List areas from `areas/*.md` or let user type a slug
  - If no areas exist, note it and proceed (soft constraint)
  - In Step 3, include `area:` in generated frontmatter
  - After creating all goals, flag which ones lack an area association

**Files**:
- `packages/runtime/skills/quarter-plan/templates/quarter-goals.md`
- `packages/runtime/skills/quarter-plan/SKILL.md`

---

## Phase 4: Review UX (active work)

Meeting review takes 25-45 minutes. Phase 4 leverages confidence scoring to drastically reduce review time.

### Task P4-1: Global "Approve All (>=X Confidence)" button
- [ ] Add button in ReviewPage header that approves all pending decisions/learnings with confidence >= threshold
- Default threshold = 0.8, adjustable via number input
- Button label shows count: "Approve High Confidence (5 items)"
- Items below threshold or with `confidence: undefined` are excluded
- Tasks (inbox items) are NOT affected -- they don't have confidence scores

**Files**: `packages/apps/web/src/pages/ReviewPage.tsx`

### Task P4-2: Meeting-level batch approval
- [ ] Group decisions and learnings by `meetingSlug` with meeting title as subgroup header
- [ ] Add "Approve All" and "Skip All" buttons per meeting group
- Already-decided items are not changed by bulk actions

**Files**: `packages/apps/web/src/pages/ReviewPage.tsx`

### Task P4-3: Smart auto-approve on backend
- [ ] Add `POST /api/review/auto-approve` endpoint
  - Finds all processed meetings where ALL pending items have confidence >= 0.8
  - Marks those items as approved in the review session
  - Returns summary: `{ autoApproved: { meetings: string[], itemCount: number } }`
- [ ] Frontend shows banner with auto-approval result when qualifying meetings exist
  - Explicitly opt-in: user clicks "Auto-approve these" (NOT silent)
  - Items remain visible in summary for auditing

**Files**:
- `packages/apps/backend/src/routes/review.ts`
- `packages/apps/web/src/pages/ReviewPage.tsx`

### Task P4-4: Review summary
- [ ] After "Done Reviewing" completes, show summary in place of review form
  - Counts: approved, skipped, pending (undecided)
  - If auto-approved items exist, list them
  - Links back to meetings/dashboard
- [ ] Use local state (not TanStack Query cache) to hold summary after completion

**Files**: `packages/apps/web/src/pages/ReviewPage.tsx`

---

## Technical Notes

- `StagedMemoryItem.confidence` is `number | undefined` -- always handle missing confidence
- Tasks (WorkspaceTask) don't have confidence -- exclude from confidence-based actions
- Use existing `StagedMemoryItem.meetingSlug` and `meetingTitle` for grouping
- Backend changes isolated to `routes/review.ts`; frontend to `ReviewPage.tsx`
- Quality gates: `npm run typecheck`, `npm test`, `npm run build`, `npm run build:apps:backend`
- Skill files are markdown -- no typecheck/test gates, but always `npm run build` (skills copy to dist/)

---

## Review & Pre-Mortem Insights

Consolidated from Phase 2-4 reviews and pre-mortems.

### Key Design Decisions

1. **Soft constraints, not hard enforcement**: Goals without area, projects without goals, weeks without area-scoping are all allowed. Skills add prompts and labels, not hard blocks.
2. **Auto-approve is opt-in, never silent**: User explicitly triggers auto-approve via banner action. Summary shows what was approved for auditing.
3. **Jaccard dedup is the backstop**: Even if skill instructions fail to prevent duplication at the prompt level, `TaskService.addTask()` catches duplicates at write time (Jaccard >= 0.8).
4. **Backend auto-approve enables future CLI flow**: The `POST /api/review/auto-approve` endpoint adds small complexity but enables fully server-side auto-approve without UI in the future.

### Risk Mitigations to Apply

| Risk | Mitigation | Where |
|------|-----------|-------|
| Confidence undefined on old items | Treat as unqualified, exclude from threshold actions | P4-1, P4-3 |
| Auto-approve breaks trust | Opt-in + auditable summary + "review below" language | P4-3, P4-4 |
| TanStack Query cache invalidation hides summary | Use local state for summary, not cache-driven render | P4-4 |
| Backend type errors not caught by root typecheck | Always run `npm run build:apps:backend` after backend changes | P4-3 |
| Agent skips area-scope step in week-plan | Explicit "MUST precede Step 2" instruction; auto-skip if 1 area | Already applied |
| Skill dedup instruction ignored by LLM | Write-time Jaccard dedup in addTask() is the real backstop | Already applied |
| quarter-plan template `area: ""` parsing | GoalParserService handles optional area -- empty string becomes undefined (correct) | P3-A |
| No goals exist when general-project asks for linkage | Graceful-skip with "link later" note | Already applied |
| Dist out of sync after skill changes | Always `npm run build` before commit | All skill tasks |
