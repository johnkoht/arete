# Execute publish-arete PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open publish-arete
/build
```

## Manual (fallback)

Execute the publish-arete PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/publish-arete/prd.md` and the task list is at `dev/work/plans/publish-arete/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
