# Backend LEARNINGS

Component-local gotchas, invariants, and pre-edit checklists for `packages/apps/backend/`.

---

## Gotchas

### npm run typecheck Does NOT Check Backend (2026-03-08)

`npm run typecheck` in the repo root only checks `packages/core` and `packages/cli`. The backend
is in `packages/apps/backend` and has its own TypeScript config. To verify backend compiles:
```bash
npm run build:apps:backend   # or npm run build for everything
```

Always run `npm run build:apps:backend` after modifying backend code — `npm run typecheck` will miss errors.

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

### Aggregation Endpoints Must Filter Consistently (2026-03-30)

**What broke**: The `/api/review/pending` endpoint returned ALL open commitments while only returning
decisions/learnings from processed meetings. Users saw old commitments unrelated to current review.

**Why**: The endpoint fetched commitments via `services.commitments.listOpen()` without filtering,
while decisions/learnings were correctly filtered to `status === 'processed'` meetings.

**Fix**: Filter commitments to only include those from processed meetings:
```typescript
const processedMeetingSlugs = new Set(processedMeetings.map(m => m.slug));
const allCommitments = await services.commitments.listOpen();
const commitments = allCommitments.filter(c => {
  if (c.source.startsWith('meeting:')) {
    const meetingSlug = c.source.slice('meeting:'.length);
    return processedMeetingSlugs.has(meetingSlug);
  }
  return false;
});
```

**Pattern**: When building aggregation endpoints that combine data from multiple sources, ensure ALL
sources are filtered with the same criteria. If decisions/learnings are scoped to processed meetings,
commitments must be too.

### gray-matter Caches Frontmatter Data Objects (2026-03-07)

`gray-matter` caches the `data` object across parses. If you mutate `data` and then re-parse
a different file, the cached object pollutes the new parse. This causes phantom properties to
appear in frontmatter that don't exist in the file.

**Always clone** frontmatter before mutating:
```typescript
const { data, content } = matter(raw);
const fm = { ...data };  // Clone before mutation
fm['favorite'] = true;   // Safe to mutate
const updated = matter.stringify(content, fm);
```

NOT:
```typescript
const { data, content } = matter(raw);
data['favorite'] = true;  // BAD: mutates cached object
```

This affects any PATCH endpoint that reads, modifies, and writes frontmatter.

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

## AIService Integration (2026-03-08)

Meeting processing uses `AIService` from `@arete/core` for AI calls. This replaced the previous
pi-coding-agent integration.

### Module-Level Service Initialization

AIService is initialized once at startup and shared via module-level state:
```typescript
// index.ts
import { loadConfig, loadCredentialsIntoEnv, AIService, FileStorageAdapter } from '@arete/core';
import { initializeAIService } from './services/agent.js';

loadCredentialsIntoEnv();  // Load ~/.arete/credentials.yaml into env
const storage = new FileStorageAdapter();
const config = await loadConfig(storage, workspaceRoot);
const aiService = new AIService(config);
initializeAIService(aiService);  // Set module-level reference
```

### Testable Pattern with Dependency Injection

The `runProcessingSessionTestable()` function accepts injected dependencies for testing:
```typescript
export interface ProcessingDeps {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  aiService: {
    callStructured: <T>(task: 'extraction', prompt: string, schema: TSchema) => Promise<AIStructuredResult<T>>;
  };
}

// Tests inject mocks
const deps = makeMockDeps({ aiResponse: { summary: '...', actionItems: [...] } });
await runProcessingSessionTestable(workspace, slug, jobId, jobs, deps);
```

### TypeBox Schema for Structured Output

Meeting extraction uses a TypeBox schema for type-safe structured output:
```typescript
const MeetingExtractionSchema = Type.Object({
  summary: Type.String(),
  actionItems: Type.Array(Type.String()),
  decisions: Type.Array(Type.String()),
  learnings: Type.Array(Type.String()),
});

const result = await aiService.callStructured('extraction', prompt, MeetingExtractionSchema);
const extraction = result.data;  // Typed as MeetingExtraction
```

### SSE Events for Progress (unchanged)

The fire-and-forget 202 pattern and SSE polling pattern remain unchanged from before —
only the internal AI call mechanism changed.

---

## Core Extraction Service Integration (2026-03-12)

Backend meeting processing now uses `extractMeetingIntelligence()` from `@arete/core` instead of
direct `callStructured()`. Key integration patterns:

### LLM Error Propagation Workaround

`extractMeetingIntelligence` catches LLM errors internally and returns empty results (see
`packages/core/src/services/meeting-extraction.ts` L634-635). To propagate LLM errors for
proper job status reporting, capture errors in the callLLM adapter:

```typescript
let llmError: Error | null = null;
const callLLM = async (prompt: string): Promise<string> => {
  try {
    const result = await deps.aiService.call('extraction', prompt);
    return result.text;
  } catch (err) {
    llmError = err instanceof Error ? err : new Error(String(err));
    throw llmError;
  }
};
// After extraction:
if (llmError && coreResult.intelligence.summary === '') {
  throw llmError;  // Re-propagate for proper error reporting
}
```

### Core Limits Action Items to 7

`extractMeetingIntelligence` caps action items at 7 (`MAX_ITEMS.actionItems = 7` in
meeting-extraction.ts L119). Tests should not expect more than 7 action items.

### Test Mocks Must Use snake_case JSON

The core extraction parser expects snake_case field names from the LLM. Test mocks
must convert to snake_case via `toRawLLMJson()`:

```typescript
function toRawLLMJson(intelligence: MeetingIntelligence): object {
  return {
    action_items: intelligence.actionItems.map((ai) => ({
      owner_slug: ai.ownerSlug,  // camelCase → snake_case
      // ...
    })),
    // ...
  };
}
```

---

## Pi SDK Integration (SUPERSEDED 2026-03-08)

> **Note**: This section is historical. The backend now uses `AIService` from `@arete/core`
> instead of `@mariozechner/pi-coding-agent`. Keeping for reference if agent-based processing
> is ever needed again.

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

### Attendee Resolution Required for Commitments Sync (2026-03-17)

The `approveMeeting()` workflow has a dependency chain:
1. `attendee_ids` must exist in meeting frontmatter
2. Person memory refresh runs for each attendee in `attendee_ids`
3. Person memory refresh syncs action items to CommitmentsService

If `attendee_ids` is missing/empty, Step 2 is skipped entirely, and action items never appear in `arete commitments list`.

**Root cause**: The web app's processing flow (`POST /api/meetings/:slug/process`) only does AI extraction — it never resolves attendees or writes `attendee_ids`. The CLI's `arete meeting process` does write `attendee_ids`, which is why CLI-processed meetings worked correctly.

**Fix (2026-03-17)**: `approveMeeting()` now auto-resolves attendees to slugs using `extractAttendeeSlugs()` from `@arete/core` if `attendee_ids` is missing. The resolved slugs are written back to frontmatter before person memory refresh runs.

When modifying the approval workflow, ensure this resolution step runs before person memory refresh. Test with the new `approval-integration.test.ts` suite.

### Pre-Existing Test Failures in goals.test.ts (2026-03-06, updated 2026-03-07)

The GET /quarter tests in `test/routes/goals.test.ts` were failing **before** iteration 3:
- `returns found=true and parsed outcomes`
- `parses outcome id and title`
- `parses success criteria`

These are parser mismatches — the test data uses `### Q1-1` format but `parseQuarterOutcomes` expects `## Goal N:` format.
Do not fix these tests as part of other bug fixes (out of scope). The `parses commitments with done status` test now passes.

### Memory File Format — Support Both Standard and Legacy Formats (2026-03-11)

The memory parser (`routes/memory.ts`) now supports two formats:

1. **Standard format** (PATTERNS.md spec, MemoryService.create output):
   ```markdown
   ### 2026-02-24: Decision Title
   **Source**: Meeting Name
   Content here...
   ```

2. **Legacy format** (agent-generated entries):
   ```markdown
   ## Decision Title
   - **Date**: 2026-02-24
   - **Source**: Meeting Name
   - Content here...
   ```

**Root cause**: Some agents wrote memory entries using `## Title` with separate `- **Date**:` metadata
lines instead of following the `### YYYY-MM-DD: Title` format in PATTERNS.md. The parser was only
matching the standard format, causing all legacy entries to be invisible in the Memory dashboard.

**Fix**: The parser now splits on both `## ` and `### ` headings and tries both format patterns.
Tests added in `test/routes/memory.test.ts` verify both formats and mixed-format files.
