# CLI ↔ Backend Gap Analysis

> Generated: 2026-03-07  
> Scope: `packages/cli/src/commands/` vs `packages/apps/backend/src/routes/`

---

## Summary

The CLI and backend were built independently and have significant coverage mismatches. The backend (serving the web UI) covers a richer meeting-centric read/write model, while the CLI covers a broader set of workspace management operations that have no backend equivalent. Several important CLI capabilities (commitments, availability, daily brief, momentum, intelligence routes) are not surfaced as API endpoints, and the backend has data models (goals, projects, memory parsing) that the CLI never touches directly.

---

## CLI Commands Inventory

| Command | Subcommands | Description |
|---------|------------|-------------|
| `availability` | `find` | Find mutual free/busy with colleagues |
| `calendar` | `create` | Create a calendar event |
| `commitments` | `list`, `resolve <id>` | Track and resolve open commitments |
| `daily` | _(none)_ | Morning intelligence brief |
| `index` | _(none)_ | Re-index search collection |
| `install [dir]` | _(none)_ | Initialize new workspace |
| `integration` | `list`, `configure <name>` | Manage integrations |
| `intelligence/context` | `--for`, `--inventory` | Assemble workspace context |
| `memory` | `search`, `timeline` | Query decisions/learnings/observations |
| `resolve` | _(none)_ | Resolve ambiguous entity references |
| `brief` | `--for`, `--skill` | Assemble primitive briefing |
| `meeting` | `add`, `process` | Add or process meeting files |
| `momentum` | _(none)_ | Commitment + relationship momentum view |
| `onboard` | _(none)_ | Quick identity setup for new workspaces |
| `people` | `list`, `show`, `index`, `intelligence digest`, `memory refresh` | People management |
| `pull [integration]` | _(none)_ | Sync from integrations (krisp, calendar) |
| `route <query>` | _(none)_ | Route query to best skill + model tier |
| `seed [source]` | _(none)_ | Import data / test fixtures |
| `skill` | `list`, `install`, `route`, `defaults`, `set-default`, `unset-default` | Manage skills |
| `status` | _(none)_ | Workspace health overview |
| `template` | `resolve`, `list`, `view` | Resolve and view skill templates |
| `tool` | `list`, `show` | List available tools |
| `update` | _(none)_ | Pull latest skills/tools from upstream |
| `view` | _(none)_ | Open workspace in browser (meeting triage UI) |

---

## Backend Routes Inventory

| Route | Methods | Description |
|-------|---------|-------------|
| `/api/calendar/today` | GET | Pull today's calendar events (shells to `arete pull calendar`) |
| `/api/goals` | GET | Quarter outcomes + week priorities from goals/ files |
| `/api/intelligence/patterns` | GET | Cross-person signal patterns |
| `/api/intelligence/commitments/summary` | GET | Commitment counts by status |
| `/api/intelligence/:id` (commitments) | PATCH | Update commitment status |
| `/api/jobs/:id` | GET | Async job status |
| `/api/meetings` | GET | List meeting summaries |
| `/api/meetings/sync` | POST | Trigger `arete pull krisp` (async job) |
| `/api/meetings/:slug` | GET, PUT, DELETE | Get/update/delete meeting |
| `/api/meetings/:slug/items/:id` | PATCH | Update meeting item |
| `/api/meetings/:slug/approve` | POST | Approve meeting |
| `/api/meetings/:slug/process-people` | POST | Run people intelligence on meeting |
| `/api/meetings/:slug/process` | POST | Process meeting with AI agent |
| `/api/meetings/:slug/process-stream` | GET (SSE) | Stream AI processing output |
| `/api/memory` | GET | All memory items (decisions + learnings) |
| `/api/memory/recent` | GET | Recent memory items |
| `/api/people` | GET | List people summaries |
| `/api/people/:slug` | GET | Person detail |
| `/api/people/:slug/notes` | PATCH | Update person notes |
| `/api/projects` | GET | List active projects |
| `/api/search` | GET | Full-text search across workspace |
| `/api/settings/apikey` | GET, POST | Read/write Anthropic API key |

---

## Gap Analysis

### 1. CLI Has No Backend Equivalent

These CLI capabilities exist only locally — no API endpoint exposes them to the web UI or external consumers.

| CLI Command | Gap | Impact |
|-------------|-----|--------|
| `availability find` | No `/api/availability` endpoint | Web UI can't surface mutual free/busy |
| `commitments list/resolve` | Only `/api/intelligence/commitments/summary` exists; no list or resolve endpoint | Web UI has read-only summary, can't manage commitments fully (PATCH exists on `/api/intelligence/:id` but not wired to CLI) |
| `daily` | No `/api/daily` endpoint | Morning brief is CLI-only; web UI has no daily summary view |
| `index` | No `/api/index` endpoint | Can't trigger re-indexing from web UI |
| `integration list/configure` | No `/api/integration` endpoint | Integration status invisible to web UI |
| `context --for` | No `/api/context` endpoint | Intelligence context assembly is CLI-only |
| `memory search/timeline` | No `/api/memory/search` or `/api/memory/timeline` | Web UI only shows all memory items; no query, no timeline |
| `resolve` | No `/api/resolve` endpoint | Entity resolution is CLI-only |
| `brief` | No `/api/brief` endpoint | Briefing assembly is CLI-only |
| `meeting add` | No `/api/meetings/add` from file | CLI can ingest meeting JSON; web UI can't trigger this path |
| `momentum` | No `/api/momentum` endpoint | Commitment + relationship momentum invisible to web UI |
| `people intelligence digest` | No `/api/people/intelligence/digest` | Batch people classification is CLI-only |
| `people memory refresh` | No `/api/people/:slug/memory/refresh` | Memory refresh is CLI-only |
| `route` | No `/api/route` endpoint | Skill routing invisible to web UI |
| `skill list/install` | No `/api/skill` endpoint | Skill management is CLI-only |
| `status` | No `/api/status` endpoint | Workspace health check is CLI-only |
| `template resolve/list/view` | No `/api/template` endpoint | Template resolution is CLI-only |
| `tool list/show` | No `/api/tool` endpoint | Tool listing is CLI-only |
| `pull` | No generic `/api/pull` endpoint; only `/api/meetings/sync` covers krisp | Calendar sync and other integrations can't be triggered from web UI |
| `install`, `onboard`, `seed`, `update` | Setup/lifecycle commands — no backend equivalent needed | Low impact; these are one-time or dev-only operations |

---

### 2. Backend Has No CLI Equivalent

These backend data models and routes exist but are not accessible via `arete` CLI commands.

| Backend Route | Gap | Impact |
|---------------|-----|--------|
| `/api/goals` | No `arete goals` command | Goals/quarter outcomes only viewable in web UI |
| `/api/projects` | No `arete projects` command | Project listing is web-UI-only |
| `/api/search` | No `arete search` CLI command against backend | CLI has `arete index` (Orama) but no HTTP search against the backend's file-scan search |
| `/api/settings/apikey` | No `arete settings` command | API key management requires direct file editing or web UI |
| `/api/meetings/:slug` full CRUD | CLI has `meeting add/process` but no `meeting update/delete/approve` | Meeting lifecycle management requires web UI |
| `/api/jobs/:id` | No CLI job tracking | Async job status only visible to web UI |

---

### 3. Behavioral Mismatches (Same Domain, Different Model)

| Domain | CLI Behavior | Backend Behavior | Mismatch |
|--------|-------------|-----------------|----------|
| **Memory** | `memory search` queries Orama index; `memory timeline` does temporal grouping | `/api/memory` returns raw parsed items from decisions.md + learnings.md | Two different data models: indexed vs. file-parsed. Search is CLI-only. |
| **Meetings sync** | `pull` triggers any integration (krisp, fathom, calendar) | `/api/meetings/sync` shells to `arete pull krisp` only | Backend hardcodes krisp; calendar and fathom sync can't be triggered from web |
| **Commitments** | `commitments list/resolve` reads/writes `.arete/commitments.json` | `/api/intelligence/commitments/summary` reads same file; PATCH on `/api/intelligence/:id` updates status | Partial overlap but CLI resolve and backend PATCH are not equivalent; PATCH may not cover all resolve semantics |
| **People index** | `people index` regenerates `people/index.md` | `/api/people` scans `people/**/*.md` dynamically | Index file is CLI-generated; backend ignores it and re-scans every request |
| **Calendar** | `calendar create` writes to macOS Calendar via ical-buddy | `/api/calendar/today` shells to `arete pull calendar --today --json` | Create is CLI-only; backend is read-only |

---

## Priority Assessment

### High Priority Gaps (block web UI completeness)

1. **`/api/commitments` full CRUD** — web UI has summary-only; list + resolve is needed
2. **`/api/pull` (generic or per-integration)** — calendar and fathom sync unreachable from web
3. **`/api/daily`** — morning brief is a core PM value prop; web UI missing it entirely
4. **`/api/memory/search` + `/api/memory/timeline`** — memory is query-dead in web UI
5. **`/api/momentum`** — commitment + relationship momentum view missing from web

### Medium Priority Gaps (useful but not blocking)

6. **`/api/availability`** — scheduling intelligence surfaceable in web
7. **`/api/people/:slug/memory/refresh`** — person memory refresh triggerable from web
8. **`/api/context` + `/api/brief`** — intelligence primitives accessible as API
9. **`/api/status`** — workspace health in web UI
10. **`arete goals` CLI command** — goals accessible from CLI/agents

### Low Priority (CLI-only makes sense or dev-only)

- `install`, `onboard`, `seed`, `update` — lifecycle commands; no web equivalent needed
- `template`, `tool`, `skill` — build/dev surface; web UI not needed
- `/api/jobs` — internal async machinery; CLI equivalent not needed
- `/api/settings/apikey` — a CLI `arete settings` command could be useful but low urgency

---

## Recommendations

1. **Unify the commitments surface** — backend PATCH and CLI resolve should share the same service layer; add GET list endpoint
2. **Make pull integration-agnostic** — backend `/api/pull/:integration` or `/api/sync` instead of hardcoding krisp
3. **Add `/api/daily` endpoint** — compose calendar + commitments + intelligence patterns into a daily brief response
4. **Expose memory search via API** — proxy Orama queries or replicate filter/timeline logic in backend
5. **Add `/api/momentum`** — commitment + relationship health in a single endpoint for web dashboard widget
6. **Document the seam** — what belongs to CLI-only (workspace setup, agent routing, template resolution) vs. what should be in both (data + intelligence queries)
