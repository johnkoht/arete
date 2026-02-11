# Areté - Architecture & Context for AI Agents

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

## Context: BUILDER vs GUIDE

**Which mode are you in?** Check `agent_mode` in `arete.yaml` (or `AGENT_MODE` env). Source of truth: `.cursor/rules/arete-context.mdc` (Cursor) or `.claude/rules/` + `CLAUDE.md` (Claude Code).

- **BUILDER** (this repo): You are building Areté. Follow dev.mdc and testing.mdc. Put build memories in `dev/entries/` and MEMORY.md; PRDs in `dev/prds/`. Do not run `arete seed test-data` here.
- **GUIDE** (end-user workspace): You are helping the PM achieve arete. Use only product skills, skill router, and tools. Put user memories in `.arete/memory/items/`. Do not use build rules or `dev/`.

**Override**: Set `AGENT_MODE=BUILDER` or `AGENT_MODE=GUIDE` to force a mode (e.g. test GUIDE behavior in the repo). `arete route --json` includes `agent_mode` in the output.

## What Areté Is

Areté is a **product builder's operating system** — a Cursor-native workspace that manages product knowledge, provides intelligence services to any workflow, and creates a consistent interface between the messy reality of product work and the tools you use.

### Architecture Direction (Active)

Areté is evolving from a skill-centric workspace to a product intelligence platform. See `dev/prds/product-os/vision.md` for the full vision. Key concepts:

- **Five product primitives**: Problem, User, Solution, Market, Risk — the knowledge model the intelligence layer reasons about.
- **Intelligence layer** (Phase 3, implemented): Context injection, memory retrieval, entity resolution, briefing assembly — services in `src/core/` that make any skill or workflow dramatically more effective. CLI: `arete context`, `arete memory search`, `arete resolve`, `arete brief`.
- **Skills as methods**: Areté ships opinionated default skills but users can swap them. The value is the intelligence underneath, not the procedures on top.
- **Workspace restructure** (Phases 0-2, complete): `now/` (daily focus), `goals/` (elevated), `.arete/memory/` (system-managed), project templates by work type, skill interface contract with extended frontmatter.

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
- `arete install [directory] --ide cursor|claude` - Initialize workspace (default: cursor)
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

### Skill management

- **Skills**: All skills live in `.agents/skills/` (last-in-wins; single location). Shipped with the package and copied on `arete install`.
- **Role defaults** (`skills.defaults` in arete.yaml): Maps a *role* (default skill name, e.g. `create-prd`) to a *preferred skill* (e.g. `netflix-prd`). After the router matches a skill, the command layer applies this mapping and returns the preferred skill’s path (and `resolvedFrom` when a preference was applied). Commands: `arete skill defaults`, `arete skill set-default <skill> --for <role>`, `arete skill unset-default <role>`.
- **Install**: `arete skill install <source>` — if source looks like `owner/repo`, runs `npx skills add <source>` (skills.sh); if source is a local path, copies the skill into `.agents/skills/<name>/`. After install, Areté generates a `.arete-meta.yaml` sidecar (category: community, requires_briefing: true, best-guess work_type/primitives) and may prompt to set the skill as default for an overlapping role.
- **Sidecar metadata** (`.arete-meta.yaml`): For third-party skills that lack Areté’s extended frontmatter, the sidecar supplies category, requires_briefing, work_type, primitives, triggers, etc. `getSkillInfo()` in `src/commands/skill.ts` reads the sidecar and merges it into skill info so the router and list get correct metadata. Users can edit the sidecar without touching SKILL.md.
- **Docs**: `.agents/skills/README.md` (shipped in package as `dist/skills/README.md`) describes what skills are and how to install and set role defaults.

## How the System Operates (Production Flow)

This section describes how the Cursor agent should behave when a user asks for PM work in an Areté workspace: what gets loaded into context, how routing and skills fit in, and the top-to-bottom flow.

### What Is In Context by Default

When the user sends a message in Cursor (chat or composer), the agent typically has:

| Layer | What's included | Source |
|-------|-----------------|--------|
| **Rules** | pm-workspace (alwaysApply), arete-vision, etc. | `.cursor/rules/*.mdc` (Cursor) or `.claude/rules/*.md` + `CLAUDE.md` (Claude) |
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
   `.agents/skills/meeting-prep/SKILL.md`.  
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
   If the agent chose **synthesize**: read `.agents/skills/synthesize/SKILL.md`. It specifies: inventory project `inputs/`, use QMD to search inputs, read and extract, pattern recognition, create synthesis document.

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
- `dev/` = Internal tooling for developing Areté (NEVER shipped; formerly the build directory)
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

**Config**: `arete.yaml` (global + workspace-specific). Includes `ide_target: 'cursor' | 'claude'` — drives which adapter is used for rules and root files (`.cursor/` vs `.claude/`, `CLAUDE.md`).

### 4. Skills System

**Location**: `.agents/skills/{name}/SKILL.md`

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

### 7. Intelligence Services (Phase 3)

**Purpose**: Provide intelligence capabilities that make any skill or workflow dramatically more effective. The agent (Cursor's AI) is the runtime — these services are TypeScript modules callable from CLI or referenced by agent rules.

**Location**: `src/core/` (code) + `.cursor/rules/pm-workspace.mdc` (agent instructions)

**Services**:

| Service | Module | CLI | Purpose |
|---------|--------|-----|---------|
| Context Injection | `src/core/context-injection.ts` | `arete context --for "query"` | Map primitives to workspace files, assemble ContextBundle with gaps |
| Memory Retrieval | `src/core/memory-retrieval.ts` | `arete memory search "query"` | Token-based search across .arete/memory/ items |
| Entity Resolution | `src/core/entity-resolution.ts` | `arete resolve "reference"` | Fuzzy resolve names to people, meetings, projects |
| Briefing Assembly | `src/core/briefing.ts` | `arete brief --for "query"` | Combine all services into primitive briefing |
| Skill Router (enhanced) | `src/core/skill-router.ts` | `arete skill route "query"` | Route with primitives, work_type, category metadata |

**Types**: All intelligence types in `src/types.ts`: `ProductPrimitive`, `ContextBundle`, `MemoryResult`, `ResolvedEntity`, `ExtendedSkillCandidate`, etc.

**Adapter Pattern**: Before community/third-party skills (or any with `requires_briefing: true`), the agent runs `arete brief` to assemble context. After skill execution, outputs feed back into the workspace. See `dev/prds/product-os/skill-interface.md` for the full contract.

### 8. Build/Development System

**Location**: `dev/` (NEVER shipped to users)

**Autonomous Loop**: `dev/autonomous/`
- Converts PRDs to JSON task lists
- Spawns Task subagents per task
- Runs tests, commits on success
- Used ONLY for developing Areté itself

**Build Memory**: `dev/MEMORY.md` and `dev/entries/`
- Documents architectural changes
- Tracks tooling decisions
- Used by Areté maintainers

### 9. Search Provider System

**Purpose**: Provide swappable search backends for memory retrieval, context injection, and skills. Supports semantic search (via QMD) with graceful fallback to token-based search.

**Location**: `src/core/search.ts` (interface + factory) + `src/core/search-providers/` (implementations)

**Interface**: `SearchProvider`
```typescript
interface SearchProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
```

**Methods**:
- `isAvailable()` — Returns true if the provider can be used (e.g. QMD installed and collection configured)
- `search()` — Keyword search (fast, literal matching)
- `semanticSearch()` — Semantic/vector search (conceptual matching, slower, requires embeddings)

**Result**: `SearchResult[]` with `path`, `content`, `score` (0-1), and `matchType` ('keyword' | 'semantic' | 'hybrid')

**Providers**:

| Provider | Module | When Used | Availability |
|----------|--------|-----------|--------------|
| QmdSearchProvider | `src/core/search-providers/qmd.ts` | When QMD is installed and configured | Checks for `qmd` command and collection |
| FallbackSearchProvider | `src/core/search-providers/fallback.ts` | Always (token-based search) | Always available |

**Factory**: `getSearchProvider(workspaceRoot, config)` in `src/core/search.ts`
- Returns QMD provider if available
- Falls back to token-based provider if QMD not installed or no collection found
- Logs which provider is in use (for debugging)

**Usage**: All intelligence services (memory retrieval, context injection, briefing) use the factory to get a provider. Skills and agent rules do not call providers directly — they use CLI commands (`arete memory search`, `arete context`, `arete brief`) which internally use the provider system.

**Adding a new provider**:
1. Create `src/core/search-providers/{name}.ts` implementing `SearchProvider`
2. Add factory logic in `getSearchProvider()` to return your provider when conditions are met
3. Update this section with provider details

**See also**: Intelligence Services (§7) for services that use search providers

### 10. Calendar System

**Purpose**: Provide calendar integration for daily planning and meeting intelligence. Currently supports macOS Calendar via ical-buddy; designed to support Google Calendar, Microsoft Graph, and other providers.

**Location**: `src/core/calendar.ts` (interface + factory) + `src/core/calendar-providers/` (implementations)

**Interface**: `CalendarProvider`
```typescript
interface CalendarProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]>;
  getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]>;
}

interface CalendarEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  calendar: string;
  location?: string;
  attendees: CalendarAttendee[];
  notes?: string;
  isAllDay: boolean;
}
```

**Methods**:
- `isAvailable()` — Returns true if the provider can be used (e.g. ical-buddy installed on macOS)
- `getTodayEvents()` — Fetch today's events, optionally filtered by calendar names
- `getUpcomingEvents(days)` — Fetch events for the next N days

**Options**: `CalendarOptions`
- `calendars?: string[]` — Filter to specific calendar names (if omitted, all calendars included)

**Providers**:

| Provider | Module | When Used | Platform |
|----------|--------|-----------|----------|
| IcalBuddyProvider | `src/core/calendar-providers/ical-buddy.ts` | macOS with ical-buddy installed | macOS only |
| (Future) GoogleCalendarProvider | — | OAuth-authenticated Google account | Cross-platform |
| (Future) MSGraphProvider | — | OAuth-authenticated Microsoft 365 account | Cross-platform |

**Factory**: `getCalendarProvider(config)` in `src/core/calendar.ts`
- Returns ical-buddy provider if on macOS and command is available
- Returns null if no provider available (calendar features disabled)

**Configuration**: `integrations.calendar` in `arete.yaml`
```yaml
integrations:
  calendar:
    provider: ical-buddy
    calendars:
      - Work
      - Personal
```

**CLI Commands**:
- `arete integration configure calendar` — Interactive setup (select calendars to include)
- `arete pull calendar --today` — Fetch today's events and display
- `arete pull calendar --days 7` — Fetch next 7 days of events

**Person Matching**: The calendar system matches event attendees to workspace people by email. When an attendee email matches a person file (`people/internal/` or `people/customers/`), the CLI output shows the person's slug and file path for easy context lookup.

**Integration with Skills**: The **daily-plan** skill uses `arete pull calendar --today --json` to fetch today's events, then builds context for each meeting using the **get_meeting_context** pattern (see Meetings System §1).

**Adding a new provider**:
1. Create `src/core/calendar-providers/{name}.ts` implementing `CalendarProvider`
2. Add factory logic in `getCalendarProvider()` to detect and return your provider
3. Add integration entry to `src/integrations/registry.ts` with `implements: ['calendar']`
4. Update this section with provider details

**See also**: 
- Meetings System (§1) for meeting intelligence and get_meeting_context pattern
- Planning System (§6) for daily-plan skill
- Integrations System (§2) for registry and CLI commands

### 11. Autonomous PRD Execution

**Purpose**: Systematic execution of multi-task PRDs using an orchestrator + subagent pattern. Enables autonomous development with pre-mortem risk mitigation, detailed prompts, and continuous verification.

**Location**: `dev/skills/execute-prd/SKILL.md` (orchestration skill) + `dev/agents/prd-task.md` (subagent instructions)

**Status**: Production-ready. First execution (intelligence-and-calendar PRD) achieved 100% success: 12/12 tasks complete, 0 iterations required, 0/8 pre-mortem risks materialized.

#### Pattern Overview

The system uses a two-layer architecture:

1. **Orchestrator** (primary agent)
   - Reads PRD and identifies dependencies
   - Conducts mandatory pre-mortem (8 risk categories)
   - Crafts detailed prompts for each task
   - Spawns subagents sequentially
   - Reviews code and runs full test suite
   - Tracks progress in `prd.json` and `progress.txt`

2. **Subagents** (task executors)
   - Receive focused context (specific files to read)
   - Follow explicit patterns (reference examples, not abstractions)
   - Implement with tests
   - Run typecheck + full test suite
   - Commit with conventional commits
   - Update tracking files autonomously

**Key insight**: The orchestrator doesn't just delegate—it provides **show-don't-tell guidance** by referencing specific example files that demonstrate the pattern.

#### When to Use

Use autonomous PRD execution for:

| Work Type | Why | Example |
|-----------|-----|---------|
| **Multi-task PRDs** | 3+ dependent tasks benefit from systematic execution | Intelligence services (12 tasks with A→B→C dependencies) |
| **Complex refactors** | High risk of integration issues; pre-mortem + verification critical | Migration from one pattern to another across multiple files |
| **New systems** | Need consistent patterns across components | New integration (client, types, save, tests, CLI) |

**Do not use** for:
- Single-task changes (overhead not justified)
- Exploratory work (requirements unclear)
- Work requiring human judgment at each step

#### Plan Mode and PRD Gateway

When the user creates a plan in **Plan Mode** (Cursor's plan-before-execute flow), the agent may offer the PRD path instead of executing the plan directly.

**Flow**:
1. User creates plan in Plan Mode
2. Agent finishes plan draft
3. **Scope check**: Plan has 3+ steps, or mentions new system/integration/large refactor, or touches multiple components?
4. **If yes** → Offer: "Convert to PRD" or "Proceed with plan"
5. **Convert to PRD** → Load `dev/skills/plan-to-prd/SKILL.md`: create PRD, run prd-to-json, write `dev/prds/{feature-name}/EXECUTE.md` handoff
6. **Proceed with plan** → Run pre-mortem, execute plan directly

**Plan-to-PRD skill** (`dev/skills/plan-to-prd/SKILL.md`):
- Converts the approved plan into `dev/prds/{feature-name}/prd.md`
- Runs prd-to-json to produce `dev/autonomous/prd.json`
- Creates `dev/prds/{feature-name}/EXECUTE.md` with a prompt to paste into a new chat
- User starts new chat, pastes prompt → agent loads execute-prd and runs full workflow

**Rule**: `plan-pre-mortem.mdc` defines the scope check and PRD offer. See also `dev.mdc` for Plan → PRD path guidance.

#### Key Success Factors

The intelligence-and-calendar PRD execution identified these critical practices:

##### 1. Show, Don't Tell
**Anti-pattern**: "Use good mocking patterns"  
**Pattern**: "Follow the `testDeps` pattern from `test/integrations/qmd.test.ts` lines 12-18"

Every prompt includes:
- **Context files to read**: "Read these files first: 1. search.ts (search provider interface), 2. qmd.ts (QMD implementation example), 3. types.ts (type definitions)"
- **Pattern references**: Specific file + line ranges demonstrating the desired approach
- **Implementation notes**: Concrete guidance, not abstractions

##### 2. Mandatory Pre-Mortem
**Process**: Before starting, identify risks across 8 categories and define actionable mitigations.

| Risk Category | Example from First Execution |
|---------------|------------------------------|
| Fresh context | Subagents won't know dependencies → List exact files to read in every prompt |
| Test patterns | New tests might not follow testDeps → Reference qmd.test.ts explicitly |
| Integration | B2 changes might break callers → Run full test suite (not just new tests) |
| Backward compatibility | CLI changes could break scripts → Verify existing commands still work |

**Result**: 0/8 risks materialized because mitigations were applied proactively.

##### 3. Sequential Execution with Full Verification
**Approach**: Execute tasks in dependency order (A1→A2→A3→B1→B2→B3), not parallel.

**After each task**:
- Code review against 6-point checklist (`.js` imports, no `any`, error handling, tests, backward compatibility, patterns)
- Run `npm run typecheck` (must pass)
- Run `npm test` (full suite, not just new tests)
- Verify integration with prior work

**Benefit**: Each subagent inherits clean, tested work. TypeScript compiler guides propagation (e.g., when B2 made `getRelevantContext()` async, subagent automatically updated callers).

##### 4. Explicit Autonomy Permission
**Problem**: Initial attempts required "babysitting"—agent asked permission for file writes, commits, progress updates.

**Solution**: Added explicit "Autonomous Execution Rules" to both execute-prd and prd-task:
> "DO NOT ask for permission to write files, make commits, or proceed. The user expects true autonomy: start the work, execute completely, report when done."

**Insight**: Agents need explicit permission to NOT ask for permission. Counter-intuitive but critical for "start and take a nap" autonomy.

#### execute-prd Skill Workflow

**Phase 0: Understand**
1. Read PRD (`dev/prds/{feature-name}/prd.md`)
2. Check `prd.json` for completed tasks
3. Map task dependencies (which tasks must complete before others)

**Phase 1: Pre-Mortem** (Mandatory)
1. Identify risks across 8 categories: fresh context, test patterns, integration issues, backward compatibility, scope drift, naming collisions, documentation, performance
2. Define specific, actionable mitigations for each risk
3. Present to user: "Here are 8 risks I identified. Proceed with these mitigations?"
4. User approves or refines

**Phase 2: Execute** (Loop until all tasks complete)
1. **Prep context**: Read related source files, tests, types
2. **Craft prompt**: Include task details, acceptance criteria, files to read, pattern references, pre-mortem mitigations
3. **Spawn subagent**: Use Task tool with `generalPurpose` (or `prd-task` when available)
4. **Review code**: Apply 6-point checklist
5. **Verify**: Run typecheck + full test suite
6. **Iterate or accept**: If acceptance criteria met and tests pass → accept; else → iterate with specific feedback
7. **Track**: Update `prd.json` (mark complete) and `progress.txt` (commit SHA, timestamp)

**Phase 3: Post-Mortem**
1. Analyze: Which risks materialized? Which mitigations worked?
2. Extract learnings: Collaboration patterns, system improvements, prompt templates
3. Update build memory: Create entry in `dev/entries/YYYY-MM-DD_{feature-name}-learnings.md`
4. Add line to `dev/MEMORY.md`

#### Metrics from First Execution

**PRD**: intelligence-and-calendar (12 tasks)  
**Date**: 2026-02-09  
**Orchestrator**: execute-prd skill (first production use)

| Metric | Result |
|--------|--------|
| Tasks completed | 12/12 (100%) |
| Success rate (first attempt) | 12/12 (100%) - zero iterations |
| Pre-mortem risks identified | 8 |
| Pre-mortem risks that materialized | 0/8 (0%) |
| Tests added | 67 new tests |
| Test pass rate | 314/314 (100%) |
| Context used | 95K/1M tokens (9.5% of budget) |
| Commits | 12 (one per task) |

**Key outcome**: Autonomous execution is not only feasible but highly effective when pre-mortem + show-don't-tell prompts are applied systematically.

#### References

**Skills**:
- `dev/skills/execute-prd/SKILL.md` — Full orchestration workflow
- `dev/skills/prd-post-mortem/SKILL.md` — Systematic post-mortem after PRD completion (metrics, pre-mortem review, memory entry)
- `dev/skills/synthesize-collaboration-profile/SKILL.md` — Update `dev/collaboration.md` from entries' Learnings/Corrections; run after post-mortem or when several entries have learnings (see agent-memory.mdc)
- `dev/agents/prd-task.md` — Subagent instructions (for Task tool)

**Memory**:
- `dev/entries/2026-02-09_builder-orchestration-learnings.md` — Detailed post-mortem from first execution
- `dev/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md` — Formalization of patterns

**Templates**:
- `dev/templates/PRE-MORTEM-TEMPLATE.md` — Standalone pre-mortem template for ad-hoc use

**See also**:
- Build/Development System (§8) for context on `dev/` structure
- Testing Guide (`.cursor/rules/testing.mdc`) for test requirements referenced in verification

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
2. **Read this file first** for architecture understanding.
3. **Leverage build memory before acting** (see `.cursor/rules/agent-memory.mdc` § Leverage build memory):
   - At start of substantive work: read **`dev/collaboration.md`** (patterns, preferences, Corrections) and scan **`dev/MEMORY.md`** for relevant entries.
   - Before adding backlog, running seed, placing PRDs, or starting PRD/plan execution: read the related entry or collaboration.md so you don’t repeat past mistakes.
4. **Follow patterns** established in existing code
5. **Write tests** for all new functionality
6. **Update AGENTS.md** with new patterns or gotchas discovered
7. **Use TypeScript strictly** - no `any`, proper types
8. **Consider documentation impact** - When planning features or refactors, run the documentation checklist before finalizing

### Documentation Planning Checklist

When creating plans that touch code/features/structure, ask: **"Does this need doc updates?"**

**Scope Check:**
- [ ] All root docs: README, SETUP, AGENTS, ONBOARDING, scratchpad
- [ ] Backlog items: `grep -l "update.*\.md\|docs" dev/backlog/*/*.md`

**Search Strategy:**
- [ ] Feature keywords: `rg "keyword1|keyword2" -g "*.md"`
- [ ] Concept audit: If feature changes paths/structure (e.g. `.cursor/` → `.agents/`), grep old paths in all `.md` files
- [ ] Related workflows: Check files that reference setup, install, or getting started

**Verification:**
- [ ] Re-read any backlog items found in scope check for explicit doc requirements
- [ ] List all affected files BEFORE drafting plan; don't assume scope

**Anti-pattern:** Do not assume "documentation" = README + SETUP + AGENTS. ONBOARDING, scratchpad, and backlog frequently need updates.

## Common Patterns

### Adding a PRD for Areté Features

1. Create `dev/prds/{feature-name}/` directory
2. Add `prd.md` (full PRD) and `README.md` (summary)
3. Do **not** put Areté feature PRDs in `projects/active/` — that is for PMs *using* Areté
4. Use prd-to-json skill with `dev/prds/{feature-name}/prd.md`

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

1. Create `runtime/skills/{name}/SKILL.md` (in repo; shipped as dist/skills)
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

### 12. Multi-IDE Support Architecture

**Purpose**: Abstract IDE-specific behavior so Areté can produce IDE-specific output for multiple IDEs from a single canonical workspace.

**Location**: `src/core/ide-adapter.ts` (interface) + `src/core/adapters/` (implementations)

**Interface**: `IDEAdapter`
```typescript
interface IDEAdapter {
  readonly target: IDETarget; // 'cursor' | 'claude'
  readonly configDirName: string; // '.cursor' | '.claude'
  readonly ruleExtension: string; // '.mdc' | '.md'
  getIDEDirs(): string[]; // IDE-specific directories to create
  rulesDir(): string; // Relative path to rules directory
  toolsDir(): string; // Relative path to tools directory
  integrationsDir(): string; // Relative path to integrations directory
  formatRule(rule: CanonicalRule, config: AreteConfig): string; // Format to IDE-specific rule format
  transformRuleContent(content: string): string; // Transform paths (.cursor/ → .claude/)
  generateRootFiles(config: AreteConfig, workspaceRoot: string): Record<string, string>; // Generate IDE root files
  detectInWorkspace(workspaceRoot: string): boolean; // Check if IDE dir exists
}
```

**Implementations**:
- **CursorAdapter** (`src/core/adapters/cursor-adapter.ts`) — Preserves current behavior: `.cursor/`, `.mdc` files, no path transforms, no root file generation
- **ClaudeAdapter** (`src/core/adapters/claude-adapter.ts`) — Claude Code support: `.claude/`, `.md` files, path transforms (`.cursor/` → `.claude/`), generates `CLAUDE.md` with mandatory routing workflow

**Transpilation System** (`src/core/rule-transpiler.ts`):
- `parseRule()` — Reads canonical `.mdc` with YAML frontmatter
- `transpileRule()` — Converts to target IDE format via adapter
- `transpileRules()` — Batch processes all product rules from allowList

**Detection Priority**:
1. `arete.yaml` → `ide_target` field (explicit config)
2. Detected from workspace (`.cursor/` or `.claude/` exists)
3. Default: `cursor` (backward compatibility)

**CLI Integration**:
- `arete install --ide cursor|claude` — Creates IDE-specific workspace
- `arete update` — Regenerates rules and root files for configured IDE
- `arete status` — Shows IDE target, warns when both `.cursor/` and `.claude/` exist without explicit config

**Adding a New IDE**:
1. Create `src/core/adapters/{name}-adapter.ts` implementing `IDEAdapter`
2. Add to `IDETarget` union type in `src/core/ide-adapter.ts`
3. Add case to `getAdapter()` in `src/core/adapters/index.ts`
4. Write tests in `test/core/adapters/{name}-adapter.test.ts`
5. No changes needed to core workspace or command logic

**Key Design Decisions**:
- Rules are always transpiled from canonical source (never edited in-place)
- Transpiled files include auto-generated header warning users
- IDE-specific behavior fully isolated in adapters
- Backward compatibility maintained (Cursor workspaces work identically)

## Additional Resources

- **Build Memory**: `dev/MEMORY.md` - Recent changes and decisions
- **Testing Guide**: `.cursor/rules/testing.mdc` - How to write tests
- **Dev Practices**: `.cursor/rules/dev.mdc` - Coding standards
- **README**: `README.md` - User-facing documentation
