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
  ├─ Management:      WorkspaceService, SkillService, ToolService, IntegrationService
  └─ AI:              AIService (wraps pi-ai, credential management)
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

**Key exports**: `getRelevantContext()`, `getContextInventory()`

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

### AIService (2026-03-08)
`services/ai.ts`

**What it does**: Unified AI integration wrapping pi-ai with task-based model routing, credential management, and structured output support. Provides text and structured (JSON with TypeBox validation) AI calls.

**Key exports**: `AIService` class — `call(task, prompt)`, `callWithModel(spec, prompt)`, `callStructured(task, prompt, schema)`, `isConfigured()`

**Dependencies**: `AreteConfig` (for tier-to-model mapping), pi-ai library

**Credential resolution order**: Environment variables > OAuth tokens (`~/.arete/auth.json`) > API keys (`~/.arete/credentials.yaml`)

**Testing pattern**: Uses `testDeps` injection for mocking pi-ai calls — same pattern as qmd.ts.

**Important**: This is the second service (after `IntegrationService`) to receive `AreteConfig` directly. AIService needs config at construction for tier mappings.

### Meeting Processing (2026-03-15)
`services/meeting-processing.ts`

**What it does**: Post-extraction processing that both CLI and backend use for meeting intelligence. Applies confidence filtering, user notes deduplication (Jaccard similarity), and auto-approval logic. Produces metadata maps for staged items.

**Key exports**:
- `processMeetingExtraction(result, userNotes, options?)` — Main processing function. Returns `ProcessedMeetingResult` with filtered items and metadata maps
- `extractUserNotes(body)` — Extracts user-written notes, excluding Transcript/Staged sections
- `clearApprovedSections(content)` — Removes `## Approved *` sections for reprocessing
- `formatFilteredStagedSections(items, summary)` — Formats filtered items as markdown
- `calculateSpeakingRatio(transcript, ownerName)` — Analyzes transcript speaker labels to compute engagement ratio; used for engagement-based importance upgrade (≥40% speaking → upgrade light→normal)

**Dependencies**: `meeting-extraction.js` (imports `normalizeForJaccard`, `jaccardSimilarity`)

**Thresholds**: `confidenceInclude = 0.5`, `confidenceApproved = 0.8`, `dedupJaccard = 0.7`

**Used by**: Backend `agent.ts` (`runProcessingSession`), CLI `meeting.ts` (`extract --stage`, `approve`)

**Gotcha**: Decisions and learnings default to 0.9 confidence (no confidence from extraction), so they auto-approve unless deduped against user notes.

### Credentials
`credentials.ts` (module, not service)

**What it does**: Manages global AI credentials stored at `~/.arete/credentials.yaml` (API keys) and `~/.arete/auth.json` (OAuth tokens). Credentials are global, not workspace-level.

**Key exports**:
- `loadCredentials()`, `saveCredentials()` — API key management
- `loadOAuthCredentials()`, `saveOAuthCredentials()` — OAuth token management
- `getOAuthApiKeyForProvider()` — auto-refreshes expired OAuth tokens
- `getConfiguredProviders()` — lists all configured providers (env vars, OAuth, API keys)

**OAuth flow**: CLI `arete credentials login` → browser OAuth → paste code → token saved → auto-refresh on expiry

**Used by**: `AIService` for credential resolution, CLI `credentials` command for management

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

### Areté v2 Service Families (Phases 1–12)

The v2 effort added several service clusters. They are not all barrel-exported; check `index.ts` before assuming a symbol is public.

- **Brief assemblers** — `services/brief-assemblers.ts`, `services/brief-formatters.ts`. Back the typed `arete brief --person/--project/--area/--meeting` modes (Phase 9). Pure aggregators — no LLM synthesis. Restored a capability that `prepare-meeting-agenda` regressed on after earlier over-stripping.
- **Topic detection & wiki** — `services/topic-detection.ts` (shared lexical detector), `services/topic-memory.ts`, plus the summaries leg: `services/summary-writer.ts`, `services/org-entity.ts`, `services/memory-summary-loader.ts` (models `source-summary.ts`, `org-entity.ts`, `memory-summary.ts`). Gives memory the "raw → summaries + entities + concepts" shape.
- **Area memory** — `services/area-memory.ts`, `services/area-parser.ts`. L3 area snapshots; consumed by `arete memory refresh`.
- **Commitment v2 + dedup** — `services/commitments.ts`, `services/commitments-hash-v2.ts`, `services/commitments-counterparty-parser.ts`, `services/commitments-v2-flag.ts` (`COMMITMENTS_V2_ACTIVE`, default false). Dedup pipeline: `services/background-dedup.ts`, `services/commitment-dedup-pipeline.ts`, `services/commitment-dedup-extract.ts`, `services/commitment-dedup-reverse-stamp.ts`, `services/dedup-decisions-log.ts`, `services/dedup-explain.ts`, `services/dedup-winddown-surface.ts`, `services/extract-dedup-wiring.ts`. Backs `arete dedup`.
- **Commitment external resolution (gated OFF)** — `services/commitment-resolution-pipeline.ts`, `services/resolution-decisions-log.ts`, `services/resolution-directives.ts`, `services/resolution-ordering.ts`. Gmail-evidence auto-resolution behind `PHASE_11_AUTO_RESOLVE_ENABLED` (default false). Propose-never-write even when enabled.
- **Skills split (managed + user fork)** — `services/skills-local.ts` (managed-vs-fork resolution), `services/skill-fork.ts` (`forkSkill`), `services/skill-resolver.ts`. Managed skills in `.arete/skills/`, forks in `.agents/skills/`; fork wins at load time. Backs `arete skill fork/diff/merge`.
- **Migrations** — `services/migrations/migrate-to-v2.ts` (commitment v1→v2), `services/migrations/add-created-at.ts`, `services/goal-migration.ts` (quarter.md → individual goal files).

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
