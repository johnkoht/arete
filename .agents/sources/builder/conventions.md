# Build Conventions

Standards for building and changing Areté. Testing is covered in `testing.mdc`; this document covers code style, quality practices, and commit workflows.

## TypeScript / Node.js

### Configuration

- **Config**: `tsconfig.json` (NodeNext, strict mode)
- **Tests**: `tsconfig.test.json`
- **Module Resolution**: NodeNext (requires `.js` extensions in imports)

### Code Style

**Imports:**
- Use `.js` extensions for local modules (NodeNext resolution)
- Use `import type` when a symbol is only used as a type
- Example: `import { someFunction } from '../services/module.js';`

**Variables:**
- Prefer `const`/`let`; avoid `var`
- Use strict equality (`===`, `!==`)
- No unused variables
- Use optional chaining (`?.`) and nullish coalescing (`??`) where they clarify intent

**Types:**
- Prefer `type` over `interface` except for public API contracts
- Avoid `any` and `unknown`
- Avoid `as` or `!` unless necessary (e.g. known-safe casts after validation)
- No implicit any (strict TypeScript)

**Functions:**
- Use `function` keyword for top-level/named functions
- Arrow functions for callbacks and short inline use
- Descriptive names (verbs + nouns, e.g. `getUserData`)
- Use default parameters and destructuring where it improves readability

**Naming Conventions:**
- PascalCase for types/classes
- camelCase for variables, functions, methods
- UPPERCASE for constants and environment-related names
- Files/directories: kebab-case

**Code Structure:**
- Prefer functional, declarative code
- Avoid classes unless stateful encapsulation is needed
- Use constants for magic numbers and repeated values
- Iterate and modularize rather than duplicating

**Async:**
- Prefer `async`/`await` over raw Promises

**Security:**
- Use environment variables (or `.credentials`/config) for secrets
- Validate and sanitize CLI inputs and file paths
- Avoid executing user-controlled strings as shell commands

**Tests:**
- `node:test` + `node:assert/strict`
- See `testing.mdc` for full testing requirements

## Python

**Location:** `scripts/integrations/`

**Tests:** `test_*.py` in same directory

**Style:**
- unittest framework
- Mock external I/O with `unittest.mock`
- See `testing.mdc` for runner and patterns

## Linting / Formatting

No ESLint or Prettier in the repo yet. For now:
- Match existing style in the file (indent, quotes, semicolons)
- Run `npm run typecheck` and `npm test` / `npm run test:all` before committing

If you add ESLint or Prettier, document config and scripts in dev.mdc and MEMORY.md.

## Quality Practices

These practices apply to **all development work**, not just PRD execution. Scale them based on work size.

### 1. Pre-mortem (recommended for 3+ steps or complex work)

**When:** Before starting work that has risk (new systems, integrations, refactors, 3+ dependent tasks)

**How:**
- Use standalone skill: `.agents/skills/run-pre-mortem/SKILL.md`
- Or use template: `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`
- Work through 8 risk categories (context gaps, test patterns, integration, scope creep, code quality, dependencies, platform issues, state tracking)
- Create concrete mitigations for each risk

**Skip when:** Single-file changes, trivial updates, well-understood patterns

### 2. Second opinion review (optional)

**When:** Before executing a plan or PRD, especially when:
- The work is complex or high-stakes
- You want a different agent/model to review before proceeding
- Audience (builder vs user) isn't obvious

**How:**
- Use skill: `.agents/skills/review-plan/SKILL.md`
- Reviewer applies checklist and provides devil's advocate perspective

**Skip when:** Trivial changes, well-understood work, time-sensitive fixes

### 3. Quality gates (mandatory for ALL commits)

Before any commit:

```bash
npm run typecheck  # Must pass
npm test           # Must pass (full suite)
```

If the work touches Python (`scripts/integrations/`):

```bash
npm run test:py
```

**No exceptions** — even for "quick fixes." Quality gates catch ripple effects.

### 4. Code review checklist

Apply before committing:

- [ ] Uses `.js` extensions in imports (NodeNext resolution)
- [ ] No `any` types (strict TypeScript)
- [ ] Proper error handling (try/catch with graceful fallback)
- [ ] Tests for happy path and edge cases
- [ ] Backward compatibility preserved (unless explicitly breaking)
- [ ] Follows project patterns (see existing code)

### 5. Build memory capture (after substantial work)

**When:** After work that meets any of these criteria:
- Modifies 3+ files
- Takes substantial time
- Introduces new patterns or architectural changes
- Encounters surprising issues or learnings

**How:**
1. Create entry: `memory/entries/YYYY-MM-DD_[short-name]-learnings.md`
2. Include: what changed, what worked, what didn't, learnings, corrections
3. Add index line to `memory/MEMORY.md`

**Skip when:** Trivial changes (typo fixes, comment updates), no learnings to capture

See `memory.md` for full memory workflow.

### 6. Reuse and avoid duplication

Before implementing new helpers, services, or abstractions:
- Check if equivalent functionality exists in `packages/core/src/services/`, `packages/core/src/integrations/`, or existing modules
- Search AGENTS.md for existing patterns
- Apply DRY (Don't Repeat Yourself)
- Apply KISS (Keep It Simple)

If you find repetitive logic that isn't abstracted, create a refactor backlog item in `dev/backlog/improvements/` — but don't block on it.

### 7. Skill and rule changes (mandatory review)

Before creating or modifying any skill or rule file:

**Checklist:**
- [ ] Re-read `dev.mdc` before making changes
- [ ] Audience check: BUILD (dev/, .cursor/) or PRODUCT (runtime/)?
- [ ] Skill table: If adding a build skill, add to dev.mdc skills table
- [ ] AGENTS.md: Update if skill/rule changes architecture or workflows
- [ ] Cross-references: Search for references to the skill/rule being changed

**Why:** Skills and rules define agent behavior. Changes propagate widely.

### 8. Multi-IDE consistency check

Before editing files in `runtime/rules/`, `runtime/tools/`, or any path affecting both Cursor and Claude:

**Checklist:**
- [ ] No "either/or" paths: Use only `.cursor/X` (adapter transforms it)
- [ ] No hardcoded IDE names in content
- [ ] Check adapter transforms: Claude does `.cursor/` → `.claude/` and `.mdc` → `.md`

**Reference:** `packages/core/src/adapters/claude-adapter.ts`

## Execution Path Decision Tree

When approving a plan (in Plan Mode or otherwise):

```
User approves plan
     |
     ├─ Tiny (1-2 simple steps: fix typo, add comment, update string)
     |  → Direct execution
     |  → Quality gates (typecheck + test) ✓
     |  → Skip pre-mortem, skip memory capture
     |
     ├─ Small (2-3 moderate steps: add function + tests, refactor module)
     |  → Ask: "Run pre-mortem first? (Recommended for new features)"
     |  → Direct execution (with optional pre-mortem)
     |  → Quality gates ✓
     |  → Offer: "Capture learnings?" at end
     |
     └─ Medium/Large (3+ steps OR complex: new system, integration, refactor)
        → Strongly recommend: "PRD path or direct execution?"
        → If PRD: Load .agents/skills/plan-to-prd/SKILL.md
        → If direct: Apply pre-mortem + quality gates + memory capture
```

**When in doubt:** Offer both paths and let builder choose.

## Commit Message Format

Use conventional commit format:

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `docs:` — Documentation changes
- `chore:` — Maintenance tasks

Example: `feat: add builder AGENTS.md source files`

## Before Committing

1. `npm run typecheck`
2. `npm run test:all` (or `npm test` + `npm run test:py`)
3. New code → new/updated tests
4. Code review checklist (see above)

## Documentation Planning

When creating plans that touch code/features/structure, ask: **"Does this need doc updates?"**

**Scope Check:**
- [ ] All root docs: README, SETUP, AGENTS, ONBOARDING, scratchpad
- [ ] Backlog items: Search for explicit doc requirements

**Search Strategy:**
- [ ] Feature keywords: `rg "keyword1|keyword2" -g "*.md"`
- [ ] Concept audit: If feature changes paths/structure, grep old paths
- [ ] Related workflows: Check files that reference setup, install, or getting started

**Anti-pattern:** Don't assume "documentation" = README + SETUP + AGENTS. ONBOARDING, scratchpad, and backlog frequently need updates.

## References

- **Testing:** `.cursor/rules/testing.mdc`
- **Build memory:** `memory/MEMORY.md`, `.agents/sources/builder/memory.md`
- **Node/TS conventions:** Informed by [Cursor Directory Node.js rules](https://cursor.directory/rules/node.js)
