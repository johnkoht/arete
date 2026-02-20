# PRD: Planning System Refinement

**Version**: 1.1
**Status**: Ready (pre-mortem complete)
**Date**: 2026-02-18
**Branch**: `feature/planning-system-refinement`
**Depends on**: Existing plan-mode extension, agent prompts in `.pi/agents/`

---

## 1. Problem & Goals

### Problem

The plan-mode extension has infrastructure for multi-agent orchestration but doesn't actually use it:

1. **Agents aren't wired**: `.pi/agents/` has prompts for orchestrator, reviewer, task-agent, but only product-manager is ever loaded.
2. **Menu flow is confusing**: After each agent response, users see a grab-bag of all options instead of a linear "what's next" progression.
3. **Artifacts are placeholders**: When `/pre-mortem` or `/review` runs, a stub file is saved instead of the actual output.
4. **"Start build" bypasses `/build`**: Selecting "Start build now" from the menu bypasses `handleBuild()`.
5. **Pipeline order is wrong**: `getMissingGates()` returns review → pre-mortem → prd, but logical flow is: plan → PRD → pre-mortem → review → build.

### Goals

1. **Linear pipeline flow**: After each step, show only "Refine [current step]" or "Continue to [next step]".
2. **Auto-save artifacts**: Extract actual content from agent responses and save to artifact files.
3. **Wire agent prompts**: Inject appropriate agent prompt based on active command.
4. **Route through commands**: Menu selections invoke actual commands (`/pre-mortem`, `/review`, `/build`).
5. **Correct pipeline order**: plan → PRD → pre-mortem → review → build → done.
6. **Flexible command invocation**: `/pre-mortem` and `/review` can be called anytime; `/build` gates.

### Out of Scope

- Subagent spawning (Pi doesn't have Task tool)
- Cross-model switching
- Changes to skill SKILL.md content
- End-user/GUIDE mode support

---

## 2. Architecture

### State Model

```typescript
interface PlanModeState {
  // Flow tracking
  currentPhase: Phase;        // Where user is in linear flow (for menus)
  activeCommand: string|null; // Which command is running (for prompt injection)
  
  // Completion tracking (independent of phase)
  preMortemRun: boolean;      // Has pre-mortem completed?
  reviewRun: boolean;         // Has review completed?
  prdConverted: boolean;      // Has PRD been created?
  
  // Existing
  planModeEnabled: boolean;
  executionMode: boolean;
  todoItems: TodoItem[];
  // ...
}
```

**Key insight**: `currentPhase` controls menus. `activeCommand` controls prompts. Boolean flags track completion.

### Command Flexibility

| Command | When Allowed | Phase Impact | Completion Flag |
|---------|--------------|--------------|-----------------|
| `/pre-mortem` | Anytime | None | `preMortemRun: true` |
| `/review` | Anytime | None | `reviewRun: true` |
| `/build` | Anytime (gates) | → build | — |

### Build Gating

```
/build invoked:
  if (!preMortemRun && planSize !== 'tiny'):
    confirm("Pre-mortem not completed. Skip?")
  if (!reviewRun):
    notify("Review not completed. Proceeding.")
  → proceed to build
```

---

## 3. Tasks

### Task 1: Add phase tracking to state

Add `currentPhase` and `activeCommand` fields to `PlanModeState`.

**Acceptance Criteria:**
- Add `currentPhase: Phase` where Phase = `"plan" | "prd" | "pre-mortem" | "review" | "build" | "done"`
- Add `activeCommand: string | null` to track which command is running
- Phase initializes to "plan" on `/plan` or `/plan new`
- Phase persists across sessions via `appendEntry()`
- `createDefaultState()` sets both fields
- **Note**: Phase controls menus; completion flags (`preMortemRun` etc.) track what's done — keep them separate

---

### Task 2: Create phase-based menu helper

Replace `getMenuOptions()` with `getPhaseMenu()` returning exactly two options.

**Acceptance Criteria:**
- Add `Phase` type export
- Add `getPhaseMenu(phase, planSize): { refine: string, next: string | null }`
- Plan phase: "Refine plan" / "Continue to PRD" (medium/large) or "Continue to pre-mortem" (tiny/small)
- PRD phase: "Refine PRD" / "Continue to pre-mortem"
- Pre-mortem phase: "Refine pre-mortem" / "Continue to review" or "Skip review → build"
- Review phase: "Refine review" / "Continue to build"
- Build/done: return nulls (no menu)
- Keep `getMenuOptions()` but mark `@deprecated`
- Tests pass

---

### Task 3: Implement auto-save for artifacts

Extract content from agent response and save to artifact files.

**Acceptance Criteria:**
- Add `extractPhaseContent(response: string, phase: Phase): string`
- Extraction looks for headers: "Plan:", "## Pre-Mortem", "## Review", "### Risk"
- If no headers found, return full response (fallback)
- Never save empty string — log warning and skip
- After plan phase: update `plan.md` content section
- After pre-mortem: save to `pre-mortem.md` with actual content
- After review: save to `review.md` with actual content
- Add extraction comment: `<!-- Extracted at {timestamp} -->`
- Remove placeholder-saving code from `handlePreMortem` and `handleReview`

---

### Task 4: Route menu selections through commands

"Continue to X" invokes actual commands; commands are phase-independent.

**Acceptance Criteria:**
- "Continue to pre-mortem" calls `handlePreMortem()` + advances phase
- "Continue to review" calls `handleReview()` + advances phase
- "Continue to build" calls `handleBuild()`
- `/pre-mortem` and `/review` can be called from ANY phase (don't check currentPhase)
- These commands set completion flags but DON'T change `currentPhase`
- Remove direct `plan-mode-execute` bypass path
- Phase advances only via menu "Continue to X" selection

---

### Task 5: Wire agent prompts into commands

Inject appropriate agent prompt based on `activeCommand`, not `currentPhase`.

**Acceptance Criteria:**
- Set `state.activeCommand` when command starts, clear when done
- In `before_agent_start`, inject prompt based on `activeCommand`:
  - `"pre-mortem"` → orchestrator.md
  - `"review"` → reviewer.md
  - `"build"` → orchestrator.md
  - `null` (plan mode) → product-manager.md
- Injection order: base context → agent prompt → plan content
- Only one agent prompt injected per turn
- `getAgentPrompt()` is called (not hardcoded strings)

---

### Task 6: Update pipeline order in lifecycle.ts

Change gate order to: prd → pre-mortem → review.

**Acceptance Criteria:**
- `getMissingGates()` returns gates in order: prd, pre-mortem, review
- `getGateRequirements()` returns in same order
- `/plan next` shows gates in this order
- Update lifecycle tests to assert new order
- Grep and fix any order-dependent test assertions

---

### Task 7: Update widget pipeline stages

Add PRD stage and show completion checkmarks.

**Acceptance Criteria:**
- Add `{ emoji: "📄", label: "PRD", key: "prd" }` to `PIPELINE_STAGES` after Plan
- Widget shows 6 stages: Plan → PRD → Pre-mortem → Review → Build → Done
- `getCurrentStage()` uses `currentPhase` as primary source
- `getCompletedStages()` marks stages based on phase progression
- Footer shows completion: `📋 plan (pre-mortem ✓, review ✓)` when applicable
- Widget tests pass for each phase value

---

### Task 8: Handle Refine option and /build gating

Implement refine loop and build gate logic.

**Acceptance Criteria:**
- "Refine X" opens editor for feedback
- User input sent via `sendUserMessage()` with phase context
- Track `isRefining: boolean` to prevent menu loop
- After agent response: clear `isRefining`, auto-save, show menu
- `/build` gating:
  - If `!preMortemRun && planSize !== 'tiny'`: `confirm("Pre-mortem not completed. Skip?")`
  - If `!reviewRun`: `notify("Review not completed. Proceeding.")`
  - Proceed to build after acknowledgment
- Can refine multiple times before continuing

---

## 4. Dependencies

```
Task 1 (state) ──┬── Task 2 (menu)
                 ├── Task 5 (prompts)
                 └── Task 7 (widget)

Task 2 (menu) ────── Task 4 (routing)

Task 3 (auto-save) ─ Task 4 (routing)

Task 6 (lifecycle) ─ Task 7 (widget)

Task 4 + 7 ───────── Task 8 (refine + gating)
```

**Execution order**: 1 → 2,5,6,7 (parallel) → 3 → 4 → 8

---

## 5. Quality Gates

After every task:
- `npm run typecheck` passes
- `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` passes
- `npm test` passes (no regressions)

---

## 6. Success Criteria

1. Menu shows only "Refine X" / "Continue to Y" (no grab-bag)
2. `pre-mortem.md` and `review.md` contain actual analysis, not placeholders
3. "Continue to build" routes through `handleBuild()`
4. `/pre-mortem` and `/review` work from any phase
5. Widget shows: Plan → PRD → Pre-mortem → Review → Build → Done
6. `/build` warns if pre-mortem incomplete (for non-tiny plans)
7. Agent prompts injected based on active command
8. All existing plan-mode tests pass
