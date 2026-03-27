## Pre-Mortem: QMD Improvements

Plan: QMD Improvements | Size: Large | Steps: 6
Analyzed: 2026-02-21

---

### Risk 1: Test Suite Hangs from Unwrapped `refreshQmdIndex()`

**Problem**: The `--skip-qmd` flag exists precisely because `qmd update` can hang indefinitely in environments without qmd installed or with slow indexing. This already bit us — `fbb5ad2` was a commit specifically to add `--skip-qmd` to all test install calls to prevent qmd hangs. The new `refreshQmdIndex()` helper will be called from `pull.ts` and `meeting.ts`. If tests for those commands don't suppress the helper, they'll hang in CI and on developer machines without qmd installed.

**Mitigation**:
- `refreshQmdIndex()` must use the same `testDeps` injection pattern as `ensureQmdCollection()` — accept `deps?: QmdSetupDeps` so tests can inject mock `whichSync` and `execFileAsync`
- All new CLI command tests that exercise write paths must pass `--skip-qmd` flag or set `ARETE_SEARCH_FALLBACK=1` in test env
- Check existing `pull.ts` and `meeting.ts` tests — if any exist, update them before touching the command code

**Verification**: `ARETE_SEARCH_FALLBACK=1 npm test` passes. Confirm no new test spawns a real qmd process.

---

### Risk 2: Config Double-Loading in `refreshQmdIndex()`

**Problem**: `refreshQmdIndex()` needs both the workspace root and `qmd_collection` from `arete.yaml` to know whether a collection is configured. CLI commands will have already called `await loadConfig(root)`. If `refreshQmdIndex()` internally re-reads config, we incur a duplicate disk read and risk reading stale state if the collection name was just written.

**Mitigation**:
- `refreshQmdIndex(workspaceRoot: string, existingCollectionName: string | undefined, deps?)` — callers pass the collection name they already have, consistent with `ensureQmdCollection()` signature
- Never read `arete.yaml` inside the helper itself
- CLI commands pass `config.qmd_collection` (already loaded)

**Verification**: `refreshQmdIndex()` has zero `loadConfig` / file read calls. Receives collection name as parameter only.

---

### Risk 3: EntityService Fallback Correctness — False Negatives on New People

**Problem**: The qmd pre-filter in `refreshPersonMemory` could return 0 results for a person who *is* mentioned in meetings but hasn't been indexed under their exact name (new person, name variant, first occurrence). If the code skips the full scan on 0 qmd results, we silently miss that person — a false negative invisible to the user.

**Mitigation**:
- Rule: **if qmd returns 0 results, always fall back to full scan**
- Fallback trigger: `if (searchResults.length === 0) { /* full scan */ }`
- Add explicit test case: "SearchProvider returns empty array → EntityService performs full scan and finds the person"
- Code review check: verify there is NO early return on empty search results

**Verification**: Test case exists with mock SearchProvider returning `[]` that confirms full scan executes. No early return on empty qmd results anywhere in the code path.

---

### Risk 4: EntityService Constructor Change Ripple

**Problem**: `new EntityService(storage)` is called in 5 places across the test suite directly (not via factory): `intelligence.test.ts`, `relationships.test.ts` (×2), `proactive.test.ts`, `people-intelligence.test.ts`. If `searchProvider` is added incorrectly (required instead of optional), all five break.

**Mitigation**:
- Make strictly optional: `constructor(storage: StorageAdapter, searchProvider?: SearchProvider)`
- Run `npm run typecheck` immediately after the constructor change — before touching factory or tests
- The 5 direct-construction sites require no modification

**Verification**: `npm run typecheck` passes after adding the optional parameter. All 5 existing `new EntityService(storage)` calls compile without change.

---

### Risk 5: Multi-IDE Rule File Divergence in Step 4

**Problem**: Step 4 updates `qmd-search.mdc` in two locations: `packages/runtime/rules/cursor/` and `packages/runtime/rules/claude-code/`. These files are currently **byte-for-byte identical** (verified by diff). If the edit is made to only one, they diverge silently. Agents in Claude vs Cursor then get different indexing instructions.

**Mitigation**:
- Edit one file, then copy it verbatim: `cp packages/runtime/rules/cursor/qmd-search.mdc packages/runtime/rules/claude-code/qmd-search.mdc`
- After the edit, run: `diff packages/runtime/rules/cursor/qmd-search.mdc packages/runtime/rules/claude-code/qmd-search.mdc` — must produce zero output

**Verification**: `diff` between both rule files produces zero output after Step 4 is complete.

---

### Risk 6: `qmd update` Called Redundantly When No Files Were Written

**Problem**: `qmd update` re-indexes the entire collection. If `arete meeting add` is called with a meeting that already exists (`saveMeetingFile` returns `null` = skipped), `refreshQmdIndex()` still runs — wasted I/O. Worse in automation scripts that call `arete pull` repeatedly.

**Mitigation**:
- `refreshQmdIndex()` should only trigger if the command actually wrote files
- For `meeting add`: if `saveMeetingFile` returns `null` (skipped), skip re-index
- For `pull fathom`: pass the count of newly-saved meetings; only re-index if count > 0

**Verification**: Test case: `meeting add` with an already-existing meeting → `refreshQmdIndex()` is NOT called. Can be documented as known behavior if not fully implemented initially.

---

### Risk 7: `arete index` vs `arete update` User Confusion

**Problem**: `arete update` already re-indexes qmd (plus copies runtime assets, checks IDE config, etc.). Adding `arete index` creates user confusion: "Which do I run?" The names don't clearly communicate the difference.

**Mitigation**:
- `arete index` help text explicitly states its scope: "Re-index the search collection. For full workspace update (rules, skills, assets), use `arete update`."
- `arete update` continues showing "Search index updated" so users know it also re-indexes

**Verification**: `arete index --help` output clearly distinguishes scope from `arete update`. Builder review before shipping.

---

### Risk 8: Phase 2 factory.ts Conflict with Phase 1 Changes

**Problem**: Steps 5 and 6 (EntityService + factory wiring) don't directly depend on Steps 1-4 (refreshQmdIndex, CLI wiring), but `factory.ts` is touched in both phases. If built sequentially in a PRD, Task 6 must come after Task 1 to see any Phase 1 factory changes.

**Mitigation**:
- Execute Phase 1 fully (steps 1-4) before starting Phase 2
- When starting Step 6, re-read `factory.ts` to confirm current state
- In PRD task graph: explicitly mark Task 6 as depending on Phase 1 completion

**Verification**: Before Step 6, `git diff HEAD packages/core/src/factory.ts` confirms current state. Services LEARNINGS.md pre-edit checklist followed.

---

## Summary

Total risks identified: 8
Categories covered: Test Patterns, Integration, Code Quality, Multi-IDE Consistency, Dependencies, Platform Issues, Scope, State Tracking

| Risk | Severity |
|---|---|
| 1. Test suite hangs (qmd in tests) | 🔴 High — already materialized once |
| 2. Config double-loading in helper | 🟡 Medium — design choice, easy to get wrong |
| 3. EntityService false negatives | 🔴 High — silent correctness bug |
| 4. Constructor change ripple | 🟡 Medium — TypeScript catches it, but wide surface |
| 5. Rule file divergence | 🟡 Medium — easy to forget second file |
| 6. Redundant re-indexing | 🟠 Low-Medium — UX annoyance, not a bug |
| 7. `arete index` vs `arete update` confusion | 🟠 Low-Medium — UX/communication |
| 8. Phase 2 factory.ts ordering | 🟡 Medium — sequential dependency must be explicit in PRD |
