# Plan Mode UX PRD Learnings

Date: 2026-02-18  
PRD: `dev/prds/plan-mode-ux/prd.md`

## Metrics
- Tasks completed: 5/5
- First-attempt success: 5/5 (100%)
- Iterations: 0
- New/updated tests: 2 files (`execution-progress.test.ts`, `widget.test.ts`)
- Validation: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`, `npm run typecheck`, `npm test`
- Token usage (estimate): ~35K total

## Pre-mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|---|---|---|---|
| PRD/todo source drift across surfaces | No | Yes (shared `resolveExecutionProgress`) | Yes |
| Wrong current-task selection | No | Yes (`in_progress -> pending -> none`) | Yes |
| Role label confusion | Partial | Yes (single `deriveActiveRole`) | Yes |
| Long compact line wrap/noise | Partial | Yes (title truncation + compact line) | Yes |
| Non-PRD regression | No | Yes (todo fallback preserved + tests) | Yes |
| Missing/malformed prd.json crashes | No | Yes (safe parser, null fallback) | Yes |

## What Worked Well
- Creating a dedicated shared module (`execution-progress.ts`) gave one source of truth for progress arbitration, role derivation, compact formatting, and fallback behavior.
- Keeping rendering pure and reading PRD data only at state assembly time (in `index.ts`/`commands.ts`) limited blast radius.
- Adding focused tests for parser + renderer edge cases prevented regressions during refactor.

## What Didn’t Work / Gaps
- Project quality gates (`npm run typecheck`, `npm test`) do not include `.pi/extensions` tests; needed explicit `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` run.
- Role derivation is deterministic but still command-based; deeper role telemetry (multi-role transitions) remains out of scope.

## Subagent/Workflow Insights
- Deterministic fallback hierarchy (`PRD when available, else todo`) is key for trust in status output.
- Explicitly encoding compact line contract as a formatter function reduced widget/footer divergence risk.

## Collaboration Patterns
- Builder preference for skipping repeated pre-mortem was honored while still applying the pre-existing risk set during implementation.
- Builder requested best-judgment task grouping; delivering shared primitives first enabled safer downstream UI updates.

## Recommendations for Next PRD
1. Add an extension-specific quality script (e.g., `npm run test:plan-mode-extension`) and include it in PRD validation tasks.
2. Consider a small follow-up task to expose compact status width settings centrally for terminal-size adaptation.
3. If role ambiguity reappears, add explicit state events for role transitions rather than inferring from command names.

## Refactor Backlog Items
- None added.

## Documentation Gaps
- None mandatory for this internal UX change.
