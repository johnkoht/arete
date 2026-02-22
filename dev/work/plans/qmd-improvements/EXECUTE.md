# Execute qmd-improvements PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open qmd-improvements
/build
```

## Manual (fallback)

Execute the qmd-improvements PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/qmd-improvements/prd.md` and the task list is at `dev/work/plans/qmd-improvements/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Riskiest Parts (from pre-mortem)

1. **Task 2 — Test suite hangs**: `refreshQmdIndex()` must use `testDeps` injection. All new tests on write-path commands must use `--skip-qmd` or `ARETE_SEARCH_FALLBACK=1`. Run `ARETE_SEARCH_FALLBACK=1 npm test` as the CI simulation check after Task 2.

2. **Task 5 — EntityService false negatives**: If qmd pre-filter returns 0 results, ALWAYS fall back to full scan. Never skip based on empty results. This must have an explicit test case.

3. **Task 2 — `meeting.ts` config**: `meeting.ts` has no `loadConfig` currently. Add `loadConfig(services.storage, root)` AFTER `findRoot()` succeeds — follow `pull.ts` L98 pattern exactly.

## Task Dependencies

- Tasks 1–4 are independent (can run in any order, but Task 1 must complete before Task 2)
- Task 5 must complete before Task 6
- Recommended order: 1 → 2 → 3 → 4 → 5 → 6

## Key Files for Context

- `dev/work/plans/qmd-improvements/pre-mortem.md` — 8 risks with mitigations
- `dev/work/plans/qmd-improvements/review.md` — 5 review concerns, all incorporated into ACs
- `packages/core/src/search/LEARNINGS.md` — testDeps pattern, ARETE_SEARCH_FALLBACK guard
- `packages/core/src/services/LEARNINGS.md` — DI patterns, factory wiring
- `packages/cli/src/commands/LEARNINGS.md` — command patterns, loadConfig usage
