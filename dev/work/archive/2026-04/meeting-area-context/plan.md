---
title: Meeting Area Context
slug: meeting-area-context
status: building
size: large
tags: []
created: 2026-04-01T17:21:13.609Z
updated: 2026-04-02T02:38:09.584Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 17
---

# Meeting Area Context Integration

## Problem

When meetings are processed, valuable area context (current state, recent decisions) is only injected if the meeting title matches a `recurring_meetings` pattern in an area file. This means:

1. **Ad-hoc meetings** get no area context even when clearly related to an area
2. **New recurring meetings** miss context until manually added to area frontmatter
3. **No way to manually associate** a meeting with an area before processing
4. **Lost intelligence** — the LLM extracts items without domain context that would improve relevance

By the time a user could associate a meeting with an area, processing has already happened without that context.

## Solution

Enable area association **before processing** through two paths:

### Agent Mode
When working conversationally (e.g., daily-winddown skill):
1. Pull recordings and save as synced
2. Read transcript/summary + workspace areas
3. Suggest area associations based on content matching
4. Ask user for confirmation/adjustment
5. Process with area context injected

### UI Mode
In the triage web app:
1. Sidebar shows suggested area (read-only display)
2. Process Meeting modal shows area selector with suggestion pre-filled
3. User confirms or changes area
4. Area saved to frontmatter before processing begins

## Success Criteria

- Meetings can be associated with areas before processing (either path)
- Area context (current state, recent decisions) is injected into extraction prompt
- Suggestions are reasonably accurate (based on transcript content vs area names/content)
- Existing title-based matching continues to work as fallback
- Area association is optional (can still process without)

## Out of Scope

- Retroactive area assignment (re-processing after area change)
- Multiple area associations per meeting
- Auto-processing based on area (user always confirms)
- LLM-based suggestion in V1 (pure string matching only)

---

## Pre-Mortem Mitigations (incorporated)

| Risk | Mitigation |
|------|------------|
| Over-engineered suggestion | String matching only in V1. No LLM/embeddings. Return `null` vs low-confidence guesses. |
| UI state confusion | Sidebar is read-only display. Area selection ONLY in Process modal. No separate save endpoint. |
| Skill orchestration breakage | Single checkpoint after sync, before processing. Batch confirmation for all meetings. |
| Save timing | Process endpoint: save area → then start extraction. Fail early if save fails. |
| Missing test coverage | Each step writes tests BEFORE implementation. Follow testDeps pattern. |
| Frontend pattern deviation | Extend existing files (meetings.ts, types.ts), don't create new ones. |
| Frontmatter schema | `area` is optional. Existing meetings work without modification. |

---

## Algorithm Specification: Area Suggestion

**Confidence constants** (export for testing):
```typescript
export const EXACT_TITLE_MATCH_CONFIDENCE = 1.0;
export const AREA_NAME_MATCH_CONFIDENCE = 0.8;
export const KEYWORD_OVERLAP_MAX_CONFIDENCE = 0.7;
export const MINIMUM_KEYWORD_OVERLAP = 2;
export const SUGGESTION_THRESHOLD = 0.5; // Below this, return null
```

**Keyword overlap algorithm**:
1. Tokenize: split on whitespace, lowercase, remove punctuation
2. Filter: remove words in STOP_WORDS set (common words: "the", "a", "meeting", "sync", "weekly", etc.)
3. Calculate: Jaccard similarity = |A ∩ B| / |A ∪ B|
4. Confidence: similarity × 0.7 (max 0.7)
5. Minimum: require |A ∩ B| >= 2 to return any confidence

**Matching priority** (first match wins):
1. Exact match: meeting title contains `recurring_meetings[].title` → confidence 1.0
2. Area name match: area name appears in title/summary → confidence 0.8
3. Keyword overlap: significant overlap with area `currentState` → confidence 0.5-0.7
4. No match: return `null`

---

Plan:

1. **Add `area` field to meeting frontmatter**
   - Update `MeetingForSave` interface in `packages/core/src/integrations/meetings.ts` to include `area?: string`
   - Update `ParsedMeetingFrontmatter` interface in `packages/core/src/services/meeting-context.ts` (internal type, ~line 80)
   - Update `saveMeeting()` to persist area field in YAML frontmatter
   - Update `buildMeetingContext()` in `meeting-context.ts` to check frontmatter `area` first, fall back to `getAreaForMeeting()` title matching
   - **Context for developer**:
     - File: `packages/core/src/services/meeting-context.ts`
     - Pattern: See how `agenda?: string` frontmatter field is handled
   - **Test spec (write first)**:
     - `meeting-context.test.ts`: Meeting with explicit `area` field uses that area's context
     - `meeting-context.test.ts`: Meeting without `area` falls back to title matching (existing behavior)
     - `meeting-context.test.ts`: Invalid `area` slug logs warning, falls back to title matching
     - `meeting-context.test.ts`: Meeting with frontmatter `area` AND title matching different area: frontmatter wins
     - `meeting-context.test.ts`: Meeting with `area: ""` (empty string): treated as no area
     - `meeting-context.test.ts`: Area file exists but has malformed YAML: warning logged, no error
     - `meetings.test.ts`: `saveMeeting()` persists area field in frontmatter
     - `meetings.test.ts`: `saveMeeting()` with area + existing frontmatter: area added without clobbering
     - `meetings.test.ts`: `saveMeeting()` with area field already present: overwrites old area
     - `meetings.test.ts`: `saveMeeting()` with `area: null` explicitly clears existing area field
   - **ACs**:
     - [ ] `MeetingForSave.area` is optional string
     - [ ] `ParsedMeetingFrontmatter` interface includes `area?: string`
     - [ ] Meeting files can have `area: slug` in YAML frontmatter
     - [ ] Valid area slug must match an existing area file (`areas/{slug}.md`)
     - [ ] Frontmatter `area` takes precedence over `getAreaForMeeting()` title matching
     - [ ] When area slug doesn't match existing area: log warning, `areaContext` is null, no error thrown
     - [ ] `buildMeetingContext()` returns `areaContext` when frontmatter `area` matches valid area
     - [ ] Existing meetings without `area` field continue to work (backward compatible)
     - [ ] All new tests pass before implementation is complete

2. **Create area suggestion function**
   - Add `suggestAreaForMeeting()` to `packages/core/src/services/area-parser.ts` (extends existing `AreaParserService`)
   - Input: `{ title: string; summary?: string; transcript?: string }` + list of `AreaContext`
   - Output: `{ areaSlug: string, confidence: number } | null`
   - Export confidence constants for testing
   - Implement matching heuristics per algorithm specification above
   - **Context for developer**:
     - File: `packages/core/src/services/area-parser.ts`
     - Existing: `getAreaForMeeting()` does title matching only
     - Note: Function receives pre-parsed content, not file path (avoids circular import with meeting-context)
   - **Test spec (write first)**:
     - `area-parser.test.ts`: Exact recurring meeting title match returns confidence 1.0
     - `area-parser.test.ts`: Meeting title CONTAINS recurring_meetings[].title vs exact: same confidence 1.0
     - `area-parser.test.ts`: Area name in meeting title returns confidence 0.8
     - `area-parser.test.ts`: Area name in summary returns confidence 0.8
     - `area-parser.test.ts`: Area name in title vs summary when both present: title wins (checked first)
     - `area-parser.test.ts`: Keyword overlap with currentState returns lower confidence (0.5-0.7)
     - `area-parser.test.ts`: Keyword overlap test with specific threshold: "3 words match = 0.6 confidence" (verify Jaccard formula)
     - `area-parser.test.ts`: Stop words filtered: "Weekly Sync Meeting" doesn't match area "Sync Team" on "sync" alone
     - `area-parser.test.ts`: No match returns null (not low-confidence guess)
     - `area-parser.test.ts`: Confidence below SUGGESTION_THRESHOLD returns null
     - `area-parser.test.ts`: Multiple matches returns highest confidence
     - `area-parser.test.ts`: Empty/missing content returns null gracefully
     - `area-parser.test.ts`: Meeting with title only (no summary, no transcript): still matches on title
     - `area-parser.test.ts`: Transcript truncation: only first 500 chars used (test with 1000 char transcript)
     - `area-parser.test.ts`: Summary null vs empty string: both handled
     - `area-parser.test.ts`: All matching is case-insensitive
     - `area-parser.test.ts`: Exported confidence constants match documented values
   - **ACs**:
     - [ ] Function exported from `area-parser.ts`
     - [ ] Confidence constants exported: EXACT_TITLE_MATCH_CONFIDENCE, AREA_NAME_MATCH_CONFIDENCE, etc.
     - [ ] Returns `null` rather than low-confidence guesses (< SUGGESTION_THRESHOLD)
     - [ ] Pure string matching (no LLM calls)
     - [ ] Keyword matching uses stop word filtering
     - [ ] All matching is case-insensitive
     - [ ] Handles missing/empty meeting content gracefully
     - [ ] Only uses first 500 chars of transcript (truncates longer)
     - [ ] All tests pass before implementation complete

3. **Backend: area suggestion endpoint + process integration**
   - Add `GET /api/meetings/:slug/suggest-area` endpoint in `packages/apps/backend/src/routes/meetings.ts`
     - Reads meeting file, calls `suggestAreaForMeeting()`, returns suggestion + areas list
     - Goes through workspace service layer (not direct AreaParserService call in route)
   - Update `POST /api/meetings/:slug/process` to accept optional `area` param in body
     - If `area` provided: validate, save to frontmatter BEFORE starting extraction
     - Use `withSlugLock()` for atomic area-save-then-process
     - If save fails: return 400, don't start processing
     - Pass area to `buildMeetingContext()` for context injection
   - Update meeting parsing to read `area` from frontmatter in GET responses
   - Update `GET /:slug` to include `area` and `suggestedArea` in response
   - **NO separate `POST /area` endpoint** (per pre-mortem: save atomically with process)
   - **Context for developer**:
     - File: `packages/apps/backend/src/routes/meetings.ts`
     - Pattern: See existing `POST /:slug/process` for fire-and-forget 202 pattern
     - Use `withSlugLock()` for atomic area-save-then-process
   - **Test spec (write first)**:
     - `meetings.test.ts`: GET suggest-area returns suggestion with confidence for matching meeting
     - `meetings.test.ts`: GET suggest-area returns null for non-matching meeting
     - `meetings.test.ts`: GET suggest-area returns areas list for dropdown (sorted alphabetically)
     - `meetings.test.ts`: GET suggest-area meeting file doesn't exist: returns 404
     - `meetings.test.ts`: GET suggest-area meeting exists but no areas in workspace: returns `{ suggestion: null, areas: [] }`
     - `meetings.test.ts`: GET suggest-area meeting with only title (no transcript/summary): suggestion based on title alone
     - `meetings.test.ts`: POST process with area saves to frontmatter before processing
     - `meetings.test.ts`: POST process with area, then verify area in GET response
     - `meetings.test.ts`: POST process with invalid area returns 400 with error listing valid areas
     - `meetings.test.ts`: POST process without area works (backward compatible)
     - `meetings.test.ts`: POST process with area already in frontmatter, new area provided: overwrites
     - `meetings.test.ts`: POST process area provided, processing fails: area is still saved (atomic save first)
     - `meetings.test.ts`: POST process concurrent requests with different areas: withSlugLock prevents race
     - `meetings.test.ts`: POST process area slug with leading/trailing whitespace: trimmed before validation
     - `meetings.test.ts`: GET meeting returns area field from frontmatter
     - `meetings.test.ts`: GET meeting includes suggestedArea in response (computed on request)
   - **ACs**:
     - [ ] `GET /suggest-area` returns `{ suggestion: { areaSlug, confidence } | null, areas: string[] }`
     - [ ] Areas list sorted alphabetically
     - [ ] `GET /suggest-area` handles missing meeting (404), missing areas (empty list), missing content (suggestion based on title)
     - [ ] `POST /process` accepts `{ area?: string }` in body
     - [ ] `POST /process` uses `withSlugLock()` for atomic operation
     - [ ] Area saved to frontmatter before `runProcessingSession()` starts
     - [ ] Invalid area returns 400 with error message including valid areas list
     - [ ] `GET /:slug` includes `area` and `suggestedArea` in response
     - [ ] All tests pass before implementation complete

4. **UI: MetadataPanel area display**
   - Update `Meeting` type in `packages/apps/web/src/api/types.ts` to include `area?: string` and `suggestedArea?: string`
   - Update `packages/apps/web/src/api/meetings.ts` to include area fields from response
   - Add "Area" field to `MetadataPanel.tsx` (below Attendees section)
   - Display logic:
     - Loading: show "Loading..." placeholder
     - If `area` set (confirmed): show "Area: {name}"
     - If `suggestedArea` but no `area`: show "Suggested: {name}" with muted badge
     - If neither: show "Area: None"
     - If suggestion fetch fails: show "Area: —" (graceful degradation)
   - Field is **read-only** in sidebar (selection happens in modal only)
   - Long area names truncated with tooltip
   - **Context for developer**:
     - File: `packages/apps/web/src/components/MetadataPanel.tsx`
     - Types: `packages/apps/web/src/api/types.ts`
   - **Test spec (write first)**:
     - `MetadataPanel.test.tsx`: Renders confirmed area without badge
     - `MetadataPanel.test.tsx`: Renders suggested area with "(suggested)" badge
     - `MetadataPanel.test.tsx`: Renders "None" when no area
     - `MetadataPanel.test.tsx`: Area field is not editable (no click handler)
     - `MetadataPanel.test.tsx`: Renders loading state while suggestion query pending
     - `MetadataPanel.test.tsx`: Renders gracefully when suggestion query errors (shows "—")
     - `MetadataPanel.test.tsx`: Confirmed area with long name: truncated with tooltip
     - `MetadataPanel.test.tsx`: Suggested area badge uses correct styling (muted/secondary variant)
   - **ACs**:
     - [ ] `Meeting` type includes `area?: string` and `suggestedArea?: string`
     - [ ] MetadataPanel shows area below Attendees
     - [ ] Visual distinction between confirmed and suggested (badge styling)
     - [ ] Sidebar area is read-only (no onClick, no edit capability)
     - [ ] Shows "Loading..." placeholder while fetching
     - [ ] If suggestion fetch fails, shows "Area: —" (doesn't block sidebar)
     - [ ] Long area names truncated with tooltip on hover
     - [ ] All tests pass before implementation complete

5. **UI: Process Meeting modal area selection**
   - Add area dropdown to Process Meeting dialog in `MeetingDetail.tsx`
   - Fetch areas list from `GET /suggest-area` endpoint (cached via TanStack Query)
   - Pre-fill dropdown with `suggestedArea` if available, otherwise "None"
   - Dropdown shows area names (human-readable), sends slugs
   - On "Process" click: include selected area in process request body
   - Selecting "None" after a suggestion was pre-filled sends `area: null` (explicit clear)
   - Add same dropdown to Reprocess dialog
   - Dropdown disabled during processing
   - **Context for developer**:
     - File: `packages/apps/web/src/pages/MeetingDetail.tsx`
     - Pattern: See `ReviewItems.tsx` for dropdown patterns with controlled state
     - Use TanStack Query for fetching areas list (cached, deduplicated)
   - **Test spec (write first)**:
     - `MeetingDetail.test.tsx`: Process modal shows area dropdown
     - `MeetingDetail.test.tsx`: Dropdown pre-filled with suggested area
     - `MeetingDetail.test.tsx`: Dropdown defaults to "None" when no suggestion
     - `MeetingDetail.test.tsx`: Selected area included in process mutation
     - `MeetingDetail.test.tsx`: Reprocess modal also has area dropdown
     - `MeetingDetail.test.tsx`: Dropdown shows loading spinner while areas fetching
     - `MeetingDetail.test.tsx`: Dropdown error state when areas fetch fails
     - `MeetingDetail.test.tsx`: Pre-filled suggestion can be changed to different area before processing
     - `MeetingDetail.test.tsx`: Pre-filled suggestion persists after modal close/reopen (no reset)
     - `MeetingDetail.test.tsx`: Dropdown disabled while mutation is in-flight
     - `MeetingDetail.test.tsx`: Process succeeds: area is in meeting when re-fetched
     - `MeetingDetail.test.tsx`: Reprocess with "None" when area was set: clears area
     - `MeetingDetail.test.tsx`: Dropdown navigable with keyboard (arrow keys, enter)
   - **ACs**:
     - [ ] Process modal includes area dropdown above "Process" button
     - [ ] Dropdown populated with all workspace areas + "None" option
     - [ ] Dropdown label shows area name, value is slug
     - [ ] Pre-fills with suggested area when available
     - [ ] Process mutation sends `{ area: selectedSlug }` (or `area: null` if "None")
     - [ ] Reprocess modal has identical area selection
     - [ ] Dropdown disabled while mutation is in-flight
     - [ ] Keyboard accessible (arrow keys, enter to select)
     - [ ] All tests pass before implementation complete

6. **Agent skill updates**
   - Update `packages/runtime/skills/daily-winddown/SKILL.md`:
     - Add checkpoint after sync, before processing: "Area Association"
     - Agent reads synced meetings, suggests areas for each
     - Presents batch table: Meeting Title | Date | Suggested Area | Confidence
     - User can: confirm all, adjust individual, skip all
   - Update `packages/runtime/skills/process-meetings/SKILL.md` similarly
   - Gracefully handle case where suggestions return null for all meetings
   - Allow user to provide custom area not suggested (free-form input)
   - **Test spec** (manual verification, skills are markdown):
     - [ ] Agent test: Run daily-winddown with 3 synced meetings, verify batch prompt format
     - [ ] Agent test: Skip area association, verify meetings still process
     - [ ] Agent test: Confirm suggested areas, verify areas appear in meeting frontmatter
     - [ ] Agent test: Adjust one suggestion to different area, verify that area used
     - [ ] Agent test: All suggestions are null, verify graceful handling (no empty table)
   - **ACs**:
     - [ ] daily-winddown has "Area Association" checkpoint in Phase 1
     - [ ] process-meetings has similar checkpoint
     - [ ] Agent presents suggestions in table format (Title | Date | Suggested Area | Confidence)
     - [ ] Single batch prompt (not N prompts for N meetings)
     - [ ] User can skip area association entirely
     - [ ] User can provide custom area not in suggestions
     - [ ] Gracefully handles case where all suggestions are null

7. **Housekeeping: Update capabilities.json**
   - Update `meeting-extraction` capability to note area field support
   - Verify `readBeforeChange` paths are accurate
   - Add area-parser.ts to readBeforeChange if not present
   - **ACs**:
     - [ ] `dev/catalog/capabilities.json` updated
     - [ ] `meeting-extraction` notes mention area field and suggestion feature
     - [ ] `readBeforeChange` includes relevant files
     - [ ] All quality gates pass (`npm run typecheck && npm test`)

8. **E2E verification (manual test checklist)**
   - Full flow verification before merge
   - **Test checklist**:
     - [ ] Sync a meeting via Krisp/Fathom
     - [ ] Open meeting in UI → see suggested area in sidebar
     - [ ] Open Process modal → see area dropdown pre-filled
     - [ ] Change area selection → process meeting
     - [ ] Verify area in frontmatter (`resources/meetings/{slug}.md`)
     - [ ] Verify area context was injected (check extraction results for area-specific items)
     - [ ] Reprocess with different area → verify frontmatter updated
     - [ ] Reprocess with "None" → verify area cleared
     - [ ] Agent mode: Run daily-winddown → verify area confirmation step
   - **ACs**:
     - [ ] All manual test checklist items pass
     - [ ] No regressions in existing meeting processing flow

---

## Size Estimate

**Large** (8 steps)

## Test-First Approach

Each step follows **test-first development**:
1. Write test spec (failing tests that define expected behavior)
2. Implement minimum code to pass tests
3. Refactor if needed
4. Verify all tests pass before moving to next step

Existing test patterns to follow:
- `packages/core/test/services/meeting-context.test.ts` — meeting context tests
- `packages/core/test/services/area-parser.test.ts` — area parsing tests (create if needed)
- `packages/apps/backend/test/routes/meetings.test.ts` — backend route tests
- `packages/apps/web/src/**/*.test.tsx` — React component tests

## Dependencies

```
Step 1 (frontmatter) 
    ↓
Step 2 (suggestion service) ← depends on Step 1 for area lookup
    ↓
Step 3 (backend) ← depends on Steps 1-2
    ↓
Step 4 (UI display) ← depends on Step 3 for API
    ↓
Step 5 (UI modal) ← depends on Steps 3-4
    ↓
Step 6 (skills) ← depends on Steps 1-3 (can parallel with 4-5)
    ↓
Step 7 (housekeeping) ← after all steps
    ↓
Step 8 (E2E verification) ← after all steps
```

## Risks (from pre-mortem)

See `dev/work/plans/meeting-area-context/pre-mortem.md` for full analysis.

**Highest priority mitigations**:
1. Keep suggestion algorithm simple (string matching only, Jaccard similarity)
2. Area confirmation in Process modal only (no sidebar editing)
3. Single checkpoint in skills (batch confirmation)
4. Write tests before implementation
5. Use `withSlugLock()` for atomic backend operations