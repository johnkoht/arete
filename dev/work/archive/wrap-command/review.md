# Review: `/wrap` Command Plan

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal tooling for Areté development)  
**Date**: 2026-03-08

---

## Concerns

### 1. **Scope — V1 should exclude subagent spawning**

The plan's step 3 mentions "spawn subagent with specific instructions" for gap-filling. This adds significant complexity (subagent orchestration, error handling, progress tracking). 

**Suggestion**: V1 outputs actionable instructions only. "LEARNINGS.md needs update at packages/core/src/services/" is sufficient. Builder or next agent turn can act. Defer subagent spawning to V2.

### 2. **Dependencies — No new state fields needed for V1**

Pre-mortem identified state field sync as high risk. Reviewing the plan, V1 doesn't actually need new persistent state — it's a one-shot command that:
- Reads plan context
- Runs detection
- Outputs results
- (Optionally) updates plan status

**Suggestion**: Explicitly note: "V1 adds no new state fields to PlanModeState." This eliminates risk 1 entirely.

### 3. **Test patterns — Must run extension tests**

Per LEARNINGS.md, extension tests aren't run by `npm test`. 

**Suggestion**: Add to step 1: "Run `npx tsx --test '.pi/extensions/plan-mode/*.test.ts'` before and after to catch regressions."

### 4. **Completeness — Missing fallback for git failures**

Step 2 uses git diff for detection. Need explicit handling when git fails.

**Suggestion**: Add to step 2: "If git operations fail, output 'Unable to determine changed files — manual review needed' rather than false success."

### 5. **Catalog — Capability catalog entry needed**

The plan adds a new command (`/wrap`) to pi-plan-mode-extension. After completion, `dev/catalog/capabilities.json` needs updating.

**Suggestion**: Add to acceptance criteria or close-out: "Update capabilities.json entrypoints to include /wrap."

### 6. **Documentation — LEARNINGS.md update**

Any gotchas discovered during implementation (there will be some) need to go into `.pi/extensions/plan-mode/LEARNINGS.md`.

**Suggestion**: Add to acceptance criteria: "LEARNINGS.md updated if any gotchas discovered."

---

## Strengths

1. **Problem well-validated**: The manual audit (40 min, found real gaps) proves the need
2. **Tiered checklist design**: Handles docs-only vs code vs architecture changes appropriately  
3. **Builds on existing patterns**: `/review`, `/pre-mortem` set the pattern — `/wrap` follows it
4. **Clear acceptance criteria**: 6 specific, testable criteria
5. **Scoped appropriately**: V1 is detection + reporting, not full automation

---

## Devil's Advocate

**If this fails, it will be because...**

The detection logic produces too many false positives or N/A items, making the output noisy and ignored. Builder runs `/wrap`, sees 8 items with 5 marked "unable to detect" and 2 marked "manual review needed," stops trusting the tool. The value proposition (catch documentation gaps) fails because the signal-to-noise ratio is poor.

**Mitigation**: V1 should focus on high-confidence, automatable checks only:
- Memory entry exists (file glob — high confidence)
- MEMORY.md index contains slug (string search — high confidence)  
- Plan status not stuck at building (frontmatter read — high confidence)

Lower-confidence checks (LEARNINGS.md mtime, capability catalog freshness) can be marked "suggested review" rather than red/green.

**The worst outcome would be...**

Builder becomes dependent on `/wrap` as the close-out mechanism, but it has a bug where it marks plans complete without actually checking. Multiple PRDs get "closed" with stale documentation, and the builder only discovers this weeks later when gaps have accumulated. Trust in the entire close-out process erodes.

**Mitigation**: V1 should NEVER auto-mark complete. It reports status; builder explicitly approves completion. The "set status to complete" should require a separate confirmation or be a manual follow-up action.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Required Changes Before Proceeding

1. Explicitly scope out subagent spawning (V2 feature)
2. Add explicit fallback for git failures
3. Add extension test running to implementation steps
4. Add capability catalog update to close-out

### Suggested Additions

1. V1 reports status but doesn't auto-complete plans
2. Lower-confidence checks marked "suggested review" vs hard pass/fail
3. Update LEARNINGS.md as part of close-out

---

**Ready to create PRD with these adjustments incorporated.**
