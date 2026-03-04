# PRD: People Intelligence

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-03-01  
**Branch**: `feature/people-intelligence`  
**Depends on**: Existing people service, person memory refresh, meeting processing pipeline (all built)

---

## 1. Problem & Goals

### Problem

"Prep for my meeting with Sarah" currently returns her role, recent meetings she appeared in, and mention-frequency memory highlights. It does NOT return: what she cares about, what concerns she's raised, what you owe her, or how healthy the relationship is.

The people service and entity resolution infrastructure is solid. Person memory refresh extracts "repeated asks" and "repeated concerns" via regex signals from meetings. What's missing is the **insight extraction layer** — stances, action items, and relationship health that transform raw meeting data into genuine people intelligence.

### Goals

1. **Stance extraction**: Extract person stances from meeting transcripts via LLM ("Sarah is skeptical of AI features") with source citations. Conservative extraction — precision over recall.
2. **Bidirectional action item tracking**: Extract and persist "I owe them" / "they owe me" action items tied to specific people, with lifecycle management (30-day aging, 10-item cap, dedup).
3. **Relationship health metrics**: Compute meeting frequency, last interaction recency, and open loop count. Surface health indicator (Active/Regular/Cooling/Dormant).
4. **Enriched meeting prep**: Update meeting-prep and process-meetings skills to consume all new intelligence in prep briefs.

### Key Decisions

1. **LLM extraction in separate module** — `person-signals.ts` exports standalone functions accepting `LLMCallFn` as a parameter. EntityService stays LLM-free. `LLMCallFn` passed via `RefreshPersonMemoryOptions`, not class constructor.
2. **Workspace owner via profile.md** — Read `context/profile.md` frontmatter `name` field for "I" identity. Fallback: first-person language heuristics.
3. **Communication Preferences cut** — Persona Council: Harvester harmed by false positives, Preparer sees marginal delta. Backlog for post-v1.
4. **Task 1 (refactor) is mandatory first step** — Extract person-memory module from entity.ts (1,746 lines) before adding new features.
5. **No separate LLM cache** — Rely on existing `ifStaleDays` stale-awareness across invocations + in-memory `Map` within a single refresh call.
6. **Single auto-managed marker pair** — All new subsections render inside existing `AUTO_PERSON_MEMORY:START/END` block.

### Out of Scope

- **Communication Preferences** — cut per Persona Council (backlog for post-v1 with LLM + user validation)
- **LLM confidence scores displayed to user** — show item with source, or don't show it
- **Interactive confirmation prompts** during extraction — auto-extract, no gates
- **Sentiment analysis** beyond stance direction (supports/opposes/concerned/neutral)
- **Real-time extraction** — only during explicit refresh or process-meetings
- **On-disk LLM cache** — rely on stale-awareness + in-memory cache

---

## 2. Architecture

### Module Decomposition

```
packages/core/src/services/
  entity.ts              — EntityService class (resolution, people CRUD, intelligence) — EXISTING, slimmed
  person-memory.ts       — NEW: extracted signal collection, aggregation, rendering, upsert
  person-signals.ts      — NEW: stance extraction (LLM), action item extraction (regex)
  person-health.ts       — NEW: relationship health computation
```

### LLM Integration Pattern

Stance extraction uses the `extractInsights()` DI pattern from `conversations/extract.ts`:
- `LLMCallFn = (prompt: string) => Promise<string>` — injected at call time, not at construction
- `extractStancesForPerson(content, personName, callLLM)` — standalone function
- `refreshPersonMemory()` receives optional `callLLM` via `RefreshPersonMemoryOptions`
- Without `callLLM`, stances are skipped (graceful degradation)

### Stance Extraction JSON Schema

```json
{
  "stances": [
    {
      "topic": "string — what the stance is about (2-8 words)",
      "direction": "supports | opposes | concerned | neutral",
      "summary": "string — one sentence capturing the stance",
      "evidence_quote": "string — direct quote or close paraphrase from transcript"
    }
  ]
}
```

**Prompt rules:**
- Extract stances only for the named person — ignore other speakers
- A stance requires a clear position, opinion, or preference — NOT a question or neutral statement
- If uncertain whether something is a stance, **omit it** — precision over recall
- Evidence quote must come from the actual transcript text
- Omit `stances` key entirely if no clear stances found
- Return ONLY valid JSON, no markdown, no code fences

### Action Item Direction Classification

- Read `context/profile.md` frontmatter `name` field → this is "I"
- Owner name in actor position → "I owe them"
- Person name in actor position → "they owe me"
- Fallback when no profile.md: first-person language heuristics ("I'll", "I need to" → "I owe them")

### Caching Strategy

- **Cross-invocation**: existing `ifStaleDays` on `refreshPersonMemory()` prevents re-processing unchanged content
- **Within-invocation**: in-memory `Map<string, PersonStance[]>` keyed by `${meetingPath}:${personName}` prevents duplicate LLM calls

---

## 3. Tasks

### Task 1: Extract person-memory module from entity.ts

Move signal collection, aggregation, rendering, and upsert functions into `packages/core/src/services/person-memory.ts`. Zero behavior change, pure refactor.

**Functions to extract:** `collectSignalsForPerson()`, `aggregateSignals()`, `renderPersonMemorySection()`, `upsertPersonMemorySection()`, `extractPersonMemorySection()`, `getPersonMemoryLastRefreshed()`, `isMemoryStale()`, `normalizeSignalTopic()`, types `PersonMemorySignal`, `AggregatedPersonSignal`, `RefreshPersonMemoryInternalOptions`, constants `AUTO_PERSON_MEMORY_START/END`.

**Key files to read before starting:**
- `packages/core/src/services/entity.ts` — the source (lines ~460-700 for person-memory functions)
- `packages/core/src/services/LEARNINGS.md` — service layer invariants
- `packages/core/test/services/person-memory.test.ts` — existing integration tests (602 lines)

**Acceptance Criteria:**
- `entity.ts` drops to ~1,200 lines
- `person-memory.ts` exists with all extracted functions exported
- Direct unit tests for `collectSignalsForPerson()`, `aggregateSignals()`, `upsertPersonMemorySection()` added to `packages/core/test/services/person-memory-unit.test.ts`
- All existing `person-memory.test.ts` integration tests pass unchanged
- `npm run typecheck && npm test` pass

### Task 2: Build LLM stance extraction module

Create `packages/core/src/services/person-signals.ts`. Export `buildStancePrompt(content, personName)`, `parseStanceResponse(response)`, `extractStancesForPerson(content, personName, callLLM)` following `extractInsights()` pattern from `packages/core/src/integrations/conversations/extract.ts`.

**Key files to read before starting:**
- `packages/core/src/integrations/conversations/extract.ts` — the LLM extraction pattern to follow
- `packages/core/test/integrations/conversations/extract.test.ts` — test patterns (prompt/parse/integration separation)
- `packages/core/src/services/person-memory.ts` — the module this will integrate with (from Task 1)

**Types to define:**
```typescript
type StanceDirection = 'supports' | 'opposes' | 'concerned' | 'neutral';

type PersonStance = {
  topic: string;
  direction: StanceDirection;
  summary: string;
  evidenceQuote: string;
  source: string;  // meeting filename
  date: string;    // meeting date
};
```

**Acceptance Criteria:**
- `buildStancePrompt()` tested independently — prompt includes person name, JSON schema, "if uncertain, omit" instruction
- `parseStanceResponse()` tested independently — handles valid JSON, malformed JSON, missing fields, empty stances array, code-fenced responses
- Integration test with mock `LLMCallFn` returning known stances — structured output matches `PersonStance` type
- Mock LLM returning empty/uncertain — graceful empty result (not error)
- `PersonStance` and `StanceDirection` types exported from module
- `npm run typecheck && npm test` pass

### Task 3: Build action item extraction with lifecycle

Add `extractActionItemsForPerson(content, personName, ownerName?)` and action item lifecycle functions to `packages/core/src/services/person-signals.ts`.

**Key files to read before starting:**
- `packages/core/src/services/person-memory.ts` — `collectSignalsForPerson()` for regex extraction pattern
- `packages/core/src/services/entity.ts` — lines ~1530-1555 for how `context/profile.md` is already read (parseFrontmatter pattern)

**Types to define:**
```typescript
type ActionItemDirection = 'i_owe_them' | 'they_owe_me';

type PersonActionItem = {
  text: string;
  direction: ActionItemDirection;
  source: string;    // meeting filename
  date: string;      // meeting date
  hash: string;      // content-normalized dedup hash
  stale: boolean;    // true if older than 30 days
};
```

**Extraction patterns:**
- `[Person] will [verb]...`, `[Person] agreed to...`, `[Person] is going to...` → "they owe me"
- `I'll [verb] [person]...`, `I need to send [person]...`, `I agreed to...` (near person mention) → "I owe them"
- `Action item:`, `TODO:`, `- [ ]` near person name → classify by actor
- Owner name (from profile.md) in actor position → "I owe them"

**Lifecycle rules:**
- `isActionItemStale(item)`: true if source date > 30 days ago
- `capActionItems(items, maxPerDirection)`: keep most recent N per direction
- `deduplicateActionItems(existing, new)`: skip items with matching hash
- Content-normalized hash: `hash(lowercase(trimWhitespace(text)) + personSlug + direction)`

**Acceptance Criteria:**
- Extracts action items tied to specific people with correct direction
- Direction correct with profile.md owner name; falls back to first-person heuristics when no owner name
- `isActionItemStale()` returns true for items > 30 days old
- `capActionItems()` keeps at most 10 per direction (most recent)
- `deduplicateActionItems()` prevents re-adding items with same hash
- Re-extraction of same meeting doesn't duplicate or resurrect stale items
- Tests cover: happy path, aging, capping, dedup, no-owner-fallback, edge cases (ambiguous actor)
- `npm run typecheck && npm test` pass

### Task 4: Integrate extraction into refreshPersonMemory()

Update `EntityService.refreshPersonMemory()` to call stance and action item extraction from `person-signals.ts`. Add `callLLM?: LLMCallFn` to `RefreshPersonMemoryOptions`.

**Key files to read before starting:**
- `packages/core/src/services/entity.ts` — `refreshPersonMemory()` method (lines ~1133-1330)
- `packages/core/src/services/person-signals.ts` — extraction functions (from Tasks 2-3)
- `packages/core/src/services/person-memory.ts` — signal collection pipeline (from Task 1)
- `packages/core/src/services/LEARNINGS.md` — function-scoped Map cache pattern, SearchProvider invariants

**Integration flow within `refreshPersonMemory()`:**
1. Existing: collect regex signals (asks, concerns) per person per meeting
2. NEW: if `options.callLLM` provided, call `extractStancesForPerson()` per person per meeting (with in-memory cache)
3. NEW: call `extractActionItemsForPerson()` per person per meeting (regex, always runs)
4. NEW: read owner name from `context/profile.md` frontmatter `name` field (read once, reuse)
5. Existing: aggregate signals
6. NEW: aggregate stances (dedup by normalized topic), apply action item lifecycle (stale, cap, dedup)
7. Pass all data to render function

**Acceptance Criteria:**
- `refreshPersonMemory()` with `callLLM` in options produces stances alongside existing asks/concerns
- Without `callLLM`, existing behavior is identical — all current `person-memory.test.ts` tests pass unchanged
- `RefreshPersonMemoryOptions` type has `callLLM?: LLMCallFn` field
- `RefreshPersonMemoryResult` updated with `stancesExtracted: number`, `actionItemsExtracted: number`, `itemsAgedOut: number`
- In-memory `Map` cache prevents duplicate LLM calls for same meeting+person within single refresh
- Owner name read from profile.md once per refresh call, not per meeting
- No new external dependencies added
- `npm run typecheck && npm test` pass

### Task 5: Render enriched auto-memory sections

Extend `renderPersonMemorySection()` in `person-memory.ts` to include `### Stances`, `### Open Items (I owe them)`, `### Open Items (They owe me)`, `### Relationship Health` subsections inside the existing `AUTO_PERSON_MEMORY:START/END` block.

**Key files to read before starting:**
- `packages/core/src/services/person-memory.ts` — `renderPersonMemorySection()` (from Task 1 extraction)
- Existing render format for asks/concerns (pattern to follow)

**Render format:**
```markdown
<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

> Auto-generated from meeting notes/transcripts. Do not edit manually.

Last refreshed: 2026-03-01

### Repeated asks
- **topic** — mentioned N times (last: YYYY-MM-DD; sources: meeting1, meeting2)

### Repeated concerns
- **topic** — mentioned N times (last: YYYY-MM-DD; sources: meeting1, meeting2)

### Stances
- **topic** — direction: summary (from: Meeting Title, YYYY-MM-DD)

### Open Items (I owe them)
- item text (from: Meeting Title, YYYY-MM-DD)

### Open Items (They owe me)
- item text (from: Meeting Title, YYYY-MM-DD)

### Relationship Health
- Last met: YYYY-MM-DD (N days ago)
- Meetings: X in last 30d, Y in last 90d
- Open loops: Z
- Status: Active | Regular | Cooling | Dormant
<!-- AUTO_PERSON_MEMORY:END -->
```

**Acceptance Criteria:**
- Single auto-memory block contains all subsections
- Source citations `(from: [Meeting Title], [Date])` on every stance and action item
- Existing asks/concerns rendering unchanged (exact same format)
- Empty sections render as "- None detected yet." (consistent with existing pattern)
- Round-trip test: render → upsert → extract content → verify preserved
- `renderPersonMemorySection()` signature updated to accept stances, action items, and health data
- `npm run typecheck && npm test` pass

### Task 6: Compute relationship health metrics

Create `packages/core/src/services/person-health.ts`. Export `computeRelationshipHealth()`. Pure computation, no I/O.

**Key files to read before starting:**
- `packages/core/src/services/person-memory.ts` — to understand where health will be called from

**Types to define:**
```typescript
type HealthIndicator = 'active' | 'regular' | 'cooling' | 'dormant';

type RelationshipHealth = {
  lastMet: string | null;      // YYYY-MM-DD or null if never
  daysSinceLastMet: number | null;
  meetingsLast30Days: number;
  meetingsLast90Days: number;
  openLoopCount: number;
  indicator: HealthIndicator;
};
```

**Indicator thresholds:**
- Active: last meeting within 14 days
- Regular: last meeting within 30 days
- Cooling: last meeting within 60 days
- Dormant: last meeting > 60 days ago (or never met)

**Acceptance Criteria:**
- `computeRelationshipHealth(meetingDates: string[], openItemCount: number)` returns correct `RelationshipHealth`
- Edge cases tested: empty array (never met → dormant), single meeting, daily meetings, boundary dates (exactly 14/30/60 days)
- `daysSinceLastMet` computed correctly relative to current date
- `openLoopCount` matches provided count
- `npm run typecheck && npm test` pass

### Task 7: Update `arete people show` CLI + `--dry-run`

Update the CLI to display enriched person profiles and add dry-run preview to memory refresh.

**Key files to read before starting:**
- `packages/cli/src/commands/people.ts` — existing show and memory refresh commands
- `packages/cli/test/commands/people.test.ts` — existing CLI tests

**Changes:**
1. `arete people show <slug> --memory` — display stances, open items, relationship health from auto-memory section (parsed from rendered markdown)
2. `arete people memory refresh --dry-run` — show extraction preview without writing files
3. `arete people memory refresh` — update summary output to include new extraction counts ("Extracted 3 stances, 2 action items. Aged out 1 item.")
4. `--json` output — add new fields alongside existing ones (non-breaking)

**Acceptance Criteria:**
- `arete people show sarah --memory` displays all enriched sections (stances, items, health)
- `--dry-run` flag on refresh shows what would be extracted, writes nothing to disk
- `--json` output includes `stancesExtracted`, `actionItemsExtracted`, `itemsAgedOut` fields alongside existing fields
- Existing `--json` fields unchanged (backward compatible)
- CLI tests added for dry-run flag and enriched display
- `npm run typecheck && npm test` pass

### Task 8: Update meeting-prep, process-meetings skills + PATTERNS.md

Edit skill markdown files to consume new person intelligence in prep briefs and auto-trigger refresh during meeting processing.

**Key files to read before starting:**
- `packages/runtime/skills/meeting-prep/SKILL.md` — current meeting prep brief format
- `packages/runtime/skills/process-meetings/SKILL.md` — current processing workflow
- `packages/runtime/skills/PATTERNS.md` — get_meeting_context pattern

**Changes to meeting-prep/SKILL.md:**
- Update brief template to include `### Stances`, `### Open Items`, `### Relationship Health` sections
- Add talking points generation: "Follow up on [open item]", "Be aware: [person] [stance]"

**Changes to PATTERNS.md:**
- Add step to `get_meeting_context`: "Read person auto-memory sections (stances, open items, health) via `arete people show <slug> --memory`"

**Changes to process-meetings/SKILL.md:**
- Add Step 5.5: After saving person files and writing attendee_ids, refresh person memory
- Document ordering dependency: (1) create/update person files → (2) write attendee_ids → (3) refresh person memory
- Add post-processing summary line: "Sarah: 2 stances, 1 action item"

**Acceptance Criteria:**
- meeting-prep SKILL.md brief template includes stances, open items, health sections with clear format
- PATTERNS.md get_meeting_context references enriched auto-memory sections
- process-meetings SKILL.md includes memory refresh step with explicit ordering
- Post-processing summary format documented
- Multi-IDE check: `rg "\.cursor.*or.*\.claude|\.claude.*or.*\.cursor" packages/runtime/skills/meeting-prep/ packages/runtime/skills/process-meetings/` returns nothing
- No TypeScript code changes in this task (markdown only)

### Task 9: Quality gates + documentation

Run full test suite, update documentation, verify no regressions.

**Key files to read/update:**
- `packages/core/src/services/LEARNINGS.md` — add new patterns
- `dev/catalog/capabilities.json` — verify entries
- `.agents/sources/` — check if AGENTS.md needs rebuilding

**Acceptance Criteria:**
- `npm run typecheck && npm test` pass with zero failures
- `packages/core/src/services/LEARNINGS.md` updated with:
  - LLM extraction via `RefreshPersonMemoryOptions.callLLM` pattern
  - In-memory caching strategy for LLM calls within refresh
  - Action item lifecycle design (30-day stale, 10-item cap, content-hash dedup)
  - Person-memory module extraction as a clean refactor seam
- `dev/catalog/capabilities.json` entries verified current for people service and meeting-prep skill
- AGENTS.md sources updated if CLI surface changed (new `--dry-run` flag)
- No leftover `console.log`, commented-out code, or temp files
- All new modules have proper JSDoc on exported functions

---

## 4. Dependencies Between Tasks

```
Task 1 → Task 2 (needs person-memory module extracted first)
Task 1 → Task 3 (needs person-memory module extracted first)
Task 1 → Task 6 (needs person-memory module extracted first)
Task 2 + Task 3 → Task 4 (integration needs both extraction modules)
Task 4 → Task 5 (rendering needs integrated extraction pipeline)
Task 5 + Task 6 → Task 7 (CLI needs rendered sections + health)
Task 5 → Task 8 (skills reference rendered section format)
All → Task 9 (quality gates run last)
```

Parallelizable after Task 1: Tasks 2, 3, and 6 can run concurrently.

---

## 5. Testing Strategy

- **Task 1**: Pure refactor — existing integration tests are the safety net. Add unit tests for extracted functions.
- **Tasks 2-3**: Follow `extractInsights()` test pattern — separate prompt, parse, and integration test groups. All use mock `LLMCallFn`.
- **Task 4**: Integration tests verify new options flow through. Existing tests verify no regression.
- **Task 5**: Round-trip render/upsert tests. Snapshot-style content verification.
- **Task 6**: Pure function unit tests with edge cases.
- **Task 7**: CLI mock tests for display and dry-run.
- **Task 8**: No TypeScript tests (markdown changes). Multi-IDE grep check.
- **Task 9**: Full suite run. Documentation review.

Quality gates after every task: `npm run typecheck && npm test`.

---

## 6. Pre-Mortem Risks and Mitigations

See `dev/work/plans/people-intelligence/pre-mortem.md` for full 10-risk analysis. Top risks:

| Risk | Severity | Mitigation |
|------|----------|------------|
| entity.ts God Object (1,746 lines) | High | Task 1 mandatory refactor first |
| LLM integration breaks service invariants | High | Separate module, not injected into EntityService |
| Workspace owner identity missing | High | Read from context/profile.md, fallback to heuristics |
| Action items grow unbounded | High | 30-day auto-stale + 10-item cap in Task 3 |
| LLM non-determinism | Medium | In-memory cache + stale-awareness + append-only |
| Stance extraction quality | Medium | Conservative prompt, source citations, precision > recall |

---

## 7. Success Criteria

"Prep for my meeting with Sarah" returns:
- ✅ Her role, context (already works)
- ✅ Recent meetings and memory highlights (already works)
- ✅ Her stances on relevant topics with source citations
- ✅ Open action items in both directions with source citations
- ✅ Relationship health indicator (active/regular/cooling/dormant)
- ✅ Suggested talking points from stances + open items
