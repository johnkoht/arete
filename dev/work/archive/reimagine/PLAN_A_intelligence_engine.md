# Plan A: The Intelligence Engine

> Philosophy: The system should find you, not the other way around.

## Mission

Build the proactive intelligence infrastructure that transforms Areté from a passive tool into an active system. By the end of this plan, Areté surfaces what matters automatically — commitments due, relationship drift, recurring patterns, and a morning brief — without the user having to ask.

## Scope

- **Primary domains**: `packages/core/src/services/`, `packages/cli/src/commands/`, `packages/apps/backend/`
- **Secondary**: minor additions to `packages/runtime/skills/` as needed

---

## Task 1: `arete daily` — Morning Intelligence Brief

### What it does
A new CLI command that assembles and outputs a structured daily intelligence brief. Run it in the morning; it tells you what matters today without any other context.

### Command
```bash
arete daily
arete daily --json  # machine-readable output
```

### Output sections (in order)
1. **Today's Meetings** — from calendar (via `arete pull calendar --today --json`). For each: time, title, attendees. Flag any with open commitments.
2. **Commitments Due / Overdue** — from `arete commitments list` filtered to items that are overdue or due today (use `date` field vs today's date). Show: text, person, direction, days overdue.
3. **Active Projects** — scan `projects/active/*/README.md`, extract title and last-modified date. Show projects with no recent activity (>7 days) as "stale."
4. **Decisions Pending Review** — scan `.arete/memory/items/decisions.md` for items added in the last 7 days. Surface the 3 most recent.
5. **Signals Worth Attention** — call the new `detectPatterns` function (Task 4) if available; surface top 2-3 patterns.

### Implementation
- New file: `packages/cli/src/commands/daily.ts`
- Register in `packages/cli/src/index.ts`
- Use DI pattern (`DailyCommandDeps`) consistent with other commands
- Output: rich formatted text (use chalk or the existing `formatters.ts`)
- Tests: `packages/cli/test/commands/daily.test.ts` — mock all service calls, verify output structure

### Acceptance Criteria
- [ ] `arete daily` runs without error in any workspace
- [ ] Shows today's meetings (graceful empty state if no calendar configured)
- [ ] Shows commitments overdue (graceful empty if none)
- [ ] Shows active projects with staleness flag
- [ ] `--json` flag outputs valid JSON with same data
- [ ] Tests cover all sections with mock data
- [ ] `npm run typecheck && npm test` passes

---

## Task 2: `arete momentum` — Commitment & Relationship Momentum

### What it does
A new CLI command that shows the momentum state of commitments and relationships — what's moving, what's stalling, what needs attention.

### Command
```bash
arete momentum
arete momentum --person <slug>  # filter to one person
arete momentum --json
```

### Output sections

**Commitment Momentum**
- Hot (active last 7 days): commitments created or updated recently
- Stale (14-30 days open): commitments not resolved in 14+ days
- Critical (30+ days open): seriously overdue open commitments

**Relationship Momentum**  
- Scan `resources/meetings/*.md` frontmatter for `attendee_ids`; group by person slug; sort by most recent meeting date
- Active (met in last 14 days): list with last meeting date
- Cooling (14-30 days): relationships drifting — no recent meeting
- Stale (30+ days): high-priority people you haven't connected with

For people: cross-reference `people/internal/*.md` + `people/customers/*.md` to get names. Filter to known people only.

### Implementation
- New file: `packages/cli/src/commands/momentum.ts`
- New service function: `packages/core/src/services/momentum.ts` — `computeCommitmentMomentum(commitments)` and `computeRelationshipMomentum(meetingsDir, peopleDir, storage)`
- Register in `packages/cli/src/index.ts`
- Tests: `packages/cli/test/commands/momentum.test.ts` + `packages/core/test/services/momentum.test.ts`

### Acceptance Criteria
- [ ] `arete momentum` runs without error
- [ ] Commitment momentum shows hot/stale/critical buckets correctly
- [ ] Relationship momentum scans meeting frontmatter for `attendee_ids`
- [ ] `--person` filter works
- [ ] `--json` output is valid
- [ ] `npm run typecheck && npm test` passes

---

## Task 3: Auto-Processing Pipeline — File Watcher

### What it does
A background service that watches the meetings directory for new files and automatically queues them for AI processing via the existing Pi SDK agent. Integrated into the `arete view` backend server.

### Design
When `arete view` starts, it starts a file watcher on `{workspaceRoot}/resources/meetings/`. When a new `.md` file is detected with `status: synced` in frontmatter, it automatically:
1. Creates a background job
2. Calls `runProcessingSession` (the existing Pi SDK agent) to process the meeting
3. Updates job status when done
4. Emits SSE event to any connected web clients

### Implementation
- New file: `packages/apps/backend/src/services/watcher.ts`
  - Export `startMeetingWatcher(workspaceRoot: string, onNew: (slug: string) => void): () => void`
  - Use Node.js `fs.watch` or `chokidar` (prefer `fs.watch` to avoid new deps; use recursive option)
  - Debounce: wait 500ms after file change before reading (avoid partial-write races)
  - Read frontmatter to check `status` — only process `synced` meetings
  - Track processed slugs in memory to avoid double-processing

- Update `packages/apps/backend/src/index.ts` to start watcher when server starts
- New SSE endpoint: `GET /api/events` — emits `meeting:processed` events when a meeting auto-processes

### Acceptance Criteria
- [ ] New meeting files with `status: synced` are automatically queued for processing
- [ ] Already-processed files (`status: processed` or `approved`) are NOT re-queued
- [ ] Watcher is started when `arete view` server launches
- [ ] `/api/events` SSE endpoint exists and emits `meeting:processed` events
- [ ] Watcher cleanup function is called on server shutdown
- [ ] Tests for watcher service (mock fs.watch, verify callback behavior)
- [ ] `npm run typecheck && npm test` passes

---

## Task 4: Pattern Detection Service

### What it does
A new service that analyzes meeting signals across people and time to detect recurring patterns — topics that keep coming up, concerns that are building, themes across stakeholders.

### Design
A `detectPatterns` function that:
1. Reads meeting files in the last N days (default 30)
2. Aggregates person signals (asks/concerns from `collectSignalsForPerson`)
3. Groups signals by normalized topic across ALL people (not per-person)
4. Returns "cross-person patterns": topics mentioned by 2+ people in 2+ meetings

### Types
```typescript
export type SignalPattern = {
  topic: string;
  mentions: number;
  people: string[];  // person slugs
  meetings: string[];  // meeting slugs
  lastSeen: string;  // ISO date
};
```

### Implementation
- New function `detectCrossPersonPatterns` in `packages/core/src/services/person-signals.ts` (or new file `packages/core/src/services/patterns.ts`)
- Export from `packages/core/src/index.ts`
- New backend route: `GET /api/intelligence/patterns` — calls the service and returns JSON
- Tests: `packages/core/test/services/patterns.test.ts`

### Acceptance Criteria
- [ ] `detectCrossPersonPatterns(meetingsDir, storage, { days: 30 })` returns `SignalPattern[]`
- [ ] Patterns correctly group by normalized topic across people
- [ ] Minimum threshold: 2+ mentions across 2+ different people
- [ ] `/api/intelligence/patterns` endpoint returns patterns as JSON
- [ ] Tests cover grouping, deduplication, threshold filtering
- [ ] `npm run typecheck && npm test` passes

---

## Task 5: Enhanced CLI Output & Status Command

### What it does
Upgrade `arete status` (if it exists) or create `arete status` to give a rich workspace health overview. Also: add color and better formatting to existing commands using the existing formatters. Make the CLI feel premium.

### `arete status` output
```
Areté Workspace Status
─────────────────────
📁 Workspace: /Users/john/workspace
🗂  People: 12 (8 internal, 3 customers, 1 user)
📅 Meetings: 47 total (3 this week, 8 unprocessed)
✅ Commitments: 5 open (2 overdue)
📋 Active Projects: 3
🧠 Memory: 23 decisions, 31 learnings
⚡ Intelligence: Patterns detected in last 30 days: 4

Run `arete daily` for your morning brief.
Run `arete momentum` for commitment and relationship momentum.
```

### Implementation
- Update `packages/cli/src/commands/status.ts` (or create if not exists)
- Aggregate stats from: people dir, meetings dir, commitments file, projects dir, memory items
- Use existing storage adapter for all file access
- Tests: mock file system, verify stat aggregation

### Acceptance Criteria
- [ ] `arete status` outputs rich workspace overview
- [ ] All stats are accurate (count files in correct directories)
- [ ] Shows unprocessed meeting count (files with `status: synced`)
- [ ] Recommends `arete daily` and `arete momentum`
- [ ] `npm run typecheck && npm test` passes

---

## Quality Standards
- All TypeScript must pass `npm run typecheck`
- All tests must pass with `npm test`
- DI pattern for all commands (testable without real filesystem)
- No `any` types
- `.js` extensions in all imports
- Graceful empty states everywhere (no crashes on empty workspace)
- Functions named with verbs, files in kebab-case
