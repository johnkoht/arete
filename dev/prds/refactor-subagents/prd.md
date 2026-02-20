# PRD: Refactor Subagents — Pi Subagents + Worktree Isolation

## Goal

Refactor the execute-prd autonomous execution system from Cursor's Task tool and shared `dev/autonomous/` state to Pi's `pi-subagents` extension with per-run worktree isolation. This eliminates IDE lock-in, enables parallel PRD execution, and creates isolated run state in `dev/executions/<plan-slug>/`.

## Problem Statement

The current system has three problems:
1. **IDE lock-in** — execution depends on Cursor's Task tool
2. **No isolation** — all runs share `dev/autonomous/prd.json` and `progress.txt`
3. **No parallelism** — only one PRD can execute at a time

## Success Criteria

1. Single PRD executes end-to-end with Pi subagents + worktree isolation
2. Zero references to Cursor Task tool in active skill files
3. Execution state fully isolated in `dev/executions/<plan-slug>/`
4. All existing quality gates preserved (typecheck, tests, doc audit)
5. Post-refactor grep for `dev/autonomous/` returns zero execution-path hits in active files
6. `/build` command and `build status` use new paths

## Out of Scope

- Multiple concurrent runs (validate single-run first, Phase 2)
- Rate-limit detection and provider fallback
- Global throttling across runs
- Legacy system removal (`dev/autonomous/`, `.cursor/agents/`)
- Auto-push / PR creation automation
- Programmatic execution engine (V1 is skill-instruction-driven)
- Moving `dev/autonomous/templates/` (static references stay until Phase 2)
- Moving `prd.md` from `dev/prds/` to `dev/plans/` (separate branch work)

## Pre-Mortem Risks (from `dev/plans/refactor-subagents/pre-mortem.md`)

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 2 | Blast radius — 6+ files reference `dev/autonomous/` | 🔴 High | Grep-verified inventory before AND after; checklist per file |
| 5 | Subagents write to wrong path | 🔴 High | Remove hardcoded paths from agent defs; orchestrator provides state dir in every prompt |
| 6 | Plan path assumption — handoff chain disagreement | 🟡 Med | All skills + /build handler point to `dev/plans/<slug>/prd.json` |
| 3 | Skill self-reference — orchestrator hallucinating tool params | 🟡 Med | Concrete tool call examples in SKILL.md |
| 4 | State schema undefined | 🟡 Med | Define `status.json` schema in task 1 |
| 8 | Subagent output parsing | 🟡 Med | Explicit output format in agent defs |
| 1 | Agent scope in worktrees | 🟢 Low | Already validated; always pass worktree root as cwd |
| 7 | Templates still in `dev/autonomous/` | 🟢 Low | Leave for Phase 2; add note in deprecation |

## Complete Reference Inventory

Files that reference `dev/autonomous/` and their disposition:

| File | Action | Task |
|------|--------|------|
| `.pi/extensions/plan-mode/commands.ts` (lines 842-843, 879) | **Update** `/build` handler + build status paths | 4 |
| `.pi/extensions/plan-mode/execution-progress.ts` (line 114) | **Update** default prd path parameter | 4 |
| `.agents/skills/execute-prd/SKILL.md` | **Rewrite** — core skill refactor | 2 |
| `.agents/skills/prd-to-json/SKILL.md` | **Update** output path + progress init | 4 |
| `.agents/skills/plan-to-prd/SKILL.md` | **Update** handoff prompt, remove EXECUTE.md generation | 4 |
| `.agents/skills/prd-post-mortem/SKILL.md` | **Update** prd.json + progress refs | 4 |
| `.pi/agents/developer.md` | **Update** remove hardcoded paths | 3 |
| `.agents/skills/run-pre-mortem/SKILL.md` | **Leave** — static template refs (Phase 2) | — |
| `.agents/skills/review-plan/SKILL.md` | **Leave** — static template ref (Phase 2) | — |
| `.cursor/rules/plan-pre-mortem.mdc` | **Leave** — static template refs (Phase 2) | — |
| `.agents/sources/builder/conventions.md` | **Leave** — static template ref (Phase 2 TODO) | — |
| `packages/core/src/models/prd.ts` | **Leave** — historical comment only | — |

### Dual-File Sync Requirement

Both `.pi/skills/` and `.agents/skills/` contain copies of skills. After modifying any skill file, verify both locations are in sync:
```bash
diff .pi/skills/<name>/SKILL.md .agents/skills/<name>/SKILL.md
```
Must show no differences. Apply to: execute-prd, prd-to-json, plan-to-prd, prd-post-mortem.

## Dependencies

- ✅ `pi-subagents` npm package — installed and verified
- ✅ `.pi/agents/` — developer.md, reviewer.md, orchestrator.md exist
- Builder's `wt` shell function for worktree management

---

## Tasks

### Task 1: Add Run State Management

**Description**: Create the `dev/executions/` directory structure and define the `status.json` schema. This is the foundation that execute-prd will use to track per-run state instead of the shared `dev/autonomous/` directory.

**Acceptance Criteria**:
- `dev/executions/` directory exists with a `.gitkeep` file
- `dev/executions/` contents are gitignored (add pattern to `.gitignore`)
- `dev/executions/README.md` documents the structure and schema
- `status.json` schema is defined in the README:
  ```json
  {
    "planSlug": "string",
    "status": "queued|running|paused|blocked|completed|failed",
    "startedAt": "ISO timestamp",
    "updatedAt": "ISO timestamp",
    "currentTaskId": "string|null",
    "completedTasks": "number",
    "totalTasks": "number",
    "worktree": { "path": "string", "branch": "string" }
  }
  ```
- `prd.json` format unchanged (same `dev/autonomous/schema.ts` types — just copied per-run)
- `progress.md` documented as append-only log
- End-to-end workflow documented in README: plan → worktree → execute → merge

**Pre-mortem mitigations applied**: Risk 4 (schema definition)

---

### Task 2: Refactor execute-prd Skill

**Description**: Rewrite `.pi/skills/execute-prd/SKILL.md` to use the Pi `subagent` tool instead of Cursor's Task tool. This is the core change. The skill must preserve all existing workflow phases (understand, pre-mortem, task loop, holistic review) while changing the dispatch mechanism and state paths.

**Acceptance Criteria**:
- All references to Cursor Task tool / `subagent_type: generalPurpose` removed
- New "Tool Reference" section at top of skill documents the `subagent` tool signature:
  ```
  subagent({ agent: "developer", task: "...", agentScope: "project" })
  subagent({ agent: "reviewer", task: "...", agentScope: "project" })
  ```
- Developer tasks dispatched via: `subagent({ agent: "developer", task: "...", agentScope: "project" })`
- Reviewer tasks dispatched via: `subagent({ agent: "reviewer", task: "...", agentScope: "project" })`
- Subagent prompt template includes mandatory `**Execution State Path**: dev/executions/<slug>/` field
- All state reads/writes point to `dev/executions/<plan-slug>/` not `dev/autonomous/`
- Phase 0 updated: orchestrator reads prd.json from path provided by user (not hardcoded `dev/autonomous/`)
- Phase 0 added: orchestrator copies prd.json to `dev/executions/<plan-slug>/prd.json` and creates `status.json` and `progress.md`
- All existing workflow phases preserved (Phase 0: understand, Phase 1: pre-mortem, Phase 2: task loop, Phase 3: holistic review)
- Skill documents that builder runs it FROM the worktree
- All subagent calls pass worktree root as cwd (not subdirectory)
- Explicit output format documented for developer subagent completion reports
- Explicit output format documented for reviewer verdict (APPROVED/ITERATE)
- `progress.txt` references changed to `progress.md`
- **Dual-file sync**: Both `.pi/skills/execute-prd/SKILL.md` and `.agents/skills/execute-prd/SKILL.md` must be identical after update
- Verify: `grep "dev/autonomous" .pi/skills/execute-prd/SKILL.md` returns zero execution-path hits

**Pre-mortem mitigations applied**: Risk 1 (cwd), Risk 2 (blast radius grep), Risk 3 (tool signature), Risk 5 (state dir in prompt), Risk 8 (output format)

---

### Task 3: Update Agent Definitions

**Description**: Update `.pi/agents/developer.md` and `.pi/agents/reviewer.md` to remove Cursor-specific references and align with the new execution flow. The developer agent must no longer hardcode paths to `dev/autonomous/` — instead, it expects the orchestrator to provide the execution state directory in every task prompt.

**Acceptance Criteria**:
- `.pi/agents/developer.md`:
  - No references to `dev/autonomous/prd.json` or `dev/autonomous/progress.txt`
  - No references to Cursor Task tool or Cursor-specific patterns
  - Step 6 (Update Progress) says: "Update prd.json and progress.md at the execution state path provided by the orchestrator"
  - Explicit completion report output format defined (## Completed, ## Files Changed, ## Quality Checks, ## Commit)
  - Understands it works in worktree cwd
- `.pi/agents/reviewer.md`:
  - No Cursor-specific references
  - Explicit review output format: APPROVED or ITERATE with structured feedback
  - Reviews code in current working directory
- `.pi/agents/orchestrator.md`:
  - Updated if it references old paths (check and fix)
  - References `dev/executions/` for state tracking
- `.pi/agents/engineering-lead.md`:
  - Updated if it references old paths (check and fix)
- All agents have appropriate `tools` and `model` in frontmatter
- Verify: `grep "dev/autonomous" .pi/agents/*.md` returns zero hits

**Pre-mortem mitigations applied**: Risk 5 (no hardcoded paths), Risk 8 (output format)

---

### Task 4: Update Supporting Skills, Rules, and Extension Code

**Description**: Update all remaining files that reference `dev/autonomous/` execution paths. This includes skills (prd-to-json, plan-to-prd, prd-post-mortem), the plan-mode extension TypeScript code (`/build` handler, execution progress), and any rules with execution-path references. Leave static template references (`dev/autonomous/templates/`) unchanged for Phase 2.

**Acceptance Criteria**:

**Skills**:
- `.agents/skills/prd-to-json/SKILL.md`:
  - Output path changed from `dev/autonomous/prd.json` to `dev/plans/<slug>/prd.json`
  - `progress.txt` initialization section updated (now `progress.md` in `dev/executions/`)
  - References to `dev/autonomous/schema.ts` left unchanged
  - **Dual-file sync**: `.pi/skills/prd-to-json/SKILL.md` matches
- `.agents/skills/plan-to-prd/SKILL.md`:
  - Handoff prompt references `dev/plans/{feature-name}/prd.json` (not `dev/autonomous/prd.json`)
  - EXECUTE.md generation removed or marked as optional/Cursor-only (Pi uses `/build` command instead)
  - Skill path in handoff prompt: `.pi/skills/execute-prd/SKILL.md`
  - **Dual-file sync**: `.pi/skills/plan-to-prd/SKILL.md` matches
- `.agents/skills/prd-post-mortem/SKILL.md`:
  - References changed from `dev/autonomous/prd.json` → `dev/executions/<slug>/prd.json`
  - References changed from `dev/autonomous/progress.txt` → `dev/executions/<slug>/progress.md`
  - **Dual-file sync**: `.pi/skills/prd-post-mortem/SKILL.md` matches

**Extension TypeScript code** (requires `npm run typecheck` after changes):
- `.pi/extensions/plan-mode/commands.ts` lines 841-843:
  - `/build` handler prompt updated: prd.json path → `dev/plans/${slug}/prd.json` (not `dev/autonomous/prd.json`)
  - PRD path in prompt → `dev/plans/${slug}/prd.md` (not `dev/prds/`)
- `.pi/extensions/plan-mode/commands.ts` line 879:
  - Build status `prdPath` → `dev/plans/${slug}/prd.json`
- `.pi/extensions/plan-mode/execution-progress.ts` line 114:
  - Default `prdPath` parameter changed from `dev/autonomous/prd.json` to a plan-slug-based path

**Static template references LEFT UNCHANGED (Phase 2)**:
- `.agents/skills/run-pre-mortem/SKILL.md` — `dev/autonomous/templates/`
- `.agents/skills/review-plan/SKILL.md` — `dev/autonomous/templates/`
- `.cursor/rules/plan-pre-mortem.mdc` — `dev/autonomous/templates/`
- `.agents/sources/builder/conventions.md` — `dev/autonomous/templates/`

**Verification gate**: 
```bash
grep -rn "dev/autonomous/prd.json\|dev/autonomous/progress" .agents/ .pi/ .cursor/rules/ --include="*.md" --include="*.mdc" --include="*.ts"
```
Returns zero hits (template and schema.ts references excluded). Then:
```bash
npm run typecheck  # Must pass after TS changes
npm test           # Must pass
```

**Pre-mortem mitigations applied**: Risk 2 (blast radius — grep inventory), Risk 6 (handoff path consistency)

---

### Task 5: Deprecation Markers on Legacy System

**Description**: Mark the old Cursor-based autonomous execution system as deprecated. No files are deleted — this is informational for future agents and the builder.

**Acceptance Criteria**:
- `dev/autonomous/README.md` has deprecation notice at the very top:
  ```
  > ⚠️ **DEPRECATED** — The autonomous execution system has moved to Pi subagents.
  > See `.pi/skills/execute-prd/SKILL.md` for the current workflow.
  > Execution state now lives in `dev/executions/<plan-slug>/`.
  > Static templates and reference files in this directory remain until full legacy cleanup (Phase 2).
  ```
- `dev/autonomous/prd-task-agent.md` has deprecation notice at top
- `dev/autonomous/schema.ts` has comment noting it's referenced by `prd-to-json` and may move in Phase 2
- No files deleted from `dev/autonomous/`

**Pre-mortem mitigations applied**: Risk 7 (templates note in deprecation)

---

### Task 6: Path Consistency Verification and Documentation

**Description**: Final verification that all path references are consistent. Run comprehensive greps, update any remaining documentation, and ensure the dev/executions/README.md has complete workflow docs.

**Acceptance Criteria**:
- Full grep verification passes:
  ```bash
  grep -rn "dev/autonomous/prd.json\|dev/autonomous/progress" .agents/ .pi/ .cursor/rules/ --include="*.md" --include="*.mdc" --include="*.ts"
  ```
  Returns zero hits in active files
- All dual-file sync checks pass (diff between `.pi/skills/` and `.agents/skills/` for all modified skills)
- `.agents/sources/` checked — any `dev/autonomous/` execution refs updated; static template refs get Phase 2 TODO comment
- `dev/executions/README.md` documents complete end-to-end workflow
- Quality gates pass: `npm run typecheck && npm test`

**Pre-mortem mitigations applied**: Risk 2 (blast radius final check), Risk 6 (path consistency)

---

## Post-Execution Checklist (Builder-Driven)

After tasks 1-6 are complete, the builder performs E2E validation:

- [ ] Create a small test PRD (2-3 tasks)
- [ ] `wt new test-validation` creates worktree
- [ ] In worktree, start Pi session and execute the test PRD with new execute-prd skill
- [ ] Developer subagent spawned via `subagent` tool (not Cursor Task tool)
- [ ] Developer subagent works in worktree cwd
- [ ] State written to `dev/executions/test-validation/` (not `dev/autonomous/`)
- [ ] Reviewer subagent returns structured APPROVED/ITERATE verdict
- [ ] `dev/executions/test-validation/status.json` exists and matches schema
- [ ] Commits land on worktree branch (not main)
- [ ] Tests pass: `npm run typecheck && npm test`
- [ ] Zero references to `dev/autonomous/` in execution output or state files
- [ ] Cleanup: `wt done test-validation`

---

## Task Dependencies

```
Task 1 (state management) ─┐
                            ├─→ Task 2 (execute-prd skill) ─┐
                            │                                ├─→ Task 4 (supporting skills + extension TS) ─→ Task 5 (deprecation) ─→ Task 6 (verification)
                            └─→ Task 3 (agent definitions) ──┘
```

- Task 1 is independent (creates the directory/schema)
- Tasks 2 and 3 can be done in parallel after Task 1
- Task 4 depends on Tasks 2+3 (needs new paths established first; includes TypeScript changes that require typecheck)
- Task 5 depends on Task 4 (deprecation after all active files updated)
- Task 6 depends on Task 5 (final verification)
- Post-execution checklist is builder-driven after Task 6

## Branch

`refactor-subagents` (worktree already exists at this branch)
