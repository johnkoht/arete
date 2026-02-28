# Execute calendar-events PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open calendar-events
/build
```

## Manual (fallback)

Execute the calendar-events PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/calendar-events/prd.md` and the task list is at `dev/work/plans/calendar-events/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Key Pre-Mortem Mitigations

These mitigations from the pre-mortem should be applied during execution:

1. **Tasks 1, 2**: Read the file lists in task descriptions before starting. Don't skip the context loading.
2. **Task 1**: Use `CreateEventDeps` pattern matching `FreeBusyDeps`. Use existing test helpers.
3. **Task 2**: No chrono-node — use the explicit date parsing patterns listed. Display timezone always.
4. **Task 3**: Keep it simple — v1 is just pick-slot-and-book. No description drafting or agenda offers.
5. **Task 4**: Run the grep verification at the end to confirm all docs updated.
6. **Task 5**: Follow existing test patterns. Test timezone edge cases explicitly.

## Artifacts

- **PRD**: `dev/work/plans/calendar-events/prd.md`
- **Task list**: `dev/work/plans/calendar-events/prd.json`
- **Pre-mortem**: `dev/work/plans/calendar-events/pre-mortem.md`
- **Review**: `dev/work/plans/calendar-events/review.md`
- **Plan**: `dev/work/plans/calendar-events/plan.md`
