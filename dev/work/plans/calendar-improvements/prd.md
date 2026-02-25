# PRD: Calendar FreeBusy Integration

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-24  
**Plan**: `dev/work/plans/calendar-improvements/plan.md`  
**Pre-mortem**: `dev/work/plans/calendar-improvements/pre-mortem.md`  
**Review**: `dev/work/plans/calendar-improvements/review.md`

---

## 1. Problem & Goals

### Problem

Scheduling 1:1s and meetings with colleagues is a manual, time-consuming process. PMs spend significant time:
- Switching between calendars
- Mentally computing overlapping free slots
- Going back-and-forth to find a time that works

This is a high-frequency task (multiple times per week) with significant friction that an intelligent agent should automate.

### Goals

1. **FreeBusy API integration**: Add `getFreeBusy()` method to Google Calendar provider to query mutual availability
2. **Availability algorithm**: Create a pure utility that finds open slots given busy blocks + constraints
3. **CLI command**: `arete availability find --with <person>` to get actionable slot recommendations
4. **Timezone handling**: Display all times in user's local timezone with clear labels (e.g., "2:30 CT")
5. **Graceful errors**: Clear, actionable messages when calendar access is unavailable

### Validation

✅ **FreeBusy API works for org calendars** (tested 2026-02-24)
- Tested with `jamie@reserv.com` — returned 19 busy blocks
- No additional OAuth scopes needed (`calendar.readonly` is sufficient)
- Works for anyone in the Google Workspace org (or with shared calendar access)
- Test script: `scripts/test-freebusy.ts`

### Out of Scope (v1)

- **Calendar invite creation** — v2 feature, requires write scope
- **Recurring meeting suggestions** — just find one-off slots for now
- **External calendar support** — org calendars only (FreeBusy limitation)
- **ical-buddy provider** — Google Calendar only for now
- **Preferences learning** — no "prefer mornings" intelligence yet
- **Target's working hours** — we don't know Jamie's timezone/preferences
- **User's secondary calendars** — only `primary` calendar checked for conflicts

---

## 2. Architecture Decisions

### Timezone Handling

- **Display**: All times shown in user's local timezone with timezone label (e.g., "2:30 CT")
- **Working hours**: Filter by USER's working hours only (9-5 in user's local time)
- **Target's working hours**: Out of scope — if Jamie has a 7am meeting, that's their choice

### Availability Module Pattern

- **Pure utility, not a service**: `packages/core/src/utils/availability.ts` (not services/)
- **Reason**: No storage or search needed — just a pure algorithm that transforms busy blocks → free slots
- **No factory wiring needed**: Doesn't need AreteServices integration

### CLI Output Format

- **Structured for machines**: CLI outputs structured data (JSON with `--json`, table otherwise)
- **Agents make it conversational**: The agent layer transforms structured output into natural language

### FreeBusy Error Handling

- **Per-calendar accessibility**: Each calendar in the response has `{ accessible: boolean, error?: string }`
- **Never throw**: Return `accessible: false` for calendars without access, don't throw errors
- **Only throw for infrastructure errors**: Network failures, auth expired

---

## 3. User Stories

### Finding Availability

1. As a PM, I can run `arete availability find --with jamie@example.com --duration 30` to get a list of available meeting slots with Jamie.
2. As a PM, I can run `arete availability find --with "Jamie Smith"` and have Areté resolve the name to an email via my people directory.
3. As a PM, when I ask an agent "book me a meeting with Jamie," the agent uses the availability command and presents options in natural language.

### Error Handling

4. As a PM, if Jamie hasn't shared their calendar with me, I get a helpful error message explaining what to do.
5. As a PM, if I'm using ical-buddy instead of Google Calendar, I get a clear message that availability checking requires Google Calendar.
6. As a PM, if the person I name doesn't have an email on file, I get guidance on how to add it.

---

## 4. Tasks

### Task 1: Add FreeBusy method to Google Calendar provider

**File**: `packages/core/src/integrations/calendar/google-calendar.ts`

Add `getFreeBusy(emails: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult>` method.

**Acceptance Criteria**:
- [ ] Method exists and is exported from google-calendar.ts
- [ ] Queries user's primary calendar AND target emails in one API request
- [ ] Returns busy blocks for accessible calendars
- [ ] Returns `{ accessible: false }` for calendars without access (not an error)
- [ ] Uses DI pattern (`deps?: { fetch? }`) for testability (per ical-buddy pattern in LEARNINGS.md)
- [ ] Unit tests cover:
  - Happy path: both calendars accessible
  - No-access case: target calendar returns 403
  - Mixed case: user accessible, target not accessible

**Read Before Starting**:
- `packages/core/src/integrations/LEARNINGS.md` — calendar integration patterns
- `packages/core/src/integrations/calendar/google-calendar.ts` — existing implementation
- `scripts/test-freebusy.ts` — validated API approach

---

### Task 2: Add FreeBusy to CalendarProvider interface

**File**: `packages/core/src/integrations/calendar/types.ts`

Extend the interface so other providers could implement FreeBusy in the future.

**Acceptance Criteria**:
- [ ] `BusyBlock` type defined: `{ start: Date; end: Date; }`
- [ ] `FreeBusyCalendarResult` type defined: `{ busy: BusyBlock[], accessible: boolean, error?: string }`
- [ ] `FreeBusyResult` type defined:
  ```typescript
  type FreeBusyResult = {
    userBusy: BusyBlock[];
    calendars: Record<string, FreeBusyCalendarResult>;
  }
  ```
- [ ] `getFreeBusy` is optional on `CalendarProvider` interface
- [ ] Existing providers still compile (ical-buddy doesn't implement it)
- [ ] Types exported from `packages/core/src/index.ts`

---

### Task 3: Create availability-finding algorithm

**File**: `packages/core/src/utils/availability.ts` (new — NOT services/)

Pure algorithm: given busy blocks + constraints, find available slots.

**Input**:
```typescript
function findAvailableSlots(
  userBusy: BusyBlock[],
  targetBusy: BusyBlock[],
  options: {
    duration: number;           // minutes
    workingHours: { start: number; end: number };  // 9, 17 for 9-5
    days: number;               // how many days to search
    excludeWeekends: boolean;
  }
): AvailableSlot[]
```

**Output**:
```typescript
type AvailableSlot = { start: Date; end: Date; duration: number }
```

**Logic**:
1. Generate candidate slots for next N days within working hours
2. Filter out slots that overlap with userBusy OR targetBusy
3. Filter out weekends (if excludeWeekends)
4. Return slots sorted by date/time

**Acceptance Criteria**:
- [ ] `findAvailableSlots` function exists and is exported
- [ ] Finds slots when calendars have gaps
- [ ] Returns empty array when no mutual availability
- [ ] Respects working hours (default 9-5, configurable via options)
- [ ] Handles all-day events correctly (full day = no slots that day)
- [ ] Excludes weekends by default (configurable)
- [ ] **Timezone test**: Unit test covers user in PST with 9am meeting, target in EST with 9am meeting — asserts correct overlap/non-overlap
- [ ] Unit tests for edge cases:
  - No overlap between busy blocks
  - Completely full day
  - Weekend handling
  - Boundary times (meeting ends at 5pm, working hours end at 5pm)
  - DST transition day
- [ ] Exported from `packages/core/src/index.ts` (not from services/index.ts)

**Read Before Starting**:
- `packages/core/src/utils/` — existing utility patterns (if any)
- Task 2 types — use `BusyBlock` and `FreeBusyResult` types

**Depends on**: Task 2 (needs BusyBlock type)

---

### Task 4: Verify person resolution works for availability

**File**: `packages/core/src/services/entity.ts` (existing — verification only)

Verify `EntityService.resolve()` handles the availability command's needs.

**Acceptance Criteria**:
- [ ] Confirm `resolve(reference, 'person', paths)` returns email in `metadata.email`
- [ ] Document: If person exists but has no email, `metadata.email` is `undefined`
- [ ] Document: Score < 90 indicates ambiguous match (multiple candidates)
- [ ] No code changes expected — verification only
- [ ] Create a small verification report (can be a comment in PR or notes file)

**Read Before Starting**:
- `packages/core/src/services/entity.ts` — resolvePerson() implementation
- `packages/core/test/services/entity.test.ts` — existing test patterns

---

### Task 5: Add CLI command for availability

**File**: `packages/cli/src/commands/availability.ts` (new)

Create the `arete availability find` command.

**Usage**:
```bash
arete availability find --with <person-or-email> --duration 30 --days 7
```

**Flow**:
1. Resolve person name → email via EntityService
2. Get calendar provider via `getCalendarProvider(config)`
3. Check `provider.getFreeBusy` exists (ical-buddy won't have it)
4. Call FreeBusy for user + target
5. Run availability algorithm
6. Display top N slots in user's local timezone

**Acceptance Criteria**:
- [ ] `arete availability find --with jamie@example.com --duration 30` works
- [ ] `arete availability find --with "Jamie Smith"` resolves name to email
- [ ] Error: Person not found → "Could not find 'Jamie' in people/. Try: arete people list"
- [ ] Error: Person has no email → "Jamie found but no email on file — add email to people/internal/jamie.md"
- [ ] Error: No calendar access → "I couldn't see Jamie's availability — they may need to share their calendar with you"
- [ ] Error: Provider doesn't support FreeBusy → "Availability requires Google Calendar. Run: arete integration configure google-calendar"
- [ ] Output shows date, time (with timezone label like "CT"), duration for each slot
- [ ] Supports `--limit N` flag (default 5)
- [ ] Supports `--json` flag for structured output
- [ ] Register command in `packages/cli/src/index.ts`

**Read Before Starting**:
- `packages/cli/src/commands/pull.ts` — calendar provider usage pattern
- `packages/cli/src/commands/people.ts` — entity resolution pattern
- `packages/core/src/services/LEARNINGS.md` — service usage patterns

**Depends on**: Task 3 (algorithm), Task 4 (person resolution verified)

---

### Task 6: Update capability registry

**File**: `dev/catalog/capabilities.json`

After implementation, update the google-calendar capability entry.

**Acceptance Criteria**:
- [ ] Add entrypoint: `arete availability find --with <person>`
- [ ] Add implementation paths:
  - `packages/core/src/utils/availability.ts`
  - `packages/cli/src/commands/availability.ts`
- [ ] Update `lastVerified` date to today
- [ ] Verify no other capability entries need updating

**Depends on**: Task 5 (implementation complete)

---

## 5. Pre-Mortem Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | FreeBusy response format mismatch | Medium | Normalize `primary` → `userBusy` in type; test both |
| 2 | No fetch mocking pattern | Medium | Use DI pattern (`deps?: { fetch? }`) per ical-buddy |
| 3 | Timezone edge cases | **High** | Explicit timezone test in Task 3 AC |
| 4 | EntityService email gaps | Medium | Task 4 documents behavior; Task 5 has helpful errors |
| 5 | Dependency confusion | Low | Explicit depends_on in prd.json |
| 6 | Error handling inconsistency | Medium | Per-calendar `accessible: false`, don't throw |
| 7 | ical-buddy provider crash | **High** | Task 5 AC: check `provider.getFreeBusy` exists first |

Full analysis: `dev/work/plans/calendar-improvements/pre-mortem.md`

---

## 6. Success Criteria

1. ✅ `arete availability find --with "Jamie Smith" --duration 30` returns available slots
2. ✅ Slots are displayed in user's local timezone with label (e.g., "2:30 CT")
3. ✅ Working hours filter applied (only 9-5 slots)
4. ✅ Weekends excluded by default
5. ✅ Graceful errors for all failure modes (no crash)
6. ✅ All tests pass: `npm run typecheck && npm test`

---

## 7. References

- **Test script**: `scripts/test-freebusy.ts`
- **Google FreeBusy API**: https://developers.google.com/calendar/api/v3/reference/freebusy/query
- **Existing provider**: `packages/core/src/integrations/calendar/google-calendar.ts`
- **Calendar LEARNINGS**: `packages/core/src/integrations/LEARNINGS.md`
- **Service LEARNINGS**: `packages/core/src/services/LEARNINGS.md`
