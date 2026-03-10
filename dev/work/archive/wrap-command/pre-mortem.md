# Pre-Mortem: `/wrap` Command Implementation

**Date**: 2026-03-08  
**Plan**: wrap-command  
**Size**: Small (4 steps)

---

## Risk 1: State Field Addition Without Sync

**Problem**: Adding new state tracking (e.g., `wrapRun` flag) requires updating 6+ locations: `PlanModeState` interface, `createDefaultState()`, `persistState()` in index.ts, session restore block in `session_start`, and all state reset points (handlePlanNew, handlePlanClose, handleArchive, handlePlanDelete). Missing one causes silent inconsistency or session restore bugs.

**Mitigation**: 
- Before adding any state field, grep for all occurrences of an existing field (e.g., `preMortemRun`) and update all matching locations
- Checklist in LEARNINGS.md already documents this — reference it

**Verification**: After implementation, search codebase for new field name — should appear in all 6+ required locations.

---

## Risk 2: Git Operations Fail Silently

**Problem**: Detection logic uses `git diff` to find files touched since plan start. Git operations can fail (not a repo, dirty state, detached HEAD) and return empty results, causing false "nothing to check" reports.

**Mitigation**:
- Wrap git calls in try/catch
- If git fails, fall back to "unable to determine changed files — manual review needed"
- Report the git error in output so builder knows detection is incomplete

**Verification**: Test with `GIT_DIR=/nonexistent` to simulate git failure — should show fallback message, not empty success.

---

## Risk 3: Extension Tests Not Run by npm test

**Problem**: Per LEARNINGS.md, extension tests live in `.pi/extensions/plan-mode/*.test.ts` and are NOT discovered by `npm test`. Changes could pass CI but have broken command handlers.

**Mitigation**:
- Run extension tests explicitly before and after: `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'`
- Add test cases for `handleWrap()` in `commands.test.ts`

**Verification**: Extension test command runs successfully with new tests passing.

---

## Risk 4: Mtime Comparisons Across Timezones/DST

**Problem**: Detection uses file mtime to check if LEARNINGS.md was updated since plan start. Timezone issues or clock skew could cause false positives/negatives.

**Mitigation**:
- Use relative comparison (mtime > plan.frontmatter.created) not absolute
- Accept 1-minute tolerance to handle edge cases
- Document limitation: "mtime-based detection may have edge cases"

**Verification**: Check that comparison uses ISO timestamps from frontmatter, not local time strings.

---

## Risk 5: Widget Rendering Breaks Footer

**Problem**: plan-mode already has a complex footer widget. Adding `/wrap` output to TUI could conflict with existing widget rendering or overflow terminal width.

**Mitigation**:
- `/wrap` outputs as a message (like `/review`, `/pre-mortem`), NOT as a persistent widget
- Don't modify `widget.ts` — keep wrap output in `commands.ts` via `pi.sendMessage()` or `pi.sendUserMessage()`

**Verification**: After implementation, toggle plan mode on/off — footer should be unchanged.

---

## Risk 6: Detection Logic Hardcodes Paths

**Problem**: Checklist items reference paths like `memory/entries/`, `dev/catalog/capabilities.json`. If these change, detection breaks silently.

**Mitigation**:
- Define paths as constants at top of detection functions
- Cross-reference with `persistence.ts` constants where applicable (already defines `DEFAULT_PLANS_DIR`)
- Comment paths with "matches AGENTS.md § Workspace"

**Verification**: Grep for hardcoded paths in new code — each should have a comment or constant.

---

## Risk 7: PRD vs Direct-Execution Plans Have Different Context

**Problem**: PRD-executed plans have `prd.json` with task list; direct-execution plans don't. Detection logic needs to handle both, but branching could miss cases.

**Mitigation**:
- Check for `prd.json` existence first
- If exists: use task list for scope inference
- If not: fall back to git diff only
- Test both paths explicitly

**Verification**: Test `/wrap` on a PRD plan and a direct-execution plan — both should complete.

---

## Risk 8: Scope Creep into Subagent Gap-Filling

**Problem**: The design calls for "offer to spawn subagent to fill gaps." Subagent orchestration is complex (see execute-prd skill). Adding this to `/wrap` could balloon scope.

**Mitigation**:
- V1: Output actionable instructions only, no automatic gap-filling
- "LEARNINGS.md needs update in packages/core/src/services/" is sufficient — builder or agent can act
- Defer subagent spawning to V2 if V1 proves valuable

**Verification**: Implementation contains no `subagent` tool calls — only message output.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | State field sync | Code Quality | High |
| 2 | Git operations fail | Platform Issues | Medium |
| 3 | Extension tests not run | Test Patterns | High |
| 4 | Mtime timezone issues | Platform Issues | Low |
| 5 | Widget rendering conflicts | Integration | Medium |
| 6 | Hardcoded paths | Dependencies | Medium |
| 7 | PRD vs direct plans | Integration | Medium |
| 8 | Scope creep into subagents | Scope Creep | Medium |

**Total risks identified**: 8  
**Categories covered**: Code Quality, Platform Issues, Test Patterns, Integration, Dependencies, Scope Creep

**Highest priority mitigations**:
1. Run extension tests before/after (Risk 3)
2. Grep for existing state field pattern before adding new ones (Risk 1)
3. V1 outputs instructions only, no subagent spawning (Risk 8)

---

**Ready to incorporate into plan and proceed to review.**
