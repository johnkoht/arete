# Essential CLI Commands

## Intelligence Services

- `arete route "<query>"` - Route user message to best skill and suggest model tier
- `arete skill route "<query>"` - Route to skill only (for agents before loading skill)
- `arete brief --for "task" --skill <name>` - Assemble primitive briefing (context + memory + entities + relationships)
- `arete context --for "query"` - Get relevant workspace files for a task
- `arete context --for "query" --inventory` - Show context freshness dashboard with coverage gaps
- `arete memory search "query"` - Search decisions, learnings, and observations
- `arete memory timeline "query" [--days N] [--json]` - Temporal view of a topic with recurring themes
- `arete resolve "reference"` - Resolve ambiguous names (people, meetings, projects)

## People & Entities

- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show person details
- `arete people memory refresh [--person <slug>] [--if-stale-days N]` - Refresh person memory highlights from meetings (stale-aware)
- `arete availability find --with <name|email>` - Find mutual availability with a person (uses Google Calendar FreeBusy)

## Integrations

- `arete integration configure calendar` - Configure macOS Calendar (ical-buddy)
- `arete integration configure google-calendar` - Configure Google Calendar OAuth
- `arete pull` - Sync from integrations (meetings, calendar)
- `arete pull calendar [--today|--days N]` - Pull calendar events
- `arete pull fathom [--days N]` - Pull Fathom recordings

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


