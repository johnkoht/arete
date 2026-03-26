# Execute workspace-areas PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open create-areas
/build
```

## Manual (fallback)

Execute the workspace-areas PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/create-areas/prd.md` and the task list is at `dev/work/plans/create-areas/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
