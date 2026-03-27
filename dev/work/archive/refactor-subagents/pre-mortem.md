# Pre-Mortem: Refactor Subagents (Pi Subagents + Worktree Isolation)

**Date**: 2026-02-19
**Plan**: `dev/plans/refactor-subagents/plan.md`
**Size**: Large (7 steps)
**Work type**: Refactor of core build workflow

---

### Risk 1: Worktree Agent Scope — `.pi/agents/` May Not Be Discovered

**Problem**: The `pi-subagents` extension discovers project-level agents by walking up from `cwd` looking for `.pi/agents/`. When running in a worktree (`~/code/arete-worktrees/arete--feature-x/`), the `.pi/` directory exists there because worktrees share the git index but have their own working directory. However, `.pi/` is a committed directory — so it WILL be present in the worktree. But if the subagent's `cwd` differs from the orchestrator's `cwd` (e.g., the subagent spawns in a subdirectory), discovery could fail.

**Mitigation**: 
- Verify during Step 1 validation (already done) that `agentScope: "project"` works from the worktree root
- In execute-prd skill, always pass the worktree root as `cwd` to subagent calls (not a subdirectory)
- Add an explicit note in the skill: "All subagent calls must use the worktree root as cwd"

**Verification**: In E2E validation (Step 7), confirm the developer subagent discovers and loads `.pi/agents/developer.md` from the worktree.

---

### Risk 2: Blast Radius — 6 Skills + 3 Agent Definitions Reference `dev/autonomous/`

**Problem**: The refactor touches more files than the plan's 7 steps suggest. Based on investigation, these files all reference `dev/autonomous/`:

| File | References |
|------|-----------|
| `.agents/skills/execute-prd/SKILL.md` | `dev/autonomous/prd.json`, `progress.txt`, Task tool |
| `.agents/skills/prd-to-json/SKILL.md` | Output to `dev/autonomous/prd.json`, `progress.txt` init |
| `.agents/skills/plan-to-prd/SKILL.md` | `dev/autonomous/prd.json`, handoff prompt, schema.ts |
| `.agents/skills/prd-post-mortem/SKILL.md` | `dev/autonomous/prd.json`, `progress.txt` |
| `.agents/skills/run-pre-mortem/SKILL.md` | `dev/autonomous/templates/` |
| `.cursor/rules/plan-pre-mortem.mdc` | `dev/autonomous/templates/`, `PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md` |
| `.pi/agents/developer.md` | `dev/autonomous/prd.json`, `progress.txt` |

Missing even one of these creates an inconsistent system where some skills point to old paths and others to new.

**Mitigation**:
- Before starting Step 3, create a complete grep-verified inventory of ALL files referencing `dev/autonomous/`
- Use that inventory as a checklist during Step 5 (update supporting skills)
- After Step 5, re-run the grep to confirm zero remaining references (except deprecated files marked in Step 6)
- Add this grep command to the skill's post-completion verification: `grep -r "dev/autonomous" .agents/ .pi/ .cursor/rules/ --include="*.md" --include="*.mdc"`

**Verification**: Post-Step 5 grep returns zero hits in active (non-deprecated) files.

---

### Risk 3: Skill Self-Reference Loop — execute-prd Skill References Itself

**Problem**: The execute-prd skill contains the full workflow including subagent prompt templates. The orchestrator (main agent) loads the skill and follows it. But the skill currently says "Spawn Task subagent with `subagent_type: generalPurpose`" — a Cursor-specific pattern. If we rewrite the skill to reference the `subagent` tool, the orchestrator needs to understand: (a) the `subagent` tool is available, (b) how to call it with the right params, and (c) that project agents exist. If the skill instructions are ambiguous about HOW to call the subagent tool, the orchestrator may hallucinate parameters.

**Mitigation**:
- In the refactored SKILL.md, include a concrete, copy-pasteable example of the subagent tool call with all parameters:
  ```
  subagent({ agent: "developer", task: "...", agentScope: "project" })
  ```
- Include a "Tool Reference" section at the top of the skill documenting the exact tool signature
- Test the orchestrator's understanding by running Step 7 E2E validation with a real PRD

**Verification**: Step 7 E2E validation — orchestrator correctly calls `subagent` tool with right params on first attempt.

---

### Risk 4: State Schema Mismatch — `dev/executions/` vs `dev/autonomous/schema.ts`

**Problem**: The current `dev/autonomous/schema.ts` defines `PRD` and `Task` types used by `prd-to-json` to generate `prd.json`. The plan introduces `dev/executions/<slug>/status.json` as a new artifact, but doesn't define its schema. If we add `status.json` without a schema, different runs may produce inconsistent state files, and resume logic becomes unreliable.

**Mitigation**:
- In Step 2, define `status.json` schema explicitly (either as TypeScript types or as a documented JSON structure in the plan)
- Proposed minimal schema:
  ```json
  {
    "planSlug": "feature-x",
    "status": "running|paused|blocked|completed|failed",
    "startedAt": "ISO timestamp",
    "updatedAt": "ISO timestamp",
    "currentTaskId": "task-3",
    "completedTasks": 2,
    "totalTasks": 5,
    "worktree": { "path": "/abs/path", "branch": "feature-x" }
  }
  ```
- Keep `prd.json` format unchanged (same schema.ts) — just copy it to `dev/executions/<slug>/`
- Do NOT create a programmatic state machine in V1 — the schema is documentation for the orchestrator agent to follow

**Verification**: Step 2 AC includes the schema definition; Step 7 validates `status.json` matches schema after a run.

---

### Risk 5: Progress File Location Confusion — Subagents Write to Wrong Path

**Problem**: The developer subagent's system prompt (`.pi/agents/developer.md`) currently says to update `dev/autonomous/prd.json` and `dev/autonomous/progress.txt`. After the refactor, it should update `dev/executions/<plan-slug>/prd.json` and `dev/executions/<plan-slug>/progress.md`. But the subagent doesn't know what `<plan-slug>` is unless the orchestrator tells it explicitly in the task prompt. If the orchestrator forgets to include the execution path, the subagent will either write to the old location or fail.

**Mitigation**:
- In the refactored developer agent definition (Step 4), remove ALL hardcoded paths to `dev/autonomous/`
- Replace with: "The orchestrator will provide the execution state directory in each task prompt. Update files ONLY in the provided path."
- In the execute-prd skill's subagent prompt template (Step 3), include an explicit `**Execution State Path**: dev/executions/<slug>/` field that the orchestrator fills in
- The orchestrator prompt template should have a mandatory field: `**State Directory**: dev/executions/{plan-slug}/`

**Verification**: In Step 7, check that the developer subagent writes to `dev/executions/<slug>/` and NOT to `dev/autonomous/`.

---

### Risk 6: Plan Path Assumption — Where Does prd.json Live Before Execution?

**Problem**: The plan says "copies prd.json from `dev/plans/<slug>/prd.json`" but the current `prd-to-json` skill outputs to `dev/autonomous/prd.json`. Step 5 updates `prd-to-json` to output to `dev/plans/<slug>/prd.json`. But `plan-to-prd` also references `dev/autonomous/prd.json` in its handoff prompt. If we update one skill but not the other, the handoff breaks — the execute prompt will point to a file that doesn't exist.

**Mitigation**:
- Steps 3 and 5 must be treated as atomic — both skill updates need to happen together before any E2E test
- The handoff prompt in `plan-to-prd` must be updated to: `dev/plans/{feature-name}/prd.json` (not `dev/autonomous/prd.json`)
- The execute-prd skill must look for `prd.json` at the path specified by the user (not hardcoded to `dev/autonomous/`)
- Add to Step 5 AC: "plan-to-prd EXECUTE.md handoff prompt references `dev/plans/` not `dev/autonomous/`"

**Verification**: After Steps 3+5, run the full planning flow: plan → plan-to-prd → prd-to-json → verify prd.json lands at `dev/plans/<slug>/prd.json`.

---

### Risk 7: Template and Reference Files Still in `dev/autonomous/`

**Problem**: The pre-mortem template (`dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`) and other reference files (`schema.ts`, `PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md`) live in `dev/autonomous/`. The plan marks `dev/autonomous/` as deprecated but doesn't move these files. Post-deprecation, skills that reference these templates will point to a deprecated directory, which is confusing.

**Mitigation**:
- For V1, leave template/reference files in `dev/autonomous/` — they're not execution state, they're static references
- Add a note in the deprecation marker (Step 6): "Static templates and reference files remain here until legacy cleanup (Phase 2). Only execution state (`prd.json`, `progress.txt`) is deprecated."
- Alternatively, consider moving templates to `dev/templates/` as a small scope addition — but only if it doesn't balloon the change

**Verification**: Skills that reference `dev/autonomous/templates/` still work after the refactor (the directory isn't deleted).

---

### Risk 8: Subagent Output Parsing — Orchestrator Must Process Return Values

**Problem**: With Cursor's Task tool, the orchestrator got back a text result from each subagent. With `pi-subagents`, the return format may be different — structured messages, exit codes, usage stats. The execute-prd skill's "Accept or Iterate" logic (Steps 11-13 in SKILL.md) assumes the orchestrator can read the subagent's output and decide. If the output format is unexpected, the orchestrator may not correctly detect failures or parse completion reports.

**Mitigation**:
- In the developer agent definition, specify an explicit output format that the orchestrator expects:
  ```markdown
  ## Completed
  What was done.
  ## Files Changed
  - path/to/file.ts - what changed
  ## Quality Checks
  - typecheck: ✓/✗
  - tests: ✓/✗ (N passed)
  ## Commit
  abc1234
  ```
- In the reviewer agent definition, specify review output format (APPROVED/ITERATE with structured feedback)
- The execute-prd skill should document that it reads the `content[0].text` from the subagent result (which is the final assistant message)

**Verification**: Step 7 — orchestrator correctly parses developer completion report and reviewer verdict from subagent output.

---

## Summary

**Total risks identified**: 8
**Categories covered**: Context Gaps (1), Integration (2, 3, 6), Scope Creep (7), Code Quality (4, 8), Dependencies (5, 6), State Tracking (4, 5)

**Highest-risk items** (most likely to cause real problems):
1. **Risk 2** (blast radius) — 6+ files need path updates; missing one breaks the system
2. **Risk 5** (progress path confusion) — subagents writing to wrong location is the most likely runtime failure
3. **Risk 6** (plan path assumption) — handoff chain has multiple skills that must agree on paths

**Lowest-risk items** (mitigations are straightforward):
- Risk 1 (agent scope) — already partially validated
- Risk 7 (templates) — static files, not moving them is fine

---

**Ready to proceed with these mitigations?** Do you see any other risks I missed?
