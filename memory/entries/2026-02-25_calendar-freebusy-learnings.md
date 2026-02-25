# Calendar FreeBusy Integration Learnings

**Date**: 2026-02-25
**PRD**: calendar-improvements
**Branch**: cal-updates

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt success | 5/6 (83%) |
| Iterations required | 1 (Task 5 test coverage) |
| Tests added | 59 |
| Total tests | 838 |
| Pre-mortem risks | 7 identified, 0 materialized |
| Commits | 6 |

---

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Applied | Effective |
|------|--------------|---------------------|-----------|
| FreeBusy response format mismatch | No | Yes | Yes |
| No fetch mocking pattern | No | Yes | Yes |
| Timezone edge cases | No | Yes | Yes |
| EntityService email gaps | No | Yes | Yes |
| Dependency confusion | No | Yes | Yes |
| Error handling inconsistency | No | Yes | Yes |
| ical-buddy provider crash | No | Yes | Yes |

**Conclusion**: All 7 mitigations were applied. Zero risks materialized. Pre-mortem investment was worthwhile.

---

## What Worked Well

1. **Pre-mortem → mitigations → verification loop**: Every risk had a specific mitigation that was verified during code review. This prevented all anticipated issues.

2. **Show-don't-tell in prompts**: Including exact API request/response structures (JSON examples) in task prompts eliminated ambiguity. The developer knew exactly what the API returned.

3. **DI pattern consistency**: Following the existing `deps?: { fetch? }` pattern from `listIcalBuddyCalendars()` made testing the FreeBusy method trivial. Pattern reuse > inventing new approaches.

4. **Reviewer pre-checks**: The reviewer caught the AC clarification for Task 1 (FreeBusy API returns HTTP 200 with per-calendar errors, not HTTP 403) before the developer started. This saved an iteration.

5. **Pure algorithm separation**: Making `findAvailableSlots` a pure utility (not a service) simplified testing and made the CLI integration straightforward.

---

## What Didn't Work

1. **Type exports missed in Task 2**: AC #6 said "Types exported from packages/core/src/index.ts" but this wasn't done. The developer noted it but proceeded. It was caught and fixed in Task 5, but should have been done in Task 2.

2. **Test coverage gap in Task 5**: The first implementation had 15 tests but missed 3 acceptance criteria (AC #5, #6, #7). The reviewer caught this and one iteration was needed.

**Pattern**: When ACs have error messages, there should be tests asserting those exact messages.

---

## Collaboration Observations

- Builder approved pre-mortem quickly, indicating confidence in the analysis
- Builder confirmed timezone approach (user's working hours only) before implementation
- Builder's example interaction ("tomorrow at 2:30 CT") clarified output format expectations

---

## Recommendations for Next PRD

### Continue

- Pre-mortem with specific mitigations per task
- Reviewer pre-work sanity checks
- Show-don't-tell with API examples
- DI patterns for testability

### Stop

- Assuming type exports happen implicitly (be explicit about barrel file updates)

### Start

- Adding a "test checklist" to AC-heavy tasks: "Every AC with an error message should have a test"
- Verifying exports are complete before marking type tasks as done

---

## Refactor Items

None identified.

---

## Files Changed Summary

| Package | Files Added | Files Modified |
|---------|-------------|----------------|
| @arete/core | 2 | 3 |
| @arete/cli | 2 | 1 |
| dev/catalog | 0 | 1 |
| dev/executions | 3 | 0 |

**New files**:
- `packages/core/src/utils/availability.ts` — availability algorithm
- `packages/core/test/utils/availability.test.ts` — 24 tests
- `packages/core/test/integrations/calendar/google-freebusy.test.ts` — 18 tests
- `packages/cli/src/commands/availability.ts` — CLI command
- `packages/cli/test/commands/availability.test.ts` — 18 tests
