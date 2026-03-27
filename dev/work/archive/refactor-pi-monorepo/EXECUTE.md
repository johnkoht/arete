# Execute monorepo-intelligence-refactor PRD

Execute this PRD using the autonomous agent loop.

**Copy the prompt below into a new chat to begin:**

---

Execute the monorepo-intelligence-refactor PRD. Load the execute-prd skill from `.agents/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/refactor-pi-monorepo/prd.md`, the task list is at `dev/prds/refactor-pi-monorepo/prd.json`, and the pre-mortem is at `dev/prds/refactor-pi-monorepo/pre-mortem.md`. Run the full workflow: pre-mortem review → task execution loop → post-mortem.

Key context for the executing agent:
- This is a 7-phase, 18-task full rewrite refactoring Arete into a monorepo (core, cli, runtime) with intelligence layer enhancements.
- The pre-mortem has 9 risks with specific mitigations baked into each task description. Review pre-mortem.md before each task and apply relevant mitigations.
- **Risk 1 is critical**: Do not break the existing build during migration. The old src/ and runtime/ must continue working until Phase 7 cleanup.
- Record the pre-migration test count (`npm test 2>&1 | grep "tests"`) before starting Phase 3. This baseline is referenced in multiple acceptance criteria.
- Execution blocks: Phases 1-3 (foundation), Phases 4-5 (reconnect), Phase 6 (intelligence), Phase 7 (cleanup). Each block ends with a testable, working state.
- Progress tracking: Update `dev/prds/refactor-pi-monorepo/progress.txt` after each task.

---
