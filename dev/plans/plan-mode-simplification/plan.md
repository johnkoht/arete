---
title: Plan Mode Simplification
slug: plan-mode-simplification
status: complete
size: large
created: 2025-01-13T10:30:00.000Z
updated: 2025-01-13T11:45:00.000Z
completed: 2025-01-13T11:45:00.000Z
has_review: false
has_pre_mortem: true
has_prd: false
backlog_ref: null
steps: 14
---

# Plan Mode Simplification

## Problem Statement

The current plan mode implementation is overcomplicated with:
- 8 lifecycle statuses with valid transition rules
- 6 pipeline phases with phase inference logic
- Gate requirements that vary by plan size (mandatory/recommended/optional)
- A smart menu system that drives automatic progression
- Status reconciliation between in-memory state and persisted frontmatter

This creates cognitive load and confuses users. Plan mode should be a simple planning tool, not an enforced workflow.

## Goal

Simplify plan mode to be a **planning-only tool** with:
- Simple status: `draft | ready | building | complete`
- Optional gates: `/pre-mortem`, `/review` (recommendations based on size, not enforced)
- Auto-save plans when agent produces them
- Agent adapts behavior based on work type (bug fix, refactor, new feature, discovery)
- Clean handoff: `/approve` marks ready, `/build` executes

## Plan

1. ☑ **Simplify `PlanFrontmatter` and status** — Reduced to `draft|ready|building|complete`. Removed `previous_status`, `blocked_reason`. Added migration logic for existing plans.

2. ☑ **Simplify `PlanModeState`** — Removed `currentPhase`, `activeCommand`, `isRefining`, `postMortemRun`. Kept: `planModeEnabled`, `currentSlug`, `planSize`, `planText`, `todoItems`, `preMortemRun`, `reviewRun`, `prdConverted`.

3. ☑ **Delete `lifecycle.ts`** — Removed transition rules and gate requirements.

4. ☑ **Simplify commands** — Removed `/plan next|hold|block|resume`. Kept `/plan [new|list|open|save|status|delete]`. Removed template selection from `/plan new`.

5. ☑ **Add `/approve` command** — Simple transition: `draft → ready` with soft recommendations.

6. ☑ **Simplify `/build`** — Exits plan mode, sets status to `building`, invokes execution. Preserved PRD detection logic.

7. ☑ **Implement auto-save** — Auto-saves when agent produces 2+ steps. Infers slug from content, notifies user.

8. ☑ **Simplify `widget.ts`** — Single-line footer: `📋 plan-name (status) — artifacts`. Removed pipeline rendering.

9. ☑ **Simplify `index.ts`** — Removed phase tracking and automatic menu system. Kept artifact auto-save. Simplified context injection. Preserved bash restriction logic.

10. ☑ **Update PM agent prompt** — Added work-type adaptation guidance (bug fix, refactor, new feature, discovery).

11. ☑ **Update `utils.ts`** — Removed `getPhaseMenu`, `getMenuOptions`, `Phase` type, `shouldShowExecutionStatus`, `extractPhaseContent`, `isAwaitingUserResponse`.

12. ☑ **Remove `templates.ts`** — Deleted template system.

13. ☑ **Update tests** — Removed lifecycle/template tests. Updated persistence, utils, widget, commands tests for new interface.

14. ☑ **Quality gates** — `npm run typecheck && npm test` pass.

## Acceptance Criteria

- [x] Existing plans in `dev/plans/` load correctly (backward compatible via migration)
- [x] `/plan new` enters plan mode without template selection
- [x] Plans auto-save when agent produces numbered steps
- [x] `/approve` transitions draft → ready
- [x] `/build` works with and without PRD
- [x] Footer shows simple status: `📋 name (status) — artifacts`
- [x] Bash restrictions still work in plan mode
- [x] PM agent mentions work type and recommendations naturally
- [x] All tests pass
- [x] TypeScript compiles without errors

## Out of Scope

- Work-type-specific skill routing (future enhancement)
- PRD workflow changes (kept as-is)
- Changes to execute-prd skill

## Summary

Successfully simplified plan mode from a complex 6-phase workflow with mandatory gates to a simple planning tool. Key changes:
- Reduced status from 8 to 4 values
- Removed ~500 lines of lifecycle/phase tracking code
- Added auto-save functionality
- Simplified UI to single-line footer
- Made gates (pre-mortem, review) optional with soft recommendations
- Added work-type adaptation to PM agent prompt
