# PRD: Week.md Auto-Reconcile Phase 2 — Web UI Integration

## Goal

Display reconciled action items in the web UI's meeting triage view, with distinct styling and the matched text that triggered the reconciliation.

## Background

Phase 1 (complete) added auto-reconciliation to CLI meeting processing. Action items matching completed tasks in `now/week.md` or `now/scratchpad.md` are auto-skipped with `source: 'reconciled'` and `status: 'skipped'`.

Phase 2 threads this through the backend and displays it in the web UI.

## Success Criteria

- Reconciled items appear in the web triage view with distinct styling
- Matched text is displayed so user understands why it was skipped
- User can override the skip decision if they disagree

---

## Tasks

### Task 1: Thread completedItems through backend

**File**: `packages/apps/backend/src/services/agent.ts`

Read `now/week.md` and `now/scratchpad.md` in `runProcessingSessionTestable()` and pass completed items to `processMeetingExtraction()`.

**Context Files** (read before starting):
- `packages/apps/backend/src/services/agent.ts` — lines 200-250 for current processMeetingExtraction call
- `packages/core/src/utils/agenda.ts` — `getCompletedItems()` function
- `packages/core/src/services/meeting-processing.ts` — `ProcessingOptions.completedItems`

**Implementation**:
1. Import `getCompletedItems` from `@arete/core`
2. Before `processMeetingExtraction()` call (~line 211):
   ```typescript
   // Read completed items from week.md and scratchpad.md for reconciliation
   const weekContent = await deps.storage.read(join(paths.now, 'week.md')) ?? '';
   const scratchpadContent = await deps.storage.read(join(paths.now, 'scratchpad.md')) ?? '';
   const completedItems = [
     ...getCompletedItems(weekContent),
     ...getCompletedItems(scratchpadContent),
   ];
   ```
3. Add `completedItems` to the options:
   ```typescript
   const processed = processMeetingExtraction(coreResult, userNotes, {
     priorItems: options.priorItems,
     completedItems,
   });
   ```
4. Add event logging for reconciled items (similar to dedup logging ~line 225):
   ```typescript
   const reconciledCount = Object.values(processed.stagedItemSource).filter(
     (s) => s === 'reconciled',
   ).length;
   if (reconciledCount > 0) {
     jobs.appendEvent(jobId, `Skipped ${reconciledCount} items already completed in week.md.`);
   }
   ```

**Acceptance Criteria**:
- [ ] `getCompletedItems` imported from `@arete/core`
- [ ] Reads `now/week.md` and `now/scratchpad.md` using `deps.storage.read()`
- [ ] Passes merged `completedItems` to `processMeetingExtraction()`
- [ ] Logs event when items are reconciled
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

### Task 2: Update frontend types for reconciled items

**File**: `packages/apps/web/src/api/types.ts`

Add `'reconciled'` to `ReviewItem.source` and add optional `matchedText` field.

**Context Files** (read before starting):
- `packages/apps/web/src/api/types.ts` — lines 250-280 for `ReviewItem` type

**Implementation**:
```typescript
export type ReviewItem = {
  id: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  goalSlug?: string;
  /** Origin of this item: ai (LLM extracted), dedup (matched user notes), reconciled (matched completed task) */
  source?: 'ai' | 'dedup' | 'reconciled';
  confidence?: number;
  ownerSlug?: string;
  direction?: ItemDirection;
  counterpartySlug?: string;
  /** Matched text from week.md/scratchpad.md (reconciled items only) */
  matchedText?: string;
};
```

**Acceptance Criteria**:
- [ ] `ReviewItem.source` includes `'reconciled'`
- [ ] `ReviewItem.matchedText` added as optional string
- [ ] JSDoc comments updated
- [ ] `npm run typecheck` passes

---

### Task 3: Wire matchedText through backend response

**File**: `packages/apps/backend/src/services/agent.ts`

Include `stagedItemMatchedText` in the session result so frontend can display it.

**Context Files** (read before starting):
- `packages/apps/backend/src/services/agent.ts` — find where result is constructed
- `packages/core/src/services/meeting-processing.ts` — `ProcessedMeetingResult.stagedItemMatchedText`

**Implementation**:
The backend needs to pass `stagedItemMatchedText` through to the frontend. Look for where `stagedItemStatus`, `stagedItemSource`, etc. are returned and add `stagedItemMatchedText` in the same pattern.

**Acceptance Criteria**:
- [ ] `stagedItemMatchedText` included in session result/response
- [ ] Frontend can access matched text for reconciled items
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

### Task 4: Display reconciled items in ReviewItems component

**File**: `packages/apps/web/src/components/ReviewItems.tsx`

Show reconciled items with distinct styling and display the matched text.

**Context Files** (read before starting):
- `packages/apps/web/src/components/ReviewItems.tsx` — understand current item rendering
- Look for how `dedup` items are styled (if at all)

**Implementation**:
1. For items with `source === 'reconciled'`:
   - Show with muted/greyed styling (similar to skipped items)
   - Display badge or icon indicating "Already done"
   - Show matched text in smaller font below the item text
2. Allow user to click/toggle to un-skip (change status to 'pending')
3. Consider grouping reconciled items separately or showing them collapsed

**Example UI**:
```
✓ Send auth doc to Alex (Already done)
  Matched: "Send auth doc to Alex by EOD"
  [Keep skipped] [Review anyway]
```

**Acceptance Criteria**:
- [ ] Reconciled items have distinct visual styling (muted, grey, or badge)
- [ ] Matched text displayed below the item text
- [ ] User can override skip decision (un-skip button/action)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes

---

### Task 5: Add tests for reconciliation flow

**Files**: 
- `packages/apps/backend/test/services/agent.test.ts` (or similar)
- `packages/apps/web/src/components/ReviewItems.test.tsx`

**Implementation**:
1. Backend test: Mock storage to return week.md with completed items, verify reconciled items in result
2. Frontend test: Render ReviewItems with reconciled item, verify styling and matched text displayed

**Acceptance Criteria**:
- [ ] Backend test: completedItems passed to processMeetingExtraction
- [ ] Frontend test: reconciled item renders with matched text
- [ ] All tests pass

---

## Out of Scope

- Editing matched text in the UI
- Showing which file (week.md vs scratchpad.md) the match came from
- Batch un-skip for all reconciled items

---

## Technical Notes

- `getCompletedItems` is already exported from `@arete/core`
- `ItemStatus: 'skipped'` already exists in frontend types
- The backend uses `deps.storage.read()` pattern — follow existing code
- Follow existing styling patterns for muted/disabled items in ReviewItems
