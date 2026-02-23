# Execute google-calendar-provider PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open google-calendar-provider
/build
```

## Manual (fallback)

Execute the google-calendar-provider PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/google-calendar-provider/prd.md` and the task list is at `dev/work/plans/google-calendar-provider/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Current State

Tasks 1-3 are **complete** (committed). Task 4 has **uncommitted implementation and tests** that typecheck and pass — review and commit first. Tasks 5-7 are pending.
