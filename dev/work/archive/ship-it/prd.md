# Ship It — Mega Build Skill

**Status**: Draft  
**Size**: Large (8 steps)  
**Type**: New Feature

---

## Problem Statement

After shaping a plan, the builder must manually shepherd it through 7 mechanical steps (save → pre-mortem → review → PRD → build → final review → wrap). Each step requires approval, forcing the builder to stay present for work that doesn't need human judgment.

**User**: Builder (internal — Areté development workflow)

**Pain**: ~30-60 minutes of context-switching and waiting between approvals for each feature

**Success Criteria**:
- Builder says `/ship` after plan approval and can walk away
- System pauses only when human judgment is actually needed (critical risks, blockers, failures)
- Final output is a PR ready for human review and merge

---

## Plan

### 1. Install and configure pi-worktrees extension

Install `@zenobius/pi-worktrees` globally and configure for Areté:
- Set `parentDir` to `../arete.worktrees/{{name}}`
- Set `onCreate` to `npm install`

**Acceptance Criteria**:
- [ ] Extension installed: `pi install npm:@zenobius/pi-worktrees`
- [ ] Settings configured in `~/.pi/agent/pi-worktrees-settings.json`
- [ ] `/worktree create test-feature` creates worktree successfully
- [ ] `npm install` runs automatically after creation
- [ ] `/worktree remove test-feature` cleans up

---

### 2. Create ship skill structure

Create `.pi/skills/ship/` with:
- `SKILL.md` — Main skill definition with workflow, gates, and error handling
- `orchestrator.md` — Ship orchestrator agent persona and decision-making
- `templates/ship-report.md` — Final summary report template

**Acceptance Criteria**:
- [ ] Skill directory structure exists
- [ ] SKILL.md defines complete workflow with all gates
- [ ] Orchestrator persona documented with gate decision criteria
- [ ] Report template includes: phases completed, time taken, artifacts created, PR link

---

### 3. Implement pre-build phase (save → pre-mortem → review)

Orchestrator runs:
1. Save plan to current plan directory
2. Run pre-mortem via `run-pre-mortem` skill
3. Run cross-model review via `review-plan` skill

Gate logic:
- Pre-mortem: Pause if any CRITICAL risk; proceed if HIGH/MEDIUM only
- Review: Pause if structural blockers; proceed if minor suggestions only

**Acceptance Criteria**:
- [ ] Plan saved to `dev/work/plans/<slug>/plan.md`
- [ ] Pre-mortem runs and produces `pre-mortem.md`
- [ ] Review runs and produces `review.md`
- [ ] Gate logic correctly pauses on CRITICAL risks
- [ ] Gate logic correctly pauses on structural blockers
- [ ] Clear error message when paused, explaining why and what to do

---

### 4. Implement memory review phase

Before PRD creation, orchestrator:
1. Searches `memory/entries/` for entries from last 14 days
2. Searches for entries matching plan keywords
3. Checks LEARNINGS.md in directories plan touches
4. Reviews `memory/collaboration.md`

Produces 3-5 bullet synthesis of insights to inform PRD.

**Acceptance Criteria**:
- [ ] Recent entries (14 days) retrieved and summarized
- [ ] Keyword search finds relevant past work
- [ ] LEARNINGS.md files in relevant directories are read
- [ ] Collaboration profile preferences extracted
- [ ] Synthesis is concise (3-5 bullets) and actionable
- [ ] Synthesis is included in PRD handoff context

---

### 5. Implement PRD creation and commit phase

Orchestrator:
1. Converts plan to PRD using `plan-to-prd` skill (informed by memory synthesis)
2. Creates `prd.json` for autonomous execution
3. Commits all artifacts: `git commit -m "plan: <slug> - PRD and artifacts"`

**Acceptance Criteria**:
- [ ] PRD created with memory insights incorporated
- [ ] `prd.json` generated correctly
- [ ] All plan artifacts committed (plan.md, pre-mortem.md, review.md, prd.md, prd.json)
- [ ] Commit message follows convention: `plan: <slug> - PRD and artifacts`

---

### 6. Implement worktree creation and terminal launch

Orchestrator:
1. Creates worktree: `/worktree create <slug>`
2. Detects platform (macOS/Linux/Windows)
3. Opens appropriate terminal in worktree directory
4. Starts pi in worktree

Cross-platform terminal commands:
- macOS: osascript → iTerm
- Linux: gnome-terminal or xterm
- Windows: Windows Terminal (wt)

**Acceptance Criteria**:
- [ ] Worktree created at `../arete.worktrees/<slug>`
- [ ] Branch `feature/<slug>` created
- [ ] `npm install` runs via onCreate hook
- [ ] Terminal opens in worktree directory
- [ ] Pi starts in new terminal
- [ ] Graceful fallback if terminal launch fails (message with manual instructions)

---

### 7. Implement build and wrap phase

In worktree, orchestrator:
1. Executes PRD via `execute-prd` skill
2. Spawns eng lead for final review
3. Runs wrap (memory entry, LEARNINGS update, index)
4. Commits: `git commit -m "feat: <slug> - implementation"`
5. Generates ship report

Gate logic:
- Build: Pause if any task fails quality gates
- Final review: Pause if major rework needed

**Acceptance Criteria**:
- [ ] execute-prd runs all tasks
- [ ] Eng lead review spawned after build completion
- [ ] Memory entry created in `memory/entries/`
- [ ] LEARNINGS.md updated if gotchas found
- [ ] Index updated
- [ ] Implementation committed with correct message
- [ ] Ship report generated with summary

---

### 8. Implement /ship cleanup command

New command `/ship cleanup <slug>`:
1. Checks if branch is merged to main
2. If merged: removes worktree, deletes branch
3. If not merged: warns user, requires confirmation to force-remove

**Acceptance Criteria**:
- [ ] `/ship cleanup <slug>` command registered
- [ ] Merge status checked correctly
- [ ] Merged branches: worktree removed, branch deleted
- [ ] Unmerged branches: warning shown, confirmation required
- [ ] Force cleanup works with confirmation

---

## Pre-Mortem Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gate logic too aggressive (pauses too often) | Medium | Medium | Start permissive, tighten based on experience |
| Gate logic too permissive (misses real issues) | Medium | High | Conservative defaults; CRITICAL always pauses |
| Terminal launch fails on some platforms | Medium | Low | Graceful fallback with manual instructions |
| Memory search returns too much/too little | Medium | Medium | Time-box search, cap results, tune keywords |
| Worktree npm install fails | Low | Medium | onCreate failure is non-blocking; report and continue |
| execute-prd fails mid-build | Medium | Medium | Existing execute-prd error handling applies |

---

## Out of Scope

- Auto-merge (always leave as PR for human review)
- Adaptive depth based on complexity/risk scoring
- Parallel task execution within PRD
- Learning loops that adjust gate thresholds over time
- holdpty integration (terminal window approach for V1)
- Multi-repo support

---

## Dependencies

- Existing skills: `execute-prd`, `review-plan`, `run-pre-mortem`, `plan-to-prd`
- Extension: `@zenobius/pi-worktrees`
- CLI: `arete memory search`, git
- Platform: macOS (primary), Linux/Windows (supported)

---

## Testing Strategy

1. **Unit**: Gate decision logic (given pre-mortem output, should pause/proceed?)
2. **Integration**: Full `/ship` flow on a test plan
3. **Manual**: Cross-platform terminal launch verification

---

## Rollout

1. Install pi-worktrees, verify worktree workflow works manually
2. Build skill incrementally (pre-build → memory → PRD → worktree → build → cleanup)
3. Test with a real small plan
4. Iterate based on first few uses
