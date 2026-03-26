# PRD: Meeting Importance

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-26  
**Branch**: `feature/meeting-importance`  
**Depends on**: Google Calendar integration, meeting extraction infrastructure

---

## 1. Problem & Goals

### Problem

With 7-9 meetings/day, processing overhead is unsustainable:
- Observing-only meetings generate action items you don't care about
- Jira setup details get extracted as "decisions"
- 2-4 truly important meetings get the same treatment as background meetings

Current extraction treats all meetings equally, producing noise that requires manual review.

### Goals

1. **Auto-infer importance**: Determine meeting importance at calendar sync time based on signals (organizer, attendee count, recurring type)
2. **Light extraction mode**: Process low-importance meetings with minimal extraction (summary + 2 domain learnings only)
3. **Auto-approve light meetings**: Skip staging review for light meetings — show as approved in triage
4. **Speaking ratio upgrade**: At processing time, upgrade light → normal if user spoke 40%+ of the meeting
5. **Skipped status**: Allow manually marking meetings as skipped (no extraction needed)

### Out of Scope

- ical-buddy organizer detection (Google Calendar only for V1)
- Agenda importance recommendations (separate skill enhancement)
- Recurring series dedup improvements (follow-on work after series_id is tracked)
- Triage UI badge styling (backend first, UI follows)
- Configurable thresholds (start with hardcoded defaults)

---

## 2. Architecture Decisions

### Importance Tiers

| Tier | When | Extraction | Triage |
|------|------|------------|--------|
| `skip` | Manual only | None | Shows with "skipped" badge |
| `light` | Large audience, not organizer, low engagement | Summary + 2 domain learnings | Auto-approved |
| `normal` | Default | Full extraction | Pending review |
| `important` | Organizer, 1:1, high speaking ratio, has agenda | Full + quality focus | Pending review |

### Inference Rules

At calendar pull time:
```
if is_organizer → important
elif attendee_count == 2 (1:1) → important
elif attendee_count <= 3 → normal
elif attendee_count >= 5 and not is_organizer → light
else → normal

if has_linked_agenda → at least normal
```

At processing time (transcript available):
```
if speaking_ratio > 0.4 → upgrade light → normal
```

### CalendarEvent Extension

Add to `CalendarEvent` in `packages/core/src/integrations/calendar/types.ts`:
```typescript
organizer?: { name: string; email?: string; self?: boolean };
recurringEventId?: string;
```

### MeetingForSave Extension

Add to `MeetingForSave` in `packages/core/src/integrations/meetings.ts`:
```typescript
importance?: 'skip' | 'light' | 'normal' | 'important';
recurring_series_id?: string;
```

### Extraction Modes

`extractMeetingIntelligence()` accepts `mode: 'light' | 'normal' | 'thorough'`:
- **light**: Summary + 2 domain learnings, no action items, ~50% shorter prompt
- **normal**: Current behavior (7 AI, 5 DE, 5 LE limits)
- **thorough**: Expanded limits (10 AI, 7 DE, 7 LE), no confidence floor

### Reprocessing Behavior

When `arete meeting extract` is called on an already-processed file (`status: processed` or `status: approved`), use `thorough` mode. This allows users to reprocess light meetings for full extraction.

---

## 3. Pre-Mortem Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| R1 | CalendarEvent type change ripple effects | Make new fields optional; verify all consumers |
| R2 | Google API field availability | Optional chaining; default to 'normal' if missing |
| R3 | Light extraction over-filtering | Simple heuristics; always allow reprocessing |
| R4 | Speaking ratio accuracy | Return undefined if no speaker labels; keep inferred importance |
| R5 | Frontend/backend mismatch | V1 is backend only; ensure backward compatibility |
| R6 | Auto-approve race condition | Atomic write: all items approved + status in single write |
| R7 | Thorough mode test breaks | Add mode parameter with default 'normal'; keep constants separate |
| R8 | Importance not propagated | Write importance to frontmatter at sync; read at extract |

---

## 4. User Stories / Tasks

### Task 1: Extend CalendarEvent with organizer and recurrence data

**Description**: Add `organizer` and `recurringEventId` fields to CalendarEvent type. Update Google Calendar provider to map these from API response.

**Context — Read These Files First**:
- `packages/core/src/integrations/calendar/types.ts` — CalendarEvent interface
- `packages/core/src/integrations/calendar/google-calendar.ts` — GoogleEvent type, mapGoogleEvent()
- `packages/core/src/integrations/LEARNINGS.md` — Integration patterns

**Acceptance Criteria**:
1. `CalendarEvent` has optional `organizer?: { name: string; email?: string; self?: boolean }`
2. `CalendarEvent` has optional `recurringEventId?: string`
3. `GoogleEvent` type includes `organizer` from Google Calendar API schema
4. `mapGoogleEvent()` maps `organizer.email`, `organizer.displayName`, `organizer.self`
5. `mapGoogleEvent()` maps `recurringEventId` if present
6. Existing tests pass (`npm test -- packages/core/test/integrations/calendar`)
7. ⚠️ Pre-Mortem (R2): Use optional chaining for organizer fields

**Dependencies**: None

---

### Task 2: Add importance field and inference logic

**Description**: Add `importance` to MeetingForSave. Create `inferMeetingImportance()` function with rules based on organizer, attendee count, and agenda linking.

**Context — Read These Files First**:
- `packages/core/src/integrations/meetings.ts` — MeetingForSave, saveMeetingFile()
- `packages/core/src/integrations/calendar/types.ts` — CalendarEvent with new organizer field (from Task 1)
- `packages/core/src/integrations/LEARNINGS.md` — Staged items pattern

**Acceptance Criteria**:
1. `MeetingForSave` has optional `importance?: 'skip' | 'light' | 'normal' | 'important'`
2. `MeetingForSave` has optional `recurring_series_id?: string`
3. New function `inferMeetingImportance(event: CalendarEvent, options?: { hasAgenda?: boolean }): 'light' | 'normal' | 'important'`
4. Inference rules:
   - `organizer.self === true` → 'important'
   - `attendees.length === 2` → 'important'
   - `attendees.length <= 3` → 'normal'
   - `attendees.length >= 5 && !organizer.self` → 'light'
   - `hasAgenda === true` → at least 'normal'
5. `saveMeetingFile()` writes importance to frontmatter when provided
6. Tests for `inferMeetingImportance()` covering all rules
7. ⚠️ Pre-Mortem (R1): All new fields are optional for backward compatibility

**Dependencies**: Task 1 (CalendarEvent.organizer)

---

### Task 3: Create light extraction prompt and mode

**Description**: Add `buildLightExtractionPrompt()` for minimal extraction. Add `mode` parameter to `extractMeetingIntelligence()` with 'light', 'normal', and 'thorough' options.

**Context — Read These Files First**:
- `packages/core/src/services/meeting-extraction.ts` — buildMeetingExtractionPrompt(), extractMeetingIntelligence(), CATEGORY_LIMITS
- `memory/entries/2026-03-25_meeting-extraction-improvements-learnings.md` — Recent extraction changes

**Acceptance Criteria**:
1. New `ExtractionMode = 'light' | 'normal' | 'thorough'` type
2. `extractMeetingIntelligence()` accepts optional `mode?: ExtractionMode` (default: 'normal')
3. `buildLightExtractionPrompt()` creates a prompt that:
   - Extracts summary only
   - Extracts up to 2 learnings focused on "domain insights, strategic decisions, or user feedback"
   - Explicitly instructs: "Do NOT extract action items or operational decisions"
   - Is ~50% shorter than the normal prompt
4. `LIGHT_LIMITS = { actionItems: 0, decisions: 0, learnings: 2 }`
5. `THOROUGH_LIMITS = { actionItems: 10, decisions: 7, learnings: 7 }` with no confidence floor
6. `mode === 'light'` uses `buildLightExtractionPrompt()` and `LIGHT_LIMITS`
7. `mode === 'thorough'` uses normal prompt with `THOROUGH_LIMITS`
8. Tests for light mode extraction (mock LLM, verify shape)
9. ⚠️ Pre-Mortem (R7): Keep existing `CATEGORY_LIMITS` as `NORMAL_LIMITS`

**Dependencies**: None

---

### Task 4: Speaking ratio analysis and importance upgrade

**Description**: Create `calculateSpeakingRatio()` to analyze transcript speaker labels. At processing time, upgrade light → normal if user spoke 40%+ of the meeting.

**Context — Read These Files First**:
- `packages/core/src/services/meeting-processing.ts` — processMeetingExtraction(), existing processing logic
- Example transcript format from `/Users/john/code/arete-reserv/resources/meetings/2026-03-26-jira-dashboard.md`

**Acceptance Criteria**:
1. New function `calculateSpeakingRatio(transcript: string, ownerName: string): number | undefined`
2. Parses speaker labels in format `**Name | HH:MM**` or `**Name | MM:SS**`
3. Counts words per speaker (not just line count)
4. Returns ratio of owner's words to total words (0-1)
5. Returns `undefined` if no speaker labels found (graceful degradation)
6. Owner name matching is case-insensitive and handles partial matches (e.g., "John" matches "John Koht")
7. Tests for ratio calculation with various transcript formats
8. Tests for missing speaker labels returning undefined
9. ⚠️ Pre-Mortem (R4): Never crash on malformed transcripts

**Dependencies**: None

---

### Task 5: Auto-approve light meetings and add skipped status

**Description**: Update `processMeetingExtraction()` to check importance. Light meetings auto-approve all items. Add 'skipped' as valid status. Reprocessing uses thorough mode.

**Context — Read These Files First**:
- `packages/core/src/services/meeting-processing.ts` — processMeetingExtraction(), ItemStatus type
- `packages/core/src/integrations/staged-items.ts` — Status values
- `packages/cli/src/commands/meeting.ts` — extract command flow

**Acceptance Criteria**:
1. `ItemStatus` type includes 'skipped' (in addition to 'approved' | 'pending')
2. `processMeetingExtraction()` accepts optional `importance?: Importance` parameter
3. If `importance === 'light'`:
   - All items have status: 'approved' (auto-approve)
   - Log/return indicator that items were auto-approved
4. If `importance === 'skip'`:
   - Return immediately with empty result
   - Set `status: 'skipped'` on meeting
5. CLI `meeting extract`:
   - Reads importance from meeting frontmatter
   - `--importance <level>` flag overrides frontmatter
   - If file has `status: processed` or `status: approved`, use mode 'thorough' (reprocessing)
6. Integrate speaking ratio: if `importance === 'light'` and `calculateSpeakingRatio() > 0.4`, upgrade to 'normal'
7. Tests for auto-approve logic
8. Tests for reprocessing detection
9. ⚠️ Pre-Mortem (R6): Atomic write — all items + status in single file write

**Dependencies**: Tasks 2, 3, 4

---

### Task 6: Wire importance inference into calendar pull

**Description**: When pulling calendar events, infer importance for each meeting and include in saved meeting file.

**Context — Read These Files First**:
- `packages/cli/src/commands/pull.ts` — pullCalendar() function
- `packages/core/src/integrations/meetings.ts` — findMatchingAgenda(), saveMeetingFile()
- Task 2 implementation of inferMeetingImportance()

**Acceptance Criteria**:
1. `pullCalendar()` calls `inferMeetingImportance()` for each event
2. Importance is passed to meeting save/sync operation
3. Meeting frontmatter includes `importance: <level>` field after sync
4. If agenda is linked, `hasAgenda: true` is passed to inference
5. Integration test: pull calendar event → verify importance in frontmatter
6. ⚠️ Pre-Mortem (R8): Importance persists in frontmatter for later extraction

**Dependencies**: Tasks 1, 2

---

### Task 7: Update documentation and LEARNINGS.md

**Description**: Document the new importance system in relevant files.

**Context — Read These Files First**:
- `packages/core/src/integrations/LEARNINGS.md`
- `packages/core/src/services/LEARNINGS.md`
- `.pi/expertise/core/PROFILE.md`

**Acceptance Criteria**:
1. `packages/core/src/integrations/LEARNINGS.md` updated with importance inference pattern
2. `packages/core/src/services/LEARNINGS.md` updated with extraction modes
3. `.pi/expertise/core/PROFILE.md` Component Map updated with speaking ratio function
4. CLI command documentation updated for `--importance` flag
5. ⚠️ Memory insight: Include exact content for documentation (from 2026-03-25 learnings)

**Dependencies**: Tasks 1-6

---

## 5. Test Strategy

Each task includes explicit test requirements. Overall:
- Unit tests for `inferMeetingImportance()` (8+ cases covering all rules)
- Unit tests for `calculateSpeakingRatio()` (5+ cases including edge cases)
- Unit tests for `buildLightExtractionPrompt()` (verify shape, no action items)
- Integration tests for end-to-end flow (pull → extract → verify)
- All existing tests must pass

---

## 6. Success Criteria

- [ ] Light meetings process in <5 seconds, no staging review needed
- [ ] Important meetings get cleaner extraction (fewer noise items)
- [ ] Batch processing 7-9 meetings takes <5 minutes total attention
- [ ] Can always reprocess a light meeting for full extraction
- [ ] All 2100+ existing tests pass
