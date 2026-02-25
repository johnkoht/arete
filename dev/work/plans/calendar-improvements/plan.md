---
status: idea
size: medium
created: 2026-02-24
---

# Calendar FreeBusy Integration

## Problem Statement

Scheduling 1:1s and meetings with colleagues is a manual, time-consuming process. PMs spend significant time switching between calendars, mentally computing overlapping free slots, and going back-and-forth to find a time that works.

**User story**: "Schedule a 1:1 with Jamie this week" → Agent finds mutual availability and suggests optimal times.

## Validation

✅ **FreeBusy API works for org calendars** (tested 2026-02-24)
- Tested with `jamie@reserv.com` — returned 19 busy blocks
- No additional OAuth scopes needed (`calendar.readonly` is sufficient)
- Works for anyone in the Google Workspace org (or with shared calendar access)

Test script: `scripts/test-freebusy.ts`

## Success Criteria

1. User can ask "find time with Jamie" and get actionable slot recommendations
2. Slots respect working hours (configurable, default 9am-5pm)
3. Slots respect meeting duration requirements
4. Graceful handling when calendar access is unavailable

## Plan

### 1. Add FreeBusy method to Google Calendar provider
**File**: `packages/core/src/integrations/calendar/google-calendar.ts`

Add `getFreeBusy(emails: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult>` method that:
- Calls Google Calendar FreeBusy API
- Returns busy blocks per calendar
- Handles errors gracefully (no access → empty result with flag)

**AC**:
- [ ] Method exists and is exported
- [ ] Returns busy blocks for accessible calendars
- [ ] Returns `{ accessible: false }` for calendars without access (not an error)
- [ ] Unit tests cover happy path and no-access case

### 2. Add FreeBusy to CalendarProvider interface
**File**: `packages/core/src/integrations/calendar/types.ts`

Extend the interface so other providers could implement FreeBusy in the future.

**AC**:
- [ ] `FreeBusyResult` type defined
- [ ] `getFreeBusy` is optional on `CalendarProvider` interface
- [ ] Existing providers still compile

### 3. Create availability-finding algorithm
**File**: `packages/core/src/services/availability.ts` (new)

Given busy blocks for N calendars + constraints, find available slots:
- Input: busy blocks[], duration, working hours, days to search
- Output: ranked list of available slots
- Logic: invert busy → free, intersect all calendars, filter by constraints

**AC**:
- [ ] Finds slots when calendars have gaps
- [ ] Returns empty when no mutual availability
- [ ] Respects working hours (default 9-5, configurable)
- [ ] Handles all-day events correctly
- [ ] Unit tests for edge cases (no overlap, weekends, etc.)

### 4. Add CLI command for availability
**File**: `packages/cli/src/commands/availability.ts` (new)

```bash
arete availability find --with <person-or-email> --duration 30 --days 7
```

- Resolves person name → email via `people/` files
- Calls FreeBusy for user + target
- Runs availability algorithm
- Displays top N slots

**AC**:
- [ ] `arete availability find --with jamie@example.com --duration 30` works
- [ ] `arete availability find --with "Jamie Smith"` resolves name to email
- [ ] Shows helpful error if person not found or no calendar access
- [ ] Output shows date, time, duration for each slot

### 5. Integrate person resolution
**File**: `packages/core/src/services/people.ts` (or existing)

Ensure we can resolve "Jamie" or "Jamie Smith" → `jamie@reserv.com` using:
- `people/` directory files
- Email field matching
- Fuzzy name matching

**AC**:
- [ ] Exact email passthrough works
- [ ] Full name match works
- [ ] Partial/first name match works (with disambiguation if needed)
- [ ] Returns clear error for unresolvable names

## Out of Scope (v1)

- **Calendar invite creation** — v2 feature, requires write scope
- **Recurring meeting suggestions** — just find one-off slots for now
- **External calendar support** — org calendars only (FreeBusy limitation)
- **ical-buddy provider** — Google Calendar only for now
- **Preferences learning** — no "prefer mornings" intelligence yet

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Target hasn't shared calendar | Graceful error: "I couldn't see Jamie's availability — they may need to share their calendar with you" |
| Too many/few results | Default to 5 suggestions, allow `--limit` flag |
| Timezone confusion | Use local timezone, display clearly |
| Working hours vary | Make configurable in workspace config |

## Future Enhancements

- Create calendar invites directly (`calendar.events` write scope)
- "Find time for 3 people" (multi-party scheduling)
- Preference learning (morning person, buffer between meetings)
- Slack integration for proposing times
- Room/resource booking

## References

- Test script: `scripts/test-freebusy.ts`
- Google FreeBusy API: https://developers.google.com/calendar/api/v3/reference/freebusy/query
- Existing calendar provider: `packages/core/src/integrations/calendar/google-calendar.ts`
