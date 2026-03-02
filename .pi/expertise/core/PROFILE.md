# Core Package Expertise Profile

> Domain map for `packages/core/`. Orients agents WHERE to look — not an encyclopedia.
> For codebase-wide architectural patterns, see `.pi/standards/patterns.md`.

---

## Purpose & Boundaries

**Core is responsible for**: All business logic, domain types, service classes, search infrastructure, IDE adapters, storage abstraction, and integration providers. It is the engine that CLI and runtime consume.

**Core is NOT responsible for**:
- CLI commands, formatting, user prompts → `packages/cli/` (see `.pi/expertise/cli/PROFILE.md`)
- Runtime skills, rules, tools content → `packages/runtime/`
- Build-mode skills (plan-to-prd, execute-prd) → `.pi/skills/`

**Key principle**: Services never import `fs` directly — all file I/O through `StorageAdapter`. No chalk, inquirer, or CLI dependencies.

---

## Architecture Overview

```
factory.ts (createServices) ─── wires everything
  ├─ Infrastructure:  storage/ (FileStorageAdapter), search/ (SearchProvider)
  ├─ Core Services:   ContextService, MemoryService, EntityService
  ├─ Orchestration:   IntelligenceService (composes core services)
  └─ Management:      WorkspaceService, SkillService, ToolService, IntegrationService
```

**Entry point**: `createServices(workspaceRoot)` in `factory.ts` → `AreteServices` (flat, fully constructed). CLI commands destructure what they need; never construct services directly.

**Config**: `config.ts` resolves `AreteConfig`: workspace `arete.yaml` > global `~/.arete/config.yaml` > defaults.

**Model routing**: `model-router.ts` classifies prompts into `fast | balanced | powerful` tiers. Suggestion only.

---

## Component Map

### IntelligenceService
`services/intelligence.ts`

**What it does**: Assembles primitive briefings by orchestrating Context, Memory, and Entity services. Routes queries to the best skill. Prepares skill context with proactive search (meeting transcripts, project docs).

**Key exports**: `IntelligenceService` class — `assembleBriefing()`, `routeToSkill()`, `prepareForSkill()`

**Dependencies**: `ContextService`, `MemoryService`, `EntityService` (NOT storage/search directly)

**Important**: `routeToSkill()` scores via stop words, trigger matching, description overlap, work type keywords. If a capability isn't routable, check skill frontmatter triggers.

### ContextService
`services/context.ts`

**What it does**: Gathers relevant workspace files for a query. Maps product primitives (Problem, User, Solution, Market, Risk) to workspace files via `PRIMITIVE_FILE_MAP`. Detects coverage gaps. Provides context inventory with freshness tracking.

**Key exports**: `getRelevantContext()`, `getContextForSkill()`, `getContextInventory()`

**Dependencies**: `StorageAdapter`, `SearchProvider`

### MemoryService
`services/memory.ts`

**What it does**: Searches workspace memory (decisions, learnings, observations). Creates new memory entries. Builds temporal timelines with theme extraction.

**Key exports**: `search()`, `create()`, `getTimeline()`, `getIndex()`

**Dependencies**: `StorageAdapter`, `SearchProvider`

**Memory files**: `decisions.md`, `learnings.md`, `agent-observations.md` in `.arete/memory/items/`.

### EntityService
`services/entity.ts`

**What it does**: Resolves references to people, meetings, and projects via fuzzy matching. Manages people files (CRUD, list, memory refresh). Finds entity mentions and relationships across the workspace. Includes People Intelligence for candidate triage.

**Key exports**: `resolve()`, `resolveAll()`, `findMentions()`, `getRelationships()`, `listPeople()`, `showPerson()`, `refreshPersonMemory()`

**Dependencies**: `StorageAdapter`, optional `SearchProvider`

**Critical invariant**: `refreshPersonMemory()` uses SearchProvider to pre-filter meetings, but empty results → full scan (never skip). `SEARCH_PROVIDER_CANDIDATE_LIMIT = 100` also triggers full scan.

#### Person Intelligence Modules (siblings to entity.ts)

These modules implement the People Intelligence feature and are called by `EntityService.refreshPersonMemory()`:

- **`person-memory.ts`** — Signal collection, aggregation, rendering, and upsert. Uses sentinel-comment pattern (`AUTO_PERSON_MEMORY:START/END`) for non-destructive updates to person files. Key exports: `collectSignalsForPerson()`, `aggregateSignals()`, `renderPersonMemorySection()`, `upsertPersonMemory()`, `isMemoryStale()`.
- **`person-health.ts`** — Pure computation of `RelationshipHealth` from meeting dates. No I/O. Uses `referenceDate` injection for testability. Key exports: `computeRelationshipHealth()`, `renderHealthSection()`.
- **`person-signals.ts`** — LLM stance extraction (DI via `callLLM` option) + regex-based action item extraction with lifecycle (open/completed/stale). Key exports: `extractStancesForPerson()`, `extractActionItemsForPerson()`, `buildStancePrompt()`, `parseStanceResponse()`.

**Important**: These are implementation details — not exported from `packages/core/src/index.ts`. All access is through `EntityService.refreshPersonMemory()`. The `callLLM` option for stance extraction is programmatic-only (not wired in CLI).

### WorkspaceService
`services/workspace.ts`

**What it does**: Detects, creates, and updates Areté workspaces. Finds workspace root by traversing upward. Generates `WorkspacePaths`. Manages `arete.yaml` manifest. Syncs core skills, tools, rules, templates.

**Key exports**: `isWorkspace()`, `findRoot()`, `getPaths()`, `create()`, `update()`, `getStatus()`

**Dependencies**: `StorageAdapter`

**Note**: `create()` must copy ALL asset types: skills, tools, rules, templates, guide. Missing any is a regression.

### SkillService
`services/skills.ts`

**What it does**: Discovers skills from `.agents/skills/` directory. Reads skill metadata from `SKILL.md` frontmatter and `.arete-meta.yaml` sidecar files. Installs skills from skills.sh or local paths.

**Key exports**: `list()`, `get()`, `getInfo()`, `install()`

**Dependencies**: `StorageAdapter`

### ToolService
`services/tools.ts`

**What it does**: Discovers tools from the IDE-specific tools directory. Reads `TOOL.md` frontmatter.

**Key exports**: `list(toolsDir)`, `get(id, toolsDir)`

**Dependencies**: `StorageAdapter`

**Note**: Takes `toolsDir` (resolved path) not `workspaceRoot` — tools paths are IDE-specific.

### IntegrationService
`services/integrations.ts`

**What it does**: Orchestrates integration pull operations (Fathom, Krisp, Notion). Lists integrations with status. Configures integrations in `arete.yaml`.

**Key exports**: `pull()`, `list()`, `configure()`

**Dependencies**: `StorageAdapter`, `AreteConfig` (unique — only service that takes config directly)

**Important**: Calendar uses provider alias mapping (`macos` → `apple-calendar`, `google` → `google-calendar`). Registry in `integrations/registry.ts` is canonical.

### Search
`search/`

**What it does**: Provides `SearchProvider` interface with two implementations: QMD (semantic, requires binary) and fallback (token-based, always available).

**Key files**: `types.ts` (interfaces), `factory.ts` (`getSearchProvider()`, `which qmd`, `ARETE_SEARCH_FALLBACK=1`), `providers/qmd.ts` (semantic, `testDeps` injection), `providers/fallback.ts` (token-based), `tokenize.ts` (shared tokenizer), `qmd-setup.ts` (`ensureQmdCollection()`, `refreshQmdIndex()`, `embedQmdIndex()`)

**Important**: QMD scores clamped to `[0, 1]`. Fallback `semanticSearch()` is keyword matching. Use `refreshQmdIndex()` after writes, `ensureQmdCollection()` at install/update.

### Adapters
`adapters/`

**What it does**: IDE-specific workspace generation. `CursorAdapter` and `ClaudeAdapter` implement `IDEAdapter` interface. Generates root files (AGENTS.md / CLAUDE.md), formats rules, transforms paths.

**Key files**: `ide-adapter.ts` (interface), `cursor-adapter.ts` / `claude-adapter.ts` (implementations), `read-agents-md.ts` (reads `dist/AGENTS.md`), `index.ts` (`getAdapter()`, `detectAdapter()`)

**Exception**: Adapters may use `fs` directly (infrastructure-level).

### Storage
`storage/`

**What it does**: Abstracts file I/O for testability.

**Key files**:
- `adapter.ts` — `StorageAdapter` interface (read, write, exists, delete, list, mkdir, copy)
- `file.ts` — `FileStorageAdapter` (real filesystem implementation)

**Invariant**: A single `FileStorageAdapter` instance is shared across all services. It is stateless.

### Models
`models/`

**What it does**: All TypeScript type definitions. Barrel-exported from `models/index.ts`.

**Files by domain**: `common.ts` (primitives, enums), `context.ts`, `memory.ts`, `entities.ts`, `intelligence.ts`, `skills.ts`, `workspace.ts`, `integrations.ts`, `prd.ts`

### Integrations (Providers)
`integrations/`

**What it does**: Provider implementations for external services.

**Subdirectories**:
- `calendar/` — Apple Calendar (ical-buddy), Google Calendar (OAuth)
- `fathom/` — Fathom meeting recording API
- `krisp/` — Krisp MCP integration (JSON-RPC, OAuth with PKCE)
- `notion/` — Notion API (thin fetch wrapper, rate limiting)
- `conversations/` — Conversation extraction and parsing
- `registry.ts` — Canonical integration metadata registry
- `meetings.ts` — Shared meeting processing

### Compat Layer
`compat/`

**What it does**: Legacy function-based APIs that delegate to service classes. Allows gradual migration from old `import { assembleBriefing }` style to `services.intelligence.assembleBriefing()`.

**Files**: `workspace.ts`, `context.ts`, `memory.ts`, `intelligence.ts`, `entity.ts`

---

## Key Abstractions & Patterns

1. **Factory pattern**: `createServices()` is the only wiring point. CLI commands never construct services directly.
2. **DI via constructor**: Each service takes only what it needs — `ContextService(storage, search)`, `IntelligenceService(context, memory, entity)`.
3. **StorageAdapter abstraction**: All file I/O through the interface. Tests mock it instead of touching filesystem.
4. **testDeps injection**: External binary dependencies (qmd, icalBuddy) use injectable deps objects, not module mocking.
5. **Provider pattern**: Integrations use factory functions returning `Provider | null` (null = unavailable).
6. **Service composition**: IntelligenceService composes core services, not infrastructure. It never touches StorageAdapter directly.

---

## Invariants

- Services are stateless — no mutable state between calls
- `StorageAdapter` is the only path to disk for services (adapters excepted)
- `SearchResult.score` is always in `[0, 1]`
- `EntityService` empty search results → full scan fallback (never skip)
- `AreteServices` from `createServices()` is fully constructed — no lazy loading
- Models define all types — services import from `models/index.js`

---

## Anti-Patterns & Common Mistakes

- **Importing `fs` in a service** → Use `StorageAdapter` instead
- **Constructing services directly** → Use `createServices()` factory
- **Assuming QMD is available** → Always handle fallback; check `ARETE_SEARCH_FALLBACK`
- **Adding integration without registry entry** → Update `registry.ts`
- **Forgetting tools in workspace create/update** → Check all asset types (skills, tools, rules, templates, guide)
- **Calendar provider string mismatch** → Configure writes `macos`/`google`; factory must accept both aliases
- **Using `any` types** → All types defined in `models/`; import from barrel

---

## Required Reading

Before working on core, read:
1. `packages/core/src/factory.ts` — Understand the dependency graph
2. `packages/core/src/storage/adapter.ts` — The I/O contract
3. The relevant service file for your task
4. The LEARNINGS.md nearest your change (see locations below)

---

## Related Expertise

- **CLI package** (consumes core services): `.pi/expertise/cli/PROFILE.md`
  - Each CLI command destructures from `createServices()` and calls core service methods
  - CLI handles user I/O, formatting, prompts; core handles business logic

---

## LEARNINGS.md Locations

| Path | Covers |
|------|--------|
| `packages/core/src/services/LEARNINGS.md` | Service layer patterns, DI, factory wiring, EntityService invariants |
| `packages/core/src/search/LEARNINGS.md` | Search providers, QMD setup, fallback, tokenization, testDeps pattern |
| `packages/core/src/adapters/LEARNINGS.md` | IDE adapters, root file generation, path transforms |
| `packages/core/src/integrations/LEARNINGS.md` | Integration patterns, calendar provider aliases, credential storage |
| `packages/core/src/integrations/krisp/LEARNINGS.md` | Krisp MCP API shape, OAuth, SSE responses |
| `packages/core/src/integrations/notion/LEARNINGS.md` | Notion API, block conversion, rate limiting, credential cascade |
