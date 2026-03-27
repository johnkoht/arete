# Execute plan-lifecycle-system PRD

Execute this PRD using the autonomous agent loop.

**Copy the prompt below into a new chat to begin:**

---

Execute the plan-lifecycle-system PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/plan-lifecycle-system/prd.md` and the task list is at `dev/autonomous/prd.json`. Run the full workflow: pre-mortem → task execution loop → post-mortem.

**Key context for the Orchestrator:**

- This PRD builds a plan lifecycle system into the existing Pi plan-mode extension at `.pi/extensions/plan-mode/`
- The extension currently has `index.ts` and `utils.ts` — this PRD refactors it into a multi-file module (persistence.ts, lifecycle.ts, agents.ts, commands.ts, widget.ts + existing utils.ts)
- Pi extensions use jiti (no build step) — TypeScript files are loaded directly
- The extension uses Pi's ExtensionAPI: `pi.registerCommand()`, `pi.registerTool()`, `pi.on()`, `pi.sendUserMessage()`, `pi.setModel()`, `pi.setActiveTools()`, `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.notify()`, `ctx.ui.setStatus()`, `ctx.ui.setWidget()`
- Agent definitions live in `.pi/agents/` as markdown files with YAML frontmatter
- Agent model config goes in `.pi/settings.json`
- Plans persist to `dev/plans/{slug}/plan.md` with YAML frontmatter
- Existing skills (run-pre-mortem, review-plan, plan-to-prd, execute-prd) are invoked via `pi.sendUserMessage('/skill:name ...')`
- Tests use `node:test` + `node:assert/strict`, run via `tsx --test`
- Quality gates: `npm run typecheck && npm test` after every task

---
