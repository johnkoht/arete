# Pre-Mortem: Meeting Importance

## Overview

This plan touches multiple core components:
- `packages/core/src/integrations/calendar/` — CalendarEvent type extension
- `packages/core/src/integrations/meetings.ts` — MeetingForSave extension
- `packages/core/src/services/meeting-extraction.ts` — Light extraction prompt
- `packages/core/src/services/meeting-processing.ts` — Auto-approve logic
- `packages/cli/src/commands/meeting.ts` — CLI extract/process changes

---

## Risk 1: CalendarEvent Type Change Ripple Effects

**Category**: Integration

**Problem**: Adding `organizer` and `recurringEventId` to `CalendarEvent` affects all providers (Google Calendar, ical-buddy) and all callers. The type change could break consumers that don't expect these new fields, especially in JSON serialization or frontmatter writing.

**Mitigation**:
- Make new fields optional (`organizer?: ...`, `recurringEventId?: string`)
- Update `mapGoogleEvent()` to populate from Google API response
- ical-buddy: leave fields undefined (V1 scope is Google Calendar)
- Verify all `CalendarEvent` consumers handle undefined gracefully

**Verification**: 
- `npm run typecheck` passes
- `pull calendar` works with both providers
- Meeting frontmatter doesn't break with new fields

---

## Risk 2: Google Calendar API Field Availability

**Category**: Integration / Platform Issues

**Problem**: We assume Google Calendar API returns `organizer` and `recurringEventId` fields. If these are optional or missing in some edge cases (declined events, external calendars, all-day events), inference logic could fail or produce incorrect results.

**Mitigation**:
- Check Google Calendar API documentation for field availability
- In `mapGoogleEvent()`, use optional chaining: `item.organizer?.email`
- Default to `importance: 'normal'` if organizer data unavailable
- Add defensive guards in `inferMeetingImportance()`

**Verification**:
- Test with various event types (recurring, one-off, all-day, external invites)
- Check that missing organizer doesn't crash or produce 'light' for important meetings

---

## Risk 3: Light Extraction Prompt Filtering Too Aggressively

**Category**: Scope Creep / Code Quality

**Problem**: The light extraction prompt needs to extract only domain/goal-relevant learnings. If too aggressive, users lose valuable insights. If too lenient, it defeats the purpose of "light" mode.

**Mitigation**:
- Start with simple heuristic: "up to 2 learnings that relate to product strategy, user insights, or organizational decisions"
- Do NOT try to inject full goals/areas context (too complex for V1)
- Make the prompt clearly state: "skip operational details like tool configuration, meeting logistics"
- Include examples in prompt for calibration

**Verification**:
- Test with the example meeting (Jira Dashboard) — should extract only the ClaimClear/engineering shadowing insights
- Verify no action items are extracted in light mode

---

## Risk 4: Speaking Ratio Calculation Accuracy

**Category**: Platform Issues

**Problem**: Transcripts from Fathom and Krisp have different speaker label formats. If the regex doesn't match, speaking ratio returns 0 or NaN, causing unexpected behavior.

**Mitigation**:
- Document expected format: `**Name | HH:MM**` or `**Name | MM:SS**`
- Return `undefined` (not 0) if no speaker labels found
- In importance upgrade logic: only upgrade if ratio is a valid number > threshold
- Add fallback: if can't calculate, keep inferred importance unchanged

**Verification**:
- Test regex against real Fathom and Krisp transcripts
- Test with plain transcript (no speaker labels) — should not crash

---

## Risk 5: MeetingForSave vs Frontend Frontmatter Mismatch

**Category**: Integration

**Problem**: The triage web UI (`packages/apps/web`) reads meeting frontmatter. If we add `importance` and `status: skipped` to the backend but the frontend doesn't handle them, UI could break or show stale data.

**Mitigation**:
- V1 scope is backend only — UI changes are out of scope
- Ensure new fields are optional and backward-compatible
- Document that `skipped` status meetings should still appear in UI (per user feedback: "badge in same list")
- Add note to backlog: "Update triage UI for importance badges"

**Verification**:
- Verify existing triage UI doesn't crash on new frontmatter fields
- Existing statuses (`synced`, `processed`, `approved`) still work

---

## Risk 6: Auto-Approve Logic Race Condition

**Category**: State Tracking

**Problem**: If light meetings auto-approve and write `status: approved` immediately, but the user is simultaneously viewing the triage UI, they might see inconsistent state.

**Mitigation**:
- Auto-approve is atomic: all items approved + status updated in single file write
- No partial states: either fully staged (processed) or fully approved
- Light meetings go straight to `approved`, never through `processed`

**Verification**:
- Test that light meeting goes directly to `status: approved`
- Verify `staged_item_status` has all items as `approved` for light meetings

---

## Risk 7: Thorough Mode Limit Changes Break Tests

**Category**: Test Patterns

**Problem**: Thorough mode increases limits (10 AI, 7 DE, 7 LE). Existing tests may have assertions based on current limits (7 AI, 5 DE, 5 LE). Changing constants could cause test failures.

**Mitigation**:
- Add `mode` parameter to `extractMeetingIntelligence()` with default `'normal'`
- Keep current constants as `NORMAL_LIMITS`, add `THOROUGH_LIMITS`
- Update tests to explicitly pass mode if testing limits
- New tests for thorough mode with higher limits

**Verification**:
- All existing tests pass with `mode: 'normal'` (default)
- New tests verify thorough mode limits

---

## Risk 8: Importance Field Not Propagated Through Full Pipeline

**Category**: Context Gaps

**Problem**: Importance is inferred at `pull calendar` time, but needs to be available at `meeting extract` time (possibly hours later, different session). If importance isn't persisted in meeting frontmatter during sync, it's lost.

**Mitigation**:
- Write `importance` to meeting frontmatter during `saveMeetingFile()`
- `meeting extract` reads importance from frontmatter, not recalculates
- Reprocessing: read importance from frontmatter; `--importance` flag overrides

**Verification**:
- Sync a meeting, verify frontmatter has `importance` field
- Extract same meeting in new session, verify importance is used

---

## Summary

| # | Risk | Severity | Mitigation Owner |
|---|------|----------|------------------|
| 1 | CalendarEvent ripple effects | MEDIUM | Step 1 |
| 2 | Google API field availability | MEDIUM | Step 1 |
| 3 | Light extraction over-filtering | MEDIUM | Step 3 |
| 4 | Speaking ratio accuracy | LOW | Step 4 |
| 5 | Frontend/backend mismatch | LOW | Out of scope |
| 6 | Auto-approve race condition | LOW | Step 5 |
| 7 | Thorough mode test breaks | LOW | Step 3 |
| 8 | Importance not propagated | MEDIUM | Steps 1-2 |

**Total risks identified**: 8
**Categories covered**: Integration (3), Platform Issues (2), Code Quality (1), Test Patterns (1), Context Gaps (1), State Tracking (1)

---

**No CRITICAL risks identified. Ready to proceed with these mitigations.**
