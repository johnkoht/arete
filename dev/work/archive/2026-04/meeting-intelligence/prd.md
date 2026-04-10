# PRD: Meeting Intelligence — Enriched Frontmatter, Manifest & Area Topics

**Version**: 1.0
**Status**: Ready for Execution
**Date**: 2026-04-05
**Branch**: `feature/meeting-intelligence`

---

## Goal

Give agents fast, structured access to meeting intelligence — topics, item counts, and cross-meeting context — without reading full meeting files. Achieved through enriched meeting frontmatter, a rolling meeting manifest, and topic aggregation in area memory.

---

## Out of Scope

- Parent/child area hierarchy
- Cross-area topics
- Topic alias/canonicalization
- Nested topic hierarchies

---

## Tasks

### Task 1: Extend types and update frontmatter parser

**Description**: Add six new fields to meeting-related type definitions and update the frontmatter parser to actually read them. This is the foundation all subsequent tasks depend on.

**Files to read before starting**:
- `packages/core/src/integrations/meetings.ts` — `MeetingForSave` interface
- `packages/core/src/services/meeting-extraction.ts` — `MeetingIntelligence` type
- `packages/core/src/services/meeting-context.ts` — `ParsedMeetingFrontmatter` + `parseMeetingFile()` lines 151–211

**Changes**:

1. `packages/core/src/integrations/meetings.ts` — add to `MeetingForSave`:
   ```typescript
   topics?: string[];
   ```

2. `packages/core/src/services/meeting-extraction.ts` — add to `MeetingIntelligence`:
   ```typescript
   topics?: string[];
   ```

3. `packages/core/src/services/meeting-context.ts` — two changes:
   - Add to `ParsedMeetingFrontmatter`: `topics?: string[]`, `open_action_items?: number`, `my_commitments?: number`, `their_commitments?: number`, `decisions_count?: number`, `learnings_count?: number`
   - **Update `parseMeetingFile()`** to explicitly read and return all six new fields from YAML frontmatter. Fields absent in frontmatter must return `undefined`, not throw.

**Pre-mortem mitigations**:
- Just adding types is NOT enough — `parseMeetingFile()` must be updated or area memory (Task 5) will silently get `undefined` for all new fields
- Use `.js` extensions in imports (NodeNext module resolution)

**Acceptance Criteria**:
- `npm run typecheck` passes with no new errors
- `parseMeetingFile()` returns correct values for all six new fields when they are present in a meeting file's frontmatter
- `parseMeetingFile()` returns `undefined` for all six new fields when they are absent (existing test-data files are unaffected)
- All existing tests pass (`npm test`)

---

### Task 2: Add topic extraction to LLM prompt

**Description**: Extend the meeting extraction LLM prompt to extract topics, and update the response parser to validate and clean topic slugs.

**Files to read before starting**:
- `packages/core/src/services/meeting-extraction.ts` — `buildMeetingExtractionPrompt()` (lines 542–635), `parseMeetingExtractionResponse()`, `MeetingIntelligence` type, existing validation patterns (garbage prefix filter, trivial pattern filter)

**Changes in `packages/core/src/services/meeting-extraction.ts`**:

1. `buildMeetingExtractionPrompt()` — add `topics` to the JSON schema block:
   ```json
   "topics": ["3-6 slug-format keywords describing what this meeting was substantively about"]
   ```
   Add prompt guidance: *"Topics must be specific concepts, features, or domains discussed. Format as lowercase-hyphenated slugs (e.g. 'email-templates', 'q2-planning', 'onboarding-v2'). 3–6 topics maximum. Exclude generic words: 'meeting', 'discussion', 'update', 'call', 'sync', 'review', 'followup', 'follow-up', 'next-steps'."*

2. `parseMeetingExtractionResponse()` — extract and validate `topics`:
   - Extract `topics` array from parsed JSON
   - Validate each item matches `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` — drop invalid items silently
   - Drop items in banned list: `['meeting', 'discussion', 'update', 'call', 'sync', 'review', 'followup', 'follow-up', 'next-steps']`
   - Cap at 6 items
   - `topics` absent or non-array → return `[]`, log warning, never fail extraction

**Pre-mortem mitigations**:
- Bad topics must degrade gracefully — never fail extraction due to invalid topics
- Validation should be silent drops with a logged warning, not throws

**Acceptance Criteria**:
- `buildMeetingExtractionPrompt()` output contains `"topics"` key in its JSON schema block
- Unit test: `parseMeetingExtractionResponse()` with mock response containing mixed valid/invalid topics (caps, spaces, banned words) → only valid slugs returned
- Unit test: `topics` absent from LLM response → returns `[]`, no throw, no test failure
- Unit test: topics with spaces or uppercase → dropped (not transformed)
- `npm run typecheck && npm test` pass

---

### Task 3: Populate frontmatter counts and topics in meeting-apply

**Description**: After applying meeting intelligence, write the six new frontmatter fields to the meeting file. Counts are derived from staged items, topics come from the intelligence object.

**Files to read before starting**:
- `packages/core/src/services/meeting-apply.ts` — `applyMeetingIntelligence()` full function (lines 156–234), how frontmatter is mutated and written
- `packages/core/src/services/meeting-processing.ts` — `ProcessedMeetingResult` and `FilteredItem` types (lines 74–87), the exact shape of staged items and where `direction` lives on action items

**Changes in `packages/core/src/services/meeting-apply.ts`**:

After staging items are computed, derive and write to frontmatter:

```typescript
// "open" = pending OR approved (not skipped — includes reconciled-as-duplicate items)
const actionItems = stagedItems.filter(i => i.type === 'action_item' && i.status !== 'skipped');
const myCommitments = actionItems.filter(i => i.owner?.direction === 'i_owe_them').length;
const theirCommitments = actionItems.filter(i => i.owner?.direction === 'they_owe_me').length;

frontmatter.topics = intelligence.topics ?? [];
frontmatter.open_action_items = actionItems.length;
frontmatter.my_commitments = myCommitments;
frontmatter.their_commitments = theirCommitments;
frontmatter.decisions_count = stagedItems.filter(i => i.type === 'decision').length;
frontmatter.learnings_count = stagedItems.filter(i => i.type === 'learning').length;
```

**Pre-mortem mitigations**:
- Read `ProcessedMeetingResult` and `FilteredItem` types in full before writing — the `direction` field path must be verified against the actual type, not assumed
- Do NOT write counts in `saveMeetingFile()` or the CLI directly — only in `applyMeetingIntelligence()` (the counts are only knowable after extraction)
- All file I/O through `StorageAdapter` — no raw `fs` calls

**Acceptance Criteria**:
- After `arete meeting apply` on a test file with known extraction output, frontmatter contains all six new fields with correct values
- Test with a fixture: 2 pending `i_owe_them` + 1 approved `they_owe_me` + 1 skipped → `open_action_items: 3`, `my_commitments: 2`, `their_commitments: 1`
- `topics: []` written when intelligence has no topics
- `npm run typecheck && npm test` pass

---

### Task 4: Build meeting manifest generator and wire into CLI

**Description**: Create a new service that generates a rolling 90-day `MANIFEST.md` aggregating key metadata from all meeting files. Wire it into `arete index` (blocking) and `meeting apply` (async/non-blocking).

**Files to read before starting**:
- `packages/core/src/services/meeting-context.ts` — `parseMeetingFile()` (lines 151–211) — reuse the YAML parsing approach, do NOT reimplement
- `packages/cli/src/commands/index-search.ts` — full file, to understand where to add the manifest call
- `packages/core/src/services/entity.ts` — `writePersonIndex()` as precedent for auto-generated aggregation files
- `packages/core/src/integrations/meetings.ts` — `LEARNINGS.md` in the integrations directory

**New file: `packages/core/src/services/meeting-manifest.ts`**

```typescript
export async function generateMeetingManifest(
  workspacePaths: WorkspacePaths,
  storage: StorageAdapter,
  options?: { windowDays?: number }
): Promise<void>
```

Logic:
1. Glob `resources/meetings/*.md` from workspace root
2. Filter to files within `windowDays` (default: 90) based on YYYY-MM-DD filename prefix
3. For each file: read only the frontmatter block (stop reading at closing `---`) — do not load full transcript
4. Sort descending by date, group by ISO week
5. Compute aggregate header: `total_meetings`, `open_action_items` (sum), `my_commitments` (sum), `their_commitments` (sum)
6. Write `resources/meetings/MANIFEST.md`
7. Missing frontmatter fields degrade gracefully — omit the line, do not throw
8. Use `StorageAdapter` for all I/O — no raw `fs` calls

**Manifest format**:
```markdown
---
generated_at: 2026-04-05T10:00:00Z
window_days: 90
total_meetings: 14
open_action_items: 5
my_commitments: 3
their_commitments: 2
---

# Meeting Manifest

## Week of 2026-03-30

### 2026-04-04 | Q2 Planning | important | processed
- file: 2026-04-04-q2-planning.md
- people: sarah-jones, mike-chen
- area: product
- topics: roadmap, q2-planning, staffing
- open_items: 3 (mine: 2, theirs: 1) | decisions: 2
```

**Wire into `arete index`** (`packages/cli/src/commands/index-search.ts`):
- After `refreshQmdIndex()` call, call `generateMeetingManifest()`
- Log: `"Meeting manifest updated (N meetings)"`
- This call is blocking/awaited

**Wire into `meeting apply`**:
- After primary result is returned to CLI, trigger `generateMeetingManifest()` as fire-and-forget (do not await)
- If it fails, log a warning but do not fail the apply command

**Export**: Export `generateMeetingManifest` from `packages/core/src/services/index.ts` or the core barrel export.

**Pre-mortem mitigations**:
- Do NOT reimplement YAML parsing — use the same approach as `parseMeetingFile()`
- Manifest generator reads frontmatter only (stop at `---`) for performance
- Fire-and-forget in apply — manifest failure must never fail the apply
- `StorageAdapter` for all file I/O

**Acceptance Criteria**:
- `arete index` generates `resources/meetings/MANIFEST.md` with correct weekly groupings and aggregate stats from test-data meetings
- Manifest entries with missing fields (no `topics`, no `importance`) render without those lines rather than crashing or showing `undefined`
- `arete meeting apply` completes at normal speed; manifest regenerates asynchronously
- Unit test: `generateMeetingManifest()` with mock `StorageAdapter` + 3 meetings across 2 weeks → correct `MANIFEST.md` output verified
- `npm run typecheck && npm test` pass

---

### Task 5: Add topics aggregation to area memory

**Description**: Update the area memory refresh to scan meeting frontmatter for topics and write a structured `topics` block to area memory files.

**Files to read before starting**:
- `packages/core/src/services/area-memory.ts` — `computeAreaData()` (lines 454–507), meeting scanning section (~line 536), `generateAreaMemoryContent()`, `AreaMemoryData` interface, `extractKeywords()` function, `DEFAULT_STALE_DAYS` and `RECENT_DAYS` constants
- `packages/core/test/services/area-memory.test.ts` — fixture patterns, `makeMeeting()` helper if it exists

**Changes in `packages/core/src/services/area-memory.ts`**:

Add to `AreaMemoryData` interface:
```typescript
topics: Array<{
  slug: string;
  name: string;            // 'email-templates' → 'Email Templates' (hyphens→spaces, title-case)
  meetingCount: number;
  openItems: number;       // sum of open_action_items frontmatter; 0 if field absent (historical meetings)
  lastReferenced: string;  // ISO date YYYY-MM-DD
}>;
```

In `computeAreaData()`, when scanning meeting files:
- Read `topics` frontmatter field alongside existing fields (`attendee_ids`, `title`, `date`, `open_action_items`)
- Use BOTH matching paths: frontmatter `area:` field AND recurring meeting title match — a meeting matched by either path contributes its topics
- Aggregate per topic slug: count occurrences, sum `open_action_items` (treat absent as 0), track most recent date
- After aggregating, filter: exclude topics where `lastReferenced > 60 days ago AND openItems === 0`

In `generateAreaMemoryContent()`, write `topics` block to frontmatter YAML:
```yaml
topics:
  - slug: email-templates
    name: Email Templates
    meeting_count: 3
    open_items: 2
    last_referenced: "2026-04-04"
```

**Historical meetings note**: Meetings processed before this feature shipped will not have `topics` frontmatter. They will not contribute topic entries. This is correct behavior — do not attempt to extract topics from their body content.

**Pre-mortem mitigations**:
- Confirm area matching uses BOTH paths before writing — if only title matching is used, ad-hoc meetings with `area:` frontmatter field will be missed
- `openItems: 0` for meetings without `open_action_items` frontmatter is expected degraded behavior, not a bug
- `StorageAdapter` for all file I/O

**Acceptance Criteria**:
- After `arete memory refresh` on an area whose meetings have `topics` frontmatter, the area memory file frontmatter contains a `topics` block with correct aggregated data
- A meeting matched via `area:` frontmatter field (not title match) contributes its topics to the area
- A meeting without `topics` frontmatter does not cause errors; it simply contributes no topic entries
- Topics with `lastReferenced > 60 days` AND `openItems === 0` are excluded from the output
- Unit test in `area-memory.test.ts`: fixture with 2 meetings tagged `email-templates` (1 with `open_action_items: 2`) + 1 meeting tagged `sms` → area memory has 2 topics, `email-templates` has `open_items: 2`
- `npm run typecheck && npm test` pass

---

## Verification (end-to-end)

1. `npm run typecheck` — passes after Task 1
2. `npm test` — all existing tests pass; new tests added at Tasks 2, 3, 4, 5
3. **Task 3 manual**: Run `arete meeting apply <test-file> --intelligence <json>` → frontmatter has all six new fields with correct values
4. **Task 4 manual**: Run `arete index` → `resources/meetings/MANIFEST.md` exists, grouped by week, aggregate stats correct
5. **Task 5 manual**: Run `arete memory refresh` → `.arete/memory/areas/{slug}.md` frontmatter has `topics` block
