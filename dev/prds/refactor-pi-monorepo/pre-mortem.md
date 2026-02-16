# Pre-Mortem: Monorepo + Intelligence Architecture Refactor

Created: 2026-02-16

## Risk 1: Dual-structure limbo breaks the repo mid-migration

**Problem**: During Phases 3-5, both old and new structures coexist. If any phase is left incomplete, the repo won't build. The `bin/arete` binary path could break if updated too early.

**Mitigation**: Maintain "working old path" throughout. Don't modify existing src/, runtime/, bin/ during Phase 1. Add `build:legacy` script. Only update bin path in Phase 4 after all commands work. Phase 7 is the only phase that deletes old directories.

**Verification**: At the end of every phase, run `npm run build && npm run typecheck && npm test`. All must pass.

---

## Risk 2: Function-to-class migration changes every call signature

**Problem**: Current code uses standalone functions (getRelevantContext, searchMemory, resolveEntity). New architecture uses service classes. Every consumer's call pattern changes.

**Mitigation**: In Phase 3, create compatibility shims — thin wrappers exposing old function signatures that delegate to new services. Existing CLI works unchanged via shims. CLI rebuild in Phase 4 replaces shims with direct service calls. Delete shims in Phase 7.

**Verification**: After Phase 3, existing CLI commands work unchanged by importing compatibility shims.

---

## Risk 3: Types split introduces circular dependencies

**Problem**: Splitting src/types.ts into 8 domain files risks circular imports (Briefing → ContextBundle → ProductPrimitive → intelligence.ts).

**Mitigation**: Map type dependency graph first. Leaf types in domain files. common.ts for shared primitives. Only intelligence.ts imports across domains. Rule: domain model files import from common.ts and own domain only.

**Verification**: packages/core builds with no circular dependency warnings.

---

## Risk 4: Service dependency injection becomes complex

**Problem**: IntelligenceService depends on 3 other services, each depending on StorageAdapter and SearchProvider. Manual wiring in every consumer creates boilerplate.

**Mitigation**: createServices(workspaceRoot) factory function wires everything up. CLI commands call factory once. Individual constructors still accept dependencies for testability.

**Verification**: Every CLI command uses factory. Grep for `new ContextService` in packages/cli/ — only in factory.

---

## Risk 5: Test migration gap — tests reference old paths

**Problem**: 35+ test files import from `../../src/core/`. Moving code breaks every import. Risk of "no tests running" appearing as "all tests pass."

**Mitigation**: Port tests alongside logic (not batched separately). Record test count baseline before Phase 3. Each package gets own test script. Root npm test runs all. Track count — never decreases.

**Verification**: Test count before >= test count after at every phase boundary.

---

## Risk 6: npm workspaces build ordering

**Problem**: npm workspaces don't guarantee build order. cli depends on core — if core isn't built, cli fails.

**Mitigation**: TypeScript project references (references in tsconfig.json). Root tsc --build for ordered builds. tsx for dev mode (no build needed).

**Verification**: `npm run build` from root builds all packages in correct order.

---

## Risk 7: Phase 6 scope creep on entity relationships

**Problem**: "Lightweight relationship graph" is deceptively simple to spec, complex to build well. Could expand into knowledge graph / NLP project.

**Mitigation**: Strict v1 scope: findMentions = grep-like scan. getRelationships extracts ONLY explicit metadata (project README team section, meeting attendees field). EntityRelationship.type = exactly 3 values: works_on | attended | mentioned_in. No co-occurrence inference.

**Verification**: EntityRelationship.type union has exactly 3 members. No inference logic in codebase.

---

## Risk 8: CLI behavioral regression

**Problem**: Converting from standalone functions to service classes could subtly change behavior. Same query might produce different results.

**Mitigation**: Golden file test suite: capture output of key commands before migration. After Phase 4, diff against golden files. Pattern matching for non-deterministic parts.

**Verification**: Golden file tests pass after Phase 4.

---

## Risk 9: StorageAdapter abstraction leaks filesystem assumptions

**Problem**: Services that bypass the adapter and use fs directly won't work with future adapters (SQLite for desktop).

**Mitigation**: Enforce: no direct fs calls in any service class. All file operations go through StorageAdapter. Accept that v1 interface is filesystem-shaped — that's fine. Revisit when desktop app PRD is written.

**Verification**: `rg "import.*from.*fs" packages/core/src/services/` returns zero results.

---

## Summary

| # | Risk | Category | Phases Affected |
|---|------|----------|----------------|
| 1 | Dual-structure limbo | State Tracking + Context | 3, 4, 5, 7 |
| 2 | Function-to-class API migration | Integration | 3, 4 |
| 3 | Types split circular dependencies | Code Quality | 2, 3 |
| 4 | Service dependency injection complexity | Integration + Code Quality | 3, 4 |
| 5 | Test migration gap | Test Patterns | 3, 4, 5 |
| 6 | npm workspaces build ordering | Platform + Dependencies | 1, 2, 3 |
| 7 | Phase 6 scope creep on relationships | Scope Creep | 6 |
| 8 | CLI behavioral regression | Integration + Test Patterns | 4 |
| 9 | StorageAdapter filesystem assumptions | Code Quality | 3, 6 |

Total risks: 9
Categories covered: Context Gaps, Test Patterns, Integration, Scope Creep, Code Quality, Dependencies, Platform Issues, State Tracking
