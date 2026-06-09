# Areté — Product Builder's Operating System

> **Areté** (ἀρετή) - Ancient Greek concept meaning "excellence" - the pursuit of fulfilling one's purpose to the highest degree.

An AI-native workspace for Cursor and Claude Code that helps product builders — PMs, founders, and operators — maintain context, run structured workflows, and build institutional memory that compounds across meetings, async conversation, and projects.

---

## What It Is

Areté is an operating system for product builders working alongside AI:

- **Context Management** — Business, product, and customer knowledge as source of truth
- **Areas** — Persistent work domains (customers, initiatives, product surfaces) that accumulate intelligence across quarters
- **Topic Wiki** — Recurring themes (pricing, a vendor, a strategic bet) build up into queryable pages from meetings *and* Slack
- **Meeting Intelligence** — Pull recordings, extract decisions/commitments/learnings with cross-meeting deduplication, prep for what's next
- **Async Intelligence** — `slack-digest` processes Slack threads the same way meetings get processed; everything flows into the same memory + topic wiki
- **Institutional Memory** — Decisions, learnings, and commitments outlast projects and people
- **Structured Workflows** — Discovery, PRDs, competitive analysis, roadmaps, daily/weekly winddown — all consistent across runs

Built for **Cursor** and **Claude Code**, optimized for collaboration with AI agents.

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
# Install globally from GitHub
npm install -g github:johnkoht/arete

# Create new workspace
arete install ~/my-pm-workspace

# Or for Claude Code
arete install ~/my-pm-workspace --ide claude

# Start working
cd ~/my-pm-workspace
# Open in Cursor (or Claude Code)
# Ask: "Give me a tour"
```

<details>
<summary>Alternative: Clone + Link (for development)</summary>

```bash
git clone https://github.com/johnkoht/arete.git
cd arete
npm install
npm link
```
</details>

### First 30 Minutes

1. Run `arete onboard` to set up your profile (name, email, company)
2. Say **"Let's get started"** — the agent researches your company and walks you through a guided setup
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

1. **Check prerequisites** — Verify I have Node.js 18+ and git installed. If not, tell me how to install them for my operating system.

2. **Install the Areté CLI** — Install globally from GitHub:
   ```
   npm install -g github:johnkoht/arete
   ```

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
- **Business** — Company overview, market, competitive landscape
- **Users** — User personas, needs, behaviors
- **Products** — What you're building and why
- **Strategy** — Goals, OKRs, strategic initiatives

Lives in `context/` directory. AI reads this before starting work.

### Areas — Persistent Work Domains

Areas represent ongoing work that doesn't fit a project lifecycle: customer relationships, long-running initiatives, product surfaces you own. Unlike projects (time-bound, archived when done), areas accumulate intelligence over quarters.

- **Per-area context** in `areas/{slug}.md` + `context/{slug}/`
- **Recurring meetings** map to areas via frontmatter — meeting prep auto-pulls area context
- **Decisions and commitments** route to the correct area on processing
- **Goals and projects** link to areas so weekly planning is area-organized

Start with: `arete create area customer-acme --name "Customer: Acme Corp"`

### Topic Wiki — Themes That Build Up Over Time

Topic pages aggregate everything your workspace knows about a recurring theme — a pricing decision, a vendor evaluation, a strategic bet. Topics are detected lexically from meetings and Slack threads, and the topic wiki feeds back into future meeting extractions so recaps emit *deltas* (new decisions, changed plans) instead of restating what's already on the page.

- **`arete topic list`** — see active topics
- **`arete topic show <slug>`** — read a topic page
- **`arete topic refresh <slug>`** — rebuild narrative from sources (meetings + slack-digests)
- **`arete topic find <query>`** — find topics by keyword
- **`arete topic lint`** — surface stale, stub, or orphan topics

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

### Meeting & Async Intelligence

Never lose track of what was discussed — in meetings *or* in Slack:
- **Meeting Prep** — Brief with attendee context, recent meetings, action items
- **Pull Recordings** — Fathom and Krisp integrations import transcripts and summaries
- **Process Meetings** — Cross-meeting dedup, confidence scoring, wiki-leaning extraction with `## Core` and `## Could include` sections
- **Slack Digest** — Daily Slack recap that extracts decisions/commitments/topic updates the same way meetings do
- **Daily / Weekly Winddown** — End-of-day and end-of-week skills that process backlog, surface side threads for promotion, and close out the period

Start with: "Help me prep for my meeting with [person]" or "Daily winddown"

### Institutional Memory

Capture knowledge that outlasts projects:
- **Decisions** — Key decisions with rationale
- **Learnings** — User insights, market observations, process improvements
- **Commitments** — What you owe whom (and what they owe you), with momentum scoring
- **Observations** — How you work best with AI

Memory is searchable, deduplicated across meetings, and automatically surfaced in relevant contexts.

### Planning System

Align work from horizon to today:
- **Goal** — A focused outcome you're driving toward
- **Focus** — What you're investing energy in this quarter / month
- **Horizon** — Longer-arc bets and watchlist items
- **Week** — Outcomes + tasks (Must / Should / Could) + key meetings, organized by area
- **Daily** — Today's plan with scored tasks, meeting context, and overdue commitments

Start with: "Plan my week" or "What's on my plate today?"

### Inbox — Universal Capture

Drop anything — URLs, files, PDFs, raw notes — and route it later:

```bash
arete inbox add --title "Note" --body "Content"
arete inbox add --url https://example.com
arete inbox add --file ./report.pdf
```

Then say **"Triage my inbox"** to route items to the right place (week tasks, memory, areas, person files).

### Workspace Hygiene

Clean accumulated entropy with a single command:

```bash
arete hygiene scan         # detect stale meetings, resolved commitments, bloated logs
arete hygiene apply        # interactive checkbox approval (tier 1 pre-checked)
```

---

## Documentation

### For Users (Product Builders)

- **[GUIDE.md](packages/runtime/GUIDE.md)** — Comprehensive user reference (shipped to workspace)
- **[SETUP.md](SETUP.md)** — Installation, integrations, troubleshooting
- **[ONBOARDING.md](ONBOARDING.md)** — First-time setup checklist
- **[UPDATES.md](packages/runtime/UPDATES.md)** — What's new, week-by-week (user-facing release notes)

### For Developers (Areté Maintainers)

- **[DEVELOPER.md](DEVELOPER.md)** — Architecture, systems, contribution guide
- **[AGENTS.md](AGENTS.md)** — System awareness reference for build-mode AI agents
- **[CHANGELOG.md](CHANGELOG.md)** — Build/developer changelog (versioned)
- **dev/** — Build system, PRDs, and plans

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

Areté is organized as a monorepo:

- **@arete/core** — Intelligence and service layer (context, memory, entity, briefing, topics, integrations)
- **@arete/cli** — Command-line interface (thin wrapper over core services)
- **@arete/runtime** — Workspace content (skills, tools, templates, rules) installed into user workspaces
- **@arete/apps** — Local web dashboard (`backend` API + `web` React UI) for meeting triage and review

### Key Intelligence Features

- **Temporal Intelligence** — Timeline queries, recency signals ("when was X last discussed?")
- **Proactive Context** — Automatic deep source search across all workspace content with freshness tracking
- **Entity Relationships** — Track who works on what, attended where, mentioned where
- **Briefing Assembly** — Combine context + memory + entities + relationships into comprehensive briefings, with AI synthesis

---

## Key Features

### Intelligence Services

Areté provides intelligence that powers any workflow:

- **Unified Search** — Find relevant files across context, memory, areas, projects, meetings, people — with freshness tracking and temporal views
- **Entity Resolution** — Match ambiguous names to people, meetings, projects
- **Entity Relationships** — Track works_on, attended, mentioned_in relationships
- **Briefing Assembly** — Gather context, memory, entities, and relationships before complex work, AI-synthesized into 5 sections (Status, Decisions, People, Activity, Open Questions)
- **Temporal Intelligence** — Timeline queries showing how topics evolve over time
- **Routing** — `arete route "<query>"` picks the best skill and model tier for what you're trying to do
- **Daily / Momentum Briefs** — `arete daily` and `arete momentum` surface what's hot, stale, or critical across commitments and relationships

These services run automatically inside skills, or manually via CLI:

```bash
arete search "mobile app redesign"
arete search "mobile app redesign" --inventory          # freshness dashboard
arete search "pricing decisions" --scope memory
arete search "onboarding" --timeline --days 90          # temporal view
arete resolve "Jane"
arete brief --for "competitive analysis"                # AI-synthesized briefing
arete brief --for "competitive analysis" --raw         # raw context dump
arete route "what should I do about the Acme renewal?"  # pick the right skill
arete daily                                             # morning brief
arete momentum                                          # commitment + relationship momentum
arete commitments list                                  # open commitments across all relationships
arete topic list                                        # active topic pages
arete index                                             # re-index search after manual edits
arete view                                              # open meeting triage web app
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

- **Calendar (macOS)** — Pull events for meeting prep and planning via `ical-buddy`
- **Google Calendar** — OAuth-based calendar sync for meeting prep and availability (FreeBusy)
- **Fathom** — Import meeting recordings and transcripts
- **Krisp** — Pull meeting recordings, transcripts, summaries, and action items
- **Slack** — Pull conversation threads via the `slack-digest` skill; threads feed memory and the topic wiki
- **Notion** — Pull pages into your workspace as searchable markdown (`arete pull notion`)
- (Future: Linear, Figma)

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
- **GitHub**: [github.com/johnkoht/arete](https://github.com/johnkoht/arete)
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
