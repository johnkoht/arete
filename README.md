# Areté - Product Management Workspace

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

An AI-native workspace for Cursor and Claude Code that helps product managers maintain context, run structured workflows, and build institutional memory.

---

## What It Is

Areté is a Product Management operating system designed for AI-augmented work:

- **Context Management** - Maintain business, product, and customer knowledge as source of truth
- **Intelligence Services** - Automatically inject relevant context into any workflow
- **Structured Workflows** - Run discovery, PRDs, competitive analysis, and roadmaps with consistency
- **Institutional Memory** - Capture decisions and learnings that persist beyond individual projects
- **Meeting Intelligence** - Prep for meetings, process notes, extract insights

Built for **Cursor** and **Claude Code** IDEs, optimized for collaboration with AI agents.

---

## Why Use It

Product builders face three persistent problems:

1. **Context Loss** - Business knowledge scattered across docs, meetings, and memory
2. **Inconsistent Process** - PM workflows done differently each time
3. **Institutional Amnesia** - Decisions and learnings lost when people leave

**Areté solves these** by providing structure without bureaucracy—a system that helps you work better with AI while building knowledge that compounds over time.

---

## Quick Start

### Installation

```bash
# Install globally
npm install -g @arete/cli

# Create new workspace
arete install ~/my-pm-workspace

# Or for Claude Code
arete install ~/my-pm-workspace --ide claude

# Start working
cd ~/my-pm-workspace
# Open in Cursor (or Claude Code)
# Ask: "Give me a tour"
```

### First 15 Minutes

1. Open `context/business-overview.md` and fill in your company basics
2. Open `context/users.md` and describe your users
3. Ask the AI: "Give me a tour" or "What can I do here?"
4. (Optional) Set up QMD for semantic search - see [SETUP.md](SETUP.md)

---

## Core Capabilities

### Context Management

Your **source of truth** for business context:
- **Business** - Company overview, market, competitive landscape
- **Users** - User personas, needs, behaviors
- **Products** - What you're building and why
- **Strategy** - Goals, OKRs, strategic initiatives

Lives in `context/` directory. AI reads this before starting work.

### Project Workflows

Structured PM work with consistent quality:

| Workflow | Purpose |
|----------|---------|
| **Discovery** | Understand problems before building |
| **PRD Creation** | Document what to build and why |
| **Competitive Analysis** | Analyze competitors systematically |
| **Roadmap Planning** | Plan quarters and releases |
| **Synthesis** | Extract insights from research |

Start with: "Start a discovery project for [topic]" or "Create a PRD for [feature]"

### Meeting Intelligence

Never lose track of what was discussed:
- **Meeting Prep** - Brief with attendee context, recent meetings, action items
- **Save Meetings** - Capture notes and transcripts
- **Process Meetings** - Extract decisions and learnings to memory
- **Daily Plan** - Today's focus with meeting context

Start with: "Help me prep for my meeting with [person]"

### Institutional Memory

Capture knowledge that outlasts projects:
- **Decisions** - Key decisions with rationale
- **Learnings** - User insights, market observations, process improvements
- **Observations** - How you work best with AI

Memory is searchable and automatically surfaced in relevant contexts.

### Planning System

Align work from quarter to day:
- **Quarter Goals** - Set goals aligned to org strategy
- **Week Outcomes** - Plan week outcomes linked to quarter goals
- **Daily Focus** - Today's priorities and meeting prep

Start with: "Plan my week" or "What's on my plate today?"

---

## Documentation

### For Users (Product Builders)

- **[GUIDE.md](runtime/GUIDE.md)** - Comprehensive user reference (shipped to workspace)
- **[SETUP.md](SETUP.md)** - Installation, integrations, troubleshooting
- **[ONBOARDING.md](ONBOARDING.md)** - First-time setup checklist

### For Developers (Areté Maintainers)

- **[DEVELOPER.md](DEVELOPER.md)** - Architecture, systems, contribution guide
- **[AGENTS.md](AGENTS.md)** - Architecture reference for AI agents (supplementary)
- **dev/** - Build system, PRDs, and change log

---

## Example Workflows

**Starting a discovery project:**
```
You: "Start a discovery project for improving user onboarding"
AI: [Creates project structure, gathers context, guides through discovery]
```

**Writing a PRD:**
```
You: "Create a PRD for a new checkout flow"
AI: [Creates PRD project, asks clarifying questions, drafts PRD]
```

**Meeting prep:**
```
You: "Help me prep for my 1:1 with Sarah"
AI: [Finds Sarah's context, recent meetings, action items, suggests topics]
```

**Quick questions:**
```
You: "What do we know about mobile conversion?"
AI: [Searches context + memory, synthesizes answer with sources]
```

---

## Key Features

### Intelligence Services

Areté provides intelligence that powers any workflow:

- **Context Injection** - Find relevant files for any task
- **Memory Retrieval** - Search past decisions and learnings
- **Entity Resolution** - Match ambiguous names to people, meetings, projects
- **Briefing Assembly** - Gather context before complex work

These services run automatically during skills, or manually via CLI:

```bash
arete context --for "mobile app redesign"
arete memory search "pricing decisions"
arete resolve "Jane"
arete brief --for "competitive analysis"
```

### Templates & Customization

Customize workflows to match your team:

- **Meeting Agendas** - 5 default templates (leadership, customer, dev-team, 1:1, other)
- **Project Templates** - Customize discovery, PRD, analysis templates
- **Custom Skills** - Install third-party skills or write your own

See GUIDE.md § Templates for customization details.

### Multi-IDE Support

Works with both **Cursor** and **Claude Code**:

```bash
# Install for Cursor (default)
arete install ~/workspace

# Install for Claude Code
arete install ~/workspace --ide claude

# Switch between IDEs
# (workspace is IDE-agnostic, rules adapt)
```

### Integrations

Connect to external tools:

- **Calendar** (macOS) - Pull events for meeting prep and planning
- **Fathom** - Import meeting recordings and transcripts
- (Future: Google Calendar, Slack, Linear, Notion)

See SETUP.md for configuration.

---

## Philosophy

Areté is built on a simple question: **Does it help the product builder achieve excellence?**

Every feature is evaluated against whether it helps you:
- Gain clarity
- Navigate ambiguity
- Automate the mundane
- Move faster
- Unlock opportunity
- Think better
- Be constructively challenged

We optimize for **product builders operating at their highest level**, not busyness or compliance.

---

## Community & Support

- **Documentation**: See GUIDE.md in your workspace after install
- **GitHub**: [github.com/yourusername/arete](https://github.com/yourusername/arete)
- **Issues**: Report bugs or request features
- **Discussions**: Ask questions, share workflows

---

## Contributing

We welcome contributions! See [DEVELOPER.md](DEVELOPER.md) for:
- Architecture overview
- Development workflow
- Testing requirements
- How to add features

---

## License

MIT - See [LICENSE](LICENSE)
