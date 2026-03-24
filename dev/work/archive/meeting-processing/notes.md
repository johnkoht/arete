# Meeting Processing CLI Parity — Planning Notes

## Problem Statement

CLI and UI meeting processing produce different outputs:
- **UI**: Full metadata (staged_item_status, confidence, source) + body sections
- **CLI**: Body sections only, no frontmatter metadata

This breaks interchangeability — items processed via CLI don't show up correctly in UI.

## Success Metric

User can use CLI skill (daily-winddown) and UI interchangeably:
1. Monday PM: Process meetings via skill → UI shows them as approved
2. Tuesday AM: Review in UI → correct status visible
3. Tuesday: Process new meeting in UI → works normally  
4. Tuesday PM: Run skill again → detects already-approved meetings

## Key Decisions

- **Option A** chosen: Add `arete meeting approve` command (not `--commit` flag on extract)
- Both `--all` and `--items`/`--skip` support needed for flexible approval
- Interactive mode deferred as fast-follow
- Reprocessing: follow UI pattern (checkbox for clearing previously approved)

## Technical Discovery

### Gap Analysis

| Feature | CLI `extract --stage` | Backend `/process` |
|---------|----------------------|-------------------|
| Extraction | ✅ Same | ✅ Same |
| Confidence filtering | ❌ | ✅ |
| User notes dedup | ❌ | ✅ |
| Auto-approval | ❌ | ✅ |
| Frontmatter metadata | ❌ | ✅ |

### Architecture

Backend's post-processing logic needs to move to core so both CLI and backend can use it.

```
@arete/core:
  extractMeetingIntelligence()    ← existing
  processMeetingExtraction()      ← NEW
  commitApprovedItems()           ← existing
```

## Out of Scope

- Interactive approval mode (fast-follow)
- `arete meeting extract --commit` (auto-approve all, bypass staging)
- Changes to the UI (UI already works correctly)
- Changes to extraction logic (already unified via unify-meeting-extraction plan)

## Fast-Follow Notes

- Interactive `approve` command: show staged items, prompt for each
- Consider `arete meeting` without subcommand as shorthand for common workflow

## References

- Previous plan: unify-meeting-extraction (completed)
- Backend processing: `packages/apps/backend/src/services/agent.ts`
- Core commit: `packages/core/src/integrations/staged-items.ts`
- CLI meeting: `packages/cli/src/commands/meeting.ts`
