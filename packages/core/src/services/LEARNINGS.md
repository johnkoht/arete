## How This Works

The services layer provides seven domain-specific classes: `ContextService`, `MemoryService`, `EntityService`, `IntelligenceService`, `WorkspaceService`, `SkillService`, `IntegrationService`. They are not instantiated directly by callers — `createServices(workspaceRoot)` in `packages/core/src/factory.ts` wires all dependencies and returns an `AreteServices` object. The dependency graph flows from infrastructure (`FileStorageAdapter`, `SearchProvider`) → core services (context, memory, entity) → orchestration (`IntelligenceService`). Services do NOT use direct `fs` calls; all file I/O goes through `StorageAdapter`. The barrel export in `packages/core/src/services/index.ts` only exports the classes; `createServices` is exported from `packages/core/src/index.ts` via `factory.ts`. Tests mock `StorageAdapter` and `SearchProvider` to avoid touching the filesystem.

## Key References

- `packages/core/src/factory.ts` — `createServices()`, `AreteServices` type, dependency wiring
- `packages/core/src/services/context.ts` — `ContextService` (primitive → file mapping, gap detection)
- `packages/core/src/services/memory.ts` — `MemoryService` (token-based memory search)
- `packages/core/src/services/entity.ts` — `EntityService` (fuzzy person/meeting/project resolution)
- `packages/core/src/services/intelligence.ts` — `IntelligenceService` (briefing assembly, ties services together)
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

## Testing Gaps

- ~~No integration test exercises the full `createServices()` → `services.X.method()` path~~ — Added 2026-02-21: `packages/core/test/integration/intelligence.test.ts` now contains a `createServices factory wires SearchProvider to EntityService` test that calls the real factory and exercises `entity.refreshPersonMemory(null)`.
- `IntelligenceService` briefing assembly (`assembleBriefing()`) is tested in `packages/core/test/` but the entity extraction heuristic (capitalized proper nouns, skip-words list) has thin edge case coverage.

## Patterns That Work

- **DI via constructor**: Each service takes only what it needs at the constructor level. `ContextService(storage, search)`, `EntityService(storage, searchProvider?)`, `IntelligenceService(context, memory, entity)`. Test by passing mocks. Note: `EntityService` now accepts an optional second `SearchProvider` param (added 2026-02-21).
- **`createServices()` as the only wiring point**: CLI commands never import service classes directly. They import `createServices` from `@arete/core` and destructure what they need. Each command becomes 10-30 lines: parse args → create services → call method → format output (from `2026-02-15` entry).

- **`EntityService` accepts an optional `SearchProvider` as its second constructor parameter — all existing `new EntityService(storage)` calls remain valid.** Added 2026-02-21: `constructor(storage: StorageAdapter, searchProvider?: SearchProvider)`. The factory (`createServices()`) now passes `search` to EntityService. In `refreshPersonMemory()`, a provided SearchProvider is used to pre-filter which meeting files to scan per person (reducing O(n×m) full scans). Critical invariant: empty `semanticSearch()` results → always fall back to full scan. There are 14+ construction sites across tests and compat/ — all use `new EntityService(storage)` and compile without changes.

- **`WorkspaceService.create()` must copy tools — check all three asset types (skills, tools, rules) when porting install logic.** During the CLI refactor (commit `e3bc217`, 2026-02-15), `WorkspaceService.create()` ported skills and rules from the old `install.ts` but silently dropped tools. The old command had an explicit `copyDirectoryContents(sourcePaths.tools, workspacePaths.tools)` block; the new service never got it. Result: `install` and `update` left `.cursor/tools/` empty, so the onboarding tool's `TOOL.md` was never present in user workspaces — agents looking for `.cursor/tools/onboarding/TOOL.md` couldn't find it. Fixed 2026-02-21: added tools copy in `create()` and tools backfill in `update()`, with regression tests keyed to the commit hash. **Lesson**: when refactoring "copy assets" logic into a service, explicitly enumerate all asset types (skills, **tools**, rules, templates, guide) and confirm each has a corresponding copy block before closing the PR.

## Pre-Edit Checklist

- [ ] If adding a new service: add it to `factory.ts` (wire dependencies), `services/index.ts` (barrel export), and `AreteServices` type; run `npm run typecheck`
- [ ] If a service needs `AreteConfig`: prefer passing it at `createServices()` call time via `options.config`, not by reading `arete.yaml` inside a service method
- [ ] Verify new service methods do NOT import `fs`/`path` directly — use `StorageAdapter`
- [ ] Run `npm test` to verify all service tests pass after changes
- [ ] If changing `AreteServices` type: search for all `createServices()` call sites in `packages/cli/src/commands/` and update destructuring
