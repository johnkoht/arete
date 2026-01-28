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
├── .cursor/rules/           # Cursor rules and skills
│   ├── pm-workspace.mdc     # Main workspace behavior
│   ├── project-management.mdc
│   ├── context-management.mdc
│   ├── qmd-search.mdc
│   └── skills/              # PM skills (8 total)
│       ├── create-prd.mdc
│       ├── discovery.mdc
│       ├── competitive-analysis.mdc
│       ├── construct-roadmap.mdc
│       ├── synthesize.mdc
│       ├── finalize-project.mdc
│       ├── workspace-tour.mdc
│       └── periodic-review.mdc
│
├── context/                 # Core context (source of truth)
│   ├── business-overview.md
│   ├── business-model.md
│   ├── competitive-landscape.md
│   ├── products-services.md
│   ├── goals-strategy.md
│   ├── users-personas.md
│   └── _history/            # Archived context versions
│
├── projects/                # Project workspaces
│   ├── active/              # Currently in progress
│   └── archive/             # Completed projects
│
├── memory/                  # Institutional knowledge
│   ├── decisions.md         # Decision log
│   ├── learnings.md         # Insights and learnings
│   └── activity-log.md      # Activity history
│
├── scratchpad.md            # Quick capture space
│
└── templates/               # Document templates
    ├── projects/            # Project templates
    ├── inputs/              # Input templates
    └── outputs/             # Output templates (PRDs, etc.)
```

## Quick Start

### 1. Populate Context (Priority Order)

Start with the most important context files:

**High Priority** (do first):
1. `context/business-overview.md` - Company basics
2. `context/users-personas.md` - Target users
3. `context/products-services.md` - What you're building

**Medium Priority** (do next):
4. `context/business-model.md` - How you make money
5. `context/goals-strategy.md` - Strategic direction
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

### 3. Start Using the Workspace

**Start a project:**
- "Start a discovery project for [topic]"
- "Create a PRD for [feature]"
- "Do a competitive analysis on [competitors]"

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
