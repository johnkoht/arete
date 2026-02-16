# Pi Dev Workflow Migration

## Goal

Add Pi coding agent as an additive dev workflow option for building Arete, alongside the existing Cursor workflow. Set up `.pi/` project configuration, port dev rules, migrate build skills, install a plan-mode extension, and prepare agent definitions for future subagent work. After this PRD, a developer can run `pi` from the Arete repo root and have a fully functional dev environment with quality gates, skills, and plan mode.

---

## Context

The monorepo refactor is complete (18/18 tasks, branch `refactor/pi-monorepo`). Both the PRD (`dev/prds/refactor-pi-monorepo/prd.md`, line 738) and post-mortem (`memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md`, line 127) flagged "Pi IDE support" as a follow-up item. The architecture is IDE-agnostic via the adapter pattern in `packages/core/src/adapters/`.

Pi is an extensible terminal coding agent ([github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono)) that reads `AGENTS.md` from the project root, discovers skills from `.pi/skills/`, loads extensions from `.pi/extensions/`, and appends `.pi/APPEND_SYSTEM.md` to its system prompt. This maps cleanly to Arete's existing dev workflow primitives.

**This is additive**: Cursor continues to work unchanged. Nothing in `.cursor/` is modified or removed.

**Subagent execution is a separate PRD**: Pi's subagent extension will be addressed in a dedicated PRD. This PRD creates agent definition files as prep work, but does not install the subagent extension.

---

## Architecture Mapping

| Arete Dev Primitive | Cursor | Pi Equivalent |
|---|---|---|
| Project context | `AGENTS.md` (root) | `AGENTS.md` (root) — Pi reads automatically |
| Always-on dev rules | `.cursor/rules/*.mdc` | `.pi/APPEND_SYSTEM.md` — appended to system prompt |
| Build skills | `.agents/skills/` | `.pi/skills/` — symlinked from `.agents/skills/` |
| Plan mode + pre-mortem | `plan-pre-mortem.mdc` (rule) | `.pi/extensions/plan-mode/` (extension) |
| Memory system | `memory/` (file-based) | `memory/` — works as-is |
| Quality gates | `npm run typecheck && npm test` | Same bash commands |
| Subagent execution | Cursor Task tool | Deferred (separate PRD) |

---

## Tasks

### Task 1: Create Pi Project Directory and Settings

Create the `.pi/` directory structure with a `settings.json` for project-level Pi configuration.

**What to create:**
- `.pi/settings.json` — Model preferences, tool configuration
- `.pi/extensions/` — Directory for extensions (populated in Task 3)
- `.pi/skills/` — Directory for skills (populated in Task 4)
- `.pi/agents/` — Directory for agent definitions (populated in Task 5)

**Reference:** Pi settings docs — project settings override global `~/.pi/agent/settings.json`. Available options include model, tools, thinking level.

**Acceptance Criteria:**
- `.pi/` directory exists with `settings.json`
- `settings.json` contains reasonable defaults (tools: read, bash, edit, write; no model override — let global config handle it)
- Subdirectories exist: `extensions/`, `skills/`, `agents/`

---

### Task 2: Port Dev Rules to APPEND_SYSTEM.md

Consolidate the content from `.cursor/rules/dev.mdc` and `.cursor/rules/testing.mdc` into `.pi/APPEND_SYSTEM.md`. This file is appended to Pi's system prompt every session, making it equivalent to Cursor's always-applied rules.

**What to port:**
- From `dev.mdc`: Quality gates, execution path decision tree, code review checklist, skill/rule change procedures, multi-IDE consistency check, documentation planning checklist
- From `testing.mdc`: Test infrastructure (TypeScript + Python), test structure rules, test file mapping, running tests

**What NOT to port:**
- `plan-pre-mortem.mdc` content — handled by the plan-mode extension (Task 3)
- Cursor-specific frontmatter (`globs`, `alwaysApply`, `description`)
- References to "Plan Mode" as a Cursor IDE feature — reframe as a workflow pattern

**Adaptation notes:**
- Replace `.cursor/rules/testing.mdc` references with "testing section below"
- Replace `.cursor/rules/plan-pre-mortem.mdc` references with "use `/plan` command or `/skill:run-pre-mortem`"
- Keep all quality gate commands verbatim (`npm run typecheck`, `npm test`, etc.)
- Keep the code review checklist verbatim
- Add a header noting this is for Arete development (BUILDER context only)
- Update test file mapping paths if they reference old `src/`/`test/` structure (they should reference `packages/` now)

**Acceptance Criteria:**
- `.pi/APPEND_SYSTEM.md` exists with consolidated dev rules
- Quality gates section is present and accurate
- Testing requirements section is present with correct paths
- Code review checklist is present
- No Cursor-specific frontmatter or IDE references
- No `plan-pre-mortem.mdc` content (handled by extension)

---

### Task 3: Install and Adapt Plan-Mode Extension

Copy Pi's plan-mode extension example into `.pi/extensions/plan-mode/` and adapt it for Arete's pre-mortem and PRD gateway workflow.

**Source:** [github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/plan-mode](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/plan-mode)

**Files to create:**
- `.pi/extensions/plan-mode/index.ts` — Main extension (adapted from Pi example)
- `.pi/extensions/plan-mode/utils.ts` — Utility functions (from Pi example)

**Adaptations to make:**

1. **Plan mode context prompt** — Modify the `[PLAN MODE ACTIVE]` injected message to include:
   - Reference to `/skill:run-pre-mortem` for risk analysis
   - PRD gateway guidance: "If this plan has 3+ steps, suggest converting to PRD via `/skill:plan-to-prd`"
   - Execution path decision tree (Tiny/Small/Medium/Large)

2. **Safe commands** — Add to the safe command allowlist in `utils.ts`:
   - `npm run typecheck` (read-only check)
   - `npm test` (read-only check)
   - `npm run test:py` (read-only check)
   - `npm run test:all` (read-only check)

3. **Execution context** — Modify the execution mode context to include:
   - "Run quality gates (`npm run typecheck && npm test`) after completing implementation steps"
   - "After completing all steps, offer to capture learnings in `memory/entries/`"

**What to keep unchanged:**
- Core plan/execution toggle logic
- Todo extraction and `[DONE:n]` tracking
- Widget rendering
- Session persistence
- Keyboard shortcuts (Ctrl+Alt+P)

**Acceptance Criteria:**
- `.pi/extensions/plan-mode/index.ts` exists and is valid TypeScript
- `.pi/extensions/plan-mode/utils.ts` exists with safe command additions
- Plan mode context prompt references pre-mortem skill and PRD gateway
- Execution mode context references quality gates
- `npm run typecheck` and `npm test` are in the safe command allowlist
- Extension loads without errors when Pi starts (verified in Task 6)

---

### Task 4: Symlink Build Skills

Create symlinks from `.pi/skills/` to each build skill in `.agents/skills/`. This preserves a single source of truth while making skills discoverable by Pi.

**Skills to symlink (7 total):**
- `.pi/skills/execute-prd` → `../../.agents/skills/execute-prd`
- `.pi/skills/plan-to-prd` → `../../.agents/skills/plan-to-prd`
- `.pi/skills/prd-to-json` → `../../.agents/skills/prd-to-json`
- `.pi/skills/prd-post-mortem` → `../../.agents/skills/prd-post-mortem`
- `.pi/skills/review-plan` → `../../.agents/skills/review-plan`
- `.pi/skills/run-pre-mortem` → `../../.agents/skills/run-pre-mortem`
- `.pi/skills/synthesize-collaboration-profile` → `../../.agents/skills/synthesize-collaboration-profile`

**Why symlinks:** Pi ignores unknown frontmatter fields (`triggers`, `category`, `work_type`, `primitives`, `requires_briefing`), so the existing SKILL.md files work without modification. Symlinks maintain a single source of truth. If Pi-specific tuning is needed later, symlinks can be replaced with copies.

**Acceptance Criteria:**
- All 7 symlinks exist in `.pi/skills/`
- Each symlink resolves to the correct `.agents/skills/{name}` directory
- Symlinks use relative paths (not absolute) for portability
- Pi discovers all 7 skills at startup (verified in Task 6)

---

### Task 5: Create Agent Definition Files

Create agent definition markdown files in `.pi/agents/` for future use by Pi's subagent extension. These are inert (no extension to consume them yet) but establish the role definitions for autonomous PRD execution.

**Source reference:** The execute-prd skill (`.agents/skills/execute-prd/SKILL.md`) defines two roles: Orchestrator (Sr. Eng Manager) and Reviewer (Sr. Engineer). The task agent prompt is in `dev/autonomous/prd-task-agent.md`.

**Files to create:**

1. `.pi/agents/orchestrator.md` — Frontmatter: `name: orchestrator`, `description: Senior Engineering Manager for PRD execution`, `model: (leave empty for default)`. Body: System prompt derived from execute-prd Orchestrator role description.

2. `.pi/agents/reviewer.md` — Frontmatter: `name: reviewer`, `description: Senior Engineer for code review and AC verification`, `tools: read,bash,grep,find,ls`. Body: System prompt derived from execute-prd Reviewer role description.

3. `.pi/agents/task-agent.md` — Frontmatter: `name: task-agent`, `description: Executes individual PRD tasks with full tool access`, `tools: read,bash,edit,write`. Body: System prompt derived from `dev/autonomous/prd-task-agent.md` adapted for Pi conventions.

**Format per Pi's agent discovery:** Each `.md` file needs frontmatter with `name` and `description` (required), plus optional `model` and `tools`. The body becomes the system prompt.

**Acceptance Criteria:**
- Three `.md` files exist in `.pi/agents/`
- Each has valid frontmatter with `name` and `description`
- System prompts are derived from existing role definitions (not invented)
- Files follow Pi's agent format (discoverable by subagent extension when installed later)

---

### Task 6: Startup Validation

Launch Pi in the Arete repo root and verify all components load correctly.

**Verification checklist:**
- [ ] Pi starts without errors
- [ ] Startup header shows `AGENTS.md` loaded
- [ ] Startup header shows 7 skills discovered
- [ ] Startup header shows plan-mode extension loaded
- [ ] APPEND_SYSTEM.md content is active (ask "What are the quality gates for this project?" — should reference `npm run typecheck` and `npm test`)
- [ ] `/plan` command toggles plan mode (read-only)
- [ ] `/skill:run-pre-mortem` loads the pre-mortem skill
- [ ] `npm run typecheck` can be run via bash tool
- [ ] Memory files (`memory/MEMORY.md`, `memory/collaboration.md`) are readable

**If issues found:** Fix them before proceeding. Common issues:
- Extension TypeScript errors (missing imports, type mismatches)
- Symlink resolution failures (relative path issues)
- APPEND_SYSTEM.md not loaded (check `.pi/` directory is in project root)

**Acceptance Criteria:**
- All checklist items pass
- Pi is usable for basic dev tasks in the Arete repo
- No startup errors or warnings related to Arete configuration

---

### Task 7: Documentation and Backlog Updates

Update project documentation to reflect Pi as a supported dev workflow option, and create a backlog decision item for future Cursor vs Pi evaluation.

**Documentation updates:**

1. **`.gitignore`** — Ensure `.pi/` is NOT in `.gitignore` (it should be tracked). Check that `.pi/agents/` and `.pi/extensions/` are tracked.

2. **AGENTS.md sources** — Update `.agents/sources/builder/` to mention Pi as a supported dev agent. Add a line in the relevant section noting that `.pi/` directory contains Pi configuration for development.

3. **`dev.mdc`** — Add a brief note in the References section pointing to `.pi/` for Pi-based development as an alternative to Cursor.

4. **Rebuild AGENTS.md** — Run `npm run build:agents:dev` after updating sources.

**Backlog item:**

Create `dev/backlog/decisions/cursor-vs-pi-dev-agent.md` with:
- **Decision**: Should Pi replace Cursor as the primary dev agent, or continue running both?
- **Evaluation criteria**: Context quality (AGENTS.md effectiveness), skill execution reliability, plan mode effectiveness, cost/speed, workflow friction, IDE features (linting, file tree, inline diffs vs terminal-native workflow)
- **Review trigger**: After 2-4 weeks of active Pi usage, or after the subagent extension PRD is complete
- **Current state**: Both workflows operational. Cursor provides IDE integration; Pi provides model flexibility, extensibility, and terminal-native workflow.

**Acceptance Criteria:**
- `.pi/` is tracked in git (not in `.gitignore`)
- AGENTS.md sources updated and rebuilt
- `dev.mdc` references Pi workflow
- Backlog decision item exists at `dev/backlog/decisions/cursor-vs-pi-dev-agent.md`
- `npm run typecheck` passes after all changes
- `npm test` passes after all changes

---

## Scope Boundaries

**In scope:**
- Pi project setup (`.pi/` directory, settings, APPEND_SYSTEM.md)
- Plan-mode extension (adapted from Pi example)
- Build skills symlinks (7 skills)
- Agent definition files (prep for future subagent PRD)
- Startup validation
- Documentation and backlog updates

**Out of scope (separate initiatives):**
- Subagent extension installation and autonomous PRD execution in Pi
- Pi as a product runtime for end users (separate `IDEAdapter` work)
- Removing or replacing the Cursor workflow
- Custom Pi extensions beyond plan-mode
- Pi package distribution of Arete

---

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | AGENTS.md pipe-delimited format less effective for Pi than Cursor | Medium | Medium | Monitor context quality during validation. If Pi struggles, expand key sections in APPEND_SYSTEM.md as supplementary context. |
| 2 | Plan-mode extension TypeScript compilation errors | Low | Low | Extension uses Pi's jiti loader (no build step). Test with `pi -e .pi/extensions/plan-mode/index.ts` before committing. |
| 3 | Skill description insufficient for Pi auto-discovery | Medium | Low | Pi's skill matching uses `description` field. Current descriptions are detailed. If auto-loading fails, users can invoke via `/skill:name`. |
| 4 | Symlink resolution across platforms | Low | Medium | Use relative symlinks, not absolute. Test on the development machine. |
| 5 | APPEND_SYSTEM.md too large for Pi system prompt | Low | Medium | Keep content concise. Pi handles large system prompts well, but monitor token usage. |
| 6 | npm test/typecheck in plan mode safe list causes unintended side effects | Low | Low | These commands are genuinely read-only. npm test runs tests but doesn't modify files. |

---

## Dependencies

- Pi coding agent must be installed globally: `npm install -g @mariozechner/pi-coding-agent`
- At least one LLM API key configured (e.g., `ANTHROPIC_API_KEY`)
- Monorepo refactor complete (current state: done)

---

## Success Criteria

After this PRD is complete:
1. Running `pi` from the Arete repo root gives a fully functional dev environment
2. Quality gates, testing requirements, and code review checklist are enforced via APPEND_SYSTEM.md
3. Plan mode works with `/plan` command, including pre-mortem references and PRD gateway
4. All 7 build skills are discoverable and invocable via `/skill:name`
5. Agent definitions are ready for future subagent extension
6. Cursor workflow is completely unaffected
