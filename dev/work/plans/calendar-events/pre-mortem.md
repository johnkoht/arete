# Pre-Mortem: Calendar Event Creation

## Risk 1: Fresh Context = Missing Google Calendar Patterns

**Problem**: Tasks 1-2 (core API, CLI) need to extend the Google Calendar provider. A fresh agent context won't know about:
- Existing `googleFetch()` helper with auto-refresh
- Error handling patterns (401 → auth message, 403 → permission)
- `FreeBusyDeps` injection pattern for testability
- 5-field credential storage pattern

**Mitigation**: In task prompts, explicitly list files to read first:
- `packages/core/src/integrations/calendar/google-calendar.ts` (existing provider, googleFetch helper)
- `packages/core/src/integrations/calendar/google-auth.ts` (credential loading)
- `packages/core/src/integrations/LEARNINGS.md` (integration patterns)
- `packages/core/test/integrations/calendar/google-calendar.test.ts` (test patterns)

**Verification**: Check task prompt includes "read these files first" with the above paths.

---

## Risk 2: Test Pattern Mismatch

**Problem**: Existing Google Calendar tests use specific patterns:
- `makeMockStorage()` for credential injection
- `makeCredentialsYaml()` for test fixtures
- Global `fetch` mocking via `mock.fn()`
- `FreeBusyDeps` injection for isolating fetch calls

A fresh agent might invent different patterns, causing inconsistent test code or flaky tests.

**Mitigation**: 
- In Task 1 prompt: "Follow test patterns from `google-calendar.test.ts` — use `makeMockStorage()`, `makeCredentialsYaml()`, and the `FreeBusyDeps` injection pattern for `createEvent()`"
- Add `CreateEventDeps` interface matching `FreeBusyDeps` pattern

**Verification**: Review test file after Task 1 — it should import/use existing helpers, not create new ones.

---

## Risk 3: Natural Language Date Parsing Scope Creep

**Problem**: Plan calls for "natural language date parsing" (`--start "tomorrow 2pm"`). Options:
1. **chrono-node**: Full NLP parsing — adds ~500KB dependency, complex edge cases
2. **Simple patterns**: Just handle "tomorrow", "today", "next week" + ISO

Agent might over-engineer with chrono-node when simple patterns suffice, or under-engineer and break on reasonable inputs.

**Mitigation**: 
- Explicit scope in Task 2: "Support these exact patterns: ISO dates, 'today', 'tomorrow', 'next week', '{day} {time}' (e.g., 'monday 2pm'). Do NOT add chrono-node dependency."
- Provide test cases in prompt: `["tomorrow 2pm", "today", "next monday 10am", "2026-02-26T14:00:00"]`

**Verification**: Check `package.json` has no new dependencies; check date parsing handles exactly the specified patterns.

---

## Risk 4: Time Zone Handling Errors

**Problem**: User types "tomorrow 2pm" expecting local time. Google Calendar API accepts ISO strings with timezone. Mishandling could:
- Create events at wrong time (UTC vs local)
- Fail silently on timezone edge cases
- Behave differently across user machines

**Mitigation**:
- Use `Intl.DateTimeFormat().resolvedOptions().timeZone` to get user's local timezone
- Always send ISO strings with explicit timezone offset to Google API
- In skill output, always show timezone: "Tuesday 2pm **CT**" (not just "2pm")
- Add test cases for timezone edge cases in Task 5

**Verification**: Test manually by creating an event; verify it appears at correct local time in Google Calendar.

---

## Risk 5: CalendarProvider Interface Backward Compatibility

**Problem**: Adding `createEvent()` to `CalendarProvider` interface. Existing providers (ical-buddy) don't have this method. Breaking the interface could:
- Fail typecheck on existing code
- Require changes to ical-buddy provider (out of scope)

**Mitigation**:
- Make `createEvent()` an **optional method** (like `getFreeBusy?`): 
  ```typescript
  createEvent?(input: CreateEventInput): Promise<CreatedEvent>;
  ```
- CLI and skill must check `if (provider.createEvent)` before calling
- Error message when not supported: "Event creation requires Google Calendar. Run: arete integration configure google-calendar"

**Verification**: `npm run typecheck` passes; ical-buddy provider unchanged; CLI handles missing method gracefully.

---

## Risk 6: Skill Response Format Ambiguity

**Problem**: Skill uses novel response format: "Reply 'A' to book, or 'A, 1, 2' for full package". Agent might:
- Not parse user responses correctly (e.g., "a" vs "A", "A,1,2" vs "A, 1, 2")
- Over-complicate with regex when simple matching suffices
- Fail silently on unexpected input

**Mitigation**:
- In skill SKILL.md, explicitly define parsing rules:
  - Case-insensitive: "a" = "A"
  - Flexible spacing: "A,1,2" = "A, 1, 2" = "A 1 2"
  - Invalid input → ask again (don't fail silently)
- Include examples of valid/invalid responses in the skill file

**Verification**: Test skill manually with various response formats; verify graceful handling.

---

## Risk 7: Documentation Update Incomplete

**Problem**: Plan lists 5 files to update. Easy to miss one, especially:
- `packages/runtime/integrations/registry.md` (often forgotten)
- Rebuilding AGENTS.md (`npm run build:agents:dev`)
- Skills README listing

**Mitigation**:
- Task 4 acceptance criteria includes explicit checklist
- Final verification step: `grep -r "calendar create" packages/runtime/ .agents/` to confirm all docs reference the new command

**Verification**: Run the grep command after Task 4; all 5 files should appear in results.

---

## Risk 8: Skill Context Search Quality

**Problem**: Skill says "about onboarding" should search workspace context. The current search implementation might:
- Return irrelevant results
- Return nothing (if no "onboarding" content exists)
- Be slow if workspace is large

Agent might over-engineer the search or skip it entirely.

**Mitigation**:
- Skill should use existing `arete context --for "onboarding"` CLI (already tested)
- If no results, gracefully continue without context (don't block)
- In skill file: "Context search is best-effort. If no results, proceed without context enrichment."

**Verification**: Test skill with a topic that exists and one that doesn't; verify both paths work.

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Context Gaps, Test Patterns, Scope Creep, Platform Issues, Integration, Code Quality, Dependencies, State Tracking

| Risk | Category | Severity | Mitigation |
|------|----------|----------|------------|
| Fresh context missing patterns | Context Gaps | High | Explicit file list in prompts |
| Test pattern mismatch | Test Patterns | Medium | Reference existing helpers |
| Date parsing scope creep | Scope Creep | Medium | Explicit pattern list, no chrono-node |
| Time zone errors | Platform Issues | High | Explicit timezone handling + display |
| Interface backward compat | Integration | Medium | Optional method pattern |
| Response format ambiguity | Code Quality | Low | Parsing rules in skill file |
| Doc update incomplete | Dependencies | Low | Explicit checklist + grep verify |
| Context search quality | Integration | Low | Graceful degradation |

---

## Mitigations Applied To

These mitigations should be incorporated into task prompts during PRD creation:

- **Task 1**: Risks 1, 2, 5
- **Task 2**: Risks 1, 3, 4
- **Task 3**: Risks 6, 8
- **Task 4**: Risk 7
- **Task 5**: Risks 2, 4
