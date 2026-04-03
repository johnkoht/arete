# Web App Learnings

Component-specific gotchas and patterns discovered during development.

## Gotchas

### jsdom lacks scrollIntoView (first use: task-11, 2026-03-31)

jsdom (used by vitest for DOM testing) doesn't implement `Element.scrollIntoView()`.
Components using it will throw `TypeError: scrollIntoView is not a function` in tests.

**Pattern**: Use optional chaining on `scrollIntoView`:
```typescript
// ✗ Throws in jsdom
element.scrollIntoView({ block: 'nearest' });

// ✓ Safe in jsdom
element.scrollIntoView?.({ block: 'nearest' });
```

This makes the component work in both browser (scrolls) and test (no-op) environments.

### DELETE endpoints returning 204 No Content (first use: task-5, 2026-03-31)

Some DELETE endpoints return `204 No Content` (empty body) per REST conventions.
`apiFetch` in `client.ts` attempts to parse JSON, which fails on empty responses.

**Pattern**: Use raw `fetch` for 204 endpoints:
```typescript
export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}: ${res.statusText}`);
  }
  // 204 = success, no body to parse
}
```

**Why not extend apiFetch?** Adding special 204 handling would complicate the common case.
Most endpoints return JSON; only DELETE with 204 needs this pattern.

### Date string consistency in tests (first use: task-ui-bugs, 2026-04-02)

When comparing dates between components and tests, ensure both use the same date calculation logic.

**Problem**: Component uses `new Date(year, month, date)` (local midnight) then `toISOString()`, 
which shifts dates when local midnight is "yesterday" in UTC (e.g., timezone UTC-8 at 3am local).

**Pattern**: Test helpers should match component logic exactly:
```typescript
// ✗ May differ from component due to timezone
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// ✓ Matches component's getToday() logic
function getToday(): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.toISOString().split('T')[0];
}
```

### React Query cache invalidation for related queries (first use: task-ui-bugs, 2026-04-02)

When a mutation affects data shown in multiple query types, invalidate all related caches.

**Pattern**: In `useUpdateTask`/`useCompleteTask`, invalidate both main tasks and suggestions:
```typescript
onSettled: () => {
  void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['tasks', 'suggested'] });
}
```

**Why?** The `['tasks', 'suggested']` query key is a different query than `['tasks', filter, options]`.
Invalidating `{ queryKey: ['tasks'] }` alone uses prefix matching, but suggestions uses `['tasks', 'suggested']` 
which needs explicit invalidation to ensure updated tasks disappear from suggestions.

### Multi-query cache invalidation pattern (first use: task-8, 2026-04-02)

When a task mutation affects multiple query caches (e.g., completing a task affects both active tasks 
AND completed-today list), invalidate ALL related query keys explicitly.

**Pattern**: Extend mutation handlers to invalidate all affected caches:
```typescript
onSettled: () => {
  void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['tasks', 'suggested'] });
  void queryClient.invalidateQueries({ queryKey: ['tasks', 'completed-today'] });
}
```

**Why?** Prefix matching (`['tasks']`) doesn't catch all variations. Each distinct query key 
(like `['tasks', 'completed-today']`) needs explicit invalidation to avoid stale data.

### setQueriesData with broad queryKey can crash on mismatched cache shapes (first use: task-ui-v2, 2026-04-02)

**Problem**: `queryClient.setQueriesData({ queryKey: ['tasks'] }, ...)` matches ALL caches
starting with `['tasks']` — including `['tasks', 'suggested']` which stores `SuggestedTask[]`
(a flat array), not `TasksResponse` (object with `.tasks` property). Calling `old.tasks.map()`
on an array throws TypeError, which crashes `onMutate` and **prevents mutationFn from firing**.

The user sees: optimistic flash (partial update before crash) → refetch returns old data → snap back.

**Pattern**: Always guard `setQueriesData` against unexpected cache shapes:
```typescript
// ✗ Crashes when cache stores SuggestedTask[] (array, not object)
queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) => {
  if (!old) return old;
  return { ...old, tasks: old.tasks.map(...) }; // old.tasks is undefined on arrays!
});

// ✓ Safe — skips caches that don't match expected shape
queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) => {
  if (!old || !('tasks' in old) || !Array.isArray(old.tasks)) return old;
  return { ...old, tasks: old.tasks.map(...) };
});
```

**Why tests didn't catch this**: Tests seed cache with `setQueryData(['tasks', undefined, undefined], mockResponse)`
which always matches the expected shape. The `['tasks', 'suggested']` cache is only populated
when both `useTasks()` and `useTaskSuggestions()` hooks are mounted — which doesn't happen in
isolated hook tests.

### Don't debounce deliberate user actions (first use: task-ui-v2, 2026-04-02)

**Problem**: `useUpdateTask` and `useCompleteTask` had a 100ms debounce + `mutation.isPending` guard
that silently dropped calls. When user clicked "Tomorrow" in SchedulePopup:
1. Optimistic update flashed the new state
2. Debounced mutation was dropped (isPending from a prior mutation)
3. `onSettled` refetched old state → task snapped back

**Root cause**: Debounce pattern was designed for rapid-fire inputs (typing, sliders), not
one-shot button clicks (schedule, complete, assign). The `isPending` guard made it worse —
any in-flight mutation caused ALL subsequent mutations to be silently dropped.

**Pattern**: Call `mutation.mutate()` directly for button-click actions:
```typescript
// ✗ Over-engineered — drops calls silently
const mutate = useCallback((params) => {
  debounceTimerRef.current = setTimeout(() => {
    if (mutation.isPending) return; // DROPS THE CALL!
    mutation.mutate(params);
  }, 100);
}, [mutation.isPending]);

// ✓ Direct — TanStack Query handles concurrent mutations
return { mutate: mutation.mutate };
```

**When to debounce**: Text inputs, search-as-you-type, sliders — high-frequency events.
**When NOT to debounce**: Button clicks, checkbox toggles, dropdown selections — deliberate actions.

## Invariants

### Task scheduling requires destination for cross-tab visibility

When scheduling a task from Someday/Anytime via SchedulePopup or TodayView:
- **Today** → Set `destination: 'must'` + `due: today` — ensures task appears in Today tab
- **Tomorrow** → Set `destination: 'should'` + `due: tomorrow` — ensures task appears in Upcoming tab
- **Pick date** → Set `destination: 'must'` (if today) or `'should'` (if future)

The backend filters tasks by both `due` date AND `source.section` (destination). Setting only `due` 
would make the task appear in both original tab AND destination tab (duplicate).
