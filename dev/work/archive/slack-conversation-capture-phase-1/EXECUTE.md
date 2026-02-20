# Execute slack-integration PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open slack-integration
/build
```

## Manual (fallback)

Execute the slack-integration PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/slack-conversation-capture-phase-1/prd.md` and the task list is at `dev/work/plans/slack-conversation-capture-phase-1/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
