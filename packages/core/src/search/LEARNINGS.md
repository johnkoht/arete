## How This Works

The search subsystem provides a `SearchProvider` interface with two strategies: QMD (semantic/hybrid, requires an external binary) and fallback (token-based keyword matching, always available). The factory (`factory.ts` → `getSearchProvider(workspaceRoot)`) checks whether the `qmd` binary is on PATH via `spawnSync('which', ['qmd'])` and returns the appropriate provider. The QMD provider lives in `providers/qmd.ts`; fallback in `providers/fallback.ts`. Both are exported from `index.ts`. The fallback provider requires a `StorageAdapter` second argument (for file I/O abstraction); the QMD provider does not. Tests live in `packages/core/test/search/providers.test.ts` and use the `ARETE_SEARCH_FALLBACK=1` env var and `testDeps` injection to avoid spawning real processes.

## Key References

- `packages/core/src/search/factory.ts` — `getSearchProvider()`, `which qmd` check, `ARETE_SEARCH_FALLBACK` env override
- `packages/core/src/search/providers/qmd.ts` — `QmdTestDeps` interface, `parseQmdJson()`, `getSearchProvider(workspaceRoot, testDeps?)`
- `packages/core/src/search/providers/fallback.ts` — `getSearchProvider(workspaceRoot, storage)`, token scoring
- `packages/core/src/search/types.ts` — `SearchProvider`, `SearchOptions`, `SearchResult`, `SearchMatchType`
- `packages/core/src/search/tokenize.ts` — `tokenize()`, `STOP_WORDS`
- `packages/core/src/search/qmd-setup.ts` — `ensureQmdCollection()` (full setup), `refreshQmdIndex()` (write-path update), `QmdSetupDeps` (testDeps interface)
- `packages/core/src/search/qmd-setup.ts` — `embedQmdIndex()` (runs `qmd embed` after indexing for vector embeddings)
- `packages/core/test/search/providers.test.ts` — provider tests, `ARETE_SEARCH_FALLBACK` usage
- `packages/core/test/search/qmd-setup.test.ts` — `refreshQmdIndex` tests, `try/finally` env cleanup pattern

## Gotchas

- **QMD silently falls back with no error when the binary is missing.** `factory.ts` runs `which qmd` and if it exits non-zero, returns the fallback provider without logging a warning. On a fresh install or CI environment, `getSearchProvider()` will always return the fallback provider. If search results seem shallow, verify qmd is installed: `which qmd`. The binary check is at `packages/core/src/search/factory.ts` L18-26.

- **The fallback provider takes `StorageAdapter` as a second required argument; the QMD provider does not.** Calling `getFallbackProvider(root)` (missing storage) will silently produce a provider that fails at runtime when `.search()` tries to call `storage.read()`. Both constructors have the same exported name from their modules — check imports carefully. The factory (`factory.ts`) creates its own `FileStorageAdapter` internally.

- **`ARETE_SEARCH_FALLBACK=1` forces the fallback provider.** Set this in tests to avoid spawning qmd processes that may not exist in test environments. Without it, tests that call `getSearchProvider()` may get different providers on developer machines vs CI. Established pattern in `providers.test.ts` L25-38.

- **QMD score clamping: scores outside `[0, 1]` are clamped in `parseQmdJson()`.** If the QMD CLI returns scores > 1 (e.g. similarity metrics on a different scale), they are clamped to `[0, 1]`. This is intentional — see `providers/qmd.ts` L33-35. Do not assume raw QMD output scores are already normalized.

- **Mocking QMD calls uses the `testDeps` injection pattern, not module mocking.** `qmd.ts` `getSearchProvider(workspaceRoot, testDeps?)` accepts optional `testDeps: QmdTestDeps` with `whichSync` and `execFileAsync` replacements. This pattern avoids dynamic import mocking and keeps tests deterministic. See `providers.test.ts` for usage; defined at `providers/qmd.ts` L42-49.

- **Fallback provider's `semanticSearch()` delegates to `search()`.** There is no real semantic capability in the fallback — it's pure token matching. Code that calls `semanticSearch()` on the fallback will get keyword results silently. This is by design but can produce misleading results if callers expect embedding-based ranking.

- **`ARETE_SEARCH_FALLBACK=1` is set globally by the npm test script — tests that check this env var need `try/finally` cleanup.** The root `package.json` test script runs with `ARETE_SEARCH_FALLBACK=1` always set. If you're writing tests for a function that itself checks `process.env.ARETE_SEARCH_FALLBACK` (e.g. `refreshQmdIndex()`), the success/failure cases must delete the env var before the test body and restore it in `finally`: `const prev = process.env.ARETE_SEARCH_FALLBACK; delete process.env.ARETE_SEARCH_FALLBACK; try { /* test */ } finally { if (prev !== undefined) process.env.ARETE_SEARCH_FALLBACK = prev; }`. Without this, all qmd-exercising tests will always get the skip path. See `packages/core/test/search/qmd-setup.test.ts` for the established pattern.

- **`refreshQmdIndex()` vs `ensureQmdCollection()` — use the right one.** `refreshQmdIndex(root, collectionName, deps?)` is the lightweight "just run `qmd update`" primitive for write-path commands (pull, meeting, index command). `ensureQmdCollection(root, collectionName, deps?)` handles full setup: creates the collection if it doesn't exist, then indexes. Use `refreshQmdIndex` after writes; use `ensureQmdCollection` in `install` and `update`. The key difference: `refreshQmdIndex` skips gracefully when `collectionName` is undefined/empty; `ensureQmdCollection` generates a new collection name if none is provided.

- **`refreshQmdIndex()` now runs `qmd embed` after `qmd update` (2026-02-23).** Both functions (`refreshQmdIndex` and `ensureQmdCollection`) call `embedQmdIndex()` after successful update to create vector embeddings for semantic search. Embedding is incremental (hash-based, ~0.2s no-op) and failures are non-fatal (warning only, indexing still succeeds). The embedding model (~328MB) downloads on first use — `QMD_EMBED_TIMEOUT_MS = 60_000` handles this but may timeout on very slow connections.

- **`refreshQmdIndex()` is wired into 4 CLI call sites — all gated on "files were actually written."** (1) `pull fathom` — after saved count > 0; (2) `meeting add` — after `saveMeetingFile()` returns non-null; (3) `meeting process` — after `applied.length > 0`; (4) `arete index` command (explicit re-index). `ensureQmdCollection()` is called in `install` and `update`. If you're debugging a stale index, check which path is triggered and whether the write condition was met.

- **`refreshQmdIndex()` has 3 silent skip conditions — any one causes it to return `{ skipped: true }` with no output.** (1) `ARETE_SEARCH_FALLBACK=1` env var is set — always true in the test environment; (2) qmd binary not on PATH (`which qmd` fails); (3) `existingCollectionName` is `undefined` or empty — means the workspace was never set up with `arete install`. The `existingCollectionName` parameter is used ONLY as a gate — it is NOT passed to the qmd CLI (qmd infers the active collection from `cwd: workspaceRoot`). This is documented in JSDoc on both `refreshQmdIndex()` and `ensureQmdCollection()`.

- **QMD JSON output uses `file` and `snippet`, not `path` and `content` (fixed 2026-03-10).** The QMD CLI returns `{ file, snippet, score, docid, title }` but the original `parseQmdJson()` expected `{ path, content, score }`. This caused ALL QMD results to be silently filtered out (the filter checked `r.path != null` which was always false). Additionally, `file` is in `qmd://collection-name/relative/path.md` format — must strip the prefix to get the relative path. The fix in `qmd.ts` now reads both formats for backward compatibility and uses `stripQmdPrefix()` to normalize paths. If QMD search seems to return no results, check: (1) QMD is installed (`which qmd`); (2) collection exists (`qmd status`); (3) index is fresh (`arete index`); (4) JSON field names haven't changed again.

- **QMD may return relative paths — `resolve()` normalization is required before storage use.** The qmd CLI runs with `cwd: workspaceRoot` and its JSON output paths may be relative to the workspace root. `StorageAdapter.list()` always returns absolute paths. Without normalization, `storage.read(path)` silently returns `null` for any relative path. The fix (in `EntityService.refreshPersonMemory()`) applies `resolve(workspacePaths.root, r.path)` to all SearchProvider results before any cache lookup or storage call. `resolve()` is a no-op for absolute paths so this is always safe. See `SEARCH_PROVIDER_CANDIDATE_LIMIT` note below.

- **`SEARCH_PROVIDER_CANDIDATE_LIMIT = 100` is in `entity.ts`, not here.** This module-level constant controls how many meeting candidates `EntityService.refreshPersonMemory()` requests from the SearchProvider per person. If results hit the cap (`results.length >= 100`), it falls back to a full scan — same behavior as zero results. This is intentional: a capped result set means the index may be incomplete for that person. Relevant for debugging "missing signals" issues on accounts with many meetings.

- **`search` and `semanticSearch` have DIFFERENT timeouts — `qmd query` runs an LLM and is slow.** `DEFAULT_TIMEOUT_MS = 5000` covers `qmd search` (BM25, sub-second). `semanticSearch` shells out to `qmd query`, which runs LLM query-expansion + embedding + cross-encoder reranking — measured 6.0s on a realistic project-brief query, before cold model-load overhead. It gets its own `SEMANTIC_TIMEOUT_MS = 15000`. The original shared 5s budget caused `/project` (and every other brief mode's "Related wiki pages" section) to *intermittently vanish*: the qmd subprocess hit 5s, `execFileAsync` rejected, the catch swallowed it to `[]`, and that empty was indistinguishable from a genuine no-match. If you tighten either timeout, remember the semantic path is the slow one.

- **A timeout is signaled via `SearchOptions.onDegraded`, NOT by throwing.** Four of five `semanticSearch` callers (`entity.ts`, `context.ts`, `meeting-reconciliation.ts`, `memory.ts`) rely on the graceful-`[]`-on-failure contract — `entity.ts` has a CRITICAL invariant that 0 results means "full scan", so throwing would break it. Instead, the qmd provider's catch calls `options.onDegraded?.('timeout')` (only for a `killed`/`SIGTERM`/`ETIMEDOUT` rejection — see `isTimeoutError`, NOT a genuine non-zero qmd exit) and still returns `[]`. `TopicMemoryService.retrieveRelevant` opts in and surfaces `degraded: boolean` on its result; `retrieveWiki` (brief-assemblers) runs its listAll+jaccard fallback on a degraded empty instead of suppressing the section, while still respecting a genuine empty. The distinction "didn't finish" vs "found nothing" is the whole point — don't collapse them back to a bare `[]`.

- **Do NOT add qmd `ignore` patterns to hide project scratch — down-rank at search time instead** (2026-06-13, v0.16.0). What was decided: qmd 2.0.1 supports collection-level `ignore` patterns (`ignore: [...]` in `~/.config/qmd/index.yml`, honored at reindex), but Areté deliberately does NOT use them to exclude project `working/` scratch. Why: `working/` content stays useful and must remain searchable + visible in Obsidian; ignoring it at the index level would make it disappear entirely. Constraint: scratch is kept indexed and down-ranked at search time (see `cli/src/lib/provenance.ts` stable-partition). Don't reach for index-level `ignore` to solve a ranking problem. Source: v0.16.0 project search provenance + active-topics durable-status (commit dd06769b).

- **There is no `normalizeBM25` in this codebase — the qmd score distribution is unverified** (2026-06-13, v0.16.0). What's new (clarification): `arete search` uses `qmd query` (semantic / LLM-reranked), and `providers/qmd.ts` only clamps the score to `[0, 1]` — there is no BM25 normalization step despite stray doc references to `normalizeBM25`. Why it matters: because the actual score distribution out of `qmd query` is not characterized, additive "magic" score bonuses for re-ranking are unsafe (a +0.1 bonus means nothing if the underlying scale is unknown). Prevention: when re-ranking project results, prefer rank-based / stable-partition ordering over mutating scores. Source: v0.16.0 project search provenance + active-topics durable-status (commit dd06769b).

## Invariants

- `SearchProvider.isAvailable()` for the fallback always returns `true`. For QMD, it shells out to `which qmd` each time — no caching. Don't call it in a tight loop.
- `SearchResult.score` is always in `[0, 1]` — enforced by `parseQmdJson()` clamping (QMD) and raw-score normalization (fallback `providers/fallback.ts` L92-96).
- `SearchResult.matchType` is `'semantic'` for QMD results and `'keyword'` for fallback results.

## Testing Gaps

- No test that exercises fallback provider with a real temp directory containing `.md` files and verifies token scoring behavior (only integration-level manual verification).
- ~~No test that validates QMD provider timeout behavior~~ — RESOLVED. `providers.test.ts` now covers the timeout/`onDegraded` split (timeout fires it, genuine error does not, semantic budget > search budget); `topic-memory-retrieve.test.ts` covers `degraded` propagation; `brief-wiki-fallback.test.ts` covers degraded-empty→fallback vs genuine-empty→no-section.

## Patterns That Work

- **`testDeps` injection for external binary dependencies**: Pass a `testDeps` object with mock implementations of `whichSync` and `execFileAsync`. This is more reliable than `proxyquire` or module mocking — deterministic, no import-cache issues.
- **`ARETE_SEARCH_FALLBACK=1` env var for CI**: Set in test setup to guarantee the fallback provider without binary checks. Avoids flaky tests on machines where qmd is or isn't installed.

## Pre-Edit Checklist

- [ ] Run `npm test` from repo root (includes `packages/core/test/search/providers.test.ts`)
- [ ] If adding a new provider: implement `SearchProvider` interface from `types.ts`, add export to `index.ts`, update `factory.ts` check order
- [ ] If changing `SearchProvider` interface: update both `qmd.ts` and `fallback.ts` implementations, update `types.ts`, run `npm run typecheck`
- [ ] Verify `ARETE_SEARCH_FALLBACK=1 npm test` still passes (CI simulation)
- [ ] If changing QMD CLI arguments: update `qmd.ts` L63 (`qmd search`) and L78 (`qmd query`) and the corresponding `parseQmdJson()` if output format changes
