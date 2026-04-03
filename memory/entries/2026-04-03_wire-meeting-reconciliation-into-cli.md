# Wire Meeting Reconciliation into CLI

**Date**: 2026-04-03
**Type**: Feature Implementation
**Status**: Complete

## Summary

Wired the meeting reconciliation module (cross-meeting deduplication, relevance scoring, completed task matching) into the `arete meeting extract` command via `--reconcile` flag.

## What Was Built

1. **`loadRecentMeetingBatch()`** — Loads processed meetings from last N days for cross-meeting comparison
2. **`--reconcile` flag** — Opt-in reconciliation on `meeting extract`
3. **`--reconcile-days <n>`** — Configure lookback window (default: 7 days)
4. **Human-readable output** — Tier badges `[HIGH]/[NORMAL]/[LOW]`, duplicate annotations, stats summary

## Key Decisions

- **Reconciliation runs BEFORE `processMeetingExtraction()`** — Operates on raw `MeetingIntelligence` so processing-level decisions take precedence
- **Opt-in via flag** — Avoids overhead for single-meeting quick extractions; suitable for batch workflows like daily-winddown
- **Graceful degradation** — Empty area context still works; errors logged as warnings, extraction continues

## Technical Details

- Reconciliation context loaded from `areas/*/memory.md` files
- Recent meetings loaded via frontmatter status filtering (`processed`/`approved`)
- Items with reconciliation `status: duplicate|completed` get `stagedItemStatus: skipped`
- JSON output includes `reconciliation` field with stats and per-item details

## Files Changed

- `packages/core/src/services/meeting-reconciliation.ts` — Added `loadRecentMeetingBatch`
- `packages/cli/src/commands/meeting.ts` — Added `--reconcile`, `--reconcile-days`, reconciliation logic
- `packages/cli/src/lib/reconciliation-output.ts` — New display module with tier badges

## Testing

- 37 new tests across core and CLI
- Integration tests for cross-meeting dedup, JSON output, graceful degradation
- All 2603 tests passing

## Usage

```bash
# Basic reconciliation
arete meeting extract <file> --stage --reconcile

# Custom lookback window
arete meeting extract <file> --stage --reconcile --reconcile-days 14
```

## Related

- Plan: `dev/work/plans/wire-meeting-reconciliation-into-cli/`
- Previous: Intelligence improvements PRD (reconciliation module creation)
- Predecessor: `meeting-area-context` feature (area context in extraction prompt)

## Learnings

- `loadReconciliationContext` takes 2 params (storage, workspaceRoot), not 3 as initially assumed
- `storage.list()` returns full paths, not filenames — important for path handling
- `parseFrontmatter` is duplicated 9 times in codebase — refactor candidate
