---
title: Wire Reconciliation Into Backend
slug: wire-reconciliation-into-backend
status: complete
size: medium
tags: []
created: 2026-04-03T04:44:10.648Z
updated: 2026-04-03T04:44:10.648Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 2
---

# Wire Cross-Meeting Reconciliation into Backend

**Goal**: Add cross-meeting deduplication and relevance scoring to the web UI's meeting processing flow.

**Context**: We just built reconciliation for the CLI (`arete meeting extract --reconcile`). The backend's `runProcessingSession()` in `agent.ts` doesn't call it yet — UI users don't get cross-meeting dedup.

**Architecture**: Reconciliation runs AFTER `processMeetingExtraction()` because we need processed items with IDs. The merge updates `stagedItemStatus` and `stagedItemSource` maps.

---

## Plan:

1. **Wire reconciliation into `runProcessingSessionTestable()`** — Import reconciliation functions from core, add optional reconciliation deps to `ProcessingDeps`, call after `processMeetingExtraction()`, merge results into staged item maps.
   - AC: Add `loadReconciliationContext?` and `loadRecentBatch?` to `ProcessingDeps` interface
   - AC: Reconciliation runs AFTER `processMeetingExtraction()` (needs item IDs)
   - AC: Items with reconciliation `status: duplicate|completed` get `stagedItemStatus: 'skipped'` and `stagedItemSource: 'reconciled'`
   - AC: Processing-level decisions take precedence (already-skipped items not overwritten)
   - AC: Graceful degradation — if reconciliation fails, log warning and continue
   - AC: Job events show reconciliation stats ("Cross-meeting: N duplicates, M completed")
   - AC: Reconciliation runs automatically (always-on, no opt-in flag)
   - AC: `npm run build:apps:backend` passes (typecheck doesn't cover backend)
   - AC: Existing tests still pass
   - Files: `packages/apps/backend/src/services/agent.ts`

2. **Add integration tests** — Test reconciliation via injected deps.
   - AC: Test duplicate detection — mock `loadRecentBatch` returns meeting with matching items
   - AC: Test graceful degradation — reconciliation throws → logs warning, processing completes
   - AC: Test no-op case — `loadRecentBatch` returns empty → reconciliation skipped cleanly
   - AC: Verify job events include reconciliation stats
   - Files: `packages/apps/backend/test/services/agent.test.ts`
