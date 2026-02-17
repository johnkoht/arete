# PRD: Plan Mode ↔ Arete Skills Integration

**Version**: 1.0
**Status**: Superseded by `dev/prds/plan-lifecycle-system/prd.md`
**Date**: 2026-02-16
**Branch**: `feature/plan-mode-skills-integration`
**Depends on**: Pi Dev Workflow PRD (complete), all 7 .agents/skills/ (existing)

---

## 1. Problem & Goals

### Problem

The plan-mode extension and the Arete planning skills operate independently. The extension manages read-only exploration, step extraction, and execution tracking — but the post-plan menu only offers three choices (Execute / Stay / Refine). Meanwhile, the planning skills (run-pre-mortem, plan-to-prd, review-plan, execute-prd, prd-post-mortem) encode a rich lifecycle that exists only as text injected into the system prompt. The LLM must remember and self-apply the execution path decision tree (Tiny/Small/Medium/Large), which is fragile.

The result: the planning lifecycle is advisory, not structural. Users must manually invoke `/skill:run-pre-mortem` or `/skill:plan-to-prd` — the extension doesn't surface these options at the right moment.

### Goals

1. **Skill-aware plan menus**: After a plan is created in plan mode, surface contextually appropriate skill options based on plan size (step count + complexity keywords).
2. **Automated pre-mortem gateway**: For Medium/Large plans, either auto-run or strongly nudge the pre-mortem before execution begins.
3. **Post-execution skill integration**: After all plan steps complete, offer post-mortem and memory capture options.
4. **Lifecycle status widget**: Show the user's position in the planning lifecycle (Plan → Pre-mortem → Execute → Post-mortem) via a persistent widget.
5. **Testability**: Extract classification and menu logic into pure, testable utility functions with full test coverage.

### Out of Scope

- Subagent execution via Pi's task tool (separate PRD)
- Changes to the skill SKILL.md content themselves
- Changes to .cursor/ rules (Cursor workflow is unaffected)
- New skills (only wiring existing ones)
- Replacing the execution path decision tree text in APPEND_SYSTEM.md (keep it as fallback context)

---

## 2. Architecture

### Plan Size Classification

A new utility function classifies plans based on step count and content analysis:

```
classifyPlanSize(items: TodoItem[], planText: string): "tiny" | "small" | "medium" | "large"
```

- **Tiny**: 1-2 steps, no complexity keywords
- **Small**: 2-3 steps, no complexity keywords
- **Medium**: 3-5 steps, OR any plan with complexity keywords
- **Large**: 6+ steps, OR medium plan with multiple complexity keywords

Complexity keywords: "integration", "new system", "refactor", "multi-file", "migration", "provider", "architecture", "breaking change"

### Menu Construction

A new utility function returns the appropriate menu options:

```
getMenuOptions(size: PlanSize, workflowState: WorkflowState): string[]
```

The menu adapts based on plan size and which skills have already been run.

### Workflow State

Extended state persisted via `appendEntry`:

```typescript
interface WorkflowState {
  enabled: boolean;
  todos: TodoItem[];
  executing: boolean;
  planText: string;         // Full plan text for passing to skills
  planSize: PlanSize;       // Classified size
  preMortemRun: boolean;    // Whether pre-mortem was run for current plan
  reviewRun: boolean;       // Whether review-plan was run
  prdConverted: boolean;    // Whether plan-to-prd was invoked
  postMortemRun: boolean;   // Whether post-mortem ran after execution
}
```

### Skill Invocation

When the user selects a skill-backed menu option, the extension uses `pi.sendUserMessage()` with `/skill:name` to trigger the skill, prefixed with the plan context so the skill has what it needs without re-asking.

---

## 3. Tasks

### Task 1: Add plan classification utilities to utils.ts

Add new pure functions to `.pi/extensions/plan-mode/utils.ts`:

- `classifyPlanSize(items: TodoItem[], planText: string): PlanSize`
  - Counts items, scans planText for complexity keywords
  - Returns "tiny" | "small" | "medium" | "large"
- `getMenuOptions(size: PlanSize, workflowState: WorkflowState): string[]`
  - Returns ordered menu option strings based on size and state
  - Tiny: ["Execute the plan (track progress)", "Stay in plan mode", "Refine the plan"]
  - Small: ["Run pre-mortem, then execute", "Execute directly (track progress)", "Review the plan", "Convert to PRD", "Stay in plan mode", "Refine the plan"]
  - Medium/Large: ["Convert to PRD (recommended)", "Run pre-mortem, then execute", "Review the plan", "Execute directly (track progress)", "Stay in plan mode", "Refine the plan"]
  - If preMortemRun is true, change "Run pre-mortem, then execute" to "Execute the plan (pre-mortem ✓)"
  - If reviewRun is true, remove "Review the plan" option
  - If prdConverted is true, remove "Convert to PRD" option
- `getPostExecutionMenuOptions(workflowState: WorkflowState): string[]`
  - Returns: ["Run post-mortem (extract learnings)", "Capture learnings to memory", "Done"]
- Export `PlanSize` type and `WorkflowState` interface

**Acceptance Criteria:**
- `classifyPlanSize` correctly classifies based on step count and keywords
- `getMenuOptions` returns correct menus for all 4 sizes
- `getMenuOptions` adapts when workflow state indicates skills already run
- `getPostExecutionMenuOptions` returns correct post-execution options
- All functions are pure (no side effects) and exported
- TypeScript compiles without errors

---

### Task 2: Write tests for plan classification and menu utilities

Create `.pi/extensions/plan-mode/utils.test.ts` with comprehensive tests:

**Tests for classifyPlanSize:**
- 1 step, no keywords → "tiny"
- 2 steps, no keywords → "tiny"
- 3 steps, no keywords → "small"
- 2 steps with "integration" in text → "medium" (keyword bump)
- 4 steps, no keywords → "medium"
- 6 steps → "large"
- 3 steps with "new system" and "migration" → "large" (multiple keywords)

**Tests for getMenuOptions:**
- Tiny: returns 3 options, first is "Execute"
- Small: returns 6 options, first is "Run pre-mortem"
- Medium: returns 6 options, first is "Convert to PRD (recommended)"
- Large: returns 6 options, first is "Convert to PRD (recommended)"
- Small + preMortemRun=true: first option changes to "Execute the plan (pre-mortem ✓)"
- Medium + prdConverted=true: "Convert to PRD" removed from options

**Tests for getPostExecutionMenuOptions:**
- Default: returns 3 options
- postMortemRun=true: "Run post-mortem" not in options

**Tests for existing functions (isSafeCommand, extractTodoItems, etc.):**
- `isSafeCommand("npm run typecheck")` → true
- `isSafeCommand("npm test")` → true
- `isSafeCommand("npm run test:all")` → true
- `isSafeCommand("rm -rf /")` → false
- `extractTodoItems` with Plan: header → correct items
- `cleanStepText` truncation and formatting

**Acceptance Criteria:**
- All tests pass with `tsx --test .pi/extensions/plan-mode/utils.test.ts`
- Coverage for happy path, edge cases, and boundary conditions
- Uses `node:test` and `node:assert/strict` per project conventions
- Test file imports from `./utils.js` (NodeNext resolution)

---

### Task 3: Update plan-mode extension with skill-aware menus

Modify `.pi/extensions/plan-mode/index.ts` to:

**3a. Extend workflow state:**
- Add `planText`, `planSize`, `preMortemRun`, `reviewRun`, `prdConverted`, `postMortemRun` to persisted state
- Update `persistState()` to include new fields
- Update `session_start` restore to include new fields

**3b. Replace static menu in `agent_end` handler:**
- After extracting todo items, also capture full plan text from the assistant message
- Call `classifyPlanSize(todoItems, planText)` to determine size
- Call `getMenuOptions(size, workflowState)` to get dynamic menu
- Replace the hardcoded 3-option `ctx.ui.select()` with the dynamic menu

**3c. Handle skill-backed menu choices:**
- "Run pre-mortem, then execute" → Capture plan text, send `/skill:run-pre-mortem` with plan context prefixed. After skill completes, set `preMortemRun = true`, then transition to execution mode.
- "Convert to PRD (recommended)" / "Convert to PRD" → Send `/skill:plan-to-prd` with plan context. Set `prdConverted = true`. Stay in plan mode (PRD execution happens in a new session).
- "Review the plan" → Send `/skill:review-plan` with plan context. Set `reviewRun = true`. Stay in plan mode.
- "Execute the plan (pre-mortem ✓)" / "Execute directly (track progress)" / "Execute the plan (track progress)" → Current execution behavior (transition to execution mode, track DONE markers).

**3d. Add post-execution completion flow:**
- In the `agent_end` handler, when all todos are completed (currently shows "Plan Complete! ✓"):
  - Call `getPostExecutionMenuOptions(workflowState)`
  - Show select menu with post-execution options
  - "Run post-mortem (extract learnings)" → Send `/skill:prd-post-mortem`
  - "Capture learnings to memory" → Send a message asking the agent to create a memory entry in `memory/entries/`
  - "Done" → Current behavior (clear state)

**Acceptance Criteria:**
- Plan size classification runs after todo extraction
- Menu options change based on plan size
- Selecting "Run pre-mortem" invokes the skill with plan context
- Selecting "Convert to PRD" invokes the skill with plan context
- Selecting "Review the plan" invokes the skill with plan context
- Post-execution menu appears after all steps complete
- Workflow state persists across sessions
- Extension compiles and loads without errors

---

### Task 4: Add lifecycle status widget

Enhance the `updateStatus` function in the extension to show the planning lifecycle position:

**4a. Footer status updates:**
- Plan mode: `⏸ plan` (current)
- Plan mode + plan extracted: `📋 plan (N steps, {size})`
- Pre-mortem complete: `🔍 pre-mortem ✓`
- Execution mode: `📋 {completed}/{total}` (current)
- Execution complete: `✅ complete`

**4b. Lifecycle widget (above editor):**
When a plan exists and we're in the workflow, show a pipeline indicator via `ctx.ui.setWidget()`:

```
📋 Plan (5 steps) → 🔍 Pre-mortem ✓ → ⚡ Executing [2/5] → 📊 Post-mortem
```

- Highlight the current stage with accent color
- Dim completed stages
- Mute future stages

**Acceptance Criteria:**
- Footer status shows plan size after extraction
- Lifecycle widget appears when a plan is active
- Current stage is highlighted
- Widget updates as workflow progresses
- Widget clears when workflow resets

---

### Task 5: Integration testing and documentation

**5a. Manual integration test:**
- Start Pi with `pi --plan`
- Create a 5-step plan → verify "Convert to PRD (recommended)" appears first in menu
- Create a 2-step plan → verify "Execute" appears first, pre-mortem is available but not first
- Select "Run pre-mortem" → verify `/skill:run-pre-mortem` is invoked with plan context
- Execute a plan → verify `[DONE:n]` tracking works
- Complete all steps → verify post-execution menu appears

**5b. Run quality gates:**
- `npm run typecheck` passes
- `npm test` passes (full suite including new utils tests)
- Extension loads without errors

**5c. Update APPEND_SYSTEM.md:**
- Add a note in the execution path section that plan mode now surfaces these options automatically
- Reference: "The plan-mode extension integrates pre-mortem, PRD gateway, review, and post-mortem skills directly into the workflow."

**5d. Create backlog item for future enhancements:**
- `dev/backlog/features/plan-mode-enhancements.md` with ideas:
  - Auto-detect complexity keywords beyond step count
  - Timed pre-mortem nudge for medium plans
  - Custom `arete_plan` tool for programmatic CLI access during planning
  - Subagent integration when Pi subagent extension is available

**Acceptance Criteria:**
- All quality gates pass
- Extension loads and lifecycle flows work end-to-end
- APPEND_SYSTEM.md updated
- Backlog item created for future enhancements

---

## 4. Dependencies Between Tasks

```
Task 1 → Task 2 (tests need the functions)
Task 1 → Task 3 (extension uses the functions)
Task 2 → Task 3 (tests should pass before integration)
Task 3 → Task 4 (widget needs workflow state)
Task 3 + Task 4 → Task 5 (integration testing needs everything)
```

Execution order: 1 → 2 → 3 → 4 → 5

---

## 5. Testing Strategy

- **Unit tests** (Task 2): Pure function tests for classifyPlanSize, getMenuOptions, getPostExecutionMenuOptions, plus existing utils
- **Integration tests** (Task 5): Manual verification of extension lifecycle
- **Quality gates**: `npm run typecheck && npm test` after every task
- **Existing tests**: Must continue to pass (no regressions)

---

## 6. Success Criteria

- Plan mode surfaces skill options contextually based on plan size
- Medium/Large plans see "Convert to PRD" as the top recommendation
- Pre-mortem can be invoked directly from the plan menu
- Post-execution offers learnings extraction
- Lifecycle widget shows workflow position
- All existing plan-mode functionality preserved (backward compatible)
- Quality gates pass throughout
