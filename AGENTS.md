# Areté - Architecture & Context for AI Agents

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

## Context: BUILDER vs GUIDE

**Which mode are you in?** Check `agent_mode` in `arete.yaml` (or `AGENT_MODE` env). Source of truth: `.cursor/rules/arete-context.mdc`.

- **BUILDER** (this repo): You are building Areté. Follow dev.mdc and testing.mdc. Put build memories in `.cursor/build/entries/` and MEMORY.md; PRDs in `.cursor/build/prds/`. Do not run `arete seed test-data` here.
- **GUIDE** (end-user workspace): You are helping the PM achieve arete. Use only product skills, skill router, and tools. Put user memories in `.arete/memory/items/`. Do not use build rules or `.cursor/build/`.

**Override**: Set `AGENT_MODE=BUILDER` or `AGENT_MODE=GUIDE` to force a mode (e.g. test GUIDE behavior in the repo). `arete route --json` includes `agent_mode` in the output.

## What Areté Is

Areté is a **product builder's operating system** — a Cursor-native workspace that manages product knowledge, provides intelligence services to any workflow, and creates a consistent interface between the messy reality of product work and the tools you use.

### Architecture Direction (Active)

Areté is evolving from a skill-centric workspace to a product intelligence platform. See `.cursor/build/prds/product-os/vision.md` for the full vision. Key concepts:

- **Five product primitives**: Problem, User, Solution, Market, Risk — the knowledge model the intelligence layer reasons about.
- **Intelligence layer**: Context injection, memory retrieval, entity resolution, synthesis — services that make any skill or workflow dramatically more effective.
- **Skills as methods**: Areté ships opinionated default skills but users can swap them. The value is the intelligence underneath, not the procedures on top.
- **Workspace restructure**: `now/` (daily focus), `goals/` (elevated), `.arete/memory/` (system-managed), project templates by work type.

> **Note**: The codebase is in transition. Current workspace structure and skills still follow the pre-restructure layout documented below. Updates will land incrementally.

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
- `arete seed` - Import historical data from integrations
- `arete seed test-data` - **(Dev only)** Copy fixture data into workspace for local testing; see `TEST-SCENARIOS.md` for test prompts. Available only when package is linked (`npm link`) or installed via `--source symlink`; `test-data/` is excluded from the published npm package.
- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show a person
- `arete people index` - Regenerate people/index.md
- `arete skill route "<query>"` - Route a user message to the best-matching skill (for agents; use before loading a skill)
- `arete route "<query>"` - Route to skill and suggest model tier (fast/balanced/powerful) in one call; `--json` for machine-readable output

### Skill and model routers

- **Skill router** (`src/core/skill-router.ts`): Maps a free-form user message to a skill id and path using skill descriptions and optional `triggers` in skill frontmatter. Used by `arete skill route` and `arete route`. Agents can run `arete skill route "prep me for Jane"` to get `meeting-prep` and then load that skill.
- **Model router** (`src/core/model-router.ts`): Suggests task complexity tier (fast / balanced / powerful) from prompt content—e.g. simple lookups → fast, analysis/planning/writing → powerful. Areté does not switch models programmatically (no Cursor/IDE API); the suggestion is for the user or for tooling that can set the model (Dex-style).

## How the System Operates (Production Flow)

This section describes how the Cursor agent should behave when a user asks for PM work in an Areté workspace: what gets loaded into context, how routing and skills fit in, and the top-to-bottom flow.

### What Is In Context by Default

When the user sends a message in Cursor (chat or composer), the agent typically has:

| Layer | What's included | Source |
|-------|-----------------|--------|
| **Rules** | pm-workspace.mdc (alwaysApply), arete-vision, testing, dev, etc. | `.cursor/rules/*.mdc` |
| **Architecture** | AGENTS.md (this file) | Root |
| **Workspace layout** | Open files, recent files; workspace is the Areté root | Cursor |
| **Tools** | read_file, grep, run_terminal_cmd, list_dir, etc. | Cursor |

The PM **Skills table** and **"Using skills"** / **"Skill router"** instructions live in **pm-workspace.mdc**. The agent does **not** automatically have the full text of every skill file in context until it loads one. So the flow is: recognize or resolve intent → load the right skill file → execute it.

### Flow: "Help me prep for my meeting with Jane"

1. **User message**  
   User says: *"Help me prep for my meeting with jane"* (or similar).

2. **Intent match**  
   Per pm-workspace: **default to the router**, then fall back to the table if no match.  
   - Agent runs: `arete skill route "help me prep for my meeting with jane"`  
   - Response (e.g. JSON or stdout): `skill: meeting-prep`, `path: ...`. Agent now knows which skill to run.  
   - If the router had returned no match, the agent would use the intent table in the rule to pick a skill or ask the user to clarify.

3. **Load the skill**  
   Agent **reads** the skill file:  
   `.cursor/skills/meeting-prep/SKILL.md` (or `.cursor/skills-core/meeting-prep/SKILL.md` in an installed workspace).  
   That file is now in context. It contains: Agent Instructions, When to Use, **Get Meeting Context** pattern (steps 1–6), Workflow (Identify meeting → Gather context → Build brief → Close), and output format.

4. **Execute the workflow**  
   - **Identify meeting**: Attendee = Jane → resolve to a person slug (e.g. search `people/` or use `people/index.md`; slug e.g. `jane-doe`).  
   - **Gather context** (get_meeting_context):  
     - Read `people/internal/jane-doe.md` (or the path for that slug).  
     - List/filter `resources/meetings/*.md` by `attendee_ids` or body containing Jane; read 1–3 most recent.  
     - Scan `projects/active/*/README.md` for Jane as stakeholder; read matching projects.  
     - Extract unchecked action items from those meetings (and person file if any).  
     - **QMD**: Run e.g. `qmd query "decisions or learnings involving Jane or Acme"`, `qmd query "meetings or notes about onboarding"` (if relevant); use results in the brief.  
   - **Build brief**: Emit markdown: Attendees, Recent meetings, Related projects, Open action items, Suggested talking points (and optional Related context from QMD).  
   - **Close**: Offer to save the brief; suggest process-meetings after the meeting.

5. **Response**  
   Agent replies with the prep brief. If the user asks *"What did you use?"*, the agent reports: **meeting-prep** skill, get_meeting_context pattern, reads of person/meeting/project files, and QMD queries.

**Context pulled in during execution** (not all in context at once): the chosen skill file; then, via tools, the specific person file(s), 1–3 meeting files, relevant project READMEs, and QMD result snippets. So context is **skill + workspace data the skill asks for**.

### Flow: "Help me analyze this data"

1. **User message**  
   User says: *"Help me analyze this data"* (and may attach or point to a file/selection).

2. **Intent match**  
   Default to the router; fall back to the table.  
   - Agent runs: `arete skill route "help me analyze this data"`. Router may return **synthesize** or no match.  
   - If no match: use the table ("Process my notes/feedback" → synthesize; "I need to understand a problem" → discovery) or ask for clarification.  

3. **Load the skill**  
   If the agent chose **synthesize**: read `.cursor/skills/synthesize/SKILL.md`. It specifies: inventory project `inputs/`, use QMD to search inputs, read and extract, pattern recognition, create synthesis document.

4. **Execute**  
   - Determine project: if user said "this data", check for an active project or attached file. Synthesize skill expects work inside a project’s `inputs/`. If there’s no project, agent may create one or ask which project.  
   - Follow the skill: inventory inputs, QMD search, read files, extract facts/interpretations/questions, find patterns, produce synthesis doc.  
   - If the agent chose **discovery** instead: load discovery skill and run its workflow (problem framing, research, validation).

5. **Response**  
   Agent delivers the synthesis (or discovery output). If asked what it used: **synthesize** (or discovery) skill, project inputs, QMD.

**Context pulled in**: the skill file; then project `inputs/` (and optionally `context/`, `.arete/memory/items/` via QMD). For ad-hoc "analyze this" with no skill match, the agent may just read the attached/referenced data and analyze it without a formal skill.

### Summary: What Should Be Included in Context

| When | What to include |
|------|------------------|
| **Always (from rules)** | pm-workspace.mdc (intent table, "Using skills", "Skill router"); AGENTS.md for architecture. |
| **After routing / intent** | The **single skill file** for the chosen skill (e.g. meeting-prep or synthesize). |
| **During skill execution** | Only what the skill asks for: specific person files, meeting files, project READMEs, QMD query results. Not the entire workspace. |
| **Optional first step** | Output of `arete skill route "<user message>"` or `arete route "<message>" --json` (skill id + path; and model tier if using route). |

So: **rules + chosen skill + data the skill fetches**. The agent should not dump the whole repo into context; it should follow the skill’s steps and pull only the files and search results needed for that workflow.

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

**Format**: Markdown with YAML frontmatter: `title`, `date`, `source`, `attendees`, `attendee_ids`, `company`, `pillar`. Body: summary, key points, action items, decisions, transcript.

**Integrations**: Fathom pulls meetings via `src/integrations/fathom/`

**Meeting Propagation**:
- Run the **process-meetings** skill to propagate meeting content into people and memory.
- Creates/updates person files (`people/internal/` or `people/customers/`) from attendees; writes `attendee_ids` to meeting frontmatter.
- Extracts decisions and learnings for inline review; appends approved items to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md`.
- Internal vs external classification: set `internal_email_domain` in `arete.yaml` (e.g. `"acme.com"`). Attendees whose email domain matches go to `people/internal/`; others to `people/customers/`.
- See People System for linking conventions (`attendee_ids`, stakeholders).

**Meeting Intelligence**:
- **meeting-prep** — Build a prep brief for an upcoming (or past) meeting: attendee details, recent meetings, related projects, open action items, suggested talking points. Uses get_meeting_context pattern (read people, meetings, projects; aggregate).
- **daily-plan** — Today's focus, week priorities, meeting context per meeting (who, what you owe, prep suggestions), commitments due, carry-over. User supplies today's meetings (no calendar in v1).
- Both skills use the **get_meeting_context** pattern: resolve attendees → read people → search meetings → read projects → extract action items.

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

**Update backfill**: `arete update` ensures missing workspace dirs and default files exist (single source of truth in `src/core/workspace-structure.ts`). Never overwrites existing files. Lets existing workspaces get new structure (e.g. `people/`) when features ship.

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

### 6. Planning System

**Purpose**: Quarter and weekly planning aligned to org strategy; plans live in `goals/` and `now/`.

**Storage**:
- Strategy: `goals/strategy.md` — org pillars, OKRs, strategic framework.
- Quarter goals: `goals/quarter.md` — 3–5 outcomes with success criteria and org pillar/OKR links.
- Week priorities: `now/week.md` — top 3–5 outcomes linked to quarter goals, commitments due, carried over.
- Daily focus: `now/today.md` — today's focus (populated by daily-plan).
- Archive: `goals/archive/` for alignment snapshots.

**Alignment**: Plans align to org strategy in `goals/strategy.md`. Use an alignment table (My goal → Org pillar/OKR) in quarter file and quarter-goal links in week file.

**Skills**:
- **quarter-plan** — Set quarter goals, link to org pillars/OKRs, write quarter file.
- **goals-alignment** — View and compare PM goals to org; optional snapshot to archive.
- **week-plan** — Set weekly priorities linked to quarter goals; write week file.
- **week-review** — Mark priorities done/partial/carried; brief quarter progress; optional session summary.
- **daily-plan** — Today's focus, week priorities, meeting context per meeting; user supplies today's meetings (see Meeting Intelligence in §1 Meetings System).

**Phase 2**: Full daily plans with structured day files; v1 outputs to chat.

### 7. Build/Development System

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

1. **Apply the product philosophy** in `.cursor/rules/arete-vision.mdc`: when defining or building features, ask whether they help the product builder achieve arete.
2. **Read this file first** for architecture understanding
3. **Check build memory** (`.cursor/build/MEMORY.md`) for recent changes
4. **Follow patterns** established in existing code
5. **Write tests** for all new functionality
6. **Update AGENTS.md** with new patterns or gotchas discovered
7. **Use TypeScript strictly** - no `any`, proper types

## Common Patterns

### Adding a PRD for Areté Features

1. Create `.cursor/build/prds/{feature-name}/` directory
2. Add `prd.md` (full PRD) and `README.md` (summary)
3. Do **not** put Areté feature PRDs in `projects/active/` — that is for PMs *using* Areté
4. Use prd-to-json skill with `.cursor/build/prds/{feature-name}/prd.md`

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

## Test Data (Development Only)

For local testing, `arete seed test-data` copies fixture data (meetings, people, plans, projects, memory) into the workspace. Requires the package to be linked (`npm link`) or installed with `--source symlink`; the `test-data/` directory is not published to npm. After seeding, `TEST-SCENARIOS.md` in the workspace root lists prompts for meeting-prep, daily-plan, process-meetings, and other flows.

## Additional Resources

- **Build Memory**: `.cursor/build/MEMORY.md` - Recent changes and decisions
- **Testing Guide**: `.cursor/rules/testing.mdc` - How to write tests
- **Dev Practices**: `.cursor/rules/dev.mdc` - Coding standards
- **README**: `README.md` - User-facing documentation
