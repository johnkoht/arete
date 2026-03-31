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

### SSE Callbacks + Modal Close — Stale Closure Pattern (2026-03-12)

**What broke**: After reprocess meeting completed, the UI didn't update until page refresh.

**Why**: The SSE `onmessage` handler sets `streamDone` state and calls `invalidateQueries`. But when the
user later clicks "Close" on the modal, `handleProcessModalClose` checks `streamDone` — except it's using
a stale closure reference from the previous render, not the current state value.

**Fix**: Use refs alongside state to track processing completion:
```tsx
const [streamDone, setStreamDone] = useState(false);
const streamDoneRef = useRef(false);

// In SSE handler:
setStreamDone(true);
streamDoneRef.current = true;

// In modal close handler — use ref, not state:
if (streamDoneRef.current && !streamErrorRef.current) {
  void queryClient.refetchQueries({ queryKey: ["meeting", slug] });
}
```

**Also**: Use `refetchQueries` instead of `invalidateQueries` when you need data immediately fresh
(invalidate marks stale but doesn't block; refetch forces immediate fetch).
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

### useEffect Initialization — Stale Closure with External State (2026-03-30)

**What broke**: Clicking approve/skip on one item in ReviewPage would sometimes affect other items.

**Why**: The initialization `useEffect` that populates decision state from fetched data had a stale closure bug:
```tsx
// ❌ BAD: reads taskDecisions from stale closure
useEffect(() => {
  for (const task of data.tasks) {
    if (!taskDecisions[task.id]) {  // stale reference!
      newDecisions[task.id] = { status: "pending" };
    }
  }
  setTaskDecisions(prev => ({ ...prev, ...newDecisions }));
}, [data]); // missing taskDecisions in deps, but adding it causes infinite loop
```

When React Query refetched (30s stale time) or re-renders occurred, this effect could run with stale `taskDecisions` and incorrectly re-initialize items the user had already modified.

**Fix**: Use functional state updates that read current state inside the setter:
```tsx
// ✅ GOOD: functional update always gets current state
useEffect(() => {
  setTaskDecisions((prev) => {
    const updated = { ...prev };
    let changed = false;
    for (const task of data.tasks) {
      if (!updated[task.id]) {  // prev is always current
        updated[task.id] = { status: "pending" };
        changed = true;
      }
    }
    return changed ? updated : prev;  // avoid unnecessary re-renders
  });
}, [data]);
```

**Pattern**: When an effect needs to conditionally update state based on both external data AND current state, always use functional updates. The `prev` parameter is guaranteed to be current, unlike closed-over state variables.

### Approved vs Parsed Items — Use Correct Component for Status (2026-03-09)

When rendering meeting items, the component must match the meeting status:
- `status: 'approved'` → `<ApprovedItemsSection approvedItems={meeting.approvedItems} />`
- `status: 'processed'` → `<ReviewItemsSection reviewItems={meeting.reviewItems} ... />`

**Bug that was fixed**: The `isApproved` branch was incorrectly using `ParsedItemsSection`
which showed Fathom's raw extraction (with `{{03:33}}` timestamp artifacts) instead of 
the user's approved content. The component was rendering the wrong data source.

**Testing pattern**: When testing component rendering by status, include mock data with
intentionally different content in each data source (e.g., `approvedItems` vs `parsedSections`)
to verify the correct source is used. Don't just check that *something* renders — check that
the *wrong* thing does NOT render.

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

### SSE Auto-Refresh Pattern — `useProcessingEvents` (first use: iteration 2)
For app-level SSE subscriptions (not per-component), mount the hook in an inner `AppRoutes` component that lives _inside_ `QueryClientProvider`. This gives the hook access to `useQueryClient()`:
```tsx
function AppRoutes() {
  useProcessingEvents(); // mount once — all pages benefit
  return <Routes>...</Routes>;
}
// In <App>: wrap with <QueryClientProvider><BrowserRouter><AppRoutes /></BrowserRouter></QueryClientProvider>
```
The hook uses exponential backoff (2s→4s→8s→16s→30s) and invalidates `['meetings']` and `['memory', 'recent']` query caches on `meeting:processed` events.

### Testing EventSource in Vitest (first use: iteration 2)
`EventSource` isn't available in jsdom without a polyfill — mock it with `vi.stubGlobal('EventSource', MockClass)`. The mock class must expose `addEventListener`, `close`, and the ability to trigger event handlers for test control. Store `this` in a module-level variable during construction to get the last-created instance. Important: mock instances that track `listeners` by type make it easy to emit test events.

### URL Filter Params in React Router (first use: iteration 2)
Use `useSearchParams()` to read URL query params. Reading `?filter=overdue` example:
```tsx
const [searchParams, setSearchParams] = useSearchParams();
const filterParam = searchParams.get("filter"); // "overdue" | "thisweek" | null
// Clear: setSearchParams({});
```
When a filter is applied from navigation (e.g. Dashboard → `/people?filter=overdue`), use `useEffect` on the param to set initial sort state.

### Multi-Param URL Coexistence (first use: V2-2)
When a page has multiple independent URL params (e.g. `?filter=` and `?category=`), use
the functional-setter form to avoid clobbering params you don't own:
```tsx
setSearchParams((prev) => {
  const next = new URLSearchParams(prev);
  next.delete("filter");   // or next.set("category", val)
  return next;
});
```
Do NOT use `setSearchParams({ filter: val })` — that form discards all other existing params.
The destructive form is fine only when a page controls all its own params in one call.

> Note: `CommitmentsPage.tsx` and `SearchPage.tsx` use the destructive form intentionally —
> each controls only a single param, so it's safe there. `PeopleIndex` has two independent
> params (`filter` + `category`), making the functional form required.

### `GoalsView` Strategy Preview (fixed: iteration 2)
The StrategySection was collapsed by default with no preview. Fixed: collapsed state now shows a plain-text preview (first 200 chars, markdown stripped). The `stripMarkdown` function removes `## headings`, `**bold**`, `*italic*`, `- bullets`, and collapses whitespace. Full content uses `whitespace-pre-wrap`. Expand/collapse toggle still works.

### `extractAttendeeSlugs` is now shared (iteration 2)
Previously duplicated in both `momentum.ts` and `patterns.ts`. Now lives in `packages/core/src/utils/attendees.ts` and exported from `packages/core/src/utils/index.ts`. Both services import from the shared utility. Test at `packages/core/test/utils/attendees.test.ts`.

---

---

## Iteration 3 Patterns (2026-03-06)

### useSearch — Debounce in Hook, Not Component

The `useSearch` hook in `hooks/search.ts` owns the 300ms debounce logic using `useState` + `useEffect`.
Components pass raw `q` string and get debounced results. Don't add debounce at the component level
too — one layer of debounce is enough. The hook also guards with `enabled: debouncedQ.length >= 2`.

### useMutation with Optimistic Updates — cancelQueries Pattern

For `useMarkCommitmentDone`, the mutation must call `queryClient.cancelQueries` before setting
optimistic data to avoid overwriting optimistic updates with in-flight query results:
```typescript
onMutate: async ({ id }) => {
  await queryClient.cancelQueries({ queryKey: ['commitments'] });
  const previousData = queryClient.getQueriesData({ queryKey: ['commitments'] });
  queryClient.setQueriesData({ queryKey: ['commitments', 'list'] }, (old) => ...);
  return { previousData };
},
onError: (_err, _vars, context) => {
  for (const [key, data] of context.previousData) queryClient.setQueryData(key, data);
},
```
`getQueriesData` + `setQueriesData` (plural) hit all cached query key variants (open, overdue, all, etc).

### SearchPage URL Sync Pattern

SearchPage syncs query and filter to URL params using `useSearchParams` + `useEffect`. The URL
update uses `{ replace: true }` to avoid creating browser history entries on every keystroke.
Initial state is read from `searchParams.get("q")` and `searchParams.get("type")` so the page
works on direct URL load and back-button navigation.

### CommitmentsPage Filter via URL — Default is "open"

CommitmentsPage reads `?filter=` from URL on mount for direct-link support (Dashboard pulse cards).
When setting the default filter state, use `"open"` not `undefined` — the backend accepts `filter=open`
as a valid explicit filter (returns only open commitments), which is the same as the unfiltered default.

### `people/` gitignore pattern catches source code paths (V2-3)

The root `.gitignore` has a `people/` entry to ignore workspace data. This pattern also
matches `packages/apps/web/src/components/people/` — any new source files under that directory
require `git add -f` to force-add. This affects V2-5 if it adds more files there.

### PersonDetail `rawContent` field — already stripped, no parsing in components (V2-3)

`rawContent` returned from `GET /api/people/:slug` has already had the `## Recent Meetings`
section and `AUTO_PERSON_MEMORY` block stripped server-side. Components should render it
directly (e.g. `whitespace-pre-wrap`). Do NOT attempt to strip further in the frontend.
For V2-5's TipTap editor: `rawContent` is the correct initial content — feed it directly to
the editor's `content` prop.

## TipTap Integration (first use: V2-5)

### BubbleMenu import — from @tiptap/react/menus (TipTap v3)
In TipTap v3, `BubbleMenu` React component is in the `/menus` subpath:
```typescript
// ✓ Correct (TipTap v3)
import { BubbleMenu } from '@tiptap/react/menus';

// ✗ Wrong — this is the Extension, not the React component
import { BubbleMenu } from '@tiptap/extension-bubble-menu';

// ✗ Wrong — not exported from root @tiptap/react
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
```

### BubbleMenu props changed in TipTap v3
`tippyOptions` no longer exists. TipTap v3 uses `@floating-ui/dom` instead of Tippy:
```typescript
// ✗ Wrong (v2 API)
<BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>

// ✓ Correct (v3 API)
<BubbleMenu editor={editor}>
```

### Markdown serialization (TipTap v3)
The `Markdown` extension adds `getMarkdown()` directly to the editor instance:
```typescript
onUpdate: ({ editor }) => {
  // Markdown extension adds getMarkdown() to editor
  const md = (editor as unknown as { getMarkdown: () => string }).getMarkdown();
  onChange(md);
},
```
Do NOT use `editor.storage.markdown.getMarkdown()` — that property doesn't exist in v3.

### Feed rawContent directly
`rawContent` from `GET /api/people/:slug` is already clean — pass it directly to TipTap's `content` prop. No further parsing needed.

### @tailwindcss/typography was installed but not enabled
It was in devDependencies already; just needed to be added to `plugins` in `tailwind.config.ts` to enable `prose` CSS classes that style TipTap output.

### TipTap content is initial-only — use `key` to force remount
`useEditor({ content: ... })` only initializes content once. React prop changes to `initialValue`
do NOT update the live editor. To reflect new content (e.g. after a query refetch),
add `key={content}` to the component — this forces a remount and fresh initialization.

---

## BlockNote Integration (first use: V3-1)

BlockNote (`@blocknote/react`, `@blocknote/mantine`) is used for the Notion-like rich text editor.
It replaces TipTap for the main block editor experience.

### Markdown round-trip is intentionally lossy

BlockNote's `blocksToMarkdownLossy()` normalizes markdown on export:
- Extra blank lines between paragraphs may be collapsed
- Trailing whitespace is trimmed
- Leading/trailing newlines are normalized
- List indentation uses 4 spaces (BlockNote's standard)

This is expected behavior — test for *valid* output, not *identical* output.

### Lazy loading for bundle size

BlockEditor exports `LazyBlockEditor` for code splitting:
```typescript
import { LazyBlockEditor } from '@/components/BlockEditor.js';

// In component:
<Suspense fallback={<Skeleton />}>
  <LazyBlockEditor initialMarkdown={content} onChange={setContent} />
</Suspense>
```

### Theme CSS variables map to shadcn

BlockNote's `--bn-colors-*` variables are mapped to shadcn's `--background`, `--foreground`, 
`--card`, `--border`, etc. in the inline `<style>` tag. If you change the theme in 
`src/index.css`, the editor will inherit those changes.

### Read-only mode hides editing UI via CSS

The CSS rule `.block-editor-wrapper:has([data-editable="false"]) .bn-side-menu { display: none; }`
hides drag handles and the side menu when `editable={false}`. The `slashMenu={editable}` prop
also disables the slash command menu in read-only mode.

### Keyboard shortcuts work out of the box

BlockNote's built-in shortcuts are handled at the ProseMirror level:
- `Cmd+B` — bold
- `Cmd+I` — italic
- `/` — slash menu (at line start)

These are tested manually; automated keyboard testing in jsdom is unreliable for ProseMirror.

### Content initialization like TipTap — use `key` to remount

Like TipTap, BlockNote's `useCreateBlockNote()` only initializes once. Use `key={content}` 
on the `<BlockEditor>` or `<LazyBlockEditor>` component to force remount when external 
content changes (e.g. switching between person records).

---

## Navigation Guard Pattern (first use: V3-2)

### useBlocker requires a data router

React Router's `useBlocker` hook only works with data routers (`createBrowserRouter`, `createMemoryRouter`
with `RouterProvider`). It does NOT work with `MemoryRouter` or `BrowserRouter` directly.

For testing components that use `useBlocker`, use `createMemoryRouter`:
```tsx
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

function renderPage(initialPath = '/people/john-doe') {
  const router = createMemoryRouter(
    [{ path: '/people/:slug', element: <PersonDetailPage /> }],
    { initialEntries: [initialPath] }
  );
  return render(<RouterProvider router={router} />);
}
```

### useBlocker pattern for unsaved changes

The canonical pattern for warning users about unsaved changes:
```tsx
import { useBlocker } from 'react-router-dom';

// Condition: block navigation when editing AND content differs from original
const blocker = useBlocker(isEditing && editContent !== (person?.rawContent ?? ''));

useEffect(() => {
  if (blocker.state === 'blocked') {
    if (window.confirm('You have unsaved changes. Discard them?')) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }
}, [blocker]);
```

Key points:
- The blocker condition must be a boolean (not just truthy/falsy)
- `blocker.state` is 'idle', 'blocked', or 'proceeding'
- Call `blocker.proceed()` to allow navigation, `blocker.reset()` to cancel
- The confirm dialog appears in the useEffect when state becomes 'blocked'

---

## SearchableSelect Component (2026-03-10)

### Null vs empty string for "None" selection

When implementing a "None" or "Clear" option in SearchableSelect, use `null` not `""`:

```tsx
// ❌ WRONG - passes empty string
onClick={() => onSelect("")}

// ✅ CORRECT - passes null as expected by consumers
onClick={() => onSelect(null)}
```

The type signature `onSelect: (id: string | null) => void` expects `null` for "no selection". 
Consumers checking `if (selected === null)` will break if they receive `""` instead.

### Markdown rendering - avoid underscore italic in technical content

The `_text_` italic pattern conflicts with snake_case identifiers:

```tsx
// ❌ This will render "user_profile_id" as "user<em>profile</em>id"
const regex = /(\*\*(.+?)\*\*)|(_(.+?)_)/g;

// ✅ For technical content, only support bold (**text**)
const regex = /\*\*(.+?)\*\*/g;
```

If italic is needed, use word boundary checks to avoid mid-word matches.

---

## Pagination + Optimistic Updates (2026-03-10)

**Gotcha**: When adding pagination to a query that has optimistic update mutations, update those mutations to use `getQueriesData`/`setQueriesData` (plural forms) instead of singular forms. The singular forms require exact key match; the plural forms do partial matching across all pagination variants.

### Pagination response format change breaks consumers (2026-03-10)

**What broke**: Dashboard and MeetingDetail pages crashed after pagination merge.

**Why**: The `useMeetings()` hook changed from returning `Meeting[]` to returning `{ meetings: Meeting[], total, offset, limit }`. Pages using the old destructure pattern `const { data: meetings = [] } = useMeetings()` got an object instead of an array, then crashed when calling array methods.

**Fix**: Update all consumers to extract the array:
```tsx
// ❌ WRONG - data is now { meetings, total, offset, limit }, not Meeting[]
const { data: meetings = [] } = useMeetings();

// ✅ CORRECT - extract the array from the paginated response
const { data } = useMeetings();
const meetings = data?.meetings ?? [];
```

**Prevention**: When changing a hook's return type, grep for ALL usages and update them in the same PR. The pagination PR updated `MeetingsIndex` but missed `Dashboard` and `MeetingDetail`.

**Why this breaks**: Before pagination, cache key is `['people']`. After pagination, cache key is `['people', 25, 0]` (with limit/offset). `getQueryData(['people'])` returns `undefined` because there's no exact match. The optimistic update silently fails.

**Pattern**:
```typescript
// ❌ WRONG - won't match paginated keys like ['people', 25, 0]
const previousData = queryClient.getQueryData<PeopleResponse>(['people']);
queryClient.setQueryData<PeopleResponse>(['people'], (old) => ...);

// ✅ CORRECT - partial match updates all paginated variants
const previousData = queryClient.getQueriesData<PeopleResponse>({ queryKey: ['people'] });
queryClient.setQueriesData<PeopleResponse>({ queryKey: ['people'] }, (old) => ...);

// onError rollback - iterate over array of [key, data] tuples
for (const [key, data] of context.previousData) {
  queryClient.setQueryData(key, data);
}
```

---

## useCallback Stale Closure with Rapid User Interactions (2026-03-20)

**What broke**: When user selected a goal on an action item, then quickly clicked "approve" on another item, the goal selection was lost.

**Why**: Classic React stale closure bug. The `handleStatusChange` callback used `items` from its closure:
```tsx
const handleStatusChange = useCallback((id: string, status: ItemStatus) => {
  onItemsChange(items.map((i) => (i.id === id ? { ...i, status } : i)));
}, [items, onItemsChange]);
```

When user sets a goal, state updates to `items_v2`. React schedules a re-render, but before it happens, user clicks approve. The callback still references `items_v1` (without the goal), so the status change overwrites the goal change.

**Fix**: Use a ref that's always synchronized with the latest items:
```tsx
const itemsRef = useRef(items);
useEffect(() => {
  itemsRef.current = items;
}, [items]);

const handleStatusChange = useCallback((id: string, status: ItemStatus) => {
  onItemsChange(itemsRef.current.map((i) => (i.id === id ? { ...i, status } : i)));
}, [onItemsChange]); // Note: no items dependency needed
```

**Prevention**: When callbacks modify state arrays and users can trigger multiple changes rapidly, use a ref pattern instead of depending on the prop/state directly in useCallback.

---

## Pre-Edit Checklist
- [ ] Type changes in `src/api/types.ts` need corresponding changes in `src/api/meetings.ts` (mapping layer) and possibly component props
- [ ] New API endpoints → add to `src/api/meetings.ts` + a hook in `src/hooks/meetings.ts`
- [ ] SSE streams need cleanup in `useEffect` return function
- [ ] TanStack Query v5: mutations use `isPending`, not `isLoading`
- [ ] Don't import from `@/data/meetings` in production components — use `@/api/types` and `@/hooks/meetings`
- [ ] New pages need: loading skeletons, error state, empty state (per tab for tabbed pages)
