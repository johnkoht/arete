# Pre-Mortem Analysis: Onboarding Refresh

**Plan**: `dev/work/plans/onboarding-refresh-2026-03/plan.md`  
**Date**: 2026-03-24  
**Analyst**: Engineering Lead

---

## Executive Summary

This is a **medium-risk plan** with clear Phase 1 wins but architectural complexity in Phase 2. The biggest risks are: (1) missing test infrastructure for CLI commands, (2) rule changes affecting two IDE targets with no automated verification, and (3) Task 2.2's skill overhaul depending on CLI commands that don't exist yet. The dependency chain 2.1→2.2 is correctly identified but underspecified.

---

## Risk Analysis

### Risk 1: No Test Coverage for Onboard/Install Commands

**Category**: Test Patterns  
**Severity**: HIGH  
**Likelihood**: Certain (gap exists now)

**Details**:
- `onboard.ts` and `install.ts` have **zero test files** (confirmed via search)
- Phase 1 touches both files with string changes and file creation logic
- Phase 2 adds significant new functionality (integration setup, context prompts)

**What could go wrong**:
- Regressions in existing functionality (profile creation, AI credential flow)
- Changes work in manual testing but fail in edge cases (non-interactive mode, JSON output)
- `--api-key` flag and OAuth flow already have complex branching — more branches = more risk

**Mitigations**:
1. **Pre-task**: Create minimal test scaffolding for `onboard.ts` before Phase 1 starts
2. **Phase 1 ACs**: Each task must include "verify with `arete install` + `arete onboard` in fresh temp dir"
3. **Phase 2 ACs**: Integration setup flow needs at least happy-path test

**Verification criteria**: 
- `packages/cli/test/commands/onboard.test.ts` exists with at least 3 test cases
- `npm test` includes onboard/install coverage

---

### Risk 2: agent-observations.md Not in DEFAULT_FILES

**Category**: Context Gaps  
**Severity**: MEDIUM  
**Likelihood**: High (Task 1.3 will likely miss this)

**Details**:
- Task 1.3 says "Check install.ts or workspace template"
- `workspace-structure.ts` creates `.arete/memory/items/` directory but `agent-observations.md` is **not in DEFAULT_FILES**
- Subagent may look in install.ts, not find file creation, and add it there — breaking the pattern

**What could go wrong**:
- Subagent adds creation logic to `install.ts` instead of `DEFAULT_FILES`
- Creates inconsistency: some default files in `workspace-structure.ts`, one special file in `install.ts`
- `arete update` won't backfill the file because it uses `DEFAULT_FILES`

**Mitigations**:
1. **Task prompt must specify**: "Add `agent-observations.md` to `DEFAULT_FILES` in `packages/core/src/workspace-structure.ts`"
2. **Explicit pattern reference**: Point to existing memory files pattern (decisions.md, learnings.md structure)

**Verification criteria**:
- `DEFAULT_FILES['.arete/memory/items/agent-observations.md']` exists
- Fresh `arete install` → file exists at `.arete/memory/items/agent-observations.md`
- `arete update` on existing workspace → file is backfilled

---

### Risk 3: Multi-IDE Rule Synchronization

**Category**: Multi-IDE Consistency  
**Severity**: MEDIUM  
**Likelihood**: Medium (easy to forget one)

**Details**:
- Task 2.0 modifies `agent-memory.mdc` to add "Session Start" section
- Currently, `cursor/agent-memory.mdc` and `claude-code/agent-memory.mdc` are **identical** (confirmed by read)
- No automated mechanism ensures they stay in sync

**What could go wrong**:
- Subagent updates cursor version, forgets claude-code
- Divergent behavior: Cursor users get session-start injection, Claude Code users don't
- Future changes compound the drift

**Mitigations**:
1. **Task 2.0 AC must explicitly list both files**:
   - `packages/runtime/rules/cursor/agent-memory.mdc`
   - `packages/runtime/rules/claude-code/agent-memory.mdc`
2. **Post-task verification**: `diff` both files to confirm they remain identical
3. **Backlog consideration**: Add automated sync or single-source-of-truth for shared rules

**Verification criteria**:
- `diff packages/runtime/rules/cursor/agent-memory.mdc packages/runtime/rules/claude-code/agent-memory.mdc` shows no difference (or only intentional IDE-specific differences)

---

### Risk 4: Task 2.1→2.2 Dependency is Underspecified

**Category**: Dependencies  
**Severity**: HIGH  
**Likelihood**: Medium

**Details**:
- Plan says "2.1 must complete before 2.2" and "skill runs CLI commands that must work first"
- Task 2.2 says agent should "execute CLI commands itself via bash tool"
- **But**: Task 2.1 adds calendar integration to `arete onboard`, not standalone commands

**What could go wrong**:
- Task 2.1 adds calendar setup embedded in onboard flow
- Task 2.2 expects `arete integration configure apple-calendar --all` to work standalone
- The `--all` flag may not exist or work as expected for non-interactive use
- Skill tries to run commands that don't exist or behave differently than expected

**Mitigations**:
1. **Clarify 2.1 scope**: Must ensure `arete integration configure apple-calendar --all` and `arete integration configure google-calendar --all` work standalone (not just within onboard flow)
2. **Explicit AC for 2.1**: "Commands can be run independently via bash, not just interactively in onboard"
3. **Test gate**: Before starting 2.2, manually verify the commands work as expected

**Verification criteria**:
- `arete integration configure apple-calendar --all` runs non-interactively
- `arete integration configure google-calendar --all` (after OAuth) runs non-interactively
- Skill file references exact commands that exist and work

---

### Risk 5: Model Names May Have Wrong Format

**Category**: Context Gaps  
**Severity**: LOW  
**Likelihood**: Medium

**Details**:
- Task 1.1 shows "Target" model names like `anthropic/claude-haiku-4-5`
- Plan says "Check existing model references in codebase to confirm `anthropic/` prefix convention"
- Current code (line ~381) shows `anthropic/claude-3-5-haiku-latest`

**What could go wrong**:
- Model names in plan are aspirational/guessed, not verified against actual Anthropic model names
- `claude-haiku-4-5` may not be the correct model identifier
- Invalid model name → AI features silently fail or error

**Mitigations**:
1. **Pre-task**: Verify correct model names from Anthropic docs or existing working config
2. **Task prompt must include**: "Verify model names at console.anthropic.com/models before using"

**Verification criteria**:
- Model names in `arete.yaml` after install are valid (can be tested with `arete credentials test`)

---

### Risk 6: Getting-Started Skill Scope Creep

**Category**: Scope Creep  
**Severity**: MEDIUM  
**Likelihood**: High

**Details**:
Task 2.2 is a kitchen-sink of changes:
1. Run commands directly, don't delegate
2. Offer calendar choices
3. Update workspace references (remove areas, update now/)
4. Add discovery questions from self-guided-onboarding
5. Route to simplified paths

**What could go wrong**:
- Task becomes 4-hour task instead of 1-2 hours
- Subagent implements partial changes, skill becomes inconsistent
- "Borrowed" discovery questions from self-guided-onboarding may not fit the simpler flow
- Too many changes = hard to review, regressions likely

**Mitigations**:
1. **Split 2.2 into subtasks** for PRD:
   - 2.2a: Update workspace references (structural fixes)
   - 2.2b: Add calendar choice and direct command execution
   - 2.2c: Simplify discovery questions
2. **Each subtask independently testable**
3. **Strict time-box**: If 2.2 takes >2 hours, pause and reassess

**Verification criteria**:
- Each sub-change has explicit AC
- Skill can be manually tested after each sub-change

---

### Risk 7: OAuth Flows Can't Be Automated

**Category**: Integration  
**Severity**: LOW (correctly scoped)  
**Likelihood**: N/A (already addressed in plan)

**Details**:
- Plan correctly identifies that OAuth requires user interaction
- Task 2.2 says: "For OAuth flows: Guide user through browser auth manually"

**What could go wrong**:
- Implementation tries to automate OAuth anyway
- Skill instructions become confusing ("run this, wait, run this other thing")

**Mitigations**:
1. **AC must be clear**: Skill instructs user to run OAuth command, **then waits for confirmation before running --all**
2. **Test the UX flow**: Manually walk through skill to verify instructions are clear

**Verification criteria**:
- Skill includes explicit "Let me know when you've completed the browser authorization" step
- Skill doesn't attempt to run post-OAuth commands until user confirms

---

### Risk 8: Existing Workspace Migration Ambiguity

**Category**: Backward Compatibility  
**Severity**: LOW (out of scope)  
**Likelihood**: N/A (correctly scoped)

**Details**:
- Plan says "Changes apply to new installs only. Existing users won't automatically get agent-observations.md"
- But `DEFAULT_FILES` additions ARE picked up by `arete update`

**What could go wrong**:
- If we add `agent-observations.md` to `DEFAULT_FILES`, `arete update` WILL create it
- This is actually good, but plan implies it won't happen

**Mitigations**:
1. **Clarify in plan/PRD**: Adding to `DEFAULT_FILES` means `arete update` will backfill — this is intentional and correct
2. **No mitigation needed**: This is feature, not bug

**Verification criteria**:
- `arete update` on existing workspace adds `agent-observations.md` if missing
- Document this as "users can run `arete update` to get new features"

---

## Task-Specific Guidance

### Phase 1 Tasks

| Task | Key Risk | Must-Have in Prompt |
|------|----------|---------------------|
| 1.1 Model Tiers | Wrong model names | Verify names at console.anthropic.com |
| 1.2 Messaging | Minimal | N/A — straightforward string change |
| 1.3 agent-observations.md | Wrong location | Add to `DEFAULT_FILES` in `workspace-structure.ts`, not `install.ts` |

### Phase 2 Tasks

| Task | Key Risk | Must-Have in Prompt |
|------|----------|---------------------|
| 2.0 Session Start | Multi-IDE sync | Explicitly list both rule file paths; verify with diff |
| 2.1 CLI Onboard | Dependency clarity | Ensure commands work standalone, not just within onboard flow |
| 2.2 Skill Overhaul | Scope creep | Split into subtasks; strict time-box |
| 2.3 Parity | Coordination | Run after 2.1+2.2; mostly verification, not implementation |
| 2.4 Goals | Deferred | Already correctly deferred |

---

## Pre-Work Checklist (Before PRD Creation)

- [ ] Verify current Anthropic model names
- [ ] Create test scaffolding for onboard.ts (at minimum, basic smoke test)
- [ ] Confirm `arete integration configure {calendar} --all` works non-interactively
- [ ] Decide: Split Task 2.2 into subtasks? (Recommended: Yes)

---

## Summary of Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | No test coverage | Create test scaffolding pre-Phase 1 |
| 2 | Wrong file location | Specify `DEFAULT_FILES` in task prompt |
| 3 | Multi-IDE drift | Explicit file list + diff verification |
| 4 | 2.1→2.2 dependency | Clarify standalone command requirement |
| 5 | Wrong model names | Pre-task verification |
| 6 | Scope creep in 2.2 | Split into subtasks |
| 7 | OAuth automation | Already addressed in plan |
| 8 | Migration ambiguity | Clarify behavior is correct |

---

**Recommendation**: Proceed with Phase 1 after verifying model names and specifying `workspace-structure.ts` as the target. Phase 2 requires PRD with Task 2.2 split into subtasks and explicit command verification before starting 2.2.
