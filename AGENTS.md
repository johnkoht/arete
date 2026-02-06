# Areté - Architecture & Context for AI Agents

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

## What Areté Is

Areté is a **Cursor-native workspace for product managers** to maintain context, run structured workflows, and build institutional memory.

### The Problem We Solve

**Product managers lose context constantly:**
- Business context scattered across docs, Slack, emails
- Decisions forgotten, repeated mistakes
- No institutional memory when PMs leave
- Projects lack structure and continuity
- Hard to find past research and learnings

**Traditional solutions fail:**
- Notion/Confluence: Docs rot, search fails, structure unclear
- Wikis: Nobody maintains them
- Project management tools: Track tasks, not context
- Note apps: Personal, not shareable or structured

### Our Solution

A **structured workspace** with:
1. **Context Management** - Single source of truth for business/product context
2. **Project-Based Workflows** - Discovery, PRDs, competitive analysis, roadmaps
3. **Institutional Memory** - Decisions and learnings persisted and searchable
4. **AI-Native** - Designed for Cursor, with skills and tools for PM work

### End Users

**Primary**: Product Managers (individual contributors to CPOs)
- Working at tech companies (startups to enterprise)
- Need to maintain product context and make decisions
- Want structure without bureaucracy
- Value institutional memory and continuity

**Secondary**: Product Leaders setting up teams
- Want consistent PM practices across the org
- Need shared context and decision history
- Building PM culture and excellence

## High-Level Features

### Core Capabilities

1. **Context Management**
   - Business overview, goals, strategy
   - User personas and customer insights
   - Product catalog and competitive landscape
   - Maintained as markdown in `context/` directory

2. **Project Workflows (Skills)**
   - Discovery: Problem exploration and research
   - PRD Creation: Interactive requirements documents
   - Competitive Analysis: Market and competitor research
   - Roadmap Planning: Feature prioritization and planning
   - Synthesis: Turn inputs into insights

3. **Institutional Memory**
   - Decisions log with rationale and alternatives
   - Learnings from projects and experiments
   - Activity log for continuity
   - Searchable via QMD integration

4. **Integrations**
   - Fathom: Meeting recordings and transcripts
   - Calendar: (Planned) Sync meetings and events
   - Slack: (Planned) Context from conversations

5. **Lifecycle Tools**
   - Onboarding: 30/60/90 day plans for new PMs
   - Seed Context: Bootstrap from integration history

### CLI Interface

`arete` CLI for workspace management:
- `arete install` - Initialize workspace
- `arete status` - Check workspace health
- `arete pull` - Sync from integrations
- `arete seed` - Import historical data
- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show a person
- `arete people index` - Regenerate people/index.md

## Architecture

### Directory Structure

```
arete/
├── .cursor/
│   ├── build/           # BUILD SYSTEM (internal, not shipped)
│   │   ├── autonomous/  # Autonomous agent loop for development
│   │   ├── entries/     # Build memory and decisions
│   │   └── MEMORY.md    # Index of build changes
│   ├── rules/           # Cursor rules (dev.mdc, testing.mdc, etc.)
│   ├── skills/          # PM skills (shipped to users)
│   ├── tools/           # PM tools (shipped to users)
│   └── integrations/    # Integration configs (shipped)
├── src/                 # TypeScript source code
│   ├── cli.ts           # Main CLI entry
│   ├── commands/        # CLI commands
│   ├── core/            # Core utilities
│   └── integrations/    # Integration implementations
├── context/             # USER CONTEXT (workspace-specific)
├── projects/            # USER PROJECTS (active and archived)
├── memory/              # USER MEMORY (decisions, learnings)
├── people/              # PEOPLE (internal, customers, users)
├── resources/           # USER RESOURCES (meetings, notes)
└── templates/           # Templates for projects and outputs
```

### Key Concepts

**Build System vs Product:**
- `.cursor/build/` = Internal tooling for developing Areté (NEVER shipped)
- Everything else = Product shipped to users via npm

**Memory Layers:**
- L1: `resources/` - Raw immutable inputs (meetings, notes)
- L2: `memory/items/` - Atomic facts (decisions, learnings)
- L3: `memory/summaries/` - Synthesized context (collaboration, sessions)

**Skills vs Tools:**
- Skills = Stateless workflows (discovery, PRD, analysis)
- Tools = Lifecycle-based with phases (onboarding, seed-context)

## Key Systems

### 1. Meetings System

**Purpose**: Capture and index meeting notes/transcripts

**Storage**: `resources/meetings/YYYY-MM-DD-title-slug.md`

**Index**: `resources/meetings/index.md` (auto-updated)

**Service**: `src/core/meetings.ts`
```typescript
saveMeeting(meeting: MeetingForSave, workspaceRoot: string): SaveMeetingResult
updateMeetingsIndex(workspaceRoot: string, filename: string): void
```

**Format**: Markdown with frontmatter (title, date, attendees, source)

**Integrations**: Fathom pulls meetings via `src/integrations/fathom/`

### 2. Integrations System

**Pattern**: Each integration in `src/integrations/{name}/`
```
{name}/
├── client.ts    # API client
├── types.ts     # TypeScript types
├── config.ts    # Configuration
├── save.ts      # Save to workspace
└── index.ts     # CLI commands
```

**Registry**: `src/integrations/registry.ts` - Central integration definitions

**Capabilities**: `pull` (fetch data), `seed` (bulk import), `push` (send updates)

**Current**: Fathom (meeting recordings)  
**Planned**: Calendar, Slack, Linear

### 3. Workspace System

**Detection**: `src/core/workspace.ts`
```typescript
isAreteWorkspace(dir: string): boolean
findWorkspaceRoot(startDir: string): string | null
```

**Install**: `arete install [directory]` creates workspace structure

**Config**: `arete.yaml` (global + workspace-specific)

### 4. Skills System

**Location**: `.cursor/skills/{name}/SKILL.md`

**Format**: Agent Skills standard (https://agentskills.io)

**Invocation**: User says "start discovery" → skill is loaded and followed

**Shipped**: Skills are bundled with npm package for end users

### 5. People System

**Purpose**: Track people (internal colleagues, customers, users) with index and detail views; link to meetings and projects via email or slug.

**Storage**: `people/{internal|customers|users}/{slug}.md` with optional YAML frontmatter (name, email, role, company, team, category).

**Index**: `people/index.md` — table of all people; regenerate with `arete people index`.

**Service**: `src/core/people.ts`
```typescript
listPeople(paths, options?: { category }): Person[]
getPersonBySlug(paths, category, slug): Person | null
getPersonByEmail(paths, email): Person | null
updatePeopleIndex(paths): void
slugifyPersonName(name): string
```

**Types**: `Person` (slug, name, email?, role?, company?, team?, category) and `PersonCategory` ('internal' | 'customers' | 'users') in `src/types.ts`.

**Linking**: Meetings can list `attendee_ids: [slug]` in frontmatter (optional); projects can list `stakeholders: [slug]`. Lookup by email matches person files for "Recent meetings" style features.

**CLI**: `arete people list`, `arete people show <slug-or-email>`, `arete people index`.

### 6. Build/Development System

**Location**: `.cursor/build/` (NEVER shipped to users)

**Autonomous Loop**: `.cursor/build/autonomous/`
- Converts PRDs to JSON task lists
- Spawns Task subagents per task
- Runs tests, commits on success
- Used ONLY for developing Areté itself

**Build Memory**: `.cursor/build/MEMORY.md` and `entries/`
- Documents architectural changes
- Tracks tooling decisions
- Used by Areté maintainers

## Technology Stack

**Language**: TypeScript (strict mode, NodeNext)  
**Runtime**: Node.js 18+  
**Module System**: ES modules (use `.js` extensions in imports)  
**Testing**: node:test + node:assert/strict  
**CLI**: Commander.js  
**Build**: TypeScript compiler (tsc)

## Coding Conventions

**Imports**: Always use `.js` extensions for local modules (NodeNext requirement)

**Functions**: Use `function` keyword for top-level functions, arrow functions for callbacks

**Types**: Prefer `type` over `interface`, avoid `any`

**Naming**:
- PascalCase for types/classes
- camelCase for variables/functions
- kebab-case for files/directories
- UPPERCASE for constants

**Async**: Prefer `async`/`await` over raw Promises

**Tests**: Mirror `src/` structure in `test/`, use `*.test.ts` naming

## Future Concepts (Not Yet Implemented)

### Insights System
**Purpose**: Extract patterns and themes from meetings/notes  
**Method**: LLM-powered analysis of resources  
**Output**: Themes, sentiment, action items

### Multi-Workspace Support
**Purpose**: Switch between multiple PM workspaces  
**Method**: Workspace registry in global config  
**Use Case**: Consultants working with multiple clients

## For Autonomous Development

When building Areté features:

1. **Read this file first** for architecture understanding
2. **Check build memory** (`.cursor/build/MEMORY.md`) for recent changes
3. **Follow patterns** established in existing code
4. **Write tests** for all new functionality
5. **Update AGENTS.md** with new patterns or gotchas discovered
6. **Use TypeScript strictly** - no `any`, proper types

## Common Patterns

### Adding a New Integration

1. Create `src/integrations/{name}/` directory
2. Implement client.ts with API methods
3. Define types.ts for data structures
4. Create save.ts to persist to workspace
5. Add commands in index.ts
6. Register in `src/integrations/registry.ts`
7. Add config template to `.cursor/integrations/configs/`
8. Write tests in `test/integrations/{name}.test.ts`

### Adding a New Skill

1. Create `.cursor/skills/{name}/SKILL.md`
2. Follow Agent Skills format (name, description, workflow)
3. Include "When to Use" section
4. Provide clear step-by-step workflow
5. Add examples and error handling
6. Test by loading in Cursor

### Adding a New CLI Command

1. Create `src/commands/{name}.ts`
2. Export function with signature: `(opts: any) => Promise<void>`
3. Add to `src/cli.ts` with commander
4. Handle `--json` flag for programmatic output
5. Write tests in `test/commands/{name}.test.ts`

## Troubleshooting for Agents

**Git Alias Issue**: This environment has `git` aliased to `hub`. Use `command git` to bypass:
```bash
command git commit -m "message"
```

**ES Modules**: Require `.js` extensions in imports even for `.ts` files:
```typescript
import { foo } from './bar.js';  // Correct
import { foo } from './bar';     // Wrong (will fail in NodeNext)
```

**__dirname in ES modules**: Use this pattern:
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Additional Resources

- **Build Memory**: `.cursor/build/MEMORY.md` - Recent changes and decisions
- **Testing Guide**: `.cursor/rules/testing.mdc` - How to write tests
- **Dev Practices**: `.cursor/rules/dev.mdc` - Coding standards
- **README**: `README.md` - User-facing documentation
