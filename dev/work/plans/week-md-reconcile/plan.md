---
title: Week.md Auto-Reconcile During Meeting Processing
slug: week-md-reconcile
status: idea
size: small
tags: [meeting-processing, commitments, intelligence]
created: 2026-03-25T23:30:00.000Z
updated: 2026-03-25T23:30:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Week.md Auto-Reconcile During Meeting Processing

**Dependency**: Build after `meeting-extraction-improvements` Phase 2 (steps 4-6) completes. That plan modifies `processMeetingExtraction()` in the same way — wait to avoid merge conflicts.

---

## Problem

When processing meetings that happened days ago, action items get extracted that were already completed. User has to manually skip these during approval.

**Who experiences this?** Any PM who batches meeting processing (e.g., process Friday's meetings on Monday).

**Success criteria:**
- Action items that match completed tasks in `now/week.md` are auto-skipped
- User sees why: "✓ Already done — matched 'Send auth doc to Alex' in week.md"
- No false positives (Jaccard threshold ≥ 0.6)

---

## Design

**New source type**: `'reconciled'` (alongside `'ai'`, `'dedup'`)

**Flow**:
1. During `arete meeting extract --stage`:
   - Read `now/week.md`, extract completed checkboxes (`- [x] ...`)
   - Pass completed items to `processMeetingExtraction()`
2. For each action item, check Jaccard similarity against completed items
3. If match ≥ 0.6: set `status: 'skipped'`, `source: 'reconciled'`
4. Display: "✓ Already done: {matched text from week.md}"

---

## Plan:

### 1. Add week file completed items extraction
**File**: `packages/core/src/utils/agenda.ts`

- Create `getCompletedWeekItems(content: string): string[]`
- Reuses existing `parseAgendaItems()`, filters to `checked: true`

**AC**:
- [ ] Returns array of completed task text from markdown checkboxes
- [ ] Handles nested checkboxes (indented `- [x]`)
- [ ] Unit test covers various checkbox formats

### 2. Extend meeting processing with reconciliation
**File**: `packages/core/src/services/meeting-processing.ts`

- Add `'reconciled'` to `ItemSource` type
- Add optional `completedItems?: string[]` parameter to `processMeetingExtraction()`
- For each action item, run Jaccard match against completed items (threshold 0.6)
- If match: set `status: 'skipped'`, `source: 'reconciled'`, store matched text

**AC**:
- [ ] New `ItemSource` value exported
- [ ] Action items matching completed tasks get `skipped` status with `reconciled` source
- [ ] Matched text stored for display
- [ ] Unit test: item matching completed task is skipped

### 3. Integrate in CLI meeting extract
**File**: `packages/cli/src/commands/meeting.ts`

- In `arete meeting extract --stage`, read `now/week.md` if it exists
- Extract completed items using `getCompletedWeekItems()`
- Pass to `processMeetingExtraction()`
- Update output formatting: `[skipped:reconciled]` with matched text shown

**AC**:
- [ ] Running extract shows "✓ Already done" for matched items
- [ ] File staged correctly with reconciled items marked skipped
- [ ] Graceful handling when `now/week.md` doesn't exist

### 4. Tests
- [ ] Unit test: `getCompletedWeekItems()` parses checkboxes correctly
- [ ] Unit test: `processMeetingExtraction()` with completedItems skips matches
- [ ] Integration: CLI extract with week.md present

---

## Out of Scope

- Web UI integration (can add later)
- Other files (scratchpad, daily progress) — week.md is primary signal
- Decisions/learnings reconciliation (action items have the "already done" problem)

---

## Technical Notes

- Existing `parseAgendaItems()` in `packages/core/src/utils/agenda.ts` already parses checkboxes
- Existing Jaccard utilities in `meeting-processing.ts` can be reused
- Week file lives at `now/week.md` per `WorkspacePaths`
