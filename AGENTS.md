# Areté - Product Builder's Operating System

> **Audience**: This document is for AI agents building Areté and experienced maintainers. For human-readable contribution guide, see [DEVELOPER.md](DEVELOPER.md).

You are an AI assistant operating in Areté, a Product Management workspace. This workspace helps PMs streamline their workflows through structured context, project-based work, and institutional memory.

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

## ⚠️ CRITICAL: Skill-Based Workflow (Mandatory)

# 🛑 STOP - READ THIS FIRST

Before responding to ANY user request in this Areté workspace:

## Is this a PM action?

Tour/orientation ("give me a tour", "how does this work", "what can I do here"), agenda creation ("create/prepare a meeting agenda"), meeting prep, planning ("plan the week", "prepare a weekly plan", "weekly priorities"), synthesis, discovery, PRD, roadmap, competitive analysis, process meetings, **onboarding** ("I'm starting a new job", "30/60/90"), **seed context** ("import my meetings", "backfill history"), etc.

## If YES, follow this EXACT sequence:

```bash
# 1. ROUTE (MANDATORY)
arete skill route "<user's exact message>"
# or: arete route "<user's message>"

# 2. CHECK TYPE (MANDATORY)
# Router returns type: 'skill' or 'tool'

# 3a. IF SKILL (type: 'skill', action: 'load'):
# Read the skill file, e.g.:
# .agents/skills/meeting-prep/SKILL.md
# Then EXECUTE the skill's complete workflow

# 3b. IF TOOL (type: 'tool', action: 'activate'):
# Read the tool file, e.g.:
# .cursor/tools/onboarding/TOOL.md
# Then ACTIVATE the tool (see tool activation pattern in pm-workspace.mdc)
```

## If NO:

Proceed with normal tools.

---

**Anti-Pattern** (what NOT to do):
```
❌ User: "Help me prep for my meeting with Alex"
❌ Agent: [Immediately runs Glob/Grep/Read to find Alex's files]
❌ Problem: Skipped router, skipped skill, improvised workflow
```

**Correct Pattern (Skill)**:
```
✅ User: "Help me prep for my meeting with Alex"
✅ Agent: [Runs `arete skill route "help me prep for my meeting with alex"`]
✅ Agent: [Router returns: meeting-prep, type: skill, action: load]
✅ Agent: [Reads .agents/skills/meeting-prep/SKILL.md]
✅ Agent: [Follows the skill's complete workflow]
```

**Correct Pattern (Tool)**:
```
✅ User: "I'm starting a new job"
✅ Agent: [Runs `arete skill route "I'm starting a new job"`]
✅ Agent: [Router returns: onboarding, type: tool, action: activate]
✅ Agent: [Reads .cursor/tools/onboarding/TOOL.md]
✅ Agent: [Activates tool: asks scope, creates project, guides Phase 1]
```

---

**You WILL be asked to verify you followed this. If you skipped the router and skill, you FAILED the task.**

## Build Workspace Structure

This is the structure for **building Areté** (not the user workspace that gets installed):

```
arete/                 # Build workspace root
├── src/               # Source code
│   ├── core/          # Core functionality
│   ├── integrations/  # Integration providers
│   └── cli/           # CLI commands
├── runtime/           # Files shipped to users
│   ├── skills/        # Product skills (shipped)
│   ├── rules/         # Product rules (shipped)
│   └── tools/         # Product tools (shipped)
├── memory/            # Build memory (NOT .arete/memory/)
│   ├── MEMORY.md      # Index of build decisions and changes
│   ├── collaboration.md # How to work with the builder
│   └── entries/       # Dated entries (YYYY-MM-DD_title.md)
├── .agents/           # Build-specific agent resources
│   └── skills/        # Build skills (NOT shipped)
│       ├── execute-prd/
│       ├── plan-to-prd/
│       ├── prd-post-mortem/
│       └── run-pre-mortem/
├── dev/               # Development tooling
│   ├── backlog/       # Future work
│   │   ├── features/  # New capabilities
│   │   └── improvements/ # Enhancements
│   ├── prds/          # PRDs for Areté features
│   └── autonomous/    # PRD execution templates
│       └── templates/ # Pre-mortem, task templates
├── .cursor/           # Cursor IDE configuration
│   ├── rules/         # Build rules (dev.mdc, testing.mdc, etc.)
│   └── tools/         # Lifecycle-based capabilities
├── test/              # Test files
├── scripts/           # Build and integration scripts
├── bin/               # Executable files (arete CLI)
└── scratchpad.md      # Quick capture, parking lot
```

**Key differences from user workspace:**
- Build workspace has `memory/` at root (user workspace has `.arete/memory/`)
- Build workspace has `.agents/skills/` for build skills (user workspace has `runtime/skills/`)
- Build workspace has `dev/` directory for backlog, PRDs, autonomous tooling
- User workspace structure is defined in `runtime/` files that get installed

## Key CLI Commands

Essential Areté CLI commands for PM work:

- `arete route "<query>"` - Route user message to best skill and suggest model tier
- `arete skill route "<query>"` - Route to skill only (for agents before loading skill)
- `arete brief --for "task" --skill <name>` - Assemble primitive briefing (context + memory + entities)
- `arete context --for "query"` - Get relevant workspace files for a task
- `arete memory search "query"` - Search decisions, learnings, and observations
- `arete resolve "reference"` - Resolve ambiguous names (people, meetings, projects)
- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show person details
- `arete status` - Check workspace health
- `arete pull` - Sync from integrations (meetings, calendar)

## Full Rules

For complete workspace rules and guidance, see `.cursor/rules/`. Key rules:
- `pm-workspace.mdc` - Main workspace behavior and PM actions
- `routing-mandatory.mdc` - Mandatory routing workflow (inlined above)
- `agent-memory.mdc` - Memory management guidance

## Version Information

Generated by Areté v0.1.0 on 2026-02-13T19:46:53.783Z
