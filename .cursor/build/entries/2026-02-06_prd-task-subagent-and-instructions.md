# PRD-task subagent and enriched instructions

**Date**: 2026-02-06

## What changed

- **Custom subagent**: Added `.cursor/agents/prd-task.md` so the execute-prd orchestrator can run each PRD task in a fresh context window. Cursor exposes files in `.cursor/agents/` as tools the main Agent can invoke (see [Cursor Subagents](https://cursor.com/docs/context/subagents)); usage-based plans (e.g. Cursor Plus) have subagents on by default.
- **Execute-prd skill**: Step 3 now prefers invoking the **prd-task** subagent and passing it the full task prompt; fallback remains same-agent execution when no subagent tool is available. Prerequisites note the preferred path.
- **Autonomous README**: Noted that `.cursor/agents/prd-task.md` gives fresh context per task; added "Cursor subagents" paragraph under "Fresh Context Per Task" with links to Cursor docs and Max Mode for legacy plans.
- **Subagent instructions**: Enriched `prd-task.md` with:
  - **Context**: progress.txt.template for entry format; .cursor/rules/dev.mdc and testing.mdc for conventions.
  - **Run location**: All npm commands from repository root.
  - **Workspace-structure**: When editing workspace-structure.ts, only add; never overwrite or remove existing WORKSPACE_DIRS/DEFAULT_FILES entries.
  - **Scope**: Modify only files needed for this task; in prd.json edit only this task's object (passes, status, commitSha).
  - **Git**: Stay on current branch; no destructive git (reset --hard, force push).
  - **Failure**: After 3 failed quality-check attempts, set status "failed" and task.notes, then return failure message.
  - **Python**: If task touches scripts/integrations/, also run `npm run test:py`.

## Why

User wanted subagents used for each task (fresh context) and asked what else to give the subagent. Cursor supports custom subagents via `.cursor/agents/`; we added the prd-task subagent and documented it. Then we added conventions, repo-root, workspace-structure rule, git safety, and failure handling so the subagent has clear guardrails and context without relying on the parent prompt alone.

## References

- Subagent file: `.cursor/agents/prd-task.md`
- Execute-prd skill: `.cursor/build/autonomous/skills/execute-prd/SKILL.md`
- Autonomous README: `.cursor/build/autonomous/README.md`
- Cursor Subagents: https://cursor.com/docs/context/subagents
