# Areté

A Cursor-native workspace for product managers to maintain context, run structured workflows, and build institutional memory.

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" or "virtue" - the pursuit of fulfilling one's purpose to the highest degree.

## What This Is

A structured system for PM work:
- **Context Management** - Maintain business and product context as source of truth
- **Project-Based Workflows** - Discovery, PRDs, competitive analysis, roadmaps
- **Institutional Memory** - Capture decisions and learnings for future reference
- **People** - Track internal colleagues, customers, and users; link to meetings and projects
- **Semantic Search** - Find relevant content with QMD integration

## Use This Template

This is a **GitHub template repository**. To use it:

1. Click **"Use this template"** → **"Create a new repository"**
2. Name your repo (e.g., `my-company-pm`) and set it to **Private**
3. Clone your new repo and open in Cursor
4. Start filling in your context files

Your personal/company data stays in your private repo. This template stays public and generic.

## Quick Start

### First 5 Minutes

1. Open `context/business-overview.md` and fill in your company basics
2. (Optional) Set up QMD for semantic search - see `SETUP.md`
3. Ask the agent: "Give me a tour" or "What can I do here?"

### Structure

```
arete/
├── .cursor/
│   ├── rules/           # Cursor rules
│   ├── skills/          # Stateless workflows (discovery, PRD, etc.)
│   └── tools/           # Lifecycle-based capabilities (onboarding, etc.)
├── context/             # Business context (source of truth)
├── projects/            # Active and archived projects
├── memory/              # Decisions, learnings, activity log
├── people/              # People (internal, customers, users)
├── templates/           # Project, input, and output templates
├── scratchpad.md        # Quick capture
└── SETUP.md             # Detailed setup guide
```

## Available Actions

### Skills (Stateless Workflows)

| Action | How to Start |
|--------|--------------|
| Workspace Tour | "Give me a tour" |
| Discovery | "Start a discovery project for [topic]" |
| PRD Creation | "Create a PRD for [feature]" |
| Competitive Analysis | "Do competitive analysis on [competitors]" |
| Roadmap Planning | "Build roadmap for [period]" |
| Synthesize | "Synthesize what we've learned" |
| Finalize | "Finalize this project" |
| Periodic Review | "Quarterly review" |

### Tools (Lifecycle-Based Capabilities)

Tools are different from skills - they have phases, track progress, and eventually complete.

| Tool | Purpose | How to Start |
|------|---------|--------------|
| Onboarding | 30/60/90 day plan for thriving at a new job | "Start onboarding tool" or "Help me with my 30/60/90 day plan" |

See `.cursor/tools/README.md` for more about the tools framework.

---

## Autonomous Development (Maintainers Only)

⚠️ **For Areté developers only** - Not a user-facing feature.

If you're building features for Areté itself, we have an autonomous agent loop system that can execute PRD tasks sequentially with fresh context per task. This is inspired by [Ralph](https://github.com/snarktank/ralph) but adapted for Cursor-native execution.

**Quick overview:**
1. Create a markdown PRD for an Areté feature
2. Convert it to JSON task list with `prd-to-json` skill
3. Execute autonomously with `execute-prd` skill
4. Review commits and merge

See [`.cursor/build/autonomous/README.md`](.cursor/build/autonomous/README.md) for full documentation.

---

## What's a Project?

A **project** is a flexible container for any bounded PM work:
- A 2-week discovery effort
- A single PRD for a feature
- A competitive analysis sprint
- A quarterly roadmap cycle
- A large multi-month initiative

Projects are however YOU want to organize your work. Not everything needs a project - use `scratchpad.md` for quick notes.

## Example Prompts

**Starting work:**
- "Start a discovery project for improving user onboarding"
- "I need to write a PRD for a new checkout flow"
- "Help me analyze our top 3 competitors"

**During a project:**
- "Add these meeting notes to the current project"
- "What have we learned so far?"
- "Synthesize the user feedback we've collected"

**Wrapping up:**
- "Finalize this project"
- "Log this decision: we chose Stripe because..."

**Quick questions:**
- "What do we know about [topic]?"
- "Why did we decide to [decision]?"

## Documentation

### For Users
- `SETUP.md` - Detailed setup, QMD configuration, troubleshooting
- `.cursor/rules/` - Cursor rules for PM workflows
- `.cursor/skills/` - Available PM skills and workflows

### For Developers (Areté Maintainers)
- `AGENTS.md` - Architecture, patterns, and context for AI agents building Areté
- `.cursor/build/` - Internal build system and autonomous development tools
- `.cursor/build/MEMORY.md` - Build history and architectural decisions

## Contributing

Contributions welcome! This is an open-source template. If you have improvements, please open a PR.

## License

MIT - See [LICENSE](LICENSE)
