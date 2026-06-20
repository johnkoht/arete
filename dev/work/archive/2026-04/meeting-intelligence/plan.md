---
title: "Meeting Intelligence: Enriched Frontmatter, Manifest & Area Topics"
slug: meeting-intelligence
status: approved
size: medium
tags: [meetings, intelligence, area-memory, manifest]
created: "2026-04-05T00:00:00.000Z"
updated: "2026-04-05T00:00:00.000Z"
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 5
---

# Meeting Intelligence: Enriched Frontmatter, Manifest & Area Topics

## Context

Agents discovering relevant meetings currently must load and parse full meeting files to answer questions like "what do I owe people this week?" or "what was decided about X?". Three layered improvements fix this:

1. **Enriched frontmatter** — topics + item counts extracted at `meeting apply` time, so any file scan yields structured signal without reading the body
2. **Meeting manifest** — a single `resources/meetings/MANIFEST.md` rolling up all meeting frontmatter (90-day window), so agents scan one file instead of N
3. **Area memory topics** — area memory aggregates topics from tagged meetings, giving area-level topic intelligence without touching individual meeting files

Each layer depends on the previous one. Steps must be executed in order (1→2→3→4→5).

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/integrations/meetings.ts` | `MeetingForSave` interface — add `topics?` |
| `packages/core/src/services/meeting-extraction.ts` | `MeetingIntelligence` type + `buildMeetingExtractionPrompt()` + `parseMeetingExtractionResponse()` |
| `packages/core/src/services/meeting-context.ts` | `ParsedMeetingFrontmatter` — add new readable fields; `parseMeetingFile()` — update parser to read them |
| `packages/core/src/services/meeting-apply.ts` | `applyMeetingIntelligence()` — write topics + counts to frontmatter |
| `packages/core/src/services/meeting-manifest.ts` | **New** — manifest generator service |
| `packages/core/src/services/area-memory.ts` | `computeAreaData()` — aggregate topics from meeting frontmatter |
| `packages/cli/src/commands/index-search.ts` | Wire manifest rebuild into `arete index` |
| `packages/core/test/services/meeting-extraction.test.ts` | Tests for topic extraction |
| `packages/core/test/services/area-memory.test.ts` | Tests for topic aggregation |

---

## Plan

### Step 1 — Extend types and update frontmatter parser

**Before starting**: Read `packages/core/src/integrations/meetings.ts` (MeetingForSave), `packages/core/src/services/meeting-extraction.ts` (MeetingIntelligence), and `packages/core/src/services/meeting-context.ts` (ParsedMeetingFrontmatter + parseMeetingFile lines 151–211) in full.

Add to `MeetingForSave` (`meetings.ts`): `topics?: string[]`

Add to `MeetingIntelligence` (`meeting-extraction.ts`): `topics?: string[]`

Add to `ParsedMeetingFrontmatter` (`meeting-context.ts`): `topics`, `open_action_items`, `my_commitments`, `their_commitments`, `decisions_count`, `learnings_count` (all optional).

**Also update `parseMeetingFile()`** to explicitly map and return the six new frontmatter fields. Fields absent in frontmatter return `undefined`, never throw.

**Acceptance:**
- `npm run typecheck` passes
- `parseMeetingFile()` returns correct values for new fields when present; `undefined` when absent
- Existing tests unaffected

---

### Step 2 — Add topic extraction to LLM prompt

**Before starting**: Read `meeting-extraction.ts` `buildMeetingExtractionPrompt()` (lines 542–635) and `parseMeetingExtractionResponse()` in full.

Add `topics` to JSON schema in `buildMeetingExtractionPrompt()`. Add prompt guidance: specific concepts/features as lowercase-hyphenated slugs, 3–6 max, banned list: `['meeting', 'discussion', 'update', 'call', 'sync', 'review', 'followup', 'follow-up', 'next-steps']`.

In `parseMeetingExtractionResponse()`: validate each topic matches `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`, drop banned words, cap at 6. Bad topics → silent drop, never fail extraction.

**Acceptance:**
- `buildMeetingExtractionPrompt()` output contains `"topics"` key in JSON schema
- Unit test: mixed valid/invalid topics → only valid slugs returned
- Unit test: `topics` missing from response → returns `[]`, no throw
- `npm run typecheck && npm test` pass

---

### Step 3 — Populate frontmatter counts + topics in `meeting-apply`

**Before starting**: Read `packages/core/src/services/meeting-apply.ts` in full. Read `packages/core/src/services/meeting-processing.ts` lines 74–87 (`ProcessedMeetingResult`, `FilteredItem` types) to confirm staged item shape before writing count logic.

After staging items in `applyMeetingIntelligence()`, write to frontmatter:
- `topics`: from `intelligence.topics ?? []`
- `open_action_items`: action items with `status !== 'skipped'` (includes pending + approved)
- `my_commitments`: action items where `direction === 'i_owe_them'`
- `their_commitments`: action items where `direction === 'they_owe_me'`
- `decisions_count`: staged decisions count
- `learnings_count`: staged learnings count

**Acceptance:**
- After `arete meeting apply`, frontmatter has all six new fields
- Fixture: 2 pending mine + 1 approved theirs + 1 skipped → `open_action_items: 3`, `my_commitments: 2`, `their_commitments: 1`
- `npm run typecheck && npm test` pass

---

### Step 4 — Build meeting manifest generator + wire into CLI

**Before starting**: Read `parseMeetingFile()` (`meeting-context.ts` lines 151–211) — reuse same YAML parsing approach. Read `index-search.ts` in full. Read `entity.ts` `writePersonIndex()` as precedent for auto-generated aggregation files.

**New file: `packages/core/src/services/meeting-manifest.ts`**

```typescript
export async function generateMeetingManifest(
  workspacePaths: WorkspacePaths,
  storage: StorageAdapter,
  options?: { windowDays?: number }
): Promise<void>
```

- Glob `resources/meetings/*.md`, filter to 90-day window by filename date
- Read frontmatter only (stop at closing `---`) — do not read full file body
- Sort descending, group by ISO week
- Write `resources/meetings/MANIFEST.md` with YAML header (totals) + weekly sections
- Use `StorageAdapter` for all I/O — no raw `fs`
- Missing frontmatter fields degrade gracefully (omit line, don't throw)

Wire into `arete index` (`index-search.ts`): call after `refreshQmdIndex()`, log count.

Wire into `meeting apply`: fire-and-forget after primary result returned — do not await, log warning on failure, never fail the apply.

**Acceptance:**
- `arete index` generates `MANIFEST.md` from test-data with correct weekly groupings + aggregate stats
- Missing frontmatter fields handled gracefully
- Apply completes at normal speed; manifest updates async
- Unit test: 3 mock meetings across 2 weeks → correct MANIFEST.md
- `npm run typecheck && npm test` pass

---

### Step 5 — Add topics aggregation to area memory

**Before starting**: Read `area-memory.ts` `computeAreaData()` (lines 454–507) and meeting scanning section (~line 536) in full. Confirm area matching uses frontmatter `area:` field AND title matching — use BOTH for topic aggregation. Read `area-memory.test.ts` for fixture patterns.

Add to `AreaMemoryData`:
```typescript
topics: Array<{
  slug: string;
  name: string;       // 'email-templates' → 'Email Templates'
  meetingCount: number;
  openItems: number;  // sum of open_action_items; 0 if field absent (historical meetings)
  lastReferenced: string;
}>;
```

In `computeAreaData()`: read `topics` alongside `attendee_ids` from matched meetings (both `area:` frontmatter AND title match paths). Aggregate per-topic: count, sum openItems, track latest date. Exclude: `lastReferenced > 60 days AND openItems === 0`.

In `generateAreaMemoryContent()`: write `topics` block to frontmatter YAML.

Historical meetings (pre-feature) contribute to `meetingCount` but show `openItems: 0` — expected, not a bug.

**Acceptance:**
- After `arete memory refresh`, area memory frontmatter has `topics` block
- Meeting matched via `area:` frontmatter field contributes its topics
- Meeting without `topics` frontmatter → no crash, no topic entries
- Stale topics (>60d, 0 open) excluded
- Unit test: 2 meetings tagged `email-templates` + 1 tagged `sms` → correct topic aggregation
- `npm run typecheck && npm test` pass

---

## Out of Scope
- Parent/child area hierarchy
- Cross-area topics
- Topic alias/canonicalization

---

## Verification (end-to-end)
1. `npm run typecheck` passes after Step 1
2. `npm test` — all tests pass; new tests at Steps 2, 3, 4, 5
3. Step 3 manual: `arete meeting apply` → frontmatter has all six new fields
4. Step 4 manual: `arete index` → `MANIFEST.md` exists with correct structure
5. Step 5 manual: `arete memory refresh` → area memory has `topics` block

---

## Pre-Mortem Mitigations
- **Fragmented write path**: Read all frontmatter write sites before touching Step 3. New fields belong in `applyMeetingIntelligence()` only.
- **LLM topic quality**: Enforce slug regex + banned word list in parser. Never fail extraction for bad topics.
- **Type shape**: Read `ProcessedMeetingResult` and `FilteredItem` before writing Step 3 count logic.
- **Manifest latency**: Fire-and-forget after apply. Read frontmatter only (stop at `---`).
- **Area matching**: Both `area:` frontmatter AND title matching contribute topics in Step 5.
- **No reimplementation**: Manifest uses same YAML parsing approach as `parseMeetingFile()`.
- **StorageAdapter**: All file I/O through `StorageAdapter` — no raw `fs` calls.
- **Tests**: Node built-in `test` module. Follow `describe`/`it`/`assert` patterns.
