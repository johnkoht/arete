# Web Frontend Package Expertise Profile

> Domain map for `packages/apps/web/`. Orients agents WHERE to look — not an encyclopedia.
> For codebase-wide architectural patterns, see `.pi/standards/patterns.md`.

---

## Purpose & Boundaries

**Web is responsible for**: React UI components, pages, hooks, API client functions, and type definitions for the browser app. It is the user-facing web interface for Areté.

**Web is NOT responsible for**:
- HTTP server, route handlers, SSE → `packages/apps/backend/` (see `.pi/expertise/backend/PROFILE.md`)
- Business logic, domain types, services → `packages/core/`
- CLI commands, terminal UI → `packages/cli/`
- Runtime skills, rules, tools → `packages/runtime/`

**Key principle**: Components consume hooks that wrap API functions. All type mapping from backend wire format to frontend types happens in `src/api/*.ts`, not in components. Types live in `src/api/types.ts`.

---

## Architecture Overview

```
main.tsx (entry) → App.tsx → QueryClientProvider + BrowserRouter
  ├─ API Layer:     src/api/*.ts (typed fetch wrappers + type mapping)
  ├─ Hooks:         src/hooks/*.ts (TanStack Query v5 hooks)
  ├─ Pages:         src/pages/*.tsx (route components)
  ├─ Components:    src/components/*.tsx (reusable UI)
  └─ UI Primitives: src/components/ui/*.tsx (shadcn/ui)
```

**Framework**: React 18 + Vite + TanStack Query v5
**Styling**: Tailwind CSS + shadcn/ui components
**Routing**: React Router v6
**State**: TanStack Query for server state; minimal local state

---

## Directory Structure

```
src/
├── api/          # API client functions + type mappings
│   ├── client.ts    # BASE_URL + apiFetch wrapper
│   ├── types.ts     # All frontend types (single source of truth)
│   ├── meetings.ts  # Meeting API functions + wire→frontend mapping
│   ├── people.ts
│   ├── goals.ts
│   ├── intelligence.ts
│   ├── memory.ts
│   ├── search.ts
│   ├── settings.ts
│   └── dashboard.ts
├── hooks/        # TanStack Query hooks
│   ├── meetings.ts  # useMeetings, useMeeting, useApproveItem, etc.
│   ├── people.ts
│   ├── goals.ts
│   ├── intelligence.ts
│   ├── memory.ts
│   ├── search.ts
│   ├── dashboard.ts
│   └── useProcessingEvents.ts  # App-level SSE subscription
├── pages/        # Route components
│   ├── Dashboard.tsx
│   ├── MeetingsIndex.tsx
│   ├── MeetingDetail.tsx
│   ├── PeopleIndex.tsx
│   ├── PersonDetailPage.tsx
│   ├── GoalsView.tsx
│   ├── CommitmentsPage.tsx
│   ├── MemoryFeed.tsx
│   ├── SearchPage.tsx
│   ├── IntelligencePage.tsx
│   └── SettingsPage.tsx
├── components/   # Shared components
│   ├── AppLayout.tsx
│   ├── AppSidebar.tsx
│   ├── PageHeader.tsx
│   ├── EmptyState.tsx
│   ├── StatusBadge.tsx
│   ├── AvatarStack.tsx
│   ├── ReviewItems.tsx
│   ├── MetadataPanel.tsx
│   ├── MarkdownEditor.tsx
│   ├── BlockEditor.tsx     # TipTap rich text editor
│   └── ui/                 # shadcn/ui primitives
└── lib/          # Utilities
    └── utils.ts  # cn() helper for Tailwind classes
```

---

## API Layer Pattern

### Type Mapping
All wire-format → frontend-type mapping in `src/api/*.ts`:
```typescript
// src/api/meetings.ts
export async function fetchMeetings(): Promise<Meeting[]> {
  const raw = await apiFetch<{ meetings: RawMeeting[] }>('/api/meetings');
  return raw.meetings.map(normalizeMeeting);  // mapping happens here
}

function normalizeMeeting(raw: RawMeeting): Meeting {
  return {
    ...raw,
    status: capitalizeStatus(raw.status),           // 'processed' → 'Processed'
    duration: parseDuration(raw.duration),          // '62 minutes' → 62
    attendees: raw.attendees.map(addInitials),      // compute initials
    reviewItems: flattenStagedItems(raw),           // group → flat array
  };
}
```

### apiFetch Wrapper
`src/api/client.ts` provides the base fetch with error handling:
```typescript
export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3847';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

---

## Hooks Pattern (TanStack Query v5)

### Read Hooks
```typescript
export function useMeetings() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: fetchMeetings,
  });
}

export function useMeeting(slug: string) {
  return useQuery({
    queryKey: ['meeting', slug],
    queryFn: () => fetchMeeting(slug),
    enabled: !!slug,  // conditional fetch
  });
}
```

### Mutation Hooks
```typescript
export function useApproveItem(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params) => patchItem(slug, params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['meeting', slug] });
    },
  });
}
```

### Polling Hook
```typescript
export function useJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2000 : false,  // v5 syntax
  });
}
```

---

## Page Pattern

Every page follows this structure:
```tsx
function SomePage() {
  const { data, isLoading, error } = useSomeData();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!data?.items.length) return <EmptyState icon={...} title="..." description="..." />;

  return (
    <>
      <PageHeader title="Title" description="..." action={<Button />} />
      <div className="p-6">
        {/* content */}
      </div>
    </>
  );
}
```

---

## Component Map

### Layout Components
- **AppLayout** — root layout with sidebar
- **AppSidebar** — navigation sidebar with active state (prefix-based matching)
- **PageHeader** — page title + description + optional action button

### Shared Components
- **EmptyState** — icon + title + description + optional CTA
- **StatusBadge** — colored status indicator
- **AvatarStack** — overlapping avatar circles with initials
- **ReviewItems** — staged item review UI with approve/skip/edit
- **MetadataPanel** — collapsible metadata sidebar

### Editors
- **MarkdownEditor** — simple textarea for markdown
- **BlockEditor** — TipTap v3 rich text editor (see TipTap section below)

### UI Primitives (shadcn/ui)
Standard components in `src/components/ui/`: Button, Card, Dialog, Sheet, Tabs, Table, etc.

---

## SSE Pattern

### App-Level Subscription
Mount `useProcessingEvents()` in a component inside `QueryClientProvider`:
```tsx
// App.tsx
function AppRoutes() {
  useProcessingEvents();  // mount once — invalidates caches on events
  return <Routes>...</Routes>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### EventSource Cleanup
Always clean up EventSource in useEffect:
```tsx
const esRef = useRef<EventSource | null>(null);
useEffect(() => {
  return () => { esRef.current?.close(); };
}, []);
```

---

## URL State Pattern

### Reading URL Params
```tsx
const [searchParams, setSearchParams] = useSearchParams();
const filter = searchParams.get("filter");  // "overdue" | "thisweek" | null
```

### Multi-Param Coexistence
When page has multiple independent params, use functional setter:
```tsx
setSearchParams((prev) => {
  const next = new URLSearchParams(prev);
  next.set("category", value);  // preserves other params
  return next;
});
```

**Don't** use `setSearchParams({ filter: val })` when other params exist — it clobbers them.

---

## TipTap v3 Integration

### Imports
```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';  // NOT from extension-bubble-menu
```

### Content is Initial-Only
`useEditor({ content })` only initializes once. Use `key={content}` to force remount on new data:
```tsx
<BlockEditor key={rawContent} initialValue={rawContent} onChange={...} />
```

### Markdown Serialization
```typescript
onUpdate: ({ editor }) => {
  const md = (editor as unknown as { getMarkdown: () => string }).getMarkdown();
  onChange(md);
}
```

---

## Key Patterns

### Optimistic Updates
For mutations that should feel instant:
```typescript
useMutation({
  onMutate: async ({ id }) => {
    await queryClient.cancelQueries({ queryKey: ['commitments'] });
    const previous = queryClient.getQueriesData({ queryKey: ['commitments'] });
    queryClient.setQueriesData({ queryKey: ['commitments', 'list'] }, (old) => /* optimistic update */);
    return { previous };
  },
  onError: (_err, _vars, context) => {
    for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
  },
});
```

### Conditional Queries
```typescript
useQuery({
  queryKey: ['person', slug],
  queryFn: () => fetchPerson(slug),
  enabled: !!slug,  // don't fetch until slug exists
});
```

### Sheet (Drawer) for Details
```tsx
<Sheet open={!!selectedSlug} onOpenChange={...}>
  <SheetContent>
    {selectedSlug && <PersonDetail slug={selectedSlug} />}
  </SheetContent>
</Sheet>
```

---

## Invariants

- Types live in `src/api/types.ts` — single source of truth
- Wire → frontend mapping in `src/api/*.ts`, never in components
- TanStack Query v5: use `isPending` (not `isLoading`) for mutations
- `refetchInterval` receives query object: `(query) => ...`
- `BASE_URL` from `src/api/client.ts` (uses `import.meta.env.VITE_API_URL`)
- Every page needs: loading state, error state, empty state

---

## Anti-Patterns & Common Mistakes

- **Type mapping in components** → Do it in `src/api/*.ts`
- **Hardcoding API URL** → Use `BASE_URL` from client.ts
- **Storing EventSource in useState** → Use useRef + cleanup
- **Missing query invalidation after mutation** → Chain `invalidateQueries()` in `onSuccess`
- **Using isLoading for mutations** → v5 uses `isPending`
- **Destructive setSearchParams with multiple params** → Use functional setter
- **Expecting TipTap content prop to update live** → Use `key` to remount
- **Importing BubbleMenu from wrong package** → Use `@tiptap/react/menus`

---

## Required Reading

Before working on web components, read:
1. `packages/apps/web/LEARNINGS.md` — comprehensive gotchas and patterns
2. `src/api/types.ts` — all frontend types
3. An example hook in `src/hooks/meetings.ts`
4. An example page like `MeetingsIndex.tsx` for page patterns

---

## Related Expertise

- **Backend API**: `.pi/expertise/backend/PROFILE.md` — provides the API endpoints
- **Core services**: `.pi/expertise/core/PROFILE.md` — domain logic consumed by backend

---

## LEARNINGS.md Location

| Path | Covers |
|------|--------|
| `packages/apps/web/LEARNINGS.md` | API layer, TanStack Query v5, SSE, URL params, TipTap, testing patterns |
