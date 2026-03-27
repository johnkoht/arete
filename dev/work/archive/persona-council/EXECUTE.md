# Execute Persona Council PRD

Execute this PRD using the autonomous agent loop.

**Copy the prompt below into a new chat to begin:**

---

Execute the persona-council PRD. Load the execute-prd skill from `.agents/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/persona-council/prd.md` and the task list is at `dev/autonomous/prd.json`. Run the full workflow: pre-mortem → task execution loop → post-mortem.

Key risks to apply from `dev/plans/persona-council/pre-mortem.md`:
- PM agent section must stay ≤15 lines and use "offer" framing, not "always invoke"
- Evidence sections must be prominent and labeled as hypothesis-only
- No markdown tables in persona or instruction files
- Verify AGENTS.md rebuild with `grep -i "persona" AGENTS.md` after build step

---
