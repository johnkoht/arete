# Areté Integrations

Integrations connect Areté to external tools, enabling bidirectional data flow and workflow automation. They allow PMs to pull context from their tools, push updates back, and seed historical data to bootstrap their workspace.

## Core Concepts

### Data Flow Types

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Systems                         │
│  Calendar  │  Fathom  │  Slack  │  Linear  │  Notion  │  ...   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │  Pull  │  │  Push  │  │  Seed  │
         └────┬───┘  └────┬───┘  └────┬───┘
              │           │           │
              ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Areté Workspace                          │
│   resources/  │  memory/  │  projects/  │  context/             │
└─────────────────────────────────────────────────────────────────┘
```

| Flow Type | Direction | Description |
|-----------|-----------|-------------|
| **Pull** | External → Areté | Read data from external systems into workspace |
| **Push** | Areté → External | Write updates from workspace to external systems |
| **Seed** | External → Areté (bulk) | Backfill historical data to bootstrap context |

### Integration Categories

| Category | Examples | Primary Use |
|----------|----------|-------------|
| **Communication** | Slack, Email | Capture discussions, share updates |
| **Meetings** | Calendar, Fathom, Granola | Schedule, transcripts, action items |
| **Documentation** | Notion, Confluence | Pull specs, push summaries |
| **Project Management** | Linear, Jira, Asana | Sync tasks, track progress |
| **Analytics** | Amplitude, Mixpanel | Pull usage data, metrics |
| **Customer Voice** | Intercom, Zendesk | Support themes, feedback |
| **Design** | Figma | Design specs, comments |
| **Engineering** | GitHub, GitLab | PRs, releases, technical context |

## Directory Structure

```
.cursor/integrations/
├── README.md              # This file - framework documentation
├── registry.md            # Available integrations and their status
└── configs/               # Per-integration configuration files
    ├── calendar.yaml      # Google/Outlook calendar config
    ├── fathom.yaml        # Fathom meeting recorder config
    ├── slack.yaml         # Slack workspace config
    └── ...
```

## Integration Configuration

Each integration is defined by a YAML configuration file in `configs/`. The configuration follows a standard contract:

```yaml
# .cursor/integrations/configs/[integration].yaml

# === Identity ===
name: integration-name        # Unique identifier
display_name: Integration     # Human-readable name
type: category                # meeting-recorder, calendar, communication, etc.
status: inactive              # inactive | active | error

# === Capabilities ===
capabilities:
  pull: true                  # Can read from external system
  push: false                 # Can write to external system
  seed: true                  # Supports historical backfill
  webhook: false              # Supports real-time events

# === Authentication ===
auth:
  type: oauth                 # oauth | api_key | none
  # Note: Actual credentials stored in ~/.arete/credentials.yaml (not in repo)

# === Sync Settings ===
sync:
  frequency: manual           # manual | daily | realtime
  last_sync: null             # ISO timestamp of last sync
  
# === Seed Settings ===
seed:
  supported_range: 90d        # Maximum historical lookback
  default_range: 30d          # Default if user doesn't specify
  filters_available:          # Available filter options
    - date_range
    - participants
    - keywords

# === Data Mapping ===
mapping:
  destination: resources/meetings/    # Where imported data goes
  naming: "{date}-{title}.md"         # Filename pattern
  template: templates/inputs/integration-meeting.md
```

## Using Integrations

### Manual Sync

Use the `sync` skill to manually pull or push data:

- "Sync my meetings from this week"
- "Pull my Fathom recordings from yesterday"
- "Push this project update to Slack"

### Seeding Historical Data

Use the `seed-context` tool for bulk historical imports:

- "Seed my context from Fathom for the last 2 months"
- "Import my meeting recordings since January"

See `.cursor/tools/seed-context/TOOL.md` for details.

### Automation (Future)

Planned automation capabilities:
- Pre-meeting brief generation
- Post-meeting processing (extract decisions, action items)
- Weekly digest generation
- Project status updates

## Authentication

**Credentials are never stored in the repository.**

Authentication options:

1. **Environment Variables** (recommended)
   ```bash
   export FATHOM_API_KEY="your-key"
   export SLACK_TOKEN="xoxb-your-token"
   ```

2. **External Config File**
   ```yaml
   # ~/.arete/credentials.yaml (gitignored location)
   fathom:
     api_key: "your-key"
   slack:
     token: "xoxb-your-token"
   ```

3. **MCP Servers** (where available)
   Some integrations use MCP servers that handle their own auth.

## MCP Integration

Many integrations can leverage Model Context Protocol (MCP) servers for real-time, agent-driven access:

| Integration | MCP Server | Status |
|-------------|------------|--------|
| Google Calendar | `@modelcontextprotocol/server-google-calendar` | Available |
| Slack | `@modelcontextprotocol/server-slack` | Available |
| GitHub | `@modelcontextprotocol/server-github` | Available |
| Notion | `@modelcontextprotocol/server-notion` | Available |
| Fathom | Custom required | Planned |

When an MCP server is available, the agent can interact with the external system directly without custom sync logic.

## Data Transformation

When data is pulled or seeded, it's transformed to match Areté's structure:

1. **Template Application**: Raw data is mapped to workspace templates
2. **Metadata Extraction**: Structured data (dates, attendees, etc.) is extracted
3. **Deduplication**: Existing entries are detected and skipped
4. **Destination Routing**: Data goes to the appropriate workspace location

### Destination Mapping

| Data Type | Destination | Template |
|-----------|-------------|----------|
| Meeting transcripts | `resources/meetings/` | `integration-meeting.md` |
| Calendar events | `resources/meetings/` | `meeting-note.md` |
| Slack threads | `resources/notes/` | `research-note.md` |
| Support tickets | `projects/[active]/inputs/` | Custom |

## Error Handling

Integration errors are tracked in the configuration:

```yaml
status: error
error:
  code: auth_expired
  message: "OAuth token expired. Please re-authenticate."
  timestamp: 2026-02-05T10:00:00Z
```

Common error states:
- `auth_expired`: Re-authentication required
- `rate_limited`: Too many requests, will retry
- `not_found`: Resource no longer exists
- `permission_denied`: Insufficient access

## Adding New Integrations

1. Create config file in `configs/[name].yaml`
2. Define capabilities, auth requirements, and mapping
3. Add to `registry.md`
4. Test with manual sync before enabling automation

## Related

- [Integration Registry](registry.md) - Available integrations and status
- [Sync Skill](../skills/sync/SKILL.md) - Manual sync operations
- [Seed Context Tool](../tools/seed-context/TOOL.md) - Historical data import
