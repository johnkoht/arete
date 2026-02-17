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

## Integrations

- `arete pull` - Sync from integrations (meetings, calendar)
- `arete pull calendar [--today|--days N]` - Pull calendar events
- `arete pull fathom [--days N]` - Pull Fathom recordings

## Workspace Management

- `arete install [directory] [--ide cursor|claude]` - Create new workspace
- `arete status` - Check workspace health
- `arete update` - Update workspace structure and refresh core runtime assets (rules/skills), preserving overrides
- `arete skill list` - List available skills
- `arete skill install <url>` - Install skill from URL (e.g. skills.sh)
- `arete tool list` - List available tools
