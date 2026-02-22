# PRD: QMD Improvements

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-21  
**Branch**: `feature/qmd-improvements`

---

## 1. Problem & Goals

### Problem

QMD is Areté's semantic search engine — the intelligence layer that powers `arete brief`, `arete context`, `arete memory search`, and most PM skills (goals-alignment, week-plan, daily-plan, meeting-prep, etc.). When these skills run, qmd finds relevant content to inject as context. The smarter the index, the smarter the answers.

**Gap 1 — Stale index**: The qmd index only refreshes on `arete install` and `arete update`. Every time content is written to the workspace — meetings pulled from Fathom, meetings added manually, people processed — the index goes stale. Skills silently search an incomplete picture of the workspace. Users don't know this is happening and don't know to run `arete update`.

**Gap 2 — No semantic filtering in EntityService**: `EntityService.refreshPersonMemory()` does exhaustive file scanning — every person × every meeting file. It doesn't use qmd at all, missing an opportunity to pre-filter semantically (e.g., find meetings mentioning "Bob Chen") and reduce I/O.

### Goals

1. **Auto-refresh the qmd index** after every CLI command that writes `.md` files, so search is always current without manual intervention.
2. **Add `arete index` command** for users who add or edit files outside the CLI.
3. **Update agent rules** so agent-driven writes (e.g., capture-conversation) also trigger re-indexing.
4. **Inject qmd into EntityService** as an optional pre-filter for meeting scans, with full-scan fallback when qmd returns no results.

### Out of Scope

- Live/filesystem-watcher indexing
- Changing qmd chunk size or indexing granularity (qmd's concern)
- Semantic skill routing (pattern matching is sufficient)
- Non-markdown file indexing
- Real-time progress display during `qmd update`

---

## 2. Pre-Mortem Risks (Key Mitigations)

From `dev/work/plans/qmd-improvements/pre-mortem.md`:

| Risk | Mitigation |
|---|---|
| Test suite hangs | `refreshQmdIndex()` must use `testDeps` injection pattern. All new tests on write-path commands must use `--skip-qmd` or `ARETE_SEARCH_FALLBACK=1`. |
| Config double-loading | `refreshQmdIndex(root, existingCollectionName, deps?)` — callers pass `config.qmd_collection` they already have. Never reads `arete.yaml` internally. |
| EntityService false negatives | If qmd returns 0 results, always fall back to full scan. Never skip the scan based on empty qmd results. |
| EntityService constructor ripple | `searchProvider` must be strictly optional. All 5 direct-construction sites require no change. |
| Rule file divergence | Edit one, then `cp cursor → claude-code`. Verify `diff` produces zero output. |
| Redundant re-indexing | Only trigger `refreshQmdIndex()` if the command actually wrote files (count > 0). |
| `meeting.ts` has no `loadConfig` | Add `loadConfig(services.storage, root)` after `findRoot()`, following `pull.ts` pattern (L98). |

---

## 3. Tasks

### Task 1: Extract `refreshQmdIndex()` helper

**Description**: Create a lightweight `refreshQmdIndex()` function in `packages/core/src/search/qmd-setup.ts`, separate from `ensureQmdCollection()`. This is the shared primitive that all write-path commands will use. Also fix the stale `qmd-semantic-search` capability registry entry.

**Files to read before starting**:
- `packages/core/src/search/qmd-setup.ts` — existing `ensureQmdCollection()` pattern and `QmdSetupDeps` interface
- `packages/core/src/search/LEARNINGS.md` — `testDeps` injection pattern, `ARETE_SEARCH_FALLBACK` guard
- `packages/core/test/search/qmd-setup.test.ts` — existing test structure to follow
- `dev/catalog/capabilities.json` — `qmd-semantic-search` entry to fix

**Implementation details**:
- Signature: `refreshQmdIndex(workspaceRoot: string, existingCollectionName: string | undefined, deps?: QmdSetupDeps): Promise<{ indexed: boolean; warning?: string; skipped: boolean }>`
- Checks: qmd binary on `$PATH` (via `whichSync`) AND `existingCollectionName` is non-empty AND `ARETE_SEARCH_FALLBACK` env var is not set
- If all pass: runs `qmd update` in `workspaceRoot` — non-fatal, returns warning on failure, never throws
- If any check fails: returns `{ skipped: true, indexed: false }`
- Uses injectable `testDeps?: QmdSetupDeps` for unit testing (same pattern as `ensureQmdCollection`)
- Export from `packages/core/src/search/index.ts`

**Acceptance Criteria**:
- `refreshQmdIndex()` exported from `packages/core/src/search/index.ts` and `@arete/core`
- Unit tests cover: (a) skips gracefully when qmd not installed, (b) skips when no collection name provided, (c) skips when `ARETE_SEARCH_FALLBACK=1`, (d) runs `qmd update` when all checks pass, (e) returns warning on update failure, never throws
- `testDeps` injection used — no real `qmd` processes spawned in tests
- `dev/catalog/capabilities.json` entry `qmd-semantic-search` updated: fix `implementationPaths` from `search-providers/qmd.ts` → `search/providers/qmd.ts`; remove non-existent `search.ts`; add `search/qmd-setup.ts`
- `npm run typecheck && npm test` pass

---

### Task 2: Wire `refreshQmdIndex()` into write-path CLI commands

**Description**: Add post-write re-indexing to `arete pull fathom`, `arete meeting add`, and `arete meeting process`. Each command calls `refreshQmdIndex()` after successfully writing files, but only if files were actually written.

**Files to read before starting**:
- `packages/cli/src/commands/pull.ts` — existing `loadConfig` usage at L98; fathom pull flow
- `packages/cli/src/commands/meeting.ts` — `meeting add` and `meeting process` flows; note: currently NO `loadConfig` call
- `packages/cli/src/commands/install.ts` — `--skip-qmd` flag pattern to replicate
- `packages/cli/src/commands/update.ts` — `--skip-qmd` flag pattern to replicate
- `packages/cli/src/commands/LEARNINGS.md` — command patterns, formatters
- `packages/cli/test/commands/meeting-process.test.ts` — existing tests that need `--skip-qmd` audit
- `packages/core/src/search/LEARNINGS.md` — `ARETE_SEARCH_FALLBACK` pattern

**Implementation details**:

For `pull.ts`:
- After all Fathom meeting files are saved, check saved count > 0; if so, call `refreshQmdIndex(root, config.qmd_collection)` — `config` is already loaded at L98
- Add `--skip-qmd` option (consistent with `install.ts` and `update.ts`)
- Output: `listItem('Search index', 'qmd index updated')` if indexed; silent if skipped; `warn(result.warning)` if warning

For `meeting.ts`:
- Add `--skip-qmd` option to both `meeting add` and `meeting process` subcommands
- **Add `loadConfig(services.storage, root)` call after `findRoot()` succeeds** — follow `pull.ts` pattern; import `loadConfig` from `@arete/core`
- `meeting add`: only call `refreshQmdIndex()` if `saveMeetingFile` returned a non-null path (file was actually written, not skipped)
- `meeting process`: only call `refreshQmdIndex()` after `applied.length > 0` (person files were written)

**Acceptance Criteria**:
- `arete pull fathom` triggers `refreshQmdIndex()` after saving meetings; skips if 0 new meetings saved; respects `--skip-qmd`
- `arete meeting add` triggers `refreshQmdIndex()` after saving; skips if meeting already existed; respects `--skip-qmd`
- `arete meeting process` triggers `refreshQmdIndex()` after writing person files; skips if nothing applied; respects `--skip-qmd`
- `meeting.ts` uses `loadConfig(services.storage, root)` loaded after `findRoot()` (not before); `qmd_collection` passed to `refreshQmdIndex()`
- Audit complete: all existing `meeting-process.test.ts` invocations of `meeting process` that could trigger qmd have `--skip-qmd` added
- Output format follows `listItem()` pattern from `formatters.ts`
- `npm run typecheck && npm test` pass (including `ARETE_SEARCH_FALLBACK=1 npm test`)

---

### Task 3: Add `arete index` standalone command

**Description**: Add a new top-level `arete index` command for users who add or edit files outside the CLI (manual context docs, notes, meeting files added by hand, etc.).

**Files to read before starting**:
- `packages/cli/src/index.ts` — where to register the new command
- `packages/cli/src/commands/update.ts` — existing qmd pattern to follow
- `packages/cli/src/commands/LEARNINGS.md` — command skeleton pattern
- `packages/cli/src/formatters.ts` — output helpers

**Implementation details**:
- Create `packages/cli/src/commands/index-search.ts` (not `index.ts` to avoid naming confusion)
- Command: `arete index`
- `--status` flag: print collection name from `arete.yaml` config (NOT last-indexed time — qmd doesn't expose this) and whether a collection is configured; no re-indexing
- Default (no flags): runs `refreshQmdIndex()`, reports result
- `--skip-qmd` not needed (user is explicitly invoking this); but if qmd not installed or no collection: graceful message "qmd not installed" / "No collection configured — run `arete install` first"
- Register in `packages/cli/src/index.ts`
- Help text: "Re-index the search collection. For full workspace update (rules, skills, assets), use `arete update`."

**Acceptance Criteria**:
- `arete index` runs `qmd update` when collection is configured; shows "Search index updated"
- `arete index --status` prints collection name from config; if none: "No collection configured"; does not run `qmd update`
- `arete index` when qmd not installed: graceful message, exit 0
- `arete index` is idempotent — safe to run multiple times
- Help text distinguishes `arete index` scope from `arete update`
- Unit tests: (a) default run triggers update, (b) `--status` does not trigger update, (c) graceful when qmd not installed, (d) graceful when no collection configured
- `npm run typecheck && npm test` pass

---

### Task 4: Update `qmd-search.mdc` rule for write-path awareness

**Description**: Update the agent-facing qmd rule in both `packages/runtime/rules/cursor/qmd-search.mdc` and `packages/runtime/rules/claude-code/qmd-search.mdc` to document the write-path indexing pattern. Agents should run `arete index` after writing files to the workspace.

**Files to read before starting**:
- `packages/runtime/rules/cursor/qmd-search.mdc` — current rule content
- `packages/runtime/rules/claude-code/qmd-search.mdc` — must be kept identical to cursor version

**Implementation details**:
Add a new section to the rule: **"After Writing Files"**

```markdown
## After Writing Files

When you write `.md` files to the workspace (e.g., saving a conversation, creating a project, adding context docs), run:

```bash
arete index
```

This re-indexes the qmd collection so the new content is immediately searchable. Applies to:
- After `capture-conversation` saves a conversation to `resources/conversations/`
- After creating new project files, context docs, or memory entries
- After any agent-driven write of `.md` content

Skip this only if `--skip-qmd` was passed or the write produced no new files.
```

After editing cursor version: `cp packages/runtime/rules/cursor/qmd-search.mdc packages/runtime/rules/claude-code/qmd-search.mdc`

**Acceptance Criteria**:
- Both rule files updated with the "After Writing Files" section
- `diff packages/runtime/rules/cursor/qmd-search.mdc packages/runtime/rules/claude-code/qmd-search.mdc` produces zero output
- `capture-conversation` explicitly named as a trigger
- Rule content contains no "either/or" IDE path patterns (multi-IDE consistency rule)
- `npm run typecheck && npm test` pass

---

### Task 5: Inject `SearchProvider` into EntityService

**Description**: Add an optional `SearchProvider` parameter to `EntityService`'s constructor. In `refreshPersonMemory()`, use it to pre-filter which meeting files to scan for a person — reducing O(n×m) full scans. If qmd returns 0 results, always fall back to a full scan.

**Files to read before starting**:
- `packages/core/src/services/entity.ts` — `EntityService` constructor and `refreshPersonMemory()` method
- `packages/core/src/services/LEARNINGS.md` — DI pattern, StorageAdapter invariant, no direct fs imports
- `packages/core/src/search/types.ts` — `SearchProvider` interface
- `packages/core/test/services/people-intelligence.test.ts` — existing direct-construction pattern
- `packages/core/test/services/relationships.test.ts` — existing direct-construction pattern (×2)
- `packages/core/test/integration/intelligence.test.ts` — existing direct-construction pattern

**Implementation details**:
- Add `searchProvider?: SearchProvider` as second optional constructor parameter: `constructor(storage: StorageAdapter, searchProvider?: SearchProvider)`
- In `refreshPersonMemory()`: if `searchProvider` is set, run `searchProvider.semanticSearch(personName, { limit: 20 })` first
  - If results.length > 0: use `results.map(r => r.path)` as the meeting file scan set
  - If results.length === 0: **always fall back to full scan** (never skip — the person may exist but not yet be indexed)
- Backward compatible: all 5 existing `new EntityService(storage)` construction sites require no changes

**Critical invariant**: Empty search results → full scan. This must be tested explicitly.

**Acceptance Criteria**:
- `EntityService` constructor accepts optional `SearchProvider` — all existing `new EntityService(storage)` calls compile without modification
- When SearchProvider provided AND returns results: `refreshPersonMemory()` scans only matched files
- When SearchProvider provided AND returns 0 results: `refreshPersonMemory()` falls back to full scan (tested explicitly with a mock that returns `[]`)
- When no SearchProvider: behavior unchanged from current implementation
- Unit tests cover all three cases above
- `npm run typecheck && npm test` pass

---

### Task 6: Wire SearchProvider into EntityService via factory

**Description**: Pass the `SearchProvider` instance from the factory to `EntityService` when creating services. No user-visible behavior change — same outputs, potentially faster execution on large workspaces.

**Files to read before starting**:
- `packages/core/src/factory.ts` — `createServices()` wiring, `AreteServices` type
- `packages/core/src/services/LEARNINGS.md` — factory patterns, `AreteServices` change checklist
- `packages/core/test/integration/intelligence.test.ts` — integration test to update
- Task 5 must be complete before starting this task

**Implementation details**:
- In `factory.ts`, change: `const entity = new EntityService(storage)` → `const entity = new EntityService(storage, search)` where `search` is already constructed at L59
- No changes to `AreteServices` type (EntityService is already in it)

**Acceptance Criteria**:
- `factory.ts` passes `search` to `EntityService` constructor
- All existing entity tests pass (they construct EntityService directly, bypass factory — no changes needed)
- **New integration test** verifies that `createServices()` passes a SearchProvider to EntityService — at minimum: construct services with a mock config, confirm `entity` receives a non-`undefined` search provider when qmd is available
- `npm run typecheck && npm test` pass

---

## 4. Quality Gates

All tasks must pass before marking complete:

```bash
npm run typecheck   # Must pass
npm test            # Must pass (full suite)
ARETE_SEARCH_FALLBACK=1 npm test  # Must pass (CI simulation — no qmd binary)
```

## 5. Key References

- `packages/core/src/search/LEARNINGS.md` — `testDeps` pattern, `ARETE_SEARCH_FALLBACK`, score clamping
- `packages/core/src/services/LEARNINGS.md` — DI patterns, StorageAdapter invariant, factory wiring
- `packages/cli/src/commands/LEARNINGS.md` — command skeleton, `loadConfig` pattern, formatter usage
- `packages/cli/src/commands/install.ts` — `--skip-qmd` flag implementation to replicate
- `packages/cli/src/commands/pull.ts` — `loadConfig(services.storage, workspaceRoot)` pattern at L98
- `dev/work/plans/qmd-improvements/pre-mortem.md` — 8 risks with mitigations
- `dev/work/plans/qmd-improvements/review.md` — 5 review concerns, all incorporated into ACs above
