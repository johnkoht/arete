# Areté Developer Guide

> **Audience**: This guide is for developers building and maintaining Areté. For end users (product builders), see [GUIDE.md](GUIDE.md) in your workspace after install.

Areté is a Product Management workspace for Cursor and Claude Code that helps product builders maintain context, run structured workflows, and build institutional memory.

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Architecture Overview](#architecture-overview)
- [Key Systems](#key-systems)
- [Development Workflow](#development-workflow)
- [Adding Features](#adding-features)
- [Coding Conventions](#coding-conventions)
- [Testing](#testing)
- [References](#references)

---

## Getting Started

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/arete.git
cd arete

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Build System

Areté is organized as a **monorepo** with npm workspaces:

- **Source**: `packages/core/src/` (services), `packages/cli/src/` (commands), `packages/runtime/` (user-facing files)
- **Build output**: `packages/core/dist/`, `packages/cli/dist/`
- **Scripts**:
  - `npm run build` - Build all packages (agents + TypeScript)
  - `npm run build:packages` - Build TypeScript packages only
  - `npm run dev` - Run CLI in dev mode via tsx
  - `npm test` - Run test suite across all packages
  - `npm run typecheck` - Type check all packages

### AGENTS.md Compilation

**AGENTS.md is a generated file** — do not edit it directly. It's compiled from modular source files in `.agents/sources/`.

**Why?** Following [Vercel's research](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals), compressed documentation in the agent's context (AGENTS.md) achieves better results (100% pass rate) than active skill retrieval (79% pass rate).

**How it works:**
1. **Source files** in `.agents/sources/` are human-readable markdown
2. **Build script** (`scripts/build-agents.ts`) compiles sources into compressed output
3. **Two outputs**: BUILD (`AGENTS.md` at root) and GUIDE (`dist/AGENTS.md` for users)

**Directory structure:**
```
.agents/sources/
├── shared/       # Content for both BUILD and GUIDE
│   ├── vision.md
│   ├── workspace-structure.md
│   └── cli-commands.md
├── builder/      # BUILD-specific (this repo)
│   ├── skills-index.md
│   ├── rules-index.md
│   ├── conventions.md
│   └── memory.md
└── guide/        # GUIDE-specific (shipped to users)
    ├── skills-index.md
    ├── tools-index.md
    ├── intelligence.md
    └── workflows.md
```

**When to rebuild:**
- After adding/removing skills or tools
- After changing skill triggers or descriptions
- After modifying any source file in `.agents/sources/`
- Before committing changes to skills, rules, or workspace structure

**Commands:**
```bash
# Rebuild BUILD AGENTS.md (for this repo)
npm run build:agents:dev

# Rebuild GUIDE AGENTS.md (for npm package)
npm run build

# Both
npm run build:agents:dev && npm run build
```

**See also:** `.agents/sources/README.md` for detailed editing workflow.

---

### Dev vs Product Separation

**Two modes of operation**:

1. **BUILDER mode** - Building Areté itself (this repo)
   - Memory in `memory/entries/` indexed by `memory/MEMORY.md`
   - PRDs in `dev/prds/{feature}/prd.md`
   - Build skills in `.agents/skills/`
   - Use `AGENT_MODE=BUILDER` to force this mode

2. **GUIDE mode** - End-user PM workspace
   - Memory in `.arete/memory/items/`
   - PRDs in `projects/active/`
   - Product skills in `.agents/skills/`
   - Use `AGENT_MODE=GUIDE` to force this mode

The system auto-detects: if `packages/core/` and `memory/MEMORY.md` exist → BUILDER; otherwise → GUIDE.

---

## Architecture Overview

### What Areté Is

Areté solves three fundamental problems for product managers:

1. **Context Loss** - Business knowledge scattered across docs, meetings, and memory
2. **Inconsistent Process** - PM workflows (discovery, PRDs, analysis) done differently each time
3. **Institutional Amnesia** - Decisions and learnings lost when people leave or time passes

**Solution**: A structured workspace with:
- **Context management** (source of truth files)
- **Project-based workflows** (discovery, PRD, competitive analysis, roadmaps)
- **Institutional memory** (decisions and learnings captured persistently)
- **Intelligence services** (context injection, memory retrieval, entity resolution)

### Directory Structure

```
arete/
├── packages/
│   ├── core/               # @arete/core — Intelligence and service layer
│   │   ├── src/
│   │   │   ├── services/   # ContextService, MemoryService, EntityService, etc.
│   │   │   ├── models/     # Type definitions by domain
│   │   │   ├── storage/    # StorageAdapter interface + FileStorageAdapter
│   │   │   ├── search/     # SearchProvider (QMD + fallback)
│   │   │   ├── adapters/   # IDE adapters (Cursor, Claude Code)
│   │   │   ├── integrations/ # Calendar, Fathom, meetings
│   │   │   ├── utils/      # Shared utilities (slugify, dates, templates, dedup)
│   │   │   └── index.ts    # Public API + createServices() factory
│   │   └── test/           # Core service tests
│   ├── cli/                # @arete/cli — Thin CLI wrapper
│   │   ├── src/
│   │   │   ├── commands/   # CLI command handlers
│   │   │   ├── formatters.ts # Output formatting (tables, markdown, color)
│   │   │   └── index.ts    # Commander setup + entry point
│   │   ├── bin/arete.js    # CLI entry point
│   │   └── test/           # CLI tests + golden file tests
│   └── runtime/            # @arete/runtime — Workspace content
│       ├── skills/         # Default PM skills (23 skills)
│       ├── tools/          # Lifecycle tools (onboarding, seed-context)
│       ├── templates/      # Meeting and project templates
│       ├── rules/          # IDE rules (cursor/, claude-code/)
│       ├── integrations/   # Integration configs
│       └── GUIDE.md        # Comprehensive user guide (shipped)
├── memory/                 # Build memory (MEMORY.md, collaboration.md, entries/)
├── .agents/                # Build-specific agent resources
│   ├── skills/             # Build skills (execute-prd, plan-to-prd, etc.)
│   └── sources/            # AGENTS.md source files
├── dev/                    # Developer-only files (not shipped)
│   ├── prds/               # Feature PRDs
│   └── backlog/            # Feature and improvement backlog
├── .cursor/                # Cursor IDE configuration (rules/)
└── scripts/                # Build and integration scripts
```

**Package Separation**:
- `packages/core/` — All business logic, no CLI dependencies (zero chalk/commander/inquirer)
- `packages/cli/` — Thin wrapper using `createServices()` factory, CLI-specific formatting
- `packages/runtime/` — Static content (skills, tools, templates, rules), no TypeScript build
- `dev/` → never shipped (build-only)

### Multi-IDE Support

Areté supports both Cursor and Claude Code using an **adapter pattern**:

- **Canonical workspace**: `runtime/` contains Cursor-style paths (`.cursor/`, etc.)
- **Transpilation**: `scripts/prepare-claude-adapter.ts` transforms to Claude-style (`.claude/`)
- **Installation**: `arete install --ide cursor|claude` selects which to install

**Convention**: Always write canonical source with `.cursor/` paths; the adapter handles transformation.

---

## Key Systems

### 1. Workspace System

**Purpose**: Install and maintain the user's PM workspace structure.

**Key files**:
- `packages/cli/src/commands/install.ts` - Install command handler
- `packages/cli/src/commands/update.ts` - Update command handler
- `packages/core/src/services/workspace.ts` - WorkspaceService (create, update, getPaths)
- `packages/core/src/workspace-structure.ts` - Directory structure and default files

**How it works**:
1. User runs `arete install [directory]`
2. CLI calls `WorkspaceService.create()` via `createServices()` factory
3. System creates directory structure (context/, projects/, people/, etc.)
4. Copies runtime files from `packages/runtime/` (rules, skills, tools, templates, GUIDE.md)
5. Creates default files (context/, goals/, now/)

**Key patterns**:
- **Copy-if-missing**: GUIDE.md and templates never overwrite user edits
- **Default files**: Small files are string-backed in `DEFAULT_FILES`
- **Service delegation**: CLI command handlers are thin — all logic is in core services

### 2. Skills System

**Purpose**: Stateless PM workflows (discovery, PRD, meeting prep).

**Key files**:
- `packages/runtime/skills/` - Product skills (meeting-prep, create-prd, discovery, etc.)
- `packages/cli/src/commands/skill.ts` - Skill CLI command handler
- `packages/core/src/services/skills.ts` - SkillService (list, get, install, route)

**How it works**:
1. User says "Help me prep for my meeting"
2. Agent runs `arete skill route "help me prep for my meeting"`
3. Router returns: `meeting-prep`
4. Agent reads `.agents/skills/meeting-prep/SKILL.md`
5. Agent executes skill's workflow

**Key patterns**:
- Skills are SKILL.md files with structured sections (Purpose, Inputs, Workflow, Outputs)
- Router uses fuzzy matching + categories to find best skill
- Skills reference intelligence services (QMD, memory, entity resolution)

### 3. Tools System

**Purpose**: Lifecycle-based capabilities with phases and progress tracking.

**Key files**:
- `packages/runtime/tools/` - Tools (onboarding, seed-context)
- Tool router integrated into `packages/core/src/services/intelligence.ts`

**How it works**:
1. User says "I'm starting a new job"
2. Agent runs `arete skill route "I'm starting a new job"`
3. Router returns: `{type: 'tool', action: 'activate', name: 'onboarding'}`
4. Agent reads `.cursor/tools/onboarding/TOOL.md`
5. Agent activates tool (asks scope, creates project, guides Phase 1)

**Tool lifecycle**:
- **Activation**: Create project, initialize phase files
- **Progression**: Work through phases (Phase 1, 2, 3)
- **Graduation**: Tool completes, project archived

**Difference from skills**:
- Skills: Stateless, one-time execution
- Tools: Stateful, multi-phase, eventual graduation

### 4. Meetings System

**Purpose**: Capture, process, and leverage meeting context.

**Key files**:
- `packages/core/src/integrations/meetings.ts` - Meeting CRUD and processing
- `packages/cli/src/commands/meeting.ts` - Meeting CLI command handler
- Meeting-related skills: save-meeting, process-meetings, meeting-prep

**How it works**:
1. Meetings saved to `resources/meetings/{slug}.md`
2. Index maintained at `resources/meetings/index.md`
3. Processing extracts decisions/learnings to memory
4. Meeting prep pulls recent meetings by attendee

**Key patterns**:
- Meetings are L1 (raw, immutable)
- `attendee_ids` link to people slugs
- get_meeting_context pattern in meeting-prep skill

### 5. People System

**Purpose**: Track internal colleagues, customers, and users.

**Key files**:
- `packages/core/src/services/entity.ts` - EntityService (people, resolution, relationships)
- `packages/cli/src/commands/people.ts` - People CLI command handler
- Person files: `people/{category}/{slug}.md`

**How it works**:
1. People stored in `people/{internal|customers|users}/{slug}.md`
2. Index at `people/index.md` (table format)
3. Entity resolution matches names to slugs
4. People link to meetings, projects, and memory

**Key patterns**:
- Email addresses are unique identifiers
- Slugs generated from names (john-doe)
- Categories: internal, customers, users

### 6. Integrations System

**Purpose**: Connect to external tools (calendar, Fathom, Slack).

**Key files**:
- `packages/core/src/integrations/` - Integration implementations
- `packages/core/src/services/integrations.ts` - IntegrationService
- `packages/cli/src/commands/integration.ts` - Integration CLI command handler
- `packages/runtime/integrations/configs/` - Integration config templates

**How it works**:
1. User configures integration: `arete integration configure calendar`
2. System writes config to `.credentials/integrations.json`
3. Pull data: `arete pull calendar --days 7`
4. Data imported to workspace (meetings, events)

**Available integrations**:
- **Calendar** (macOS): Pull events from Calendar.app
- **Fathom**: Pull meeting recordings and transcripts
- (Future: Google Calendar, Slack, Linear, etc.)

### 7. Intelligence Services

**Purpose**: Assemble context, search memory, resolve entities, track relationships, surface temporal patterns.

**Key files**:
- `packages/core/src/services/context.ts` - ContextService (context injection, freshness inventory)
- `packages/core/src/services/memory.ts` - MemoryService (search, create, timeline)
- `packages/core/src/services/entity.ts` - EntityService (resolution, mentions, relationships)
- `packages/core/src/services/intelligence.ts` - IntelligenceService (briefing, routing, skill preparation)
- `packages/cli/src/commands/intelligence.ts` - CLI commands for context, memory, brief, resolve

**How it works**:

**Context injection**: `arete context --for "create PRD for search feature"`
- Searches workspace files by semantic similarity
- Returns relevant files (context/, projects/, resources/)
- **New**: `--inventory` flag shows freshness dashboard with coverage gaps per ProductPrimitive

**Memory search**: `arete memory search "onboarding decisions"`
- Searches `.arete/memory/items/` (decisions, learnings, observations)
- Returns matching items with source references

**Memory timeline**: `arete memory timeline "onboarding" --days 90`
- **New**: Temporal view of a topic showing how it evolves over time
- Returns chronologically ordered items with recurring themes and recency signals

**Entity resolution**: `arete resolve "Jane"`
- Searches people, meetings, projects
- Returns matched entities (person slug, meeting file, project path)
- **New**: `EntityService.findMentions()` scans all sources for name references
- **New**: `EntityService.getRelationships()` extracts works_on, attended, mentioned_in

**Briefing assembly**: `arete brief --for "competitive analysis" --skill competitive-analysis`
- Combines context + memory + entities + **relationships**
- Deep source search across ALL available sources (context, meetings, memory, projects)
- Organizes by product primitive (Problem, User, Solution, Market, Risk)
- Includes temporal signals and entity relationship context

### 8. Planning System

**Purpose**: Quarter/week/day planning with goal alignment.

**Key files**:
- Skills: quarter-plan, week-plan, week-review, daily-plan, goals-alignment
- `goals/` directory: strategy.md, quarter.md, initiatives.md
- `now/` directory: week.md, today.md

**How it works**:
- **Quarter plan**: Set quarter goals aligned to org strategy
- **Week plan**: Set week outcomes linked to quarter goals
- **Week review**: Mark done/partial/carried, track quarter progress
- **Daily plan**: Today's focus, meetings with context, commitments due
- **Goals alignment**: Compare PM goals to org strategy

### 9. Memory System

**Purpose**: Capture and preserve institutional knowledge.

**Key files**:
- `.arete/memory/items/` - Atomic facts (decisions, learnings, observations)
- `.arete/memory/summaries/` - Synthesized (collaboration, sessions)
- `.arete/activity/` - Activity log
- `resources/` - Raw inputs (meetings, notes)

**Three layers**:
1. **L1 Resources** - Raw, immutable (meetings, notes)
2. **L2 Items** - Extracted facts (decisions, learnings)
3. **L3 Summaries** - Synthesized context (collaboration profile, sessions)

**Key patterns**:
- Never write to memory without user approval
- extract_decisions_learnings pattern (scan → present → approve → write)
- Memory search finds relevant history for current work

### 10. Search Provider System

**Purpose**: Pluggable semantic search (currently QMD).

**Key files**:
- `packages/core/src/search/` - Search provider abstraction
- QMD integration (shell commands to `qmd query`)

**How it works**:
1. Skills specify semantic search needs
2. System shells out to `qmd query "search term"`
3. Results returned as file paths + snippets
4. Agent incorporates into workflow

**Future**: Google Calendar, Slack, Linear, etc.

### 11. Calendar System

**Purpose**: Pull calendar events for meeting prep and planning.

**Key files**:
- `packages/core/src/integrations/calendar/` - Calendar providers (macOS, future: Google)
- `packages/cli/src/commands/pull.ts` - Pull calendar data

**How it works**:
1. Configure: `arete integration configure calendar`
2. Pull: `arete pull calendar --today` or `--days 7`
3. Events matched to people by email
4. Used in daily-plan and week-plan skills

### 12. Template System

**Purpose**: Customizable templates for meetings, projects, etc.

**Key files**:
- `packages/runtime/templates/` - Default templates
- `.arete/templates/` - User custom templates (in workspace)
- `packages/cli/src/commands/template.ts` - Template CLI command handler

**How it works**:
1. System ships default templates (leadership, customer, dev-team, one-on-one, other)
2. User can override by creating `.arete/templates/meeting-agendas/{type}.md`
3. Agent runs `arete template list meeting-agendas` to discover available
4. Agent uses template when creating agendas

**Template format**:
- YAML frontmatter (name, type, description, time_allocation)
- Markdown body (sections with bullets)

### 13. Autonomous PRD Execution

**Purpose**: Execute PRD tasks sequentially with fresh context per task.

**Key files**:
- `.agents/skills/execute-prd/SKILL.md` - PRD execution orchestrator
- `.agents/skills/prd-to-json/SKILL.md` - Convert PRD to task list
- `.agents/skills/review-plan/SKILL.md` - Review execution plan
- `dev/autonomous/README.md` - Full documentation

**How it works**:
1. Write feature PRD in `dev/prds/{feature}/prd.md`
2. Convert to JSON: `arete skill prd-to-json`
3. Execute: `arete skill execute-prd`
4. Agent executes tasks sequentially, refreshing context each task
5. Review commits, merge

**Inspired by**: [Ralph](https://github.com/snarktank/ralph) but Cursor-native

---

## Development Workflow

### Quality Practices

When building Areté features, follow these practices (see `.cursor/rules/dev.mdc` for details):

#### 1. Pre-Mortem (for complex work)

Before starting substantial features:
1. Identify what could go wrong
2. List specific risks (8-12)
3. Design mitigations for each
4. Include in PRD or execution plan

Use `.agents/skills/run-pre-mortem/SKILL.md` for standalone pre-mortems.

#### 2. Testing Requirements

**Test coverage requirements** (see `.cursor/rules/testing.mdc`):
- **Core systems**: 80%+ coverage
- **CLI commands**: Test happy path + error cases
- **Integrations**: Mock external APIs
- **Skills/tools**: Test discovery and routing

**Test patterns**:
```typescript
// Use descriptive test names
test('install copies GUIDE.md to workspace root (copy-if-missing)', ...)

// Test both success and failure
test('resolve returns person when exact email match', ...)
test('resolve returns error when no matches found', ...)

// Use fixtures for complex data
const sampleMeeting = loadFixture('meetings/sample-meeting.md');
```

#### 3. Build Memory

After significant changes, add entry to `memory/MEMORY.md`:

```markdown
## Index

- YYYY-MM-DD [Title](entries/YYYY-MM-DD_slug.md) — one-line summary.
```

**Entry format** (`memory/entries/YYYY-MM-DD_slug.md`):
```markdown
# Title

Date: YYYY-MM-DD

## What Changed
- Concrete changes made

## Why
- Rationale and context

## Learnings
- Collaboration observations
- Builder preferences
- Working patterns
```

#### 4. Autonomous Development

For complex features, use the PRD execution system:

1. **Write PRD**: `dev/prds/{feature}/prd.md`
2. **Convert to tasks**: Run `prd-to-json` skill
3. **Review plan**: Run `review-plan` skill
4. **Execute**: Run `execute-prd` skill
5. **Review commits**: Check each task's commit
6. **Merge**: Squash and merge

**Benefits**:
- Sequential execution with fresh context
- Memory preserved in progress.txt
- Quality gates enforced
- Zero regressions (when done right)

---

## Adding Features

### New Integration

1. **Create provider** in `packages/core/src/integrations/{name}/`
2. **Implement interface**:
   ```typescript
   export interface Integration {
     name: string;
     configure(): Promise<void>;
     pull(options: PullOptions): Promise<PullResult>;
     seed?(options: SeedOptions): Promise<SeedResult>;
   }
   ```
3. **Add config template** in `packages/runtime/integrations/configs/{name}.json`
4. **Register** in `packages/core/src/integrations/registry.ts`
5. **Test**: Add tests in `packages/core/test/integrations/{name}.test.ts`
6. **Document**: Add section in GUIDE.md § Integrations

### New Skill

1. **Create SKILL.md** in `packages/runtime/skills/{name}/SKILL.md`
2. **Follow format**:
   ```markdown
   # Skill: {Name}
   
   ## Purpose
   What this skill does and when to use it.
   
   ## Inputs
   What the skill needs to start.
   
   ## Workflow
   Step-by-step procedure.
   
   ## Outputs
   What the skill produces.
   
   ## Intelligence Services
   Which services to use (QMD, memory, etc.).
   ```
3. **Add to router** in `packages/core/src/services/intelligence.ts` (category + keywords)
4. **Test routing**: `arete skill route "test query"` returns your skill
5. **Document**: Add row to skills table in GUIDE.md and pm-workspace.mdc

### New CLI Command

1. **Create command file** in `packages/cli/src/commands/{name}.ts`
2. **Implement handler** (thin wrapper over core service):
   ```typescript
   import { createServices } from '@arete/core';

   export function register{Name}Command(program: Command) {
     program
       .command('{name}')
       .description('Description')
       .action(async (options) => {
         const services = createServices(workspaceRoot);
         const result = await services.{service}.{method}(options);
         // Format and display result
       });
   }
   ```
3. **Register** in `packages/cli/src/index.ts`
4. **Add service method** in `packages/core/src/services/{service}.ts` if needed
5. **Test**: Add tests in `packages/cli/test/commands/{name}.test.ts`
6. **Document**: Add to CLI Reference in GUIDE.md

### New Template Type

1. **Create default templates** in `packages/runtime/templates/{type}/`
2. **Follow YAML + Markdown format**:
   ```markdown
   ---
   name: Template Name
   type: template-slug
   description: When to use this template
   ---
   
   ## Section 1
   - Bullet points
   ```
3. **Add loader** (if not using existing system)
4. **Test**: Verify discovery and loading
5. **Document**: Add section in GUIDE.md § Templates

### New Search Provider

1. **Create provider** in `packages/core/src/search/providers/{name}.ts`
2. **Implement interface**:
   ```typescript
   export interface SearchProvider {
     name: string;
     isAvailable(): Promise<boolean>;
     search(query: string): Promise<SearchResult[]>;
   }
   ```
3. **Register** in `packages/core/src/search/factory.ts`
4. **Test**: Mock search results, test ranking
5. **Document**: Add to GUIDE.md § Intelligence Services

---

## Coding Conventions

### TypeScript & Node.js

From `.cursor/rules/dev.mdc`:

- **Imports**: Group by stdlib, third-party, local
- **Naming**: camelCase for functions/variables, PascalCase for types
- **Async patterns**: Use async/await, not callbacks
- **Error handling**: Throw typed errors, handle in CLI layer
- **Types**: Explicit types for public APIs, inference for locals

### Code Style

```typescript
// ✅ Good: Explicit types for public API
export async function installWorkspace(
  targetDir: string,
  options: InstallOptions
): Promise<InstallResult> {
  // Implementation
}

// ✅ Good: Inference for locals
const files = await readDirectory(targetDir);
const filtered = files.filter(f => f.endsWith('.md'));

// ❌ Bad: Implicit any
async function doThing(stuff) { ... }

// ❌ Bad: Callback hell
fs.readFile(path, (err, data) => {
  if (err) { ... }
  processData(data, (err, result) => {
    // ...
  });
});
```

### File Organization

- **One feature per service**: `packages/core/src/services/memory.ts` for memory system
- **Separate concerns**: CLI commands in `packages/cli/`, core logic in `packages/core/`
- **Colocate tests**: `packages/core/test/services/memory.test.ts` mirrors service files
- **Export public API**: `packages/core/src/index.ts` exports all public types and services

### Documentation

- **TSDoc for public APIs**:
  ```typescript
  /**
   * Install Areté workspace at target directory.
   * @param targetDir - Directory to install workspace
   * @param options - Installation options
   * @returns Installation result with created files
   */
  export async function installWorkspace(...) { ... }
  ```
- **Inline comments for complex logic**: Explain the "why", not the "what"
- **Update GUIDE.md** when adding user-facing features
- **Update DEVELOPER.md** when changing architecture

---

## Testing

### Running Tests

```bash
# Run all tests (core + cli)
npm test

# Run specific test file
npm test -- packages/core/test/services/memory.test.ts

# Run all tests + typecheck
npm run test:all

# Type check only
npm run typecheck
```

### Test Organization

```
packages/core/test/
├── services/          # Core service tests
├── storage/           # StorageAdapter tests
├── search/            # Search provider tests
├── utils/             # Utility function tests
└── integration/       # Intelligence integration tests
packages/cli/test/
├── commands/          # CLI command tests
└── golden/            # Golden file output tests
```

### Test Patterns

**Use descriptive names**:
```typescript
test('install copies GUIDE.md to workspace root (copy-if-missing)', ...)
test('resolve returns person when exact email match', ...)
```

**Test both success and failure**:
```typescript
describe('entity resolution', () => {
  it('returns person when exact email match', ...)
  it('returns multiple matches when ambiguous name', ...)
  it('returns error when no matches found', ...)
});
```

**Use fixtures for complex data**:
```typescript
const sampleMeeting = readFileSync(
  join(__dirname, 'fixtures/meetings/sample.md'),
  'utf-8'
);
```

**Mock external dependencies**:
```typescript
import { mock } from 'node:test';

// Mock via StorageAdapter interface (preferred)
const mockStorage = {
  read: mock.fn(async () => '# Test content'),
  exists: mock.fn(async () => true),
  // ... other StorageAdapter methods
};

// Services accept StorageAdapter via constructor
const service = new MemoryService(mockStorage, searchProvider);
```

### Coverage Requirements

From `.cursor/rules/testing.mdc`:

- **Core systems**: 80%+ coverage (workspace, meetings, people, memory)
- **CLI commands**: Test happy path + error cases
- **Integrations**: Mock external APIs, test error handling
- **Skills/tools**: Test router discovery and basic execution

---

## References

### Key Documentation

- **AGENTS.md** - Generated architecture reference for AI agents (see AGENTS.md Compilation above)
- **GUIDE.md** (`packages/runtime/`) - Comprehensive user guide (shipped to workspace)
- **README.md** - End-user discovery (repo only)
- **SETUP.md** - Installation and integrations (repo only)

### Build Rules

- **.cursor/rules/dev.mdc** - Development quality practices
- **.cursor/rules/testing.mdc** - Test requirements and patterns

### Build Memory

- **memory/MEMORY.md** - Index of significant changes
- **memory/entries/** - Detailed change log entries
- **memory/collaboration.md** - Synthesized working patterns

### PRDs & Backlog

- **dev/prds/** - Feature PRDs
- **dev/backlog/features/** - Feature backlog
- **dev/backlog/improvements/** - Improvement backlog

### Autonomous Development

- **dev/autonomous/README.md** - PRD execution system documentation
- **.agents/skills/execute-prd/** - PRD execution orchestrator
- **.agents/skills/prd-to-json/** - PRD to task list converter

---

## Contributing

We welcome contributions! To get started:

1. Read this guide and AGENTS.md
2. Review memory/MEMORY.md for recent changes
3. Check dev/backlog/ for open work
4. Follow quality practices (pre-mortem, testing, memory)
5. Submit PR with clear description

Questions? Open an issue or discussion on GitHub.

---

## License

MIT - See [LICENSE](LICENSE)
