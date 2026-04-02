# PRD: Meeting Area Context Integration

## Goal

Enable meeting-to-area association **before processing** so area context (current state, recent decisions) can be injected into the extraction prompt. Support both agent mode (batch confirmation) and UI mode (sidebar display + modal selection).

## Background

Currently, area context is only injected when a meeting title matches a `recurring_meetings` pattern. Ad-hoc meetings and new recurring meetings get no area context, resulting in less contextualized extraction results.

## Memory Context (from Phase 2.1)

1. **Use Jaccard similarity for keyword overlap** — Reusable pattern from meeting-extraction.ts
2. **Pre-mortem risk references in ACs** — Include "⚠️ Pre-Mortem Warning (R#)" directly
3. **TDD for core service changes** — Write tests before modifying services
4. **Phase gating** — Complete core (1-2) before backend/UI (3-5) before skills (6)
5. **Services must use StorageAdapter** — Never import fs directly

---

## Tasks

### Task 1: Add `area` field to meeting frontmatter

Add support for explicit `area` field in meeting YAML frontmatter. Update `buildMeetingContext()` to check frontmatter `area` first, falling back to title matching.

**Files to modify:**
- `packages/core/src/integrations/meetings.ts` — `MeetingForSave` interface
- `packages/core/src/services/meeting-context.ts` — `ParsedMeetingFrontmatter`, `buildMeetingContext()`

**Pattern to follow:** See how `agenda?: string` frontmatter field is handled in meeting-context.ts

**Test spec (write first):**
- Meeting with explicit `area` field uses that area's context
- Meeting without `area` falls back to title matching
- Invalid `area` slug logs warning, falls back to title matching
- Meeting with frontmatter `area` AND title matching different area: frontmatter wins
- Meeting with `area: ""` (empty string): treated as no area
- `saveMeeting()` persists area field in frontmatter
- `saveMeeting()` with area + existing frontmatter: area added without clobbering

**Acceptance Criteria:**
- [ ] `MeetingForSave.area` is optional string
- [ ] `ParsedMeetingFrontmatter` interface includes `area?: string`
- [ ] Meeting files can have `area: slug` in YAML frontmatter
- [ ] Valid area slug must match an existing area file (`areas/{slug}.md`)
- [ ] Frontmatter `area` takes precedence over `getAreaForMeeting()` title matching — ⚠️ Pre-Mortem Warning (R2: UI state confusion)
- [ ] When area slug doesn't match existing area: log warning, `areaContext` is null, no error thrown
- [ ] `buildMeetingContext()` returns `areaContext` when frontmatter `area` matches valid area
- [ ] Existing meetings without `area` field continue to work (backward compatible)
- [ ] All new tests pass before implementation is complete
- [ ] `npm run typecheck && npm test` passes

---

### Task 2: Create area suggestion function

Add `suggestAreaForMeeting()` to `AreaParserService` for content-based area matching.

**Files to modify:**
- `packages/core/src/services/area-parser.ts` — Add function and confidence constants

**Algorithm specification:**
```typescript
// Confidence constants (export for testing)
export const EXACT_TITLE_MATCH_CONFIDENCE = 1.0;
export const AREA_NAME_MATCH_CONFIDENCE = 0.8;
export const KEYWORD_OVERLAP_MAX_CONFIDENCE = 0.7;
export const MINIMUM_KEYWORD_OVERLAP = 2;
export const SUGGESTION_THRESHOLD = 0.5;
```

**Keyword overlap algorithm:**
1. Tokenize: split on whitespace, lowercase, remove punctuation
2. Filter: remove words in STOP_WORDS set
3. Calculate: Jaccard similarity = |A ∩ B| / |A ∪ B|
4. Confidence: similarity × 0.7 (max 0.7)
5. Minimum: require |A ∩ B| >= 2 to return any confidence

**Test spec (write first):**
- Exact recurring meeting title match returns confidence 1.0
- Area name in meeting title returns confidence 0.8
- Area name in summary returns confidence 0.8
- Keyword overlap with currentState returns lower confidence (0.5-0.7)
- Stop words filtered: "Weekly Sync Meeting" doesn't match on "sync" alone
- No match returns null (not low-confidence guess)
- Confidence below SUGGESTION_THRESHOLD returns null
- Multiple matches returns highest confidence
- Empty/missing content returns null gracefully
- Transcript truncation: only first 500 chars used
- All matching is case-insensitive
- Exported confidence constants match documented values

**Acceptance Criteria:**
- [ ] Function exported from `area-parser.ts`
- [ ] Confidence constants exported: EXACT_TITLE_MATCH_CONFIDENCE, etc.
- [ ] Returns `null` rather than low-confidence guesses (< SUGGESTION_THRESHOLD) — ⚠️ Pre-Mortem Warning (R1: Over-engineered suggestion)
- [ ] Pure string matching (no LLM calls)
- [ ] Keyword matching uses stop word filtering
- [ ] All matching is case-insensitive
- [ ] Handles missing/empty meeting content gracefully
- [ ] Only uses first 500 chars of transcript (truncates longer)
- [ ] All tests pass before implementation is complete
- [ ] `npm run typecheck && npm test` passes

---

### Task 3: Backend area suggestion endpoint

Add `GET /api/meetings/:slug/suggest-area` endpoint and update process endpoint to accept area param.

**Files to modify:**
- `packages/apps/backend/src/routes/meetings.ts`

**Pattern to follow:** See existing `POST /:slug/process` for fire-and-forget 202 pattern. Use `withSlugLock()` for atomic operations.

**Test spec (write first):**
- GET suggest-area returns suggestion with confidence for matching meeting
- GET suggest-area returns null for non-matching meeting
- GET suggest-area returns areas list for dropdown (sorted alphabetically)
- GET suggest-area meeting file doesn't exist: returns 404
- GET suggest-area meeting exists but no areas: returns `{ suggestion: null, areas: [] }`
- POST process with area saves to frontmatter before processing
- POST process with invalid area returns 400 with valid areas list
- POST process without area works (backward compatible)
- POST process concurrent requests: withSlugLock prevents race
- GET meeting returns area field from frontmatter
- GET meeting includes suggestedArea in response

**Acceptance Criteria:**
- [ ] `GET /suggest-area` returns `{ suggestion: { areaSlug, confidence } | null, areas: string[] }`
- [ ] Areas list sorted alphabetically
- [ ] `GET /suggest-area` handles missing meeting (404), missing areas (empty list)
- [ ] `POST /process` accepts `{ area?: string }` in body
- [ ] `POST /process` uses `withSlugLock()` for atomic operation — ⚠️ Pre-Mortem Warning (R4: Save timing)
- [ ] Area saved to frontmatter before `runProcessingSession()` starts
- [ ] Invalid area returns 400 with error message including valid areas list
- [ ] `GET /:slug` includes `area` and `suggestedArea` in response
- [ ] NO separate `POST /area` endpoint (per pre-mortem: save atomically with process)
- [ ] All tests pass before implementation is complete
- [ ] `npm run typecheck && npm test` passes

---

### Task 4: UI MetadataPanel area display

Add area field to meeting sidebar showing confirmed or suggested area.

**Files to modify:**
- `packages/apps/web/src/api/types.ts` — Add `area?: string` and `suggestedArea?: string` to Meeting type
- `packages/apps/web/src/api/meetings.ts` — Include area fields from response
- `packages/apps/web/src/components/MetadataPanel.tsx` — Add Area field

**Display logic:**
- Loading: show "Loading..." placeholder
- If `area` set (confirmed): show "Area: {name}"
- If `suggestedArea` but no `area`: show "Suggested: {name}" with muted badge
- If neither: show "Area: None"
- If fetch fails: show "Area: —"

**Test spec (write first):**
- Renders confirmed area without badge
- Renders suggested area with "(suggested)" badge
- Renders "None" when no area
- Area field is not editable (no click handler) — ⚠️ Pre-Mortem Warning (R2: UI state confusion)
- Renders loading state while suggestion query pending
- Renders gracefully when suggestion query errors
- Long area names truncated with tooltip

**Acceptance Criteria:**
- [ ] `Meeting` type includes `area?: string` and `suggestedArea?: string`
- [ ] MetadataPanel shows area below Attendees
- [ ] Visual distinction between confirmed and suggested (badge styling)
- [ ] Sidebar area is read-only (no onClick, no edit capability)
- [ ] Shows "Loading..." placeholder while fetching
- [ ] If suggestion fetch fails, shows "Area: —"
- [ ] Long area names truncated with tooltip on hover
- [ ] All tests pass before implementation is complete

---

### Task 5: UI Process Meeting modal area selection

Add area dropdown to Process Meeting modal with pre-filled suggestion.

**Files to modify:**
- `packages/apps/web/src/pages/MeetingDetail.tsx`

**Pattern to follow:** See `ReviewItems.tsx` for dropdown patterns. Use TanStack Query for areas list.

**Test spec (write first):**
- Process modal shows area dropdown
- Dropdown pre-filled with suggested area
- Dropdown defaults to "None" when no suggestion
- Selected area included in process mutation
- Reprocess modal also has area dropdown
- Dropdown shows loading spinner while areas fetching
- Dropdown disabled while mutation is in-flight
- Process succeeds: area is in meeting when re-fetched
- Dropdown navigable with keyboard

**Acceptance Criteria:**
- [ ] Process modal includes area dropdown above "Process" button
- [ ] Dropdown populated with all workspace areas + "None" option
- [ ] Dropdown label shows area name, value is slug
- [ ] Pre-fills with suggested area when available
- [ ] Process mutation sends `{ area: selectedSlug }` (or `area: null` if "None")
- [ ] Reprocess modal has identical area selection
- [ ] Dropdown disabled while mutation is in-flight
- [ ] Keyboard accessible (arrow keys, enter to select)
- [ ] All tests pass before implementation is complete

---

### Task 6: Agent skill updates

Update daily-winddown and process-meetings skills with area confirmation checkpoint.

**Files to modify:**
- `packages/runtime/skills/daily-winddown/SKILL.md`
- `packages/runtime/skills/process-meetings/SKILL.md`

**Checkpoint format:**
```markdown
| Meeting Title | Date | Suggested Area | Confidence |
|--------------|------|----------------|------------|
| Weekly Sync  | 2026-04-01 | team-meetings | 1.0 |
| Acme Intro   | 2026-04-01 | — | — |

Confirm, adjust, or skip?
```

**Acceptance Criteria:**
- [ ] daily-winddown has "Area Association" checkpoint in Phase 1
- [ ] process-meetings has similar checkpoint
- [ ] Agent presents suggestions in table format (Title | Date | Suggested Area | Confidence)
- [ ] Single batch prompt (not N prompts for N meetings) — ⚠️ Pre-Mortem Warning (R3: Skill orchestration breakage)
- [ ] User can skip area association entirely
- [ ] User can provide custom area not in suggestions
- [ ] Gracefully handles case where all suggestions are null

---

### Task 7: Update capabilities.json

Update capability catalog with area field documentation.

**Files to modify:**
- `dev/catalog/capabilities.json`

**Acceptance Criteria:**
- [ ] `meeting-extraction` capability notes mention area field and suggestion feature
- [ ] `readBeforeChange` includes `packages/core/src/services/area-parser.ts`
- [ ] All quality gates pass (`npm run typecheck && npm test`)

---

### Task 8: E2E verification

Manual verification of full flow before merge.

**Test checklist:**
- [ ] Sync a meeting via Krisp/Fathom
- [ ] Open meeting in UI → see suggested area in sidebar
- [ ] Open Process modal → see area dropdown pre-filled
- [ ] Change area selection → process meeting
- [ ] Verify area in frontmatter (`resources/meetings/{slug}.md`)
- [ ] Verify area context was injected (check extraction for area-specific items)
- [ ] Reprocess with different area → verify frontmatter updated
- [ ] Reprocess with "None" → verify area cleared
- [ ] Agent mode: Run daily-winddown → verify area confirmation step

**Acceptance Criteria:**
- [ ] All manual test checklist items pass
- [ ] No regressions in existing meeting processing flow

---

## Dependencies

```
Task 1 (frontmatter) 
    ↓
Task 2 (suggestion service) ← depends on Task 1
    ↓
Task 3 (backend) ← depends on Tasks 1-2
    ↓
Task 4 (UI display) ← depends on Task 3
    ↓
Task 5 (UI modal) ← depends on Tasks 3-4
    ↓
Task 6 (skills) ← depends on Tasks 1-3 (can parallel with 4-5)
    ↓
Task 7 (housekeeping) ← after all
    ↓
Task 8 (E2E) ← after all
```

## Pre-Mortem Risks

From `dev/work/plans/meeting-area-context/pre-mortem.md`:

| Risk | Mitigation | Reference |
|------|------------|-----------|
| R1: Over-engineered suggestion | String matching only, return null vs low-confidence | Task 2 |
| R2: UI state confusion | Sidebar read-only, modal only for selection | Tasks 4, 5 |
| R3: Skill orchestration breakage | Single batch checkpoint, not per-meeting | Task 6 |
| R4: Save timing | withSlugLock, save before processing | Task 3 |
| R5: Missing test coverage | Write tests BEFORE implementation | All tasks |
| R6: Frontend pattern deviation | Extend existing files | Tasks 4, 5 |
| R7: Frontmatter schema | area is optional, existing meetings work | Task 1 |

## Out of Scope

- Retroactive area assignment
- Multiple area associations per meeting
- Auto-processing based on area
- LLM-based suggestion in V1
