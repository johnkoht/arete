# Pre-Mortem: Phase 4 Commitments + Goals

**Date**: 2026-03-19
**Plan**: `commitments-goals-transcripts/plan.md`
**Risk Level**: Low

---

## Key Findings from Reviews

### PM Review Findings

1. **Cut heuristic inference** — No evidence users need it; manual is fast for 3-5 goals
2. **Split from transcripts** — Unrelated problems for different user segments
3. **Validate transcripts first** — Check if dual-source users exist before building

### Engineering Review Findings

1. **Use `goalSlug` not `goalId`** — Matches existing `projectSlug` pattern
2. **No project→goal mapping exists** — Limits heuristic options
3. **Staged extraction has infrastructure** — CLI approve command is extensible

---

## Refined Scope

| Task | Description | Status |
|------|-------------|--------|
| Task 1 | Add goalSlug to Commitment type | ✅ Keep |
| Task 2 | Update CLI commitments list | ✅ Keep |
| Task 3 | Manual goal linking during extraction | ✅ Keep |
| ~~Task 4~~ | Heuristic inference | ❌ CUT |
| ~~Tasks 5-6~~ | Transcript merging | ⏸️ DEFERRED |

---

## Risk Analysis

### 1. Empty Goals State
**Category**: User Experience
**Severity**: Low
**Likelihood**: Low

**Scenario**: User runs `arete meeting approve` but has no goals defined. Goal linking step fails or confuses.

**Mitigation**:
- [ ] Check for goals before offering linking
- [ ] If no goals: "Skipping goal linking — no active goals found"
- [ ] Graceful skip, continue with approval

---

### 2. Existing commitments.json Breakage
**Category**: Backward Compatibility
**Severity**: Medium
**Likelihood**: Very Low

**Scenario**: Adding `goalSlug` field breaks parsing of existing commitments.json files.

**Mitigation**:
- [ ] Field is optional (`goalSlug?: string`)
- [ ] Test: Parse existing commitments.json without goalSlug
- [ ] No migration needed

---

### 3. CLI UX Confusion
**Category**: User Experience
**Severity**: Low
**Likelihood**: Medium

**Scenario**: During approval, user is confused by goal selection prompt. Too many steps, unclear options.

**Mitigation**:
- [ ] Simple numbered list: "Link to goal? [1] Q1-2 Ship enterprise [2] Q1-3 ... [n] None"
- [ ] Default to "none" if user presses enter
- [ ] Skip if only 1-2 goals (offer inline: "Link to Q1-2? [y/N]")

---

### 4. Web vs CLI Inconsistency
**Category**: Feature Parity
**Severity**: Low
**Likelihood**: Expected

**Scenario**: CLI has goal linking, web UI doesn't. Users who use both get inconsistent experience.

**Mitigation**:
- [ ] Document: "Goal linking available in CLI. Web UI support coming soon."
- [ ] Add to Phase 5 backlog for web UI

---

## Summary

| # | Risk | Severity | Mitigation Required |
|---|------|----------|---------------------|
| 1 | Empty goals | Low | Yes — graceful skip |
| 2 | Backward compat | Medium | Yes — optional field |
| 3 | CLI UX | Low | Yes — simple numbered list |
| 4 | Web inconsistency | Low | Document (expected) |

**Mitigations Required**: 3 (Risks 1-3)
**Documented/Expected**: 1 (Risk 4)
