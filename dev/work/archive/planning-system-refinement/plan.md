---
title: Planning System Refinement
slug: planning-system-refinement
status: complete
size: large
created: 2026-02-18T03:46:41.229Z
updated: 2026-02-22T11:55:00.000Z
completed: 2026-02-18
blocked_reason: null
previous_status: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 8
---

I'm now in plan mode. Let me formalize the plan:

---

## Fix Plan-Mode Linear Flow & Agent Wiring

**Problem**: Plan-mode has infrastructure for multi-agent orchestration but doesn't use it. The menu-driven flow is confusing — shows all options instead of a linear pipeline. Artifacts aren't saved with actual content.

**Goal**: Linear pipeline (plan → PRD → pre-mortem → review → build → done) with proper agent injection, auto-save, and simple "Refine / Next" choices at each step.

---

Plan:
1. **Add explicit phase tracking to state** — Track current phase so we know which agent/menu to show.
   - AC: Add `currentPhase: "plan" | "prd" | "pre-mortem" | "review" | "build" | "done"` to `PlanModeState`
   - AC: Phase initializes to "plan" when plan mode starts
   - AC: Phase advances when user selects "Continue to X"
   - AC: Phase persists across sessions via `appendEntry`

2. **Simplify per-step menu to "Refine / Continue"** — Replace multi-option menu with contextual two-choice menu based on current phase.
   - AC: Plan phase: "Refine plan" / "Continue to PRD" (medium/large) or "Continue to pre-mortem" (small/tiny)
   - AC: PRD phase: "Refine PRD" / "Continue to pre-mortem"
   - AC: Pre-mortem phase: "Refine pre-mortem" / "Continue to review" or "Skip review → build"
   - AC: Review phase: "Refine review" / "Continue to build"
   - AC: Remove `getMenuOptions()` grab-bag approach

3. **Auto-save artifacts after agent responses** — Extract content from agent response and save to artifact file, not placeholders.
   - AC: After plan extracted, save actual plan text to `plan.md` content section
   - AC: After pre-mortem response, extract and save to `pre-mortem.md`
   - AC: After review response, extract and save to `review.md`
   - AC: Add `extractArtifactContent(text, phase)` helper to parse agent output
   - AC: Save happens in `agent_end` handler before showing menu

4. **Route "Continue to X" through actual commands** — Menu selections invoke `/pre-mortem`, `/review`, `/build` so proper setup happens.
   - AC: "Continue to pre-mortem" calls `handlePreMortem()` and advances phase
   - AC: "Continue to review" calls `handleReview()` and advances phase
   - AC: "Continue to build" calls `handleBuild()` (not direct execution bypass)
   - AC: Remove the direct `plan-mode-execute` path that bypasses `/build`

5. **Wire agent prompts into each phase** — Load and inject appropriate agent prompt when entering each phase via `before_agent_start`.
   - AC: Plan phase: inject `product-manager.md` (already done)
   - AC: Pre-mortem phase: inject `orchestrator.md` (risk analysis is orchestrator's job)
   - AC: Review phase: inject `reviewer.md`
   - AC: Build phase: inject `orchestrator.md` for coordination, `task-agent.md` for execution context
   - AC: Agent prompt injection based on `state.currentPhase`

6. **Update pipeline order in lifecycle.ts** — Change gate order to: prd → pre-mortem → review (matching the linear flow).
   - AC: `getMissingGates()` returns gates in order: prd, pre-mortem, review
   - AC: `getGateRequirements()` returns in same order
   - AC: `/plan next` suggests gates in this order

7. **Update widget to reflect new pipeline** — Widget stages should match: plan → PRD → pre-mortem → review → build → done.
   - AC: Add "PRD" stage to `PIPELINE_STAGES` between Plan and Pre-mortem
   - AC: `getCurrentStage()` logic updated to check `has_prd` before `has_pre_mortem`
   - AC: `getCompletedStages()` updated accordingly

8. **Handle "Refine" option properly** — Stay in current phase, let user provide feedback, agent responds, auto-save updated content.
   - AC: "Refine X" opens editor for user feedback
   - AC: Sends feedback to agent with phase context
   - AC: Agent response triggers save of updated artifact
   - AC: Menu re-shows same phase options (Refine / Continue)

---

- **Size**: large (8 steps, touches state, commands, lifecycle, widget, agent wiring)
- **Steps**: 8
- **Key files**: `index.ts`, `commands.ts`, `lifecycle.ts`, `widget.ts`, `utils.ts`, `agents.ts`
- **Key risks**: 
  - Extracting artifact content from free-form agent responses (may need section markers)
  - Ensuring phase state persists correctly across sessions
  - Breaking existing plan-mode flows during refactor
- **Dependencies**: Existing plan-mode infrastructure, agent prompt files in `.pi/agents/`