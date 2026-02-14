# Essential CLI Commands

## Intelligence Services

- `arete route "<query>"` - Route user message to best skill and suggest model tier
- `arete skill route "<query>"` - Route to skill only (for agents before loading skill)
- `arete brief --for "task" --skill <name>` - Assemble primitive briefing (context + memory + entities)
- `arete context --for "query"` - Get relevant workspace files for a task
- `arete memory search "query"` - Search decisions, learnings, and observations
- `arete resolve "reference"` - Resolve ambiguous names (people, meetings, projects)

## People & Entities

- `arete people list` - List people (optional `--category internal|customers|users`)
- `arete people show <slug|email>` - Show person details

## Integrations

- `arete pull` - Sync from integrations (meetings, calendar)
- `arete pull calendar [--today|--days N]` - Pull calendar events
- `arete pull fathom [--days N]` - Pull Fathom recordings

## Workspace Management

- `arete status` - Check workspace health
- `arete update` - Update structure and rules
- `arete skill list` - List available skills
- `arete tool list` - List available tools
