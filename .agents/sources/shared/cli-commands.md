# Essential CLI Commands

## Intelligence Services

### ⚡ Intelligence Quick Reference

**When the user asks or you need context, reach for these proactively:**

| User Says / You Need | Run This | What It Searches |
|----------------------|----------|-----------------|
| "What do we know about X?" | `arete search "X"` | **Everything** — context, memory, meetings, people, projects |
| "What was decided about X?" | `arete search "X" --scope memory` | **Memory only** — decisions.md, learnings.md, observations.md (high signal) |
| "What's the history of X?" | `arete search "X" --timeline` | Memory items + meetings (temporal view with themes) |
| "Who is X?" / person mentioned | `arete resolve "X"` then `arete people show <slug> --memory` | Person file + memory highlights (recurring topics, stances, open items) |
| Filter results by person | `arete search "X" --person "Jane"` | Results mentioning that person |
| Prepping for a task or skill | `arete brief --for "task" --skill <name>` | Context + memory + entities + relationships combined |
| Starting a community skill | Check `requires_briefing` → `arete brief` if true | Full context for skills without built-in gathering |
| After editing workspace files | `arete index` | Rebuilds search so new content is findable |

**Key scope distinction**: `search` (default `--scope all`) = broad, all workspace files. `search --scope memory` = narrow, memory files only. `brief` = comprehensive, combines everything with entity relationships.

### Commands

#### Search (Primary)

- `arete search "<query>"` - Unified semantic search across workspace
  - `--scope <scope>` - Limit to scope (all|memory|meetings|context|projects|people), default: all
  - `--timeline` - Show results chronologically with recurring themes
  - `--days <n>` - Limit to last N days (with --timeline)
  - `--person <name>` - Filter by person (name or slug)
  - `--answer` - Synthesize AI-powered answer from results
  - `--limit <n>` - Maximum results (default: 15)
  - `--json` - Output JSON

#### Other Intelligence Commands

- `arete route "<query>"` - Route user message to best skill and suggest model tier
- `arete skill route "<query>"` - Route to skill only (for agents before loading skill)
- `arete brief --for "task" --skill <name>` - Assemble primitive briefing (context + memory + entities + relationships)
- `arete resolve "reference"` - Resolve ambiguous names (people, meetings, projects)
- `arete people show <slug|email> --memory` - Full person profile with auto-generated memory highlights (recurring topics, stances, open items, relationship health)

#### DEPRECATED Commands (use `arete search` instead)

> These commands still work but show deprecation warnings. They will be removed in a future version.

- `arete context --for "query"` - DEPRECATED: Use `arete search "query"` instead
- `arete context --for "query" --inventory` - Show context freshness dashboard with coverage gaps (not deprecated)
- `arete memory search "query"` - DEPRECATED: Use `arete search "query" --scope memory` instead
- `arete memory timeline "query" [--days N]` - DEPRECATED: Use `arete search "query" --timeline [--days N]` instead

## People & Entities

- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show person details
  - `--memory` - Include auto-generated memory highlights section
  - `--json` - Output as JSON
- `arete people memory refresh [--person <slug>] [--if-stale-days N]` - Refresh person memory highlights from meetings (stale-aware)
  - `--dry-run` - Preview what would be extracted without writing files
  - `--skip-qmd` - Skip automatic qmd index update
  - `--json` - Output as JSON
- `arete availability find --with <name|email>` - Find mutual availability with a person (uses Google Calendar FreeBusy)

## Commitments

- `arete commitments list` - List open commitments (what you owe people and what they owe you)
  - `--direction i_owe_them|they_owe_me` - Filter by direction
  - `--person <slug...>` - Filter by one or more person slugs (variadic)
  - `--json` - Output as JSON
- `arete commitments resolve <id>` - Resolve or drop a commitment (8-char prefix or full hash)
  - `--status resolved|dropped` - Mark as resolved (default) or dropped/de-scoped
  - `--yes` - Skip confirmation prompt (for skill/automation use)
  - `--skip-qmd` - Skip qmd index refresh
  - `--json` - Output as JSON

## Meetings

- `arete meeting add` - Add a meeting from JSON file or stdin
  - `--file <path>` - Path to meeting JSON
  - `--skip-qmd` - Skip automatic qmd index update
- `arete meeting extract <file>` - Extract intelligence from a meeting file using AI
  - `--json` - Output structured JSON
  - `--stage` - Write staged sections (Summary, Action Items, Decisions, Learnings) to meeting file with full metadata
  - `--clear-approved` - Clear approved sections before re-extracting (requires --stage)
  - `--dry-run` - Show what would be written without writing
  - `--skip-qmd` - Skip automatic qmd index update
  - Requires AI configuration (see `arete credentials set`)
- `arete meeting approve <slug>` - Commit staged items to memory files (decisions.md, learnings.md)
  - `--all` - Mark all pending items as approved before committing
  - `--items <id1,id2,...>` - Mark specific item IDs as approved
  - `--skip <id1,id2,...>` - Mark specific item IDs as skipped
  - `--skip-qmd` - Skip automatic qmd index update
  - `--json` - Output as JSON
- `arete meeting process` - Process a meeting file with People Intelligence classification
  - `--file <path>` - Path to meeting markdown file
  - `--latest` - Process latest meeting in resources/meetings
  - `--threshold <n>` - Confidence threshold override (default from policy or 0.65)
  - `--dry-run` - Analyze only; do not write people files or attendee_ids
  - `--json` - Output as JSON

## Integrations

- `arete integration configure calendar` - Configure macOS Calendar (ical-buddy)
- `arete integration configure google-calendar` - Configure Google Calendar OAuth
- `arete pull` - Sync from integrations (meetings, calendar)
- `arete pull calendar [--today|--days N]` - Pull calendar events
- `arete pull fathom [--days N]` - Pull Fathom recordings
- `arete view [--port <port>]` - Open the Areté meeting triage web app in the browser (sync, process, review, approve meetings)

## Calendar

- `arete calendar create --title <title> --start <datetime>` - Create a calendar event
  - `--duration <minutes>` - Duration (default: 30)
  - `--with <person>` - Person name or email to invite
  - `--description <text>` - Event description
  - `--json` - Output as JSON

## Templates

- `arete template resolve --skill <id> --variant <name>` - Resolve and print the active template for a skill (workspace override > skill default)
- `arete template resolve --skill <id> --variant <name> --path` - Print resolved file path only
- `arete template list [--skill <id>]` - List all skill templates; shows which have active workspace overrides
- `arete template view --skill <id> --variant <name>` - View resolved template content with source annotation

## Workspace Management

- `arete install [directory] [--ide cursor|claude]` - Create new workspace
- `arete status` - Check workspace health
- `arete update` - Update workspace structure and refresh core runtime assets (rules/skills), preserving overrides
- `arete index` - Re-index the search collection. Run after agents create/edit workspace files (context, projects, resources, people) to ensure new content is searchable
- `arete skill list` - List available skills
- `arete skill install <url>` - Install skill from URL (e.g. skills.sh)
- `arete tool list` - List available tools

## AI Configuration

### Credential Priority
Environment variables > OAuth (login) > API keys (file)

### Commands

- `arete credentials login [provider]` - Login via OAuth (Claude Pro/Max, GitHub Copilot, Google Gemini, etc.)
  - Opens browser for OAuth authentication; paste code when prompted
  - Tokens auto-refresh when expired
  - Available providers: anthropic, github-copilot, google-gemini-cli, google-antigravity, openai-codex
  - `--json` - Output as JSON
- `arete credentials set <provider>` - Set API key for a provider (validates with test call)
  - `--api-key <key>` - API key (non-interactive)
  - `--no-validate` - Skip validation test call
  - `--json` - Output as JSON
- `arete credentials show` - Show configured providers (OAuth and API keys, masked)
  - `--json` - Output as JSON
- `arete credentials test` - Test configured provider connections (OAuth tokens auto-refresh)
  - `--json` - Output as JSON
- `arete config show ai` - Display AI configuration (tiers, tasks, providers)
  - `--json` - Output as JSON
- `arete config set <path> <value>` - Set AI config value
  - `ai.tiers.<tier>` - Set model for tier (fast|standard|frontier)
  - `ai.tasks.<task>` - Set tier for task
  - `--json` - Output as JSON
