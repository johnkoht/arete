# Execute agent-experts PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open agent-experts
/build
```

## Manual (fallback)

Execute the agent-experts PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/agent-experts/prd.md` and the task list is at `dev/work/plans/agent-experts/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
