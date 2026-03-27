# Execute commitments-service PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open leverage-intelligence
/build
```

## Manual (fallback)

Execute the commitments-service PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/work/plans/leverage-intelligence/prd.md` and the task list is at `dev/work/plans/leverage-intelligence/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

## Task Sequence

Tasks must be executed in order (each depends on the previous):

1. `task-1` — LLM-based commitment extraction (person-signals.ts)
2. `task-2` — Wire LLM extraction into refresh pipeline (entity.ts)
3. `task-3` — Update tests for async LLM extraction
4. `task-4` — Commitments data model and storage types (models/)
5. `task-5` — CommitmentsService + factory.ts wiring ← **prerequisite for 6, 7, 8**
6. `task-6` — Bidirectional sync via person memory checkboxes
7. `task-7` — CLI — arete commitments commands
8. `task-8` — Update planning skills

## Key Context for Execution

- **Riskiest task**: Task 6 (bidirectional sync). Hash embedding `<!-- h:XXXXXXXX -->` in rendered format is critical — verify renderPersonMemorySection() emits comments and parser reads them correctly before proceeding to Task 7.
- **Factory wiring** (Task 5): CommitmentsService must appear in AreteServices type and factory.ts before Task 7 CLI work begins. Verify with `grep CommitmentsService packages/core/src/factory.ts`.
- **callLLM fallback** (Tasks 1+2): When callLLM is not provided, regex extraction must run — not return empty. Test this explicitly.
- **CLI write command** (Task 7): `arete commitments resolve` writes to disk — needs `--skip-qmd`, `loadConfig()`, `refreshQmdIndex()`, `displayQmdResult()`. Follow `update.ts` as the canonical complete pattern.
- **PATTERNS.md ripple** (Task 8): prepare-meeting-agenda inherits the get_meeting_context step 6 change. The empty-CommitmentsService fallback ensures graceful degradation — confirm this is in place.

## Branch

`feature/commitments-service`
