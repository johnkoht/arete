# Areté Setup Guide

## Overview

Areté is a Product Management workspace for Cursor that helps you:
- Maintain business and product context
- Run project-based PM workflows (discovery, PRDs, competitive analysis, roadmaps)
- Build institutional memory (decisions, learnings)
- Search across all content with QMD

## Workspace Structure

```
arete/
├── arete                    # CLI entry point (./arete help)
├── now/                     # Current focus (start here)
│   ├── scratchpad.md        # Quick capture, parking lot
│   ├── week.md              # This week's priorities
│   └── today.md             # Today's focus (daily-plan)
│
├── goals/                   # Strategy and goals
│   ├── strategy.md          # Org strategy, OKRs, pillars
│   ├── quarter.md           # Current quarter goals
│   ├── initiatives.md       # Strategic bets
│   └── archive/             # Alignment snapshots
│
├── context/                 # Core context (source of truth)
│   ├── business-overview.md
│   ├── business-model.md
│   ├── competitive-landscape.md
│   ├── products-services.md
│   ├── users-personas.md
│   └── _history/            # Archived context versions
│
├── projects/                # Project workspaces
│   ├── active/              # Currently in progress
│   └── archive/             # Completed projects
│
├── resources/               # Raw inputs
│   ├── meetings/            # Meeting notes and transcripts
│   └── notes/               # Standalone notes
│
├── .arete/                  # System-managed (not user-edited directly)
│   ├── memory/              # Institutional knowledge
│   │   ├── items/           # Atomic facts (decisions, learnings)
│   │   └── summaries/       # Synthesized context
│   └── activity/            # Activity log
│
├── .credentials/            # API keys and tokens (gitignored)
├── .cursor/                 # Rules, skills, tools, integrations
├── people/                  # People (internal, customers, users)
├── scripts/                 # Setup and utility scripts
└── templates/               # Document templates
    ├── plans/               # Plan templates (goals, week)
    ├── projects/            # Project templates
    ├── inputs/              # Input templates
    └── outputs/             # Output templates (PRDs, etc.)
```

**Planning structure**: `now/`, `goals/`, and `templates/plans/` are created by `arete install` and backfilled by `arete update`. Existing workspaces are migrated automatically on `arete update`.

**Meeting propagation**: After saving or syncing meetings, run the **process-meetings** skill to update people and memory. Optional: set `internal_email_domain` in `arete.yaml` (e.g. `internal_email_domain: "acme.com"`) so attendees from your org are classified as internal.

**Meeting intelligence**: Use **meeting-prep** to build a prep brief before a meeting (attendees, recent meetings, action items, talking points). Use **daily-plan** to see today's focus, week priorities, and meeting context for each of today's meetings (you supply the meeting list; no calendar integration in v1).

## Understanding the Architecture

### For Users (Product Managers)

When you use Areté, you interact with:
- **Context files** (`context/`) - Your business and product knowledge
- **Projects** (`projects/`) - Your active and archived PM work
- **Memory** (`.arete/memory/`) - Decisions, learnings, institutional knowledge
- **Skills** (`.cursor/skills/`) - PM workflows like discovery, PRD creation
- **Tools** (`.cursor/tools/`) - Lifecycle features like onboarding

### For Developers (Areté Maintainers)

If you're contributing to or building Areté itself:

**Read `AGENTS.md` first** - This file contains comprehensive context for AI agents and developers:
- What Areté is and who uses it
- High-level architecture and patterns
- Key systems (meetings, integrations, workspace)
- Coding conventions and common patterns
- Future concepts and design decisions

**Build vs Product separation**:
- `.cursor/build/` = Internal development tooling (NOT shipped to users)
- Everything else = Product code/content shipped via npm

**Autonomous development**: `.cursor/build/autonomous/` contains a Ralph-inspired autonomous agent loop for building Areté features. See [`.cursor/build/autonomous/README.md`](.cursor/build/autonomous/README.md) for details.

## Quick Start

### 0. Run Setup

Use the `arete` CLI to check dependencies and set up the workspace:

```bash
# Check what's installed
./arete setup

# Install missing dependencies
./arete install

# Initialize workspace (create directories, credentials)
./arete init

# Full setup (install + init)
./arete setup all

# See all available commands
./arete help
```

### 1. Populate Context (Priority Order)

Start with the most important context files:

**High Priority** (do first):
1. `context/business-overview.md` - Company basics
2. `context/users-personas.md` - Target users
3. `context/products-services.md` - What you're building

**Medium Priority** (do next):
4. `context/business-model.md` - How you make money
5. `goals/strategy.md` - Strategic direction
6. `context/competitive-landscape.md` - Competitors

### 2. Set Up QMD (Recommended)

QMD provides semantic search across your workspace. It combines keyword search, vector search, and LLM reranking - all running locally.

#### Installation

**Prerequisites**: Node.js (arm64 native on Apple Silicon)

```bash
# Check your node architecture (should be arm64 on Apple Silicon)
node -p "process.arch"

# If it shows x64 on Apple Silicon, you need native arm64 node
# Use nvm to install arm64 version:
arch -arm64 nvm install 20
arch -arm64 nvm use 20
```

**Install QMD**:

```bash
# Option 1: Using bun (recommended)
bun install -g https://github.com/tobi/qmd

# Option 2: Using npm
npm install -g https://github.com/tobi/qmd
```

#### Configure for Areté

```bash
# Create collection for this workspace (adjust path to your repo location)
qmd collection add ~/path/to/arete --name arete

# Add context descriptions (helps search understand your content)
qmd context add qmd://arete/context "Core business context and source of truth"
qmd context add qmd://arete/projects "Active and archived PM projects"
qmd context add qmd://arete/memory "Decisions, learnings, and activity log"

# Generate initial embeddings (takes a few minutes first time)
qmd embed
```

#### QMD Commands

```bash
# Search commands
qmd search "keyword"        # Fast keyword search
qmd vsearch "concept"       # Semantic search
qmd query "question"        # Hybrid search (best quality)

# Maintenance
qmd update                  # Re-index files (run after adding content)
qmd embed                   # Regenerate embeddings (run occasionally)
qmd status                  # Check index health
```

#### When to Update

- **`qmd update`**: Run after adding/editing files, or before major search tasks
- **`qmd embed`**: Run weekly/monthly, or after adding lots of new content

The agent will prompt you to run `qmd update` at key moments (after finalizing projects, before synthesis).

### 3. Optional: MCP Integrations

MCP (Model Context Protocol) integrations extend the workspace with external tools. These are optional but unlock additional capabilities.

#### Mockup Generation (Lovable or Vercel v0)

The `generate-mockup` skill can create interactive prototypes from PRDs and discovery findings. Requires one of:

**Lovable MCP** (recommended for full prototypes):
- [Setup docs](https://docs.lovable.dev/integrations/mcp-servers)
- Generates interactive, shareable prototypes
- Can read from Notion, Linear, etc. for additional context

**Vercel v0**:
- Good for individual UI components and screens
- Lighter weight than full prototypes

Without an MCP configured, the skill generates a detailed prompt you can paste into your preferred tool.

#### Other MCP Options

See `scratchpad.md` → "MCP Integrations" for future integration ideas:
- **Linear**: Sync roadmap items, create issues from PRDs
- **Notion**: Pull/push documentation, export PRDs
- **Figma**: Reference designs in PRDs and competitive analysis

#### Configuring MCP in Cursor

1. Open Cursor Settings (Cmd+Shift+J)
2. Navigate to the MCP section
3. Add your MCP server URL and authenticate

### 4. Start Using the Workspace

**Start a project** (or invoke skills with `/skill-name`):
- "Start a discovery project for [topic]"
- "Create a PRD for [feature]"
- "Do a competitive analysis on [competitors]"
- "Prep for my meeting with [person]" (meeting-prep)
- "What's on my plate today?" (daily-plan)

**Quick capture:**
- Add notes to `scratchpad.md` anytime
- Move items to projects or memory when ready

**Finalize work:**
- "Finalize this project"
- Context will be updated, decisions logged, project archived

## How It Works

### Project Lifecycle

```
Create → Work → Synthesize → Finalize → Archive
```

1. **Create**: Start a project with a clear goal
2. **Work**: Add inputs, iterate on drafts
3. **Synthesize**: Pull learnings together
4. **Finalize**: Commit changes to context, archive project

### Context Management

- Context files are the source of truth
- Only update context when finalizing a project
- Old versions are archived to `context/_history/`

### Memory System

- **decisions.md**: Key decisions with rationale
- **learnings.md**: Insights for future reference
- **activity-log.md**: What happened when

## Tips

- **Search first**: Use QMD to find related past work before starting
- **Use scratchpad**: Capture quick notes, move to projects later
- **Keep context current**: Review and update after major changes
- **Log decisions**: Future you will thank present you

## Troubleshooting

**Rules not loading?**
- Ensure `.cursor/rules/` folder exists
- Check that `.mdc` files are properly formatted
- Try reloading the Cursor window

**QMD installation fails on Apple Silicon?**
- Error: "llama.cpp is not supported under Rosetta"
- Solution: Use native arm64 Node.js, not x64/Rosetta
  ```bash
  # Check architecture (should show arm64)
  node -p "process.arch"
  
  # If x64, install arm64 node via nvm
  arch -arm64 nvm install 20
  arch -arm64 nvm use 20
  
  # Then reinstall qmd
  npm install -g https://github.com/tobi/qmd
  ```

**QMD not finding content?**
- Run `qmd update` to re-index
- Run `qmd embed` to regenerate embeddings
- Check `qmd status` to see collection health

**QMD search seems slow?**
- First search after `qmd embed` loads models (takes ~30s)
- Subsequent searches are fast
- `qmd search` (keyword) is faster than `qmd query` (hybrid)

**Context feels outdated?**
- Check "Last Updated" dates in context files
- Create a project to update specific context

## For Contributors & Developers

If you're building Areté itself (not just using it):

1. **Read AGENTS.md** - Comprehensive architecture and context document
2. **Check build memory** - `.cursor/build/MEMORY.md` for recent changes
3. **Follow patterns** - Established in existing code
4. **Write tests** - All new functionality requires tests (see `.cursor/rules/testing.mdc`)
5. **Update docs** - Keep AGENTS.md current with new patterns

### Autonomous Development

Areté has an autonomous agent loop for building features:
- Create PRD → Convert to JSON → Execute autonomously
- Fresh Task subagent per task for clean context
- Automatic testing and committing
- See `.cursor/build/autonomous/README.md` for full workflow

This is **internal tooling only** - not shipped to Areté users.
