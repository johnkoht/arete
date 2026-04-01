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
