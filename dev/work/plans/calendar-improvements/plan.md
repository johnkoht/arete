---
title: Calendar FreeBusy Integration
status: building
size: medium
created: 2026-02-24
tags: []
updated: 2026-02-25T04:17:16.666Z
has_pre_mortem: true
has_review: true
has_prd: true
---

# Calendar FreeBusy Integration

## Problem Statement

Scheduling 1:1s and meetings with colleagues is a manual, time-consuming process. PMs spend significant time switching between calendars, mentally computing overlapping free slots, and going back-and-forth to find a time that works.

**User story**: "Schedule a 1:1 with Jamie this week" → Agent finds mutual availability and suggests optimal times.

**Example interaction**:
```
User: Can you book me a meeting with Jamie?
Agent: Sure! You and Jamie have availability tomorrow at 2:30 CT or 4 CT, 
       or Friday at 11 CT, 1 CT, or 3 CT.
User: Tomorrow at 2:30 works.
```

## Validation

✅ **FreeBusy API works for org calendars** (tested 2026-02-24)
- Tested with `jamie@reserv.com` — returned 19 busy blocks
- No additional OAuth scopes needed (`calendar.readonly` is sufficient)
- Works for anyone in the Google Workspace org (or with shared calendar access)

Test script: `scripts/test-freebusy.ts`

## Success Criteria

1. User can ask "find time with Jamie" and get actionable slot recommendations
2. Slots respect the **user's** working hours (configurable, default 9am-5pm local time)
3. Slots are displayed in the **user's local timezone** with timezone label
4. Slots respect meeting duration requirements
5. Graceful handling when calendar access is unavailable

## Codebase Findings (2026-02-24)

**Person resolution already exists**: `EntityService.resolve()` in `packages/core/src/services/entity.ts` has:
- `resolvePerson()` with fuzzy matching on name, slug, email
- Scoring: exact email (95), full name (100), slug (90), partial matches (50-70)
- Works across `people/{internal,customers,users}/`

**User calendar**: FreeBusy API queries both `{ id: 'primary' }` (user) and `{ id: email }` (target) in one request. No separate fetch needed.

**Key references**:
- `packages/core/src/services/entity.ts` — existing person resolution
- `packages/core/src/services/LEARNINGS.md` — service patterns
- `packages/core/src/integrations/LEARNINGS.md` — calendar integration patterns
- `scripts/test-freebusy.ts` — validated FreeBusy API approach

## Architecture Decisions

### Timezone Handling
- **Display**: All times shown in user's local timezone with timezone label (e.g., "2:30 CT")
- **Working hours**: Filter by USER's working hours only (9-5 in user's local time)
- **Target's working hours**: Out of scope for v1 — we don't have Jamie's timezone or preferences. If Jamie has a 7am meeting, that's their choice.

### Availability Module Pattern
- **Pure utility, not a service**: `packages/core/src/utils/availability.ts` (not services/)
- **Reason**: No storage or search needed — just a pure algorithm that transforms busy blocks → free slots
- **No factory wiring needed**: Doesn't need AreteServices integration

### CLI Output Format
- **Structured for machines**: CLI outputs structured data (JSON with `--json`, table otherwise)
- **Agents make it conversational**: The agent layer transforms structured output into natural language
- **Example CLI output**:
  ```
  Available slots with Jamie Smith:
  
  Date       | Time        | Duration
  -----------|-------------|----------
  2026-02-25 | 14:30 CT    | 30 min
  2026-02-25 | 16:00 CT    | 30 min
  2026-02-28 | 11:00 CT    | 30 min
  ```

## Plan

### Dependencies

```
Step 1 ─┐
        ├→ Step 3 ─┐
Step 2 ─┘          ├→ Step 5 → Step 6
Step 4 ────────────┘
```

- **Steps 1, 2, 4**: Can run in parallel (independent)
- **Step 3**: Depends on Steps 1 + 2 (needs FreeBusyResult type)
- **Step 5**: Depends on Steps 3 + 4 (needs algorithm + person resolution)
- **Step 6**: Depends on Step 5 (post-implementation update)

---

### 1. Add FreeBusy method to Google Calendar provider
**File**: `packages/core/src/integrations/calendar/google-calendar.ts`

Add `getFreeBusy(emails: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult>` method that:
- Calls Google Calendar FreeBusy API with `items: [{ id: 'primary' }, ...emails.map(e => ({ id: e }))]`
- Returns busy blocks per calendar (keyed by email)
- Normalizes `primary` → `userBusy` in response
- Handles errors gracefully (no access → `{ accessible: false }` per calendar, not throw)

**AC**:
- [ ] Method exists and is exported
- [ ] Queries user's primary calendar AND target emails in one request
- [ ] Returns busy blocks for accessible calendars
- [ ] Returns `{ accessible: false }` for calendars without access (not an error)
- [ ] Uses DI pattern (`deps?: { fetch? }`) for testability (per ical-buddy pattern)
- [ ] Unit tests cover happy path and no-access case

---

### 2. Add FreeBusy to CalendarProvider interface
**File**: `packages/core/src/integrations/calendar/types.ts`

Extend the interface so other providers could implement FreeBusy in the future.

**AC**:
- [ ] `FreeBusyResult` type defined:
  ```typescript
  type FreeBusyResult = {
    userBusy: BusyBlock[];
    calendars: Record<string, { busy: BusyBlock[], accessible: boolean, error?: string }>;
  }
  type BusyBlock = { start: Date; end: Date; }
  ```
- [ ] `getFreeBusy` is optional on `CalendarProvider` interface
- [ ] Existing providers still compile (ical-buddy doesn't implement it)

---

### 3. Create availability-finding algorithm
**File**: `packages/core/src/utils/availability.ts` (new — NOT services/)

Pure algorithm: given busy blocks + constraints, find available slots.

**Input**:
- `userBusy: BusyBlock[]` — user's busy times
- `targetBusy: BusyBlock[]` — target's busy times  
- `options: { duration: number, workingHours: { start: number, end: number }, days: number, excludeWeekends: boolean }`

**Output**:
- `AvailableSlot[]` — ranked list of `{ start: Date, end: Date, duration: number }`

**Logic**:
1. Generate candidate slots for next N days within working hours
2. Filter out slots that overlap with userBusy OR targetBusy
3. Filter out weekends (if excludeWeekends)
4. Return slots sorted by date/time

**AC**:
- [ ] Finds slots when calendars have gaps
- [ ] Returns empty array when no mutual availability
- [ ] Respects working hours (default 9-5, configurable via options)
- [ ] Handles all-day events correctly (full day = no slots)
- [ ] Excludes weekends by default (configurable)
- [ ] **Timezone test**: Unit test covers user in PST with 9am meeting, target in EST with 9am meeting — asserts correct overlap/non-overlap
- [ ] Unit tests for edge cases (no overlap, weekends, boundary times, DST transition)
- [ ] Exported from `packages/core/src/index.ts` (not from services/index.ts)

---

### 4. Verify person resolution works for availability use case
**File**: `packages/core/src/services/entity.ts` (existing)

Verify `EntityService.resolve()` handles the availability command's needs.

**AC**:
- [ ] Confirm `resolve(reference, 'person', paths)` returns email in `metadata.email`
- [ ] If person exists but has no email: return with `metadata.email = undefined`
- [ ] Document behavior for disambiguation (score < 90 = ambiguous, may have multiple matches)
- [ ] No code changes expected — verification only

---

### 5. Add CLI command for availability
**File**: `packages/cli/src/commands/availability.ts` (new)

```bash
arete availability find --with <person-or-email> --duration 30 --days 7
```

- Resolves person name → email via EntityService
- Calls FreeBusy for user + target
- Runs availability algorithm
- Displays top N slots in user's local timezone

**AC**:
- [ ] `arete availability find --with jamie@example.com --duration 30` works
- [ ] `arete availability find --with "Jamie Smith"` resolves name to email
- [ ] Shows helpful error if person not found: "Could not find 'Jamie' in people/. Try: arete people list"
- [ ] Shows helpful error if person has no email: "Jamie found but no email on file — add email to people/internal/jamie.md"
- [ ] Shows helpful error if no calendar access: "I couldn't see Jamie's availability — they may need to share their calendar with you"
- [ ] Shows helpful error if provider doesn't support FreeBusy (ical-buddy): "Availability requires Google Calendar. Run: arete integration configure google-calendar"
- [ ] Output shows date, time (with timezone label), duration for each slot
- [ ] Supports `--limit N` flag (default 5)
- [ ] Supports `--json` flag for structured output

---

### 6. Update capability registry
**File**: `dev/catalog/capabilities.json`

After implementation, update the google-calendar capability entry.

**AC**:
- [ ] Add entrypoint: `arete availability find --with <person>`
- [ ] Add implementation paths: `packages/core/src/utils/availability.ts`, `packages/cli/src/commands/availability.ts`
- [ ] Update `lastVerified` date

---

## Out of Scope (v1)

- **Calendar invite creation** — v2 feature, requires write scope
- **Recurring meeting suggestions** — just find one-off slots for now
- **External calendar support** — org calendars only (FreeBusy limitation)
- **ical-buddy provider** — Google Calendar only for now
- **Preferences learning** — no "prefer mornings" intelligence yet
- **Target's working hours** — we don't know Jamie's timezone/preferences
- **User's secondary calendars** — only `primary` calendar checked for user's conflicts

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Target hasn't shared calendar | Graceful error with clear message (Step 5 AC) |
| Too many/few results | Default to 5 suggestions, allow `--limit` flag |
| Timezone confusion | Display in user's local timezone with label (e.g., "2:30 CT") |
| Working hours vary | Use user's local 9-5 as default; configurable via CLI flags |
| ical-buddy users crash | Check `provider.getFreeBusy` exists before calling; helpful error |

## Future Enhancements

- Create calendar invites directly (`calendar.events` write scope)
- "Find time for 3 people" (multi-party scheduling)
- Preference learning (morning person, buffer between meetings)
- Target's working hours (requires timezone + preferences data)
- User's secondary calendars (check all configured calendars)
- Slack integration for proposing times
- Room/resource booking

## References

- Test script: `scripts/test-freebusy.ts`
- Google FreeBusy API: https://developers.google.com/calendar/api/v3/reference/freebusy/query
- Existing calendar provider: `packages/core/src/integrations/calendar/google-calendar.ts`
- Pre-mortem: `dev/work/plans/calendar-improvements/pre-mortem.md`
- Review: `dev/work/plans/calendar-improvements/review.md`
