---
title: "Product Simplification — Phase 2: Plumbing Gaps"
slug: product-simplification-phase2
status: draft
size: medium
tags: [core, cli, runtime, tasks, dedup, extraction]
created: "2026-04-04"
updated: "2026-04-04"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 5
---

# Product Simplification — Phase 2: Plumbing Gaps

## Overview

Five targeted plumbing improvements that reduce duplication and sharpen the extraction pipeline after Phase 1 (memory L3 revamp) and in-flight work (intelligence-improvements, task-management-ui).

## Tasks

### Task 1: Jaccard dedup in `TaskService.addTask()`

**Problem**: `TaskService.addTask()` unconditionally inserts — no duplicate checking at write time. If two skills or two agents both try to create the same task, you get duplicate task lines.

**Implementation**:
- Before inserting, read all existing tasks from both files
- Check two dedup conditions:
  1. `@from(commitment:id)` exact match — fast-path, skip insert, return existing
  2. Jaccard similarity ≥ 0.8 on normalized text — near-duplicate, skip insert, return existing
- Reuse `normalizeForJaccard` and `jaccardSimilarity` from `meeting-extraction.ts` (already exported)
- Return the existing task when dedup fires (not an error — caller gets a valid task back)
- Add `jaccardDedup` threshold as a configurable option (default 0.8)

**Files**: `packages/core/src/services/tasks.ts`
**Tests**: `packages/core/test/services/tasks.test.ts`

### Task 2: Pass week.md tasks + area L3 to meeting extraction context

**Problem**: The LLM running meeting extraction doesn't see existing tasks from `now/week.md` and `now/tasks.md`. This means it can't detect that an action item is already tracked as a task.

**Implementation**:
- In `MeetingContextBundle`, add an optional `existingTasks` field (`string[]`) — task texts from week.md and tasks.md
- In `buildMeetingContext()`, read `now/week.md` and `now/tasks.md`, extract task texts using `parseTaskLine()` logic, include in the bundle
- In `buildContextSection()` in `meeting-extraction.ts`, include existing tasks as a section: "Existing Tasks (do not re-extract as action items if already covered)"
- The LLM will see them and avoid re-proposing tasks already tracked

**Files**: 
- `packages/core/src/services/meeting-context.ts` (add `existingTasks` to bundle + read week.md/tasks.md)
- `packages/core/src/services/meeting-extraction.ts` (render `existingTasks` in prompt)

**Tests**: `packages/core/test/services/meeting-extraction.test.ts` (verify prompt includes existing tasks)

### Task 3: Planning skill dedup (daily-plan)

**Problem**: The `daily-plan` skill writes tasks to `week.md` without checking if they're already there. If a user runs daily-plan twice in a week, they get duplicate task lines.

**Implementation**:
- The skill already checks for existing week.md tasks in its Workflow step for context
- Add explicit dedup instruction: "Before writing tasks to week.md, check existing tasks. If normalized text matches (ignore case, whitespace, metadata tags), skip with a note."
- The `week-plan` SKILL.md already documents dedup in §3.4 — align `daily-plan` to the same standard

**Files**: `packages/runtime/skills/daily-plan/SKILL.md`

### Task 4: Commitment → task auto-promotion during week-plan

**Problem**: When a user selects a priority linked to a commitment (`@from(commitment:id)`) during week-plan, the task is created manually. If the commitment already has a task in `now/tasks.md` Inbox, a duplicate may be created.

**Implementation**:
- In `week-plan` SKILL.md §3.2, when displaying "From Open Commitments", run an explicit check:
  - Read `now/tasks.md` and `now/week.md`
  - For each commitment, check if a task with `@from(commitment:HASH_PREFIX)` already exists
  - If it does, show it as "(already a task)" and skip auto-create
- This is documentation-level change (skill instruction update) + the dedup from Task 1 serves as the write-time backstop

**Files**: `packages/runtime/skills/week-plan/SKILL.md`

### Task 5: Raise confidence include threshold 0.5 → 0.65

**Problem**: The 0.5 threshold in `meeting-processing.ts` is too permissive — low-confidence items flood the staging queue and increase review time.

**Implementation**:
- Change `DEFAULT_CONFIDENCE_INCLUDE` from `0.5` to `0.65` in `packages/core/src/services/meeting-processing.ts`
- Update the `ProcessingOptions` JSDoc comment
- Update any tests that rely on the 0.5 boundary to use 0.65

**Files**: `packages/core/src/services/meeting-processing.ts`

## Acceptance Criteria

- [ ] `TaskService.addTask()` returns existing task (no insert) when same `@from(commitment:id)` found
- [ ] `TaskService.addTask()` returns existing task (no insert) when Jaccard ≥ 0.8
- [ ] `MeetingContextBundle` includes `existingTasks` from week.md/tasks.md
- [ ] Extraction prompt section "Existing Tasks" appears when existingTasks are present
- [ ] `daily-plan` SKILL.md has explicit dedup instruction
- [ ] `week-plan` SKILL.md shows "(already a task)" for commitments with linked tasks
- [ ] `DEFAULT_CONFIDENCE_INCLUDE` is 0.65
- [ ] All tests pass, typecheck passes
