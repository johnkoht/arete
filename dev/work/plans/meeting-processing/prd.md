# PRD: Meeting Processing CLI Parity

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-12  
**Branch**: `feature/meeting-processing`  
**Depends on**: unify-meeting-extraction (completed 2026-03-12)

---

## 1. Problem & Goals

### Problem

CLI and UI meeting processing produce different outputs, breaking interchangeability:

| Feature | CLI `extract --stage` | Backend `/process` |
|---------|----------------------|-------------------|
| Extraction | ✅ Same (core) | ✅ Same (core) |
| Confidence filtering | ❌ | ✅ (< 0.5 excluded) |
| User notes dedup | ❌ | ✅ (Jaccard > 0.7) |
| Auto-approval | ❌ | ✅ (high confidence → approved) |
| Frontmatter metadata | ❌ | ✅ |
| Commit to memory | ❌ (no command) | ✅ (`/approve`) |

**Result**: Items processed via CLI don't show up correctly in UI. Users can't seamlessly switch between CLI (e.g., daily-winddown skill) and UI for meeting workflow.

### Goals

1. **Unified post-processing**: Extract backend's confidence filtering, dedup, and auto-approval logic to core so both CLI and backend use the same function.
2. **CLI parity**: `arete meeting extract --stage` produces identical output to backend `/process`.
3. **CLI approve command**: `arete meeting approve` commits staged items to memory, matching backend `/approve`.
4. **Reprocessing support**: CLI can reprocess approved meetings via `--clear-approved` flag.

### Success Metric

**Interchangeability**: User can switch between CLI and UI seamlessly:
- Process via CLI → UI shows correct status
- Process via UI → CLI can read and approve
- Approve via CLI → UI shows approved items in meeting detail

### Out of Scope

- Interactive approval mode (fast-follow)
- `--commit` flag on extract (auto-approve, skip staging)
- UI changes (UI already works correctly)
- Changes to extraction logic (unified in previous PRD)

---

## 2. Architecture Decisions

### Shared Core Function

The backend's post-processing logic moves to core as `processMeetingExtraction()`:

```typescript
// @arete/core
export function processMeetingExtraction(
  extraction: MeetingExtractionResult,
  userNotes: string,
  options?: ProcessingOptions
): ProcessedMeetingResult {
  // 1. Filter by confidence threshold (< 0.5 excluded)
  // 2. Dedup against user notes (Jaccard > 0.7)
  // 3. Determine item sources (ai vs dedup)
  // 4. Determine item status (pending vs approved based on confidence/dedup)
  // 5. Build owner metadata for action items
  return {
    filteredItems: { actionItems, decisions, learnings },
    stagedItemStatus: { ai_001: 'approved', ... },
    stagedItemConfidence: { ai_001: 0.9, ... },
    stagedItemSource: { ai_001: 'ai', ... },
    stagedItemOwner: { ai_001: { ownerSlug, direction, counterpartySlug }, ... }
  };
}
```

Both CLI and backend call this function after extraction.

### Frontmatter Consistency

Both CLI and backend write identical frontmatter after processing:

```yaml
status: processed
processed_at: "2026-03-12T12:00:00Z"
staged_item_source:
  ai_001: ai
  de_001: dedup
staged_item_confidence:
  ai_001: 0.92
  de_001: 0.88
staged_item_status:
  ai_001: approved
  de_001: approved
  le_001: pending
staged_item_owner:
  ai_001:
    ownerSlug: john
    direction: i_owe_them
```

### CLI Approve Command

```bash
arete meeting approve <slug>                    # error if no staged items
arete meeting approve <slug> --all              # approve all pending
arete meeting approve <slug> --items ai_001,de_002  # approve specific
arete meeting approve <slug> --skip le_001      # mark as skipped
arete meeting approve <slug> --json             # output as JSON
```

Internally calls `writeItemStatusToFile()` for each item, then `commitApprovedItems()`.

---

## 3. User Stories

### Task 1: Create `processMeetingExtraction()` in core

**Description**: Extract backend's post-processing logic into a reusable core function that both CLI and backend can use.

**Files to modify**:
- `packages/core/src/services/meeting-extraction.ts` — add new function
- `packages/core/src/index.ts` — export new function and types

**Acceptance Criteria**:
- [ ] `processMeetingExtraction()` exported from `@arete/core`
- [ ] Function takes extraction result, user notes, and options
- [ ] Returns: filtered items, staged_item_status, staged_item_confidence, staged_item_source, staged_item_owner
- [ ] Unit tests for: confidence filtering (< 0.5 excluded), dedup matching (Jaccard > 0.7), auto-approval thresholds (0.8)
- [ ] Types exported: `ProcessedMeetingResult`, `ProcessingOptions`

**Dependencies**: None

---

### Task 2: Refactor backend to use `processMeetingExtraction()`

**Description**: Backend's `runProcessingSession()` calls the new core function instead of inline implementations.

**Files to modify**:
- `packages/apps/backend/src/services/agent.ts` — import and use core function, remove inline logic

**Acceptance Criteria**:
- [ ] Backend imports `processMeetingExtraction` from `@arete/core`
- [ ] Inline functions removed: `filterByConfidence`, `determineItemSources`, `determineItemStatus`, `buildConfidenceMap`, `buildOwnerMap`
- [ ] All 30 agent.test.ts tests pass
- [ ] No behavior change from user perspective (same frontmatter output)
- [ ] `npm run build:apps:backend` passes

**Dependencies**: Task 1

---

### Task 3: Enhance CLI `extract --stage` to write full metadata

**Description**: CLI produces same output as backend — full frontmatter metadata, not just body sections.

**Files to modify**:
- `packages/cli/src/commands/meeting.ts` — enhance extract command

**Acceptance Criteria**:
- [ ] CLI calls `processMeetingExtraction()` after extraction
- [ ] CLI writes frontmatter: `status: processed`, `processed_at`, all `staged_item_*` fields
- [ ] Uses gray-matter with clone pattern (`const fm = { ...data }`) per LEARNINGS.md
- [ ] Merges with existing frontmatter (doesn't overwrite title, date, attendees)
- [ ] Unit test: extract on file with existing frontmatter preserves non-staged fields
- [ ] Integration test: file written by CLI readable by UI backend

**Dependencies**: Task 1

---

### Task 4: Add `arete meeting approve` command

**Description**: CLI command to commit staged items to memory files, matching what backend's `/approve` does.

**Files to modify**:
- `packages/cli/src/commands/meeting.ts` — add approve subcommand

**Acceptance Criteria**:
- [ ] Command: `arete meeting approve <slug>` with `--all`, `--items`, `--skip`, `--json` flags
- [ ] Reads `staged_item_status` from meeting frontmatter
- [ ] Updates item statuses via `writeItemStatusToFile()` from core
- [ ] Calls `commitApprovedItems()` from core
- [ ] Writes to `.arete/memory/items/decisions.md`, `learnings.md`
- [ ] Updates meeting frontmatter: `status: approved`, `approved_at`, `approved_items`
- [ ] Creates `## Approved *` sections in meeting body
- [ ] Error with helpful message if meeting not processed (no staged items)
- [ ] Error with helpful message if meeting already approved
- [ ] Integration test: extract → approve → verify memory files updated

**Dependencies**: Task 3

---

### Task 5: Add `--clear-approved` flag to `extract`

**Description**: Support reprocessing approved meetings via CLI by clearing previous approved items.

**Files to modify**:
- `packages/cli/src/commands/meeting.ts` — add flag to extract command

**Acceptance Criteria**:
- [ ] `--clear-approved` flag on `extract --stage`
- [ ] Flag clears `## Approved *` sections from body
- [ ] Flag clears `approved_items`, `approved_at` from frontmatter
- [ ] Flag resets `status` (allows new processing)
- [ ] Integration test: extract --clear-approved on approved file produces fresh staged items

**Dependencies**: Task 3

---

## 4. Risks and Mitigations

See `pre-mortem.md` for detailed risk analysis. Key risks:

| Risk | Mitigation |
|------|-----------|
| Backend behavior regression | Document exact behavior from tests, verify all 30 tests pass |
| Type incompatibility | Use types from core, don't duplicate |
| Frontmatter parsing inconsistency | Use identical gray-matter patterns, clone before mutating |
| Path resolution differences | Use services.workspace.findRoot() consistently |

---

## 5. Memory Context

From recent entries and LEARNINGS.md:

1. **Backend LEARNINGS.md**: gray-matter caches frontmatter objects — always clone before mutating
2. **unify-meeting-extraction (2026-03-12)**: Core extraction limits action items to 7, catches LLM errors internally
3. **npm run typecheck doesn't check backend** — use `npm run build:apps:backend`
4. **Dual extraction was unified** — but post-processing still inline in backend

---

## 6. Test Strategy

### Unit Tests
- `packages/core/test/services/meeting-extraction.test.ts` — processMeetingExtraction tests
- Confidence filtering thresholds (0.5 boundary)
- Dedup Jaccard matching (0.7 boundary)
- Auto-approval thresholds (0.8 boundary)

### Integration Tests
- `packages/cli/test/commands/meeting.test.ts` — extract and approve command tests
- Round-trip: extract → approve → verify memory files
- Parity: CLI output matches expected frontmatter structure

### Manual Verification
- Process meeting via CLI → verify UI shows correct metadata
- Process meeting via UI → verify CLI approve works
- Reprocess via CLI `--clear-approved` → verify fresh staged items
