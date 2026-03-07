# Iteration 3: The Finishing Moves

These three features transform a "good product" into something truly indispensable.

## Context (what we have after Iterations 1 + 2)

**CLI**: `arete daily`, `arete momentum`, `arete status`, auto-processing watcher, pattern detection
**Web**: Dashboard (meetings/commitments/projects/memory/patterns), People Intelligence, Goals Alignment, Memory Feed, Intelligence page, Meeting Triage
**Missing**: Global search, Commitments management, Activity feed

---

## Task I3-1: Global Search (`/search` + `GET /api/search`)

### Why
Without search, the web app is a collection of pages. With search, it becomes a *workspace* — one place to find anything. A PM should be able to type "Acme pricing" and get: meetings where Acme pricing was discussed, decisions made about Acme pricing, the Acme person file, relevant projects.

### Backend: `GET /api/search?q=<query>&type=meetings|people|memory|all`

Create `packages/apps/backend/src/routes/search.ts`:

```typescript
// Returns SearchResult[]
type SearchResult = {
  type: 'meeting' | 'person' | 'decision' | 'learning' | 'project';
  title: string;
  slug: string;
  excerpt: string;  // first 150 chars of matched content
  date?: string;
  url: string;  // web app route: /meetings/slug, /people/slug, etc.
};
```

Search strategy (scan, no index needed):
1. **Meetings**: scan `resources/meetings/*.md` — match against title + summary + body. Return top 5.
2. **People**: scan `people/**/*.md` — match against name + role + company + notes. Return top 3.
3. **Memory**: scan `.arete/memory/items/decisions.md` + `learnings.md` — match against full text. Return top 5.
4. **Projects**: scan `projects/active/*/README.md` — match against title + content. Return top 3.

Matching: case-insensitive substring search. Relevance: count occurrences of query tokens in content.

Excerpt: find first occurrence of any query token in content, return 30 chars before → 120 chars after, replace newlines with spaces.

Register `GET /api/search` in `server.ts`.

### Frontend: `/search` page + global search trigger

1. `packages/apps/web/src/api/search.ts` — `searchWorkspace(q: string, type?: string): Promise<SearchResult[]>`
2. `packages/apps/web/src/hooks/search.ts` — `useSearch(q: string)` — debounced (300ms), only fires when `q.length >= 2`
3. `packages/apps/web/src/pages/SearchPage.tsx`:
   - URL: `/search?q=<query>`
   - Top: search input (auto-focused, keyboard shortcut hint)
   - Type filter tabs: All | Meetings | People | Memory | Projects
   - Results list: each result shows type badge, title, excerpt, date, link
   - Empty state: "No results for '{query}'"
   - Loading state: skeleton results
4. Global search trigger: add a search button/bar to the top of every page layout (in AppLayout) that navigates to `/search?q=<typed>` — use `useNavigate` to push to search page as user types

**Tests:** 
- `packages/apps/backend/test/routes/search.test.ts` — test real `createSearchRouter` with mock workspace files; test cross-type search, type filtering, empty results, excerpt extraction

---

## Task I3-2: Commitments Management Page (`/commitments`)

### Why
The entire meetings → extract action items → manage commitments loop is broken without a web UI for managing commitments. The People page shows commitments per person. The Dashboard shows overdue counts. But there's no page to review all your commitments, mark them done, or see the full picture.

### Backend: `GET /api/commitments` already exists (added in I2-4)

Extend `intelligence.ts`:
- `GET /api/commitments?filter=all|open|overdue|thisweek` — already implemented
- `PATCH /api/commitments/:id` — new: mark commitment done/dropped
  - Reads `.arete/commitments.json`, finds commitment by `id`, updates `status` to `'resolved'` or `'dropped'`, sets `resolvedAt` to current ISO timestamp
  - Uses `@arete/core` CommitmentsService if available, else writes JSON directly
  - Returns updated commitment

### Frontend: `/commitments` page

`packages/apps/web/src/pages/CommitmentsPage.tsx`:

**Header**: "Commitments" + filter tabs: All | Open | Overdue | This Week

**Table** (sortable):
| Column | Detail |
|--------|--------|
| Commitment | Text of the commitment |
| Person | Who it's with (linked to /people/:slug) |
| Direction | "I owe them" or "They owe me" badge |
| Age | Days open (colored: green <7, yellow 7-14, red >14) |
| Actions | "Mark done" button + "Drop" button |

**Mark done flow**:
- Click "Mark done" → PATCH `/api/commitments/:id` with `status: 'resolved'`
- Optimistic update: row fades out with checkmark
- Toast: "Commitment resolved ✓"

**Drop flow**:
- Click "Drop" → confirm dialog: "Drop this commitment? It won't show up again." → PATCH with `status: 'dropped'`

**Empty states**:
- "All" tab empty: "No commitments tracked yet."
- "Open" tab empty: "All caught up — no open commitments."
- "Overdue" tab empty: "No overdue commitments. Great work!"

Add "Commitments" to sidebar nav (use `CheckSquare` or `ListTodo` icon from lucide-react, between People and Goals).

**Tests:**
- Backend: `PATCH /api/commitments/:id` test in `intelligence.test.ts`
- Web: integration test for the mark-done flow (vitest)

---

## Task I3-3: Activity Feed on Dashboard + Notification History

### Why
The ambient intelligence (auto-processing watcher) is invisible. When 5 meetings get auto-processed at 9am, a PM has no way to know what happened except checking the meetings list. An activity feed makes intelligence tangible and builds trust: "Areté has been working."

### Backend: `GET /api/activity`

Persist activity events to a file. When `broadcastSseEvent` fires, also write to `.arete/activity.json` (rolling window of last 50 events).

In `packages/apps/backend/src/server.ts` (or new `services/activity.ts`):

```typescript
type ActivityEvent = {
  id: string;  // uuid or timestamp
  type: 'meeting:processed' | 'meeting:synced' | 'pattern:detected';
  title: string;  // human-readable: "Meeting 'Product Review' processed"
  detail?: string;  // "3 action items, 1 decision extracted"
  timestamp: string;  // ISO
};
```

When `broadcastSseEvent` is called with `meeting:processed`:
1. Write the event to `.arete/activity.json` (prepend, keep last 50)
2. Also broadcast over SSE (existing behavior)

New route: `GET /api/activity?limit=10` — reads `.arete/activity.json`, returns last N events. Register in `server.ts`.

### Frontend: Activity section in Dashboard

Add "Recent Activity" section to `Dashboard.tsx` (below Signal Patterns):

**Section header**: "Recent Activity" + subtle "Live" indicator dot (pulsing green) when SSE is connected

**Activity feed** (last 5 items):
- Each item: icon (based on type), title, detail, relative timestamp ("2 minutes ago")
- `meeting:processed` → ✅ green check icon
- Auto-update via `useProcessingEvents` hook: when a new event fires, add it to the activity list optimistically without refetch

**"View all" link** → future `/activity` page (placeholder, just shows the same 5 for now at `/activity`)

**Type:** 
```typescript
type ActivityItem = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  timestamp: string;
};
```

**Tests:**
- Backend: `GET /api/activity` with empty/populated `.arete/activity.json`
- Test that writing to activity.json happens when `broadcastSseEvent` fires

---

## Quality Requirements
- All TypeScript: `npm run typecheck` must pass
- All tests: `npm test` must be 0 failures
- Web build: `cd packages/apps/web && npm run build` must pass
- No `any` types
- All new pages: loading + error + empty states
- All new backend routes: at least basic tests
