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

Areté uses a build-and-copy architecture:

- **Source**: `src/` (TypeScript) and `runtime/` (user-facing files)
- **Build output**: `dist/` (compiled code) and `dist/` (copied runtime files)
- **Scripts**:
  - `npm run build` - Compile TypeScript and copy runtime files
  - `npm run dev` - Watch mode for development
  - `npm test` - Run test suite
  - `npm run lint` - Check code style

### Dev vs Product Separation

**Two modes of operation**:

1. **BUILDER mode** - Building Areté itself (this repo)
   - Memory in `dev/entries/` indexed by `dev/MEMORY.md`
   - PRDs in `dev/prds/{feature}/prd.md`
   - Build skills in `dev/skills/`
   - Use `AGENT_MODE=BUILDER` to force this mode

2. **GUIDE mode** - End-user PM workspace
   - Memory in `.arete/memory/items/`
   - PRDs in `projects/active/`
   - Product skills in `.agents/skills/`
   - Use `AGENT_MODE=GUIDE` to force this mode

The system auto-detects: if `src/cli.ts` and `dev/MEMORY.md` exist → BUILDER; otherwise → GUIDE.

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
├── src/                    # TypeScript source code
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # CLI command implementations
│   ├── core/               # Core systems (workspace, meetings, people, etc.)
│   ├── integrations/       # External tool integrations (calendar, Fathom, etc.)
│   └── utils/              # Shared utilities
├── runtime/                # User-facing files (copied to workspace)
│   ├── rules/              # IDE rules for PM workflows
│   ├── skills/             # Default PM skills
│   ├── tools/              # Lifecycle tools (onboarding, seed-context)
│   ├── templates/          # Project and meeting templates
│   ├── GUIDE.md            # Comprehensive user guide (shipped)
│   └── integrations/       # Integration configs
├── dev/                    # Developer-only files (not shipped)
│   ├── MEMORY.md           # Build history index
│   ├── entries/            # Detailed change log entries
│   ├── skills/             # Build-only skills (execute-prd, prd-to-json, etc.)
│   ├── prds/               # Feature PRDs
│   ├── backlog/            # Improvement and feature backlog
│   └── collaboration.md    # Synthesized working patterns with builder
├── test/                   # Test suite
├── dist/                   # Build output (gitignored)
└── .cursor/                # IDE config for this repo
    └── rules/              # Builder rules (dev.mdc, testing.mdc, etc.)
```

**Build vs Runtime Separation**:
- `src/` → compiles to `dist/`
- `runtime/` → copies to `dist/` → installed to user workspace
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
- `src/commands/install.ts` - Install workspace (`arete install`)
- `src/commands/update.ts` - Update rules/skills (`arete update`)
- `src/core/workspace-structure.ts` - Directory structure and default files

**How it works**:
1. User runs `arete install [directory]`
2. System creates directory structure (context/, projects/, people/, etc.)
3. Copies runtime files (rules, skills, tools, templates, GUIDE.md)
4. Creates default files (context/, goals/, now/)

**Key patterns**:
- **Copy-if-missing**: GUIDE.md and templates never overwrite user edits
- **Default files**: Small files are string-backed in `DEFAULT_FILES`
- **Large files**: GUIDE.md (~900 lines) is copied from `dist/GUIDE.md`

### 2. Skills System

**Purpose**: Stateless PM workflows (discovery, PRD, meeting prep).

**Key files**:
- `runtime/skills/` - Product skills (meeting-prep, create-prd, discovery, etc.)
- `src/commands/skill.ts` - Skill management CLI
- `src/core/skill-router.ts` - Route user message to skill

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
- `runtime/tools/` - Tools (onboarding, seed-context)
- Tool router integrated into `src/core/skill-router.ts`

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
- `src/core/meetings.ts` - Meeting CRUD and processing
- `src/commands/meeting.ts` - Meeting CLI
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
- `src/core/people.ts` - People CRUD and indexing
- `src/commands/people.ts` - People CLI
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
- `src/integrations/` - Integration implementations
- `src/commands/integration.ts` - Integration CLI
- `runtime/integrations/configs/` - Integration config templates

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

**Purpose**: Assemble context, search memory, resolve entities.

**Key files**:
- `src/commands/context.ts` - Context injection
- `src/commands/memory.ts` - Memory search
- `src/commands/resolve.ts` - Entity resolution
- `src/commands/brief.ts` - Briefing assembly

**How it works**:

**Context injection**: `arete context --for "create PRD for search feature"`
- Searches workspace files by semantic similarity
- Returns relevant files (context/, projects/, resources/)

**Memory search**: `arete memory search "onboarding decisions"`
- Searches `.arete/memory/items/` (decisions, learnings, observations)
- Returns matching items with source references

**Entity resolution**: `arete resolve "Jane"`
- Searches people, meetings, projects
- Returns matched entities (person slug, meeting file, project path)

**Briefing assembly**: `arete brief --for "competitive analysis" --skill competitive-analysis`
- Combines context + memory + entities
- Organizes by product primitive (Problem, User, Solution, Market, Risk)
- Presented to user before skill execution

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
- `src/core/search/` - Search provider abstraction
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
- `src/integrations/calendar/` - Calendar providers (macOS, future: Google)
- `src/commands/pull.ts` - Pull calendar data

**How it works**:
1. Configure: `arete integration configure calendar`
2. Pull: `arete pull calendar --today` or `--days 7`
3. Events matched to people by email
4. Used in daily-plan and week-plan skills

### 12. Template System

**Purpose**: Customizable templates for meetings, projects, etc.

**Key files**:
- `runtime/templates/` - Default templates
- `.arete/templates/` - User custom templates (in workspace)
- `src/core/meeting-agenda-templates.ts` - Template loading
- `src/commands/template.ts` - Template CLI

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
- `dev/skills/execute-prd/SKILL.md` - PRD execution orchestrator
- `dev/skills/prd-to-json/SKILL.md` - Convert PRD to task list
- `dev/skills/review-plan/SKILL.md` - Review execution plan
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

Use `dev/skills/run-pre-mortem/SKILL.md` for standalone pre-mortems.

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

After significant changes, add entry to `dev/MEMORY.md`:

```markdown
## Index

- YYYY-MM-DD [Title](entries/YYYY-MM-DD_slug.md) — one-line summary.
```

**Entry format** (`dev/entries/YYYY-MM-DD_slug.md`):
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

1. **Create provider** in `src/integrations/{name}/`
2. **Implement interface**:
   ```typescript
   export interface Integration {
     name: string;
     configure(): Promise<void>;
     pull(options: PullOptions): Promise<PullResult>;
     seed?(options: SeedOptions): Promise<SeedResult>;
   }
   ```
3. **Add config template** in `runtime/integrations/configs/{name}.json`
4. **Register** in `src/integrations/registry.ts`
5. **Test**: Add tests in `test/integrations/{name}.test.ts`
6. **Document**: Add section in GUIDE.md § Integrations

### New Skill

1. **Create SKILL.md** in `runtime/skills/{name}/SKILL.md`
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
3. **Add to router** in `src/core/skill-router.ts` (category + keywords)
4. **Test routing**: `arete skill route "test query"` returns your skill
5. **Document**: Add row to skills table in GUIDE.md and pm-workspace.mdc

### New CLI Command

1. **Create command file** in `src/commands/{name}.ts`
2. **Implement handler**:
   ```typescript
   export const {name}Command = program
     .command('{name}')
     .description('Description')
     .action(async (options) => {
       // Implementation
     });
   ```
3. **Register** in `src/cli.ts`
4. **Test**: Add tests in `test/commands/{name}.test.ts`
5. **Document**: Add to CLI Reference in GUIDE.md

### New Template Type

1. **Create default templates** in `runtime/templates/{type}/`
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

1. **Create provider** in `src/core/search/providers/{name}.ts`
2. **Implement interface**:
   ```typescript
   export interface SearchProvider {
     name: string;
     isAvailable(): Promise<boolean>;
     search(query: string): Promise<SearchResult[]>;
   }
   ```
3. **Register** in `src/core/search/registry.ts`
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

- **One feature per file**: `src/core/meetings.ts` for meeting system
- **Separate concerns**: CLI in `commands/`, core logic in `core/`
- **Colocate tests**: `test/core/meetings.test.ts` mirrors `src/core/meetings.ts`
- **Export public API**: Use barrel exports (`index.ts`) for modules

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
# Run all tests
npm test

# Run specific test file
npm test -- test/commands/install.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Test Organization

```
test/
├── commands/          # CLI command tests
├── core/              # Core system tests
├── integrations/      # Integration tests
└── fixtures/          # Test data
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
// Mock file system
jest.mock('fs-extra');

// Mock shell commands
jest.mock('child_process', () => ({
  execSync: jest.fn(() => 'mocked output')
}));
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

- **AGENTS.md** - Architecture reference for AI agents (supplementary)
- **GUIDE.md** (runtime/) - Comprehensive user guide (shipped to workspace)
- **README.md** - End-user discovery (repo only)
- **SETUP.md** - Installation and integrations (repo only)

### Build Rules

- **.cursor/rules/dev.mdc** - Development quality practices
- **.cursor/rules/testing.mdc** - Test requirements and patterns
- **.cursor/rules/arete-context.mdc** - BUILDER vs GUIDE mode

### Build Memory

- **dev/MEMORY.md** - Index of significant changes
- **dev/entries/** - Detailed change log entries
- **dev/collaboration.md** - Synthesized working patterns

### PRDs & Backlog

- **dev/prds/** - Feature PRDs
- **dev/backlog/features/** - Feature backlog
- **dev/backlog/improvements/** - Improvement backlog

### Autonomous Development

- **dev/autonomous/README.md** - PRD execution system documentation
- **dev/skills/execute-prd/** - PRD execution orchestrator
- **dev/skills/prd-to-json/** - PRD to task list converter

---

## Contributing

We welcome contributions! To get started:

1. Read this guide and AGENTS.md
2. Review dev/MEMORY.md for recent changes
3. Check dev/backlog/ for open work
4. Follow quality practices (pre-mortem, testing, memory)
5. Submit PR with clear description

Questions? Open an issue or discussion on GitHub.

---

## License

MIT - See [LICENSE](LICENSE)
