---
title: "Meeting Processing CLI Parity"
slug: meeting-processing
status: complete
size: medium
tags: [meetings, cli, parity, refactor]
created: "2026-03-12T02:30:00.000Z"
updated: 2026-03-16T02:46:40.592Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 5
---

# Meeting Processing CLI Parity

## Goal

Enable seamless interchangeability between CLI and UI for meeting processing — items processed via CLI show correctly in UI, and vice versa.

## Problem Statement

CLI and UI meeting processing produce different outputs:
- **UI**: Full metadata (staged_item_status, confidence, source) + body sections
- **CLI**: Body sections only, no frontmatter metadata

This breaks interchangeability — items processed via CLI don't show up correctly in UI.

## Success Criteria

User can switch between CLI (skill) and UI seamlessly:
1. Process via CLI → UI shows correct status
2. Process via UI → CLI can read and approve
3. Approve via CLI → UI shows approved items in meeting detail
4. Reprocess works from either surface

**Interchangeability Test**:
| Day | Action | Tool | Expectation |
|-----|--------|------|-------------|
| Mon PM | Daily winddown processes meetings | Skill (CLI) | All show as "approved" in UI |
| Tue AM | Review Monday's meeting in UI | UI | See approved items correctly |
| Tue 10am | Process new meeting in UI | UI | Works normally |
| Tue PM | Daily winddown runs | Skill (CLI) | Detects already approved, processes only new |

## Plan

1. **Create `processMeetingExtraction()` in core** — Extract backend's post-processing logic into reusable core function
   - Input: MeetingExtractionResult, userNotes, options
   - Output: filtered items, staged_item_* maps (status, confidence, source, owner)
   - Acceptance: Function exported from @arete/core with unit tests for confidence filtering, dedup, auto-approval

2. **Refactor backend to use `processMeetingExtraction()`** — Backend's runProcessingSession calls the new core function
   - Remove inline implementations of filtering/dedup/status logic
   - Keep backend-specific concerns (job events, file I/O)
   - Acceptance: All 30 agent.test.ts tests pass, no behavior change

3. **Enhance CLI `extract --stage` to write full metadata** — CLI produces same output as backend
   - Call processMeetingExtraction() after extraction
   - Write frontmatter: status: processed, processed_at, staged_item_* fields
   - Acceptance: Meeting file has full metadata matching backend output

4. **Add `arete meeting approve` command** — CLI command to commit staged items
   - Syntax: `arete meeting approve <slug> [--all] [--items id,id] [--skip id] [--json]`
   - Read staged_item_status, update statuses, call commitApprovedItems()
   - Acceptance: Approved items appear in memory files, meeting frontmatter updated

5. **Add `--clear-approved` to `extract`** — Support reprocessing approved meetings
   - Clear ## Approved * sections and approved_* frontmatter before extraction
   - Acceptance: Reprocessed meeting has fresh staged items, status: processed

## Technical Context

### Current Gap

| Feature | CLI `extract --stage` | Backend `/process` |
|---------|----------------------|-------------------|
| Extraction | ✅ Same | ✅ Same |
| Confidence filtering | ❌ | ✅ (< 0.5 excluded) |
| User notes dedup | ❌ | ✅ (Jaccard > 0.7) |
| Auto-approval | ❌ | ✅ (high confidence → approved) |
| Frontmatter metadata | ❌ | ✅ |

### Target Architecture

```
@arete/core:
  extractMeetingIntelligence()    ← existing (both use)
  processMeetingExtraction()      ← NEW (both use)
  commitApprovedItems()           ← existing (both use)
```

## Risks

- Backend test breakage during refactor → Run tests after each change, keep behavior identical
- Type compatibility between packages → Use shared types from core
- Edge cases in CLI-UI interop → Integration tests for the interchangeability scenarios

## Out of Scope

- Interactive approval mode (fast-follow)
- `--commit` flag on extract (auto-approve, skip staging)
- UI changes (UI already works correctly)
- Changes to extraction logic (already unified)
