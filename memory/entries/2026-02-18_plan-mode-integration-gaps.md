# Plan-mode integration gaps: phase transitions and open/list path

Date: 2026-02-18

## Context

During planning-system-refinement execution, multiple regressions were discovered after implementation:
- `/prd` conversion initially could not write while plan mode was active.
- Running `/pre-mortem` while on PRD phase could leave menu options stuck on PRD -> pre-mortem loop.
- `/plan list` -> select plan opened data but did not reliably restore plan-mode lifecycle widget/steps.

## Root causes

1. **Helper-level correctness without orchestration coverage**
   - Unit tests validated pure helpers (`getPhaseMenu`, lifecycle ordering) but not end-to-end command/state interactions.

2. **Direct command invocation paths under-tested**
   - Direct `/prd`, `/pre-mortem`, `/review` from non-default phases were not covered by scenario tests.

3. **Alternate entrypoint bug**
   - `/plan list` used `handlePlanOpen(..., {} as CommandPi, ...)` instead of real Pi handle, so plan-mode enable/tool restoration path was incomplete.

## Corrections implemented

- Allowed PRD conversion writes while staying in plan mode.
- Made phase menu progression completion-aware (prd/pre-mortem/review flags).
- Auto-saved actual PRD artifact content from agent output.
- Ensured direct gate commands persist/advance phase when appropriate.
- Fixed `/plan list` to pass real Pi handle and fully restore plan-mode state.
- Added unit tests for phase inference and expanded phase-menu completion scenarios.

## Learnings for future agents

1. **Always test both menu-driven and command-driven paths**
   - For lifecycle systems, every gate should be tested via:
     - menu transition (`Continue to X`)
     - direct command (`/x`) from each non-terminal phase.

2. **Build a phase-transition scenario matrix before coding**
   - Minimum matrix rows:
     - currentPhase x {`/prd`, `/pre-mortem`, `/review`, `/build`}
     - expected {completion flags, next menu options, currentPhase}.

3. **Don’t rely on helper tests alone for orchestration features**
   - Add integration-ish tests for handlers that mutate shared extension state.

4. **Treat alternate UX entrypoints as first-class paths**
   - `/plan open` and `/plan list`->select must share equivalent restoration behavior.

## Testing checklist to prevent recurrence

- [ ] `/prd` in plan mode can generate artifacts without disabling plan mode.
- [ ] From PRD phase, running `/pre-mortem` updates next menu to review/build as appropriate.
- [ ] From any phase, direct gate command updates phase/status consistently.
- [ ] `/plan list` selection restores plan mode tools + lifecycle widget + inferred phase.
- [ ] Session resume preserves `currentPhase`, `activeCommand`, and `isRefining`.
