# PRD: Plan Mode UX

**Version**: 1.0
**Status**: Draft
**Date**: 2026-02-17
**Plan**: Plan Mode Ux (5-step medium plan)

---

## Goal

Improve `/build` execution UX in plan-mode by replacing verbose/stale checklist visuals with compact, accurate PRD progress, while clearly surfacing the active agent persona (PM/EM/Reviewer) and preserving detailed status on demand.

---

## Problem Statement

When `/build` is invoked for PRD-driven execution, the current bottom widget can display plan todo items that are not updated by the execute-prd loop. This creates visual noise and can reduce trust in progress reporting.

The UX should prioritize compact, reliable status from the actual execution source (`dev/autonomous/prd.json`) while still allowing detailed drill-down when explicitly requested.

---

## User Stories / Tasks

### Task 1: Define UX contract (single source of truth + role labels)

Define and document the execution status contract so all rendering surfaces use consistent data and wording.

**Acceptance Criteria**
- Compact status format is defined as: `Role: <role> · PRD: <completed>/<total> complete · Current: #<n> <title> · Status: <state>`. <!-- inferred from plan -->
- Progress source rule is explicit:
  - PRD build mode (`has_prd`) uses `dev/autonomous/prd.json`
  - Non-PRD build mode uses existing plan `todoItems`. <!-- inferred from plan -->
- Role mapping is explicit:
  - plan default → `PM`
  - pre-mortem/build → `EM`
  - review → `Reviewer`
  - fallback → `Agent`. <!-- inferred from plan -->
- Compact vs detailed display behavior is defined (default compact, detailed on explicit `/build status`). <!-- inferred from plan -->

---

### Task 2: Add PRD progress reader (`dev/autonomous/prd.json`)

Implement a pure helper to derive progress safely from PRD JSON.

**Acceptance Criteria**
- Helper returns `total`, `completed`, and `currentTask` (id/index/title/status) from `dev/autonomous/prd.json`. <!-- inferred from plan -->
- Current-task selection is deterministic: first `in_progress`, else first `pending`, else none. <!-- inferred from plan -->
- Missing file, malformed JSON, or incomplete shape are handled gracefully without throwing in render paths. <!-- inferred from plan -->
- Fallback to todo-based progress is preserved when PRD data is unavailable. <!-- inferred from plan -->

---

### Task 3: Refactor status/widget rendering to compact mode

Update footer/widget rendering to prefer compact PRD progress during PRD execution.

**Acceptance Criteria**
- During PRD execution mode, footer/widget show compact one-line progress by default instead of full checklist. <!-- inferred from plan -->
- Task title rendering is width-conscious (truncation/ellipsis strategy) to avoid excessive wrapping in narrow terminals. <!-- inferred from plan -->
- Detailed task list remains available via explicit status path (`/build status`). <!-- inferred from plan -->
- Non-PRD execution path remains functional and readable (no regression). <!-- inferred from plan -->

---

### Task 4: Surface active persona cleanly

Expose a single current persona in execution status using command context.

**Acceptance Criteria**
- Effective role is derived from command/execution context (`activeCommand` mapping) and rendered in status. <!-- inferred from plan -->
- Exactly one role label is shown in primary status at any given time. <!-- inferred from plan -->
- Build-loop display avoids simultaneous multi-role labels that create confusion (e.g., no EM+Developer combined primary label). <!-- inferred from plan -->

---

### Task 5: Tests + validation

Add/update tests for parser/render behavior and run mandatory gates.

**Acceptance Criteria**
- Add tests for PRD progress parser: valid PRD, missing file, malformed JSON, incomplete/mixed statuses. <!-- inferred from plan -->
- Add tests for compact status rendering: role label, progress numbers, current task display, truncation behavior, fallback path. <!-- inferred from plan -->
- Existing lifecycle/widget tests remain green and are adjusted only where behavior intentionally changes. <!-- inferred from plan -->
- `npm run typecheck` and `npm test` pass. <!-- inferred from plan -->

---

## Pre-Mortem Highlights (already completed)

- Prevent source-of-truth drift between plan todos and PRD JSON.
- Ensure deterministic current-task selection.
- Keep role labeling single-source and non-noisy.
- Guard against regressions in non-PRD execution mode.
- Keep parser/render error handling fully graceful.

---

## Dependencies / Order

1. Task 1 defines contract for implementation tasks.
2. Task 2 should complete before Task 3 (rendering depends on progress data).
3. Task 4 can proceed in parallel with Task 3 once Task 1 is locked.
4. Task 5 validates all prior work and quality gates.

---

## Out of Scope

- Full multi-agent concurrent role timeline UX.
- Reworking execute-prd orchestration semantics.
- New TUI panes beyond compact default plus existing detailed status command.

---

## Success Criteria

- Default PRD execution status is compact and trustworthy.
- Role/persona is visible at a glance.
- Detailed status remains available on demand.
- Non-PRD build flow and plan lifecycle behavior remain stable.
- Full quality gates pass.
