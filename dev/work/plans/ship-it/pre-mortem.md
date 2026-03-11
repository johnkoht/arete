# Pre-Mortem: Ship It Skill

## Overview

Building a mega-build skill that automates the entire plan-to-PR workflow. 8 tasks, heavy integration with existing skills and external extension.

---

### Risk 1: pi-worktrees Extension API Unknown

**Problem**: We're depending on `@zenobius/pi-worktrees` without having used it before. The API, configuration format, and error handling behaviors are unknown. Task 6 depends heavily on this working correctly.

**Mitigation**: 
- In Task 1, install and thoroughly test the extension before proceeding
- Document the actual API discovered (commands, settings, hooks)
- If the extension doesn't meet needs, have fallback: native git worktree commands with manual npm install

**Verification**: After Task 1, verify documented API matches actual behavior. Test create/remove cycle.

---

### Risk 2: Terminal Launch Platform Fragmentation

**Problem**: Terminal launch commands differ by OS (iTerm/osascript on macOS, gnome-terminal/xterm on Linux, wt on Windows). Each has different argument formats, error behaviors, and availability.

**Mitigation**:
- Start with macOS-only for V1 (the builder's platform)
- Document Linux/Windows commands but implement only macOS in Task 6
- Add graceful fallback: if terminal launch fails, print manual instructions instead of failing the skill

**Verification**: Task 6 AC includes "Graceful fallback if terminal launch fails". Check this is implemented.

---

### Risk 3: Skill-to-Skill Integration Complexity

**Problem**: This skill orchestrates multiple existing skills (run-pre-mortem, review-plan, plan-to-prd, execute-prd). Each has its own workflow, inputs, and outputs. The ship skill needs to chain them correctly and handle partial failures.

**Mitigation**:
- In Task 3, study existing skill invocation patterns before implementing
- Reference how execute-prd skill chains with other skills
- Define clear handoff points between phases (plan saved → pre-mortem starts, etc.)
- Each phase should be independently resumable if interrupted

**Verification**: Check SKILL.md documents explicit handoff contracts between phases.

---

### Risk 4: Gate Logic False Positives/Negatives

**Problem**: The PRD defines gates (pause on CRITICAL risks, pause on structural blockers). But what counts as CRITICAL vs HIGH? What's a "structural blocker"? Vague criteria lead to inconsistent behavior.

**Mitigation**:
- In Task 3, define explicit gate criteria with examples:
  - CRITICAL = "data loss risk", "security issue", "breaks existing workflows"
  - HIGH = "performance concern", "missing edge case", "tech debt"
- Structural blocker = review says "do not proceed" or identifies missing prerequisite
- Default to proceeding when ambiguous (builder can always interrupt)

**Verification**: SKILL.md includes gate decision matrix with examples.

---

### Risk 5: Worktree Git State Assumptions

**Problem**: Creating a worktree requires clean git state, existing branch naming conventions, and specific directory structures. The skill assumes these without checking.

**Mitigation**:
- Before worktree creation, check:
  - Is there uncommitted work? (git status)
  - Does the branch name conflict? (git branch --list)
  - Does the parent directory exist and is writable?
- Provide clear error messages for each failure mode

**Verification**: Task 6 includes pre-flight checks in AC.

---

### Risk 6: Memory Search Returns Noise

**Problem**: Task 4 searches memory for "relevant" entries. With 50+ entries in memory, keyword search could return too much (information overload) or too little (missing critical context).

**Mitigation**:
- Limit to 14-day recency window (per PRD)
- Cap keyword matches at 5 most relevant
- Prioritize LEARNINGS.md in directories the plan explicitly touches
- Synthesis is 3-5 bullets MAX (enforce in prompt)

**Verification**: Task 4 AC specifies "concise (3-5 bullets)". Check implementation enforces this.

---

### Risk 7: Build Phase Runs in Wrong Context

**Problem**: Tasks 7 executes in the worktree, but the skill starts in the main repo. If the orchestrator doesn't correctly switch context, execute-prd could run against wrong files or commit to wrong branch.

**Mitigation**:
- Task 6 must verify the terminal/pi session is running FROM the worktree (pwd check)
- execute-prd prompt should include explicit cwd verification
- If running from wrong directory, abort with clear error

**Verification**: Task 7 includes "verify cwd is worktree before execute-prd" step.

---

### Risk 8: No Rollback on Partial Failure

**Problem**: If the skill fails mid-execution (e.g., after committing PRD artifacts but before worktree creation), there's no defined rollback. The builder returns to an inconsistent state.

**Mitigation**:
- Each phase should be idempotent (safe to re-run)
- Document recovery steps for each failure point:
  - PRD committed but worktree failed → manual worktree or re-run /ship
  - Build failed mid-task → resume via execute-prd (existing recovery)
  - Review failed → restart review only
- Add a "resume" capability to /ship in V2

**Verification**: SKILL.md includes "Recovery" section with failure point documentation.

---

## Summary

| Risk | Category | Likelihood | Impact | Mitigation Focus |
|------|----------|------------|--------|------------------|
| pi-worktrees API | Dependencies | Medium | High | Test first, have fallback |
| Terminal fragmentation | Platform | Medium | Low | macOS-only V1, graceful fallback |
| Skill chaining | Integration | Medium | Medium | Study patterns, clear handoffs |
| Gate ambiguity | Scope | Medium | Medium | Explicit decision matrix |
| Git state | Dependencies | Low | Medium | Pre-flight checks |
| Memory noise | Quality | Medium | Low | Caps and recency filter |
| Wrong context | Integration | Low | High | CWD verification |
| No rollback | State | Medium | Medium | Idempotent phases, docs |

**Total risks identified**: 8
**Categories covered**: Dependencies (2), Platform (1), Integration (2), Scope (1), Quality (1), State (1)

---

## Recommendations

1. **Do Task 1 first and thoroughly** — If pi-worktrees doesn't work as expected, we need to know before designing around it.

2. **Task 2 (skill structure) should document recovery** — This becomes the contract for all other tasks.

3. **Keep V1 simple** — macOS-only terminal, minimal gates, clear manual recovery. V2 adds cross-platform and resume.

---

**Ready to proceed with these mitigations?**
