---
title: Wire Meeting Reconciliation Into Cli
slug: wire-meeting-reconciliation-into-cli
status: complete
size: medium
tags: [reconciliation, meeting-processing]
created: 2026-04-03T03:40:57.318Z
updated: 2026-04-03T03:50:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: false
has_prd: false
steps: 4
---

# Wire Meeting Reconciliation into CLI

## Context

The `meeting-reconciliation.ts` module exists in `packages/core/` with pure functions for:
- Cross-meeting deduplication (Jaccard similarity)
- Completed task matching against area task lists
- Recent memory matching
- Relevance scoring with "why" annotations

**The module is tested (unit + golden file tests) but NOT wired into any command or exported from core's index.ts.**

## Recommended Approach: `--reconcile` Flag on `meeting extract`

**Why NOT a separate batch command**: The reconciliation module processes `MeetingExtractionBatch[]` — it needs extraction results. A standalone `arete meeting reconcile` would either re-extract (wasteful) or require extraction to have already happened (confusing UX). Better to integrate where extraction already happens.

**Why NOT in `meeting process`**: The `process` subcommand handles People Intelligence classification (attendee detection, person file creation). It's a fundamentally different pipeline. `extract` is where LLM extraction + processing + staging happens — that's where reconciliation fits.

**Why a flag, not always-on**: Reconciliation loads area memories, scans recent meetings, and runs O(n²) Jaccard comparisons. For single-meeting quick extractions, this overhead isn't warranted. A `--reconcile` flag makes it opt-in for batch workflows (daily-winddown skill) and power users.

**Integration point**: After `processMeetingExtraction()` returns `ProcessedMeetingResult`, run `reconcileMeetingBatch()` on the filtered items. Merge reconciliation annotations (relevance tier, "why", area slug) into the staged metadata written to frontmatter. Mark duplicates/completed items as `skipped`.

## Design Decisions

1. **Reconciliation runs post-processing**: `processMeetingExtraction()` handles confidence filtering, user-notes dedup, and basic completed-items matching. Reconciliation adds cross-meeting dedup, area-based relevance scoring, and richer annotations. It's an enrichment layer, not a replacement.

2. **Recent meetings window**: `--reconcile` loads the last 7 days of processed meetings (configurable via `--reconcile-days N`) as the batch for cross-meeting dedup. The current meeting's extraction is added to the batch.

3. **Output enrichment**: Reconciliation results are merged into existing frontmatter metadata:
   - `staged_item_reconciliation` map: `{ [id]: { status, relevanceTier, why, areaSlug? } }`
   - Items marked `duplicate` or `completed` by reconciliation → status changes to `skipped`
   - Human-readable output shows reconciliation annotations

4. **Core exports**: Export `loadReconciliationContext` and `reconcileMeetingBatch` from `packages/core/src/index.ts`.

## Plan:

1. **Add recent-meetings loader helper** — Create a function in `packages/core/src/services/meeting-reconciliation.ts` that loads recent processed meetings (last N days) from the meetings directory, parses their staged sections, and returns `MeetingExtractionBatch[]` for reconciliation input.
   - AC: `loadRecentMeetingBatch(storage, meetingsDir, days)` returns extractions from meetings with `status: processed|approved` within the time window (using `frontmatter.date` or filename date)
   - AC: Handles empty directory, no processed meetings, and malformed files gracefully
   - AC: Unit tests cover happy path, empty dir, date filtering
   - Files: `packages/core/src/services/meeting-reconciliation.ts`, new tests

2. **Wire `--reconcile` flag into `meeting extract`** — Add `--reconcile` and `--reconcile-days <n>` options to the extract command. Reconciliation runs on raw `MeetingIntelligence` BEFORE `processMeetingExtraction()`, then reconciliation decisions are merged.
   - AC: `arete meeting extract file.md --stage --reconcile` loads context and runs reconciliation
   - AC: Reconciliation runs BEFORE `processMeetingExtraction()` on raw `extractionResult.intelligence`
   - AC: Processing-level decisions take precedence; reconciliation only adds signals to items not already skipped
   - AC: `--reconcile-days 14` changes the lookback window (default: 7)
   - AC: `--json` output includes `reconciliation` field with stats and per-item annotations
   - AC: Items flagged as `duplicate` by reconciliation get `status: skipped` in staged output
   - AC: Graceful degradation when no areas exist (empty context, scoring still runs)
   - Files: `packages/cli/src/commands/meeting.ts`

3. **Add integration tests** — Test the full extract + reconcile flow with fixture meetings.
   - AC: Test with 2+ meetings in a temp workspace, verify cross-meeting dedup
   - AC: Test `--json` output includes reconciliation stats
   - AC: Test graceful degradation (no areas, no recent meetings)
   - Files: `packages/cli/test/commands/meeting.test.ts` (extend existing)

4. **Update human-readable output** — Enhance CLI output to show reconciliation results.
   - AC: Reconciled items show `[HIGH]`/`[NORMAL]`/`[LOW]` tier badges
   - AC: Duplicates show "Duplicate of: {source}" annotation
   - AC: Stats summary line: "Reconciliation: N duplicates, M completed, K low-relevance"
   - Files: `packages/cli/src/commands/meeting.ts`

## Technical Risks

1. **Performance with large meeting directories**: Scanning all meetings in last 7 days and parsing their staged sections could be slow. Mitigation: cap at 50 meetings, use frontmatter-only parsing for date filtering before full parse.

2. **Type bridging between ProcessedMeetingResult and MeetingExtractionBatch**: The reconciliation module expects `MeetingIntelligence` (from extraction), but by the time we run reconciliation we've already processed items into `FilteredItem[]`. Need to either run reconciliation before processing or convert filtered items back. **Recommendation**: Run reconciliation on the raw `MeetingExtractionResult.intelligence` before `processMeetingExtraction()`, then merge reconciliation decisions into processing.

3. **Duplicate detection overlap**: `processMeetingExtraction()` already does some dedup (user notes, prior items, completed items). Reconciliation adds cross-meeting and area-based dedup. Need clear precedence rules: processing-level dedup wins for items it handles; reconciliation adds net-new signals.

4. **Frontmatter bloat**: Adding `staged_item_reconciliation` map increases frontmatter size. Keep annotations concise (tier + why string, not full breakdown).

## Test Requirements

- Unit tests for `loadRecentMeetingBatch` (Step 2)
- Integration test for full `--reconcile` flow (Step 4)
- All existing tests must continue to pass: `npm run typecheck && npm test`
- Verify `reconciliation-golden.test.ts` still passes (no regressions in pure functions)