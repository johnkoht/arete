## Pre-Mortem: Workflow Stability & Versioning

**Analyzed**: 2026-03-27

### Risk 1: Plan-Mode State Complexity

**Problem**: The plan-mode extension has intricate state management (`PlanModeState`, `CommandContext`, `PlanFrontmatter`). Subagents implementing Steps 1-4 may not understand how state flows between commands, leading to broken status transitions or lost data.

**Mitigation**: 
- Before spawning, require reading: `.pi/extensions/plan-mode/commands.ts`, `persistence.ts`, `LEARNINGS.md`
- Include state flow summary in prompt: "Status transitions happen via `updatePlanFrontmatter()`. Auto-save is disabled for loaded plans."
- Reference existing test patterns in `commands.test.ts` for verification

**Verification**: Check prompt includes file reading list and state management summary.

---

### Risk 2: Migration Disrupts Active Work

**Problem**: Step 5 moves 34 ideas to backlog. If done carelessly, could disrupt the 1 planned or 4 complete plans, or break any in-flight work references.

**Mitigation**:
- Migration script as separate, reviewable task
- Script should ONLY touch `status: idea` plans
- Dry-run mode first: `--dry-run` shows what would move without moving
- Builder reviews list before execution
- Keep `plans/` folder for `draft`, `planned`, `building`, `complete` only

**Verification**: Dry-run output reviewed by builder before actual migration runs.

---

### Risk 3: Ship Skill Integration Breaks

**Problem**: Steps 2-3 modify how `/ship` handles status. Step 6 replaces Phase 5.6 merge logic with gitboss. Changes to ship skill are high-risk — it's 2000+ lines with complex phase dependencies.

**Mitigation**:
- Don't modify ship skill inline — add hooks/callbacks instead
- Step 2: Add status check at very start (before Phase 1.1)
- Step 3: Add status update calls at existing transition points
- Step 6: Ship calls `@gitboss` at Phase 5.6 rather than rewriting merge logic
- Test full `/ship` flow after changes (not just unit tests)

**Verification**: After implementation, run a test `/ship` on a dummy plan to verify full flow works.

---

### Risk 4: Gitboss Scope Creep

**Problem**: New agent might try to do too much — code review, architecture decisions, refactoring suggestions. Should ONLY handle: review changes, merge, decide version bump.

**Mitigation**:
- Agent definition has explicit boundaries section
- Three responsibilities only: (1) review diff, (2) merge to main, (3) run `/release` if appropriate
- No code changes, no suggestions beyond "merge or don't merge"
- If review finds issues → report back, don't fix

**Verification**: Review agent definition for scope boundaries before shipping.

---

### Risk 5: `/release` Command Conflicts with Git State

**Problem**: `/release` creates tags, updates CHANGELOG, modifies package.json. If run at wrong time (dirty working tree, mid-merge, wrong branch) could create inconsistent state.

**Mitigation**:
- Pre-flight checks: clean working tree, on main branch, no pending merges
- Atomic operation: all changes in single commit
- Clear error messages for each pre-flight failure
- `--dry-run` mode to show what would happen

**Verification**: Test `/release --dry-run` before any actual release.

---

### Risk 6: Archive Path Conflicts

**Problem**: Step 4 moves plans to `dev/work/archive/YYYY-MM/{slug}/`. If slug already exists in archive (re-shipped plan with same name), could overwrite.

**Mitigation**:
- Check for existing archive path before moving
- If conflict: append counter (`-2`, `-3`) or use full timestamp in path
- Archive is append-only — never overwrite

**Verification**: Test archiving a plan with duplicate slug.

---

### Risk 7: Test Coverage Gaps

**Problem**: Plan-mode has good test coverage (commands.test.ts is 73KB). New features need matching tests. If tests aren't written, regressions are likely in future changes.

**Mitigation**:
- Each step must include test additions
- Follow existing test patterns (mock `CommandContext`, use `createDefaultState()`)
- Run full test suite after each step, not just new tests
- Acceptance criteria include "tests pass"

**Verification**: Check test file diffs include new test cases for each feature.

---

### Risk 8: Backlog Format Inconsistency

**Problem**: Step 5 says backlog items are "lightweight markdown (no frontmatter required)". But `/plan promote` needs to parse them. If format varies, promote breaks.

**Mitigation**:
- Define minimal backlog format: `# Title` on line 1, description follows
- `/plan promote` extracts title from H1, uses filename as slug
- Document format in backlog README
- Don't require frontmatter but parse it if present

**Verification**: Test `/plan promote` on existing backlog items (3 files).

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Context Gaps, Integration, Scope Creep, Code Quality, Dependencies, Platform Issues, State Tracking, Test Patterns

**Highest concern**: Risk 3 (Ship Skill Integration) — ship is complex, changes are high-risk  
**Easiest to mitigate**: Risk 4 (Gitboss Scope) — clear boundaries in agent definition
