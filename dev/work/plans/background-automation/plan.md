---
title: Background Automation
slug: background-automation
status: idea
size: large
created: 2026-02-27
tags: []
---

# Background Automation for Areté

## Problem

Areté is currently interactive-only. Users must manually run `arete pull`, `arete context`, etc. There's no way to:
- Schedule recurring jobs (weekly planning, daily standup prep)
- React to external events (new Krisp recording, Notion changes)
- Run background processes that feed into the workspace

This limits Areté's value as a "Product OS" — a true OS runs things in the background.

## User Stories

1. **Weekly Planning**: Every Sunday evening, pull my calendar for the week ahead, check last week's meetings, and draft a weekly plan I can review Monday morning.

2. **Daily Task Nudge**: Every weekday morning, check my Notion tasks and promises I made in conversations, then nudge me or update my priority list.

3. **Notion Sync**: Whenever my Notion databases change, sync updates to my workspace so context is always fresh.

4. **Recording Auto-Import**: When a Krisp recording completes, automatically pull it and re-index so it's searchable immediately.

## Proposed Solution

### Core Components

#### 1. Job Scheduler (`arete job` / `arete daemon`)

```bash
# Define jobs
arete job add weekly-plan --schedule "0 20 * * 0" --config .arete/jobs/weekly-plan.yaml
arete job add morning-prep --schedule "0 8 * * 1-5" --config .arete/jobs/morning-prep.yaml

# Manage
arete job list
arete job run weekly-plan        # Manual trigger
arete job logs weekly-plan
arete job remove weekly-plan

# Run daemon
arete daemon start               # Foreground (for testing)
arete daemon start --background  # Daemonize
arete daemon status
arete daemon stop
```

#### 2. Job Configuration (`.arete/jobs/*.yaml`)

```yaml
# .arete/jobs/weekly-plan.yaml
name: weekly-plan
description: Draft weekly plan from calendar and last week's meetings
schedule: "0 20 * * 0"  # Sunday 8pm

steps:
  - run: arete pull calendar --days 14
  - run: arete context --for "weekly planning" --output .arete/jobs/output/weekly-context.md
  - skill: weekly-planning  # invoke skill with context
    output: now/weekly-plan-draft.md

notify:
  - type: desktop
    message: "Weekly plan draft ready"
  - type: slack
    webhook: ${SLACK_WEBHOOK_URL}
    
on_error:
  notify: true
  retry: false
```

```yaml
# .arete/jobs/morning-prep.yaml
name: morning-prep
description: Daily priorities and task nudge
schedule: "0 8 * * 1-5"  # Weekdays 8am

steps:
  - run: arete pull calendar --today
  - run: arete pull notion --database tasks
  - run: arete context --for "daily priorities"
  - skill: daily-standup-prep
    input:
      calendar: resources/calendar/today.md
      tasks: resources/notion/tasks.md
    output: now/today.md

notify:
  - type: desktop
```

#### 3. Webhook Server (`arete webhook`)

```bash
arete webhook start --port 8765
# Listens on http://localhost:8765/hooks/:name

arete webhook list
arete webhook logs krisp-recording
```

Webhook handlers (`.arete/hooks/*.yaml`):

```yaml
# .arete/hooks/krisp-recording.yaml
name: krisp-recording
description: Auto-import new Krisp recordings

# Krisp would POST to http://localhost:8765/hooks/krisp-recording
# For public access, use ngrok/Cloudflare Tunnel

steps:
  - run: arete pull krisp --latest
  - run: arete index

notify:
  - type: desktop
    message: "New recording imported: {{payload.title}}"
```

```yaml
# .arete/hooks/notion-sync.yaml
name: notion-sync
description: Sync on Notion database changes

steps:
  - run: arete pull notion --database {{payload.database_id}}
  - run: arete index
```

#### 4. Polling for Services Without Webhooks

Some services don't support webhooks (or require enterprise plans). Add polling:

```yaml
# .arete/jobs/krisp-poll.yaml
name: krisp-poll
description: Check for new Krisp recordings every 15 minutes
schedule: "*/15 * * * *"

steps:
  - run: arete pull krisp --if-new  # Only process if new recordings exist
  - run: arete index --if-changed

notify:
  - type: desktop
    condition: new_recordings > 0
```

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   arete daemon                       │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Scheduler  │  │   Webhook   │  │   Poller    │ │
│  │  (node-     │  │   Server    │  │  (interval  │ │
│  │  schedule)  │  │   (fastify) │  │   checks)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │        │
│         └────────────────┼────────────────┘        │
│                          ▼                          │
│                   ┌─────────────┐                   │
│                   │ Job Runner  │                   │
│                   │ - Run steps │                   │
│                   │ - Invoke    │                   │
│                   │   skills    │                   │
│                   │ - Notify    │                   │
│                   └─────────────┘                   │
│                          │                          │
│                          ▼                          │
│                   ┌─────────────┐                   │
│                   │   Logger    │                   │
│                   │ .arete/logs │                   │
│                   └─────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### File Structure

```
.arete/
├── jobs/
│   ├── weekly-plan.yaml
│   ├── morning-prep.yaml
│   └── output/           # Job outputs
├── hooks/
│   ├── krisp-recording.yaml
│   └── notion-sync.yaml
├── logs/
│   ├── daemon.log
│   ├── jobs/
│   │   ├── weekly-plan.log
│   │   └── morning-prep.log
│   └── hooks/
│       └── krisp-recording.log
└── daemon.pid            # PID file when running
```

## Implementation Phases

### Phase 1: Job Scheduler (MVP)
**Goal**: Time-based automation with CLI commands

- [ ] Job config schema and loader
- [ ] `arete job add/list/remove/run/logs` commands
- [ ] Scheduler using node-schedule
- [ ] `arete daemon start/stop/status`
- [ ] Desktop notifications (node-notifier)
- [ ] Logging infrastructure
- [ ] Docs and examples

**Enables**: Weekly planning, daily prep, any scheduled `arete` command

### Phase 2: Webhook Server
**Goal**: Event-driven automation

- [ ] Webhook server (fastify)
- [ ] Hook config schema and loader
- [ ] `arete webhook start/list/logs` commands
- [ ] Webhook security (signatures, tokens)
- [ ] Tunnel integration docs (ngrok, Cloudflare)

**Enables**: Krisp webhooks, Notion webhooks, GitHub webhooks

### Phase 3: Skill Integration
**Goal**: Jobs can invoke skills, not just CLI commands

- [ ] `skill:` step type in job config
- [ ] Skill invocation with input/output
- [ ] Agent model selection for skill execution
- [ ] Result handling and templating

**Enables**: AI-powered background jobs (weekly planning skill, etc.)

### Phase 4: Polling & Smart Sync
**Goal**: Handle services without webhooks

- [ ] `--if-new` / `--if-changed` flags on pull commands
- [ ] Polling job type with deduplication
- [ ] Change detection and caching

**Enables**: Krisp polling (no webhook), Notion polling (webhook is beta)

## Technical Considerations

### Daemon Process Management
- Use `pm2` or custom PID management?
- Recommend: Simple PID file + signal handling initially, consider pm2 later

### Webhook Security
- Signature verification (HMAC) for supported services
- Bearer token auth for custom webhooks
- Rate limiting

### Skill Execution in Background
- Skills may need agent/LLM access
- Need to handle API keys, model selection
- Consider: skill execution as subagent spawn?

### Notification Channels
- Desktop: node-notifier (cross-platform)
- Slack: webhook POST
- Email: optional (SMTP or service)
- Future: macOS Shortcuts integration?

### Error Handling
- Retry policies (exponential backoff?)
- Error notifications
- Job history and failure tracking

## Dependencies

- `node-schedule`: Cron-like scheduling
- `fastify`: Lightweight webhook server
- `node-notifier`: Desktop notifications
- Existing: `arete pull`, `arete context`, `arete index`, skill system

## Open Questions

1. **Daemon vs launchd**: Should `arete daemon` be a long-running Node process, or generate launchd/systemd configs?
   - Daemon: More portable, simpler UX
   - launchd: OS-managed, survives reboots, but macOS-only

2. **Skill execution model**: How do background jobs invoke skills that need LLM?
   - Option A: Shell out to `pi` with skill flag
   - Option B: Direct skill runner with API keys
   - Option C: Queue for next interactive session

3. **Webhook tunnel**: Bundle ngrok/Cloudflare Tunnel or just document?

4. **State persistence**: Where to store job run history, last poll timestamps?
   - `.arete/state/jobs.json`?

## Success Metrics

- User can set up weekly planning job in <5 minutes
- Jobs run reliably without user intervention
- New Krisp recordings appear in search within 15 minutes
- Clear logs for debugging failed jobs

## Related

- Krisp integration: `packages/core/src/integrations/krisp/`
- Notion integration: `packages/core/src/integrations/notion/`
- Skill system: `packages/runtime/skills/`
