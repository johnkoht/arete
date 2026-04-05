# Architectural Patterns

Codebase-level design patterns and conventions. For component-specific patterns, see expertise profiles (`.pi/expertise/{domain}/PROFILE.md`). For coding style and quality gates, see `build-standards.md`.

---

## 1. Service Composition (DI via Constructor)

All services receive dependencies through constructor injection. No service constructs its own dependencies.

```
MemoryService(storage: StorageAdapter, searchProvider: SearchProvider)
IntelligenceService(context: ContextService, memory: MemoryService, entities: EntityService)
```

**Wiring point**: `createServices(workspaceRoot)` in `packages/core/src/factory.ts` is the **sole** place where services are constructed and wired together. It returns a flat `AreteServices` object. CLI commands destructure what they need; they never construct services directly.

**No mutable state between calls**: Services hold injected dependencies (storage, search provider, other services) but do not accumulate request-scoped state between method calls. Each method call is self-contained.

_Example_: `packages/core/src/services/memory.ts` — constructor takes `storage` + `searchProvider`; no fields mutated after construction.

**Anti-pattern**: Constructing a service inside another service. Constructing services in CLI commands instead of using `createServices()`.

---

## 2. Storage Abstraction

All service file I/O goes through `StorageAdapter`. Services never import `fs` directly.

```
StorageAdapter (interface) → FileStorageAdapter (implementation)
```

Only `FileStorageAdapter` in `packages/core/src/storage/file.ts` touches the filesystem. This enables testing with mock adapters and future alternative backends.

**Anti-pattern**: Importing `fs` or `path` operations in a service file. If you need file access, use `this.storage`.

---

## 3. testDeps Injection

For external binary dependencies (CLI tools, system commands), use an injectable `deps` object instead of module-level mocking.

```typescript
// Default deps use real binaries
const defaultDeps = { execFile: childProcess.execFile };

// Function accepts deps parameter with defaults
export function doWork(input: string, deps = defaultDeps) { ... }

// Tests inject mocks directly — no module mocking needed
doWork("input", { execFile: mockExecFile });
```

_Examples_:
- `packages/core/src/search/providers/qmd.ts` — injects `execFile` for qmd binary
- `packages/core/src/integrations/calendar/ical-buddy.ts` — injects `execFile` for icalBuddy binary
- `packages/core/src/integrations/calendar/google-calendar.ts` — injects HTTP client deps

**Why**: Module mocking (`mock.module`) is fragile with ESM and NodeNext resolution. testDeps is explicit, type-safe, and doesn't require special test runner configuration.

**Anti-pattern**: Using `mock.module()` or `jest.mock()` for external dependencies. Use testDeps instead.

---

## 4. Provider Pattern

Integration factories return `Provider | null`. Null means the integration is unavailable (not configured, binary missing, etc.). Callers handle null gracefully.

```typescript
export async function getCalendarProvider(config: AreteConfig): Promise<CalendarProvider | null> {
  if (!config.integrations?.calendar?.provider) return null;
  // ...
}
```

_Example_: `packages/core/src/integrations/calendar/index.ts` — `getCalendarProvider()` returns `CalendarProvider | null`.

**Convention**: Check provider availability at the call site. Don't throw when a provider is unavailable — return null and let the caller decide (show a message, fall back, skip).

**Anti-pattern**: Throwing an error when an integration isn't configured. The user may not have set it up yet, and that's a valid state.

---

## 5. Compat Layer

Legacy function-based APIs live in `packages/core/src/compat/`. Each shim delegates to the corresponding service class for backward compatibility.

```typescript
// compat/memory.ts — thin wrapper
export async function searchMemory(query: string, paths: WorkspacePaths, options = {}): Promise<MemorySearchResult> {
  const storage = new FileStorageAdapter();
  const searchProvider = getSearchProvider(paths.root);
  const service = new MemoryService(storage, searchProvider);
  return service.search({ query, paths, types: options.types });
}
```

**Purpose**: CLI commands that haven't migrated to `createServices()` still work. The compat layer keeps the old API surface while the real logic lives in services.

**Migration path**: When updating a CLI command, switch from compat functions to `createServices()` + service methods. Remove compat shim when no callers remain.

_Examples_: `packages/core/src/compat/memory.ts`, `compat/context.ts`, `compat/entity.ts`, `compat/intelligence.ts`, `compat/workspace.ts`

**Anti-pattern**: Adding new functions to the compat layer. New functionality goes in services; compat is for backward compatibility only.

---

## 6. Error Handling (Graceful Degradation)

The codebase follows a "degrade gracefully" philosophy. Not everything needs to throw.

| Situation | Convention | Example |
|-----------|-----------|---------|
| Integration unavailable | Return `null` from provider factory | `getCalendarProvider()` |
| Search returns nothing | Fall back to simpler search | Semantic → token-based fallback |
| File doesn't exist | Return `null` or empty result | `storage.readFile()` returns `null` |
| Config missing a section | Use defaults via `deepMerge` | `resolveConfig()` in `config.ts` |
| External binary missing | Return `null` from provider | `getIcalBuddyProvider()` |

**When to throw**: Programmer errors (wrong types, violated invariants), corrupted state that can't be recovered. These indicate bugs, not user misconfiguration.

**Anti-pattern**: Throwing on missing optional configuration. Throwing when an integration isn't set up.

---

## 7. Model Organization

All domain types live in `packages/core/src/models/`, organized by domain:

```
models/
├── index.ts      ← barrel export (all types re-exported here)
├── common.ts     ← shared leaf types (ProductPrimitive, WorkType, etc.)
├── context.ts    ← ContextRequest, ContextBundle, etc.
├── memory.ts     ← MemorySearchRequest, MemorySearchResult, etc.
├── entities.ts   ← Entity resolution types
├── intelligence.ts
├── workspace.ts
├── skills.ts
├── integrations.ts
└── prd.ts
```

**Convention**: Import types from the barrel: `import type { MemorySearchResult } from '../models/index.js'`. Services define their own request/response types in models, not inline.

**Anti-pattern**: Defining types inside service files. Importing from individual model files instead of the barrel.

---

## 8. CLI → Core Boundary

Strict separation: CLI handles UX, core handles logic.

| Concern | CLI (`packages/cli/`) | Core (`packages/core/`) |
|---------|----------------------|------------------------|
| User interaction | chalk, inquirer, ora | ❌ Never |
| Business logic | ❌ Never | Services, utils |
| Service construction | `createServices(process.cwd())` | `factory.ts` |
| Error display | Formatted messages | Throw or return null |
| File paths | Resolve from cwd | Receive as parameters |

**Command skeleton** (every command follows this):
```
createServices(process.cwd()) → services.workspace.findRoot() → guard if null → service calls → format output
```

_Example_: Every command in `packages/cli/src/commands/` follows this pattern.

**Anti-pattern**: Importing chalk or inquirer in core. Putting business logic in a CLI command handler. Constructing services manually in a command instead of using `createServices()`.

---

## 9. Config Resolution

Configuration resolves with a clear priority cascade:

```
workspace arete.yaml > global ~/.arete/config.yaml > defaults
```

Implemented in `packages/core/src/config.ts` using `deepMerge()`. Workspace config overrides global, which overrides built-in defaults. Individual keys deep-merge (objects merged recursively, scalars overwritten by higher-priority source).

```typescript
// resolveConfig() in packages/core/src/config.ts
const defaults = DEFAULT_CONFIG;
const global = await readGlobalConfig(storage);   // ~/.arete/config.yaml
const workspace = await readWorkspaceConfig(storage, workspaceRoot); // arete.yaml
return deepMerge(deepMerge(defaults, global), workspace);
```

_Example_: `packages/core/src/config.ts` — `resolveConfig(storage, workspaceRoot)` is the entry point. All services that need config receive it via the factory.

**Anti-pattern**: Reading `arete.yaml` directly with `storage.readFile()` instead of calling `resolveConfig()`. Hardcoding default values inline instead of adding them to `DEFAULT_CONFIG`.

---

## Build Process Patterns

### Fallback-First Migration Design

When migrating data formats, schema versions, or file structures: always read the old format as a fallback. Never require a migration script to run first before the code works.

```typescript
// ✅ Fallback-first: reads new format, falls back to old
async function loadConfig(): Promise<Config> {
  try {
    const v2 = await readV2Config();
    if (v2) return v2;
  } catch {}
  return readV1Config(); // fallback
}

// ❌ Migration-first: breaks if migration hasn't run
async function loadConfig(): Promise<Config> {
  return readV2Config(); // throws if not migrated
}
```

**Anti-pattern**: Requiring `npm run migrate` before a feature works. Users miss migration steps; CI environments may not run them.

**Evidence**: goals-refactor (2026-03-19), monorepo migration (2026-02-15), priority-toggle (2026-03-07) — all three required rework when fallback was omitted.

---

## Adding New Patterns

When you discover a recurring pattern not documented here:
1. Verify it appears in 2+ places in the codebase
2. Add it to this file with: name, description, example file path, and anti-pattern
3. Note it in your completion report so the reviewer can verify accuracy

If you discover a documented file path no longer exists (files move as the codebase evolves), update the path and note it in your completion report.
