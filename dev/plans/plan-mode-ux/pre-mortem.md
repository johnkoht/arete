<!-- Extracted at 2026-02-18T04:44:03.639Z -->

## Pre-Mortem: Plan Mode UX

### Risk 1: Dual progress sources drift (Plan todos vs PRD JSON)  
**Category**: Integration / State Tracking  

**Problem**: Compact UI may show PRD progress while other parts still rely on `todoItems`, causing conflicting status (e.g., footer says 3/9 while `/build status` implies different totals).  

**Mitigation**: Define and enforce a single source-of-truth rule:
- PRD build mode (`has_prd`): progress comes from `dev/autonomous/prd.json`
- Non-PRD build mode: progress comes from `state.todoItems`
- Centralize mode detection in one helper used by footer + widget + build status.

**Verification**: Tests cover both PRD and non-PRD flows and assert consistent numbers across all render surfaces.

---

### Risk 2: Current task detection is wrong or unstable  
**Category**: Context Gaps / Integration  

**Problem**: `prd.json` may have mixed statuses (`pending`, `in_progress`, `complete`, `failed`) and metadata may be stale; “Current task” could be misidentified.

**Mitigation**: Use deterministic selection logic:
1. First `in_progress` task
2. Else first `pending` task
3. Else none (all complete/failed)
Also prefer computed counts from `userStories` over trusting metadata blindly.

**Verification**: Unit tests for edge cases (all complete, failed present, malformed statuses, stale metadata).

---

### Risk 3: Persona label is confusing during build loop  
**Category**: Scope / UX Clarity  

**Problem**: If we try to reflect EM/Reviewer/Developer transitions without explicit signals, the role badge can flicker or mislead.

**Mitigation**: Keep v1 simple and deterministic:
- Derive role from `activeCommand` mapping only
- Show exactly one role in primary status
- Do not attempt multi-role concurrency in this change.

**Verification**: Snapshot/behavior tests assert single role label at a time; no combined labels.

---

### Risk 4: Status line becomes too long and wraps badly  
**Category**: Platform Issues (terminal width)  

**Problem**: Long task titles can wrap and reintroduce visual clutter, especially in narrow terminals.

**Mitigation**: Truncate current-task title in compact mode (e.g., max N chars + ellipsis) and keep full detail in `/build status`.

**Verification**: Rendering tests with long task names verify bounded output length and ellipsis behavior.

---

### Risk 5: Regression in existing widget lifecycle behavior  
**Category**: Integration / Dependencies  

**Problem**: Refactoring widget/footer for compact PRD mode could unintentionally break plan-phase pipeline rendering or non-PRD execution mode.

**Mitigation**: Preserve branch logic:
- Plan mode pipeline rendering unchanged
- PRD execution uses compact rendering
- Non-PRD execution keeps current todo behavior unless explicitly changed
Add regression tests around phase rendering.

**Verification**: Existing widget tests + new mode-specific tests all pass.

---

### Risk 6: Error handling gaps for missing/malformed `prd.json`  
**Category**: Code Quality  

**Problem**: Runtime exceptions or blank UI if `prd.json` is missing, partially written, or invalid JSON.

**Mitigation**: Make parser total-safe:
- Return `null`/fallback object on error
- Never throw into UI render path
- Add warning-level notification only when useful (avoid noisy repeats)

**Verification**: Tests for missing file, malformed JSON, missing `userStories`, invalid status strings.

---

### Risk 7: Scope creep into broader orchestration redesign  
**Category**: Scope Creep  

**Problem**: This UX task could balloon into rewiring execute-prd loop, full role handoff instrumentation, or new TUI views.

**Mitigation**: Keep scope locked to:
- compact status line
- PRD reader helper
- role label mapping
- tests + quality gates  
Defer multi-role live tracing to follow-up backlog item.

**Verification**: PR has only planned files/areas touched; no execute-prd behavioral redesign.

---

### Risk 8: Tests miss real integration behavior  
**Category**: Test Patterns  

**Problem**: Unit tests might pass while runtime wiring (`index.ts` state -> widget helpers) is inconsistent.

**Mitigation**: Add both:
- pure unit tests (parser/render helpers)
- integration-ish tests for plan-mode state->render selection logic
And run full suite (`npm test`) plus typecheck.

**Verification**: `npm run typecheck` + `npm test` pass; changed tests assert end-to-end mode selection.

---