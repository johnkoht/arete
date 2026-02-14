# Execute dev-cleanup-phase-1 PRD

Execute this PRD using the autonomous agent loop.

**Copy the prompt below into a new chat to begin:**

---

Execute the dev-cleanup-phase-1 PRD. Load the execute-prd skill from `dev/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/dev-cleanup-phase-1/prd.md` and the task list is at `dev/autonomous/prd.json`. Run the full workflow: pre-mortem → task execution loop → post-mortem.

---

## Important Notes

This is a **refactoring PRD** with high risk of stale references. The execute-prd orchestrator MUST:

1. **Before each task**: Provide subagent with path mapping context (what already moved, new paths)
2. **After each task**: Independently verify files moved, old paths gone, `rg` returns 0, tests pass
3. **Between tasks**: Commit completed work, update progress.txt

See PRD Section 2 "CRITICAL: Orchestrator Instructions" for detailed protocols.

## Artifacts

- **PRD**: `dev/prds/dev-cleanup-phase-1/prd.md`
- **Task list**: `dev/autonomous/prd.json` (15 tasks)
- **Progress log**: `dev/autonomous/progress.txt`
- **Skill**: `dev/skills/execute-prd/SKILL.md`
