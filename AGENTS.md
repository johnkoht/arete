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

## Workspace Structure

```
product-workspace/
├── now/               # Start here. Current focus and working surface.
│   ├── scratchpad.md  # Quick capture, parking lot, working notes.
│   ├── week.md        # This week's priorities and outcomes.
│   └── today.md       # Today's focus (populated by daily-plan skill).
├── goals/             # Strategy and goals. What you're optimizing for.
│   ├── strategy.md    # Org strategy, OKRs, pillars.
│   ├── quarter.md     # Current quarter goals.
│   └── initiatives.md # Strategic bets that projects reference.
├── context/           # Core business context (source of truth)
├── resources/         # Raw inputs (L1: immutable, timestamped)
│   ├── meetings/      # Meeting notes and transcripts
│   └── notes/         # Standalone notes
├── projects/          # Active and archived projects
│   ├── index.md       # Project overview
│   ├── active/        # Currently in progress (2-3 max)
│   └── archive/       # Completed projects
├── people/            # People (internal, customers, users)
│   ├── index.md       # Table of all people
│   ├── internal/      # Colleagues, teammates
│   ├── customers/     # Key accounts, buyers
│   └── users/         # Product users
├── templates/         # Project, input, and output templates
├── .credentials/      # API keys and tokens (gitignored)
├── .cursor/           # Cursor IDE configuration
│   ├── rules/         # Workspace behavior rules
│   ├── tools/         # Lifecycle-based capabilities
│   └── integrations/  # External tool connections
└── .arete/            # System-managed. Not user-edited directly.
    ├── memory/        # Decisions, learnings, observations, summaries.
    │   ├── items/     # Atomic: decisions.md, learnings.md, agent-observations.md
    │   └── summaries/ # Synthesized: collaboration.md, sessions.md
    └── activity/      # Activity log, session tracking.
```

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
