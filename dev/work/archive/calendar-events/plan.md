---
title: Calendar Events
slug: calendar-events
status: complete
size: medium
tags: [calendar, scheduling, skill]
created: 2026-02-25T16:13:12.472Z
updated: 2026-02-25T18:50:10.042Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 5
---

# Plan: Calendar Event Creation

## Problem Statement

Users can find availability (`arete availability find`) but can't complete the scheduling flow. They must context-switch to create the actual calendar event. The three use cases are:

1. **Book a meeting** — with another person (1:1, intro, sync)
2. **View availability** — ✅ Already exists  
3. **Block time** — personal focus blocks (no attendees)

## Success Criteria

- User says "book a meeting with Jane about onboarding" → finds availability, offers slots, creates event
- User says "block 2 hours tomorrow for PRD work" → focus time created
- CLI exists for power users/scripting
- All events created via Google Calendar Events API

---

## Plan

### 1. Add `createEvent()` method to Google Calendar provider

**File**: `packages/core/src/integrations/calendar/google-calendar.ts`

**Before starting, read these files** (pre-mortem mitigation):
- `packages/core/src/integrations/calendar/google-calendar.ts` (existing provider, `googleFetch` helper)
- `packages/core/src/integrations/calendar/google-auth.ts` (credential loading)
- `packages/core/src/integrations/LEARNINGS.md` (integration patterns)
- `packages/core/test/integrations/calendar/google-calendar.test.ts` (test patterns)

**Implementation**:
- Add types to `types.ts`:
  ```typescript
  interface CreateEventInput {
    title: string;
    start: Date;
    end: Date;
    attendees?: string[];  // emails
    description?: string;
    calendarId?: string;   // default: 'primary'
  }
  
  interface CreatedEvent {
    id: string;
    htmlLink: string;
    title: string;
    start: Date;
    end: Date;
    attendees?: string[];
  }
  ```
- Implement `createEvent()` using POST to `/calendars/{calendarId}/events`
- Use existing `googleFetch()` helper (handles auth refresh automatically)
- Add `CreateEventDeps` interface matching `FreeBusyDeps` pattern for testability
- Add to `CalendarProvider` interface as **optional method** (`createEvent?`) — ical-buddy doesn't support this
- Export types and function from `packages/core/src/index.ts`

**AC**: 
- [ ] `createEvent()` creates event via Google Calendar API
- [ ] Returns event ID, calendar link, and event details
- [ ] Handles errors gracefully (401 → "run: arete integration configure google-calendar", 403 → permission error)
- [ ] Uses `CreateEventDeps` injection pattern for testability
- [ ] `createEvent?` is optional on `CalendarProvider` interface
- [ ] Unit tests using existing `makeMockStorage()`, `makeCredentialsYaml()` helpers
- [ ] `npm run typecheck` passes (ical-buddy provider unchanged)

---

### 2. Add CLI command `arete calendar create`

**File**: `packages/cli/src/commands/calendar.ts` (new)

**Before starting, read**:
- `packages/cli/src/commands/availability.ts` (person resolution pattern)
- `packages/cli/src/index.ts` (command registration pattern)

**Command Registration**: Create new `calendar` command group with `create` subcommand. Register in `packages/cli/src/index.ts`.

**Options**:
- `--title <title>` — event title (required)
- `--start <datetime>` — start time (ISO or natural language)
- `--duration <minutes>` — duration (default: 30)
- `--with <person-or-email>` — attendee (optional, uses person resolution)
- `--description <text>` — event description (optional)
- `--json` — output as JSON

**Date Parsing** (explicit scope — no chrono-node dependency):
Support these exact patterns:
- ISO dates: `2026-02-26T14:00:00`
- Simple keywords: `today`, `tomorrow`
- Day + time: `monday 2pm`, `tuesday 10am`
- Relative: `next monday`, `next week` (= next Monday 9am)

Test cases: `["tomorrow 2pm", "today", "next monday 10am", "2026-02-26T14:00:00"]`

**Timezone Handling**:
- Use `Intl.DateTimeFormat().resolvedOptions().timeZone` for user's local timezone
- Send ISO strings with explicit timezone offset to Google API
- Display times with timezone abbreviation: "Created event for **tomorrow 2pm CT**"

**Error Handling**:
- If `provider.createEvent` is undefined: "Event creation requires Google Calendar. Run: arete integration configure google-calendar"
- If person not found: "Could not find '[name]' in people/. Try: arete people list"
- If auth fails: "Google Calendar authentication failed — run: arete integration configure google-calendar"

**AC**:
- [ ] Command registered as `arete calendar create`
- [ ] Basic creation works: `arete calendar create --title "1:1" --with sarah --start "tomorrow 2pm"`
- [ ] Block time works: `arete calendar create --title "Focus time" --start "tomorrow 9am" --duration 120`
- [ ] Person resolution (name → email) works
- [ ] Date parsing handles specified patterns (no chrono-node)
- [ ] Times displayed with timezone abbreviation
- [ ] Graceful error messages for auth issues, person-not-found, invalid dates
- [ ] `--json` outputs structured response

---

### 3. Create `schedule-meeting` skill (v1 — simplified)

**Location**: `packages/runtime/skills/schedule-meeting/SKILL.md`

**Triggers**: "schedule a meeting", "book time with", "set up a call", "1:1 with", "find time with", "book a meeting"

**v1 Scope** (simplified per review feedback):
- Person → Availability → Pick slot → Create event
- **No** description drafting, context search, or agenda creation in v1
- These features deferred to v1.1

**Workflow**:

1. **Parse request** — extract person, time preference (default: today + 2 days)
2. **Resolve person** → email via entity resolution
3. **Find availability** — call FreeBusy, get slots in time window
4. **Present slots**:

```
Great! You and Jane are both available:

**A.** Today at 2pm CT
**B.** Tomorrow at 11am CT  
**C.** Tomorrow at 3pm CT

_Reply with a letter to book._
```

5. **Handle response** — case-insensitive, flexible ("a", "A", "a.")
6. **Create event** — call `arete calendar create` or provider directly
7. **Confirm**:
```
✓ Booked "1:1 with Jane" for today at 2pm CT (30 min)
  📅 [Calendar link]
```

**Time Frame Handling**:

| User says | Time window |
|-----------|-------------|
| "book a meeting with Jane" | Today + 2 days (default) |
| "book a meeting with Jane today" | Today only |
| "book a meeting with Jane tomorrow" | Tomorrow only |
| "book a meeting with Jane next week" | Mon-Fri of next week |

**Block Time** (simpler flow — no person, no FreeBusy):
- "Block 2 hours tomorrow afternoon for PRD writing"
- Creates event directly, no availability check needed

**Response Parsing Rules** (pre-mortem mitigation):
- Case-insensitive: "a" = "A"
- Trim whitespace and punctuation: "a." = "a"
- Invalid input → ask again with hint: "Please reply with A, B, or C"

**AC**:
- [ ] Routes for scheduling triggers
- [ ] Default time frame: today + 2 days
- [ ] Respects user time preferences: "today", "tomorrow", "next week"
- [ ] Simple letter response works: "A" books the slot
- [ ] Times always displayed with timezone
- [ ] Block time requests skip person/FreeBusy entirely
- [ ] Invalid responses handled gracefully (re-prompt)

**v1.1 Backlog** (not in scope):
- Context-aware description drafting ("about onboarding" searches workspace)
- Meeting agenda offer (integrate with `prepare-meeting-agenda`)
- "A, 1, 2" combined response format

---

### 4. Update documentation

**Files to update**:

| File | Changes |
|------|---------|
| `packages/runtime/GUIDE.md` | Add "Create Events" section under Calendar with examples |
| `.agents/sources/shared/cli-commands.md` | Add `arete calendar create` command |
| `packages/runtime/skills/README.md` | Add schedule-meeting skill to list |
| `packages/runtime/integrations/registry.md` | Note event creation capability |
| `packages/core/src/index.ts` | Export new types and function |
| `dev/catalog/capabilities.json` | Add `schedule-meeting` capability entry |

Then rebuild: `npm run build:agents:dev`

**Verification** (pre-mortem mitigation): After completion, run:
```bash
grep -r "calendar create" packages/runtime/ .agents/
```
All 5 documentation files should appear in results.

**AC**:
- [ ] GUIDE.md documents event creation and skill usage
- [ ] CLI reference includes new command with all options
- [ ] AGENTS.md rebuilt with new command
- [ ] Skills README lists schedule-meeting
- [ ] Integrations registry notes event creation capability
- [ ] `dev/catalog/capabilities.json` has `schedule-meeting` entry
- [ ] Grep verification passes

---

### 5. Tests

**Scope**: Core API + CLI tests. Skill routing tests are out of scope for v1 (skill is SKILL.md only, no code to test).

**Core API tests** (`packages/core/test/integrations/calendar/`):
- Unit tests for `createEvent()` using existing helpers (`makeMockStorage()`, `makeCredentialsYaml()`)
- Follow `FreeBusyDeps` pattern with `CreateEventDeps`
- Test cases: success, 401 error, 403 error, network error

**CLI tests** (`packages/cli/test/commands/`):
- Person resolution (name → email, email passthrough)
- Date parsing (all specified patterns)
- Timezone handling edge cases
- Error handling (auth failure, person not found)

**AC**:
- [ ] `npm test` passes
- [ ] `createEvent()` tests use existing `makeMockStorage()`, `makeCredentialsYaml()` helpers
- [ ] Tests cover: happy path, auth errors (401, 403), person-not-found, invalid dates
- [ ] Timezone edge cases tested (verify local time → correct UTC offset)

---

## Size Estimate

**Medium (5 tasks)**

## Dependencies

```
Task 1 (core API) → Task 2 (CLI) → Task 3 (skill)
                 ↘ Task 4 (docs)
Task 5 (tests) runs with Task 1 and Task 2
```

## Pre-Mortem Risks & Mitigations

| Risk | Severity | Mitigation | Applied To |
|------|----------|------------|------------|
| Fresh context missing patterns | High | Explicit file list in task prompts | Tasks 1, 2 |
| Test pattern mismatch | Medium | Reference existing helpers | Tasks 1, 5 |
| Date parsing scope creep | Medium | Explicit pattern list, no chrono-node | Task 2 |
| Time zone errors | High | Explicit timezone handling + display | Tasks 2, 3, 5 |
| Interface backward compat | Medium | Optional method pattern | Task 1 |
| Response format ambiguity | Low | Simple letter format for v1 | Task 3 |
| Doc update incomplete | Low | Explicit checklist + grep verify | Task 4 |

## Out of Scope (v1)

- Recurring events
- Multiple attendees (beyond 1:1)
- Event editing/deletion
- Meeting room booking
- Google Meet auto-add
- Description drafting from context (v1.1)
- Agenda creation offer (v1.1)
- "A, 1, 2" combined response format (v1.1)

---

## Council Summary

| Capability | Harvester | Architect | Preparer | v1 Decision |
|------------|-----------|-----------|----------|-------------|
| CLI command | Skip | Uses | Skip | **Included** |
| Skill (pick slot → book) | Required | Uses | Optional | **Required** |
| Block time | Optional | Uses | Uses | **Required** |
| Simple letter response | Required | Tolerates | Tolerates | **Required** |
| Context-aware description | Optional | Required | Uses | **v1.1** |
| Meeting agenda offer | Skip | Uses | Uses | **v1.1** |

---

## Review Concerns Addressed

1. ✅ **Skill complexity** — Simplified to single-round-trip for v1; description/agenda deferred to v1.1
2. ✅ **Capability registry** — Added to Task 4 AC
3. ✅ **CLI registration** — Clarified in Task 2 (new `calendar` command group)
4. ✅ **Test scope** — Explicitly scoped to core API + CLI; skill routing out of scope
5. ✅ **Response format** — Simplified to just letters ("A", "B", "C") for v1
6. ✅ **Workflow connection** — Skill integrates availability check and event creation seamlessly
