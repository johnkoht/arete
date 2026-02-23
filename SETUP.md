# Areté Setup Guide

> **For usage documentation and workflows**, see [GUIDE.md](GUIDE.md) in your workspace after install.
> This guide covers installation and integration setup only.

---

## Installation

### Quick Start

```bash
# Install globally
npm install -g @arete/cli

# Create new workspace
arete install ~/my-pm-workspace

# Or for Claude Code
arete install ~/my-pm-workspace --ide claude

# Check workspace status
cd ~/my-pm-workspace
arete status
```

### Choosing Your IDE

Areté supports **Cursor** and **Claude Code**. Choose at install time:

- **Cursor** (default): `arete install` or `arete install --ide cursor`
  - Creates `.cursor/` with `.mdc` rules
- **Claude Code**: `arete install --ide claude`
  - Creates `.claude/` with `.md` rules and root `CLAUDE.md`

The `ide_target` field in `arete.yaml` stores your choice. `arete update` uses it when regenerating rules.

**Note**: One IDE per workspace. If both `.cursor/` and `.claude/` exist without explicit `ide_target`, `arete status` will warn—set `ide_target` in `arete.yaml` to resolve.

---

## Initial Workspace Setup

After installation, fill in your context files (priority order):

1. **context/business-overview.md** - Company basics
2. **context/users-personas.md** - Target users
3. **context/products-services.md** - What you're building

See [GUIDE.md](GUIDE.md) § Getting Started for complete onboarding checklist.

---

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

### 3. Calendar Setup (macOS or Google Calendar)

The calendar integration enables automatic daily planning with meeting context. Areté supports:

- **macOS Calendar** via `ical-buddy`
- **Google Calendar** via OAuth

#### Option A: macOS Calendar (ical-buddy)

```bash
brew install ical-buddy
arete integration configure calendar
arete pull calendar --today
```

The configure command lists your local macOS calendars and saves your selected list to `arete.yaml` under `integrations.calendar.calendars`.

#### Option B: Google Calendar (OAuth)

```bash
arete integration configure google-calendar
arete pull calendar --today
```

During configure, Areté opens your browser for Google OAuth. If you see an **"unverified app"** screen, click:

1. **Advanced**
2. **Go to Areté (unsafe)**

Then grant read-only calendar access and return to the terminal.

#### Usage

```bash
# View today's events
arete pull calendar --today

# View next N days
arete pull calendar --days 7

# JSON output (for skills/automation)
arete pull calendar --today --json
```

**Person Matching**: Calendar attendees are automatically matched to people in your workspace (by email). When viewing events, you'll see person slugs and file paths for attendees in your workspace, making it easy to pull up context before meetings.

**Skills Integration**: The **daily-plan** skill uses calendar data to build meeting context for each of today's meetings. It shows who you're meeting with, what you owe them, recent meetings, and prep suggestions.

### 4. Optional: MCP Integrations

MCP (Model Context Protocol) integrations extend the workspace with external tools. These are optional but unlock additional capabilities.

#### Prototype prompts (Lovable)

The `generate-prototype-prompt` skill creates a **Knowledge file** and **implementation prompt** from a PRD, plan, or short conversation. You paste both into [Lovable](https://lovable.dev) to build the prototype. No MCP or API required.

- **Input:** PRD, plan file, or 4–5 quick questions
- **Output:** `prototypes/YYYY-MM-DD_[name]/` with `knowledge.md`, `implementation.md`, and `README.md`
- **Next step:** Create a project at lovable.dev, paste Knowledge and implementation prompt, then build

See [Lovable best practices](https://docs.lovable.dev/tips-tricks/best-practice) and [from idea to app](https://docs.lovable.dev/tips-tricks/from-idea-to-app) for best results.

#### Other MCP Options

See `scratchpad.md` → "MCP Integrations" for future integration ideas:
- **Linear**: Sync roadmap items, create issues from PRDs
- **Notion**: Pull/push documentation, export PRDs
- **Figma**: Reference designs in PRDs and competitive analysis

#### Configuring MCP in Cursor

1. Open Cursor Settings (Cmd+Shift+J)
2. Navigate to the MCP section
3. Add your MCP server URL and authenticate

### 5. Start Using the Workspace

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

---

## Troubleshooting

### Rules Not Loading

**Cursor**: Check that `.cursor/rules/` exists and contains `.mdc` files. Run `arete update` to regenerate. Try reloading the Cursor window.

**Claude Code**: Check that `.claude/rules/` exists and contains `.md` files, and `CLAUDE.md` exists at root. Run `arete update` to regenerate.

### QMD Issues

**Installation fails on Apple Silicon**:
- Error: "llama.cpp is not supported under Rosetta"
- Solution: Use native arm64 Node.js (not x64/Rosetta)
  ```bash
  # Check architecture (should show arm64)
  node -p "process.arch"
  
  # If x64, install arm64 node via nvm
  arch -arm64 nvm install 20
  arch -arm64 nvm use 20
  
  # Then reinstall qmd
  npm install -g https://github.com/tobi/qmd
  ```

**QMD not finding content**: Run `qmd update` to re-index and `qmd embed` to regenerate embeddings.

**QMD search seems slow**: First search after `qmd embed` loads models (~30s). Subsequent searches are fast.

### Calendar Not Working

**macOS (ical-buddy) not found**: Install with `brew install ical-buddy`.

**Google Calendar auth expired**: Re-run `arete integration configure google-calendar`.

**Google unverified-app screen**: Continue via **Advanced** → **Go to Areté (unsafe)**.

**No events showing**: Re-run configure for your provider and confirm calendars are selected.

**macOS permission denied**: Grant terminal (iTerm, Terminal.app) access to Calendar in System Settings → Privacy & Security → Calendar.

### Common Errors

**"Workspace not found"**: Run `arete status` to check workspace validity. Ensure `arete.yaml` exists.

**"Integration not configured"**: Run `arete integration configure <name>` to set up integration.

---

For complete usage documentation, see [GUIDE.md](GUIDE.md) in your workspace.
