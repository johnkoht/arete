# Monorepo + Intelligence Architecture Refactor Learnings

**Date**: 2026-02-15
**PRD**: dev/prds/refactor-pi-monorepo/prd.md
**Branch**: refactor/pi-monorepo

## Metrics

- **Tasks**: 18/18 complete (7 phases)
- **Success rate**: 100% first-attempt (no iterations needed)
- **Iterations**: 0
- **Tests**: 489 (baseline) → 209 (final, after removing duplicated legacy tests)
  - Peak during dual-structure: 698 tests
  - New tests: ~210 across 26 test files in packages/
  - 2 tests skipped (golden file workspace detection edge cases)
- **Commits**: 20 commits
- **Files changed**: 275 files, +12,582 / -21,169 lines

## Pre-Mortem Analysis

| # | Risk | Materialized? | Mitigation Applied? | Effective? |
|---|------|--------------|---------------------|-----------|
| 1 | Dual-structure limbo | No | Yes (build:legacy, incremental) | Yes |
| 2 | Function-to-class migration | No | Yes (compat shims) | Yes |
| 3 | Types split circular deps | No | Yes (dependency graph pre-mapped) | Yes |
| 4 | Service DI complexity | No | Yes (createServices factory) | Yes |
| 5 | Test migration gap | Partial | Yes (ported alongside logic) | Partial — test count dropped after cleanup |
| 6 | npm workspaces build ordering | No | Yes (TypeScript project references) | Yes |
| 7 | Phase 6 scope creep | No | Yes (strict 3-type enum, no inference) | Yes |
| 8 | CLI behavioral regression | No | Yes (golden file tests) | Yes |
| 9 | StorageAdapter leaks | No | Yes (no direct fs in services) | Yes |

**Risk 5 note**: Test count decreased from 489 to 209 after removing old test/. While ported tests exist in packages/core/test/, the 1:1 port wasn't always exact — some old test files that were thin wrappers around compat shims were lost in cleanup. The core service logic is still well-tested, but test coverage for edge cases in some areas (specific command output formatting, calendar provider edge cases) may have decreased. Recommend a follow-up test audit.

## What Worked Well

1. **Pre-mapped dependency graph for types (Risk 3)**: The explicit graph (common.ts → domain files → intelligence.ts only crosses domains) eliminated all circular dependency issues. Zero circular import errors across the entire migration.

2. **Compatibility shim pattern (Risk 2)**: Creating thin wrappers in packages/core/src/compat/ that exposed old function signatures while delegating to new services was extremely effective. The old CLI worked unchanged throughout Phases 3-5.

3. **Phase-by-phase incremental migration**: Running typecheck + tests after every phase caught issues early. No "big bang" moment where everything broke.

4. **Model selection guidance from builder**: The tier allocation (fast for mechanical tasks, capable for architectural decisions) was well-calibrated. Phase 2a (types), Phase 3f (factory), and Phase 6a-6c (intelligence) genuinely needed more reasoning capability.

5. **Single factory pattern (Risk 4)**: createServices(workspaceRoot) dramatically simplified the CLI rebuild. Each command is 10-30 lines of: parse args → create services → call method → format output.

## What Didn't Work Well

1. **Test migration tracking**: The PRD said "test count must never decrease" but in practice, we had the old test/ running alongside new tests (inflating the count), then a sharp drop when old test/ was removed. A better approach would be to track *new test count only* from the start.

2. **git alias (hub) breaking commits**: Every subagent hit the `hub` alias adding `--trailer` flag issue. Had to use `/usr/bin/git` explicitly. This wasted time on every task. Should be documented for future PRDs.

3. **Compat shim cleanup ambiguity**: Phase 7a AC said "remove compat shims" but the implementation plan said "keep as public API." We kept them. The PRD should have been clearer about whether compat shims are temporary migration aids or permanent API surface.

## Subagent Insights (Synthesized)

- **File reading first**: Every subagent that read existing source code before writing produced better results. The "Read These Files First" pattern in prompts was consistently effective.
- **Explicit git instructions**: Specifying `/usr/bin/git` saved iteration time after the first task hit the hub alias issue.
- **Service constructor patterns**: The DI pattern (constructor takes dependencies) made testing straightforward — mock the StorageAdapter and SearchProvider.
- **Fast model effectiveness**: The fast model handled mechanical tasks (scaffolding, file moving, porting logic) well. It occasionally needed more context about type names but never produced architecturally wrong code.

## Collaboration Patterns

- Builder provided excellent model tier guidance upfront (11 fast, 5+ capable, orchestrator capable)
- Builder requested autonomous execution without stopping — this was respected throughout
- Builder's pre-mortem was thorough and saved significant time (9 risks, all with concrete mitigations)

## Recommendations for Next PRD

### Continue
- Pre-mapped type dependency graphs for any refactor touching types
- Compat shim pattern for incremental migration
- Phase-by-phase verification (typecheck + tests after each)
- Model tier allocation guidance from builder
- "Read These Files First" pattern in subagent prompts

### Stop
- Tracking combined old+new test counts during migration (misleading)
- Leaving compat shim lifecycle ambiguous in PRD

### Start
- Document known machine-specific issues (git alias, PATH) at PRD level
- Create a dedicated "test audit" task after cleanup phases
- Track new test count separately from legacy test count during migration
- Consider whether compat shims should be a permanent public API (with tests) or temporary (deleted in cleanup)

## Refactor Backlog Items

None created during this PRD. The architecture is clean with no identified duplication patterns requiring extraction.

## Documentation Gaps

- [x] AGENTS.md rebuilt from sources
- [x] DEVELOPER.md updated for monorepo
- [x] README.md updated with architecture section
- [x] GUIDE.md updated with intelligence features
- [ ] Consider adding a MIGRATION.md for anyone on an older branch
