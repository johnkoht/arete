# Execute plan-and-backlog-ux-updates PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open plan-and-backlog-ux-updates
/build
```

## Manual (fallback)

Execute the plan-and-backlog-ux-updates PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/plan-and-backlog-ux-updates/prd.md` and the task list is at `dev/work/plans/plan-and-backlog-ux-updates/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Key Notes for Orchestrator

- **Pre-mortem risks 1 and 5 are HIGH priority** — see prd.md § 3 for details
- **Extra reviewer pass required** after holistic review — see prd.md § 5 "Extra End-of-Build Review"
- **Suggested execution order**: A1 → A2 → A3 → A4 → A6 → A5 → A7 → A8
- Pre-mortem analysis is at `dev/work/plans/plan-and-backlog-ux-updates/pre-mortem.md`
