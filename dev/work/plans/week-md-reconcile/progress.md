# week-md-reconcile Progress

**Started**: 2026-03-26
**Status**: Complete

---

## Task 1: Add completed items extraction utility
**Status**: ✅ Complete | **Attempts**: 1

**Commit**: `563e21e feat(core): add getCompletedItems utility for week.md reconciliation`

**Implementation**:
- Added `getCompletedItems(content: string): string[]` to `packages/core/src/utils/agenda.ts`
- Reuses existing `parseAgendaItems()`, filters to `checked: true`
- Exported from `packages/core/src/utils/index.ts`

**Tests**: 5 test cases in `agenda.test.ts` covering basic, indented, uppercase X, mixed content

---

## Task 2: Extend meeting processing with reconciliation
**Status**: ✅ Complete | **Attempts**: 1

**Commit**: `ddf8c1d feat(core): add completedItems reconciliation to meeting processing`

**Implementation**:
- Added `'skipped'` to `ItemStatus` type
- Added `'reconciled'` to `ItemSource` type
- Added `completedItems?: string[]` and `reconcileJaccard?: number` (default 0.6) to `ProcessingOptions`
- Added `stagedItemMatchedText?: Record<string, string>` to `ProcessedMeetingResult`
- Reuses Jaccard matching from `priorItems` pattern
- Only action items checked (decisions/learnings excluded)
- Matched text truncated to 60 chars

**Tests**: 10+ test cases in `meeting-processing.test.ts` covering match, no-match, truncation, decisions/learnings unaffected

---

## Task 3: Integrate in CLI meeting extract
**Status**: ✅ Complete | **Attempts**: 1

**Commit**: `0273b2e feat(cli): integrate completedItems reconciliation in meeting extract`

**Implementation**:
- Reads `now/week.md` and `now/scratchpad.md` via `services.storage.read()`
- Extracts completed items using `getCompletedItems()`
- Passes merged array to `processMeetingExtraction()`
- Outputs "✓ Already done (matched: 'X')" for reconciled items
- JSON output includes `reconciled` array

**Tests**: CLI wiring test in `meeting-extract.test.ts`

---

## Task 4: Add comprehensive tests
**Status**: ✅ Complete | **Attempts**: 1

**Implementation**: Tests included in Tasks 1-3 commits

**Coverage**:
- `agenda.test.ts`: 5 cases for `getCompletedItems()`
- `meeting-processing.test.ts`: 10+ cases for reconciliation
- `meeting-extract.test.ts`: CLI wiring test

---

## Summary

| Task | Status | Attempts |
|------|--------|----------|
| Task 1: getCompletedItems utility | ✅ | 1 |
| Task 2: meeting-processing reconciliation | ✅ | 1 |
| Task 3: CLI integration | ✅ | 1 |
| Task 4: Comprehensive tests | ✅ | 1 |

**Total**: 4/4 tasks complete
**Typecheck**: ✅ Clean
**Tests**: 2148 pass, 0 fail
