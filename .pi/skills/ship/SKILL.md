---
name: ship
description: Meta-orchestrator for the complete plan-to-merge workflow. After plan approval, say /ship to run pre-mortem, review, memory scan, PRD creation, worktree setup, autonomous build, wrap verification, and interactive merge — all with intelligent gates that pause only when human judgment is needed.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Ship Skill

Automate the complete build workflow from approved plan to merged code. The builder says `/ship` and walks away. The system handles all mechanical steps autonomously, pausing only at intelligent gates when human judgment is truly needed.

**Relationship to Execute-PRD**: Ship is end-to-end (plan → merge). It calls `/plan-to-prd`, `/build` (execute-prd), and `/wrap` internally. Use `/ship` when you want plan-to-merge automation. Use `/build` directly when you have a PRD and worktree already set up.

## When to Use

- After `/approve` on a plan: say `/ship`
- Medium plans (3-5 steps): `/ship` or `/build` (direct execute-prd)
- Large plans (6+ steps): `/ship` (mandatory full workflow)

## Prerequisites

- Plan exists at `dev/work/plans/{slug}/plan.md` with `status: approved`
- `@zenobius/pi-worktrees` extension installed

---

## Worktree Guard (MANDATORY — Before ANY Code Execution)

Planning phases (pre-mortem, review, PRD creation) may run from the main repo. Code execution via `/build` MUST run from a worktree.

Before Phase 4.1, verify:

```bash
git_dir=$(git rev-parse --git-dir 2>/dev/null)
if [[ "$git_dir" == ".git" ]]; then
  echo "❌ You're in the main repo. Code execution blocked."
  echo "   Complete Phase 3.1 (create worktree) first."
  exit 1
fi
# Expected: .git/worktrees/{slug}/gitdir
branch=$(git branch --show-current)
echo "✅ Worktree confirmed | Branch: $branch"
```

---

## Pre-Flight Check (MANDATORY — Before Phase 1)

Read `dev/work/plans/{slug}/plan.md` frontmatter:

- `status: idea` or `draft` → **HALT**: "Run `/approve` first."
- `status: planned` or `approved` → proceed
- `has_pre_mortem: true` → skip Phase 1.2
- `has_review: true` → skip Phase 1.3
- `has_prd: true` → skip Phase 2.2

If plan has no frontmatter → **HALT**: "Use `/plan save` to recreate with proper frontmatter."

---

## Workflow Overview

```
[PHASE 0] Initialize Build Log       → build-log-protocol.md
[PHASE 1] Pre-Build (main branch)
  1.1 Save Plan
  1.2 Run Pre-Mortem                 → GATE: CRITICAL risks
  1.3 Run Cross-Model Review         → GATE: Structural blockers
[PHASE 2] Memory & PRD (main branch)
  2.1 Memory Review
  2.2 Convert to PRD
  2.3 Commit Artifacts
[PHASE 3] Worktree Setup
  3.1 Create Worktree
  3.2 Switch to Worktree
[PHASE 4] Build (worktree branch)
  4.1 Execute PRD                    → GATE: Task failures
  4.2 Final Review                   → GATE: Major rework needed
[PHASE 5] Wrap & Report (worktree branch)
  5.1 Create Memory Entry
  5.2 Update LEARNINGS.md
  5.3 Commit Implementation
  5.4 Verify with /wrap
  5.5 Generate Ship Report
  5.6 Merge Gate (via Gitboss)       → INTERACTIVE
[PHASE 6] Cleanup (after merge)
  6.1 Remove Worktree & Branch
```

---

## Phase 0: Initialize Build Log

See `ship/build-log-protocol.md` for the complete protocol.

1. Check for `dev/executions/{slug}/build-log.md`
2. **No file** → copy from `.pi/skills/ship/templates/build-log.md`, fill in slug + timestamp
3. **Exists, State ≠ COMPLETE** → append session marker, run state verification (Phase 0.3)
4. **Exists, State = COMPLETE** → confirm re-run with builder before proceeding

Update build-log at every phase start and complete (see protocol for format).

---

## Phase 1: Pre-Build

**Runs on main branch.**

### 1.1 Save Plan
If plan is in conversation (Plan Mode), run `/plan save`. Derive slug from plan title (kebab-case). **Build log**: Outcome "Saved to dev/work/plans/{slug}/plan.md".

### 1.2 Run Pre-Mortem
Load `/pre-mortem` skill against `dev/work/plans/{slug}/plan.md`. Save output to `pre-mortem.md`.

**Gate: Pre-Mortem**
| Condition | Action |
|-----------|--------|
| No CRITICAL risks | → Proceed to 1.3 |
| Any CRITICAL risk | → **PAUSE**: report to builder |

**Build log**: Outcome "{N} risks ({N} CRITICAL, {N} HIGH, {N} MEDIUM)", Artifact "pre-mortem.md".

### 1.3 Run Cross-Model Review
Load `/review-plan` skill against plan + pre-mortem. Save output to `review.md`.

**Gate: Review**
| Condition | Action |
|-----------|--------|
| No structural blockers | → Proceed to 2.1 |
| Structural blockers | → **PAUSE**: report to builder |

**Build log**: Outcome "Review: {verdict}", Artifact "review.md".

See `ship/orchestrator.md` for gate classification details.

---

## Phase 2: Memory & PRD

### 2.1 Memory Review
Search `memory/entries/` for entries from last 14 days and entries matching plan keywords. Check LEARNINGS.md in directories the plan touches. Extract preferences from `memory/collaboration.md`. Synthesize into 3-5 actionable bullets. **Build log**: Outcome "Memory synthesis: {N} bullets from {N} sources".

### 2.2 Convert to PRD
Load `/plan-to-prd` skill with memory synthesis from 2.1 in the task prompt. Generates both `prd.md` and `prd.json`. Validate prd.json has all required fields (name, branchName, tasks array). **Build log**: Outcome "PRD: {N} tasks", Artifacts "prd.md + prd.json".

### 2.3 Commit Artifacts
Stage and commit plan.md, pre-mortem.md, review.md, prd.md, prd.json on main branch. Commit message: `plan: {slug} - artifacts`. **Build log**: Outcome "Artifacts committed ({sha})".

---

## Phase 3: Worktree Setup

### 3.1 Create Worktree
Run `/worktree create {slug}`. Creates `../{repo}.worktrees/{slug}` on branch `feature/{slug}`. **Build log**: Outcome "Worktree created at {path}".

### 3.2 Switch to Worktree
Change CWD to the worktree. Verify: `.git` is a file (not directory), branch is `feature/{slug}`, PRD files accessible. **Build log**: Outcome "Switched to worktree, PRD verified".

---

## Phase 4: Build

**Runs in worktree. Apply Worktree Guard before starting.**

### 4.1 Execute PRD
Load `.pi/skills/execute-prd/SKILL.md`. Pass PRD at `dev/work/plans/{slug}/prd.md` and execution state at `dev/executions/{slug}/`. The skill handles task dispatch, reviewer checks, quality gates, and progress tracking.

**Gate: Build**
| Condition | Action |
|-----------|--------|
| All tasks pass quality gates | → Proceed to 4.2 |
| Task fails typecheck/tests (2 attempts) | → **PAUSE**: report task ID, error, options |
| Task blocked/needs clarification | → **PAUSE**: report and await builder |

**Build log**: Outcome "Executed {N}/{N} tasks, {N} iterations".

### 4.2 Final Review
Dispatch orchestrator subagent for holistic review:

```typescript
subagent({
  agent: "orchestrator",
  agentScope: "project",
  task: `Final review for ${slug}.

PRD: dev/work/plans/${slug}/prd.md
Execution state: dev/executions/${slug}/

Review holistically: Does implementation match PRD intent? Are all ACs met? Code quality, patterns, error handling? Test coverage adequate?

Return READY or NEEDS_REWORK with specific feedback.`
})
```

**Gate: Final Review**
| Condition | Action |
|-----------|--------|
| READY | → Proceed to Phase 5 |
| NEEDS_REWORK | → **PAUSE**: report issues, offer fix/override/abort |

**Build log**: Outcome "Final review: {verdict}".

---

## Phase 5: Wrap & Report

**Runs in worktree.**

### 5.1 Create Memory Entry
From `dev/executions/{slug}/` (prd.json, progress.md), synthesize a memory entry at `memory/entries/YYYY-MM-DD_{slug}-learnings.md` with 5 sections:
1. **Metrics** — tasks, success rate, iterations, tests added
2. **Pre-mortem effectiveness** — risk table (materialized? effective?)
3. **What worked / what didn't** — combined, +/- format
4. **Recommendations** — continue/stop/start
5. **Follow-ups** — refactor items, doc gaps, catalog updates

Add index line at top of `memory/MEMORY.md`. **Build log**: Outcome "Memory entry created", Artifact "memory/entries/YYYY-MM-DD_{slug}-learnings.md".

### 5.2 Update LEARNINGS.md
Review `dev/executions/{slug}/progress.md` for regressions, first-use patterns, non-obvious decisions. Update LEARNINGS.md per `.pi/standards/learnings-protocol.md`. If genuinely none, verify and note "No new learnings — verified". **Build log**: Outcome "Updated {N} LEARNINGS.md files" or "No new learnings (verified)".

### 5.3 Commit Implementation
Stage all implementation files, memory entry, and LEARNINGS.md updates. Commit on feature branch: `feat: {slug} - implementation`. Include task count, tests added, and PRD path in commit body. **Build log**: Outcome "Implementation committed ({sha})".

### 5.4 Verify with /wrap
Run `/wrap`. All ✓ → proceed. Warnings (⚠️) → note in report, proceed. Failures (✗) → fix before proceeding. **Build log**: Outcome "/wrap: {status} ({N} checks passed, {N} warnings)".

### 5.5 Generate Ship Report

Present to builder:

```markdown
# 🚢 Ship Complete: {slug}

**Duration**: {start} → {end}

| Metric | Value |
|--------|-------|
| Phases Completed | 5/5 |
| Tasks Executed | {N}/{N} |
| Quality Gates | ✓ All passed |
| Gate Pauses | {N} |
| Commits | {N} |

## Next Steps
1. Review changes in worktree
2. Create PR: `gh pr create --title "feat: {slug}"`
3. After merge: `/ship cleanup {slug}`
```

**Build log**: Outcome "Ship report generated and presented".

### 5.6 Merge Gate (via Gitboss)

Dispatch gitboss agent:

```typescript
subagent({
  agent: "gitboss",
  agentScope: "project",
  task: `Merge gate for feature/${slug}

Branch: feature/${slug}
Target: main
PRD: dev/work/plans/${slug}/prd.md
Worktree: ${worktree_path}
Main Repo: ${main_repo_path}

Run full merge flow: pre-merge checks → diff review → builder prompt (M/R/L) → merge with --no-ff → version decision → /release if requested. Report back after merge for cleanup.`
})
```

| Gitboss Response | Action |
|-----------------|--------|
| Merge success | → Proceed to Phase 6.1 (cleanup) automatically |
| Merge deferred (L) | → Skill complete; cleanup manual via `/ship cleanup {slug}` |
| Pre-merge check failed | → **PAUSE**: fix issue, then `@gitboss merge feature/{slug}` |

**Build log**: Outcome "Merged to main ({sha})" or "Merge deferred". State → COMPLETE.

---

## Phase 6: Cleanup

### 6.1 Remove Worktree & Branch

Triggered automatically after successful merge in Phase 5.6, or manually via `/ship cleanup {slug}`.

1. Verify branch is merged: `git branch --merged origin/main | grep feature/{slug}`
2. If merged: remove worktree via `/worktree remove {slug}`, then `git branch -D feature/{slug}`, `git push origin --delete feature/{slug}`
3. If NOT merged and force-cleanup requested: confirm with builder before deleting unmerged branch

```
┌──────────────────────────────────┐
│  ✅ Ship Complete & Merged       │
├──────────────────────────────────┤
│  ✓ Feature merged to main        │
│  ✓ Worktree removed              │
│  ✓ Branch cleaned up             │
│  Memory: entries/YYYY-MM-DD_...  │
└──────────────────────────────────┘
```

---

## Recovery

### Failure Point Matrix

| Phase | Failure | Recovery |
|-------|---------|----------|
| 1.1 | Plan save fails | Re-run `/ship` (idempotent) |
| 1.2 | Gate PAUSE (CRITICAL risk) | Address risk → `/ship resume` |
| 1.3 | Gate PAUSE (blockers) | Address blockers → `/ship resume` |
| 2.2 | PRD creation fails | Run `/plan-to-prd` manually |
| 2.3 | Commit fails | `git add && git commit` manually |
| 3.1 | Worktree creation fails | Check git state, retry `/worktree create` |
| 4.1 | Task fails quality gates | Resume via execute-prd |
| 4.2 | NEEDS_REWORK | Address feedback, re-run 4.2 |
| 5.1-5.4 | Wrap artifacts fail | Address specific failure, re-run phase |
| 5.6 | Merge conflicts | Resolve or `gh pr create` for GitHub resolution |
| 5.6 | Builder defers | Manual merge → `/ship cleanup {slug}` |
| 6.1 | Worktree remove fails | Check for processes; `git worktree remove --force` |

### Resume from Stall

1. Run `/ship {slug}` — Phase 0 detects existing build-log
2. Phase 0.3 verifies artifacts match logged state
3. Resume from logged phase automatically

See `ship/build-log-protocol.md` for state verification details.

---

## References

- **Build log protocol**: `ship/build-log-protocol.md`
- **Gate decisions**: `ship/orchestrator.md`
- **Ship report template**: `ship/templates/ship-report.md`
- **Build log template**: `ship/templates/build-log.md`
- **Subagent dispatch**: `.pi/standards/subagent-dispatch.md`
- **Learnings protocol**: `.pi/standards/learnings-protocol.md`
