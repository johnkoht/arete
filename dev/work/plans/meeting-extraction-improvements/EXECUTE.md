# Execute meeting-extraction-improvements PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open meeting-extraction-improvements
/build
```

## Manual (fallback)

Execute the meeting-extraction-improvements PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/meeting-extraction-improvements/prd.md` and the task list is at `dev/work/plans/meeting-extraction-improvements/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Execution Notes

### Expertise Profiles to Include

When spawning developer subagents for core or CLI tasks, inject the relevant expertise profile:

- **Core tasks (1-9, 11)**: Include content from `.pi/expertise/core/PROFILE.md`
- **CLI tasks (10)**: Include content from `.pi/expertise/cli/PROFILE.md`

Key invariants to inject:
- Services never import `fs` directly — use `StorageAdapter`
- `createServices()` is the only wiring point
- New services must be wired in `factory.ts`
- CLI commands follow: `createServices() → findRoot() → guard → service → format`

### Pre-Mortem Critical Risks

Address these before execution:
1. **Risk 2** (High): Define `PriorItem` type early (Task 4) and enforce import-not-recreate in reviews
2. **Risk 9** (High): Build explicit file-reading prompts for Tasks 7-7a-8-9

### Phased Execution

Phases can be parallelized:
- **Phase 1** (Tasks 1-3): Performance fixes — can start immediately
- **Phase 2** (Tasks 4-6): Dedup infrastructure — can start after Phase 1 or in parallel
- **Phase 3** (Tasks 7-9): Area context — can run parallel with Phase 2
- **Phase 4** (Tasks 10-12): Batch orchestration — depends on Phase 2 completion
