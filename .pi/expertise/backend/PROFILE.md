# Backend Package Expertise Profile

> Domain map for `packages/apps/backend/`. Orients agents WHERE to look — not an encyclopedia.
> For codebase-wide architectural patterns, see `.pi/standards/patterns.md`.

---

## Purpose & Boundaries

**Backend is responsible for**: HTTP API routes, SSE events, background job management, workspace file parsing, and serving the static web app. It is the web server layer that exposes `@arete/core` services over HTTP.

**Backend is NOT responsible for**:
- Business logic, domain types, service classes → `packages/core/` (see `.pi/expertise/core/PROFILE.md`)
- CLI commands, prompts, terminal formatting → `packages/cli/`
- Frontend React components, hooks, pages → `packages/apps/web/` (see `.pi/expertise/web/PROFILE.md`)
- Runtime skills, rules, tools → `packages/runtime/`

**Key principle**: Routes are thin HTTP adapters over core services. Heavy business logic belongs in `@arete/core`, not in route handlers. Use `gray-matter` for frontmatter parsing (not `yaml` directly — consistency with workspace files).

---

## Architecture Overview

```
index.ts (entry point) ─── createApp(workspaceRoot) ─── Hono
  ├─ Routes:      routes/*.ts (domain-specific API endpoints)
  ├─ Services:    services/*.ts (backend-specific: jobs, watcher, agent, activity)
  └─ SSE:         broadcastSseEvent() for real-time client updates
```

**Framework**: Hono (lightweight, fast web framework)
**Entry point**: `src/index.ts` → reads `ARETE_WORKSPACE` env → `createApp(workspaceRoot)` → `serve({ fetch: app.fetch, port: 3847 })`
**Server factory**: `src/server.ts` → `createApp(workspaceRoot)` returns configured Hono instance

---

## Route Architecture

### Route Factory Pattern
Each route file exports a factory function that closes over `workspaceRoot`:
```typescript
export function createMeetingsRouter(workspaceRoot: string): Hono {
  const app = new Hono();
  app.get('/', async (c) => { /* use workspaceRoot */ });
  return app;
}
```

Registration in `server.ts`:
```typescript
app.route('/api/meetings', createMeetingsRouter(workspaceRoot));
```

---

## Route Map

### meetings.ts — Meeting CRUD & Processing
**Endpoints**:
- `GET /` → list all meetings (parses `resources/meetings/*.md`)
- `GET /:slug` → full meeting detail with staged items, transcript, frontmatter
- `DELETE /:slug` → delete meeting file → `refreshQmdIndex()`
- `PUT /:slug` → update meeting frontmatter + body
- `PATCH /:slug/items/:itemId` → approve/skip individual staged item → `withSlugLock()`
- `POST /:slug/approve` → commit all approved items to memory → `withSlugLock()`
- `POST /:slug/process` → start Pi SDK agent session → returns 202 + `{ jobId }`
- `GET /:slug/process-stream` → SSE stream for agent processing events

**Critical**: All write operations (`DELETE`, `PUT`, `PATCH`, `approve`) must use `withSlugLock(slug, fn)` to prevent race conditions.

### people.ts — People Directory & Notes
**Endpoints**:
- `GET /` → all people with summary data (health, commitments, trend)
- `GET /:slug` → full person detail (stances, meetings, rawContent)
- `PATCH /:slug/notes` → update person notes (body content)

**Key functions**: `scanPeopleDir()`, `parseAutoMemoryBlock()`, `parseRecentMeetings()`, `computeTrend()`

### intelligence.ts — AI Briefings & Commitments
**Endpoints**:
- `GET /brief` → `services.intelligence.assembleBriefing()` for a task
- `GET /patterns` → signal patterns from meetings
- `GET /commitments` → list commitments with filter (open, overdue, all)
- `PATCH /commitments/:id` → mark commitment done/resolved

### goals.ts — Goals & OKR Management
**Endpoints**:
- `GET /strategy` → `goals/strategy.md` content
- `GET /quarter` → current quarter outcomes
- `PUT /quarter` → update quarter outcomes
- `GET /week` → weekly priorities and commitments
- `PUT /week` → update weekly priorities
- `PATCH /week/priority/:index` → toggle priority done status
- `PATCH /week/commitment/:index` → toggle commitment done status

### calendar.ts — Calendar Events
**Endpoints**:
- `GET /today` → today's calendar events via `getCalendarProvider()`

### projects.ts — Project Summaries
**Endpoints**:
- `GET /` → project summaries from `projects/**/*.md`

### memory.ts — Memory Items
**Endpoints**:
- `GET /` → paginated memory items (decisions, learnings)
- `GET /recent` → recent memory items for dashboard

### search.ts — Unified Search
**Endpoints**:
- `GET /` → search across meetings, people, memory, projects
- Uses `extractExcerpt()` for result snippets (exported for unit testing)

### settings.ts — Configuration
**Endpoints**:
- `GET /` → workspace configuration status
- `PUT /api-keys` → save API keys

### jobs.ts — Background Job Status
**Endpoints**:
- `GET /:id` → job status (running, done, error)

---

## Services

### services/jobs.ts — Background Job Management
In-memory job tracking for async operations. Thread-safe via Map.
```typescript
createJob(type: string): string          // returns jobId
getJob(id: string): Job | undefined
setJobStatus(id: string, status)
appendEvent(id: string, event: string)   // for streaming output
```

### services/workspace.ts — Workspace Utilities
Module-level `FileStorageAdapter` singleton. Used by all routes needing core service calls.
```typescript
const storage = new FileStorageAdapter();  // shared instance
```

### services/watcher.ts — File System Watcher
Watches workspace for changes, triggers SSE broadcasts.

### services/agent.ts — Pi SDK Integration
Wraps `@mariozechner/pi-coding-agent` for background agent sessions.
```typescript
import { createAgentSession, SessionManager, createCodingTools } from '@mariozechner/pi-coding-agent';
import { getEnvApiKey } from '@mariozechner/pi-ai';  // NOT from pi-coding-agent
```

### services/activity.ts — Activity Event Log
Reads/writes `.arete/activity.json` for recent activity feed.
```typescript
writeActivityEvent(workspaceRoot, event)  // prepends to array (newest first)
readActivityEvents(workspaceRoot, limit)  // returns newest first
```

---

## SSE (Server-Sent Events)

### Global SSE Broadcaster
`server.ts` exports `broadcastSseEvent(eventName, data)` for real-time updates.
```typescript
app.get('/api/events', (c) => {
  // Returns ReadableStream with SSE format
  // event: <eventName>\ndata: <JSON>\n\n
});
```

### Event Types
- `connected` — initial connection with `clientId`
- `meeting:processed` — meeting processing complete

**Pattern**: Side effects (activity writes) belong in `index.ts` at call site, NOT inside `broadcastSseEvent`.

---

## Key Patterns

### Write Lock Pattern
Concurrent writes to the same file corrupt frontmatter. Use per-slug locking:
```typescript
import { withSlugLock } from './meetings.js';

app.patch('/:slug/items/:itemId', async (c) => {
  return withSlugLock(slug, async () => {
    // safe to read-modify-write
  });
});
```

### Fire-and-Forget 202 Pattern
Background jobs return immediately with job ID:
```typescript
app.post('/:slug/process', async (c) => {
  const apiKey = getEnvApiKey('anthropic');
  if (!apiKey) return c.json({ error: '...', hint: '...' }, 503);

  const jobId = jobsService.createJob('process');
  runProcessingSession(...).catch(err => {
    console.error('[process] error:', err);
    jobsService.setJobStatus(jobId, 'error');
  });
  return c.json({ jobId }, 202);
});
```

### SSE Polling Pattern
For streaming job output to clients:
```typescript
const stream = new ReadableStream({
  start(controller) {
    const interval = setInterval(() => {
      const job = jobsService.getJob(jobId);
      const newEvents = job.events.slice(lastSent);
      // ... enqueue events
      if (job.status === 'done' || job.status === 'error') {
        clearInterval(interval);
        controller.close();
      }
    }, 500);
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
```

### Test App Pattern
Tests build a mock Hono app with injected functions (no I/O):
```typescript
function buildTestApp(mockFns: { ... }) {
  const app = new Hono();
  // wire routes with mocks
  return app;
}
const res = await app.request('/api/meetings', { method: 'GET' });
```

---

## Invariants

- `ARETE_WORKSPACE` env var must be set; server exits 1 if absent
- Meeting slugs are filenames without `.md`: `YYYY-MM-DD-slugified-title`
- All meeting write operations use `withSlugLock`
- `POST` endpoints for async work return 202 + `{ jobId }`
- `FileStorageAdapter` is module-level singleton (stateless, safe to reuse)
- `gray-matter` for frontmatter (not `yaml`) — consistency with workspace
- QMD refresh failures after DELETE are non-fatal (logged, not propagated)

---

## Anti-Patterns & Common Mistakes

- **Missing write lock** → Race conditions corrupt frontmatter
- **Awaiting background jobs** → Use fire-and-forget 202 pattern
- **Creating FileStorageAdapter per request** → Use shared singleton
- **Mixing gray-matter and yaml** → Stick to gray-matter for round-trip safety
- **Side effects in broadcastSseEvent** → Put them at call site in index.ts
- **Forgetting 503 for missing API key** → Check `getEnvApiKey()` before agent work
- **Hardcoding port** → Use env or default 3847

---

## Required Reading

Before working on backend routes, read:
1. `packages/apps/backend/LEARNINGS.md` — comprehensive gotchas and patterns
2. `packages/apps/backend/src/server.ts` — route registration and SSE setup
3. The specific route file you're modifying
4. `routes/meetings.ts` for the `withSlugLock` pattern (if adding write endpoints)

---

## Related Expertise

- **Core services**: `.pi/expertise/core/PROFILE.md` — backend routes call core services
- **Web frontend**: `.pi/expertise/web/PROFILE.md` — consumes these API endpoints
- **CLI**: `.pi/expertise/cli/PROFILE.md` — shares core service patterns

---

## LEARNINGS.md Location

| Path | Covers |
|------|--------|
| `packages/apps/backend/LEARNINGS.md` | Write locks, gray-matter, Pi SDK integration, SSE patterns, testing patterns |
