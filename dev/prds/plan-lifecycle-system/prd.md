# PRD: Plan Lifecycle System

**Version**: 1.0
**Status**: Ready
**Date**: 2026-02-16
**Branch**: `feature/plan-lifecycle-system`
**Depends on**: Pi Dev Workflow (complete), existing skills (execute-prd, plan-to-prd, run-pre-mortem, review-plan, prd-post-mortem, prd-to-json)
**Supersedes**: `dev/prds/plan-mode-skills-integration/` (draft, subset of this scope)

---

## 1. Problem & Goals

### Problem

The plan-mode extension and Areté's planning skills operate independently. Today:

- Plans are **ephemeral** — they exist only in conversation context. There's no persistence, no way to list past plans, resume a draft, or track a plan through its lifecycle.
- The planning lifecycle is **advisory, not structural** — the execution path decision tree (Tiny/Small/Medium/Large) is text injected into the system prompt. The LLM must self-apply it, which is fragile.
- **Agent roles are implicit** — the orchestrator, reviewer, and task-agent exist for PRD execution, but there's no Product Manager agent for the planning phase, and no model configuration per role.
- **Gate checks are manual** — the user must remember to invoke `/skill:run-pre-mortem` or `/skill:review-plan`. The extension doesn't surface these at the right moment or track what's been done.
- **No cross-model review** — reviews happen on the same model that created the plan, losing the benefit of a fresh perspective from a different model.

The result: ideas go from "conversation" to "build" without a structured path. Plans get lost, reviews get skipped, and the quality gates that exist in the skills aren't reliably applied.

### Goals

1. **Plan persistence**: Save plans to `dev/plans/{slug}/` with YAML frontmatter tracking status, size, gates completed, and metadata. Plans survive across sessions.
2. **Lifecycle state machine**: Define clear statuses (draft → planned → reviewed → approved → in-progress → completed, plus blocked/on-hold) with gate requirements per plan size.
3. **Agent model configuration**: Configure model assignments per agent role in `.pi/settings.json`. Support primary/secondary models for cross-model review.
4. **Product Manager agent**: New agent definition for the planning phase — shapes ideas, defines acceptance criteria, estimates size.
5. **Smart gate commands**: `/review`, `/pre-mortem`, `/prd` commands that load the current plan, invoke the appropriate skill, save the output as an artifact, and update plan status.
6. **Lifecycle orchestration**: `/plan next` command that reads current status and gates, presents the right options, and drives the plan forward.
7. **Build integration**: `/build` command that transitions an approved plan to in-progress and triggers execute-prd or direct execution.
8. **Lifecycle visibility**: Status widget showing pipeline position (Plan → Review → Pre-mortem → Build → Done).

### Out of Scope

- Subagent spawning (Pi doesn't have a Task tool yet — subagents are a separate concern)
- Changes to existing skill SKILL.md content (only wiring them into the extension)
- End-user/GUIDE mode support (this is BUILDER tooling only)
- Automated model switching via Pi API for cross-model review (Pi's `setModel()` applies to the current session — true cross-model review would need a new session or subagent. For v1, we'll prepare the architecture but the actual model switch will be manual: the extension suggests which model to use and the user switches via `/model`)
- Changes to `.cursor/rules/` (Cursor workflow is unaffected)

### Design Constraint: Model Switching

Pi's `pi.setModel()` changes the model for the current session. For true cross-model review (e.g., plan created by Opus, reviewed by GPT-5.3), the user would need to:
1. Switch models via `/model` or the extension calling `pi.setModel()`
2. Run the review
3. Switch back

The extension will **attempt** `pi.setModel()` when a secondary model is configured, but if the model isn't available (no API key), it falls back to the current model with a notification. The architecture supports full auto-switching; the limitation is practical (API key availability).

---

## 2. Architecture

### Plan File Format

Plans are stored in `dev/plans/{slug}/` with this structure:

```
dev/plans/
├── README.md                    # Index (auto-generated or manual)
├── slack-integration/
│   ├── plan.md                  # Plan with YAML frontmatter
│   ├── review.md                # Cross-model review output (if done)
│   ├── pre-mortem.md            # Pre-mortem analysis (if done)
│   └── prd.md                   # PRD (if generated)
└── search-perf-fix/
    └── plan.md
```

**plan.md frontmatter:**

```yaml
---
title: Slack Integration
slug: slack-integration
status: draft
size: large
created: 2026-02-16T15:00:00Z
updated: 2026-02-16T15:00:00Z
completed: null
blocked_reason: null
previous_status: null
has_review: false
has_pre_mortem: false
has_prd: false
backlog_ref: null
steps: 8
---
```

### Lifecycle State Machine

```
Statuses: draft → planned → reviewed → approved → in-progress → completed
                                                 → blocked (from any)
                                                 → on-hold (from any)
```

Valid transitions:

| From | To | Trigger |
|------|----|---------|
| draft | planned | PM confirms plan is coherent |
| planned | reviewed | Cross-model review completed |
| planned | approved | Pre-mortem done (+ PRD if large); review skipped |
| reviewed | approved | Pre-mortem done (+ PRD if large) |
| approved | in-progress | User triggers `/build` |
| in-progress | completed | All tasks done, quality gates pass |
| any | blocked | `/plan block <reason>` |
| any | on-hold | `/plan hold` |
| blocked | (previous) | `/plan resume` |
| on-hold | (previous) | `/plan resume` |

Gate requirements by size:

| Size | Steps | Review | Pre-mortem | PRD |
|------|-------|--------|-----------|-----|
| tiny | 1-2 | optional | optional | skip |
| small | 2-3 | optional | optional | skip |
| medium | 3-5 | optional | recommended | optional |
| large | 6+ | recommended | mandatory | mandatory |

"Optional" = user always has the choice. "Recommended" = extension suggests but doesn't block. "Mandatory" = extension requires before allowing transition to approved.

### Agent Model Configuration

Added to `.pi/settings.json`:

```json
{
  "tools": ["read", "bash", "edit", "write"],
  "agents": {
    "product-manager": {
      "primary": "anthropic/claude-opus-4-6",
      "secondary": "openai/gpt-5.3"
    },
    "orchestrator": {
      "model": "anthropic/claude-opus-4-6"
    },
    "reviewer": {
      "model": "anthropic/claude-sonnet-4-6"
    },
    "developer": {
      "model": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

The extension reads this config and uses it to:
- Inject the appropriate agent system prompt per phase
- Attempt model switching for cross-model review (`pi.setModel()`)
- Display the configured model in status/notifications

### Extension Module Structure

The plan-mode extension is refactored from a single file into a multi-file module:

```
.pi/extensions/plan-mode/
├── index.ts          # Entry point — command registration, event handlers
├── commands.ts       # All command handlers (/plan, /review, /pre-mortem, /prd, /build)
├── lifecycle.ts      # State machine — transitions, gate logic
├── persistence.ts    # File I/O — save/load plans, artifacts
├── agents.ts         # Agent config loading, model switching, prompt injection
├── widget.ts         # Lifecycle status widget rendering
└── utils.ts          # Existing utils (safe commands, todo extraction, plan classification)
```

### Save Artifact Tool

A scoped tool `save_plan_artifact` is registered during gate phases. It allows the LLM to save its review/pre-mortem/PRD output directly to the plan directory, rather than the extension parsing responses. The tool validates that writes only go to `dev/plans/{current-slug}/`.

---

## 3. Tasks

### Task 1: Plan persistence module

Create `.pi/extensions/plan-mode/persistence.ts` with plan file I/O.

**Implementation:**
- `PlanFrontmatter` type with all fields from the architecture section
- `PlanStatus` and `PlanSize` types
- `savePlan(slug, frontmatter, content)` — writes `dev/plans/{slug}/plan.md` with YAML frontmatter. Creates directory if needed. Uses `---` delimited YAML block followed by markdown content.
- `loadPlan(slug)` — reads `dev/plans/{slug}/plan.md`, parses YAML frontmatter and markdown content. Returns `{ frontmatter: PlanFrontmatter, content: string }`.
- `listPlans()` — scans `dev/plans/*/plan.md`, returns array of `{ slug, frontmatter }` sorted by `updated` descending.
- `updatePlanFrontmatter(slug, updates: Partial<PlanFrontmatter>)` — merges updates into existing frontmatter, sets `updated` to now, rewrites file.
- `savePlanArtifact(slug, filename, content)` — writes `dev/plans/{slug}/{filename}` (e.g., `review.md`, `pre-mortem.md`).
- `loadPlanArtifact(slug, filename)` — reads artifact file, returns content or null.
- `slugify(title)` — converts title to kebab-case slug.
- `deletePlan(slug)` — removes `dev/plans/{slug}/` directory.
- All file I/O via Node.js `node:fs` and `node:path`. No LLM tool access needed.
- YAML frontmatter parsing: simple regex-based parser (split on `---` delimiters, parse key-value pairs). No external YAML library dependency needed for the simple flat structure.

**Acceptance Criteria:**
- `savePlan` creates directory and writes file with valid YAML frontmatter
- `loadPlan` correctly parses frontmatter and separates content
- `listPlans` returns all plans sorted by updated date
- `updatePlanFrontmatter` merges partial updates without losing other fields
- `savePlanArtifact` writes to correct plan directory
- `slugify` produces valid kebab-case slugs (handles spaces, special chars, uppercase)
- All functions handle missing files/directories gracefully (return null or empty array, don't throw)
- TypeScript compiles without errors
- No external dependencies (uses node:fs, node:path only)

---

### Task 2: Lifecycle state machine module

Create `.pi/extensions/plan-mode/lifecycle.ts` with status transitions and gate logic.

**Implementation:**
- `VALID_TRANSITIONS` map defining which status→status transitions are allowed (from the architecture table)
- `canTransition(from: PlanStatus, to: PlanStatus): boolean` — checks if transition is valid
- `GATE_REQUIREMENTS` — gate requirements per size (from the architecture table)
- `getGateRequirements(size: PlanSize, currentStatus: PlanStatus): GateRequirement[]` — returns gates needed for the next transition. Each gate has: `{ gate: 'review' | 'pre-mortem' | 'prd', required: boolean, recommended: boolean, label: string }`.
- `getAvailableTransitions(status: PlanStatus, size: PlanSize, gates: { has_review: boolean, has_pre_mortem: boolean, has_prd: boolean }): PlanStatus[]` — returns valid next statuses given current gates.
- `getMissingGates(size: PlanSize, gates: { has_review: boolean, has_pre_mortem: boolean, has_prd: boolean }): GateRequirement[]` — returns gates not yet completed, indicating which are required vs recommended.
- `isReadyToApprove(size: PlanSize, gates: { has_review: boolean, has_pre_mortem: boolean, has_prd: boolean }): { ready: boolean, missing: GateRequirement[] }` — checks if all mandatory gates are satisfied for the given size.
- Blocked/on-hold logic: `previous_status` is stored in frontmatter so `/plan resume` can restore it.

**Acceptance Criteria:**
- All valid transitions from the architecture table are allowed
- Invalid transitions return false (e.g., draft → completed)
- Gate requirements match the size table (tiny=all optional, large=pre-mortem+PRD mandatory)
- `isReadyToApprove` blocks approval when mandatory gates are missing
- `isReadyToApprove` allows approval when only optional/recommended gates are missing
- `getMissingGates` correctly distinguishes required vs recommended
- Blocked/on-hold transitions work from any status
- Resume returns to `previous_status`
- TypeScript compiles without errors

---

### Task 3: Tests for persistence and lifecycle

Create `.pi/extensions/plan-mode/persistence.test.ts` and `.pi/extensions/plan-mode/lifecycle.test.ts`.

**persistence.test.ts:**
- `savePlan` + `loadPlan` round-trip: frontmatter and content preserved
- `savePlan` creates nested directory if it doesn't exist
- `loadPlan` returns null for non-existent plan
- `listPlans` returns empty array when no plans exist
- `listPlans` returns plans sorted by updated date (most recent first)
- `updatePlanFrontmatter` merges partial updates (e.g., only status) without losing other fields
- `updatePlanFrontmatter` sets `updated` timestamp
- `savePlanArtifact` + `loadPlanArtifact` round-trip
- `loadPlanArtifact` returns null for non-existent artifact
- `slugify` tests: "Slack Integration" → "slack-integration", "Add CLI command" → "add-cli-command", already-slugified passes through, special characters stripped
- `deletePlan` removes directory
- `deletePlan` handles non-existent plan gracefully
- Use `node:fs` `mkdtempSync` for temp directories in tests; clean up in `afterEach`

**lifecycle.test.ts:**
- `canTransition('draft', 'planned')` → true
- `canTransition('draft', 'completed')` → false
- `canTransition('in-progress', 'blocked')` → true (any → blocked)
- `canTransition('blocked', 'draft')` → true (resume to previous)
- `getGateRequirements('tiny', 'planned')` → all optional
- `getGateRequirements('large', 'planned')` → pre-mortem required, PRD required, review recommended
- `isReadyToApprove('large', { has_review: false, has_pre_mortem: true, has_prd: true })` → ready (review is recommended, not required)
- `isReadyToApprove('large', { has_review: false, has_pre_mortem: false, has_prd: true })` → not ready, missing pre-mortem
- `getMissingGates('medium', { has_review: false, has_pre_mortem: false, has_prd: false })` → 3 gates, pre-mortem recommended, others optional
- `getAvailableTransitions` returns correct options for various states

**Acceptance Criteria:**
- All tests pass with `tsx --test .pi/extensions/plan-mode/persistence.test.ts .pi/extensions/plan-mode/lifecycle.test.ts`
- Tests use `node:test` and `node:assert/strict`
- Tests use `.js` extensions in imports
- Persistence tests use temp directories (no side effects on `dev/plans/`)
- Coverage for happy path, edge cases, and error handling

---

### Task 4: Agent configuration module

Create `.pi/extensions/plan-mode/agents.ts` for agent model config and prompt loading.

**Implementation:**
- `AgentRole` type: `'product-manager' | 'orchestrator' | 'reviewer' | 'developer'`
- `AgentConfig` type: `{ model?: string, primary?: string, secondary?: string }`
- `loadAgentConfig()` — reads `.pi/settings.json`, returns the `agents` section. If no agents section exists, returns sensible defaults (no model override = use current model).
- `getAgentModel(role: AgentRole, variant?: 'primary' | 'secondary'): string | null` — returns the configured model ID for a role. For roles with primary/secondary (product-manager), `variant` selects which. Returns null if not configured (meaning: use current model).
- `getAgentPrompt(role: AgentRole): string | null` — reads `.pi/agents/{role}.md`, strips YAML frontmatter, returns the markdown content. Returns null if agent file doesn't exist.
- `resolveModel(modelId: string, modelRegistry: ModelRegistry): Model | null` — parses "provider/model-id" string and finds the model in Pi's registry. Returns null if not found.
- Export all types.

**Acceptance Criteria:**
- `loadAgentConfig` reads from `.pi/settings.json` and returns agents section
- `loadAgentConfig` returns empty defaults when agents section is missing
- `getAgentModel` returns correct model for each role
- `getAgentModel` returns null when role not configured
- `getAgentModel('product-manager', 'secondary')` returns the secondary model
- `getAgentPrompt` reads and returns agent markdown content (without frontmatter)
- `getAgentPrompt` returns null for non-existent agent
- `resolveModel` parses "provider/model-id" format
- TypeScript compiles without errors

---

### Task 5: Tests for agent configuration

Create `.pi/extensions/plan-mode/agents.test.ts`.

**Tests:**
- `loadAgentConfig` with full config → returns all roles
- `loadAgentConfig` with empty settings → returns defaults
- `loadAgentConfig` with missing agents key → returns defaults
- `getAgentModel('product-manager')` → returns primary model
- `getAgentModel('product-manager', 'primary')` → returns primary model
- `getAgentModel('product-manager', 'secondary')` → returns secondary model
- `getAgentModel('orchestrator')` → returns model
- `getAgentModel('unknown-role')` → returns null
- `getAgentPrompt` with valid agent file → returns content without frontmatter
- `getAgentPrompt` with non-existent file → returns null
- `resolveModel` parses "anthropic/claude-opus-4-6" → provider: "anthropic", id: "claude-opus-4-6"
- `resolveModel` returns null for invalid format
- Use temp files/directories for settings.json and agent .md files in tests

**Acceptance Criteria:**
- All tests pass
- Tests use `node:test` and `node:assert/strict`
- Tests use temp files, no side effects on real `.pi/settings.json` or `.pi/agents/`
- Coverage for happy path, missing config, and edge cases

---

### Task 6: Product Manager agent definition

Create `.pi/agents/product-manager.md`.

**Implementation:**
```markdown
---
name: product-manager
description: Product Manager for planning, scoping, and user story creation
---

You are the Product Manager for Areté development.

## Goals

- **Shape ideas into clear, scoped plans** — collaborate with the builder to refine raw ideas into structured plans with clear steps and acceptance criteria.
- **Ask the right questions** — reduce ambiguity early. Understand the problem before jumping to solutions.
- **Define acceptance criteria** that are specific, measurable, and testable.
- **Think about user impact** — who benefits, what changes for them, what's the value.
- **Identify risks and dependencies** early — surface what could go wrong before committing to a plan.
- **Estimate size honestly** — tiny (1-2 steps), small (2-3), medium (3-5), large (6+).

## Planning Process

1. **Understand the idea**: Ask clarifying questions. What problem does this solve? Who benefits? What does success look like?
2. **Explore the codebase**: Read relevant files to understand the current state. Identify existing patterns, services, and abstractions to build on.
3. **Propose a structured plan**: Numbered steps with clear descriptions. Each step should be independently implementable and testable.
4. **Define acceptance criteria**: For each step, explicit criteria that define "done". Use "must", "should" language.
5. **Estimate size**: Based on step count and complexity. Be honest — underestimating creates risk.
6. **Identify dependencies and risks**: What depends on what? What could go wrong? What's the riskiest part?

## Output Format

When creating a plan, use this structure:

Plan:
1. **Step title** — Description of what to do.
   - AC: Criterion 1
   - AC: Criterion 2
2. **Next step** — Description...
   - AC: ...

Include a summary block at the end:
- **Size**: tiny/small/medium/large
- **Steps**: N
- **Key risks**: Brief list
- **Dependencies**: What this builds on or blocks

## Constraints

- Stay in read-only mode during planning (don't modify files)
- Focus on the plan, not the implementation
- Be opinionated but open to the builder's direction
- Prefer smaller, incremental plans over big-bang rewrites
```

**Acceptance Criteria:**
- File exists at `.pi/agents/product-manager.md`
- Has YAML frontmatter with name and description
- Covers: goals, planning process, output format, constraints
- Output format includes "Plan:" header (compatible with plan-mode todo extraction)
- Size estimation guidance matches lifecycle gate thresholds
- Reads naturally as agent instructions

---

### Task 7: Plan classification and smart menu utilities

Add plan classification and menu functions to `.pi/extensions/plan-mode/utils.ts`.

**Implementation — new exports added to existing utils.ts:**
- `PlanSize` type: `'tiny' | 'small' | 'medium' | 'large'`
- `COMPLEXITY_KEYWORDS`: `['integration', 'new system', 'refactor', 'multi-file', 'migration', 'provider', 'architecture', 'breaking change']`
- `classifyPlanSize(items: TodoItem[], planText: string): PlanSize` — classifies based on step count and complexity keywords:
  - 1-2 steps, no keywords → tiny
  - 2-3 steps, no keywords → small (2 steps with keywords → medium)
  - 3-5 steps, or any with 1+ keyword → medium
  - 6+ steps, or medium with 2+ keywords → large
- `WorkflowMenuState` type: `{ planSize: PlanSize, preMortemRun: boolean, reviewRun: boolean, prdConverted: boolean, postMortemRun: boolean }`
- `getMenuOptions(state: WorkflowMenuState): string[]` — returns contextual menu options:
  - Tiny: ["Execute the plan", "Save as draft", "Refine the plan"]
  - Small: ["Run pre-mortem, then execute", "Execute directly", "Review the plan", "Convert to PRD", "Save as draft", "Refine the plan"]
  - Medium/Large: ["Convert to PRD (recommended)", "Run pre-mortem, then execute", "Review the plan", "Execute directly", "Save as draft", "Refine the plan"]
  - Adapt when gates already completed: if preMortemRun, change to "Execute (pre-mortem ✓)"; if reviewRun, remove "Review the plan"; if prdConverted, remove "Convert to PRD"
- `getPostExecutionMenuOptions(postMortemRun: boolean): string[]`:
  - Default: ["Run post-mortem (extract learnings)", "Capture learnings to memory", "Done"]
  - If postMortemRun: remove post-mortem option

**Acceptance Criteria:**
- `classifyPlanSize` correctly classifies all size thresholds
- Complexity keywords bump size (2 steps + "integration" → medium, not tiny)
- `getMenuOptions` returns correct menus for all 4 sizes
- Menu options adapt when gates are already completed
- `getPostExecutionMenuOptions` returns correct post-execution options
- All functions are pure (no side effects) and exported
- Existing utils functions unchanged (backward compatible)
- TypeScript compiles without errors

---

### Task 8: Tests for plan classification and menu utilities

Create or extend `.pi/extensions/plan-mode/utils.test.ts` with tests for the new functions AND the existing functions that currently have no test file.

**Tests for classifyPlanSize:**
- 1 step, no keywords → tiny
- 2 steps, no keywords → tiny
- 3 steps, no keywords → small
- 2 steps, planText contains "integration" → medium
- 4 steps, no keywords → medium
- 6 steps → large
- 3 steps, planText contains "new system" and "migration" → large
- 0 steps → tiny (edge case)

**Tests for getMenuOptions:**
- Tiny size: returns 3 options, first is "Execute the plan"
- Small size: returns 6 options, includes "Run pre-mortem"
- Medium size: first option is "Convert to PRD (recommended)"
- Large size: first option is "Convert to PRD (recommended)"
- Small + preMortemRun=true: "Execute" option shows "(pre-mortem ✓)"
- Medium + reviewRun=true: "Review the plan" not in options
- Large + prdConverted=true: "Convert to PRD" not in options
- All gates run: only execute and save/refine options remain

**Tests for getPostExecutionMenuOptions:**
- Default: 3 options including post-mortem
- postMortemRun=true: post-mortem option removed

**Tests for existing utils (add coverage):**
- `isSafeCommand` — safe commands allowed, destructive blocked
- `extractTodoItems` — extracts from "Plan:" header
- `cleanStepText` — truncation and formatting
- `extractDoneSteps` — parses [DONE:n] markers
- `markCompletedSteps` — marks items as completed

**Acceptance Criteria:**
- All tests pass with `tsx --test .pi/extensions/plan-mode/utils.test.ts`
- Uses `node:test` and `node:assert/strict`
- Uses `.js` extensions in imports
- Coverage for happy path, edge cases, and boundary conditions
- Existing utils functions tested (no regressions)

---

### Task 9: Lifecycle status widget

Create `.pi/extensions/plan-mode/widget.ts` for lifecycle visualization.

**Implementation:**
- `renderFooterStatus(state: WidgetState, theme: Theme): string` — returns styled footer status text:
  - Plan mode (no plan): `⏸ plan`
  - Plan extracted: `📋 plan (N steps, {size})`
  - Pre-mortem complete: `📋 plan (pre-mortem ✓)`
  - Reviewing: `🔍 reviewing`
  - Execution mode: `⚡ {completed}/{total}`
  - Complete: `✅ complete`
- `renderLifecycleWidget(state: WidgetState, theme: Theme): string[]` — returns lines for the pipeline widget:
  - Format: `📋 Plan → 🔍 Review → 🛡 Pre-mortem → ⚡ Build → 📊 Done`
  - Current stage: accent color
  - Completed stages: muted with ✓
  - Future stages: dim
  - Skipped stages: omitted or struck through
- `WidgetState` type: `{ planModeEnabled: boolean, planSize: PlanSize | null, status: PlanStatus | null, has_review: boolean, has_pre_mortem: boolean, has_prd: boolean, executionMode: boolean, todosCompleted: number, todosTotal: number }`
- Functions are pure (receive state + theme, return strings). The extension calls them from `updateStatus()`.

**Acceptance Criteria:**
- Footer status renders correctly for each lifecycle phase
- Lifecycle widget shows pipeline with correct highlighting
- Current stage uses accent color
- Completed stages show ✓ and use muted color
- Future stages use dim color
- Functions are pure (testable without TUI)
- TypeScript compiles without errors

---

### Task 10: Refactor plan-mode extension — commands module

Create `.pi/extensions/plan-mode/commands.ts` extracting and adding all command handlers. Refactor `index.ts` to import from commands.

**Implementation — commands.ts exports handler functions:**

- `handlePlan(args, ctx, pi, state)` — `/plan` command:
  - No args: toggle plan mode (existing behavior) + inject PM agent context via `before_agent_start`
  - Subcommands parsed from args:
    - `list` → call `listPlans()`, format as table, show via `ctx.ui.select()` for opening
    - `open <slug>` → call `loadPlan(slug)`, restore workflow state, inject plan context
    - `save [slug]` → extract plan from conversation (last assistant message with "Plan:" header), derive slug from title or use provided slug, call `savePlan()`, set status to draft, confirm
    - `status` → show current plan's status, size, gates completed, missing gates, next steps
    - `next` → see Task 11
    - `hold` → call `updatePlanFrontmatter(slug, { status: 'on-hold', previous_status: current })`, notify
    - `block <reason>` → same with blocked status + blocked_reason
    - `resume` → restore `previous_status`, clear blocked_reason, notify

- `handleReview(args, ctx, pi, state)` — `/review` command:
  - Load current plan (error if none active)
  - Check if secondary model configured; if so, attempt `pi.setModel()` switch
  - If model switch fails (no API key), notify user and proceed with current model
  - Send plan content to agent with review-plan skill context: `pi.sendUserMessage()` with plan content prefixed by "Review this plan using the review-plan skill:\n\n" + plan content
  - Register a one-time `agent_end` handler to capture review output and save via `savePlanArtifact(slug, 'review.md', output)`
  - Update frontmatter: `has_review: true`
  - If model was switched, switch back to primary
  - Notify: "✅ Review saved to dev/plans/{slug}/review.md"

- `handlePreMortem(args, ctx, pi, state)` — `/pre-mortem` command:
  - Load current plan
  - Send plan content with pre-mortem skill context
  - Capture output → save as `pre-mortem.md`
  - Update frontmatter: `has_pre_mortem: true`

- `handlePrd(args, ctx, pi, state)` — `/prd` command:
  - Load current plan
  - Send plan content with plan-to-prd skill context
  - The skill will create PRD at `dev/prds/{slug}/prd.md` and `dev/autonomous/prd.json` (existing skill behavior)
  - Also save a copy to `dev/plans/{slug}/prd.md` via `savePlanArtifact`
  - Update frontmatter: `has_prd: true`

- `handleBuild(args, ctx, pi, state)` — `/build` command:
  - Subcommands: no args (start build), `status` (show progress)
  - Start build:
    - Load current plan, validate status is 'approved' (or confirm override)
    - Update status to 'in-progress'
    - If plan has PRD: send execute-prd skill invocation with PRD path
    - If no PRD: transition to execution mode (existing DONE-tracking behavior)
  - Status: show task progress from `dev/autonomous/prd.json` or DONE tracking

**Refactoring index.ts:**
- Import handlers from `./commands.js`
- `pi.registerCommand()` calls delegate to the handler functions
- Keep event handlers (`tool_call`, `context`, `before_agent_start`, `turn_end`, `agent_end`) in index.ts but simplified
- State management stays in index.ts (single source of truth for extension state)

**Extension state type (extended):**
```typescript
interface PlanModeState {
  // Existing
  planModeEnabled: boolean;
  executionMode: boolean;
  todoItems: TodoItem[];
  // New
  currentSlug: string | null;
  planSize: PlanSize | null;
  planText: string;
  preMortemRun: boolean;
  reviewRun: boolean;
  prdConverted: boolean;
  postMortemRun: boolean;
}
```

**Acceptance Criteria:**
- All commands registered and functional
- `/plan list` shows plans from `dev/plans/` with status indicators
- `/plan open <slug>` loads plan and restores state
- `/plan save` extracts plan from conversation and persists
- `/plan status` shows lifecycle information
- `/plan hold`, `/plan block`, `/plan resume` update status correctly
- `/review` invokes review-plan skill with plan context
- `/pre-mortem` invokes run-pre-mortem skill with plan context
- `/prd` invokes plan-to-prd skill with plan context
- `/build` transitions to in-progress and triggers execution
- `/build status` shows progress
- State is properly persisted via `pi.appendEntry()`
- Existing plan-mode functionality preserved (toggle, read-only, DONE tracking)
- TypeScript compiles without errors

---

### Task 11: `/plan next` — smart gate orchestrator

Implement the `/plan next` subcommand in commands.ts (or as a dedicated function called by `handlePlan`).

**Implementation:**
- Load current plan (error if none active)
- Read current status, size, and gates (has_review, has_pre_mortem, has_prd)
- Call `getMissingGates(size, gates)` to get remaining gates
- Call `isReadyToApprove(size, gates)` to check if approval is possible
- Present interactive menu via `ctx.ui.select()`:

  **If gates remain:**
  ```
  📋 {title} (status: {status}, size: {size})
  
  Gate checklist:
    ☑/☐ Cross-model review ({required|recommended|optional})
    ☑/☐ Pre-mortem ({required|recommended|optional})  
    ☑/☐ PRD ({required|recommended|optional})
  
  Options:
    ❯ Run next gate ({gate-name})
      Run all remaining gates
      Skip remaining → approve
      Cancel
  ```

  **If all required gates done:**
  ```
  📋 {title} — all required gates passed!
  
  Options:
    ❯ Approve (mark as ready to build)
      Run optional gate: {name}
      Cancel
  ```

- When user selects a gate: call the appropriate command handler (`handleReview`, `handlePreMortem`, `handlePrd`)
- When user selects "Run all remaining": run gates in order (review → pre-mortem → prd), updating state between each
- When user approves: call `updatePlanFrontmatter(slug, { status: 'approved' })`
- After approval, offer: "Ready to build? Run `/build` to start."

**Acceptance Criteria:**
- `/plan next` shows correct gate checklist for current plan size
- Required gates are labeled as such
- Completed gates show ☑
- Selecting a gate runs the appropriate command
- "Run all remaining gates" runs them in sequence
- "Skip remaining → approve" works for plans where all mandatory gates are done
- "Skip remaining → approve" warns if mandatory gates are missing but allows override with confirm
- After approval, plan status is 'approved'
- TypeScript compiles without errors

---

### Task 12: Refactor index.ts — wire everything together

Refactor `.pi/extensions/plan-mode/index.ts` to use the new modules.

**Implementation:**
- Import from `./commands.js`, `./persistence.js`, `./lifecycle.js`, `./agents.js`, `./widget.js`, `./utils.js`
- **State management**: Extend the state object with new fields (currentSlug, planSize, etc.)
- **Command registration**: Register all commands using imported handlers:
  - `/plan` (with subcommands), `/review`, `/pre-mortem`, `/prd`, `/build`, `/todos`
  - Keep existing `/todos` command and `Ctrl+Alt+P` shortcut
- **`before_agent_start` handler**: Enhanced to inject agent context based on current phase:
  - If in plan mode + no active plan: inject PM agent prompt
  - If in plan mode + active plan: inject PM prompt + plan context
  - If in execution mode: inject current execution context (existing behavior)
- **`agent_end` handler**: Enhanced flow:
  - If in plan mode: extract todos, classify plan size, show smart menu (from `getMenuOptions`), handle menu selection (delegate to command handlers)
  - If in execution mode + all complete: show post-execution menu (from `getPostExecutionMenuOptions`), handle selection
  - If in execution mode + not complete: existing behavior
- **`updateStatus` function**: Use `renderFooterStatus()` and `renderLifecycleWidget()` from widget.ts
- **`tool_call` handler**: Unchanged (block destructive in plan mode)
- **`context` handler**: Unchanged (filter stale plan mode context)
- **`turn_end` handler**: Unchanged (track DONE markers)
- **`session_start` handler**: Enhanced to also restore plan state (currentSlug, planSize, etc.) from persisted entries
- **`save_plan_artifact` tool**: Register during gate phases (scoped to current plan directory)

**Acceptance Criteria:**
- Extension loads without errors
- All commands work end-to-end
- Plan mode toggle works (backward compatible)
- Smart menus appear after plan extraction
- Agent context injection changes based on phase
- Lifecycle widget renders correctly
- Post-execution menu appears after completion
- `save_plan_artifact` tool is available during gate phases, scoped to plan directory
- State persists across sessions via `appendEntry`
- Existing functionality preserved: read-only mode, DONE tracking, `Ctrl+Alt+P`, `/todos`
- TypeScript compiles without errors

---

### Task 13: Save artifact tool

Register the `save_plan_artifact` tool in the extension.

**Implementation:**
- Tool name: `save_plan_artifact`
- Parameters: `{ filename: string, content: string }`
- Description: "Save a plan artifact (review, pre-mortem, PRD) to the current plan's directory. Only available during plan lifecycle gates."
- Validation:
  - `currentSlug` must be set (error if no active plan)
  - `filename` must be one of: `review.md`, `pre-mortem.md`, `prd.md`, `notes.md` (prevent arbitrary writes)
  - Content must be non-empty
- Writes via `savePlanArtifact(currentSlug, filename, content)` from persistence.ts
- Returns success message with file path
- Tool is only added to active tools during gate phases (when running /review, /pre-mortem, /prd). Use `pi.setActiveTools()` to temporarily add it, then remove after gate completes.

**Acceptance Criteria:**
- Tool registered with correct parameters and description
- Rejects writes when no active plan
- Rejects filenames not in allowlist
- Rejects empty content
- Successfully writes artifacts to `dev/plans/{slug}/`
- Tool only available during gate phases
- Returns clear error messages for validation failures
- TypeScript compiles without errors

---

### Task 14: Update settings.json with agent config

Update `.pi/settings.json` to include the agent model configuration.

**Implementation:**
- Add `agents` section to existing settings.json:
```json
{
  "tools": ["read", "bash", "edit", "write"],
  "agents": {
    "product-manager": {
      "primary": "anthropic/claude-opus-4-6",
      "secondary": "openai/gpt-5.3"
    },
    "orchestrator": {
      "model": "anthropic/claude-opus-4-6"
    },
    "reviewer": {
      "model": "anthropic/claude-sonnet-4-6"
    },
    "developer": {
      "model": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

**Acceptance Criteria:**
- `.pi/settings.json` contains agents section
- Existing `tools` field preserved
- All 4 agent roles configured
- Product manager has primary + secondary
- Other roles have single model
- File is valid JSON

---

### Task 15: Integration testing and quality gates

Run full integration testing and ensure quality gates pass.

**Integration tests (manual verification):**
- Start Pi with `pi --plan` → verify PM agent context is injected
- Create a 5-step plan → verify "Convert to PRD (recommended)" appears first in menu
- Create a 2-step plan → verify "Execute the plan" appears first
- `/plan save` → verify file created at `dev/plans/{slug}/plan.md` with correct frontmatter
- `/plan list` → verify plans listed with status
- `/plan open <slug>` → verify plan loaded and state restored
- `/plan status` → verify lifecycle info displayed
- `/plan next` → verify gate checklist shown with correct requirements for plan size
- `/review` → verify review skill invoked and artifact saved
- `/pre-mortem` → verify pre-mortem skill invoked and artifact saved
- `/prd` → verify PRD skill invoked and artifact saved
- `/build` → verify transitions to in-progress
- `/plan hold` and `/plan resume` → verify status transitions
- Lifecycle widget renders correctly at each phase

**Quality gates:**
- `npm run typecheck` passes
- `npm test` passes (full suite)
- `tsx --test .pi/extensions/plan-mode/*.test.ts` passes (extension tests)
- Extension loads without errors in Pi

**Acceptance Criteria:**
- All manual integration tests pass
- `npm run typecheck` passes
- `npm test` passes (no regressions)
- Extension-specific tests pass
- Extension loads cleanly in Pi

---

### Task 16: Documentation updates

Update documentation to reflect the new plan lifecycle system.

**APPEND_SYSTEM.md updates:**
- Add plan lifecycle command reference (all /plan subcommands, /review, /pre-mortem, /prd, /build)
- Update execution path section to reference that plan mode now surfaces these options automatically
- Note that agent model config is in `.pi/settings.json`

**dev/plans/README.md:**
- Create index document explaining the plan directory structure
- Document plan.md frontmatter format
- Document lifecycle statuses and transitions
- Quick reference for commands

**Memory entry:**
- Create `memory/entries/2026-02-16_plan-lifecycle-system-learnings.md` (skeleton — to be filled during post-mortem)
- Add index line to `memory/MEMORY.md`

**Backlog cleanup:**
- Mark `dev/prds/plan-mode-skills-integration/` as superseded (add note to its prd.md)
- Create `dev/backlog/features/plan-lifecycle-enhancements.md` with future ideas:
  - Auto-detect complexity keywords beyond step count
  - Timed pre-mortem nudge for medium plans
  - True cross-model review via subagent (when Pi supports it)
  - Plan templates (discovery plan, refactor plan, integration plan)
  - Plan analytics (how long plans take, gate skip rate, etc.)
  - Backlog auto-marking on plan completion

**Acceptance Criteria:**
- APPEND_SYSTEM.md has complete command reference
- dev/plans/README.md documents format and workflow
- Memory entry skeleton created
- MEMORY.md index updated
- plan-mode-skills-integration PRD marked as superseded
- Future enhancements backlog item created
- All documentation is accurate and consistent

---

## 4. Dependencies Between Tasks

```
Phase 1 (Foundation):
  Task 1 (persistence) ──┐
  Task 2 (lifecycle)  ───┼── Task 3 (tests) ──── Task 10 (refactor index.ts)
                         │
Phase 2 (Agents + Planning):
  Task 4 (agent config) ── Task 5 (agent tests) ──┐
  Task 6 (PM agent) ──────────────────────────────┼── Task 10 (refactor index.ts)
  Task 7 (classification) ── Task 8 (class tests) ─┘

Phase 3 (Gates):
  Task 10 (refactor index.ts) ── Task 11 (/plan next)
  Task 10 (refactor index.ts) ── Task 13 (save artifact tool)
  
Phase 4 (Widget + Integration + Docs):
  Task 9 (widget) ──── Task 12 (wire together)
  Task 11 + 13 ─────── Task 12 (wire together)
  Task 12 ──── Task 14 (settings.json)
  Task 12 ──── Task 15 (integration testing)
  Task 15 ──── Task 16 (documentation)
```

**Execution order:**
1 → 2 → 3 (foundation)
4 → 5, 6, 7 → 8 (agents + classification, parallel where possible)
9 (widget, can parallel with 4-8)
10 (refactor — needs 1-8 done)
11, 13 (gate commands + tool — need 10)
12 (wire together — needs 9, 10, 11, 13)
14 (settings — needs 12)
15 (testing — needs all above)
16 (docs — needs 15)

---

## 5. Testing Strategy

- **Unit tests** (Tasks 3, 5, 8): Pure function tests for persistence, lifecycle, agent config, classification, menus
- **Integration tests** (Task 15): Manual verification of full extension lifecycle
- **Quality gates**: `npm run typecheck && npm test` after every task
- **Extension tests**: `tsx --test .pi/extensions/plan-mode/*.test.ts` for extension-specific tests
- **Existing tests**: Must continue to pass (no regressions)

---

## 6. Success Criteria

1. Plans are persisted to `dev/plans/` and survive across sessions
2. Lifecycle state machine enforces gate requirements by plan size
3. Agent model config in settings.json is read and applied
4. Product Manager agent drives planning phase
5. `/plan next` surfaces the right gate options at the right time
6. `/review`, `/pre-mortem`, `/prd` invoke skills and save artifacts
7. `/build` transitions to in-progress and triggers execution
8. Lifecycle widget shows pipeline position
9. All existing plan-mode functionality preserved (backward compatible)
10. All quality gates pass throughout
