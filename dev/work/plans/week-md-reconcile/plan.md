---
title: Week.md Auto-Reconcile During Meeting Processing
slug: week-md-reconcile
status: complete
size: small
tags: [meeting-processing, commitments, intelligence]
created: 2026-03-25T23:30:00.000Z
updated: 2026-03-26T05:15:00.000Z
completed: 2026-03-26T05:15:00.000Z
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 6
---

# Week.md Auto-Reconcile During Meeting Processing

**Dependency**: ✅ `meeting-extraction-improvements` merged — `priorItems` infrastructure available.

---

## Problem

When processing meetings that happened days ago, action items get extracted that were already completed. User has to manually skip these during approval.

**Who experiences this?** Any PM who batches meeting processing (e.g., process Friday's meetings on Monday).

**Success criteria:**
- Action items that match completed tasks in `now/week.md` or `now/scratchpad.md` are auto-skipped
- User sees why: "✓ Already done — matched 'Send auth doc to Alex...'"
- No false positives (Jaccard threshold ≥ 0.6)

---

## Design

**Builds on**: `priorItems` pattern from meeting-extraction-improvements

**New types**:
- Add `'skipped'` to `ItemStatus` (currently `'approved' | 'pending'`)
- Add `'reconciled'` to `ItemSource` (currently `'ai' | 'dedup'`)
- Add `completedItems?: string[]` to `ProcessingOptions`
- Add `stagedItemMatchedText?: Record<string, string>` to `ProcessedMeetingResult`
- Add `reconcileJaccard?: number` to `ProcessingOptions` (default 0.6)

**Files scanned for completed items**:
- `now/week.md` — primary signal (weekly tasks with checkboxes)
- `now/scratchpad.md` — secondary signal (ad-hoc items)

**Flow**:
1. During `arete meeting extract --stage`:
   - Read `now/week.md` + `now/scratchpad.md`, extract completed checkboxes (`- [x] ...`)
   - Pass merged completed items to `processMeetingExtraction()`
2. For each action item, check Jaccard similarity against completed items
3. If match ≥ 0.6: set `status: 'skipped'`, `source: 'reconciled'`, store matched text
4. Display: "✓ Already done (matched: '{truncated text}')"

---

## Plan:

### 1. Add completed items extraction utility
**File**: `packages/core/src/utils/agenda.ts`

- Add `getCompletedItems(content: string): string[]` function
- Reuses existing `parseAgendaItems()`, filters to `checked: true`

**AC**:
- [ ] Returns array of completed task text from markdown checkboxes
- [ ] Handles indented checkboxes (`  - [x]`)
- [ ] Exported from `packages/core/src/utils/index.ts`
- [ ] Unit test covers various checkbox formats

---

### 2. Extend meeting processing with reconciliation
**File**: `packages/core/src/services/meeting-processing.ts`

- Add `'skipped'` to `ItemStatus` type
- Add `'reconciled'` to `ItemSource` type
- Add to `ProcessingOptions`:
  - `completedItems?: string[]` — completed task texts to match against
  - `reconcileJaccard?: number` — threshold for matching (default 0.6)
- Add `stagedItemMatchedText?: Record<string, string>` to `ProcessedMeetingResult`
- Add matching logic (reuse `itemMatchesPriorItems` pattern)
- If match: set `status: 'skipped'`, `source: 'reconciled'`, store matched text (truncated to 60 chars)
- Only check action items (decisions/learnings don't have "already done" semantics)

**AC**:
- [ ] `ItemStatus` includes `'skipped'`
- [ ] `ItemSource` includes `'reconciled'`
- [ ] `ProcessingOptions.completedItems` documented with JSDoc
- [ ] `ProcessingOptions.reconcileJaccard` documented with default 0.6
- [ ] `ProcessedMeetingResult.stagedItemMatchedText` populated for reconciled items
- [ ] Action items matching completed tasks get `skipped` status with `reconciled` source
- [ ] Matched text truncated to 60 chars with "..." suffix if longer
- [ ] Decisions and learnings NOT checked (only action items)
- [ ] Unit test: item matching completed task is skipped with matchedText

---

### 3. Integrate in CLI meeting extract
**File**: `packages/cli/src/commands/meeting.ts`

- In `arete meeting extract --stage`:
  - Use `WorkspacePaths.now` (from `services.workspace.getPaths(root)`)
  - Read `week.md` and `scratchpad.md` if they exist
  - Extract completed items using `getCompletedItems()`
  - Merge into single array, pass to `processMeetingExtraction()` options
- Update output formatting for `skipped:reconciled` items
- Include reconciled items in JSON output

**AC**:
- [ ] Uses `paths.now` from `WorkspacePaths`, not hardcoded path
- [ ] Reads both `week.md` and `scratchpad.md` (graceful if missing)
- [ ] Running extract shows "✓ Already done (matched: 'X')" for reconciled items
- [ ] Items display in staged output with skipped status
- [ ] JSON output includes `reconciled` array: `[{ id, matchedText }]`

---

### 4. Tests
**Files**: `packages/core/test/utils/agenda.test.ts`, `packages/core/test/services/meeting-processing.test.ts`, `packages/cli/test/commands/meeting-extract.test.ts`

- [ ] Unit test: `getCompletedItems()` parses checkboxes correctly
- [ ] Unit test: `processMeetingExtraction()` with completedItems skips matches
- [ ] Unit test: matchedText populated and truncated correctly
- [ ] Unit test: Decisions and learnings NOT affected by completedItems
- [ ] CLI test: extract with mocked week.md shows reconciled items

---

---

## Phase 2: Web UI Integration (after Phase 1 validation)

> **Note**: Build Phase 2 after Phase 1 is complete and validated. Review at that time.

### 5. Thread completedItems through backend
**File**: `packages/apps/backend/src/services/agent.ts`

- In `runProcessingSession()`:
  - Read `now/week.md` + `now/scratchpad.md` using storage
  - Extract completed items using `getCompletedItems()`
  - Pass to `processMeetingExtraction()` options
- Return reconciled items in session result for frontend

**AC**:
- [ ] Backend reads completed items from workspace
- [ ] Passes to processing function
- [ ] Returns reconciled items to frontend

### 6. Display reconciled items in web UI
**File**: `packages/apps/web/src/...` (triage view)

- Show reconciled items with distinct styling
- Display matched text for context
- Allow override (un-skip) if user disagrees

**AC**:
- [ ] Reconciled items visually distinct in triage UI
- [ ] Matched text displayed
- [ ] User can override skip decision

---

## Out of Scope (both phases)

- **Daily progress section** — Part of week.md but structurally different. Future enhancement.
- **Decisions/learnings reconciliation** — Action items are the "already done" problem.

---

## Technical Notes

- Existing `parseAgendaItems()` in `packages/core/src/utils/agenda.ts` already parses checkboxes
- Existing Jaccard utilities in `meeting-processing.ts` can be reused
- Follow `priorItems` pattern: pre-tokenize for efficiency (no cap needed — week.md is small)
- 0.6 threshold (lower than dedup's 0.7) because week.md items are often abbreviated
- Truncate matched text to 60 chars for display (full text available in source file)
