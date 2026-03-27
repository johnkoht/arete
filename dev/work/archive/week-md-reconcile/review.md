# Engineering Review: Week.md Auto-Reconcile

**Reviewer**: Engineering Lead (with core + CLI expertise profiles)
**Date**: 2026-03-26
**Plan**: week-md-reconcile
**Verdict**: ✅ Approve with refinements

---

## Summary

The plan is well-scoped and builds cleanly on the `priorItems` infrastructure from meeting-extraction-improvements. The pattern is familiar, the changes are additive, and test coverage is clear.

**Estimated effort**: 2-3 hours (small)

---

## Step-by-Step Review

### Step 1: Add week file completed items extraction ✅

**File**: `packages/core/src/utils/agenda.ts`

**Assessment**: Trivial. The existing `parseAgendaItems()` already handles all checkbox parsing including indentation. The new function is literally:

```typescript
export function getCompletedItems(content: string): string[] {
  return parseAgendaItems(content)
    .filter(item => item.checked)
    .map(item => item.text);
}
```

This mirrors the existing `getUncheckedAgendaItems()` (lines 47-51).

**✓ ACs are clear and testable**

**Refinement**: Add to `packages/core/src/utils/index.ts` export (as noted in AC).

---

### Step 2: Extend meeting processing with reconciliation ⚠️ Needs clarification

**File**: `packages/core/src/services/meeting-processing.ts`

**Assessment**: The pattern exists with `priorItems`. However, I have concerns about the status/source semantics:

#### Concern 1: Status semantics

Current plan: Add `'skipped'` to `ItemStatus`.

But `ItemStatus` (`'approved' | 'pending'`) is about **extraction confidence**, not user intent. The existing `StagedItemStatus` type (in `integrations/staged-items.ts`) already has `'approved' | 'skipped' | 'pending'` for the approval flow.

**Options**:
- **A**: Add `'skipped'` to `ItemStatus` (plan's approach) — means extraction sets it
- **B**: Keep `ItemStatus` as-is, use `source: 'reconciled'` + `status: 'approved'` and let CLI interpret

**Recommendation**: Option A is cleaner. The semantics are: "This item matches something already done, so it's pre-skipped." The status flows through to `stagedItemStatus` which already supports 'skipped'.

#### Concern 2: Storing matched text

The plan says "Matched text stored for display" but doesn't specify where. The current `ProcessedMeetingResult` doesn't have a field for this.

**Options**:
- Add `stagedItemMatchedText?: Record<string, string>` to result
- Return match info alongside status/source (more invasive)

**Recommendation**: Add `stagedItemMatchedText` map. CLI can use it for display. Minimal API surface change.

#### Concern 3: Threshold 0.6 vs 0.7

Plan uses 0.6 because "week.md items are often abbreviated." This is reasonable but should be documented clearly and made configurable via `ProcessingOptions`:

```typescript
/** Jaccard threshold for completed items reconciliation (default: 0.6) */
reconcileJaccard?: number;
```

#### Concern 4: Only action items

Plan says "Only action items checked" — correct. Decisions/learnings don't have "already done" semantics. Verify this is enforced in implementation.

**Refinements needed**:
- [ ] Add `stagedItemMatchedText?: Record<string, string>` to `ProcessedMeetingResult`
- [ ] Add `reconcileJaccard?: number` to `ProcessingOptions` (default 0.6)
- [ ] Ensure only action items are matched (skip decisions/learnings loop)

---

### Step 3: Integrate in CLI meeting extract ⚠️ Needs path handling

**File**: `packages/cli/src/commands/meeting.ts`

**Assessment**: The integration point is clear. However:

#### Concern 1: Week file path

The plan says "read `now/week.md`". Per core's `WorkspacePaths` pattern:
- `paths.now` = `join(workspaceRoot, 'now')`
- Week file = `join(paths.now, 'week.md')`

The CLI should use `paths` from `services.workspace.getPaths(root)`, not hardcode the path.

#### Concern 2: Output formatting

Current CLI output for staged items shows `[pending]` or `[approved]`. New output needs to show `[skipped:reconciled]` with the matched text.

Per CLI LEARNINGS.md: "All output uses shared helpers — never raw console.log(chalk.xxx(...))". May need a new formatter or extend existing one.

#### Concern 3: JSON output

Per CLI pattern, `--json` output must include reconciled items. Structure:
```json
{
  "items": [...],
  "reconciled": [
    { "id": "ai_001", "matchedText": "Send auth doc to Alex" }
  ]
}
```

**Refinements needed**:
- [ ] Use `paths.now` from `WorkspacePaths`, not hardcoded path
- [ ] Add formatter for reconciled items display
- [ ] Include reconciled items in JSON output

---

### Step 4: Tests ✅

**Assessment**: Test coverage is appropriate:
- Unit test for `getCompletedItems()` in existing `agenda.test.ts`
- Unit test for reconciliation in `meeting-processing.test.ts`
- Integration test follows CLI patterns

**Note**: CLI integration test should mock `storage.read()` for week.md, not create actual file.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| False positives skip wanted items | Medium | 0.6 threshold + display matched text so user knows why |
| Week.md missing silently | Low | Graceful handling (empty array) + no error |
| Status 'skipped' breaks downstream | Low | `StagedItemStatus` already has 'skipped'; verify flow |

---

## Recommended Changes to Plan

1. **Step 2 AC**: Add "stagedItemMatchedText map returned for matched items"
2. **Step 2 AC**: Add "reconcileJaccard threshold configurable via ProcessingOptions"
3. **Step 3 AC**: Change to "Use WorkspacePaths.now for week file path"
4. **Step 3 AC**: Add "JSON output includes reconciled items array"

---

## Questions for Builder

1. Should we also check `now/scratchpad.md` for completed items? (Plan says out of scope, but it's a common pattern.)

2. Should the matched text show the full week.md text or truncate to first N chars?

3. Do we need to update the web UI in a follow-up? (Plan says out of scope, confirming.)

---

## Verdict

**✅ Approve with refinements** — The plan is solid. Address the refinements above before building. This is a clean extension of the priorItems pattern with well-defined scope.

**Confidence**: High. The infrastructure exists, the pattern is proven, and the scope is tight.
