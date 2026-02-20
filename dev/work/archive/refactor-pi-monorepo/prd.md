# Arete Refactor Plan: Monorepo + Intelligence Architecture

## Overview

Refactor Arete from a single-package repo into a monorepo with clean package boundaries. The goal is to separate core intelligence services (context, memory, entity resolution, briefing), runtime content (what PMs install), and the CLI — with a clear path toward a future desktop app and HTTP API.

This refactor serves a product thesis: **Arete's value is the intelligence layer — context injection, memory retrieval, entity resolution, and briefing assembly — that makes any AI agent smarter about product work.** Skills are interchangeable methods; the intelligence substrate is the product. The monorepo structure ensures the intelligence layer is reusable across any client (CLI, desktop app, HTTP API, MCP server).

This is a structural refactor with an intelligence enhancement phase. The end-user experience does not change initially — PMs still install Arete via npm, open a workspace in Cursor or Claude Code, and interact through their IDE's AI panel. But the enhanced intelligence services will immediately improve context quality and memory retrieval for all users.

---

## Target Architecture

```
arete/
├── .agents/                             # Build-time dev config (IDE-agnostic)
│   ├── skills/                          # Dev-specific build skills
│   │   ├── execute-prd/
│   │   ├── plan-to-prd/
│   │   ├── review-plan/
│   │   └── ...
│   └── sources/                         # AGENTS.md source fragments
│
├── packages/
│   ├── core/                            # @arete/core — intelligence + service layer
│   │   ├── src/
│   │   │   ├── services/                # Service classes (the API surface)
│   │   │   │   ├── context.ts           # ContextService — injection, retrieval, search
│   │   │   │   ├── memory.ts            # MemoryService — CRUD, search, timeline
│   │   │   │   ├── entity.ts            # EntityService — resolution, relationships
│   │   │   │   ├── intelligence.ts      # IntelligenceService — briefing, skill prep
│   │   │   │   ├── workspace.ts         # WorkspaceService — creation, validation
│   │   │   │   ├── skills.ts            # SkillService — discovery, routing, install
│   │   │   │   └── integrations.ts      # IntegrationService — calendar, Fathom
│   │   │   ├── models/                  # Shared types, schemas, interfaces
│   │   │   │   ├── memory.ts
│   │   │   │   ├── context.ts
│   │   │   │   ├── workspace.ts
│   │   │   │   ├── skills.ts
│   │   │   │   ├── entities.ts
│   │   │   │   ├── intelligence.ts
│   │   │   │   ├── integrations.ts
│   │   │   │   └── prd.ts
│   │   │   ├── utils/                   # Shared utilities
│   │   │   │   ├── slugify.ts
│   │   │   │   ├── dates.ts
│   │   │   │   ├── templates.ts
│   │   │   │   └── dedup.ts
│   │   │   └── storage/                 # Storage adapters
│   │   │       ├── adapter.ts           # StorageAdapter interface
│   │   │       └── file.ts              # File-based storage (current)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                             # @arete/cli — thin client over core
│   │   ├── src/
│   │   │   ├── commands/                # CLI command handlers
│   │   │   ├── formatters/              # CLI-specific output formatting
│   │   │   └── index.ts                 # Entry point, arg parsing
│   │   ├── bin/
│   │   │   └── arete                    # CLI binary
│   │   ├── scripts/
│   │   │   └── setup.sh                 # Environment checker
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── runtime/                         # @arete/runtime — workspace content
│       ├── context/                     # Default context templates
│       ├── memory/                      # End-user memory structure
│       ├── planning/                    # Planning templates
│       ├── projects/                    # Project templates
│       ├── meetings/                    # Meeting storage
│       ├── skills/                      # Default PM skills (starter pack)
│       │   ├── discovery/
│       │   ├── create-prd/
│       │   ├── competitive-analysis/
│       │   ├── meeting-prep/
│       │   ├── process-meetings/
│       │   ├── synthesize/
│       │   ├── construct-roadmap/
│       │   ├── planning/
│       │   └── ...
│       ├── tools/                       # Runtime tools (onboarding, seed-context)
│       ├── rules/                       # IDE rule templates
│       │   ├── cursor/
│       │   └── claude-code/
│       ├── GUIDE.md                     # User-facing guide
│       └── package.json
│
├── scripts/                             # Root-level build & dev scripts
│   ├── build-agents.ts                  # Generates AGENTS.md from modular sources
│   └── dev-setup.sh                     # Dev environment setup (simplified)
│
├── dev/                                 # Internal dev docs
│   ├── prds/                            # Development PRDs
│   │   ├── archive/                     # Completed PRD runs
│   │   └── ...
│   ├── backlog/                         # Feature and improvement backlog
│   ├── decisions/                       # Architecture decision records
│   └── changelog.md
│
├── memory/                              # Build-time memory
│   ├── MEMORY.md
│   ├── collaboration.md
│   └── entries/
│
├── AGENTS.md                            # Shared project context
├── DEVELOPER.md                         # Developer guide
├── README.md
├── package.json                         # Workspace root (npm workspaces)
├── tsconfig.base.json                   # Shared TS config
└── tsconfig.json
```

**Note on future packages:**
- `@arete/server` — HTTP API layer for a desktop app. Not built yet. See [Desktop App Vision](#desktop-app-vision) below for details. When needed, it will be a thin Express/Fastify server that exposes core services over HTTP, consumed by a React frontend served at localhost. The server package will depend on `@arete/core` and nothing else.

---

## Desktop App Vision

The next major product bet after this refactor is a desktop app that provides a richer UI/UX for product builders, especially those who are less technical and may not live in an IDE.

**Form factor:** A React web app served at localhost, launched from the CLI (`arete app` or similar). Not a native Electron app — a localhost approach is simpler to build, easier to iterate on, and avoids Electron's overhead. The "app" is a web UI backed by an HTTP API that calls the same core services the CLI uses.

**Why it matters for this refactor:**
- The `StorageAdapter` interface must be clean enough that a server can use it directly
- Services must be stateless and dependency-injected (no `process.cwd()` assumptions)
- The core package must have zero CLI dependencies (no Commander, no chalk, no readline)
- Response types should be JSON-serializable (the server will return them as-is)

**What the desktop app would provide:**
- Visual workspace dashboard (context inventory, memory timeline, entity relationships)
- Guided workflows for less technical PMs (wizard-style project creation, template selection)
- Meeting prep and briefing views with rich formatting
- Memory browser with search, timeline, and relationship visualization
- Integration management UI (connect calendar, configure Fathom)

**What it would NOT do:**
- Replace the IDE workflow — technical PMs who live in Cursor/Claude Code continue using Arete as today
- Run AI agents — the desktop app surfaces intelligence and context; the AI agent still runs in the IDE or via CLI
- Require a hosted backend — everything runs locally, same as the CLI

**Architecture implication:**
```
@arete/core (intelligence + services)
     ↑                    ↑
@arete/cli            @arete/server
(Commander)           (Express/Fastify → React frontend)
```

Both clients are thin wrappers. The server translates HTTP requests into core service calls and returns JSON. The React frontend consumes the API. This is Phase 8+ work — not part of this refactor, but the refactor must not preclude it.

---

## Design Principles

### 1. Core owns all business logic
Every service in `packages/core/src/services/` takes typed request objects and returns typed response objects. No CLI dependencies, no `process.argv`, no `console.log` in business logic. This ensures the CLI, a future desktop app, and a future HTTP server are all thin clients.

### 2. Services are stateless where possible
Services receive their dependencies (storage adapter, workspace path, config) through constructors or parameters — not globals. This makes them testable and portable across environments.

### 3. Runtime is content, not code
The runtime package contains templates, default files, IDE rules, skills, and the user guide. It has minimal or no TypeScript logic. The CLI's `install` command stamps this content into a user's workspace directory. Skills live here because they are content (SKILL.md files) that get copied to user workspaces — they are not code packages.

### 4. Skills are starter content, not the product
Arete ships default skills to bootstrap new users. These skills benefit from intelligence metadata (`primitives`, `work_type`, `creates_project`) that enables context injection and routing. But users can swap, remove, or install community skills from skills.sh. The intelligence layer works with any skill via the `.arete-meta.yaml` sidecar pattern. Skills are in `packages/runtime/skills/`, not a standalone package.

### 5. Build-time and run-time memory are separate
Build-time memory lives in `memory/` (at the repo root) and serves the developer. End-user memory lives in the runtime workspace (`.arete/memory/`) and serves the PM. They have different schemas, different retrieval patterns, and different lifecycles.

### 6. IDE rules are generated, not static
Rules for Cursor and Claude Code are stored as templates in `packages/runtime/rules/`. The `arete install` command renders the appropriate rules for the target IDE. This decouples the workspace content from IDE-specific concerns.

### 7. Core types are reusable across build and runtime
Types like PRD, Task, and TaskStatus are defined once in `packages/core/src/models/` and used by both the development workflow and any future product features that may use similar structures.

### 8. Architecture enables multi-client delivery
The core service layer is designed to be consumed by any client: CLI today, desktop app (Electron or localhost React) tomorrow, MCP server eventually. The storage adapter pattern (`StorageAdapter` interface) allows the file-based backend to be swapped for SQLite when a desktop app needs faster queries. Only build the file adapter now; add SQLite when the desktop app PRD is written.

---

## Core Service Interfaces (Detailed)

This section defines the API surface for `packages/core/src/services/`. These interfaces are the centerpiece of the refactor — they define how any client interacts with Arete's intelligence layer.

### ContextService

Evolves from current `src/core/context-injection.ts`. Assembles relevant workspace files for a task, maps product primitives to workspace content, identifies gaps.

```typescript
class ContextService {
  constructor(storage: StorageAdapter, search: SearchProvider)

  // Assemble relevant context for a task (existing capability)
  getRelevantContext(request: ContextRequest): Promise<ContextBundle>

  // Skill-aware context: uses skill metadata (primitives, work_type)
  // to prioritize which context files matter most
  getContextForSkill(skill: SkillDefinition, task: string): Promise<ContextBundle>

  // List all context files with freshness metadata
  // Enables "stale context" warnings and dashboard views
  getContextInventory(): Promise<ContextInventory>
}

// Key types
type ContextRequest = {
  query: string
  primitives?: ProductPrimitive[]
  workType?: WorkType
  maxFiles?: number      // default 15
  minScore?: number      // default 0.3
}

type ContextBundle = {
  files: ContextFile[]   // ranked by relevance
  gaps: ContextGap[]     // primitives with no substantive content
  confidence: 'high' | 'medium' | 'low'
  assembled: string      // ISO timestamp
}

type ContextInventory = {
  files: Array<{ path: string, primitive: ProductPrimitive, lastModified: string }>
  staleFiles: Array<{ path: string, daysSinceUpdate: number }>
  missingPrimitives: ProductPrimitive[]
}
```

### MemoryService

Evolves from current `src/core/memory-retrieval.ts`. Adds write capability and timeline views.

```typescript
class MemoryService {
  constructor(storage: StorageAdapter, search: SearchProvider)

  // Search memory with recency weighting (existing capability)
  search(request: MemorySearchRequest): Promise<MemorySearchResult>

  // Create a new memory entry (decisions, learnings, observations)
  create(entry: CreateMemoryRequest): Promise<MemoryEntry>

  // Get memory items related to an entity over time
  // "What do we know about [person/project/topic]?"
  getTimeline(query: string, range?: DateRange): Promise<MemoryTimeline>

  // Get all memory items, organized by type
  getIndex(): Promise<MemoryIndex>
}

// Key types
type MemorySearchRequest = {
  query: string
  types?: MemoryItemType[]     // decisions, learnings, observations
  limit?: number               // default 10
  dateRange?: DateRange
}

type CreateMemoryRequest = {
  type: MemoryItemType
  title: string
  content: string
  date?: string                // defaults to today
  relatedEntities?: string[]   // person slugs, project names
}

type MemoryTimeline = {
  query: string
  items: Array<MemoryEntry & { relevanceScore: number }>
  dateRange: DateRange
  themes: string[]             // extracted recurring topics
}
```

### EntityService

Evolves from current `src/core/entity-resolution.ts`. Adds relationship awareness — the key missing capability for a knowledge system.

```typescript
class EntityService {
  constructor(storage: StorageAdapter)

  // Resolve ambiguous reference to best entity (existing capability)
  resolve(reference: string, type: EntityType): ResolvedEntity | null

  // Resolve to multiple candidates (existing capability)
  resolveAll(reference: string, type: EntityType, limit?: number): ResolvedEntity[]

  // Find where an entity is mentioned across workspace
  // "Where does Sarah appear in our context, meetings, memory?"
  findMentions(entity: ResolvedEntity): Promise<EntityMention[]>

  // Get known relationships between entities
  // "Sarah works on Project X, attended Meeting Y, mentioned in Decision Z"
  getRelationships(entity: ResolvedEntity): Promise<EntityRelationship[]>
}

// Key types
type EntityMention = {
  source: string               // file path
  sourceType: 'context' | 'meeting' | 'memory' | 'project'
  excerpt: string              // surrounding text
  date?: string                // when the mention occurred
}

type EntityRelationship = {
  from: ResolvedEntity
  to: ResolvedEntity
  type: 'works_on' | 'attended' | 'decided' | 'mentioned_in' | 'owns'
  evidence: string             // file path or excerpt
  date?: string
}
```

### IntelligenceService

Evolves from current `src/core/briefing.ts`. This is the orchestration layer — it combines context, memory, and entities into actionable intelligence.

```typescript
class IntelligenceService {
  constructor(
    context: ContextService,
    memory: MemoryService,
    entities: EntityService
  )

  // Assemble a full briefing (existing capability, enhanced)
  assembleBriefing(request: BriefingRequest): Promise<Briefing>

  // Prepare intelligence for a specific skill execution
  // Richer than assembleBriefing — includes skill-specific context prioritization
  prepareForSkill(skill: SkillDefinition, task: string): Promise<SkillContext>

  // Route a query to the best skill (existing capability from skill-router)
  routeToSkill(query: string, availableSkills: SkillCandidate[]): RoutedSkill | null
}

// Key types
type BriefingRequest = {
  task: string
  primitives?: ProductPrimitive[]
  workType?: WorkType
  skill?: string               // skill name for prioritization
  includeRelationships?: boolean  // include entity relationships
}

type Briefing = {
  task: string
  skill?: string
  confidence: 'high' | 'medium' | 'low'
  context: ContextBundle
  memory: MemorySearchResult
  entities: ResolvedEntity[]
  relationships: EntityRelationship[]   // NEW: entity connections
  markdown: string                       // formatted briefing
  assembled: string
}

type SkillContext = Briefing & {
  skillMetadata: SkillDefinition
  suggestedInputs: string[]              // files the skill likely needs
  relatedProjects: ResolvedEntity[]      // active projects in this domain
}
```

### WorkspaceService

Evolves from current `src/core/workspace.ts` + `src/core/workspace-structure.ts`.

```typescript
class WorkspaceService {
  constructor(storage: StorageAdapter)

  // Detect if directory is an Arete workspace
  isWorkspace(dir: string): boolean

  // Find workspace root from current directory
  findRoot(startDir?: string): string | null

  // Get all workspace paths
  getPaths(workspaceRoot: string): WorkspacePaths

  // Create a new workspace (install command)
  create(targetDir: string, options: CreateWorkspaceOptions): Promise<InstallResult>

  // Update existing workspace structure
  update(workspaceRoot: string): Promise<UpdateResult>

  // Get workspace health status
  getStatus(workspaceRoot: string): Promise<WorkspaceStatus>
}
```

### SkillService

Evolves from current `src/commands/skill.ts` + routing logic.

```typescript
class SkillService {
  constructor(storage: StorageAdapter)

  // List available skills with metadata
  list(workspaceRoot: string): Promise<SkillDefinition[]>

  // Get a specific skill by name
  get(name: string, workspaceRoot: string): Promise<SkillDefinition | null>

  // Install a skill from skills.sh or local path
  install(source: string, options: InstallSkillOptions): Promise<InstallSkillResult>

  // Get skill info including arete-meta sidecar
  getInfo(skillPath: string): Promise<SkillDefinition>
}
```

### IntegrationService

Evolves from current `src/integrations/` + calendar providers.

```typescript
class IntegrationService {
  constructor(storage: StorageAdapter, config: AreteConfig)

  // Pull data from an integration
  pull(integration: string, options: PullOptions): Promise<PullResult>

  // List configured integrations and their status
  list(): Promise<IntegrationStatus[]>

  // Configure an integration
  configure(integration: string, config: IntegrationConfig): Promise<void>
}
```

### StorageAdapter

The abstraction that enables multi-client delivery.

```typescript
interface StorageAdapter {
  // File operations
  read(path: string): Promise<string | null>
  write(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  delete(path: string): Promise<void>

  // Directory operations
  list(dir: string, options?: ListOptions): Promise<string[]>
  mkdir(dir: string): Promise<void>

  // Search (delegates to search provider)
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>

  // Metadata
  getModified(path: string): Promise<Date | null>
}

// File-based implementation (Phase 3)
class FileStorageAdapter implements StorageAdapter { ... }

// SQLite implementation (future, for desktop app)
// class SqliteStorageAdapter implements StorageAdapter { ... }
```

---

## Migration Map: Existing Files → New Locations

### src/core/ Directory

| Current File | New Location | Rationale |
|---|---|---|
| `src/core/context-injection.ts` | `packages/core/src/services/context.ts` | Becomes ContextService class. Same logic, class-based API. |
| `src/core/memory-retrieval.ts` | `packages/core/src/services/memory.ts` | Becomes MemoryService. Adds create and timeline methods. |
| `src/core/entity-resolution.ts` | `packages/core/src/services/entity.ts` | Becomes EntityService. Adds findMentions and getRelationships. |
| `src/core/briefing.ts` | `packages/core/src/services/intelligence.ts` | Becomes IntelligenceService. Orchestrates other services. |
| `src/core/skill-router.ts` | `packages/core/src/services/skills.ts` (routing logic) | Routing moves into SkillService or IntelligenceService.routeToSkill. |
| `src/core/workspace.ts` | `packages/core/src/services/workspace.ts` | Becomes WorkspaceService class. |
| `src/core/workspace-structure.ts` | `packages/core/src/services/workspace.ts` (merged) | Structure constants merge into WorkspaceService. |
| `src/core/search.ts` | `packages/core/src/services/search.ts` | SearchProvider interface + implementations stay as internal dependency. |
| `src/core/config.ts` | `packages/core/src/services/workspace.ts` (merged) | Config loading merges into WorkspaceService. |
| `src/core/calendar.ts` | `packages/core/src/services/integrations.ts` | Part of IntegrationService. |
| `src/core/meetings.ts` | `packages/core/src/services/integrations.ts` | Meeting CRUD as part of IntegrationService or standalone. |
| `src/core/people.ts` | `packages/core/src/services/entity.ts` (merged) | People management merges into EntityService. |
| `src/core/adapters/` | `packages/core/src/adapters/` | IDE adapters stay as internal implementation. |
| `src/core/search-providers/` | `packages/core/src/search/` | Search provider implementations. |
| `src/core/calendar-providers/` | `packages/core/src/integrations/calendar/` | Calendar provider implementations. |
| `src/types.ts` | `packages/core/src/models/` (split into domain files) | Types split by domain into separate model files. |

### src/commands/ Directory

| Current File | New Location | Rationale |
|---|---|---|
| All `src/commands/*.ts` | `packages/cli/src/commands/` | Thin wrappers that call core services. Business logic extracted to core. |
| `src/cli.ts` | `packages/cli/src/index.ts` | CLI entry point. |

### scripts/ Directory

| Current File | New Location | Rationale |
|---|---|---|
| `scripts/build-agents.ts` | `scripts/build-agents.ts` (stays at root) | Build script for AGENTS.md. Stays as root-level build tool. |
| `scripts/copy-runtime.js` | **Removed** | npm workspaces handle package boundaries. |
| `scripts/dev-setup.sh` | `scripts/dev-setup.sh` (simplified) | Simplified for npm workspaces. |
| `scripts/setup.sh` | `packages/cli/scripts/setup.sh` | User-facing environment checker. |
| `scripts/integrations/utils.py` | **Port to TypeScript** → `packages/core/src/utils/` | Utility functions ported. Keep Python working short-term. |
| `scripts/integrations/test_utils.py` | `packages/core/test/utils/` | Tests move with the code. |

### runtime/ Directory

| Current File | New Location | Rationale |
|---|---|---|
| `runtime/skills/` | `packages/runtime/skills/` | Skills are starter content, bundled with runtime. |
| `runtime/rules/` | `packages/runtime/rules/` | IDE rule templates. |
| `runtime/tools/` | `packages/runtime/tools/` | Runtime tools (onboarding, seed-context). |
| `runtime/templates/` | `packages/runtime/templates/` | Project and output templates. |
| `runtime/GUIDE.md` | `packages/runtime/GUIDE.md` | User-facing guide. |
| `runtime/integrations/` | `packages/runtime/integrations/` | Integration config templates. |

### dev/autonomous/ Directory

| Current File | New Location | Rationale |
|---|---|---|
| `autonomous/schema.ts` | `packages/core/src/models/prd.ts` | PRD/Task types become shared core types. |
| `autonomous/archive/` | `dev/prds/archive/` | Historical PRD runs preserved. |
| `autonomous/prd.json` | `dev/prds/prd.json` (gitignored) | Working file location. |
| `autonomous/progress.txt` | `dev/prds/progress.txt` (gitignored) | Working log location. |
| All other autonomous files | `.agents/skills/` (adapted) | Build skills already partially migrated. Remaining content adapts to current skill format. |

---

## Implementation Phases

### Phase 1: Monorepo Scaffolding

**Goal:** Set up the monorepo structure with npm workspaces. No logic migration yet — just the skeleton.

**Tasks:**
1. Create root `package.json` with npm workspaces config pointing to `packages/*`
2. Create `tsconfig.base.json` with shared compiler options
3. Create package directories: `packages/core`, `packages/cli`, `packages/runtime`
4. Create `package.json` and `tsconfig.json` for each package with correct names (`@arete/core`, `@arete/cli`, `@arete/runtime`)
5. Configure inter-package dependencies (cli depends on core; runtime has no code deps)
6. Verify `npm install` and `npm run build` work across the workspace

**Validation:** Running `npm install` from root installs all packages. Each package can be built independently.

---

### Phase 2: Define Models and Service Interfaces

**Goal:** Establish the typed API surface in `packages/core` before migrating logic. This phase defines the intelligence layer's contract — every future client (CLI, desktop, HTTP) will consume these interfaces.

**Tasks:**
1. Create `packages/core/src/models/` with type definitions:
   - `memory.ts` — MemoryEntry, MemorySearchRequest, MemorySearchResult, CreateMemoryRequest, MemoryTimeline, MemoryIndex, MemoryItemType, DateRange
   - `context.ts` — ContextFile, ContextBundle, ContextRequest, ContextGap, ContextInventory, ProductPrimitive, WorkType
   - `workspace.ts` — WorkspaceConfig, WorkspacePaths, WorkspaceStatus, CreateWorkspaceOptions, InstallResult, UpdateResult, IDETarget
   - `skills.ts` — SkillDefinition, SkillMetadata, SkillCandidate, RoutedSkill, InstallSkillOptions, InstallSkillResult
   - `entities.ts` — Person, Meeting, Project, ResolvedEntity, EntityType, EntityMention, EntityRelationship
   - `intelligence.ts` — BriefingRequest, Briefing, SkillContext, Suggestion
   - `integrations.ts` — CalendarEvent, FathomTranscript, IntegrationConfig, PullOptions, PullResult, IntegrationStatus
   - `prd.ts` — PRD, Task, TaskStatus, validateTask, validatePRD (migrated from `dev/autonomous/schema.ts`)
2. Create `packages/core/src/utils/` with utility functions:
   - `slugify.ts`, `dates.ts`, `templates.ts`, `dedup.ts` (ported from Python where applicable)
3. Create `packages/core/src/services/` with service class stubs implementing the interfaces defined in the [Core Service Interfaces](#core-service-interfaces-detailed) section:
   - `context.ts` — ContextService (getRelevantContext, getContextForSkill, getContextInventory)
   - `memory.ts` — MemoryService (search, create, getTimeline, getIndex)
   - `entity.ts` — EntityService (resolve, resolveAll, findMentions, getRelationships)
   - `intelligence.ts` — IntelligenceService (assembleBriefing, prepareForSkill, routeToSkill)
   - `workspace.ts` — WorkspaceService (isWorkspace, findRoot, getPaths, create, update, getStatus)
   - `skills.ts` — SkillService (list, get, install, getInfo)
   - `integrations.ts` — IntegrationService (pull, list, configure)
4. Create `packages/core/src/storage/adapter.ts` with the StorageAdapter interface
5. Export everything from `packages/core/src/index.ts`

**Validation:** `packages/core` builds cleanly. Types can be imported by other packages. Service stubs have correct signatures. Utility functions have tests ported from `scripts/integrations/test_utils.py`.

---

### Phase 3: Migrate Logic to Core Services

**Goal:** Move existing business logic from `src/core/` into the new service classes, implementing the stub methods.

**Tasks:**
1. Create `packages/core/src/storage/file.ts` — FileStorageAdapter implementing StorageAdapter
2. Migrate ContextService — port `context-injection.ts` logic into ContextService.getRelevantContext, add getContextForSkill and getContextInventory
3. Migrate MemoryService — port `memory-retrieval.ts` logic into MemoryService.search, implement create and getTimeline
4. Migrate EntityService — port `entity-resolution.ts` logic into EntityService.resolve/resolveAll, implement findMentions and getRelationships
5. Migrate IntelligenceService — port `briefing.ts` logic into IntelligenceService.assembleBriefing, implement prepareForSkill, move routing from `skill-router.ts`
6. Migrate WorkspaceService — port `workspace.ts` + `workspace-structure.ts` + `config.ts`
7. Migrate SkillService — port skill management from `commands/skill.ts` into SkillService
8. Migrate IntegrationService — port `calendar.ts`, `meetings.ts`, `integrations/fathom/`
9. Port search providers (`search.ts`, `search-providers/`) into `packages/core/src/search/`
10. Port IDE adapters into `packages/core/src/adapters/`
11. Write tests for each service (port existing tests + add new ones for new methods)
12. Ensure no service imports anything from `packages/cli`

**Validation:** All core services have tests. No service references CLI-specific code. Existing test coverage is maintained or improved.

---

### Phase 4: Rebuild CLI as Thin Client

**Goal:** Rebuild `packages/cli/` as a thin wrapper that parses args and calls core services.

**Tasks:**
1. Set up CLI entry point and arg parser (Commander)
2. Create command handlers that instantiate core services and call methods:
   - `install.ts` — WorkspaceService.create
   - `context.ts` — ContextService.getRelevantContext
   - `memory.ts` — MemoryService.search / create
   - `brief.ts` — IntelligenceService.assembleBriefing
   - `resolve.ts` — EntityService.resolve
   - `route.ts` — IntelligenceService.routeToSkill
   - `skill.ts` — SkillService.list / install
   - `pull.ts` — IntegrationService.pull
   - `setup.ts` — WorkspaceService environment checks
   - `status.ts` — WorkspaceService.getStatus
   - `people.ts` — EntityService (people-specific views)
   - `meeting.ts` — IntegrationService (meeting-specific operations)
3. Create formatters for CLI-specific output (tables, markdown, colors)
4. Move `scripts/setup.sh` to `packages/cli/scripts/setup.sh`
5. Set up `bin/arete` entry point
6. Verify all existing CLI commands work identically

**Validation:** All CLI commands produce identical output to before. CLI has zero business logic — every command delegates to a core service.

---

### Phase 5: Migrate Runtime Content + Skills

**Goal:** Move workspace content and skills into `packages/runtime/` and update install process.

**Tasks:**
1. Move skills from `runtime/skills/` to `packages/runtime/skills/` (same structure, just new location)
2. Move context templates, memory structure, meeting/planning templates to `packages/runtime/`
3. Move tools from `runtime/tools/` to `packages/runtime/tools/`
4. Create IDE rule templates in `packages/runtime/rules/cursor/` and `rules/claude-code/`
5. Move GUIDE.md to `packages/runtime/`
6. Move integration configs from `runtime/integrations/` to `packages/runtime/integrations/`
7. Update CLI `install` command to copy from packages/runtime and render IDE rules
8. Remove old `runtime/` directory and `scripts/copy-runtime.js`

**Validation:** `arete install ~/test --ide cursor` produces a working workspace identical to current behavior. All skills discoverable and routable.

---

### Phase 6: Intelligence Layer Enhancement

**Goal:** With clean architecture in place, enhance the intelligence services with the capabilities that differentiate Arete. This is where the product thesis gets validated.

**Priority ordering** (based on product impact): Temporal intelligence → Proactive context → Entity relationships → Learning from usage. The first three ship in this phase; learning from usage is future work that requires usage data to be meaningful.

**Motivating example:** In testing, an agent was asked a set of questions about a product. It answered roughly half with confidence. When asked "did you search the meeting transcripts?", it admitted it hadn't — and after doing so, answered significantly more with confidence. The intelligence layer should eliminate this gap: when a query touches a topic, all relevant sources (context files, meeting transcripts, memory entries) should be searched automatically, not just the ones the agent thinks to look at.

**Tasks:**

**6a. Temporal intelligence** (highest priority)
1. Implement MemoryService.getTimeline:
   - Query memory items related to a topic/entity over a time range
   - Extract recurring themes across entries ("this topic appeared in 4 entries over 3 weeks")
   - Enable "what do we know about X?" and "what changed about X since last month?" queries
2. Add temporal awareness to ContextService.getRelevantContext:
   - When assembling context, check meeting transcripts and memory for temporal patterns
   - Surface recency signals: "last discussed 2 days ago in [meeting]" vs "not mentioned in 90 days"
3. CLI: `arete memory timeline "onboarding"` — shows temporal view of a topic

**6b. Proactive context assembly** (second priority)
4. Implement deep source search in IntelligenceService.assembleBriefing:
   - When assembling a briefing, search ALL available sources: context files, meeting transcripts, memory entries, project docs
   - Don't rely on the agent to know which sources to check — the intelligence layer should be exhaustive
   - Rank and deduplicate results across source types
5. Implement ContextService.getContextInventory:
   - Track when each context file was last updated
   - Flag stale context (configurable threshold, e.g. 30 days)
   - Show coverage gaps per primitive
6. Implement IntelligenceService.prepareForSkill:
   - Given a skill and task, assemble the optimal context bundle
   - Use skill metadata (primitives, work_type, creates_project) to prioritize
   - Include temporal patterns and recent memory automatically
   - Suggest related active projects
7. CLI: `arete context --inventory` — shows freshness and coverage dashboard

**6c. Entity relationships** (third priority)
8. Implement EntityService.findMentions:
   - Scan context files, meeting notes, memory entries for entity references
   - Return where and when an entity was mentioned across the workspace
9. Implement EntityService.getRelationships:
   - Build a lightweight relationship graph: Person→Project, Person→Meeting, Project→Problem
   - Infer relationships from co-occurrence in documents (person mentioned in project README = works_on)
   - Surface in briefings: "Sarah works on Project X, last discussed in [meeting]"
10. Update IntelligenceService.assembleBriefing to include relationships:
    - When an entity is mentioned in the task, include its relationships
    - Show temporal patterns ("this topic has come up 3 times in the last month")

**6d. Tests, docs, and CLI**
11. Write tests for all new capabilities (temporal, proactive, relationships)
12. Update GUIDE.md to document new intelligence features
13. Update CLI commands to expose new features

**Future (not this phase): Learning from usage**
- Track which context was actually useful (requires feedback loop)
- Track which skills produced good outcomes
- Use usage patterns to improve context ranking over time
- This requires real usage data and should be revisited after the intelligence layer is in production

**Validation:**
- `arete brief --for "prep for Sarah 1:1" --skill meeting-prep` returns a briefing that includes what projects Sarah is working on, recent decisions she was involved in, and context from their last meeting — without the agent needing to know to search those sources.
- `arete memory timeline "onboarding"` shows a temporal view of everything known about onboarding, with themes and recency.
- `arete context --inventory` shows freshness and coverage gaps.
- Intelligence layer searches meeting transcripts, memory, AND context files for any query — no source left unsearched.

---

### Phase 7: Cleanup and Verify

**Goal:** Remove old structure, verify everything end-to-end.

**Tasks:**
1. Remove migrated directories: old `src/`, `runtime/`, `bin/`, `test/`, `scripts/integrations/`, `scripts/copy-runtime.js`
2. Move `dev/autonomous/` remaining content into `.agents/skills/` (adapt for current IDE workflow)
3. Simplify `scripts/dev-setup.sh` or remove if unnecessary
4. Update `scripts/build-agents.ts` paths for new structure
5. Update AGENTS.md, DEVELOPER.md, README.md
6. Run full test suite across all packages
7. Test end-to-end: install → workspace creation → skill execution → intelligence queries
8. Verify briefing quality: test with real-world scenarios

**Validation:** Clean repo. All tests pass. All end-user workflows functional. Intelligence features demonstrably improve context quality.

---

## Dev Workflow Migration (Separate Initiative)

The migration of build skills and dev workflow to a different coding agent (Pi or otherwise) is **decoupled from this refactor**. The monorepo structure is IDE-agnostic — it works with Cursor, Claude Code, Pi, or any future agent.

**Current state:** Build skills live in `.agents/skills/`, dev memory in `memory/`, and Cursor rules in `.cursor/rules/`. This continues to work throughout and after the refactor.

**When to revisit:** After the monorepo refactor is complete and the intelligence layer is enhanced, evaluate whether a different dev agent setup (Pi, different IDE config, etc.) would improve the development workflow. This is a separate PRD.

**What to preserve:**
- PRD-driven development workflow (plan → PRD → execute)
- Build memory (decisions, learnings, entries)
- Autonomous execution capability (orchestrator + reviewer pattern)
- Archive of completed PRD runs

---

## Migration Notes

### What stays the same
- End-user experience (install via npm, open in Cursor/Claude Code)
- Skill behavior and content
- Context management workflow
- Memory categories (decisions, learnings, observations)
- AGENTS.md as shared project context
- PRD-driven development workflow (plan → PRD → execute)
- Archive of completed PRD runs
- Build skills in `.agents/skills/`
- Dev workflow and IDE configuration

### What changes
- Single package → monorepo with npm workspaces (3 packages: core, cli, runtime)
- Business logic scattered in src/core/ → consolidated in packages/core/services/ as service classes
- Skills stay as content in runtime (not a separate package)
- IDE rules hardcoded → generated from templates during install
- Python integration utils → ported to TypeScript in packages/core/utils/
- scripts/copy-runtime.js → removed (npm workspaces)
- Intelligence layer enhanced with entity relationships, memory timeline, context inventory
- Storage abstracted behind StorageAdapter interface (file-based now, SQLite-ready for desktop)

### Risks and mitigations
- **Monorepo complexity slows iteration** → Only 3 packages. Don't create abstractions until needed.
- **Service interface wrong, needs rework** → Start simple in Phase 2, refine during Phase 3. Interfaces are informed by existing working code.
- **Skill migration breaks skills** → Skills stay as content in runtime, same format. No skill format changes.
- **Python→TS port introduces bugs** → Port tests first (from test_utils.py), then implementations.
- **Intelligence enhancement scope creep** → Phase 6 has specific, bounded tasks. Each task is independently valuable. Ship incrementally.
- **Desktop app requirements change architecture** → StorageAdapter interface protects us. Only build file adapter now.

---

## Resolved Decisions

- [x] **Skills package**: Skills are starter content in `@arete/runtime`, not a standalone package.
- [x] **Desktop app form factor**: Localhost React app with Express/Fastify API, not Electron. See [Desktop App Vision](#desktop-app-vision).
- [x] **Test framework**: Keep `node:test` + `node:assert/strict` (established, no migration needed).
- [x] **Intelligence priority**: Temporal → Proactive → Relationships → Learning from usage.
- [x] **Dev workflow migration**: Decoupled from this refactor. Separate initiative.

## Open Items

- [ ] Decide whether `arete brief` should show entity relationships by default or behind a flag
- [ ] Decide if `scripts/build-agents.ts` should be simplified now that the structure is different
- [ ] Determine if `scripts/dev-setup.sh` is still needed or if npm workspaces replace it
- [ ] Evaluate whether `arete context --inventory` should be a separate command or part of `arete status`
- [ ] Decide on caching strategy for entity relationship scanning (full scan vs incremental)
- [ ] Determine if meeting transcript search should be opt-in or always-on (performance vs completeness tradeoff)
- [ ] Plan desktop app PRD after Phase 6 (intelligence enhancements inform what the UI needs to surface)
