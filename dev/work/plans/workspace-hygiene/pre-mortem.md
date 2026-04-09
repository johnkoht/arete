# Pre-Mortem: Workspace Hygiene

## Risk 1: Jaccard Extraction — 4 Independent Copies with Different Normalization

**Problem**: There are 4 independent Jaccard implementations with different normalization:
1. `meeting-extraction.ts` (lines 189-206) — `normalizeForJaccard()` strips `[^a-z0-9\s]` (whitespace class). **Exported** from `services/index.ts`.
2. `commitments.ts` (lines 222-236) — private `normalize()` strips `[^a-z0-9 ]` (literal space). Different names.
3. `area-parser.ts` (lines 73-79) — private `jaccardSimilarity()` with `tokenizeWithStopWords()` that strips stop words.
4. Consumers importing from meeting-extraction: `meeting-processing.ts`, `meeting-reconciliation.ts`, `tasks.ts`.

Unifying normalization would silently change dedup/reconciliation thresholds.

**Mitigation**: Extract only the core `jaccardSimilarity(a: string[], b: string[]): number` computation to `utils/similarity.ts`. Leave each caller's normalization in place. Keep `services/index.ts` re-exports pointing to the new location.

**Verification**: Run `npm test` across all packages. Grep for all Jaccard usages to confirm none missed. Verify meeting-extraction exports still appear in `services/index.ts`.

---

## Risk 2: `purgeResolved()` Conflicts with Auto-Pruning in `save()`

**Problem**: `CommitmentsService.save()` (line 326-329) already auto-prunes resolved items >30 days on every write via `shouldPrune()`. Adding a separate `purgeResolved()` creates two pruning paths. A subagent might implement it as a separate load-filter-save cycle that triggers the existing pruning as a side effect.

**Mitigation**: `purgeResolved()` must reference `shouldPrune()` at line 206 and `PRUNE_DAYS = 30` at line 29. Either delegate to a parameterized `shouldPrune()` or be a public wrapper that loads, filters, and saves (which triggers existing pruning).

**Verification**: Test with commitments at 15 days and 45 days. Only 45-day item removed. No unintended side effects.

---

## Risk 3: Learnings vs Decisions Have Different Structure

**Problem**: `compactDecisions()` at line 457 uses `parseMemorySections()` and `matchDecisionToArea()`. Learnings may have different heading structure and may not map to areas the same way. Copy-pasting without understanding structural differences risks data loss.

**Mitigation**: Before coding, read actual `decisions.md` and `learnings.md` files to understand structural differences. Point subagent at `compactDecisions()` as template but flag that area matching may not apply. Consider age-based archival only for learnings.

**Verification**: Unit test with mock learnings of varying ages. Verify old archived, recent preserved. Dry-run against real workspace.

---

## Risk 4: HygieneService Has 5+ Dependencies — Factory Wiring

**Problem**: HygieneService needs StorageAdapter, CommitmentsService, AreaMemoryService, AreaParserService, MemoryService — the deepest dependency chain in the factory. `factory.test.ts` line 42 asserts exact service keys; adding `hygiene` breaks it. Must update `AreteServices` type, return object, and test.

**Mitigation**: Wire `hygiene` after `areaMemory` (line 112+). Update `AreteServices` type, factory return, and test's expected keys. Provide this checklist to the subagent.

**Verification**: `npm run build` + `npm test -- packages/core/test/factory.test.ts`.

---

## Risk 5: CLI Requires Exact Boilerplate Pattern

**Problem**: CLI commands must: export `registerXCommand`, handle `--json`, do workspace root detection with error handling, be registered in `index.ts`. Missing any of these produces an inconsistent command.

**Mitigation**: Use `packages/cli/src/commands/commitments.ts` as the exact template. Explicit checklist: (1) export function, (2) `--json` flag, (3) workspace guard, (4) registration in index.ts.

**Verification**: `arete hygiene scan` outside workspace errors gracefully. `arete hygiene scan --json` returns valid JSON. `arete --help` shows hygiene.

---

## Risk 6: Backend Route Registration in server.ts

**Problem**: Route must be exported as `createHygieneRouter(workspaceRoot)` factory and imported + mounted in `server.ts`. If route file is created but not wired, endpoints silently don't exist (404).

**Mitigation**: Include explicit instructions to add import and `.route()` call in `server.ts`. Use `routes/tasks.ts` as template.

**Verification**: Curl `GET /api/hygiene/scan` — should not 404.

---

## Risk 7: Web UI Scope Creep on Tier-Grouped Approval

**Problem**: Full per-item approval UI (checkboxes, tier grouping, approve/skip per item) is the largest single task and most likely to expand scope.

**Mitigation**: For MVP web page, keep it read-only scan results with a single "Apply All" button. Defer per-item approval to Phase 2. CLI handles selective application in the meantime.

**Verification**: Page renders scan results grouped by tier. "Apply All" calls backend.

---

## Risk 8: `normalizeForJaccard` Is Part of Public API Surface

**Problem**: `normalizeForJaccard` and `jaccardSimilarity` are exported from `services/index.ts` (lines 40-41) and re-exported through `@arete/core`. Moving them breaks the public API and 3+ downstream files.

**Mitigation**: Keep re-exports in `services/index.ts` pointing to new location. In `meeting-extraction.ts`, replace implementations with re-exports from utils module.

**Verification**: `npm run build` across all packages. Grep all consumers.

---

## Risk 9: Task Dependencies Are Implicitly Ordered

**Problem**: Tasks have implicit ordering (utils before service, service before CLI/backend, backend before web) but nothing enforces it. Parallel execution would fail to compile.

**Mitigation**: Define explicit execution DAG:
- **Wave 1** (parallel): Tasks 1, 2, 3 (Jaccard extraction, purgeResolved, compactLearnings)
- **Wave 2** (depends on Wave 1): Task 4+5 (types + HygieneService)
- **Wave 3** (depends on Wave 2, parallel): Task 6 (CLI)
- Phase 2 tasks depend on Phase 1 completion.

**Verification**: Run `npm run build` after each wave.

---

## Summary

Total risks identified: 9
Categories covered: Reuse/Duplication (1, 8), Integration (2, 4, 6), Context Gaps (3, 5), Scope Creep (7), Dependencies (9)

**CRITICAL risks: 0**
**HIGH risks: 2** (Risk 1: Jaccard copies with different normalization, Risk 8: public API surface)
**MEDIUM risks: 7**

**Ready to proceed with these mitigations.**
