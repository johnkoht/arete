# Execute project-updates PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open project-updates
/build
```

## Manual (fallback)

Execute the project-updates PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/project-updates/prd.md` and the task list is at `dev/work/plans/project-updates/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Task Dependencies

```
Task A (general-project skill) ─────────────────────┐
                                                    │
Task B (research_intake pattern) ──┬── Task C ──────┼── Task D
                                   │                │
Task E (index checkpoints) ────────┴────────────────┘
                                                    
Task F (verify onboarding) ─────────────────────────
```

**Recommended execution order**:
1. Tasks A, B, E, F can start in parallel
2. Task C depends on B
3. Task D depends on A and B

## Key Files to Read Before Starting

- `packages/runtime/skills/PATTERNS.md` — existing patterns, add research_intake here
- `packages/runtime/skills/discovery/SKILL.md` — reference for skill structure
- `dev/work/plans/project-updates/pre-mortem.md` — 9 risks with mitigations
- `dev/work/plans/project-updates/notes.md` — glance-comms reference example
