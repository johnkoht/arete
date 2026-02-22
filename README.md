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

## Not Sure Where to Start? Let AI Set It Up

If you're new to the CLI or just want a guided experience, copy and paste the prompt below into **Claude Code**, **Claude Desktop**, or **Cursor**. The AI will walk you through everything — no CLI experience needed.

<details>
<summary><strong>📋 Copy this prompt → paste into Claude Code, Claude Desktop, or Cursor</strong></summary>

```
I want to set up Areté — a product management workspace that helps me work better with AI. Please guide me through the full setup process step by step.

Here's what I need help with:

1. **Check prerequisites** — Verify I have Node.js 18+ installed. If not, tell me how to install it for my operating system.

2. **Install the Areté CLI** — Run: `npm install -g @arete/cli`

3. **Create my workspace** — Ask me:
   - Where I want to create it (suggest `~/pm-workspace` as a default)
   - Which AI tool I'm using: Cursor or Claude Code
   Then run: `arete install ~/pm-workspace --ide [cursor or claude]`

4. **Run onboarding** — Navigate into the folder and run `arete onboard`. It'll ask for my name, email, and company to personalize the workspace.

5. **Verify setup** — Run `arete status` and show me the output. Explain what it means.

6. **Open the workspace** — Tell me how to open the workspace folder in my IDE (Cursor or Claude Code).

7. **Fill in my first context files** — Once I'm in the workspace, help me fill in the three most important files:
   - `context/business-overview.md` — my company and what we do
   - `context/users-personas.md` — who uses my product
   - `context/products-services.md` — what I'm building

8. **First quick win** — Once setup is done, suggest 2–3 things I can ask the AI to do right away (like "prep for a meeting", "start a discovery project", or "what's on my plate today").

Please be conversational and explain what each step does in plain language. I'm a product manager, not a developer. If anything fails or looks unexpected, help me troubleshoot before moving on.
```

</details>

> **Tip**: After pasting the prompt, answer any questions the AI asks (like which OS you're on, or where to put your workspace). It will run the commands and guide you the rest of the way.

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
- **[AGENTS.md](AGENTS.md)** - Generated architecture reference for AI agents
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

## Architecture

Areté is organized as a monorepo with three packages:

- **@arete/core** — Intelligence and service layer (context, memory, entity, briefing)
- **@arete/cli** — Command-line interface (thin wrapper over core services)
- **@arete/runtime** — Workspace content (skills, tools, templates, rules)

### Key Intelligence Features

- **Temporal Intelligence** — Timeline queries, recency signals ("when was X last discussed?")
- **Proactive Context** — Automatic deep source search across all workspace content with freshness tracking
- **Entity Relationships** — Track who works on what, attended where, mentioned where
- **Briefing Assembly** — Combine context + memory + entities + relationships into comprehensive briefings

---

## Key Features

### Intelligence Services

Areté provides intelligence that powers any workflow:

- **Context Injection** - Find relevant files for any task, with freshness tracking
- **Memory Retrieval** - Search past decisions and learnings, with temporal views
- **Entity Resolution** - Match ambiguous names to people, meetings, projects
- **Entity Relationships** - Track works_on, attended, mentioned_in relationships
- **Briefing Assembly** - Gather context, memory, entities, and relationships before complex work
- **Temporal Intelligence** - Timeline queries showing how topics evolve over time

These services run automatically during skills, or manually via CLI:

```bash
arete context --for "mobile app redesign"
arete context --for "mobile app redesign" --inventory   # freshness dashboard
arete memory search "pricing decisions"
arete memory timeline "onboarding" --days 90            # temporal view
arete resolve "Jane"
arete brief --for "competitive analysis"
arete index                                              # re-index search after manual edits
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
- **Krisp** - Pull meeting recordings, transcripts, summaries, and action items
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
