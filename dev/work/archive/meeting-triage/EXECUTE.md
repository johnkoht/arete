# Execute Meeting Minder PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open meeting-triage
/build
```

## Manual (fallback)

Execute the meeting-minder PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/meeting-triage/prd.md` and the task list is at `dev/work/plans/meeting-triage/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Key context for the executing agent

- **Lovable prototype repo**: https://github.com/johnkoht/meeting-minder (React + Vite + TypeScript + shadcn/ui + React Router v6 + TanStack Query + Vitest)
- **Pre-mortem**: `dev/work/plans/meeting-triage/pre-mortem.md` — read before starting, 7 risks with mitigations
- **Plan notes**: `dev/work/plans/meeting-triage/notes.md` — full design context, API spec, data model
- **Riskiest task**: Task 4 (Pi SDK agent integration) — if Anthropic API key is not configured in the dev environment, the process endpoint needs to handle this gracefully (503 + helpful message), not crash
- **Second riskiest**: Task 2 staged-items parser — the format written by the AI skill and parsed by the server must match exactly. The SKILL.md update (Task 6) and the parser (Task 2) must use the same ID format: ai_001, de_001, le_001
- **Task ordering is strict**: 1 → 2 → 3 → 4 → 5; Task 6 can run in parallel with 3-5; Task 7 after Task 3
