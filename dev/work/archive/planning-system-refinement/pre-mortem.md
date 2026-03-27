# Pre-Mortem: Planning System Refinement

**Date**: 2026-02-18
**Plan Size**: large (8 tasks)
**Key Files**: index.ts, commands.ts, lifecycle.ts, widget.ts, utils.ts, agents.ts

---

## Risk 1: Phase State Fragmentation

**Problem**: Adding `currentPhase` to state creates a new piece of state that must stay in sync with existing flags (`preMortemRun`, `reviewRun`, `prdConverted`, `executionMode`). If they diverge, the UI shows one thing but behavior follows another.

**Mitigation**: 
- `currentPhase` controls menus (what "Continue to X" shows)
- Boolean flags (`preMortemRun`, `reviewRun`) track completion status independently
- Document: "currentPhase = where we ARE in flow; has_* = what COMPLETED"
- In Task 1, update `createDefaultState()` AND persistence restore logic

**Verification**: After Task 1, confirm `session_start` restores both `currentPhase` AND boolean flags correctly.

---

## Risk 2: Menu Transition Gaps

**Problem**: Task 2 replaces `getMenuOptions()` with `getPhaseMenu()`, but Task 4 changes how menu selections are handled. If Task 2 ships alone, new menu options won't be wired.

**Mitigation**: 
- Task 2: add new `getPhaseMenu()` but keep `getMenuOptions()` (deprecated)
- Task 4: wire new menu options, then mark old function deprecated
- Test manually after Task 4: each "Continue to X" invokes correct command

**Verification**: After Task 4, test: Plan mode → create plan → "Continue to pre-mortem" → verify `handlePreMortem()` called.

---

## Risk 3: Artifact Content Extraction Fails

**Problem**: Agent output is free-form — no guaranteed section headers. If extraction fails, we save nothing or garbage.

**Mitigation**:
- `extractPhaseContent()` fallback: if no section header, save full response
- Never save empty string — skip save with warning
- Look for headers: "## Pre-Mortem", "## Review", "### Risk", "Plan:"
- Include extraction comment: `<!-- Extracted at {timestamp} -->`

**Verification**: After Task 3, test with response lacking section headers — confirm full response saved.

---

## Risk 4: Agent Prompt Injection Order

**Problem**: Multiple prompts might apply (plan mode context + agent prompt + plan content). Wrong order or conflicts confuse the agent.

**Mitigation**:
- Inject based on **active command**, not `currentPhase`:
  - `/pre-mortem` → orchestrator.md
  - `/review` → reviewer.md
  - `/build` → orchestrator.md
- Track `activeCommand` in state for `before_agent_start` to use
- Order: base context → agent prompt → plan content

**Verification**: After Task 5, check injected context in debug. Confirm one agent prompt per command.

---

## Risk 5: Widget Stage Mismatch

**Problem**: Adding "PRD" stage to widget requires correct check order in `getCurrentStage()`. Wrong order shows wrong stage.

**Mitigation**:
- Use `currentPhase` as primary source of truth for stage
- has_* checks as fallback for legacy state
- Update widget tests for each phase value

**Verification**: After Task 7, set `currentPhase: "prd"`, confirm widget highlights PRD stage.

---

## Risk 6: Refine Loop Infinite Recursion

**Problem**: "Refine X" → agent responds → auto-save → show menu could loop infinitely if guards missing.

**Mitigation**:
- Track `isRefining: boolean` — skip menu when true
- After refine response saved, clear flag, then show menu
- `isAwaitingUserResponse()` check prevents menu during agent questions

**Verification**: After Task 8, refine 3 times consecutively. Confirm no infinite loop.

---

## Risk 7: Breaking Existing Plan-Mode Flows

**Problem**: Refactor touches many files — high risk of breaking working features.

**Mitigation**:
- Run existing tests BEFORE starting: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`
- Run full test suite after each task
- Don't delete functions until replacement verified — mark `@deprecated`

**Verification**: After every task: `npm run typecheck && npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`

---

## Risk 8: Lifecycle Order Test Failures

**Problem**: Changing `getMissingGates()` order from review→pre-mortem→prd to prd→pre-mortem→review breaks existing tests.

**Mitigation**:
- Before changing, list all tests asserting gate order
- Update tests in same task as code change
- Grep for order-dependent patterns: `review.*pre-mortem`

**Verification**: After Task 6, all lifecycle tests pass with new order.

---

## Risk 9: Out-of-Order Command Invocation

**Problem**: User calls `/pre-mortem` or `/review` directly, bypassing linear flow. Phase becomes inconsistent.

**Mitigation (flexible approach)**:
- `/pre-mortem` and `/review` can be called anytime — they're phase-independent
- They set completion flags (`preMortemRun`, `reviewRun`) but don't change `currentPhase`
- Widget shows completion checkmarks: `📋 plan (pre-mortem ✓, review ✓)`
- `/build` is the only gate:
  - If `!preMortemRun && planSize !== 'tiny'`: confirm to skip
  - If `!reviewRun`: just note it, proceed
- Agent prompt injection based on **active command**, not phase

**Verification**: 
1. In plan phase, call `/review` → reviewer prompt, `reviewRun: true`
2. Call `/review` again → runs again, overwrites artifact
3. Call `/build` → no warning (review done), proceeds

---

## Summary Table

| Risk | Category | Severity | Key Mitigation |
|------|----------|----------|----------------|
| Phase State Fragmentation | State Tracking | High | Separate concerns: phase=flow, flags=completion |
| Menu Transition Gaps | Dependencies | High | Keep old function until new wired |
| Artifact Extraction Fails | Integration | Medium | Fallback to full response |
| Agent Prompt Injection | Context Gaps | Medium | Inject based on active command |
| Widget Stage Mismatch | Integration | Medium | currentPhase as primary source |
| Refine Loop Recursion | Scope Creep | Low | Track isRefining state |
| Breaking Existing Flows | Code Quality | High | Test before/after each task |
| Lifecycle Order Tests | Test Patterns | Medium | Update tests with code |
| Out-of-Order Commands | Dependencies | Medium | Commands phase-independent, /build gates |

**Total risks identified**: 9
**Categories covered**: State Tracking, Dependencies, Integration, Context Gaps, Scope Creep, Code Quality, Test Patterns
