# Pre-Mortem: Calendar FreeBusy Integration

**Plan**: Calendar FreeBusy Integration  
**Date**: 2026-02-24  
**Status**: Draft → Ready for execution

---

## Risk 1: FreeBusy API Response Format Mismatch

**Problem**: The FreeBusy API returns `primary` as a key for the user's calendar, but target emails as-is. The test script shows this works, but the availability algorithm needs to handle this consistently. If the `FreeBusyResult` type doesn't account for this, the algorithm will fail to find the user's busy blocks.

**Mitigation**: 
- In `getFreeBusy()`, normalize the response: always include a `userCalendar` property separate from `calendars[email]`
- Type definition should be `{ userBusy: BusyBlock[], calendars: Record<string, { busy: BusyBlock[], accessible: boolean }> }`
- Unit test must cover both `primary` → userBusy mapping and email → calendars mapping

**Verification**: Test includes assertion that `result.userBusy` is populated when `primary` has busy blocks.

---

## Risk 2: Missing Test Patterns for Mocking Google API Fetch

**Problem**: Existing calendar tests (`calendar.test.ts`) only test `getCalendarProvider()` config parsing. They don't mock the Google API fetch calls. The FreeBusy method will need fetch mocking, but there's no established pattern.

**Mitigation**:
- Check `packages/core/test/integrations/calendar/` for any existing fetch mocking patterns
- If none exist, reference `krisp.test.ts` which likely has MCP/API mocking patterns
- Use `node:test` mock.fn() for fetch, or dependency injection pattern like `listIcalBuddyCalendars()` uses `deps` param
- Follow `LEARNINGS.md` pattern: `listIcalBuddyCalendars()` uses DI for testability

**Verification**: New tests use DI pattern (`deps?: { fetch? }`) matching ical-buddy pattern.

---

## Risk 3: Availability Algorithm Timezone Edge Cases

**Problem**: The algorithm converts busy blocks to free slots. If busy blocks are in UTC and working hours are in local time, the intersection logic could produce wrong results. Edge cases: DST transitions, user in different timezone than target.

**Mitigation**:
- All times should be converted to user's local timezone before slot calculation
- Working hours (9am-5pm) are interpreted as local time
- Document timezone handling in availability.ts header comment
- Add unit test for: user in PST, target in EST, both have meetings at "9am local"

**Verification**: Test explicitly sets up cross-timezone scenario and asserts correct slot output.

---

## Risk 4: EntityService Email Resolution Gaps

**Problem**: Step 4 assumes `EntityService.resolve()` returns email in `metadata.email`. If the person file doesn't have an email field, or if multiple matches exist (disambiguation), the CLI will fail with an unclear error.

**Mitigation**:
- Before Step 5, verify: `resolveEntity('Jamie', 'person', paths)` returns `{ metadata: { email: '...' } }`
- Add explicit check in CLI: if no email in metadata, show "Jamie found but no email on file — add email to people/internal/jamie.md"
- For disambiguation: if score < 90, show top matches and ask user to be more specific

**Verification**: CLI test includes case where person exists but has no email field — error message is helpful.

---

## Risk 5: Task Dependency Confusion from Parallelization Note

**Problem**: The plan says Steps 1-2 can run in parallel with Step 4. But Step 5 depends on Steps 1, 2, 3, AND 4. If an executor starts Step 5 before Step 3 is done, it will fail.

**Mitigation**:
- Clarify in plan: "Steps 1-2 || Step 4 (parallel), then Step 3 (depends on 1-2), then Step 5 (depends on 3 + 4)"
- Or simplify: renumber so the order is linear and obvious
- In PRD (if created), use explicit dependency notation: `task_id: [depends_on]`

**Verification**: Plan or PRD has explicit dependency graph, not just a parallelization hint.

---

## Risk 6: FreeBusy Error Handling Inconsistency

**Problem**: `LEARNINGS.md` says calendar providers "never throw from the factory when the dependency is simply absent." But FreeBusy can fail for specific calendars (403 permission denied, 404 not found). If we throw on these, we break the pattern. If we swallow them, we might hide real errors.

**Mitigation**:
- Follow existing pattern: per-calendar `accessible: false` flag with error reason
- Return `{ accessible: false, error: 'Permission denied for jamie@example.com' }` — don't throw
- Only throw for infrastructure errors (network failure, auth expired)
- Map Google API errors per `LEARNINGS.md` § Google Calendar Integration (401 → re-auth, 403 → permission, etc.)

**Verification**: Unit test mocks a 403 response for one calendar — returns `{ accessible: false }`, doesn't throw.

---

## Risk 7: ical-buddy Provider Gets FreeBusy Method Call

**Problem**: The plan adds `getFreeBusy` as optional on `CalendarProvider`. If CLI calls `provider.getFreeBusy()` without checking whether the provider implements it, ical-buddy users get `TypeError: undefined is not a function`.

**Mitigation**:
- In CLI availability command: check `if (!provider.getFreeBusy)` before calling
- Show helpful error: "Availability checking requires Google Calendar. Run: arete integration configure google-calendar"
- Type should be `getFreeBusy?: (...)` (optional method)

**Verification**: CLI test covers ical-buddy provider case — shows helpful error, not crash.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | FreeBusy response format mismatch | Integration | Medium |
| 2 | No fetch mocking pattern | Test Patterns | Medium |
| 3 | Timezone edge cases | Integration | High |
| 4 | EntityService email gaps | Integration | Medium |
| 5 | Dependency confusion | Dependencies | Low |
| 6 | Error handling inconsistency | Code Quality | Medium |
| 7 | ical-buddy provider crash | Platform | High |

**Total risks identified**: 7  
**Categories covered**: Integration (3), Test Patterns (1), Code Quality (1), Dependencies (1), Platform (1)

---

## Execution Checklist

Before each task, reference this pre-mortem:

- [ ] **Task 1 (FreeBusy method)**: Apply mitigations 1, 2, 6
- [ ] **Task 2 (CalendarProvider interface)**: Apply mitigation 7
- [ ] **Task 3 (Availability algorithm)**: Apply mitigations 1, 3
- [ ] **Task 4 (Person resolution verify)**: Apply mitigation 4
- [ ] **Task 5 (CLI command)**: Apply mitigations 4, 7

---

## Post-Execution

After completion, fill in:

| Risk | Materialized? | Mitigation Applied? | Effective? | Notes |
|------|--------------|---------------------|-----------|-------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
