# Areté User Guide

> **Complete reference** for product builders using Areté

This guide covers everything you need to know to use Areté effectively. For installation and integration setup, see [SETUP.md](SETUP.md) in the repository.

---

## Table of Contents

- [Overview](#overview)
- [Workspace Structure](#workspace-structure)
- [Getting Started](#getting-started)
- [Daily Workflows](#daily-workflows)
- [Skills Reference](#skills-reference)
- [Tools Reference](#tools-reference)
- [Intelligence Services](#intelligence-services)
- [Templates & Customization](#templates--customization)
- [CLI Reference](#cli-reference)
- [Integrations](#integrations)
- [Advanced Topics](#advanced-topics)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What Areté Does

Areté is an AI-native workspace for product managers that helps you:

- **Maintain context** - Keep business, product, and customer knowledge organized and accessible
- **Work structured** - Run PM workflows (discovery, PRDs, analysis) with consistent quality
- **Build institutional memory** - Capture decisions and learnings that persist beyond individual projects
- **Move faster** - Intelligence services provide relevant context automatically

### Core Concepts

**Context** - Your source of truth for business, users, products, and strategy. Lives in `context/` directory.

**Projects** - Bounded PM work (discovery, PRD, analysis, roadmap). Lives in `projects/active/` while in progress, `projects/archive/` when done.

**Memory** - Decisions and learnings captured from your work. System-managed in `.arete/memory/`.

**Skills** - Reusable workflows you invoke (discovery, PRD creation, meeting prep). Stateless procedures.

**Tools** - Lifecycle-based capabilities with phases and progress tracking (onboarding, seed context). Stateful.

**Intelligence** - Services that inject context, search memory, resolve entities, and assemble briefings automatically.

---

## Workspace Structure

### Directory Layout

```
your-workspace/
├── now/                     # Current focus (start here)
│   ├── scratchpad.md        # Quick capture, parking lot
│   ├── week.md              # This week's priorities
│   ├── today.md             # Today's focus
│   └── agendas/             # Meeting agendas

├── goals/                   # Strategy and goals
│   ├── strategy.md          # Org strategy, OKRs, pillars
│   ├── quarter.md           # Current quarter goals
│   ├── initiatives.md       # Strategic bets
│   └── archive/             # Alignment snapshots

├── context/                 # Core context (source of truth)
│   ├── business-overview.md
│   ├── business-model.md
│   ├── competitive-landscape.md
│   ├── products-services.md
│   ├── users-personas.md
│   └── _history/            # Archived context versions

├── projects/                # Project workspaces
│   ├── active/              # Currently in progress
│   └── archive/             # Completed projects

├── resources/               # Raw inputs
│   ├── meetings/            # Meeting notes and transcripts
│   └── notes/               # Standalone notes

├── .arete/                  # System-managed (don't edit directly)
│   ├── memory/              # Institutional knowledge
│   │   ├── items/           # Atomic facts (decisions, learnings)
│   │   └── summaries/       # Synthesized context
│   └── activity/            # Activity log

├── people/                  # People tracking
│   ├── internal/            # Colleagues
│   ├── customers/           # External stakeholders
│   └── users/               # Product users

├── templates/               # Your template customization space (see templates/README.md)
│   └── inputs/              # Integration-driven templates (meeting imports)

├── .agents/skills/          # PM workflows (discovery, PRD, etc.)
├── .cursor/ or .claude/     # IDE config (depends on install)
└── GUIDE.md                 # This file
```

### What to Edit vs What's System-Managed

**Edit freely:**
- `now/` - Your current focus
- `goals/` - Your goals and strategy
- `context/` - Your business context
- `projects/` - Your project work
- `resources/` - Your meetings and notes
- `people/` - People details
- `templates/` - Your templates

**System-managed** (don't edit directly):
- `.arete/memory/` - Updated by skills (process-meetings, finalize-project)
- `.arete/activity/` - Automatically tracked

### IDE-Specific Paths

Areté supports Cursor and Claude Code. Your IDE choice determines which directories exist:

| IDE | Config Directory | Rules Extension |
|-----|------------------|-----------------|
| Cursor | `.cursor/` | `.mdc` |
| Claude Code | `.claude/` | `.md` |

Skills live in `.agents/skills/` for both IDEs (shared).

---

## Getting Started

### First 15 Minutes

1. **Set up your profile** *(if you haven't already)*
   - Run `arete onboard` in your terminal
   - Collects your name, email, and company — bootstraps `context/profile.md`

2. **Connect integrations** *(optional but recommended)*
   - Run `arete onboard` to configure calendar, Fathom, or other sources
   - Enables meeting-prep and context-pull features from day one

3. **Start guided onboarding in chat**
   - Say **"Let's get started"** to your AI assistant
   - The `getting-started` skill walks you through a 15–30 min guided setup:
     - Imports existing docs, notes, or a company website URL
     - Bootstraps your core context files (`business-overview`, `users-personas`, `goals`)
     - Connects integrations if not done yet
     - Ends with your first valuable skill use (meeting-prep, week-plan, etc.)

4. **Take a tour** *(optional)*
   - Ask: "Give me a tour" or "How does this workspace work?"
   - The `workspace-tour` skill orients you to what's available

---

## Daily Workflows

### Planning Your Time

**Daily Focus** - `daily-plan` skill
```
User: "What's on my plate today?"
```
- Shows today's focus from `now/today.md`
- Lists week priorities from `now/week.md`
- Provides context for each meeting (who, recent history, prep suggestions)
- Shows commitments due
- Suggests carry-overs from yesterday

**Week Planning** - `week-plan` skill
```
User: "Plan my week"
```
- Set 3-5 weekly priorities
- Link to quarter goals
- List commitments due this week
- Identify high-prep meetings
- Output to `now/week.md`

**Quarter Planning** - `quarter-plan` skill
```
User: "Set my quarter goals"
```
- Define 3-5 quarter outcomes
- Link to org pillars/OKRs from `goals/strategy.md`
- Set success criteria
- Output to `goals/quarter.md`

**Goals Alignment** - `goals-alignment` skill
```
User: "Show my goal alignment"
```
- Compare your goals (`goals/quarter.md`) to org strategy
- Optional: Snapshot to `goals/archive/` for record

### Meeting Intelligence

**Prep for a Meeting** - `meeting-prep` skill
```
User: "Prep for my meeting with Jane tomorrow"
```
- Builds a prep brief (not an agenda document)
- Shows attendee details (from `people/`)
- Recent meetings with attendees
- Related projects
- Open action items
- Suggested talking points

**Create Meeting Agenda** - `prepare-meeting-agenda` skill
```
User: "Create a meeting agenda for my leadership sync"
```
- Creates a structured agenda document with sections
- Infers meeting type or lets you choose (leadership, customer, dev-team, 1:1, other)
- Loads template from defaults or custom templates
- Optionally gathers context to suggest agenda items
- Saves to `now/agendas/` or project folder

**Capture a Conversation** - `capture-conversation` skill
```
User: "Capture this conversation" (with Slack/Teams/email text pasted)
```
- Parses pasted text (timestamped, structured, or raw — auto-detected)
- Extracts insights via LLM: summary, decisions, action items, open questions, stakeholders, risks
- Presents for conversational review before saving
- Saves to `resources/conversations/` — discoverable via `arete context`

**Save a Meeting** - `save-meeting` skill
```
User: "Save this meeting" (with notes pasted or in context)
```
- Creates structured meeting file in `resources/meetings/`
- Extracts: title, date, attendees, summary, key points, action items, decisions
- Updates meetings index
- Next step: Run `process-meetings` to propagate

**Process Meetings** - `process-meetings` skill
```
User: "Process my meetings"
```
- Creates/updates person files in `people/` from attendees
- Extracts decisions and learnings for inline review
- Appends approved items to `.arete/memory/items/`
- Writes `attendee_ids` to meeting frontmatter for linking

### Project Work

**Starting Projects**

**Discovery** - `discovery` skill
```
User: "Start a discovery project for improving onboarding"
```
- Creates project in `projects/active/{name}-discovery/`
- Discovery questions (problem, users, current state, success)
- Research plan
- Synthesis of findings
- Optional: Finalize to archive and update context

**Create PRD** - `create-prd` skill
```
User: "Create a PRD for checkout redesign"
```
- Creates project in `projects/active/{name}-prd/`
- Discovery questions about the feature
- Template selection (simple, regular, full)
- Context integration (reads `context/`, queries QMD)
- Optional light pre-mortem
- Outputs PRD to `outputs/`

**Competitive Analysis** - `competitive-analysis` skill
```
User: "Analyze Notion, Linear, and Asana"
```
- Creates project in `projects/active/{topic}-competitive-analysis/`
- Research framework for each competitor
- Synthesis of patterns and opportunities
- Output to `outputs/`

**Construct Roadmap** - `construct-roadmap` skill
```
User: "Build roadmap for Q2 2026"
```
- Creates project in `projects/active/{name}-roadmap/`
- Prioritization framework
- Feature breakdown
- Timeline and dependencies
- Output to `outputs/`

**Working in Projects**

**Synthesize** - `synthesize` skill
```
User: "Synthesize what we've learned"
```
- Reviews inputs in current project
- Extracts themes, insights, contradictions
- Creates synthesis document
- Updates project README

**Finalize Project** - `finalize-project` skill
```
User: "Finalize this project"
```
- Reviews outputs
- Promotes context updates (if any)
- Extracts decisions and learnings for memory
- Archives project to `projects/archive/`

---

## Skills Reference

### What Skills Are

Skills are reusable workflows that help you (and your AI) get things done—discovery, PRDs, meeting prep, synthesis, planning, and more. Each skill is a procedure (steps, patterns, and output format) that the agent follows when you ask for that kind of work.

### Default Skills

Areté ships with default skills for core PM workflows. They live in `.agents/skills/` after install.

| Area | Skills |
|------|--------|
| **Setup** | getting-started, rapid-context-dump |
| **Planning** | quarter-plan, week-plan, week-review, daily-plan, goals-alignment |
| **Discovery & Definition** | discovery, create-prd, competitive-analysis, construct-roadmap |
| **Execution** | capture-conversation, meeting-prep, prepare-meeting-agenda, save-meeting, process-meetings, sync, synthesize |
| **Intelligence** | people-intelligence |
| **Operations** | finalize-project, periodic-review, workspace-tour, generate-prototype-prompt |

Run `arete skill list` to see all available skills.

### Customizing Skills

**Customize a skill** (make your own version):

1. Edit files directly in `.agents/skills/<name>/`
2. Protect your changes by adding to `arete.yaml`:
   ```yaml
   skills:
     overrides:
       - daily-plan
       - create-prd
   ```
3. Run `arete update` safely — your customized skills are preserved

**Important**:
- `skills.defaults` (from `arete skill set-default ... --for <role>`) changes routing preference only.
- It does **not** freeze native skill files.
- `arete update` still refreshes native core skills unless they are listed in `skills.overrides`.

**Reset to default**:
1. Remove the skill name from `skills.overrides` in `arete.yaml`
2. Delete the skill folder: `rm -rf .agents/skills/<name>`
3. Run `arete update` to restore the default version

**Track your changes**:
- Use `git diff` if your workspace is version controlled
- Or keep a backup in `.agents/skills/<name>.backup/` before editing

### Installing Third-Party Skills

From [skills.sh](https://skills.sh/) ecosystem or local path:

```bash
# From skills.sh (owner/repo)
arete skill install owner/repo

# From a local folder containing SKILL.md
arete skill install ./path/to/skill
```

Areté adds `.arete-meta.yaml` for routing and briefing. Edit it to add triggers, change `work_type`, or set `requires_briefing`.

### Setting Role Defaults

When a query matches a role (e.g., "create a PRD" → `create-prd`), you can use a different skill for that role:

> Note: Role defaults affect routing preference only. They do not protect native skill files from `arete update`. To preserve local edits to a native skill, add it to `skills.overrides`.

```bash
# Use this skill whenever "create-prd" role is matched
arete skill set-default my-prd-skill --for create-prd

# View current defaults
arete skill defaults

# Restore Areté default
arete skill unset-default create-prd
```

### Creating Your Own Skills

1. Create folder: `.agents/skills/my-skill/`
2. Add `SKILL.md` with standard skill format (see [Agent Skills](https://agentskills.io))
3. Optionally add `.arete-meta.yaml` with category, work_type, primitives

Run `arete skill list` to confirm it appears.

---

## Tools Reference

### What Tools Are

Tools are **lifecycle-based, stateful capabilities** that complement Skills. While Skills are stateless procedures you invoke anytime, Tools have phases, track progress, and eventually complete.

**Skills** - Stateless, always available, invoke anytime (discovery, PRD, meeting prep)
**Tools** - Stateful, lifecycle-bound, activate → progress → complete (onboarding, product launch)

**Use a Skill when**: You need a repeatable workflow
**Use a Tool when**: You need sustained support over time with progress tracking

### Available Tools

| Tool | Purpose | Lifecycle |
|------|---------|-----------|
| **onboarding** | 30/60/90 day new job success plan | 90-150 days |
| **seed-context** | Bootstrap workspace from historical data | One-time |

### Using a Tool

Tools are discoverable via routing. Just describe what you want:

- "I'm starting a new job"
- "Help me onboard at my new role"
- "Seed my context from Fathom"
- "Import my meeting history"

The assistant will:
1. Route to the appropriate tool
2. Read the tool definition
3. Ask about scope preference (if applicable)
4. Create project in `projects/active/[tool-name]/`
5. Guide you through phases

### Tool Lifecycle

```
Available → Activate → In Progress → Complete → Archived
```

Tools don't expire—they **graduate**. Each tool defines clear criteria for completion.

---

## Intelligence Services

Intelligence services provide context, search, and resolution capabilities that make skills and workflows dramatically more effective.

### Intelligence Features

#### Temporal Intelligence
Query what Areté knows about any topic over time.
- `arete memory timeline "onboarding"` — See when a topic was discussed and themes over time
- Briefings automatically include recency signals: "last discussed 3 days ago in [meeting]"

#### Person Memory Highlights
Keep fast-access stakeholder memory on each person profile.
- `arete people memory refresh` — Update repeated asks/concerns from meetings
- `arete people memory refresh --person <slug> --if-stale-days N` — Refresh only when stale
- Person files get `## Memory Highlights (Auto)` with mention counts and recent sources
- Meeting prep and agenda generation can use these highlights for better callouts

#### People Intelligence Digest
Run uncertainty-safe people classification in non-blocking batch mode.

- `arete people intelligence digest --input inputs/people-candidates.json --json`
- Low-confidence candidates route to `unknown_queue` by default (no forced customer fallback)
- Suggestions include confidence, rationale, and evidence snippets
- Digest output includes KPI metrics (misclassification rate, triage burden, interruption complaints, unknown queue rate)

**Optional toggles (Phase 3):**
- `--feature-extraction-tuning` — Enable extraction tuning for this run
- `--feature-enrichment` — Enable optional enrichment for this run
- `--extraction-quality <0..1>` — Attach extraction quality score to KPI snapshot

**Policy config (optional):**
Create `context/people-intelligence-policy.json`:

```json
{
  "confidenceThreshold": 0.65,
  "defaultTrackingIntent": "track",
  "features": {
    "enableExtractionTuning": false,
    "enableEnrichment": false
  }
}
```

If missing or invalid, safe defaults are used.

**Input format (`--input`)**:

```json
[
  {
    "name": "Sam Internal",
    "email": "sam@acme.com",
    "company": "Acme",
    "text": "internal planning sync attendee",
    "source": "meeting-1.md",
    "actualRoleLens": "customer"
  }
]
```

`actualRoleLens` is optional and only used for misclassification KPI evaluation.

**KPI snapshots:**
- Stored at `.arete/memory/metrics/people-intelligence.jsonl`
- One JSON record per digest run for trend review

#### Proactive Context Assembly
Areté searches ALL available sources automatically when assembling briefings:
- Context files, meeting transcripts, memory entries, project docs
- No source left unsearched — you don't need to tell it where to look

#### Context Inventory
Track the freshness and completeness of your workspace context:
- `arete context --inventory` — See which context files are stale or missing
- Coverage gaps show which product primitives lack content

#### Entity Relationships
Areté tracks relationships between people, projects, and meetings:
- Who works on which projects (from project READMEs)
- Who attended which meetings (from meeting notes)
- Where entities are mentioned across your workspace

### Context Injection

**Command**: `arete context --for "query"`

**Purpose**: Map product primitives (Problem, User, Solution, Market, Risk) to workspace files and assemble a context bundle.

**Example**:
```bash
arete context --for "user onboarding improvements"
```

Returns relevant files from `context/`, `goals/`, `projects/`, and gaps.

### Memory Retrieval

**Command**: `arete memory search "query"`

**Purpose**: Search across `.arete/memory/` items (decisions, learnings) using token-based or semantic search (if QMD installed).

**Example**:
```bash
arete memory search "pricing model"
```

Returns matching decisions and learnings with scores.

### Entity Resolution

**Command**: `arete resolve "reference"`

**Purpose**: Fuzzy resolve names to people, meetings, or projects.

**Example**:
```bash
arete resolve "Jane"
```

Returns matching person files, meeting references, project mentions.

### Briefing Assembly

**Command**: `arete brief --for "query"`

**Purpose**: Combine all services into a comprehensive briefing with context files, memory search results, resolved entities, entity relationships, and temporal signals (recency of topic discussions).

**Example**:
```bash
arete brief --for "redesign checkout flow"
```

Used internally by skills that set `requires_briefing: true`.

### Routing

**Command**: `arete route "query" [--json]`

**Purpose**: Route user message to best-matching skill or tool, suggest model tier (fast/balanced/powerful).

**Example**:
```bash
arete route "create meeting agenda"
```

Returns skill/tool ID, action, and model suggestion.

---

## Templates & Customization

### Template Customization

All skill templates live in `.agents/skills/{skill}/templates/` alongside the skill that uses them. Your workspace's `templates/` folder is the **override space** — drop a file there and the skill uses yours instead.

**Full reference**: See `templates/README.md` for the complete list of what's customizable, copy-paste prompts, and step-by-step instructions.

**How it works**:
```
templates/{category}/{variant}.md      ← your override (wins)
.agents/skills/{skill}/templates/...  ← skill default (fallback)
```

**Quick examples** — all overrides use `templates/outputs/{skill-id}/{variant}.md`:

| What to customize | Override path |
|-------------------|--------------|
| One-on-one agenda | `templates/outputs/prepare-meeting-agenda/one-on-one.md` |
| Regular PRD format | `templates/outputs/create-prd/prd-regular.md` |
| Week plan layout  | `templates/outputs/week-plan/week-priorities.md` |
| Discovery README  | `templates/outputs/discovery/project.md` |

**To see a default before customizing**:
```bash
arete template view --skill create-prd --variant prd-regular
arete template view --skill prepare-meeting-agenda --variant one-on-one
arete template list   # see all skills and which have active overrides
```

**Or ask an agent**:
```
I want to customize my one-on-one agenda. Run: arete template view --skill prepare-meeting-agenda --variant one-on-one
Show me the output, help me edit it, and save to templates/outputs/prepare-meeting-agenda/one-on-one.md.
```

#### Meeting Agenda Templates

Areté ships with 5 default agenda types bundled with the `prepare-meeting-agenda` skill:

| Type | When used |
|------|-----------|
| `one-on-one` | 1:1 check-ins |
| `leadership` | Leadership/exec syncs |
| `customer` | Customer meetings, QBRs |
| `dev-team` | Engineering team meetings |
| `other` | Generic fallback |

To customize or add a new type, create `templates/meeting-agendas/{type}.md`. The frontmatter format:

```markdown
---
name: Weekly Stakeholder Update
type: weekly-stakeholder
description: Weekly product update for stakeholders and leadership
time_allocation:
  Wins This Week: 20
  Metrics Review: 25
  Upcoming Releases: 30
  Asks and Blockers: 15
  Q&A: 10
---

## Wins This Week
- Key accomplishments and milestones

## Metrics Review
- Key metrics and trends

## Upcoming Releases
- Features shipping this week/next week

## Asks and Blockers
- Resources or decisions needed

## Q&A
- Open floor
```

New types are picked up immediately — no reinstall needed.

---

## CLI Reference

### Setup & Maintenance

```bash
arete install [directory] [--ide cursor|claude]  # Install workspace
arete update                                      # Update structure and rules
arete status                                      # Check workspace health
arete index                                       # Re-index search collection (after manual file edits)
```

### Intelligence Services

```bash
arete context --for "query"           # Inject context for query
arete context --inventory             # Freshness dashboard & coverage gaps
arete memory search "query"           # Search memory
arete memory timeline "query"         # Temporal view for topic
arete resolve "reference"             # Resolve entity
arete brief --for "query"             # Assemble briefing (context + memory + entities + relationships + temporal)
arete route "query" [--json]          # Route to skill/tool with model suggestion
```

### Skills & Tools

```bash
arete skill list [--verbose]          # List available skills (--verbose shows primitives, work_type, category)
arete skill route "query"             # Route query to skill
arete skill install <source>          # Install skill (skills.sh or path)
arete skill add <source>              # Install skill (alias for install)
arete skill set-default <skill> --for <role>  # Set preferred skill for role
arete skill defaults                  # Show role defaults
arete skill unset-default <role>      # Restore Areté default for role
arete skill remove <name>             # Remove a skill (not fully implemented)

arete tool list                       # List available tools
arete tool show <name>                # Show tool details
```

### Templates

```bash
arete template list meeting-agendas                   # List agenda templates
arete template view meeting-agenda --type <name>      # View template
```

### People

```bash
arete people list [--category internal|customers|users]  # List people
arete people show <slug|email>                           # Show person details
arete people index                                       # Regenerate people index
arete people memory refresh                              # Refresh person memory highlights
arete people intelligence digest --input <path> [--json] # Batch people-intelligence suggestions
```

### Meetings

```bash
arete meeting add --file <path>                 # Add meeting from JSON
arete meeting process --latest [--json]         # Process latest meeting with people intelligence
arete meeting process --file <path> [--json]    # Process a specific meeting file
```

### Integrations

```bash
arete integration configure <name>                  # Configure integration
arete pull calendar [--today|--days N]              # Pull calendar events
arete pull fathom [--days N]                        # Pull Fathom recordings
arete pull krisp [--days N]                         # Pull recorded meetings from Krisp into resources/meetings/
```

---

## Integrations

### Calendar (macOS or Google)

**Setup (macOS Calendar)**:
```bash
brew install ical-buddy
arete integration configure calendar
```

**Setup (Google Calendar)**:
```bash
arete integration configure google-calendar
```

If Google shows an **"unverified app"** screen, click **Advanced** → **Go to Areté (unsafe)** to continue.

**Usage**:
```bash
arete pull calendar --today           # View today's events
arete pull calendar --days 7          # View next 7 days
arete pull calendar --today --json    # JSON output (for skills)
```

**Person Matching**: Calendar attendees are automatically matched to people in your workspace (by email). When viewing events, you'll see person slugs and file paths.

**Skills Integration**: The `daily-plan` skill uses calendar data to build meeting context for each of today's meetings.

### QMD Search

**Purpose**: Semantic search across your workspace. Combines keyword search, vector search, and LLM reranking—all running locally.

**Installation**:
```bash
# Prerequisites: Node.js arm64 on Apple Silicon
node -p "process.arch"  # Should show arm64

# Install QMD
bun install -g https://github.com/tobi/qmd
# or: npm install -g https://github.com/tobi/qmd
```

**Configuration**:
```bash
# Create collection
qmd collection add ~/path/to/workspace --name arete

# Add context descriptions
qmd context add qmd://arete/context "Core business context"
qmd context add qmd://arete/projects "PM projects"
qmd context add qmd://arete/memory "Decisions and learnings"

# Generate embeddings (takes a few minutes first time)
qmd embed
```

**Usage**:
```bash
qmd search "keyword"        # Fast keyword search
qmd vsearch "concept"       # Semantic search
qmd query "question"        # Hybrid search (best quality)

# Maintenance
qmd update                  # Re-index files
qmd embed                   # Regenerate embeddings
qmd status                  # Check index health
```

**Automatic Index Refresh**:
Areté automatically refreshes the QMD index after operations that add or modify files — including `arete pull fathom`, `arete pull krisp`, `arete meeting add`, and `arete meeting process`. You don't need to manually re-index after these commands.

**Manual Re-indexing**:
- `arete index`: Re-index the search collection after manually adding or editing files outside the CLI
- `qmd update`: Alternative direct QMD command for re-indexing
- `qmd embed`: Regenerate embeddings — run weekly/monthly, or after adding lots of content

### Fathom

**Purpose**: Pull meeting recordings and transcripts.

**Setup**: See repository SETUP.md for authentication steps.

**Usage**:
```bash
arete pull fathom --days 7  # Pull last 7 days
```

**Seed**: Import historical meetings for workspace bootstrap (see `seed-context` tool).

### Krisp

AI-powered meeting recorder. Records meetings, generates transcripts, summaries, and action items. Requires a Krisp Core plan or higher.

**First-time setup** (one-time browser OAuth):
```
arete integration configure krisp
```
Opens a browser window for Krisp authentication. Credentials are stored automatically in `.credentials/credentials.yaml`.

**Pull meetings**:
```
arete pull krisp [--days N]
```
Fetches meetings from the last N days (default: 7). Saves markdown files to `resources/meetings/`.

> **Note**: The configure step is one-time. After authenticating, `arete pull krisp` runs silently — no browser interaction needed. Tokens refresh automatically.

---

## Advanced Topics

### Memory System

**Three layers**:

1. **L1: Resources** (`resources/`) - Raw immutable inputs (meetings, notes)
2. **L2: Items** (`.arete/memory/items/`) - Atomic facts (decisions, learnings)
3. **L3: Summaries** (`.arete/memory/summaries/`) - Synthesized context (collaboration profile, session summaries)

**When memory is updated**:
- `process-meetings` - Extracts decisions/learnings from meetings
- `finalize-project` - Extracts decisions/learnings from project work
- Skills automatically append when you make key choices

**Collaboration profile**: `.arete/memory/summaries/collaboration.md` - Synthesized profile of how to work with you, derived from observations.

### Context Management

**Source of truth pattern**: Context files in `context/` are canonical. Only update them when finalizing a project or making verified changes.

**When to update context**:
- After finalizing a discovery or research project
- When business model or strategy changes
- When user personas evolve
- When product offerings change

**Archiving**: Old versions saved to `context/_history/` with timestamp.

### Multi-IDE Support

Areté supports Cursor and Claude Code. Your `ide_target` in `arete.yaml` determines:

| Setting | Config Directory | Rules Extension | Root Files |
|---------|------------------|-----------------|------------|
| `cursor` | `.cursor/` | `.mdc` | None |
| `claude` | `.claude/` | `.md` | `CLAUDE.md` (mandatory routing) |

Skills in `.agents/skills/` work for both IDEs.

**Switching IDEs**: Set `ide_target` in `arete.yaml`, then run `arete update` to regenerate rules.

---

## Tips & Best Practices

### Search Before You Start

Use QMD to find related past work before starting a new project. Avoid reinventing the wheel.

```bash
qmd query "checkout redesign research"
```

### Keep Context Current

Review and update `context/` files after major changes. Set "Last Reviewed" dates as reminders.

### Log Decisions as You Go

When you make a key decision during a project, mention it. Skills will extract it for memory during finalization.

### Process Meetings Regularly

After saving meetings, run `process-meetings` to update people and memory. Don't let meetings pile up unprocessed.

### Use Scratchpad for Quick Capture

Add quick notes to `now/scratchpad.md` anytime. Move items to projects or memory when ready.

### Link Quarter Goals to Org Strategy

When doing quarter planning, link your goals to org pillars/OKRs in `goals/strategy.md`. Use `goals-alignment` skill to verify.

### Finalize Projects When Done

Don't let projects linger in `active/`. Run `finalize-project` to extract learnings, update context, and archive.

---

## Troubleshooting

### Rules Not Loading (Cursor)

- Ensure `.cursor/rules/` folder exists
- Check `.mdc` files are properly formatted (YAML frontmatter + markdown body)
- Try reloading the Cursor window

### Rules Not Loading (Claude Code)

- Ensure you ran `arete install --ide claude`
- Check `.claude/rules/` and root `CLAUDE.md` exist
- Run `arete update` to regenerate rules

### QMD Installation Fails on Apple Silicon

**Error**: "llama.cpp is not supported under Rosetta"

**Solution**: Use native arm64 Node.js, not x64/Rosetta

```bash
# Check architecture (should show arm64)
node -p "process.arch"

# If x64, install arm64 node via nvm
arch -arm64 nvm install 20
arch -arm64 nvm use 20

# Then reinstall qmd
npm install -g https://github.com/tobi/qmd
```

### QMD Not Finding Content

- Run `qmd update` to re-index
- Run `qmd embed` to regenerate embeddings
- Check `qmd status` to see collection health

### QMD Search Seems Slow

- First search after `qmd embed` loads models (takes ~30s)
- Subsequent searches are fast
- `qmd search` (keyword) is faster than `qmd query` (hybrid)

### Context Feels Outdated

- Check "Last Updated" dates in `context/` files
- Create a project to update specific context areas
- Use `periodic-review` skill to audit and refresh

### Meetings Not Linked to People (or everyone became customers)

- Run `process-meetings` skill to propagate attendees and extract memory
- For safer classification, run:
  - `arete people intelligence digest --input inputs/people-candidates.json --json`
- Treat `unknown_queue` as review-needed (don’t force `customers`)
- Optional: configure `context/people-intelligence-policy.json` for threshold/toggles
- `internal_email_domain` remains a fallback signal, not your only classifier
- Check `attendee_ids` in meeting frontmatter

### Calendar Not Working

- **macOS provider**: Verify ical-buddy installed: `brew list ical-buddy`
- **Google provider**: Re-run OAuth setup: `arete integration configure google-calendar`
- If Google shows an unverified-app warning, continue via **Advanced** → **Go to Areté (unsafe)**
- Check `arete.yaml` has `integrations.calendar.provider` and `integrations.calendar.calendars`
- Test with `arete pull calendar --today`

---

## What's Next

- **Join the community** - Share your skills, templates, and workflows
- **Customize your workspace** - Override skills, create templates, build your own patterns
- **Build institutional memory** - The more you use Areté, the more valuable your memory becomes
- **Achieve arete** - Excellence in product work

---

*For installation and integration setup, see [SETUP.md](SETUP.md) in the repository.*

*For technical details and architecture, see [DEVELOPER.md](DEVELOPER.md) (maintainers only).*
