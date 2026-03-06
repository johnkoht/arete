# LEARNINGS — packages/apps/web

Component-local gotchas, invariants, and pre-edit checklists for the Areté Meeting Minder web app.

---

## Architecture

### API Layer Pattern (first use: task-5)
All type-shape mapping between backend wire format and frontend types lives in `src/api/meetings.ts`, **not** in components. This keeps components clean. Key mappings:
- Attendee `{ name, email }` → `{ name, email, initials }` (computed from name parts)
- Duration `"62 minutes"` (string) → `62` (number via regex)
- Status `"processed"` (lowercase) → `"Processed"` (capitalized `MeetingStatus`)
- StagedItem types `'ai'|'de'|'le'` → `'action'|'decision'|'learning'`
- Grouped `stagedSections` → flat `ReviewItem[]` (flattened with status + edited text)

### `staged_item_edits` lives in frontmatter
Backend `FullMeeting` exposes `frontmatter: Record<string, unknown>` which contains `staged_item_edits: Record<string, string>` (itemId → edited text). This is **not** in the TypeScript type directly. Access via `raw.frontmatter['staged_item_edits']`. When building `ReviewItem.text`, prefer edited text over original: `edits[item.id] ?? item.text`.

### TanStack Query v5 Syntax
- Mutations use `isPending` (not `isLoading`)
- `refetchInterval` receives the full query object: `(query) => query.state.data?.status === 'running' ? 2000 : false`
- Invalidate multiple caches on approve: `['meeting', slug]` + `['meetings']`

### SSE Cleanup Pattern (first use: task-5)
`EventSource` lifecycle must be managed with a ref + useEffect cleanup. Pattern:
```tsx
const esRef = useRef<EventSource | null>(null);
useEffect(() => { return () => { esRef.current?.close(); }; }, []);
// On modal close: esRef.current?.close(); esRef.current = null;
```
Do NOT store EventSource in useState — causes extra re-renders and stale closure issues.

---

## Gotchas

### Optimistic Updates + Query Invalidation in MeetingDetail
`reviewItems` in MeetingDetail uses local state initialized from query data (via `useEffect` on `meeting.reviewItems`). After `useApproveItem` succeeds, `invalidateQueries(['meeting', slug])` triggers a re-fetch which updates `meeting.reviewItems`. The `useEffect` then syncs local state. This double-update is correct but means there's a brief moment where local optimistic state and query data differ — that's expected.

### Diffing `onItemsChange` for PATCH calls
`ReviewItemsSection` calls `onItemsChange(wholeArray)` when any item changes. To fire individual PATCH calls, diff against `prevReviewItemsRef.current`. Break after the first changed item — only one item changes per `onItemsChange` call.

### `BASE_URL` import in components
Components using `EventSource` import `BASE_URL` from `@/api/client.js`. Don't hardcode the URL or use `process.env` — Vite uses `import.meta.env.VITE_API_URL`.

### Sync job coordination
`useSyncKrisp` returns `{ jobId }`. The component stores `jobId` in state and passes it to `useJobStatus(jobId)`. A `useEffect` on `jobStatus.data?.status` triggers `invalidateQueries(['meetings'])` and toast on done/error. This separation is intentional — hooks can't call other hooks inside `onSuccess`.

---

### Multi-Page Architecture (first use: Plan B)
All new pages follow the same pattern:
1. `src/api/<domain>.ts` — typed API functions using `apiFetch`
2. `src/hooks/<domain>.ts` — TanStack Query hooks wrapping the API functions
3. `src/pages/<Page>.tsx` — component using hooks, imports `PageHeader` + `EmptyState`

Types live in `src/api/types.ts` — single source of truth for all frontend types.

### Dashboard Layout Pattern
Use the `PageHeader` component (title + optional description + optional action) at the top of every page. The `EmptyState` component handles the icon+title+description+CTA pattern for empty lists/tables. Both are in `src/components/`.

### Sheet (Drawer) for Detail Panels
People Intelligence uses `Sheet` from `@/components/ui/sheet` for the person detail drawer. Conditionally enable the query with `enabled: !!slug` to avoid fetching before a row is clicked. Pass `open ? slug : ""` to the hook to prevent stale data.

### Sidebar Active State
The sidebar uses prefix-based matching (`location.pathname.startsWith(path)`) for all routes except `/` which uses exact match. This correctly highlights `/meetings` when visiting `/meetings/some-slug`.

### Backend node_modules NOT at root
The backend package (`packages/apps/backend`) has its own `node_modules` that must be installed separately (`npm install` in that directory). The root `node_modules` does NOT contain `hono`, `gray-matter`, etc. Run backend tests from `packages/apps/backend`, not the root.

---

## Pre-Edit Checklist
- [ ] Type changes in `src/api/types.ts` need corresponding changes in `src/api/meetings.ts` (mapping layer) and possibly component props
- [ ] New API endpoints → add to `src/api/meetings.ts` + a hook in `src/hooks/meetings.ts`
- [ ] SSE streams need cleanup in `useEffect` return function
- [ ] TanStack Query v5: mutations use `isPending`, not `isLoading`
- [ ] Don't import from `@/data/meetings` in production components — use `@/api/types` and `@/hooks/meetings`
