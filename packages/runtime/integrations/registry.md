# Integration Registry

Track available integrations, their status, and configuration.

## Status Legend

| Status | Meaning |
|--------|---------|
| **Available** | Config exists, not yet activated |
| **Active** | Configured and working |
| **Error** | Requires attention |
| **Planned** | Not yet implemented |

---

## Meetings & Communication (Priority 1)

| Integration | Type | Status | Capabilities | Config |
|-------------|------|--------|--------------|--------|
| Fathom | Meeting Recorder | Available | Pull, Seed | [fathom.yaml](configs/fathom.yaml) |
| Krisp | Meeting Recorder | Available | Pull | [krisp.yaml](configs/krisp.yaml) |
| Granola | Meeting Recorder | Planned | Pull, Seed | - |
| Apple Calendar | Calendar | Available | Pull, Push, Seed | [calendar.yaml](configs/calendar.yaml) |
| Google Calendar | Calendar | Available | Pull | [calendar.yaml](configs/calendar.yaml) |
| Outlook Calendar | Calendar | Planned | Pull, Push | - |
| Slack | Communication | Planned | Pull, Push | - |
| Apple Mail | Communication | Planned | Pull | - |

## Project Management

| Integration | Type | Status | Capabilities | Config |
|-------------|------|--------|--------------|--------|
| Linear | Project Management | Planned | Pull, Push | - |
| Jira | Project Management | Planned | Pull, Push | - |
| Asana | Project Management | Planned | Pull, Push | - |
| Notion | Documentation | Available | Pull | [notion.yaml](configs/notion.yaml) |

## Analytics & Customer Voice

| Integration | Type | Status | Capabilities | Config |
|-------------|------|--------|--------------|--------|
| Amplitude | Analytics | Planned | Pull | - |
| Mixpanel | Analytics | Planned | Pull | - |
| Intercom | Customer Voice | Planned | Pull | - |
| Zendesk | Customer Voice | Planned | Pull | - |

## Design & Engineering

| Integration | Type | Status | Capabilities | Config |
|-------------|------|--------|--------------|--------|
| Figma | Design | Planned | Pull | - |
| GitHub | Engineering | Planned | Pull | - |
| GitLab | Engineering | Planned | Pull | - |

---

## Recently Synced

| Integration | Last Sync | Items | Status |
|-------------|-----------|-------|--------|
| - | - | - | No syncs yet |

---

## Sync History

Track recent sync operations for debugging and auditing.

| Timestamp | Integration | Operation | Items | Result |
|-----------|-------------|-----------|-------|--------|
| - | - | - | - | No history yet |

---

## Notes

- **Priority 1** integrations (Meetings & Communication) are being implemented first
- See individual config files in `configs/` for detailed settings
- Credentials are stored outside this repo in `~/.arete/credentials.yaml`
- **Krisp**: Requires Core plan or higher. Auth: OAuth 2.0 with dynamic client registration (browser flow). Commands: `arete integration configure krisp` (one-time) / `arete pull krisp [--days N]`
