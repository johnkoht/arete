## How This Works

The search subsystem provides a `SearchProvider` interface with two strategies: QMD (semantic/hybrid, requires an external binary) and fallback (token-based keyword matching, always available). The factory (`factory.ts` → `getSearchProvider(workspaceRoot)`) checks whether the `qmd` binary is on PATH via `spawnSync('which', ['qmd'])` and returns the appropriate provider. The QMD provider lives in `providers/qmd.ts`; fallback in `providers/fallback.ts`. Both are exported from `index.ts`. The fallback provider requires a `StorageAdapter` second argument (for file I/O abstraction); the QMD provider does not. Tests live in `packages/core/test/search/providers.test.ts` and use the `ARETE_SEARCH_FALLBACK=1` env var and `testDeps` injection to avoid spawning real processes.

## Key References

- `packages/core/src/search/factory.ts` — `getSearchProvider()`, `which qmd` check, `ARETE_SEARCH_FALLBACK` env override
- `packages/core/src/search/providers/qmd.ts` — `QmdTestDeps` interface, `parseQmdJson()`, `getSearchProvider(workspaceRoot, testDeps?)`
- `packages/core/src/search/providers/fallback.ts` — `getSearchProvider(workspaceRoot, storage)`, token scoring
- `packages/core/src/search/types.ts` — `SearchProvider`, `SearchOptions`, `SearchResult`, `SearchMatchType`
- `packages/core/src/search/tokenize.ts` — `tokenize()`, `STOP_WORDS`
- `packages/core/src/search/qmd-setup.ts` — `ensureQmdCollection()` (full setup), `refreshQmdIndex()` (write-path update), `QmdSetupDeps` (testDeps interface)
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

## Invariants

- `SearchProvider.isAvailable()` for the fallback always returns `true`. For QMD, it shells out to `which qmd` each time — no caching. Don't call it in a tight loop.
- `SearchResult.score` is always in `[0, 1]` — enforced by `parseQmdJson()` clamping (QMD) and raw-score normalization (fallback `providers/fallback.ts` L92-96).
- `SearchResult.matchType` is `'semantic'` for QMD results and `'keyword'` for fallback results.

## Testing Gaps

- No test that exercises fallback provider with a real temp directory containing `.md` files and verifies token scoring behavior (only integration-level manual verification).
- No test that validates QMD provider timeout behavior (5000ms default in `qmd.ts` L14) — a slow `qmd` process would silently return `[]`.

## Patterns That Work

- **`testDeps` injection for external binary dependencies**: Pass a `testDeps` object with mock implementations of `whichSync` and `execFileAsync`. This is more reliable than `proxyquire` or module mocking — deterministic, no import-cache issues.
- **`ARETE_SEARCH_FALLBACK=1` env var for CI**: Set in test setup to guarantee the fallback provider without binary checks. Avoids flaky tests on machines where qmd is or isn't installed.

## Pre-Edit Checklist

- [ ] Run `npm test` from repo root (includes `packages/core/test/search/providers.test.ts`)
- [ ] If adding a new provider: implement `SearchProvider` interface from `types.ts`, add export to `index.ts`, update `factory.ts` check order
- [ ] If changing `SearchProvider` interface: update both `qmd.ts` and `fallback.ts` implementations, update `types.ts`, run `npm run typecheck`
- [ ] Verify `ARETE_SEARCH_FALLBACK=1 npm test` still passes (CI simulation)
- [ ] If changing QMD CLI arguments: update `qmd.ts` L63 (`qmd search`) and L78 (`qmd query`) and the corresponding `parseQmdJson()` if output format changes
