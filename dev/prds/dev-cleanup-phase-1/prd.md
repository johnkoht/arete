# PRD: Dev/ Cleanup and Build Structure Reorganization (Phase 1)

**Version**: 1.0  
**Status**: Ready for execution  
**Date**: 2026-02-13  
**Branch**: `refactor/memory` (existing)  

---

## 1. Problem & Goals

### Problem

The Areté build repository has accumulated structural inconsistencies:

- **Build memory** (`MEMORY.md`, `collaboration.md`, `entries/`) is buried under `dev/` despite being a first-class concept that agents reference frequently
- **Build skills** live in `dev/skills/` but product skills use `.agents/skills/` pattern — inconsistent and confusing
- **Autonomous execution files** are scattered across `dev/agents/`, `dev/templates/`, and loose files in `dev/`
- **`arete-context.mdc`** contains mode disambiguation logic that's unnecessary — this repo IS builder mode

The repo structure doesn't match how the codebase is actually organized, making navigation and maintenance harder.

### Goals

1. **Elevate build memory** to top-level `memory/` directory — first-class, not hidden
2. **Standardize build skills** under `.agents/skills/` to match product skill pattern
3. **Consolidate autonomous system** files into `dev/autonomous/`
4. **Remove redundant mode detection** by deleting `arete-context.mdc`
5. **Preserve git history** through proper `git mv` operations
6. **Update all references** so no stale paths remain in documentation

### Out of Scope

- AGENTS.md rearchitecture (Phase 2 — deferred to scratchpad)
- Memory location for user workspaces (deferred discussion)
- Enhancing run-pre-mortem skill (deferred to scratchpad)

---

## 2. CRITICAL: Orchestrator Instructions

**This refactor has high risk of stale references and broken paths.** The orchestrator MUST follow these protocols:

### Before Each Task

1. Provide subagent with **path mapping context** (what already moved, new paths)
2. Include explicit files to read and patterns to follow
3. Reference the pre-mortem mitigations relevant to that task

### After Each Task

1. **Do NOT trust subagent's "complete" report blindly**
2. Independently verify:
   - Files exist at new locations
   - Old paths do NOT exist (`git status`, `ls`)
   - `rg "old/path"` returns 0 results
   - `npm run typecheck && npm test` passes
3. If verification fails, reject task with specific feedback
4. Only proceed to next task after verification passes

### Between Tasks

1. Commit completed work (`git add -A && git commit`)
2. Update progress.txt with what moved and what was updated
3. Check for any new issues introduced

---

## 3. Pre-Mortem: Risk Analysis

### Risk 1: Stale References After Moves

**Problem**: Old paths remain in documents. Grep might miss some (paths in code blocks, partial matches).

**Mitigation**: Each task includes grep verification. Final task (F1) runs comprehensive grep for ALL old paths. Use multiple patterns: exact path, partial path, filename only.

**Verification**: After each task, run `rg "old/path"` and expect 0 results.

### Risk 2: Circular Dependencies in Task Order

**Problem**: Two tasks touch the same file, causing conflicts or overwrites.

**Mitigation**: Tasks ordered by dependency: moves first (A, B, C), then refs (A2, B8, C2), then AGENTS.md (E1). Each reference-update task owns ALL refs for its category. AGENTS.md gets ONE dedicated task at the end (E1).

**Verification**: Orchestrator confirms no file touched by multiple tasks (except AGENTS.md in E1 only).

### Risk 3: Missing File in Move

**Problem**: File left behind or duplicated after move.

**Mitigation**: All moves use `git mv` to preserve history. Each move task verifies: destination exists, source does NOT exist. Cleanup empty directories after moves.

**Verification**: `ls old/path` should fail; `ls new/path` should succeed.

### Risk 4: Subagent Context Gaps

**Problem**: Subagent doesn't know what previous tasks changed, updates wrong paths.

**Mitigation**: Each task prompt includes path mapping summary. Task prompts list explicit "new paths" table. Orchestrator reviews before spawning each subagent.

**Verification**: Every task prompt includes current state of moves.

### Risk 5: Tests Break Due to Path Changes

**Problem**: Tests reference paths that changed; tests fail.

**Mitigation**: Run `npm test` after EVERY task, not just at end. Grep `test/` directory for moved paths. If test references `dev/` paths, update them.

**Verification**: Every task ends with `npm run typecheck && npm test`.

### Risk 6: AGENTS.md Becomes Inconsistent

**Problem**: AGENTS.md updated piecemeal, ends up with mix of old/new paths.

**Mitigation**: AGENTS.md gets ONE dedicated task (E1) after all moves complete. No other task touches AGENTS.md. E1 does complete audit of all paths.

**Verification**: Only E1 modifies AGENTS.md.

### Risk 7: Git History Lost

**Problem**: Files moved with `mv` instead of `git mv`, losing history.

**Mitigation**: All moves use `git mv source destination`. Commit after each logical group. Clear commit messages.

**Verification**: `git log --follow new/path` shows history.

### Risk 8: Orchestrator Doesn't Catch Errors

**Problem**: Subagent reports success but missed something. Errors compound.

**Mitigation**: Orchestrator independently verifies (doesn't trust report). Verification checklist: files moved? old paths gone? tests pass? Reject and retry if verification fails.

**Verification**: Orchestrator runs own grep/test commands after each task.

---

## 4. Target Structure

```
arete/
├── memory/                     # Build memory (NEW - top-level)
│   ├── MEMORY.md
│   ├── collaboration.md
│   └── entries/
├── .agents/
│   └── skills/                 # BUILD skills (moved from dev/skills/)
│       ├── execute-prd/
│       ├── review-plan/
│       ├── prd-to-json/
│       ├── prd-post-mortem/
│       ├── run-pre-mortem/
│       ├── plan-to-prd/
│       └── synthesize-collaboration-profile/
├── .cursor/
│   └── rules/                  # BUILD rules (remove arete-context.mdc)
│       ├── dev.mdc
│       ├── testing.mdc
│       ├── plan-pre-mortem.mdc
│       ├── agent-memory.mdc
│       └── arete-vision.mdc
├── dev/
│   ├── autonomous/             # PRD execution system (consolidated)
│   │   ├── README.md
│   │   ├── TESTING.md
│   │   ├── prd-task-agent.md   # (moved from dev/agents/)
│   │   ├── prd.json
│   │   ├── progress.txt
│   │   ├── archive/
│   │   ├── schema.ts
│   │   └── templates/
│   │       └── PRE-MORTEM-TEMPLATE.md
│   ├── prds/
│   ├── backlog/
│   ├── docs/                   # Historical docs
│   └── wisdom-registry.md
├── runtime/                    # GUIDE content (unchanged)
├── config/
│   └── agents/                 # (placeholder for Phase 2)
└── ...
```

---

## 5. User Stories / Tasks

### Phase A: Move Memory

#### Task A1: Move memory files

**Description**: Move build memory files from `dev/` to top-level `memory/` directory.

**Actions**:
- Create `memory/` directory if needed
- `git mv dev/MEMORY.md memory/MEMORY.md`
- `git mv dev/collaboration.md memory/collaboration.md`
- `git mv dev/entries/ memory/entries/`

**Acceptance Criteria**:
- `ls memory/MEMORY.md` succeeds
- `ls memory/collaboration.md` succeeds
- `ls memory/entries/` succeeds and contains entry files
- `ls dev/MEMORY.md` fails (file moved)
- `ls dev/collaboration.md` fails (file moved)
- `ls dev/entries/` fails (directory moved)
- `git log --follow memory/MEMORY.md` shows history

**Commit**: "chore: move build memory to top-level memory/"

---

#### Task A2: Update memory references

**Description**: Update ALL references to moved memory paths in rules, skills, and docs.

**Files to update** (grep for `dev/MEMORY.md`, `dev/collaboration.md`, `dev/entries/`):
- `.cursor/rules/dev.mdc`
- `.cursor/rules/agent-memory.mdc`
- `dev/autonomous/README.md`
- Any skills that reference memory paths

**Path changes**:
- `dev/MEMORY.md` → `memory/MEMORY.md`
- `dev/collaboration.md` → `memory/collaboration.md`
- `dev/entries/` → `memory/entries/`

**Acceptance Criteria**:
- `rg "dev/MEMORY.md" --type md` returns 0 results
- `rg "dev/collaboration.md" --type md` returns 0 results
- `rg "dev/entries/" --type md` returns 0 results (except historical entries documenting old structure)
- `npm run typecheck` passes
- `npm test` passes

**Commit**: "chore: update all references to memory/ paths"

---

### Phase B: Move Build Skills

#### Task B1: Move execute-prd skill

**Description**: Move execute-prd skill to standardized location.

**Actions**:
- `mkdir -p .agents/skills`
- `git mv dev/skills/execute-prd/ .agents/skills/execute-prd/`

**Acceptance Criteria**:
- `.agents/skills/execute-prd/SKILL.md` exists
- `dev/skills/execute-prd/` does NOT exist

**Commit**: "chore: move execute-prd skill to .agents/skills/"

---

#### Task B2: Move review-plan skill

**Description**: Move review-plan skill to standardized location.

**Actions**:
- `git mv dev/skills/review-plan/ .agents/skills/review-plan/`

**Acceptance Criteria**:
- `.agents/skills/review-plan/SKILL.md` exists
- `dev/skills/review-plan/` does NOT exist

**Commit**: "chore: move review-plan skill to .agents/skills/"

---

#### Task B3: Move prd-to-json skill

**Description**: Move prd-to-json skill to standardized location.

**Actions**:
- `git mv dev/skills/prd-to-json/ .agents/skills/prd-to-json/`

**Acceptance Criteria**:
- `.agents/skills/prd-to-json/SKILL.md` exists
- `dev/skills/prd-to-json/` does NOT exist

**Commit**: "chore: move prd-to-json skill to .agents/skills/"

---

#### Task B4: Move prd-post-mortem skill

**Description**: Move prd-post-mortem skill to standardized location.

**Actions**:
- `git mv dev/skills/prd-post-mortem/ .agents/skills/prd-post-mortem/`

**Acceptance Criteria**:
- `.agents/skills/prd-post-mortem/SKILL.md` exists
- `dev/skills/prd-post-mortem/` does NOT exist

**Commit**: "chore: move prd-post-mortem skill to .agents/skills/"

---

#### Task B5: Move run-pre-mortem skill

**Description**: Move run-pre-mortem skill to standardized location.

**Actions**:
- `git mv dev/skills/run-pre-mortem/ .agents/skills/run-pre-mortem/`

**Acceptance Criteria**:
- `.agents/skills/run-pre-mortem/SKILL.md` exists
- `dev/skills/run-pre-mortem/` does NOT exist

**Commit**: "chore: move run-pre-mortem skill to .agents/skills/"

---

#### Task B6: Move plan-to-prd skill

**Description**: Move plan-to-prd skill to standardized location.

**Actions**:
- `git mv dev/skills/plan-to-prd/ .agents/skills/plan-to-prd/`

**Acceptance Criteria**:
- `.agents/skills/plan-to-prd/SKILL.md` exists
- `dev/skills/plan-to-prd/` does NOT exist

**Commit**: "chore: move plan-to-prd skill to .agents/skills/"

---

#### Task B7: Move synthesize-collaboration-profile skill

**Description**: Move synthesize-collaboration-profile skill to standardized location.

**Actions**:
- `git mv dev/skills/synthesize-collaboration-profile/ .agents/skills/synthesize-collaboration-profile/`

**Acceptance Criteria**:
- `.agents/skills/synthesize-collaboration-profile/SKILL.md` exists
- `dev/skills/synthesize-collaboration-profile/` does NOT exist

**Commit**: "chore: move synthesize-collaboration-profile skill to .agents/skills/"

---

#### Task B8: Update skill path references

**Description**: Update ALL references to `dev/skills/` paths in rules and docs.

**Files to update** (grep for `dev/skills/`):
- `.cursor/rules/dev.mdc` (build skills table)
- `.cursor/rules/plan-pre-mortem.mdc`
- `dev/autonomous/README.md`

**Path change**: `dev/skills/{name}/SKILL.md` → `.agents/skills/{name}/SKILL.md`

**Acceptance Criteria**:
- `rg "dev/skills/" --type md` returns 0 results (except historical entries)
- `npm run typecheck` passes
- `npm test` passes

**Commit**: "chore: update all references to .agents/skills/ paths"

---

### Phase C: Consolidate Autonomous System

#### Task C1: Move autonomous-related files

**Description**: Consolidate scattered autonomous execution files into `dev/autonomous/`.

**Actions**:
- `git mv dev/agents/prd-task.md dev/autonomous/prd-task-agent.md`
- `mkdir -p dev/autonomous/templates`
- `git mv dev/templates/PRE-MORTEM-TEMPLATE.md dev/autonomous/templates/`
- `git mv dev/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md dev/autonomous/`
- `git mv dev/QUICK-START-ORCHESTRATION.md dev/autonomous/`
- `git mv dev/TEST-EXECUTE-PRD-PROMPT.md dev/autonomous/`
- `rmdir dev/agents/` (should be empty)
- `rmdir dev/templates/` (should be empty)

**Acceptance Criteria**:
- `dev/autonomous/prd-task-agent.md` exists
- `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md` exists
- `dev/autonomous/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md` exists
- `dev/autonomous/QUICK-START-ORCHESTRATION.md` exists
- `dev/autonomous/TEST-EXECUTE-PRD-PROMPT.md` exists
- `dev/agents/` does NOT exist
- `dev/templates/` does NOT exist

**Commit**: "chore: consolidate autonomous system files in dev/autonomous/"

---

#### Task C2: Update autonomous references

**Description**: Update ALL references to moved autonomous files.

**Files to update** (grep for `dev/agents/`, `dev/templates/`):
- `.cursor/rules/dev.mdc`
- `.cursor/rules/plan-pre-mortem.mdc`
- `.agents/skills/execute-prd/SKILL.md`
- `.agents/skills/run-pre-mortem/SKILL.md`
- `dev/autonomous/README.md`

**Path changes**:
- `dev/agents/prd-task.md` → `dev/autonomous/prd-task-agent.md`
- `dev/templates/PRE-MORTEM-TEMPLATE.md` → `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`

**Acceptance Criteria**:
- `rg "dev/agents/" --type md` returns 0 results
- `rg "dev/templates/" --type md` returns 0 results
- `npm run typecheck` passes
- `npm test` passes

**Commit**: "chore: update all references to consolidated autonomous paths"

---

### Phase D: Remove arete-context.mdc

#### Task D1: Remove arete-context.mdc

**Description**: Remove the redundant mode detection rule — this repo IS builder mode.

**Actions**:
- `git rm .cursor/rules/arete-context.mdc`
- Update any references to `arete-context.mdc`

**Acceptance Criteria**:
- `.cursor/rules/arete-context.mdc` does NOT exist
- `rg "arete-context.mdc"` returns 0 results
- `npm run typecheck` passes
- `npm test` passes

**Commit**: "chore: remove arete-context.mdc (repo IS builder mode)"

---

### Phase E: Update AGENTS.md

#### Task E1: Complete AGENTS.md audit

**Description**: This is the ONE task that touches AGENTS.md. Complete audit and update of all paths.

**Audit and update ALL paths**:
- Memory paths: `memory/MEMORY.md`, `memory/collaboration.md`, `memory/entries/`
- Skill paths: `.agents/skills/{name}/SKILL.md`
- Autonomous paths: `dev/autonomous/`, `dev/autonomous/prd-task-agent.md`, `dev/autonomous/templates/`
- Remove any mention of `arete-context.mdc`

**Also update**:
- Directory structure diagram
- Any descriptions that reference old locations

**Acceptance Criteria**:
- AGENTS.md contains NO old paths
- `rg "dev/MEMORY.md|dev/collaboration.md|dev/entries/|dev/skills/|dev/agents/|dev/templates/|arete-context.mdc" AGENTS.md` returns 0 results
- `npm run typecheck` passes
- `npm test` passes

**Commit**: "chore: update AGENTS.md with new directory structure"

---

### Phase F: Final Verification

#### Task F1: Comprehensive verification

**Description**: Final verification that all moves completed correctly and no stale references remain.

**Verification Steps**:

1. **Grep all old paths** (each should return 0 or only historical entries):
   - `rg "dev/MEMORY.md" --type md`
   - `rg "dev/collaboration.md" --type md`
   - `rg "dev/entries/" --type md`
   - `rg "dev/skills/" --type md`
   - `rg "dev/agents/" --type md`
   - `rg "dev/templates/" --type md`
   - `rg "arete-context.mdc"`

2. **Verify new structure exists**:
   - `ls memory/MEMORY.md`
   - `ls memory/collaboration.md`
   - `ls memory/entries/`
   - `ls .agents/skills/execute-prd/SKILL.md`
   - `ls .agents/skills/review-plan/SKILL.md`
   - `ls .agents/skills/prd-to-json/SKILL.md`
   - `ls .agents/skills/prd-post-mortem/SKILL.md`
   - `ls .agents/skills/run-pre-mortem/SKILL.md`
   - `ls .agents/skills/plan-to-prd/SKILL.md`
   - `ls .agents/skills/synthesize-collaboration-profile/SKILL.md`
   - `ls dev/autonomous/prd-task-agent.md`
   - `ls dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`

3. **Verify old locations removed**:
   - `ls dev/MEMORY.md` should fail
   - `ls dev/skills/` should fail
   - `ls dev/agents/` should fail
   - `ls dev/templates/` should fail
   - `ls .cursor/rules/arete-context.mdc` should fail

4. **Run full test suite**:
   - `npm run typecheck`
   - `npm test`

5. **Create placeholder for Phase 2**:
   - `mkdir -p config/agents`

**Acceptance Criteria**:
- All grep checks pass (0 results except historical entries)
- All new paths exist
- All old paths do not exist
- `npm run typecheck` passes
- `npm test` passes
- `config/agents/` directory exists

**Commit**: "chore: complete dev/ cleanup and restructure"

---

## 6. Task Dependencies

```
Phase A: Memory
A1 (move files) → A2 (update refs)

Phase B: Skills  
B1-B7 (move skills, can run in parallel) → B8 (update refs)

Phase C: Autonomous
C1 (move files) → C2 (update refs)

Phase D: Remove arete-context.mdc
D1 (independent, after A2, B8, C2)

Phase E: AGENTS.md
E1 (after all other phases complete)

Phase F: Final Verification
F1 (after E1)
```

**Execution order**: A1 → A2 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → C1 → C2 → D1 → E1 → F1

---

## 7. Success Criteria

- All build memory files accessible at `memory/` path
- All build skills accessible at `.agents/skills/` path
- All autonomous system files consolidated in `dev/autonomous/`
- `arete-context.mdc` removed — no mode disambiguation needed
- AGENTS.md reflects new structure
- Zero stale path references in documentation (except historical entries)
- Git history preserved for all moved files
- All tests pass
- Typecheck passes
- `config/agents/` placeholder ready for Phase 2

---

## 8. Notes

- The `dev/docs/` folder contains historical planning docs — keep as-is for now
- `dev/wisdom-registry.md` stays at `dev/` level
- Historical entries in `memory/entries/` may reference old paths — that's expected (they document history)
- `config/agents/` is a placeholder for Phase 2 (AGENTS.md rearchitecture)
