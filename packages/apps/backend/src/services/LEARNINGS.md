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

## agent.ts

### Backend hand-rolls frontmatter writes parallel to meeting-apply.ts — keep them in sync

**Date**: 2026-04-23
**Bug**: `runProcessingSessionTestable` in `agent.ts` writes frontmatter
inline (currently around L408–L460) instead of calling
`applyMeetingIntelligence` from `@arete/core`. Over time the two paths
drifted: `meeting-apply.ts:259-264` writes `topics`, `open_action_items`,
`my_commitments`, `their_commitments`, `decisions_count`,
`learnings_count`; the backend wrote NONE of these. Result: every meeting
processed via web UI / backend lacked the frontmatter fields the rest
of the system depends on. Topic-wiki-memory (2026-04-23) silently broke
on this path because no `topics:` ever made it to disk for backend-
processed meetings.

This is the **third** time this dual-implementation drift has bitten:
- 2026-03-17 (`approval-integration.test.ts`): backend approve never
  resolved attendees → CommitmentsService received empty input. Fixed
  by adding attendee resolution into `approveMeeting()`.
- 2026-04-05 (`feat(meeting-apply): write topics + item counts`):
  CLI-only fix; backend was missed.
- 2026-04-23 (this entry): topic-wiki-memory's Hook 1 (alias/merge at
  apply) and Hook 2 (integrateSource at approve) were wired into the
  CLI but not the backend; symptom was the same as 2026-04-05 (no
  topics on disk).

**Root cause**: the backend imports `applyMeetingIntelligence` from
`@arete/core` (`agent.ts:30`) but never calls it — it has its own
parallel implementation. The two diverge whenever someone touches the
core function and forgets the backend.

**Fix** (this hotfix):
- Backend now writes the same six frontmatter fields meeting-apply
  writes, in the same order (`agent.ts` ~L408–L460).
- Hook 1 (alias/merge) runs inline when `topicMemory` + `workspacePaths`
  are reachable via `getOrCreateServices(workspaceRoot)` — uses
  `synthesis` tier (matches CLI).
- Hook 2 (integrateSource) added to the approve route handler in
  `routes/meetings.ts` after `approveMeeting()` succeeds. Non-fatal:
  failure logs but returns the approved meeting unchanged.

**Invariant going forward**:
- Any frontmatter field written by `meeting-apply.ts` MUST also be
  written by `agent.ts:runProcessingSessionTestable` — they are two
  entry points to the same logical operation.
- When adding a new field to `meeting-apply.ts` frontmatter writes:
  grep `agent.ts` for the existing fm assignments and add the
  equivalent there in the same commit.

**Better long-term fix** (not this hotfix): refactor `agent.ts` to call
`applyMeetingIntelligence` instead of hand-rolling the write. The
current divergence (SSE events, `staged_item_*` writes,
`processMeetingExtraction` post-filtering) makes that non-trivial — it
requires either threading SSE callbacks into `applyMeetingIntelligence`
or restructuring the SSE event reporting around the core function. See
Phase C plan for AI-mock CLI test infrastructure that would make this
refactor safer to ship.

**Regression coverage**:
- `test/services/agent.test.ts` — new test "writes topics + item count
  fields to frontmatter (Hook 1 inputs)" asserts all six fields land
  after a processing run with no topicMemory dep (verbatim path).
- Hook 2 (route-level) lacks a unit test because the existing meetings
  route test pattern reimplements routes inline; testing Hook 2 there
  would mostly test a mocked replica. Deferred to Phase C plan item 5
  (AI mock infrastructure) for end-to-end coverage. Manual QA on a
  real workspace is the current verification path.
