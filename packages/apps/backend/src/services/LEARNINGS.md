# Backend Services — Learnings

Component-local gotchas and invariants for `packages/apps/backend/src/services/`.

## workspace.ts

### Frontmatter enum parsers: validate against the full union, not a partial allowlist

**Date**: 2026-04-22
**Bug**: `parseStagedItemSource` validated incoming values with
`if (val === 'ai' || val === 'dedup')`, which silently dropped any other
valid `ItemSource` value. `'reconciled'` was being dropped for months —
the UI's "already done" badge never rendered because `getMeeting`'s
`?? 'ai'` fallback masked the drop. No errors, no warnings; pure silent
data loss between disk and HTTP response.

**Root cause**: hardcoded allowlist drifted from the canonical
`ItemSource` union in `@arete/core`. Adding a new source to the union
doesn't automatically extend the allowlist.

**Fix** (plan `fewer-llm-calls-open-task-dedup` step 3):
- Import `ItemSource` from `@arete/core` and allowlist against the full union:

```ts
const VALID_ITEM_SOURCES: readonly ItemSource[] = [
  'ai', 'dedup', 'reconciled', 'existing-task', 'slack-resolved',
];
function isItemSource(v: unknown): v is ItemSource {
  return typeof v === 'string' && (VALID_ITEM_SOURCES as readonly string[]).includes(v);
}
```

**Invariant to preserve**:
- Any frontmatter parser that accepts a string-union value MUST import the
  canonical type from `@arete/core` and validate against the full union.
- Do NOT hardcode a partial allowlist — it will silently drop future values.
- For the compiler to catch additions: use `satisfies readonly UnionType[]`
  on the value array so adding a new member to the union without updating
  the parser fails typecheck.

**Regression coverage**:
- `test/services/workspace.test.ts` — round-trip preservation test for all
  union values + explicit "pre-existing silent-drop bug" test for
  `'reconciled'`.
- `test/services/item-source-compat.test.ts` — compile-time exhaustiveness
  via `satisfies` + runtime deepEqual against hard-coded web-side literals
  (since `packages/apps/web` has no `@arete/core` dep and duplicates the union).

**Why this is worth remembering**: silent data loss at serialization
boundaries is one of the hardest bug classes to detect from logs, metrics,
or user reports. The only way to catch it is to test the full round-trip
from disk → parser → response payload. The E2E test in `workspace.test.ts`
(getMeeting with all 5 source values) closes the bug class for this
specific parser; apply the same pattern to other frontmatter parsers.
