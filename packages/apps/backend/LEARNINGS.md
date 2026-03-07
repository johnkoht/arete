# Backend LEARNINGS

Component-local gotchas, invariants, and pre-edit checklists for `packages/apps/backend/`.

---

## Gotchas

### WriteItemStatusOptions Not Re-Exported from @arete/core

`WriteItemStatusOptions` is defined in `packages/core/src/integrations/staged-items.ts` but
is **not** re-exported from `packages/core/src/index.ts`. If you need it in backend code,
define it inline or import directly from the staged-items source (but avoid deep imports in
production code — inline definition is cleaner).

### gray-matter vs yaml for Frontmatter

The backend uses `gray-matter` for frontmatter parsing (available in package.json). The core
package uses the `yaml` library directly. Don't mix them — gray-matter's `matter.stringify()`
produces slightly different output than yaml.stringify. Use `matter.stringify()` for round-trip
safety in backend service code.

### Per-Slug Write Queue

Concurrent PUT / PATCH / approve requests to the same slug can corrupt frontmatter (read-
modify-write race). `withSlugLock(slug, fn)` in `routes/meetings.ts` serializes all write
operations per slug. **Always wrap** `updateMeeting`, `updateItemStatus`, and `approveMeeting`
calls with this lock.

### QMD Refresh After Delete is Non-Fatal

`deleteMeeting` calls `refreshQmdIndex` after deleting a file. This is intentionally wrapped
in try/catch — a QMD failure should not fail the DELETE response. The error is logged but
not propagated.

### FileStorageAdapter — Create Once, Reuse

The `FileStorageAdapter` in `services/workspace.ts` is a module-level singleton. Don't
create one per request — it has no state and is safe to reuse. The `@arete/core` functions
that require a `StorageAdapter` (writeItemStatusToFile, commitApprovedItems, loadConfig)
all use this shared instance.

---

## Invariants

- ARETE_WORKSPACE must be set at startup; server exits 1 with a clear message if absent.
- Meeting slugs are filenames without `.md`: `YYYY-MM-DD-slugified-title`.
- All write operations (DELETE, PUT, PATCH, approve) must go through `withSlugLock`.
- `POST /api/meetings/sync` and `POST /api/meetings/:slug/process` both return 202 + jobId immediately.
- `GET /api/meetings/:slug/process-stream` is an SSE stub until Task 4.

---

## Pre-Edit Checklist

Before editing `routes/meetings.ts`:
- [ ] Check that new write endpoints wrap their workspace call with `withSlugLock`
- [ ] Ensure new endpoints requiring workspace path use the `workspaceRoot` closure parameter

Before editing `services/workspace.ts`:
- [ ] Confirm any new core API calls pass the shared `storage` adapter (module-level)
- [ ] If adding new frontmatter fields, test round-trips with both gray-matter and real file content

---

## Pi SDK Integration (2026-03-04)

### createAgentSession / SessionManager.inMemory()

First use of the Pi SDK for background agent work in the backend.

**Imports** (verified against local node_modules):
```typescript
import { createAgentSession, SessionManager, createCodingTools } from '@mariozechner/pi-coding-agent';
import { getEnvApiKey } from '@mariozechner/pi-ai';  // NOT from pi-coding-agent
```

`createAgentSession` returns `{ session, extensionsResult, modelFallbackMessage }` — not the session directly.

**Session lifecycle**:
1. Call `createAgentSession({ cwd, sessionManager, tools })` → `{ session }`
2. Call `session.subscribe(listener)` → returns `unsubscribe` fn
3. Await `session.prompt(text)` to run the agent
4. Call `unsubscribe()` in finally to clean up

### AssistantMessageEvent — text_delta shape

The Pi SDK normalizes Anthropic's nested `content_block_delta` into a flat structure. The correct check is:
```typescript
if (ev?.type === 'text_delta') {
  jobs.appendEvent(jobId, ev.delta);  // ev.delta is a string, not an object
}
```
NOT `ev.type === 'content_block_delta' && ev.delta.type === 'text_delta'` (that's the raw Anthropic API shape, not the SDK shape).

### getEnvApiKey — canonical API key check

Use `getEnvApiKey('anthropic')` from `@mariozechner/pi-ai` to check if the key is configured. Returns `undefined` if not set. Always check before creating a session to give a clear 503 rather than a cryptic SDK error.

### Fire-and-forget 202 pattern

```typescript
app.post('/:slug/process', async (c) => {
  const apiKey = getEnvApiKey('anthropic');
  if (!apiKey) return c.json({ error: '...', hint: '...' }, 503);

  const jobId = jobsService.createJob('process');
  runProcessingSession(workspaceRoot, slug, jobId, jobsService).catch(err => {
    console.error('[process] Agent error:', err);
    jobsService.setJobStatus(jobId, 'error');
  });
  return c.json({ jobId }, 202);
});
```
Do the API key check in the route (synchronous, returns 503 immediately). Don't await the agent; return 202 with jobId. The catch on the floating promise is the only error handler — the service itself also sets error status before re-throwing.

### SSE polling pattern (ReadableStream + setInterval)

```typescript
const stream = new ReadableStream({
  start(controller) {
    const interval = setInterval(() => {
      const job = jobsService.getJob(jobId);
      if (!job) { clearInterval(interval); controller.close(); return; }
      const newEvents = job.events.slice(lastSent);
      for (const ev of newEvents) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: ev })}\n\n`));
        lastSent++;
      }
      if (job.status === 'done' || job.status === 'error') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`));
        clearInterval(interval); controller.close();
      }
    }, 500);
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } });
```
Slice-based polling is simpler than cursors because the events array only grows. The `lastSent` counter tracks the slice offset. Use `new Response(stream, ...)` directly (not `c.body`) to get correct SSE headers.

---

## First-Use Patterns

### Hono Route Factory Pattern (2026-03-04)

First use of `createMeetingsRouter(workspaceRoot)` — a factory that closes over
`workspaceRoot` and returns a `Hono` instance. This allows passing workspace context to
routes without global state. Pattern used in `server.ts`:
```typescript
app.route('/api/meetings', createMeetingsRouter(workspaceRoot));
```

### Node:test Mocking with In-Process Hono App (2026-03-04)

Backend tests build a **test Hono app** with injected mock functions rather than mocking
the file system or using supertest. This keeps tests fast (no I/O), type-safe, and avoids
needing a running server. Pattern in `test/routes/meetings.test.ts`:
```typescript
function buildTestApp(meetingsMock: { ... }) {
  const app = new Hono();
  // Wire routes with mock implementations
  return app;
}
const res = await app.request('/api/meetings', { method: 'GET' });
```

---

## Iteration 3 Patterns (2026-03-06)

### broadcastSseEvent is Caller-Owned — Side Effects Belong in index.ts

`broadcastSseEvent` in `server.ts` is a pure SSE broadcaster (module-level, no workspaceRoot access).
When you need to persist side effects on SSE events (e.g., writing activity.json), do it in `index.ts`
at the call site — **not** inside `broadcastSseEvent`. This keeps the broadcaster pure and side effects
explicit:
```typescript
// index.ts
broadcastSseEvent('meeting:processed', data);
await writeActivityEvent(workspaceRoot, { ... });  // called alongside, not inside broadcastSseEvent
```

### CommitmentsFile Filter Gotcha — filter=all vs default open

The original `GET /api/commitments` defaulted to `status === 'open'` for all requests. After adding
`filter=all` support, the filter-selection logic must check `filter === 'all'` **before** the `open`
default — otherwise `filter=all` still returns only open items. Order matters:
```typescript
if (filterParam === 'all') {
  sourceCommitments = allCommitments;  // all statuses
} else {
  sourceCommitments = allCommitments.filter((c) => c.status === 'open');  // default: open only
}
```

### Search Router — Excerpt Extraction Exported for Unit Testing

The `extractExcerpt` helper in `routes/search.ts` is exported specifically so it can be tested
in isolation (unit tests) independently of the full file-scanning pipeline. This pattern (export
pure helpers for unit testability) is worth following for other route files with complex string logic.

### Activity File — Prepend Not Append

`writeActivityEvent` prepends new events to the front of the array (most recent first), not appends.
The `readActivityEvents` return order is therefore newest-first without any sorting. Don't reverse
or sort the array when reading — the insert order is the display order.

### Pre-Existing Test Failure in goals.test.ts (2026-03-06)

`parses commitments with done status` in `test/routes/goals.test.ts` was failing **before** iteration 3.
Confirmed by git stash → test fails → git stash pop. Do not fix this test in iteration 3 (out of scope).
It's the only backend test failing across the `test/**/*.test.ts` suite.
