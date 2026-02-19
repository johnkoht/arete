---
title: Refactor Subagents
slug: refactor-subagents
status: building
size: large
created: 2026-02-19T03:34:57.042Z
updated: 2026-02-19T15:41:19.986Z
completed: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 7
---

# Refactor Subagents: Pi Subagents + Worktree Isolation

## Problem Statement

The current execute-prd system is built on Cursor's Task tool and a shared `dev/autonomous/` directory. This creates three problems:

1. **IDE lock-in**: The execution workflow only works in Cursor (Task tool dependency).
2. **No isolation**: All runs share `dev/autonomous/prd.json` and `progress.txt` — running two PRDs simultaneously causes state contamination.
3. **No parallelism**: Only one PRD can execute at a time because of shared mutable state.

## Solution

Refactor the execute-prd skill to use Pi's `pi-subagents` extension (npm package from nicobailon/pi-subagents) for agent dispatch and git worktrees for filesystem isolation. Each PRD execution gets its own worktree and its own state directory (`dev/executions/<plan-slug>/`).

## Key Decisions

- **Subagent dispatch**: Pi `subagent` tool (spawns isolated `pi` processes) replaces Cursor's Task tool
- **Agent definitions**: Project-level agents in `.pi/agents/` (developer, reviewer, orchestrator)
- **Agent scope**: `agentScope: "project"` to use project-local agent definitions
- **Worktree per run**: Builder creates worktree via `wt new <plan-slug>` before execution; orchestrator runs FROM the worktree
- **State isolation**: `dev/executions/<plan-slug>/` holds run-local prd.json, status.json, progress.md
- **No shared mutable files**: Two runs never touch each other's execution state

## End-to-End Workflow (Post-Refactor)

### A. Planning (you + PM agent, any IDE)
1. Shape plan, run pre-mortem, create PRD
2. Output: `dev/plans/<slug>/plan.md`, `prd.md`, `prd.json`

### B. Worktree Setup (you, terminal)
3. `wt new <plan-slug>` → creates worktree + branch, opens iTerm tab
4. Worktree at: `~/code/arete-worktrees/arete--<plan-slug>`

### C. Execution (Pi session in worktree)
5. "Load execute-prd and execute `dev/plans/<slug>/prd.json`"
6. Orchestrator (main agent) follows execute-prd skill workflow
7. Copies prd.json → `dev/executions/<plan-slug>/prd.json`
8. Creates `dev/executions/<plan-slug>/status.json`
9. For each task:
   - Orchestrator crafts prompt with context
   - Reviewer subagent: pre-work sanity check
   - Developer subagent: implements (works in worktree cwd)
   - Reviewer subagent: code review
   - Accept or iterate
   - Update execution state (run-local only)
10. Holistic review, memory entry, final report

### D. Merge (you)
11. Review code, run tests, merge branch
12. `wt done <plan-slug>` → cleanup worktree + branch

### Parallel Runs
Two iTerm tabs, two worktrees, two Pi sessions, two independent execute-prd runs. Each has its own `dev/executions/<slug>/` state. No interference.

---

## Plan

### Step 1: Install pi-subagents
**What**: Install the pi-subagents npm package and verify it works with project-level agents.
**AC**:
- `pi install npm:pi-subagents` succeeds
- `subagent` tool appears in Pi's tool list
- Can spawn a developer agent with `agentScope: "project"` that reads a file and returns output
- Chain mode works (developer → reviewer)

### Step 2: Add run state management
**What**: Create `dev/executions/<plan-slug>/` structure for isolated run state. When execute-prd starts, it copies prd.json from the plan, creates status.json and progress.md.
**AC**:
- `dev/executions/` directory exists (gitignored contents, committed structure)
- Execution state schema defined: `status.json` with run status, current task, timestamps, attempt counts
- `prd.json` is copied (not referenced) from `dev/plans/<slug>/prd.json` at run start
- `progress.md` is append-only log for subagent learnings
- Orchestrator reads/writes ONLY to its `dev/executions/<plan-slug>/` folder

### Step 3: Refactor execute-prd skill
**What**: Rewrite `.pi/skills/execute-prd/SKILL.md` to use `subagent` tool instead of Cursor's Task tool. This is the core change.
**AC**:
- All references to Cursor Task tool removed
- Developer tasks use: `subagent({ agent: "developer", task: "...", agentScope: "project" })`
- Reviewer checks use: `subagent({ agent: "reviewer", task: "...", agentScope: "project" })`
- Chain mode used for review→implement→review iteration cycles
- State updates point to `dev/executions/<plan-slug>/` not `dev/autonomous/`
- Skill documents that builder runs it FROM the worktree
- All existing workflow phases preserved (Phase 0: understand, Phase 1: pre-mortem, Phase 2: task loop, Phase 3: holistic review)
- Subagent prompt template updated to reference execution state paths

### Step 4: Update agent definitions
**What**: Tune `.pi/agents/developer.md` and `.pi/agents/reviewer.md` for the new flow.
**AC**:
- Developer agent: no Cursor-specific references, knows about `dev/executions/` state path, understands it works in worktree cwd
- Reviewer agent: same cleanup, reviews code in current working directory, knows execution state location
- Orchestrator agent: updated if needed for new workflow references
- All agents have appropriate `tools` and `model` in frontmatter

### Step 5: Update supporting skills
**What**: Update prd-to-json and plan-to-prd to output to new paths.
**AC**:
- `prd-to-json` outputs to `dev/plans/<slug>/prd.json` (not `dev/autonomous/prd.json`)
- `plan-to-prd` references updated if it points to old paths
- Any other skills referencing `dev/autonomous/` paths updated

### Step 6: Deprecation markers on legacy system
**What**: Mark the old Cursor-based autonomous system as deprecated without deleting it.
**AC**:
- `dev/autonomous/README.md` has deprecation notice at top: "DEPRECATED — use execute-prd with Pi subagents. See .pi/skills/execute-prd/"
- `dev/autonomous/prd-task-agent.md` has deprecation notice
- `.cursor/agents/` files (if any reference the old system) have deprecation notices
- No files deleted (legacy removal is Phase 2)

### Step 7: End-to-end validation
**What**: Run a real (small) PRD through the new system to validate everything works.
**AC**:
- Create a small test PRD (2-3 tasks, e.g. "add a utility function + tests")
- `wt new test-validation` creates worktree
- Execute PRD in worktree via Pi with execute-prd skill
- Developer subagent implements tasks in worktree
- Reviewer subagent reviews code
- State persisted correctly in `dev/executions/test-validation/`
- Commits land on the worktree's branch (not main)
- Tests pass (`npm run typecheck`, `npm test`)
- Cleanup: `wt done test-validation`

---

## Out of Scope (Phase 2)
- Multiple concurrent runs (validate single-run first)
- Rate-limit detection and provider fallback
- Global throttling across runs
- Legacy system removal (`dev/autonomous/`, `.cursor/agents/`)
- Auto-push / PR creation automation
- Programmatic execution engine (V1 is skill-instruction-driven, not a TypeScript state machine)

## Dependencies
- `pi-subagents` npm package (nicobailon/pi-subagents)
- Pi worktree extension (already installed at `~/.pi/agent/extensions/worktree.ts`) OR builder's `wt` shell function
- Existing `.pi/agents/` definitions (developer.md, reviewer.md, orchestrator.md)

## Risks (to be detailed in pre-mortem)
- Subagent tool behavior differences from Cursor Task tool (context window, tool access)
- Agent scope discovery: will `agentScope: "project"` find `.pi/agents/` in the worktree?
- State path resolution: does `dev/executions/` resolve correctly from worktree?
- Skill loading: does execute-prd skill load correctly when Pi runs from a worktree?

## Success Metrics
1. Single PRD executes end-to-end with Pi subagents + worktree isolation
2. Zero references to Cursor Task tool in execute-prd skill
3. Execution state fully isolated in `dev/executions/<plan-slug>/`
4. All existing quality gates preserved (typecheck, tests, doc audit)
5. Builder can kick off execution from any worktree
