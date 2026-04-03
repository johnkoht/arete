# Wire Reconciliation into Backend

**Date**: 2026-04-03
**Type**: Feature Implementation
**Status**: Complete

## Summary

Wired cross-meeting reconciliation into the backend's meeting processing flow (`runProcessingSessionTestable()`), enabling the web UI to automatically deduplicate items across meetings and skip already-completed tasks.

## What Was Built

1. **Extended `ProcessingDeps`** with optional `loadReconciliationContext` and `loadRecentBatch` callbacks for testability
2. **Added reconciliation step (9b)** after `processMeetingExtraction()` — loads context, runs `reconcileMeetingBatch()`, merges results
3. **Updated `createDefaultDeps()`** to include real reconciliation with `FileStorageAdapter`
4. **Job events** show reconciliation stats ("Cross-meeting: N duplicates, N completed")

## Key Decisions

- **Reconciliation runs AFTER processMeetingExtraction()** — Needs item IDs from processing, merges into `stagedItemStatus`/`stagedItemSource` maps
- **Optional deps for testability** — Core pattern from `ProcessingDeps`; tests mock reconciliation callbacks
- **Always-on** — No opt-in flag; web users expect dedup without configuration
- **Graceful degradation** — Errors logged as warning, processing continues

## Technical Details

- `FileStorageAdapter` created per session (not reused from module-level singleton) — acceptable since stateless
- Text matching between `ReconciledItem.original` and `FilteredItem.text` handles type union correctly
- Processing-level decisions take precedence (already-skipped items not overwritten)

## Files Changed

- `packages/apps/backend/src/services/agent.ts` — Reconciliation imports, deps extension, step 9b, createDefaultDeps update
- `packages/apps/backend/test/services/agent.test.ts` — 8 new tests

## Testing

- 8 new tests covering: no-op when deps absent, duplicate detection, completed detection, stats logging, processing precedence, graceful degradation
- All 2603 tests passing

## Related

- Previous: `wire-meeting-reconciliation-into-cli` (CLI path)
- Plan: `dev/work/plans/wire-reconciliation-into-backend/`
