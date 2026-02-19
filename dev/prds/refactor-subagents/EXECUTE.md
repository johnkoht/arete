# Execute refactor-subagents PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open refactor-subagents
/build
```

> **Note**: The `/build` command auto-generates the execution prompt. After this refactor completes, `/build` will use the new paths (`dev/plans/<slug>/prd.json` instead of `dev/autonomous/prd.json`).

## Manual (fallback)

If `/build` doesn't work or you prefer manual execution, paste this into a Pi session:

---

Execute the refactor-subagents PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/refactor-subagents/prd.md` and the task list is at `dev/plans/refactor-subagents/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.

Pre-mortem analysis is already complete at `dev/plans/refactor-subagents/pre-mortem.md` — read and apply those mitigations rather than regenerating.

Key context:
- `pi-subagents` is already installed and verified working with project-level agents
- This is a refactor of the BUILD workflow only — no GUIDE/runtime changes
- The worktree for this work already exists (you're in it)
- All changes are to skill files (.md), agent definitions (.md), extension TypeScript (.ts), rules (.mdc), and documentation — includes TypeScript code changes in plan-mode extension
- Post-execution checklist (E2E validation) is builder-driven and happens after tasks 1-6 complete

---

## Post-Execution Checklist

After tasks 1-6 are complete, the builder validates end-to-end:

- [ ] Create a small test PRD (2-3 tasks)
- [ ] `wt new test-validation` → worktree created
- [ ] Execute test PRD in worktree with new execute-prd skill
- [ ] Developer subagent uses `subagent` tool, works in worktree, writes to `dev/executions/`
- [ ] Reviewer subagent returns APPROVED/ITERATE verdict
- [ ] `dev/executions/test-validation/status.json` exists
- [ ] Commits on worktree branch, tests pass
- [ ] Cleanup: `wt done test-validation`
