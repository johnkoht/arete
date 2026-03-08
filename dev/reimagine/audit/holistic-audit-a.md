# Holistic UI Audit - Part A

> Audited: 2026-03-07  
> Sources: `packages/apps/web/src/pages/`, `packages/apps/backend/src/routes/`, `~/code/arete-reserv/`

---

## UI Pages and Actions

### Dashboard (`/`)
**Read-only overview panel.** No direct writes; navigates to other pages.
- View commitment pulse: open count, due-this-week count, overdue count (clickable → `/commitments?filter=...`)
- View today's calendar meetings (from connected calendar)
- View active projects (name, status, last modified)
- View 5 most recent meetings (navigate to meeting detail)
- View 5 most recent memory items (navigate to `/memory`)
- View top 3 signal patterns (navigate to `/intelligence`)
- View recent activity feed (meeting processing events)

### Meetings Index (`/meetings`)
**Both read and write.**
- List all meetings with title, date, status, attendees, duration, source
- Filter by tab: All / Triage (synced + processed) / Approved
- Search meetings by title or attendee name
- Sort by any column (title, date, status, duration, source)
- **Sync Krisp** — triggers `arete pull krisp`, polls job until complete
- **Process** a single meeting — kicks off AI processing, navigates to detail with job stream
- Navigate to meeting detail by clicking a row

### Meeting Detail (`/meetings/:slug`)
**Both read and write.** The most action-dense page.
- View meeting title, date, status, attendees, duration, source
- View/expand AI summary; edit summary inline
- View/expand raw transcript
- View side-by-side attendee metadata panel
- **Process with AI** — start processing job, stream progress in modal
- **Approve/Skip individual review items** — approve, skip, or restore staged decisions/learnings/commitments
- **Edit staged item text** before approving
- **Approve entire meeting** — commits all approved items to memory/commitments
- **Delete meeting** — removes the meeting file
- Navigate to adjacent meetings (prev/next)
- View already-approved items section

### People Index (`/people`)
**Read-only list with navigation.**
- List all people with name, role/company, category badge, health dot, last meeting, open commitment count, trend icon
- Filter by category tab: All / Internal / Customer / User (with counts)
- Filter by URL param: `?filter=overdue` or `?filter=thisweek` (deep-linkable from Dashboard)
- Search by name, company, or role
- Sort by any column (name, category, health, last meeting, open commitments)
- Navigate to person detail by clicking a row

### Person Detail (`/people/:slug`)
**Both read and write.**
- View name, health score, category badge, role, company
- View contact info (email with mailto link, company)
- View intelligence block: stances, repeated asks, repeated concerns
- View meeting history (all meetings; click to open meeting summary in side sheet)
- View open commitments (direction + text)
- **Edit person notes** — markdown editor; saves back to the person's `.md` file
- Navigate back to People Index
- Navigate to full meeting detail from meeting sheet

### Goals Alignment (`/goals`)
**Both read and write.**
- View strategy (collapsible; shows 200-char preview, expand to full `goals/strategy.md`)
- View quarter goals: outcome cards with success criteria and org alignment (from `goals/quarter.md`)
- View this week's priorities (from `now/week.md`)
- **Toggle priority done/undone** — writes checkbox state back to `now/week.md`
- View commitments due this week (from `now/week.md` commitments section)
- View open commitment summary counts

### Commitments (`/commitments`)
**Both read and write.**
- List commitments with text, linked person, age (days), direction (I owe / they owe), status
- Filter by tab: Open / Overdue / This Week / All
- **Mark commitment as resolved (Done)** — writes status to `.arete/commitments.json`
- **Drop commitment** — writes status to `.arete/commitments.json` (with confirm dialog)
- Navigate to person page via person slug link

### Signal Intelligence (`/intelligence`)
**Read-only.**
- View cross-person signal patterns (topics mentioned across multiple people/meetings)
- Each pattern shows: topic, mention count, people list, meeting slugs, last seen
- Filter by time window: 7d / 30d / 90d

### Memory (`/memory`)
**Read-only.**
- View decisions and learnings from `.arete/memory/items/`
- Filter by type tab: All / Decision / Learning (with counts)
- Search by title or content (client-side on loaded data, up to 200 items)

### Search (`/search`)
**Read-only.**
- Full-text search across meetings, people, decisions, learnings, projects
- Filter by type: All / Meetings / People / Memory / Projects
- Results link to: `/meetings/:slug`, `/people/:slug`, `/memory`, `/goals`
- URL-driven query (`?q=...&type=...`) — shareable/linkable

### Settings (`/settings`)
**Both read and write.**
- View Anthropic API key status (masked display if configured)
- **Save new API key** — validates `sk-ant-` prefix, writes to `.credentials/anthropic-api-key`
- **Remove API key** — deletes file, clears env var
- View app version

### Index (`/`) *(placeholder)*
Stub "Welcome" page — not wired to actual content. Likely unused/replaced by Dashboard routing.

### NotFound (`*`)
Standard 404 fallback page.

---

## Backend Routes

| Route | Method | Read/Write | Notes |
|---|---|---|---|
| `GET /api/calendar/today` | GET | Read | Shells out to `arete pull calendar --today --json`; returns `{ events, configured }` |
| `GET /api/goals/strategy` | GET | Read | Reads `goals/strategy.md` |
| `GET /api/goals/quarter` | GET | Read | Reads `goals/quarter.md`, parses outcomes |
| `GET /api/goals/week` | GET | Read | Reads `now/week.md`, parses priorities + commitments |
| `PATCH /api/goals/week/priority` | PATCH | **Write** | Toggles `[x]` checkbox in `now/week.md` |
| `GET /api/intelligence/patterns` | GET | Read | Scans `resources/meetings/` for cross-person patterns |
| `GET /api/intelligence/commitments/summary` | GET | Read | Reads `.arete/commitments.json`, returns open/dueThisWeek/overdue counts |
| `GET /api/commitments` | GET | Read | List commitments; supports `?filter=open\|overdue\|thisweek\|all` |
| `PATCH /api/commitments/:id` | PATCH | **Write** | Updates commitment status to `resolved` or `dropped` in `.arete/commitments.json` |
| `GET /api/jobs/:id` | GET | Read | Poll async job status (sync, process) |
| `GET /api/meetings` | GET | Read | List all meeting summaries from `resources/meetings/` |
| `POST /api/meetings/sync` | POST | **Write** | Shells out to `arete pull krisp`; returns `{ jobId }` (202 async) |
| `GET /api/meetings/:slug` | GET | Read | Full meeting detail with staged review items |
| `PUT /api/meetings/:slug` | PUT | **Write** | Update meeting title and/or summary in markdown file |
| `DELETE /api/meetings/:slug` | DELETE | **Write** | Delete meeting file from `resources/meetings/` |
| `PATCH /api/meetings/:slug/items/:id` | PATCH | **Write** | Update staged item status (approved/skipped/pending) + optional edited text |
| `POST /api/meetings/:slug/approve` | POST | **Write** | Commit all approved items to memory/commitments; mark meeting approved |
| `POST /api/meetings/:slug/process` | POST | **Write** | Start AI processing agent session; returns `{ jobId }` (202 async) |
| `GET /api/meetings/:slug/process-stream` | GET | Read | SSE stream of job events for a processing job |
| `POST /api/meetings/:slug/process-people` | POST | Read | Shells out to `arete meeting process --file ... --json`; returns people extraction JSON |
| `GET /api/memory` | GET | Read | Paginated memory feed from `.arete/memory/items/decisions.md` + `learnings.md` |
| `GET /api/memory/recent` | GET | Read | Last N memory items (default 5) |
| `GET /api/people` | GET | Read | All people summaries from `people/internal/`, `people/customers/`, `people/users/` |
| `GET /api/people/:slug` | GET | Read | Full person detail (intelligence, meetings, commitments, notes) |
| `PATCH /api/people/:slug/notes` | PATCH | **Write** | Update free-text notes section of person's `.md` file |
| `GET /api/projects` | GET | Read | List active projects from `projects/active/*/README.md` |
| `GET /api/search` | GET | Read | Full-text search across meetings, people, memory, projects |
| `GET /api/settings/apikey` | GET | Read | Return API key status (configured + masked key) |
| `POST /api/settings/apikey` | POST | **Write** | Save Anthropic API key to `.credentials/anthropic-api-key` |
| `DELETE /api/settings/apikey` | DELETE | **Write** | Remove API key file + clear env var |

---

## Workspace Directories Without UI

These directories exist in the sample workspace (`~/code/arete-reserv`) but have **no web UI representation** — the backend either doesn't expose them or the frontend doesn't surface them.

### No UI at all

| Directory / File | What it contains | Gap |
|---|---|---|
| `context/` | Workspace context files (business overview, product roadmap, competitive landscape, personas, domain knowledge, etc.) | Zero routes or pages. Rich PM context with no UI surface. |
| `context/_history/` | Historical context snapshots | No UI |
| `inputs/` | Raw inputs (presumably meeting transcripts, notes pre-import) | No routes or UI. No way to browse or upload via web. |
| `now/agendas/` | Meeting agendas | No UI — only `week.md` is exposed |
| `now/scratchpad.md` | Free-form scratch notes | No UI |
| `now/week-archive/` | Archived week files | No UI |
| `goals/archive/` | Archived quarter/strategy docs | No UI — only live `strategy.md` + `quarter.md` exposed |
| `projects/archive/` | Archived projects | No UI — only `projects/active/` is scanned |
| `resources/conversations/` | Conversation notes (Slack, async) | No routes, no UI |
| `resources/notes/` | Free-form notes | No routes, no UI |
| `resources/reviews/` | Review documents | No routes, no UI |
| `templates/` | Workspace templates | No UI — used only by CLI |
| `.arete/config/` | Workspace configuration | No UI — only API key (`.credentials/`) is exposed |
| `.arete/templates/` | Internal templates | No UI |
| `.arete/activity/` | Activity log files | Activity *events* appear on Dashboard but the underlying files have no UI |
| `people/` (index files) | `people/customers/index.md`, `people/users/` (dir-level index) | Index files not exposed — only individual person `.md` files |

### Partially exposed (some content missing)

| Directory | What's exposed | What's missing |
|---|---|---|
| `now/` | `week.md` priorities + commitments | Agendas, scratchpad, week-archive |
| `goals/` | `strategy.md`, `quarter.md` | Archive, any supplemental goals files |
| `projects/` | `active/*/README.md` summaries on Dashboard + Search | No detail page, no archived projects, no project editing |
| `.arete/memory/` | `items/decisions.md` + `items/learnings.md` | Memory is **read-only** — no way to add/edit/delete entries via UI |
| `resources/meetings/` | Full meeting pages (list + detail) | No way to manually create a meeting; only sync from Krisp |

### Notable behavioral gaps (not directory gaps)

- **No project detail page** — projects link to `/goals` in search results, not a dedicated project page
- **Memory is read-only** — decisions and learnings are written only by the AI processing pipeline; no manual entry, edit, or delete UI
- **Commitments auto-generated only** — no way to manually create a commitment; only AI processing produces them
- **Context files** (`context/`) are the richest PM asset in the workspace and are completely invisible to the web UI
- **No people creation UI** — people files must be created manually or via CLI; web only reads existing files
