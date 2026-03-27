# PRD: Week.md Auto-Reconcile During Meeting Processing

## Goal

Auto-skip action items during meeting processing that match completed tasks in `now/week.md` or `now/scratchpad.md`, reducing manual work for PMs who batch-process meetings.

## Background

When processing meetings from previous days, action items get extracted that were already completed. Currently users must manually skip these during approval. This PRD implements automatic detection using Jaccard similarity matching against completed checkboxes.

**Builds on**: `priorItems` pattern from meeting-extraction-improvements (merged 2026-03-26)

## Success Criteria

- Action items matching completed tasks are auto-skipped with `source: 'reconciled'`
- User sees why: "✓ Already done (matched: 'Send auth doc to Alex...')"
- No false positives (Jaccard threshold ≥ 0.6)
- All tests pass, typecheck clean

---

## Tasks

### Task 1: Add completed items extraction utility

**File**: `packages/core/src/utils/agenda.ts`

Add `getCompletedItems(content: string): string[]` function that extracts completed checkbox text from markdown.

**Context Files** (read before starting):
- `packages/core/src/utils/agenda.ts` — existing `parseAgendaItems()` and `getUncheckedAgendaItems()` patterns
- `packages/core/test/utils/agenda.test.ts` — existing test patterns

**Implementation**:
```typescript
export function getCompletedItems(content: string): string[] {
  return parseAgendaItems(content)
    .filter(item => item.checked)
    .map(item => item.text);
}
```

**Acceptance Criteria**:
- [ ] `getCompletedItems()` returns array of completed task text from markdown checkboxes
- [ ] Handles indented checkboxes (`  - [x]`) and uppercase X (`- [X]`)
- [ ] Exported from `packages/core/src/utils/index.ts`
- [ ] Unit test in `agenda.test.ts` covers: basic checkbox, indented checkbox, uppercase X, mixed content
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

⚠️ **Pre-Mortem R4**: Test edge cases (uppercase X, indentation) — `parseAgendaItems()` regex handles both but verify in tests.

---

### Task 2: Extend meeting processing with reconciliation

**File**: `packages/core/src/services/meeting-processing.ts`

Extend the processing function to match action items against completed items and mark them as skipped.

**Context Files** (read before starting):
- `packages/core/src/services/meeting-processing.ts` — lines 1-80 for types, lines 150-200 for `itemMatchesPriorItems()` pattern
- `packages/core/src/services/LEARNINGS.md` — Jaccard test string gotcha
- `packages/core/test/services/meeting-processing.test.ts` — existing test patterns

**Type Changes**:
```typescript
// Line ~25
export type ItemStatus = 'approved' | 'pending' | 'skipped';

// Line ~22
export type ItemSource = 'ai' | 'dedup' | 'reconciled';

// Add to ProcessingOptions (~line 45)
/** Completed task texts to match against (from week.md/scratchpad.md) */
completedItems?: string[];
/** Jaccard threshold for completed items reconciliation (default: 0.6) */
reconcileJaccard?: number;

// Add to ProcessedMeetingResult (~line 65)
/** Map of item ID → matched completed text (for reconciled items only) */
stagedItemMatchedText?: Record<string, string>;
```

**Implementation Notes**:
- Add `DEFAULT_RECONCILE_JACCARD = 0.6` constant
- Pre-tokenize completed items once (no cap needed — week.md is small)
- In action items loop only: check Jaccard match, if match ≥ threshold: `status: 'skipped'`, `source: 'reconciled'`
- Store matched text truncated to 60 chars: `matchedText.length > 60 ? matchedText.slice(0, 57) + '...' : matchedText`
- Do NOT check decisions/learnings (only action items have "already done" semantics)
- Do NOT apply negation marker bypass (that's for cross-meeting dedup, not completion)

**Acceptance Criteria**:
- [ ] `ItemStatus` type includes `'skipped'`
- [ ] `ItemSource` type includes `'reconciled'`
- [ ] `ProcessingOptions.completedItems` added with JSDoc
- [ ] `ProcessingOptions.reconcileJaccard` added with default 0.6 in JSDoc
- [ ] `ProcessedMeetingResult.stagedItemMatchedText` added
- [ ] Action items matching completed tasks get `status: 'skipped'`, `source: 'reconciled'`
- [ ] Matched text stored, truncated to 60 chars with "..." suffix
- [ ] Decisions and learnings are NOT checked (verify in test)
- [ ] Unit tests added for: basic match, no match, truncation, decisions unaffected
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

⚠️ **Pre-Mortem R1**: Before changing `ItemStatus`, grep for usages: `grep -rn "ItemStatus" packages/`. Audit any exhaustive checks.

⚠️ **Pre-Mortem R2**: Reuse Jaccard pattern from `itemMatchesPriorItems()`, don't duplicate. Consider extracting shared helper if cleaner.

---

### Task 3: Integrate in CLI meeting extract

**File**: `packages/cli/src/commands/meeting.ts`

Update the `extract --stage` command to read completed items from workspace and pass to processing.

**Context Files** (read before starting):
- `packages/cli/src/commands/meeting.ts` — find `extract` command, around line 350-450
- `packages/cli/src/commands/LEARNINGS.md` — CLI patterns
- `packages/core/src/models/workspace.ts` — verify `WorkspacePaths` has `now` field

**Implementation**:
1. After getting `paths` from `services.workspace.getPaths(root)`:
   ```typescript
   // Read completed items from week.md and scratchpad.md
   const weekContent = await services.storage.read(join(paths.now, 'week.md')) ?? '';
   const scratchpadContent = await services.storage.read(join(paths.now, 'scratchpad.md')) ?? '';
   const completedItems = [
     ...getCompletedItems(weekContent),
     ...getCompletedItems(scratchpadContent),
   ];
   ```

2. Pass to `processMeetingExtraction()`:
   ```typescript
   const processed = processMeetingExtraction(extractionResult, userNotes, {
     ...existingOptions,
     completedItems,
   });
   ```

3. Update output formatting for reconciled items:
   ```typescript
   if (status === 'skipped' && source === 'reconciled') {
     const matchedText = processed.stagedItemMatchedText?.[id];
     console.log(`  ✓ Already done (matched: "${matchedText}")`);
   }
   ```

4. Update JSON output structure:
   ```typescript
   // Add to JSON output
   reconciled: Object.entries(processed.stagedItemMatchedText ?? {}).map(([id, matchedText]) => ({
     id,
     matchedText,
   })),
   ```

**Acceptance Criteria**:
- [ ] Uses `paths.now` from `WorkspacePaths` (verify field exists, else use `join(paths.root, 'now')`)
- [ ] Reads both `week.md` and `scratchpad.md` (graceful if missing — empty string)
- [ ] Import `getCompletedItems` from `@arete/core`
- [ ] Running extract shows "✓ Already done (matched: 'X')" for reconciled items
- [ ] Items display in staged sections with skipped status
- [ ] JSON output includes `reconciled` array: `[{ id, matchedText }]`
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

⚠️ **Pre-Mortem R3**: Check if `paths.now` exists in `WorkspacePaths`. If not, construct from `join(paths.root, 'now')`.

⚠️ **Pre-Mortem R6**: Document exact JSON output structure to avoid conflicts.

---

### Task 4: Add comprehensive tests

**Files**: 
- `packages/core/test/utils/agenda.test.ts`
- `packages/core/test/services/meeting-processing.test.ts`
- `packages/cli/test/commands/meeting-extract.test.ts`

Add tests covering the new functionality.

**Context Files** (read before starting):
- Existing test files above for patterns
- `packages/core/src/services/LEARNINGS.md` — Jaccard test string mathematical verification

**Test Cases**:

**agenda.test.ts** (add to existing suite):
```typescript
describe('getCompletedItems', () => {
  it('returns empty array for no checkboxes', () => {...});
  it('returns only checked items', () => {...});
  it('handles indented checkboxes', () => {...});
  it('handles uppercase X', () => {...});
  it('handles mixed checked/unchecked', () => {...});
});
```

**meeting-processing.test.ts** (add new suite):
```typescript
describe('processMeetingExtraction with completedItems', () => {
  it('skips action item matching completed item', () => {
    // Use 5-word vs 6-word strings for reliable Jaccard > 0.6
    // e.g., "Send auth doc to Alex" vs "Send auth doc to Alex"
  });
  
  it('does not skip item below threshold', () => {...});
  
  it('stores truncated matched text', () => {
    // Test 70-char text truncates to 60 + "..."
  });
  
  it('does not affect decisions', () => {...});
  it('does not affect learnings', () => {...});
  
  it('handles empty completedItems array', () => {...});
});
```

**meeting-extract.test.ts** (if exists, add test):
```typescript
it('includes reconciled items in output when week.md has completed tasks', async () => {
  // Mock storage to return week.md with completed checkbox
  // Mock extraction to return matching action item
  // Verify output includes reconciled formatting
});
```

**Acceptance Criteria**:
- [ ] Unit test: `getCompletedItems()` parses checkboxes correctly (5+ cases)
- [ ] Unit test: `processMeetingExtraction()` skips matching action items
- [ ] Unit test: matchedText populated and truncated correctly
- [ ] Unit test: Decisions and learnings NOT affected by completedItems
- [ ] CLI test: extract with mocked week.md shows reconciled items (if test file exists)
- [ ] All new tests pass
- [ ] `npm run typecheck` passes
- [ ] `npm test` — full suite passes

⚠️ **Pre-Mortem R5**: Follow existing test mocking patterns from meeting-processing.test.ts.

---

## Out of Scope

- **Web UI integration** — Steps 5-6 in plan, to be done after Phase 1 validation
- **Daily progress section** — Part of week.md but structurally different
- **Decisions/learnings reconciliation** — Action items are the "already done" problem

---

## Technical Notes

- Existing `parseAgendaItems()` handles indentation and case-insensitive checkbox
- 0.6 Jaccard threshold is lower than dedup's 0.7 because week.md items are often abbreviated
- No item cap needed — week.md typically has <50 items
- Pre-tokenize completed items once for efficiency (following priorItems pattern)

## Memory Context (from Phase 2.1)

1. **Explicit file lists in prompts** — Include specific files with line numbers in each task
2. **Jaccard test strings verified mathematically** — Use 5-word vs 6-word pairs for reliable >0.6 similarity
3. **Reuse `priorItems` pattern exactly** — Pre-tokenization, threshold checking, but NO negation bypass
4. **CLI: established patterns** — Follow existing output formatting in meeting extract
5. **Grep usages before type changes** — Audit `ItemStatus` consumers before modification
