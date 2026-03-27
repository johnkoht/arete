# PRD: Calendar Event Creation

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-25  
**Branch**: `feature/calendar-events`  
**Depends on**: Google Calendar provider (complete), FreeBusy API (complete)

---

## 1. Problem & Goals

### Problem

Users can find mutual availability with `arete availability find` but can't complete the scheduling flow. They must context-switch to Google Calendar to create the actual event. This friction breaks the workflow for three common use cases:

1. **Book a meeting** — 1:1s, intros, quick syncs with another person
2. **Block time** — Personal focus blocks (no attendees) for deep work
3. **Complete the availability → booking flow** — Currently stops at "here are available slots"

### Goals

1. **Core API**: Add `createEvent()` method to Google Calendar provider, following established patterns (DI for testing, optional interface method)
2. **CLI command**: `arete calendar create` for power users and scripting
3. **Conversational skill**: `schedule-meeting` skill for natural language booking flow
4. **v1 simplicity**: Single round-trip booking (pick slot → create event). No description drafting, context search, or agenda creation in v1.

### Out of Scope (v1)

- Recurring events
- Multiple attendees (beyond 1:1)
- Event editing/deletion
- Meeting room booking
- Google Meet auto-add
- Description drafting from context (v1.1)
- Agenda creation offer (v1.1)
- "A, 1, 2" combined response format (v1.1)

---

## 2. Architecture Decisions

### Optional Interface Method

`createEvent()` is added as an **optional method** on `CalendarProvider` (like `getFreeBusy?`). This maintains backward compatibility — ical-buddy provider doesn't support event creation and won't break.

```typescript
interface CalendarProvider {
  // ... existing methods
  createEvent?(input: CreateEventInput): Promise<CreatedEvent>;
}
```

CLI and skill check `if (provider.createEvent)` before calling.

### Dependency Injection for Testing

Following the `FreeBusyDeps` pattern established in the Google Calendar provider:

```typescript
interface CreateEventDeps {
  fetch?: typeof fetch;
}
```

This allows mocking fetch in tests without global mocking complexity.

### Date Parsing (No External Dependencies)

Simple built-in parsing for these patterns only — no chrono-node:
- ISO dates: `2026-02-26T14:00:00`
- Simple keywords: `today`, `tomorrow`
- Day + time: `monday 2pm`, `tuesday 10am`
- Relative: `next monday`, `next week`

### Timezone Handling

- Use `Intl.DateTimeFormat().resolvedOptions().timeZone` for user's local timezone
- Send ISO strings with explicit timezone offset to Google API
- Always display times with timezone abbreviation: "2pm CT"

---

## 3. User Stories

### Task 1: Add `createEvent()` to Google Calendar Provider

**Description**: Implement `createEvent()` method on the Google Calendar provider using the Google Calendar Events API.

**Before starting, read these files**:
- `packages/core/src/integrations/calendar/google-calendar.ts` (existing provider, `googleFetch` helper)
- `packages/core/src/integrations/calendar/google-auth.ts` (credential loading)
- `packages/core/src/integrations/LEARNINGS.md` (integration patterns)
- `packages/core/test/integrations/calendar/google-calendar.test.ts` (test patterns)

**Implementation**:
- Add `CreateEventInput` and `CreatedEvent` types to `types.ts`
- Implement `createEvent()` using POST to `/calendars/{calendarId}/events`
- Use existing `googleFetch()` helper (handles auth refresh)
- Add `CreateEventDeps` interface for testability (matching `FreeBusyDeps` pattern)
- Add `createEvent?` as optional method on `CalendarProvider` interface
- Export types and function from `packages/core/src/index.ts`

**Acceptance Criteria**:
- [ ] `createEvent()` creates event via Google Calendar API
- [ ] Returns event ID, calendar link, and event details
- [ ] Handles errors gracefully (401 → "run: arete integration configure google-calendar", 403 → permission error)
- [ ] Uses `CreateEventDeps` injection pattern for testability
- [ ] `createEvent?` is optional on `CalendarProvider` interface
- [ ] Unit tests using existing `makeMockStorage()`, `makeCredentialsYaml()` helpers
- [ ] `npm run typecheck` passes (ical-buddy provider unchanged)

---

### Task 2: Add CLI Command `arete calendar create`

**Description**: Create a new CLI command for creating calendar events, with person resolution and natural language date parsing.

**Before starting, read**:
- `packages/cli/src/commands/availability.ts` (person resolution pattern)
- `packages/cli/src/index.ts` (command registration pattern)

**Command Registration**: Create new `calendar` command group with `create` subcommand in `packages/cli/src/commands/calendar.ts`. Register in `packages/cli/src/index.ts`.

**Options**:
- `--title <title>` — event title (required)
- `--start <datetime>` — start time (ISO or natural language)
- `--duration <minutes>` — duration (default: 30)
- `--with <person-or-email>` — attendee (optional, uses person resolution)
- `--description <text>` — event description (optional)
- `--json` — output as JSON

**Date Parsing** (no chrono-node):
- ISO dates: `2026-02-26T14:00:00`
- Keywords: `today`, `tomorrow`
- Day + time: `monday 2pm`, `tuesday 10am`
- Relative: `next monday`, `next week`

**Acceptance Criteria**:
- [ ] Command registered as `arete calendar create`
- [ ] Basic creation works: `arete calendar create --title "1:1" --with sarah --start "tomorrow 2pm"`
- [ ] Block time works: `arete calendar create --title "Focus time" --start "tomorrow 9am" --duration 120`
- [ ] Person resolution (name → email) works
- [ ] Date parsing handles specified patterns (no chrono-node dependency added)
- [ ] Times displayed with timezone abbreviation
- [ ] Graceful error messages for auth issues, person-not-found, invalid dates
- [ ] `--json` outputs structured response

---

### Task 3: Create `schedule-meeting` Skill (v1)

**Description**: Create a conversational skill for scheduling meetings through natural language.

**Location**: `packages/runtime/skills/schedule-meeting/SKILL.md`

**Triggers**: "schedule a meeting", "book time with", "set up a call", "1:1 with", "find time with", "book a meeting"

**Workflow**:
1. Parse request — extract person, time preference (default: today + 2 days)
2. Resolve person → email via entity resolution
3. Find availability — call FreeBusy
4. Present 1-3 slots with letters (A, B, C)
5. Handle response — case-insensitive, flexible parsing
6. Create event via `arete calendar create` or provider directly
7. Confirm with calendar link

**Time Frame Handling**:
- No time specified → today + 2 days
- "today" → today only
- "tomorrow" → tomorrow only
- "next week" → Mon-Fri of next week

**Block Time Flow** (simpler):
- No person resolution or FreeBusy needed
- Creates event directly

**Response Parsing Rules**:
- Case-insensitive: "a" = "A"
- Trim whitespace and punctuation
- Invalid input → re-prompt with hint

**Acceptance Criteria**:
- [ ] Routes for scheduling triggers
- [ ] Default time frame: today + 2 days
- [ ] Respects user time preferences: "today", "tomorrow", "next week"
- [ ] Simple letter response works: "A" books the slot
- [ ] Times always displayed with timezone
- [ ] Block time requests skip person/FreeBusy entirely
- [ ] Invalid responses handled gracefully (re-prompt)

---

### Task 4: Update Documentation

**Description**: Update all relevant documentation to reflect the new calendar event creation capability.

**Files to update**:

| File | Changes |
|------|---------|
| `packages/runtime/GUIDE.md` | Add "Create Events" section under Calendar with examples |
| `.agents/sources/shared/cli-commands.md` | Add `arete calendar create` command |
| `packages/runtime/skills/README.md` | Add schedule-meeting skill to list |
| `packages/runtime/integrations/registry.md` | Note event creation capability |
| `packages/core/src/index.ts` | Export new types and function (done in Task 1) |
| `dev/catalog/capabilities.json` | Add `schedule-meeting` capability entry |

Then rebuild: `npm run build:agents:dev`

**Verification**: After completion, run:
```bash
grep -r "calendar create" packages/runtime/ .agents/
```

**Acceptance Criteria**:
- [ ] GUIDE.md documents event creation and skill usage
- [ ] CLI reference includes new command with all options
- [ ] AGENTS.md rebuilt with new command
- [ ] Skills README lists schedule-meeting
- [ ] Integrations registry notes event creation capability
- [ ] `dev/catalog/capabilities.json` has `schedule-meeting` entry
- [ ] Grep verification passes (command documented in all relevant files)

---

### Task 5: Tests

**Description**: Add comprehensive tests for the new functionality.

**Scope**: Core API + CLI tests. Skill routing tests are out of scope (skill is SKILL.md only).

**Core API tests** (`packages/core/test/integrations/calendar/`):
- Unit tests for `createEvent()` using existing helpers
- Follow `FreeBusyDeps` pattern with `CreateEventDeps`
- Test cases: success, 401 error, 403 error, network error

**CLI tests** (`packages/cli/test/commands/`):
- Person resolution (name → email, email passthrough)
- Date parsing (all specified patterns)
- Timezone handling edge cases
- Error handling (auth failure, person not found)

**Acceptance Criteria**:
- [ ] `npm test` passes
- [ ] `createEvent()` tests use existing `makeMockStorage()`, `makeCredentialsYaml()` helpers
- [ ] Tests cover: happy path, auth errors (401, 403), person-not-found, invalid dates
- [ ] Timezone edge cases tested (verify local time → correct UTC offset)

---

## 4. Pre-Mortem Risks & Mitigations

| Risk | Severity | Mitigation | Applied To |
|------|----------|------------|------------|
| Fresh context missing patterns | High | Explicit file list in task descriptions | Tasks 1, 2 |
| Test pattern mismatch | Medium | Reference existing helpers explicitly | Tasks 1, 5 |
| Date parsing scope creep | Medium | Explicit pattern list, no chrono-node | Task 2 |
| Time zone errors | High | Explicit timezone handling + display | Tasks 2, 3, 5 |
| Interface backward compat | Medium | Optional method pattern | Task 1 |
| Response format ambiguity | Low | Simple letter format for v1 | Task 3 |
| Doc update incomplete | Low | Explicit checklist + grep verify | Task 4 |

---

## 5. Dependencies

```
Task 1 (core API) → Task 2 (CLI) → Task 3 (skill)
                 ↘ Task 4 (docs)
Task 5 (tests) runs with Task 1 and Task 2
```

---

## 6. Success Metrics

- User can book a meeting with natural language: "book a meeting with Jane tomorrow"
- User can block focus time: "block 2 hours tomorrow for PRD work"
- CLI works for scripting: `arete calendar create --title "1:1" --with jane --start "tomorrow 2pm"`
- All events appear correctly in Google Calendar at the expected local time
- `npm test` passes with new test coverage
