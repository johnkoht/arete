## How This Works

The services layer provides eight domain-specific classes: `ContextService`, `MemoryService`, `EntityService`, `IntelligenceService`, `WorkspaceService`, `SkillService`, `ToolService`, `IntegrationService`. They are not instantiated directly by callers — `createServices(workspaceRoot)` in `packages/core/src/factory.ts` wires all dependencies and returns an `AreteServices` object. The dependency graph flows from infrastructure (`FileStorageAdapter`, `SearchProvider`) → core services (context, memory, entity) → orchestration (`IntelligenceService`). Services do NOT use direct `fs` calls; all file I/O goes through `StorageAdapter`. The barrel export in `packages/core/src/services/index.ts` only exports the classes; `createServices` is exported from `packages/core/src/index.ts` via `factory.ts`. Tests mock `StorageAdapter` and `SearchProvider` to avoid touching the filesystem.

## Key References

- `packages/core/src/factory.ts` — `createServices()`, `AreteServices` type, dependency wiring
- `packages/core/src/services/context.ts` — `ContextService` (primitive → file mapping, gap detection)
- `packages/core/src/services/memory.ts` — `MemoryService` (token-based memory search)
- `packages/core/src/services/entity.ts` — `EntityService` (fuzzy person/meeting/project resolution)
- `packages/core/src/services/intelligence.ts` — `IntelligenceService` (briefing assembly, ties services together)
- `packages/core/src/services/tools.ts` — `ToolService` (tool discovery from workspace tools directory)
- `packages/core/src/services/integrations.ts` — `IntegrationService` (Fathom pull, calendar)
- `packages/core/src/storage/adapter.ts` — `StorageAdapter` interface (read/write/list/exists)
- `packages/core/test/` — service tests (mock StorageAdapter pattern)

## Gotchas

- **`createServices()` is async — it loads `arete.yaml` from disk.** Callers must `await createServices(process.cwd())`. Forgetting the `await` gives a Promise, not `AreteServices`. Every CLI command in `packages/cli/src/commands/` correctly awaits it — follow that pattern. Defined in `packages/core/src/factory.ts` L54.

- **Services must NOT call `fs` directly.** The `2026-02-15_monorepo-intelligence-refactor-learnings.md` entry explicitly lists "No direct fs in services" (Risk 9) as a key invariant. All file reads go through the `StorageAdapter` injected at construction. Violating this makes services untestable (can't mock fs) and breaks the StorageAdapter abstraction.

- **`IntegrationService` is the only service that receives `AreteConfig` directly.** All other services take `StorageAdapter` and/or `SearchProvider`. `IntegrationService` needs the config to know which integrations are configured (e.g. Fathom API key, calendar provider). If you add a new service that needs config, check whether `WorkspaceService.findRoot()` + `loadConfig()` is the right pattern instead of passing config at construction time.

- **`IntelligenceService` depends on `ContextService`, `MemoryService`, and `EntityService` — not on `StorageAdapter` or `SearchProvider` directly.** Do not try to construct it with infrastructure — it composes the core services. Wiring order in `factory.ts` matters: core services must be constructed before `IntelligenceService`. See `packages/core/src/factory.ts` L59-68.

- **`options?.config` override in `createServices()` bypasses `arete.yaml` loading.** Pass a pre-loaded `AreteConfig` to avoid disk reads in tests: `createServices('/workspace', { config: mockConfig })`. Without this, tests that call `createServices()` will try to read `arete.yaml` from the test temp dir and may fail silently with default config. From `2026-02-15` entry: DI pattern made testing straightforward.

- **`WorkspaceService.findRoot()` traverses upward to find the workspace root.** CLI commands call `createServices(process.cwd())` then `services.workspace.findRoot()`. If `findRoot()` returns `null`, the workspace root couldn't be found (not inside an Areté workspace). This is the canonical "not in a workspace" check — do not replicate it with ad-hoc `arete.yaml` file searches.

## Invariants

- `AreteServices` returned by `createServices()` is a flat object — no lazy loading, no proxies. All services are fully constructed at call time.
- The single `FileStorageAdapter` instance is shared across all services that need storage. Sharing is intentional (no state in adapter; it's stateless read/write).
- `SearchProvider` returned by `getSearchProvider(workspaceRoot)` in `factory.ts` is determined once at service creation — it will be QMD or fallback based on what's installed at that moment.
- **EntityService SearchProvider empty-results → full scan invariant**: When `EntityService` uses its optional `searchProvider` to pre-filter meetings for a person, zero results MUST fall back to a full scan — never skip. Empty results mean the person may not yet be indexed, not that they have no meetings. Tested explicitly in `packages/core/test/services/person-memory.test.ts`. Violating this silently produces empty memory highlights with no error.

- **EntityService SearchProvider limit-overflow → full scan invariant** (2026-02-21): When `semanticSearch()` returns exactly `SEARCH_PROVIDER_CANDIDATE_LIMIT` (100) results, the index may be truncated — treat it the same as empty results and fall back to a full scan. Otherwise, meetings beyond position 100 are silently dropped for active workspaces (a PM with 6+ months of weekly meetings easily exceeds 20, let alone a badly-chosen limit). `SEARCH_PROVIDER_CANDIDATE_LIMIT` is a module-level constant in `entity.ts`; the fallback condition is `results.length >= SEARCH_PROVIDER_CANDIDATE_LIMIT`. Tested explicitly in `person-memory.test.ts`.

- **SearchProvider path normalization before storage use** (2026-02-21): The qmd CLI runs with `cwd: workspaceRoot` and may return relative paths in its JSON output; `StorageAdapter.list()` always returns absolute paths. Always call `resolve(workspacePaths.root, r.path)` on each SearchProvider result before using it as a cache key or passing it to `storage.read()`. `resolve()` is a no-op for absolute paths, so this is safe regardless of what qmd returns. Omitting this causes `storage.read()` to silently return `null` for every candidate, and signals are missed with no error.

- **Function-scoped Map cache for N×M I/O** (2026-02-21): When a service method has a person-outer / file-inner loop and the inner resource (meeting content) is expensive to read, declare `const cache = new Map<string, string | null>()` inside the method. Key by **normalized absolute path** (apply `resolve()` before cache lookup). This reduces O(people × meetings) reads to O(meetings) regardless of people count. The cache is function-scoped so no lifecycle management is needed. See `refreshPersonMemory()` in `entity.ts`.

## Testing Gaps

- ~~No integration test exercises the full `createServices()` → `services.X.method()` path~~ — Added 2026-02-21: `packages/core/test/integration/intelligence.test.ts` now contains a `createServices factory wires SearchProvider to EntityService` test that calls the real factory and exercises `entity.refreshPersonMemory(null)`.
- `IntelligenceService` briefing assembly (`assembleBriefing()`) is tested in `packages/core/test/` but the entity extraction heuristic (capitalized proper nouns, skip-words list) has thin edge case coverage.

## Patterns That Work

- **DI via constructor**: Each service takes only what it needs at the constructor level. `ContextService(storage, search)`, `EntityService(storage, searchProvider?)`, `IntelligenceService(context, memory, entity)`. Test by passing mocks. Note: `EntityService` now accepts an optional second `SearchProvider` param (added 2026-02-21).
- **`createServices()` as the only wiring point**: CLI commands never import service classes directly. They import `createServices` from `@arete/core` and destructure what they need. Each command becomes 10-30 lines: parse args → create services → call method → format output (from `2026-02-15` entry).

- **`EntityService` accepts an optional `SearchProvider` as its second constructor parameter — all existing `new EntityService(storage)` calls remain valid.** Added 2026-02-21: `constructor(storage: StorageAdapter, searchProvider?: SearchProvider)`. The factory (`createServices()`) now passes `search` to EntityService. In `refreshPersonMemory()`, a provided SearchProvider is used to pre-filter which meeting files to scan per person (reducing O(n×m) full scans). Critical invariant: empty `semanticSearch()` results → always fall back to full scan. There are 14+ construction sites across tests and compat/ — all use `new EntityService(storage)` and compile without changes.

- **`WorkspaceService.create()` must copy tools — check all three asset types (skills, tools, rules) when porting install logic.** During the CLI refactor (commit `e3bc217`, 2026-02-15), `WorkspaceService.create()` ported skills and rules from the old `install.ts` but silently dropped tools. The old command had an explicit `copyDirectoryContents(sourcePaths.tools, workspacePaths.tools)` block; the new service never got it. Result: `install` and `update` left `.cursor/tools/` empty, so the onboarding tool's `TOOL.md` was never present in user workspaces — agents looking for `.cursor/tools/onboarding/TOOL.md` couldn't find it. Fixed 2026-02-21: added tools copy in `create()` and tools backfill in `update()`, with regression tests keyed to the commit hash. **Lesson**: when refactoring "copy assets" logic into a service, explicitly enumerate all asset types (skills, **tools**, rules, templates, guide) and confirm each has a corresponding copy block before closing the PR.

- **`KrispMcpClient.configure()` requires `(storage, workspaceRoot)` — not zero args** (2026-02-21): The task description described calling `client.configure()` with no arguments, but the actual method signature is `configure(storage: StorageAdapter, workspaceRoot: string): Promise<KrispCredentials>`. Always read the actual TypeScript signature before wiring in a CLI command.

- **`KrispCredentials.expires_at` is a Unix timestamp `number`, not an ISO string** (2026-02-21): The task description mentioned computing `new Date(...).toISOString()` for `expires_at`, but the type definition is `number` (seconds since epoch) and `loadKrispCredentials` validates `typeof expires_at !== 'number'`. The client's `configure()` already computes it correctly as `Math.floor(Date.now() / 1000) + tokens.expires_in`. Pass the returned credentials directly to `saveKrispCredentials`.

## Pre-Edit Checklist

- **`ToolService` mirrors `SkillService` but takes `toolsDir: string` (not `workspaceRoot`)** (2026-02-22): `SkillService.list(workspaceRoot)` hardcodes the skills path as `join(workspaceRoot, '.agents', 'skills')`. `ToolService.list(toolsDir)` accepts the resolved tools directory directly because tools paths are IDE-specific (`.cursor/tools/` vs `.claude/tools/`). The caller (CLI) resolves the path via `services.workspace.getPaths(root).tools`. This was an intentional design decision to keep ToolService IDE-agnostic.

- [ ] If adding a new service: add it to `factory.ts` (wire dependencies), `services/index.ts` (barrel export), and `AreteServices` type; run `npm run typecheck`
- [ ] If a service needs `AreteConfig`: prefer passing it at `createServices()` call time via `options.config`, not by reading `arete.yaml` inside a service method
- [ ] Verify new service methods do NOT import `fs`/`path` directly — use `StorageAdapter`
- [ ] Run `npm test` to verify all service tests pass after changes
- [ ] If changing `AreteServices` type: search for all `createServices()` call sites in `packages/cli/src/commands/` and update destructuring
