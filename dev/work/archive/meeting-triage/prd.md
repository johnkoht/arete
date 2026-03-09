# PRD: Meeting Minder — Arete Meeting Triage App

**Version**: 1.0
**Status**: Draft
**Date**: 2026-03-04
**Branch**: `feature/meeting-minder`

---

## 1. Problem & Goals

### Problem

After every meeting, Areté users must manually run 2-3 CLI/agent steps (pull from Krisp, run process-meetings, review in agent chat) to extract and approve decisions, learnings, and action items. This friction compounds when meetings pile up. There is no dedicated interface for reviewing, approving, or managing meeting data — everything happens in agent conversations.

### Goals

1. **Native meeting triage UI**: A local web app (`arete view`) that lets users sync, process, review, and approve meetings without touching the terminal or an agent chat.
2. **AI-powered processing from the UI**: The backend uses the Pi SDK (`@mariozechner/pi-coding-agent`) to run the `process-meetings` skill autonomously — full AI content extraction (summary, decisions, learnings, action items) triggered from a single button.
3. **Structured review flow**: Extracted items are staged (not immediately committed to memory), allowing the user to approve/skip/edit each item individually before committing.
4. **Foundation for a larger workspace**: `packages/apps/` establishes the app architecture for future sections (people, projects, context, etc.).

### Out of Scope

- People / projects / context views (future sections)
- Chat panel / embedded AI assistant (`pi-web-ui` — v2)
- Notion sync (v2)
- Fathom integration (v2)
- Krisp webhook-based sync (v2 — Sync button is v1)
- Mobile / responsive design
- Multi-user / auth

---

## 2. Architecture

### Package Structure

```
packages/
  apps/                          ← NEW
    backend/                     ← Node.js/Hono server
      src/
        server.ts                ← Hono app, mounts all routes
        routes/
          meetings.ts            ← CRUD + approve + process endpoints
          jobs.ts                ← async job status polling
        services/
          agent.ts               ← Pi SDK session factory + SSE streaming
          workspace.ts           ← wraps @arete/core workspace/storage
          meetings.ts            ← parse/write meeting markdown files
        index.ts                 ← entry point
      package.json
      tsconfig.json
    web/                         ← React + Vite (imported from meeting-minder)
      (contents from https://github.com/johnkoht/meeting-minder)
  core/                          ← existing (modified)
  cli/                           ← existing (modified: new view command)
  runtime/                       ← existing (modified: process-meetings skill)
```

### How It Runs

```
arete view [--port 3847]
  → spawns packages/apps/backend/
  → backend serves static packages/apps/web/dist/ (prod) or proxies to Vite (dev)
  → opens browser to http://localhost:3847
  → backend knows workspace root (passed via ARETE_WORKSPACE env var from CLI)
```

### Processing Flow

```
User clicks "Process Meeting"
  → POST /api/meetings/:slug/process
  → backend creates Pi SDK agent session
     (cwd = workspace root, tools = read/write/bash/edit, loads process-meetings skill)
  → streams events via GET /api/meetings/:slug/process-stream (SSE)
  → agent runs process-meetings skill: entity resolution + content extraction
  → agent writes staged items to meeting file + sets status: processed
  → backend signals completion; UI polls for updated meeting
```

### Meeting Status State Machine

```
[Synced] → process-meetings skill runs → [Processed] → user approves → [Approved]
```

---

## 3. Data Model Changes

### Meeting Frontmatter

**After sync** (`saveMeetingFile` updated):
```yaml
title: "Design Review"
date: "2026-03-04"
source: "Krisp"
status: synced              # NEW: synced | processed | approved
attendees:                  # NEW: stored at sync time
  - name: "John Koht"
    email: "john@example.com"
recording_url: "https://..."
```

**After process-meetings runs:**
```yaml
status: processed
attendee_ids: [john-koht, sarah-mitchell]
processed_at: "2026-03-04T18:30:00Z"
staged_item_status:         # NEW: per-item state map
  ai_001: pending
  ai_002: approved
  de_001: pending
  le_001: skipped
staged_item_edits:          # NEW: user edits to item text
  ai_002: "Updated text if edited"
```

**Staged sections in meeting body** (written by process-meetings skill):
```markdown
## Staged Action Items
- ai_001: Follow up on pricing model with Sarah
- ai_002: Share Q1 roadmap deck with stakeholders

## Staged Decisions
- de_001: Prioritize enterprise tier before SMB in Q1

## Staged Learnings
- le_001: Enterprise customers care more about audit logs than anticipated
```

**Item ID format**: `<type>_<3-digit-seq>` where type = `ai` (action item), `de` (decision), `le` (learning). IDs are assigned by the AI at extraction time and persist in the file.

---

## 4. API Endpoints

### Meetings
- `GET  /api/meetings` — list all, parse frontmatter (title, date, status, attendees, duration, source)
- `GET  /api/meetings/:slug` — full parsed meeting (frontmatter + staged items with statuses + content sections)
- `DELETE /api/meetings/:slug` — delete file, refresh QMD index

### Editing
- `PUT  /api/meetings/:slug` — save edits to summary or title (writes to file)
- `PATCH /api/meetings/:slug/items/:id` — update individual staged item
  - Body: `{ action: "approve" | "skip" | "edit", text?: string }`
  - Updates `staged_item_status` and `staged_item_edits` in frontmatter immediately

### Sync & Processing
- `POST /api/meetings/sync` — shell out to `arete pull krisp`; returns `{ jobId }` (202)
- `GET  /api/jobs/:id` — poll async job status: `{ status: "running"|"done"|"error", output?: string }`
- `POST /api/meetings/:slug/process-people` — shell out to `arete meeting process --file <path> --json` (synchronous, fast)
- `POST /api/meetings/:slug/process` — start Pi SDK agent session; returns `{ jobId }` (202)
- `GET  /api/meetings/:slug/process-stream` — SSE stream of agent events for live progress UI

### Approval
- `POST /api/meetings/:slug/approve`
  - Reads all `approved` items from `staged_item_status` frontmatter
  - Appends approved decisions to `.arete/memory/items/decisions.md`
  - Appends approved learnings to `.arete/memory/items/learnings.md`
  - Writes approved action items to `## Action Items` section in meeting file
  - Removes all `## Staged *` sections from meeting body
  - Clears `staged_item_status` and `staged_item_edits` from frontmatter
  - Sets `status: approved`, writes `approved_at`
  - Refreshes QMD index

---

## 5. UI Spec (from meeting-minder prototype)

### Meetings Index (`/`)

**Page header**: "Meetings" (title) + "Sync Krisp" button (top right, triggers sync job, loading state during polling)

**Section 1: Needs Attention** (only shown if synced/processed meetings exist)
- Section label: "Needs Attention (N)"
- Table: Title | Date | Attendees | Status | Action
  - Synced → "Process →" (secondary button)
  - Processed → "Review →" (amber button)
  - Processing → spinner + "Processing..."
- Empty state: "✓ All caught up — no meetings need review"

**Section 2: All Meetings** (always visible)
- Search bar (client-side filter by title + attendee name)
- Table: Title | Date | Attendees | Status | Duration | Source
- All meetings, reverse chronological

### Meeting Detail — Synced (`/meetings/:slug`)

Header: `← Meetings | [Title]  [Synced badge]`

Right panel: Date, Duration, Source, Attendees, "View recording →", "Process Meeting" button (primary), "Delete Meeting" (destructive)

Main content: Info banner ("Ready to process — run process-meetings or click Process Meeting"), Key Points, Action Items (raw Krisp), Summary, Transcript (collapsible)

"Process Meeting" button → triggers POST process → opens live progress stream in a modal/panel showing agent output → on completion, page refreshes to Processed state

### Meeting Detail — Processed (`/meetings/:slug`)

Header: `← Meetings | [Title]  [Needs Review badge]  [Save & Approve →]  [→ Next]`
- "Save & Approve →" = primary indigo button (top right)
- "→ Next" = ghost button with tooltip "Next in triage (N remaining)"
- Clicking "→ Next" with unsaved changes → confirmation dialog: "You have unsaved reviews. Leave without saving?" [Leave] [Save & Approve]

Right panel: "Processed" badge, Date, Duration, Source, Attendees, "View recording →", "Process People" button (secondary), "Delete Meeting" (destructive)

Main content (in order):
1. **Summary** — editable inline (pencil icon, click to edit textarea)
2. **Review Items** header with "N of M reviewed" counter + subtext "Approve or skip each item. Save & Approve to commit to memory."
3. **Action Items** (collapsible group with count badge)
   - Each item: text (editable inline) + approve ✓ + skip ✕ buttons
   - Approved: green left border, muted text, green checkmark circle
   - Skipped: strikethrough, gray X circle, reduced opacity
4. **Decisions** (same card pattern)
5. **Learnings** (same card pattern)
6. **Transcript** (collapsible, read-only)

Sticky bottom bar: "N of M reviewed · N approved · N skipped   [Save & Approve →]"

### Meeting Detail — Approved (`/meetings/:slug`)

Header: `← Meetings | [Title]  [Approved badge]`

After approve action: green "✓ Meeting approved" banner in main content with "→ Next in Triage (N remaining)" link

Main content: Action Items (read-only, all green checkmarks), Decisions, Learnings, Summary (read-only), Transcript (collapsible)

Right panel: Date, Duration, Source, Attendees, "View recording →", "Delete Meeting"

---

## 6. Task Breakdown

### Task 1: Package structure + Lovable import

**Goal**: Establish `packages/apps/` structure and import the Lovable prototype as the web package.

**Steps**:
- Create `packages/apps/` directory with `backend/` and `web/` subdirectories
- Clone `https://github.com/johnkoht/meeting-minder` into `packages/apps/web/`
- Add `packages/apps/backend/` and `packages/apps/web/` to root workspace `package.json` (if using npm workspaces)
- Create `packages/apps/backend/package.json` with name `@arete/backend`, dependencies: `hono`, `@hono/node-server`, `@arete/core`, `@mariozechner/pi-coding-agent`, `gray-matter`, `yaml`
- Create `packages/apps/backend/tsconfig.json` extending `../../tsconfig.base.json` (NodeNext)
- Create `packages/apps/web/` — confirm `npm run dev` starts the Vite dev server
- Add convenience scripts to root `package.json`: `dev:web`, `dev:backend`, `build:apps`
- Verify `npm run typecheck` still passes across all packages

**Acceptance Criteria**:
- `packages/apps/web/` contains the meeting-minder code and runs with `npm run dev`
- `packages/apps/backend/` exists with correct package.json and tsconfig
- Root typecheck passes
- No conflicts with existing `packages/core/` or `packages/cli/` tsconfigs

---

### Task 2: Meeting file data model + core utilities

**Goal**: Update the meeting data model to support `status`, attendees-at-sync-time, and staged items. Add parsing/writing utilities to `packages/core`.

**Steps**:
- Update `MeetingForSave` in `packages/core/src/integrations/meetings.ts`:
  - Add optional `status?: "synced" | "processed" | "approved"` field
  - Add optional `attendees_raw?: Array<{name: string, email?: string}>` for sync-time storage
- Update `saveMeetingFile` to write `status: synced` in frontmatter
- Update `saveMeetingFile` to write `attendees` array to frontmatter (from `meeting.attendees`)
- Create `packages/core/src/integrations/staged-items.ts`:
  - `generateItemId(type: "ai" | "de" | "le"): string` — generates `ai_001`, `de_001`, etc. (sequential within call context, or random 3-digit)
  - `parseStagedSections(content: string): { actionItems: StagedItem[]; decisions: StagedItem[]; learnings: StagedItem[] }` — parses `## Staged *` sections from meeting body, extracts IDs and text
  - `parseStagedItemStatus(frontmatter: Record<string, unknown>): Record<string, "pending" | "approved" | "skipped">` — reads `staged_item_status` map
  - `writeItemStatusToFile(filePath: string, itemId: string, action: "approve" | "skip" | "edit", text?: string, storage: StorageAdapter): Promise<void>` — reads file, updates `staged_item_status` + `staged_item_edits` in frontmatter, writes back
  - `commitApprovedItems(filePath: string, storage: StorageAdapter, memoryPaths: { decisions: string; learnings: string }): Promise<CommitResult>` — reads approved items, appends to memory files, removes staged sections from body, clears frontmatter state, sets `status: approved`
- Export all from `packages/core/src/index.ts`
- Tests: `packages/core/test/integrations/staged-items.test.ts` covering:
  - `parseStagedSections` with valid and malformed input
  - `parseStagedItemStatus` with missing/partial frontmatter
  - `writeItemStatusToFile` approve/skip/edit round-trips
  - `commitApprovedItems` writes to memory files and cleans up meeting file

**Acceptance Criteria**:
- `saveMeetingFile` output includes `status: synced` and `attendees` in frontmatter
- All staged-items utilities have tests (happy path + edge cases)
- `npm run typecheck` passes
- Existing `packages/core/test/integrations/krisp.test.ts` and meeting tests still pass

---

### Task 3: Backend server + API endpoints

**Goal**: Build the Hono server in `packages/apps/backend/` with all API endpoints, using `@arete/core` for file I/O.

**Steps**:
- Create `packages/apps/backend/src/server.ts`: Hono app with CORS, static file serving (serves `../web/dist/`), JSON error handling
- Create `packages/apps/backend/src/services/workspace.ts`:
  - `initWorkspace(workspaceRoot: string)` — creates `@arete/core` services (storage, workspace)
  - `getMeetingFiles()` — lists `resources/meetings/*.md`, parses frontmatter
  - `getMeetingFile(slug: string)` — reads full meeting file, parses frontmatter + staged items
  - `deleteMeetingFile(slug: string)` — deletes file, refreshes QMD index
  - `updateMeetingSummary(slug: string, summary: string)` — writes summary to file
- Create `packages/apps/backend/src/services/jobs.ts`:
  - In-memory job store: `Map<string, Job>`
  - `createJob(type: string): string` — returns jobId
  - `updateJob(jobId: string, status: "running" | "done" | "error", output?: string): void`
  - `getJob(jobId: string): Job | undefined`
- Create `packages/apps/backend/src/routes/meetings.ts`: all meetings endpoints
- Create `packages/apps/backend/src/routes/jobs.ts`: job polling endpoint
- Sync endpoint shells out to `arete pull krisp` via `child_process.spawn`, captures stdout/stderr, marks job done/error
- Process-people endpoint shells out to `arete meeting process --file <path> --json`, returns result
- Process endpoint: returns `{ jobId }` immediately, kicks off agent session in background (see Task 4)
- Process-stream endpoint: SSE endpoint that streams job events (agent output lines) to client
- Create `packages/apps/backend/src/index.ts`: reads `ARETE_WORKSPACE` env var, validates it contains `arete.yaml`, starts server on port from `PORT` env var (default 3847)
- Tests: `packages/apps/backend/test/routes/meetings.test.ts` with mocked workspace service

**Acceptance Criteria**:
- All CRUD endpoints return correct JSON shapes
- `GET /api/meetings` returns array of meeting summaries (no transcript, no full body)
- `PATCH /api/meetings/:slug/items/:id` updates `staged_item_status` in the actual file
- `POST /api/meetings/:slug/approve` commits approved items to `.arete/memory/items/` and cleans meeting file
- `POST /api/meetings/sync` returns `{ jobId }` and `GET /api/jobs/:id` reflects running → done
- Tests pass with mocked filesystem

---

### Task 4: Pi SDK agent integration (processing endpoint)

**Goal**: Implement the `POST /api/meetings/:slug/process` endpoint using the Pi SDK to run the `process-meetings` skill, with SSE streaming back to the UI.

**Steps**:
- Create `packages/apps/backend/src/services/agent.ts`:
  - `createProcessingSession(workspaceRoot: string, meetingSlug: string): Promise<AgentSession>`
    - Uses `createAgentSession` from `@mariozechner/pi-coding-agent`
    - `cwd` = workspaceRoot
    - `tools` = `createCodingTools(workspaceRoot)` (read, write, bash, edit)
    - `sessionManager` = `SessionManager.inMemory()` (no persistence)
    - `model` = configured model or default (reads from AuthStorage)
  - `streamProcessingEvents(session: AgentSession, jobId: string, jobStore: JobStore): void`
    - Subscribes to session events
    - Appends text deltas and tool calls to job's event log
    - On `agent_end`: marks job done, writes final status
    - On error: marks job error
  - Prompt sent to session: `"Process the meeting at resources/meetings/{slug}.md. Use the process-meetings skill. Write extracted action items, decisions, and learnings as staged sections in the meeting file (## Staged Action Items, ## Staged Decisions, ## Staged Learnings) with unique IDs in format ai_001, de_001, le_001. Set the meeting status to 'processed' in frontmatter. Do not commit items to memory/."`
- In `routes/meetings.ts`: the process endpoint calls `createProcessingSession`, subscribes with `streamProcessingEvents`, starts the prompt, returns `{ jobId }`
- SSE stream endpoint (`GET /api/meetings/:slug/process-stream`): opens SSE connection, tails the job's event log, closes when job is done/error
- Handle: API key not configured (return 503 with helpful message), workspace not found, meeting not found, agent error
- Tests: mock `createAgentSession` to return a mock session that emits predetermined events; verify job transitions to "done"

**Acceptance Criteria**:
- `POST /api/meetings/:slug/process` returns 202 with `{ jobId }` immediately
- SSE stream sends agent text output as it arrives
- When agent completes, job status → "done", UI can detect completion
- If `ANTHROPIC_API_KEY` (or Pi auth) is not configured, endpoint returns 503 with `{ error: "AI not configured", hint: "..." }`
- Mocked tests verify event streaming and job lifecycle

---

### Task 5: Wire web app to backend API

**Goal**: Replace all mock data in `packages/apps/web/` with real API calls, handle all async states, and implement the live processing stream.

**Steps**:
- Create `packages/apps/web/src/api/client.ts`: base fetch wrapper with error handling, reads backend URL from `VITE_API_URL` env var (defaults to `http://localhost:3847`)
- Create `packages/apps/web/src/api/meetings.ts`: typed API client functions matching all backend endpoints
- Create TanStack Query hooks in `packages/apps/web/src/hooks/`:
  - `useMeetings()` — `GET /api/meetings`, auto-refreshes after sync completes
  - `useMeeting(slug)` — `GET /api/meetings/:slug`
  - `useApproveItem(slug)` — `PATCH .../items/:id` mutation
  - `useSaveApprove(slug)` — `POST .../approve` mutation; invalidates `useMeeting` + `useMeetings` on success
  - `useProcessPeople(slug)` — `POST .../process-people` mutation
  - `useProcessMeeting(slug)` — `POST .../process` mutation; returns jobId, opens SSE stream
  - `useSyncKrisp()` — `POST /api/meetings/sync` mutation; polls job until done; invalidates `useMeetings`
  - `useJobStatus(jobId)` — `GET /api/jobs/:id`, polling every 2s while status is "running"
- Remove `src/data/meetings.ts` mock data usage from all pages
- Update `MeetingsIndex.tsx`: use `useMeetings()`, handle loading + error states, wire Sync Krisp button
- Update `MeetingDetail.tsx`: use `useMeeting(slug)`, wire all buttons to mutations
- Add live processing panel: when process job is running, show a modal/sheet with SSE stream output (agent text as it arrives), progress indicator, "Done" state
- Wire confirmation dialog (already in Lovable) to `useProcessMeeting` + navigation state
- Add toast notifications (Sonner already in deps) for sync complete, approve complete, errors
- Tests: `packages/apps/web/src/test/` — hook tests with mocked fetch using `@testing-library/react`

**Acceptance Criteria**:
- Meetings index loads real meeting files from workspace
- "Sync Krisp" shows loading state during job, refreshes list when done
- "Process Meeting" shows live agent output stream, transitions meeting to Processed on completion
- Per-item approve/skip/edit updates the file immediately (optimistic UI)
- "Save & Approve" commits items to memory and sets status to Approved
- "→ Next" confirmation dialog appears when there are unsaved item states
- Loading and error states shown for all async operations
- Toast notifications for key actions

---

### Task 6: Update `process-meetings` skill for staging

**Goal**: Update `packages/runtime/skills/process-meetings/SKILL.md` so the skill writes staged items to the meeting file instead of immediately committing to memory. Add `--commit` flag for backward compat.

**Steps**:
- Read current `SKILL.md` at `packages/runtime/skills/process-meetings/SKILL.md`
- Add new section: **Staged Output Mode** (default behavior when `--commit` flag is NOT passed):
  - After extracting decisions, learnings, and action items, write them as staged sections in the meeting file using this exact format:
    ```
    ## Staged Action Items
    - ai_001: [action item text]
    - ai_002: [action item text]
    
    ## Staged Decisions
    - de_001: [decision text]
    
    ## Staged Learnings
    - le_001: [learning text]
    ```
  - Update meeting frontmatter to set `status: processed` and `processed_at: [ISO timestamp]`
  - Do NOT write to `.arete/memory/items/` in this mode
- Add **Commit Mode** (`--commit` flag): preserves existing behavior — writes directly to memory, does not write staged sections
- Keep existing people/entity resolution behavior unchanged (always runs, writes `attendee_ids`)
- Update the **Arguments** section in SKILL.md to document `--commit` flag
- Update the **Summary** section to reflect staged vs. commit behavior
- Note in SKILL.md: "When run from the Areté web app (arete view), the app provides the review UI. Use `--commit` only when running from CLI without the web app."

**Acceptance Criteria**:
- Default (no flags): skill writes staged sections to meeting file + sets `status: processed`, does NOT write to memory
- With `--commit`: skill writes directly to memory (old behavior preserved)
- ID format is exactly: `ai_NNN`, `de_NNN`, `le_NNN` (zero-padded to 3 digits)
- Section headers are exactly: `## Staged Action Items`, `## Staged Decisions`, `## Staged Learnings`
- Existing CLI users who pass `--commit` get unchanged behavior

---

### Task 7: `arete view` CLI command

**Goal**: Add `arete view` command to `packages/cli/` that launches the backend server and opens the browser.

**Steps**:
- Create `packages/cli/src/commands/view.ts`
- Port resolution: try `PORT` env var, then 3847, 3848, 3849 (up to 3 attempts), error on all busy
- Spawn `packages/apps/backend/` server as a child process:
  - `ARETE_WORKSPACE` = resolved workspace root (from `services.workspace.findRoot()`)
  - `PORT` = resolved port
  - Inherit stderr for error visibility
- Wait for server ready signal (ping `GET /health` with retry, max 5s)
- Open browser: use `open` package (cross-platform) to `http://localhost:{port}`
- Print to stdout: `\nAreté workspace open at http://localhost:{port}\nPress Ctrl+C to stop.\n`
- Handle SIGINT: kill backend child process cleanly
- Register in `packages/cli/src/commands/index.ts`
- Tests: mock child_process.spawn and open; verify port conflict handling and SIGINT cleanup

**Acceptance Criteria**:
- `arete view` starts the server and opens the browser
- URL is printed to stdout
- Ctrl+C stops the server cleanly (no zombie processes)
- If port is busy, tries next port (up to 3 attempts)
- If not in an Areté workspace, shows clear error: "Not in an Areté workspace. Navigate to your workspace directory and try again."
- `npm run typecheck` passes

---

## 7. Task Dependencies

```
Task 1 (package structure) → all other tasks
Task 2 (data model + core utilities) → Task 3, Task 4, Task 5
Task 3 (backend server) → Task 4, Task 5
Task 4 (Pi SDK processing) → Task 5
Task 5 (web API wiring) → standalone once Task 3+4 done
Task 6 (process-meetings skill) → independent (can run parallel to Tasks 3-5)
Task 7 (arete view CLI) → Task 3 must exist
```

**Execution order**: 1 → 2 → 3 → 4 → 5 → 6 (parallel with 3-5) → 7

---

## 8. Pre-Mortem Risks (from pre-mortem.md)

Key risks with mitigations (full pre-mortem in `pre-mortem.md`):

1. **Staged item parsing fragility** — AI writes markdown; server parses it. Mitigation: strict format spec in SKILL.md, defensive parser, fallback error state in UI.
2. **New tooling (React + Vite in apps/web)** — Different build pipeline. Mitigation: isolated tsconfig for web, separate test script `npm run test:viewer`, verify root typecheck unaffected.
3. **Sync is long-running** — `arete pull krisp` takes 10-30s. Mitigation: async job pattern (202 + polling), UI spinner state.
4. **Concurrent write races** — User edits file externally during server operation. Mitigation: per-file async mutex in server, re-read before write.
5. **process-meetings skill backward compat** — Staging changes behavior for all users. Mitigation: `--commit` flag preserves old behavior; default switches to staging.
6. **ID stability** — Staged item IDs must survive external file edits. Mitigation: parser ignores orphaned IDs gracefully; UI warns on stale status.
7. **API key not configured** — Pi SDK needs Anthropic key. Mitigation: 503 with clear message, UI shows "AI not configured" state instead of error.

---

## 9. Out of Scope

- Chat panel / embedded AI (`pi-web-ui`) — v2
- Notion sync — v2
- People / projects / context views — v2
- Fathom integration — v2
- Krisp webhooks — v2
- Mobile/responsive design
- Authentication / multi-user
- Offline support
- `process-meetings` triggering from Lovable directly (must go through backend)

---

## 10. Success Criteria

- `arete view` opens the browser to the meeting triage app
- Meetings from `resources/meetings/` appear in the UI with correct status badges
- "Sync Krisp" button pulls new meetings and they appear in "Needs Attention"
- "Process Meeting" button runs the full AI extraction and streams live progress
- After processing, staged items appear in the triage UI with pending status
- User can approve/skip/edit individual items
- "Save & Approve" commits approved items to `.arete/memory/items/` and marks meeting Approved
- "→ Next" navigates sequentially through triage items
- All existing `npm test` and `npm run typecheck` pass
- No zombie processes after `arete view` is stopped with Ctrl+C
