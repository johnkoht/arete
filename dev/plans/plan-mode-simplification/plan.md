---
title: Plan Mode Simplification
slug: plan-mode-simplification
status: draft
size: large
created: 2025-01-13T10:30:00.000Z
updated: 2025-01-13T10:30:00.000Z
completed: null
blocked_reason: null
previous_status: null
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

1. **Simplify `PlanFrontmatter` and status** — Reduce to `draft|ready|building|complete`. Remove `previous_status`, `blocked_reason`. Keep `has_pre_mortem`, `has_review` as informational flags. Add migration logic for existing plans.

2. **Simplify `PlanModeState`** — Remove `currentPhase`, `activeCommand`, `isRefining`. Keep: `planModeEnabled`, `currentSlug`, `planSize`, `planText`, `todoItems`, `preMortemRun`, `reviewRun`.

3. **Delete `lifecycle.ts`** — No more transition rules or gate requirements.

4. **Simplify commands** — Remove `/plan next|hold|block|resume`. Keep `/plan [new|list|open|save|status|delete]`. Remove template selection from `/plan new` (just enters plan mode).

5. **Add `/approve` command** — Simple transition: `draft → ready`. Validates plan exists and has content.

6. **Simplify `/build`** — Exits plan mode, sets status to `building`, invokes execution. If PRD exists, use execute-prd skill. Otherwise direct execution. Preserve PRD detection logic.

7. **Implement auto-save** — After agent produces a plan (detected via "Plan:" header extraction), auto-save. Infer slug from content, notify "Auto-saved as 'feature-x' — rename with /plan save <name>". Only save when 2+ steps extracted and content materially changed.

8. **Simplify `widget.ts`** — Single-line footer: `📋 plan-name (draft) — pre-mortem ✓`. Remove pipeline rendering entirely.

9. **Simplify `index.ts`** — Remove phase tracking and automatic menu system. Keep artifact auto-save for pre-mortem/review. Simplify context injection to just plan mode restrictions + active plan content. Preserve bash restriction logic.

10. **Update PM agent prompt** — Remove template references. Add work-type adaptation guidance (bug fix, refactor, new feature, discovery). Agent should communicate its adapted approach naturally and recommend pre-mortem/review based on work type and size.

11. **Update `utils.ts`** — Remove `getPhaseMenu`, `getMenuOptions`. Keep `classifyPlanSize` for display.

12. **Remove `templates.ts`** — No longer needed without template selection.

13. **Update tests** — Simpler scenarios. Remove lifecycle transition tests, template tests. Ensure core flows tested: save, load, approve, build, auto-save.

14. **Quality gates** — `npm run typecheck && npm test`

## Acceptance Criteria

- [ ] Existing plans in `dev/plans/` load correctly (backward compatible)
- [ ] `/plan new` enters plan mode without template selection
- [ ] Plans auto-save when agent produces numbered steps
- [ ] `/approve` transitions draft → ready
- [ ] `/build` works with and without PRD
- [ ] Footer shows simple status: `📋 name (status) — artifacts`
- [ ] Bash restrictions still work in plan mode
- [ ] PM agent mentions work type and recommendations naturally
- [ ] All tests pass
- [ ] TypeScript compiles without errors

## Out of Scope

- Work-type-specific skill routing (future enhancement)
- PRD workflow changes (keep as-is)
- Changes to execute-prd skill
