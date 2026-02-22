# Dev Practices (Arete Build – BUILDER context)

Standards for building and changing Arete. For conventions, memory usage, skills index, and CLI reference, see **AGENTS.md**.

---

## Quality Gates (mandatory for ALL commits)

Before any commit, these **must pass**:

```bash
npm run typecheck  # Must pass
npm test           # Must pass (full suite, not just new tests)
```

If the work touches Python (`scripts/integrations/`), also run:
```bash
npm run test:py
```

**No exceptions** — even for "quick fixes." Quality gates catch ripple effects.

---

## Testing Requirements

All code changes in this workspace MUST include corresponding tests. Never ship code without test coverage.

### TypeScript (Node.js built-in test runner via tsx)

- **Location**: `packages/*/test/` mirroring `packages/*/src/` structure
- **Naming**: `*.test.ts` (e.g., `packages/core/test/utils/slugify.test.ts`)
- **Runner**: `npm test` or `tsx --test 'packages/core/test/**/*.test.ts' 'packages/cli/test/**/*.test.ts'`
- **Imports**: Use `node:test` (`describe`, `it`, `beforeEach`, `afterEach`, `mock`) and `node:assert/strict`
- **Import paths**: Use `.js` extensions in imports (NodeNext module resolution)

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../../src/utils/slugify.js';
```

### Python (unittest)

- **Location**: `scripts/integrations/test_*.py` (co-located with source)
- **Naming**: `test_<module>.py`
- **Runner**: `python3 -m unittest scripts/integrations/test_*.py` or `npm run test:py`
- **Pattern**: `unittest.TestCase` with `unittest.mock` for mocking

### Test Rules

- **New functions/modules**: Unit tests for happy path, edge cases, error handling
- **Bug fixes**: Regression test that reproduces the bug before fixing
- **Refactors**: Existing tests must pass; add tests for new behavior
- **Structure**: Arrange-Act-Assert; descriptive names; isolation (mock external deps)

### Test File Mapping (packages/)

| Source File | Test File |
|-------------|-----------|
| `packages/core/src/utils/slugify.ts` | `packages/core/test/utils/slugify.test.ts` |
| `packages/core/src/services/memory.ts` | `packages/core/test/services/memory.test.ts` |
| `packages/core/src/integrations/calendar/index.ts` | `packages/core/test/integrations/calendar.test.ts` |
| `packages/cli/src/commands/install.ts` | `packages/cli/test/commands/install.test.ts` |
| `scripts/integrations/utils.py` | `scripts/integrations/test_utils.py` |

When adding new source files, create a corresponding test file following this pattern.

### Seed test-data: do not run in arete repo

When working on testing, seed, or `test-data/` functionality:
- **Do not run** `arete seed test-data` when the workspace is the arete development repo
- **Remind the user** to run seed only in a separate Areté-enabled project
- **After completing a task**, check for accidentally generated seed data: `people/internal/jane-doe.md`, `alex-eng.md`, `people/customers/bob-buyer.md`, `carol-champion.md`, `resources/meetings/2026-*.md`, `projects/active/onboarding-discovery/`, `TEST-SCENARIOS.md` at root. If found, ask: "Seed test data appears to have been generated in this workspace. Should I remove it?"

---

## Code Review Checklist (for any substantial change)

Apply this 6-point checklist before committing:

- [ ] **Uses `.js` extensions** in imports (NodeNext module resolution)
- [ ] **No `any` types** (strict TypeScript)
- [ ] **Proper error handling** (try/catch with graceful fallback)
- [ ] **Tests for happy path and edge cases**
- [ ] **Backward compatibility preserved** (function signatures unchanged unless explicitly breaking)
- [ ] **Follows project patterns** (see existing code, AGENTS.md conventions)

If any item fails, fix before committing.

---

## Execution Path Decision Tree

When you approve a plan, follow this decision tree:

```
User approves plan
 |
 ├─ Tiny (1-2 simple steps: fix typo, add comment, update string)
 |  → Direct execution
 |  → Quality gates ✓
 |  → Skip pre-mortem, skip memory capture
 |
 ├─ Small (2-3 moderate steps: add function + tests, refactor module)
 |  → Ask: "Run pre-mortem first? (Recommended for new features)"
 |  → Use /plan command or /skill:run-pre-mortem
 |  → Quality gates ✓
 |  → Offer: "Capture learnings?" at end
 |
 └─ Medium/Large (3+ steps OR complex: new system, integration, refactor)
    → Strongly recommend: "PRD path or direct execution?"
    → If PRD: Load .agents/skills/plan-to-prd/SKILL.md (full execute-prd workflow)
    → If direct: Apply pre-mortem + quality gates + memory capture
```

**When in doubt**: Offer both paths and let builder choose.

---

## Direct Execution Protocol (non-PRD changes)

When implementing code changes directly (not via execute-prd), follow these steps **in order**. This applies to all tiny/small changes — bug fixes, refactors, feature tweaks, etc.

### Steps

1. **Implement** — Write code following project patterns. Stay in scope.
2. **Test** — Add/update tests. Same rules as PRD work: no exceptions.
3. **Verify** — `npm run typecheck` && `npm test` must pass.
4. **Review** — Spawn the `engineering-lead` agent to review your changes:
   ```
   subagent({ agent: "engineering-lead", task: "<review prompt>", agentScope: "project" })
   ```
   Include: diff summary, files changed, what the change does, and any concerns.
5. **Fix** — Address any review feedback. Re-verify (step 3).
6. **Commit** — `git add` only related files. Use conventional commit format (`feat:`, `fix:`, `refactor:`, etc.).
7. **Report** — Tell the user: what changed, files touched, commit hash, anything notable.

### Scope Escalation Rule

If the change touches more than ~5 files or you discover hidden complexity, **stop and tell the user**:

> "This is bigger than expected — want to plan this properly?"

Don't silently expand a small change into a medium one without the medium-change safeguards.

### Cleanup Check

Before committing, verify:
- No leftover `console.log` or debug statements
- No commented-out code
- No temp files or scratch work left behind

---

## Skill and Rule Changes (mandatory review)

**When**: Before creating or modifying any skill or rule file.

**Checklist**:
- [ ] **Audience check**: Is this for BUILD (dev/, .cursor/, .agents/) or PRODUCT (runtime/)?
- [ ] **AGENTS.md sources**: If the skill/rule changes workflows, update `.agents/sources/` and rebuild
- [ ] **Cross-references**: Search for references to the skill/rule being changed; update them

**AGENTS.md is generated** — do not edit it directly. Rebuild:

```bash
npm run build:agents:dev  # Rebuild BUILD AGENTS.md
npm run build             # Rebuild GUIDE AGENTS.md (included in package build)
```

---

## Multi-IDE Consistency Check

**When**: Before editing files in `runtime/rules/`, `runtime/tools/`, or `.agents/sources/guide/`.

**Checklist**:
- [ ] **No "either/or" paths**: Don't write `.cursor/X or .claude/X` — use only `.cursor/X` (adapter transforms it)
- [ ] **No hardcoded IDE names in content**: Use `.cursor/` paths; adapter handles `.claude/` conversion

**Pre-commit check**:
```bash
rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" .agents/sources/ runtime/
```

---

## Documentation Planning Checklist

When creating plans that touch code/features/structure, ask: **"Does this need doc updates?"**

**Scope Check:**
- [ ] All root docs: README, SETUP, AGENTS sources, scratchpad
- [ ] Plans with doc tasks: `grep -rl "update.*\.md\|docs" dev/work/plans/`

**Search Strategy:**
- [ ] Feature keywords: `rg "keyword1|keyword2" -g "*.md"`
- [ ] Concept audit: If feature changes paths/structure, grep old paths in all `.md` files

**Anti-pattern:** Do not assume "documentation" = README + SETUP. scratchpad and plans frequently need updates.

---

## LEARNINGS.md Behavioral Rules

<!-- SYNC: The 4 behavioral rules below are mirrored in .cursor/rules/dev.mdc §LEARNINGS.md. Update both together. -->

1. Before editing files in a directory, check for LEARNINGS.md in the same directory as the file being edited, then each parent directory up to (but not including) the repository root. Stop at the first LEARNINGS.md found; read it. If editing files in multiple directories, check each.
2. After fixing any bug or regression, add entry to nearest LEARNINGS.md describing what broke, why, and how to avoid it. If no LEARNINGS.md exists nearby and the gotcha is non-obvious, create one.
3. Regression tests should include a comment explaining the failure mode they prevent.
4. When an agent discovers something missing from or inaccurate in a LEARNINGS.md, update it immediately.

---

## Capability Registry Check (tooling/platform changes)

Before changing developer tooling or platform behavior (extensions, tools, services, rules integration, major external packages):

- Read `dev/catalog/capabilities.json`
- Confirm provenance: `built | customized | external`
- Follow `readBeforeChange` references in the capability entry
- Update capability metadata if behavior, paths, owner, or status changed

Use memory entries for rationale/history; use the capability registry as current-state source of truth.

---

## Before Committing

1. `npm run typecheck`
2. `npm run test:all` (or `npm test` + `npm run test:py` if Python touched)
3. New code → new/updated tests (see testing section above)
4. For meaningful build changes (architecture, workflow, structure), add `memory/entries/YYYY-MM-DD_*.md` and index it in `memory/MEMORY.md`

---

## Plan Lifecycle Commands

The plan-mode extension provides a full plan lifecycle with persistence, gates, and execution.

### Core commands

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode (read-only exploration) |
| `/plan new [name]` | Start a new plan, optionally pre-setting the slug from `name` |
| `/plan list` | List all saved plans with status. Supports `--ideas` and `--active` filters |
| `/plan open <slug>` | Open a saved plan and restore its state |
| `/plan save [slug]` | Save current plan to `dev/work/plans/{slug}/plan.md` |
| `/plan rename [new-name]` | Rename the current plan (moves folder, updates frontmatter) |
| `/plan status` | Show lifecycle info: status, size, artifacts, recommendations |
| `/plan delete <slug>` | Delete a plan and its artifacts |

### Archive commands

| Command | Description |
|---------|-------------|
| `/plan archive [slug]` | Archive a plan (current or by slug) as complete or abandoned |
| `/plan archive list` | List archived plans |

### Gate commands

| Command | Description |
|---------|-------------|
| `/review` | Run cross-model review (invokes review-plan skill) |
| `/pre-mortem` | Run pre-mortem analysis (invokes run-pre-mortem skill) |
| `/prd` | Convert plan to PRD (invokes plan-to-prd skill) |
| `/approve` | Mark plan as ready for building |
| `/build` | Start execution (transitions to building) |
| `/build status` | Show build progress |

### Lifecycle statuses

`idea → draft → planned → building → complete` (+ `abandoned` from any)

### Gate requirements by size

| Size | Steps | Review | Pre-mortem | PRD |
|------|-------|--------|-----------|-----|
| tiny | 1-2 | optional | optional | skip |
| small | 2-3 | optional | optional | skip |
| medium | 3-5 | optional | recommended | optional |
| large | 6+ | recommended | mandatory | mandatory |

### Agent model configuration

Agent models configured in `.pi/settings.json` under `agents`:
- `product-manager`: primary + secondary (for cross-model review)
- `orchestrator`, `reviewer`, `developer`: single model each

---

## References

- **AGENTS.md**: Conventions, skills index, memory guidance, CLI reference (compressed, always-loaded)
- **Testing**: See testing section above
- **Pre-mortem / PRD gateway**: Use `/plan` command or `/skill:run-pre-mortem`
- **Build memory**: `memory/MEMORY.md`, `memory/collaboration.md`
