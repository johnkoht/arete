# Plan Lifecycle System — Build Learnings

**Date**: 2026-02-16
**PRD**: `dev/prds/plan-lifecycle-system/prd.md`
**Branch**: `test-pi`

## Metrics

- **Tasks**: 16/16 complete
- **Iterations**: 0 (all tasks first-attempt)
- **Tests added**: 137 extension tests
- **Commits**: 12
- **Pre-mortem**: 8 risks identified, 0 materialized

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Pre-existing typecheck failure | Yes | Yes (fixed first) | Yes |
| Extensions not in typecheck scope | No | Yes (separate tsc for pure modules) | Yes |
| Extension tests not in npm test | No | Yes (separate tsx --test) | Yes |
| YAML frontmatter parsing | No | Yes (line-by-line parser + round-trip tests) | Yes |
| Pi API surface area | No | Yes (read types.d.ts, follow existing patterns) | Yes |
| Backward compat of utils.ts | No | Yes (only added exports) | Yes |
| Module dependency graph | No | Yes (pure modules first, refactor last) | Yes |
| Scope creep in commands | No | Yes (interface contracts, pure logic tested) | Yes |

## What Worked Well

- **Pure module architecture**: Building persistence, lifecycle, agents, utils, and widget as standalone pure modules (no Pi dependencies) made them independently testable and the refactor safer.
- **Phase-by-phase execution**: Foundation → Agents → Widget → Commands → Wiring matched the dependency graph perfectly.
- **Risk 1 fix first**: Fixing the pre-existing typecheck failure before starting ensured quality gates worked throughout.
- **CommandContext/CommandPi interfaces**: Abstracting the Pi API into minimal interfaces made command handlers testable without Pi runtime.

## What Didn't Work

- Nothing significant — the pre-mortem effectively prevented issues.

## Recommendations

- **Continue**: Pure module pattern for extensions, pre-mortem before large PRDs, separate extension test runner.
- **Start**: Consider adding a `.pi/extensions/plan-mode/tsconfig.json` for local type checking of pure modules.
- **Consider**: Integration tests that load the extension in Pi and verify command registration.

## Learnings

- Pi extensions use jiti (no build step) — TypeScript is loaded directly at runtime, not compiled. This means the standard `npm run typecheck` won't catch extension errors.
- The `tsc -b --noEmit` flag is incompatible with composite projects — remove `--noEmit` and just use `tsc -b`.
- Extension tests must be run separately from package tests: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`.
