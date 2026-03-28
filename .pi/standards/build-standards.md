# Build Standards

Single source of truth for coding conventions, testing requirements, and quality gates. All BUILD mode agents reference this file instead of duplicating standards.

> For architectural patterns and design conventions, see `.pi/standards/patterns.md`.

---

## Quality Gates (mandatory for ALL commits)

Before any commit, these **must pass**:

```bash
npm run build      # Regenerates dist/ files (must be committed)
npm run typecheck  # Must pass
npm test           # Must pass (full suite, not just new tests)
```

If the work touches Python (`scripts/integrations/`), also run:

```bash
npm run test:py
```

**No exceptions** — even for "quick fixes." Quality gates catch ripple effects.

### Dist Files Must Be Committed

The `dist/` directories are committed for GitHub install support (users can install directly from GitHub without building). After any source change:

1. Run `npm run build` to regenerate dist files
2. Stage and commit the dist changes with your source changes
3. If you see unstaged dist files in `git status`, you forgot to build

This applies to: `packages/core/dist/`, `packages/cli/dist/`, `packages/apps/backend/dist/`, `packages/apps/web/dist/`

---

## TypeScript Conventions

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

---

## Python Conventions

**Location:** `scripts/integrations/`

**Tests:** `test_*.py` in same directory

**Style:**
- `unittest` framework with `unittest.mock` for mocking external I/O
- Runner: `python3 -m unittest scripts/integrations/test_*.py` or `npm run test:py`

---

## Testing Requirements

All code changes MUST include corresponding tests. Never ship code without test coverage.

### Test Infrastructure

**TypeScript** (Node.js built-in test runner via tsx):
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

**Python** (unittest):
- **Location**: `scripts/integrations/test_*.py` (co-located with source)
- **Naming**: `test_<module>.py`
- **Runner**: `python3 -m unittest scripts/integrations/test_*.py` or `npm run test:py`
- **Pattern**: `unittest.TestCase` with `unittest.mock` for mocking

### Test Rules

| Change Type | Required Tests |
|-------------|----------------|
| New function/module | Happy path + edge cases + error handling |
| Bug fix | Regression test that reproduces the bug before fixing |
| Refactor | Existing tests pass; new tests for any new behavior |
| New file | Corresponding test file following project structure |

### Test Structure

- **Arrange-Act-Assert**: Follow the AAA pattern in each test
- **Descriptive names**: Test names should describe the behavior being tested
- **Isolation**: Tests must not depend on external services, network, or filesystem state
- **Mocking**: Mock external dependencies (APIs, filesystem, child processes)
- **Cleanup**: Use `beforeEach`/`afterEach` (TS) or `setUp`/`tearDown` (Python) to clean up temp files

### What to Test

| Layer | Test Focus | Mocking |
|-------|-----------|---------|
| Core utilities (`packages/core/src/`) | Pure logic, config resolution, path handling | Mock filesystem |
| Commands (`packages/cli/src/commands/`) | Command routing, error handling, output format | Mock workspace, child_process |
| Types | Type definitions don't need tests | N/A |
| Python integrations (`scripts/`) | API client logic, data transformation, filtering | Mock HTTP requests |

### Test File Mapping

| Source File | Test File |
|-------------|-----------|
| `packages/core/src/utils/slugify.ts` | `packages/core/test/utils/slugify.test.ts` |
| `packages/core/src/services/memory.ts` | `packages/core/test/services/memory.test.ts` |
| `packages/core/src/integrations/calendar/index.ts` | `packages/core/test/integrations/calendar.test.ts` |
| `packages/cli/src/commands/install.ts` | `packages/cli/test/commands/install.test.ts` |
| `scripts/integrations/utils.py` | `scripts/integrations/test_utils.py` |

When adding new source files, create a corresponding test file following this pattern.

### Seed Test-Data Warning

When working on testing, seed, or `test-data/` functionality:
- **Do not run** `arete seed test-data` when the workspace is the arete development repo
- **Remind the user** to run seed only in a separate Areté-enabled project
- **After completing a task**, check for accidentally generated seed data: `people/internal/jane-doe.md`, `alex-eng.md`, `people/customers/bob-buyer.md`, `carol-champion.md`, `resources/meetings/2026-*.md`, `projects/active/onboarding-discovery/`, `TEST-SCENARIOS.md` at root. If found, ask: "Seed test data appears to have been generated in this workspace. Should I remove it?"

---

## Code Review Checklist

Apply before committing any substantial change:

- [ ] **Uses `.js` extensions** in imports (NodeNext module resolution)
- [ ] **No `any` types** (strict TypeScript)
- [ ] **Proper error handling** (try/catch with graceful fallback)
- [ ] **Tests for happy path and edge cases**
- [ ] **Backward compatibility preserved** (function signatures unchanged unless explicitly breaking)
- [ ] **Follows project patterns** (see existing code, AGENTS.md conventions)

If any item fails, fix before committing.

---

## Commit Format

Use conventional commit format:

- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `docs:` — Documentation changes
- `chore:` — Maintenance tasks

Example: `refactor(build): consolidate coding standards into build-standards.md`

---

## Before Committing

1. `npm run build` (regenerates dist/ — must be committed)
2. `npm run typecheck`
3. `npm run test:all` (or `npm test` + `npm run test:py` if Python touched)
4. Stage dist files with your source changes (`git add packages/*/dist/`)
5. New code → new/updated tests
6. Code review checklist (see above)
7. After regression fixes: update the nearest LEARNINGS.md with what broke, why, and how to avoid it

### Cleanup Check

Before committing, verify:
- No leftover `console.log` or debug statements
- No commented-out code
- No temp files or scratch work left behind

---

## Linting / Formatting

No ESLint or Prettier in the repo yet. For now:
- Match existing style in the file (indent, quotes, semicolons)
- Run `npm run typecheck` and `npm test` / `npm run test:all` before committing

If you add ESLint or Prettier, document config and scripts in dev.mdc and MEMORY.md.
