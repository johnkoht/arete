# Execute calendar-improvements PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open calendar-improvements
/build
```

## Manual (fallback)

Execute the calendar-improvements PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/calendar-improvements/prd.md` and the task list is at `dev/work/plans/calendar-improvements/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Quick Reference

**Goal**: Enable users to find mutual availability with colleagues via FreeBusy API

**Tasks** (6 total):
1. Add FreeBusy method to Google Calendar provider
2. Add FreeBusy to CalendarProvider interface  
3. Create availability-finding algorithm
4. Verify person resolution works for availability
5. Add CLI command for availability
6. Update capability registry

**Dependencies**:
- Task 3 depends on: Task 2
- Task 5 depends on: Task 3, Task 4
- Task 6 depends on: Task 5

**Parallel execution possible**:
- Tasks 1, 2, 4 can run in parallel (independent)

**Key files to read before starting**:
- `packages/core/src/integrations/LEARNINGS.md`
- `packages/core/src/services/LEARNINGS.md`
- `scripts/test-freebusy.ts` (validated API approach)

**Pre-mortem**: `dev/work/plans/calendar-improvements/pre-mortem.md` (7 risks identified)

**High-severity risks**:
- Timezone edge cases (Risk 3)
- ical-buddy provider crash (Risk 7)
