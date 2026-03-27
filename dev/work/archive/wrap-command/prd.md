# PRD: `/wrap` — Post-Execution Close-Out Command

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-08  
**Plan slug**: wrap-command

---

## 1. Problem & Goals

### Problem

After a PRD execution completes, there's no enforced mechanism to verify that documentation is actually up to date. The orchestrator is *supposed* to handle this in Phase 3 (holistic review + System Improvements Applied), but in practice:

- It gets skipped or done partially
- The builder has to ask the orchestrator explicitly ("did you update LEARNINGS?")
- Memory entries get created but peripheral docs (capability catalog, expertise profiles, user-facing docs) get neglected
- No single place to see what the close-out checklist requires

A manual audit on 2026-03-08 found: capability catalog was 4 days stale with 5 missing capabilities, GUIDE.md missing 7 CLI commands, UPDATES.md missing release notes. The audit took ~40 minutes — time that could be saved by automation.

### Goals

1. **Add `/wrap` command** to plan-mode extension that runs a structured close-out checklist
2. **Automated detection** for high-confidence items (memory entry exists, MEMORY.md index updated, plan status)
3. **Actionable output** showing ✅/❌/⚠️ status per item with clear instructions for gaps
4. **Tiered checklist** that adapts scope based on plan type (docs-only vs code vs architecture)
5. **Report-only V1** — command outputs status but doesn't auto-complete or spawn subagents

### Out of Scope (V2+)

- Automatic gap-filling via subagent spawning
- Auto-completion of plan status (V1 reports only; builder confirms completion separately)
- Perfect detection of all items (some will remain "manual review suggested")
- Integration with execute-prd Phase 3 (V1 is a separate safety net, not a replacement)

### Non-Goals

- Blocking plan completion on checklist failures
- Adding new state fields to PlanModeState (V1 is stateless per invocation)

---

## 2. Architecture Decisions

### Command Pattern

`/wrap` follows the existing pattern of `/review` and `/pre-mortem`:
- Implemented in `commands.ts` as `handleWrap()`
- Registered in `index.ts`
- Requires active plan (`state.currentSlug`)
- Outputs via `pi.sendUserMessage()` (message-based, not widget)
- Saves nothing persistently (report-only V1)

### Detection Strategy

Detection uses high-confidence, automatable checks:

| Item | Detection Method | Confidence |
|------|------------------|------------|
| Memory entry exists | File glob `memory/entries/*{slug}*.md` | High |
| MEMORY.md index updated | String search for slug | High |
| Plan status correct | Frontmatter read | High |
| LEARNINGS.md touched | mtime comparison (suggested review) | Medium |
| Capability catalog fresh | lastUpdated field (suggested review) | Medium |
| AGENTS.md current | mtime comparison (suggested review) | Medium |

Lower-confidence checks are marked "⚠️ suggested review" rather than ✅/❌.

### Git Fallback

If git operations fail (not a repo, detached HEAD, etc.):
- Output: "⚠️ Unable to determine changed files — manual review needed"
- Do NOT produce false "all clear" results

### Tiered Checklist

Based on plan context:

**Tier 1: All Plans**
- Memory entry exists
- MEMORY.md index contains slug
- Plan status not stuck at "building"

**Tier 2: Code Changes** (inferred from git diff or PRD tasks)
- Tier 1 + LEARNINGS.md in touched directories (suggested review)

**Tier 3: New Capabilities** (inferred from PRD tasks mentioning CLI/skill/service)
- Tier 2 + AGENTS.md freshness + capability catalog freshness (suggested review)

---

## 3. User Stories

### U1: Run close-out checklist

**As a builder**, when I run `/wrap` after completing a plan, I see a checklist showing which close-out items are done and which need attention.

**Acceptance Criteria**:
- `/wrap` command available in plan mode when a plan is open
- Command fails gracefully with message if no plan is open
- Output shows each checklist item with ✅ (done), ❌ (missing), or ⚠️ (suggested review)
- Output includes actionable instructions for each gap (e.g., "Create memory entry at memory/entries/YYYY-MM-DD_wrap-command-learnings.md")

### U2: Handle missing plan context

**As a builder**, if I run `/wrap` without an active plan, I get a clear error message.

**Acceptance Criteria**:
- Error message: "No active plan. Open a plan first with /plan open."
- Does not throw or crash

### U3: Detect memory entry and index

**As a builder**, `/wrap` automatically detects whether a memory entry exists and whether MEMORY.md has been updated.

**Acceptance Criteria**:
- Checks for files matching `memory/entries/*{slug}*.md`
- Checks MEMORY.md contains the plan slug
- Reports ✅ if found, ❌ if missing with instruction to create

### U4: Suggest LEARNINGS.md review

**As a builder**, `/wrap` suggests reviewing LEARNINGS.md in directories that were touched.

**Acceptance Criteria**:
- Uses git diff to find directories with code changes since plan creation
- For each directory with a LEARNINGS.md, reports ⚠️ "suggested review"
- If git fails, reports ⚠️ "Unable to determine — manual review needed"

### U5: Work for both PRD and direct-execution plans

**As a builder**, `/wrap` works whether I executed via PRD or directly.

**Acceptance Criteria**:
- If prd.json exists: uses task list to infer scope
- If prd.json doesn't exist: uses git diff only
- Both paths produce meaningful output

---

## 4. Tasks

### Task 1: Add `/wrap` command skeleton

Add the command handler and registration following existing patterns.

**Files**:
- `.pi/extensions/plan-mode/commands.ts` — add `handleWrap()` function
- `.pi/extensions/plan-mode/index.ts` — register `/wrap` command

**Acceptance Criteria**:
- [ ] `/wrap` responds with a message when invoked
- [ ] Command requires active plan (error if `!state.currentSlug`)
- [ ] Follows `handleReview` pattern (uses `pi.sendUserMessage()`)
- [ ] No new state fields added to `PlanModeState`
- [ ] Extension tests pass: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`

### Task 2: Implement detection logic

Add detection functions for each checklist item.

**Files**:
- `.pi/extensions/plan-mode/commands.ts` — add detection functions within `handleWrap()`

**Acceptance Criteria**:
- [ ] `checkMemoryEntry(slug)` returns boolean (file glob)
- [ ] `checkMemoryIndex(slug)` returns boolean (string search)
- [ ] `checkPlanStatus(slug)` returns status string
- [ ] `getChangedDirectories()` returns string[] (git diff) or null on failure
- [ ] `checkCapabilityCatalog()` returns lastUpdated date
- [ ] Git failure produces graceful fallback, not crash

### Task 3: Implement tiered output

Build the checklist output with status indicators.

**Files**:
- `.pi/extensions/plan-mode/commands.ts` — format and send checklist output

**Acceptance Criteria**:
- [ ] Output shows ✅/❌/⚠️ per item
- [ ] Each ❌ item has actionable instruction
- [ ] Each ⚠️ item says "suggested review"
- [ ] Output adapts based on tier (code vs docs-only)
- [ ] Sent via `pi.sendUserMessage()` for agent to process

### Task 4: Add tests and documentation

Test the new command and update documentation.

**Files**:
- `.pi/extensions/plan-mode/commands.test.ts` — add tests for `handleWrap()`
- `.pi/extensions/plan-mode/LEARNINGS.md` — add any gotchas discovered
- `dev/catalog/capabilities.json` — add `/wrap` to entrypoints

**Acceptance Criteria**:
- [ ] Tests cover: no plan open, plan open with all items done, plan open with gaps
- [ ] Tests cover: git failure fallback
- [ ] Tests pass: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`
- [ ] LEARNINGS.md updated if gotchas discovered
- [ ] Capability catalog includes `/wrap` in pi-plan-mode-extension entrypoints

---

## 5. Risk Mitigations (from Pre-Mortem)

| Risk | Mitigation | Verification |
|------|------------|--------------|
| State field sync | V1 adds no new state fields | Grep for new fields returns nothing |
| Git operations fail | Graceful fallback message | Test with invalid git dir |
| Extension tests not run | Explicit test command in tasks | Tests pass before/after |
| Hardcoded paths | Constants with comments | Code review |
| PRD vs direct plans | Both paths tested | Tests cover both |
| Scope creep | No subagent spawning in V1 | Code review |

---

## 6. Success Criteria

- `/wrap` command available and functional
- High-confidence checks (memory entry, index, status) have accurate ✅/❌
- Lower-confidence checks show ⚠️ with clear guidance
- Git failures don't produce false success
- Works for both PRD and direct-execution plans
- No regressions in existing plan-mode functionality
- Capability catalog updated
