# Pre-Mortem: Week.md Auto-Reconcile

**Plan**: week-md-reconcile
**Date**: 2026-03-26
**Size**: Small (4 Phase 1 steps + 2 Phase 2 steps)

---

## Risk Analysis

### Risk 1: ItemStatus Type Change Breaks Downstream

**Category**: Integration

**Problem**: Adding `'skipped'` to `ItemStatus` type may break consumers that only expect `'approved' | 'pending'`. The `StagedItemStatus` type (in `integrations/staged-items.ts`) already has `'skipped'`, but `ItemStatus` in `meeting-processing.ts` doesn't. If any code does exhaustive matching on ItemStatus values, it will fail.

**Mitigation**:
- Before changing ItemStatus, grep for all usages: `grep -rn "ItemStatus" packages/`
- Check if any switch statements or exhaustive checks exist
- Verify that `StagedItemStatus` (approval flow) and `ItemStatus` (processing flow) are mapped correctly

**Verification**: All ItemStatus usages audited before type change. No exhaustive checks broken.

---

### Risk 2: Jaccard Matching Logic Duplication

**Category**: Code Quality

**Problem**: The plan says "reuse itemMatchesPriorItems pattern" but might accidentally duplicate logic instead of properly reusing it. The priorItems matching has specific behavior (negation marker bypass, pre-tokenization) that should be consistent.

**Mitigation**:
- Read existing `itemMatchesPriorItems()` function (lines ~180-200 in meeting-processing.ts)
- Either call the existing function directly, or create a shared `matchAgainstItems()` helper
- completedItems should NOT use negation marker bypass (that's for cross-meeting dedup semantics)

**Verification**: No duplicate Jaccard matching logic. Either reuse existing or extract shared helper.

---

### Risk 3: WorkspacePaths.now Doesn't Exist

**Category**: Context Gaps

**Problem**: The plan assumes `paths.now` exists in `WorkspacePaths`. Need to verify this field actually exists and is populated correctly.

**Mitigation**:
- Before CLI implementation, check `WorkspacePaths` interface in `packages/core/src/models/workspace.ts`
- If `now` doesn't exist, add it (small change) or construct path from `paths.root + '/now'`

**Verification**: Confirm `paths.now` exists or document alternative path construction.

---

### Risk 4: Empty week.md/scratchpad.md Files

**Category**: Integration

**Problem**: If week.md or scratchpad.md exist but are empty (or contain no checkboxes), `getCompletedItems()` returns empty array. This is correct behavior, but edge case: what if file contains malformed checkboxes (e.g., `- [X]` uppercase, `* [x]` asterisk)?

**Mitigation**:
- Review existing `parseAgendaItems()` regex to confirm it handles case-insensitive checkbox
- Current regex: `/^[\s]*-\s*\[([ xX])\]\s*(.+)$/` — handles both x and X ✓
- Add test case for edge cases (uppercase X, indented checkboxes)

**Verification**: Unit tests cover uppercase X, indented checkboxes, and mixed content.

---

### Risk 5: Test Mocking for CLI Integration

**Category**: Test Patterns

**Problem**: CLI test needs to mock reading week.md and scratchpad.md. The existing meeting-extract tests may not have this pattern.

**Mitigation**:
- Check existing `meeting-extract.test.ts` for storage mocking patterns
- Use same `createMockStorage()` pattern with additional reads for week.md/scratchpad.md
- If no existing pattern, follow the core `testDeps` approach

**Verification**: CLI test uses consistent mocking pattern with existing tests.

---

### Risk 6: JSON Output Structure Not Documented

**Category**: Scope Creep

**Problem**: Plan says "JSON output includes `reconciled` array: `[{ id, matchedText }]`" but doesn't specify where in the JSON structure. Could conflict with existing structure.

**Mitigation**:
- Check existing JSON output structure in meeting extract command
- Add `reconciled` as a top-level key alongside existing keys
- Document exact structure in AC for clarity

**Verification**: JSON output structure documented and consistent with existing output.

---

## Risk Summary

| # | Risk | Severity | Category |
|---|------|----------|----------|
| R1 | ItemStatus type change breaks downstream | Medium | Integration |
| R2 | Jaccard matching logic duplication | Low | Code Quality |
| R3 | WorkspacePaths.now doesn't exist | Low | Context Gaps |
| R4 | Edge cases in checkbox parsing | Low | Integration |
| R5 | CLI test mocking patterns | Low | Test Patterns |
| R6 | JSON output structure conflict | Low | Scope Creep |

**No CRITICAL risks identified.** All risks are manageable with stated mitigations.

---

## Pre-Mortem Checklist for Execution

Before each step, verify:

- [ ] **Step 1**: R4 — Test edge cases (uppercase X, indentation)
- [ ] **Step 2**: R1 — Audit ItemStatus usages; R2 — Reuse Jaccard pattern correctly
- [ ] **Step 3**: R3 — Verify paths.now; R6 — Document JSON structure
- [ ] **Step 4**: R5 — Follow existing CLI test patterns
