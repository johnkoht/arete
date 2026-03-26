# Week.md Auto-Reconcile PRD Learnings

**Date**: 2026-03-26
**PRD**: `dev/work/plans/week-md-reconcile/`
**Branch**: `feature/week-md-reconcile`

---

## Metrics

- **Tasks**: 4/4 complete
- **First-attempt success**: 100% (0 iterations)
- **Pre-mortem risks materialized**: 0/6
- **Tests added**: ~20 new tests
- **Tests passing**: 2148 (0 fail)
- **Commits**: 4 (1 per task + wrap)

---

## What Was Built

Auto-reconciliation during meeting processing that skips action items matching completed tasks in `now/week.md` or `now/scratchpad.md`.

**New exports**:
- `getCompletedItems(content: string): string[]` — extracts checked checkbox text from markdown
- `ItemStatus` now includes `'skipped'`
- `ItemSource` now includes `'reconciled'`
- `ProcessingOptions.completedItems` — completed task texts to match against
- `ProcessingOptions.reconcileJaccard` — threshold (default 0.6)
- `ProcessedMeetingResult.stagedItemMatchedText` — matched text for reconciled items

**CLI output**:
```
✓ item-123: Already done (matched: "Send auth doc to Alex...")
```

---

## Pre-mortem Analysis

| Risk | Materialized? | Notes |
|------|--------------|-------|
| R1: ItemStatus type change breaks downstream | No | Grepped all usages; no exhaustive checks |
| R2: Jaccard matching logic duplication | No | Reused existing pattern |
| R3: WorkspacePaths.now doesn't exist | No | Used `join(paths.root, 'now')` |
| R4: Edge cases in checkbox parsing | No | Existing regex handles all cases |
| R5: CLI test mocking patterns | No | Followed existing `--prior-items` test |
| R6: JSON output structure conflict | No | Clean addition of `reconciled` array |

---

## What Worked Well

1. **Building on priorItems pattern**: The `meeting-extraction-improvements` PRD established the Jaccard matching infrastructure. This PRD reused it cleanly — no architecture changes, just adding a new source of items to match against.

2. **Lower threshold (0.6 vs 0.7)**: week.md items are often abbreviated ("Send auth doc" vs "Send authentication documentation to Alex by Friday"). The 0.6 threshold catches these while avoiding false positives.

3. **Only action items**: Decisions and learnings don't have "already done" semantics. Scoping to action items only kept the feature focused and avoided edge cases.

---

## Technical Patterns

### Reconciliation vs Dedup

Two similar but distinct matching flows:
- **Dedup** (`priorItems`): Cross-meeting deduplication. Source = `'dedup'`, status = `'approved'`. Uses 0.7 threshold.
- **Reconciliation** (`completedItems`): Match against completed tasks. Source = `'reconciled'`, status = `'skipped'`. Uses 0.6 threshold.

Both use Jaccard similarity but have different semantics and outputs.

### Matched Text Truncation

Stored matched text truncated to 60 chars for display:
```typescript
const truncated = matchedText.length > 60 
  ? matchedText.slice(0, 57) + '...' 
  : matchedText;
```

Full text available in source file (`now/week.md` or `now/scratchpad.md`).

---

## What Could Improve

1. **Web UI integration (Phase 2)**: CLI-only for now. Phase 2 would add reconciled items to the triage UI with override capability.

2. **Daily progress section**: `now/week.md` has a daily progress section with different structure. Future enhancement could parse this separately.

---

## Out of Scope (Intentionally)

- **Decisions/learnings reconciliation**: These don't have "already done" semantics
- **Daily progress parsing**: Structurally different, needs separate implementation
- **Override in CLI**: Web UI feature only (Phase 2)
