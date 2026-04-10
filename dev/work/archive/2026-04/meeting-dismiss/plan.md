---
title: "Fix Meeting-Level Skip (Dismiss Meeting)"
slug: meeting-dismiss
status: complete
size: medium
tags: [meetings, review, ui]
created: "2026-04-08T20:00:00.000Z"
updated: "2026-04-08T20:00:00.000Z"
completed: "2026-04-08T22:00:00.000Z"
execution: null
has_review: true
has_pre_mortem: false
has_prd: true
steps: 6
---

# Fix Meeting-Level Skip ("Dismiss Meeting")

## Goal
Make the existing "Skip Meeting" button in ReviewPage actually dismiss meetings on the backend, so they leave the triage queue and show a "Skipped" status label.

## Context
The "Skip Meeting" button in `ReviewPage.tsx` (line 525) exists but only marks items as skipped in local React state (`handleSkipMeeting`, line 1050). The `POST /api/review/complete` endpoint writes a file but nothing processes skipped statuses. Meetings stay `processed` and keep appearing in triage.

## Key Decisions
- **Naming**: "Dismiss Meeting" (not "Skip") to avoid confusion with item-level skip
- **Timing**: Immediate API call on click (not batched with "Done Reviewing")
- **Frontmatter**: Only write `status: skipped`, NOT `importance: skip`
- **Un-skip**: Include un-skip button on skipped MeetingDetail (resets to `processed`)
- **Optimistic UI**: Remove items from ReviewPage immediately, rollback on error
- **DRY**: Extend `updateMeeting` to accept `status` field rather than two new service functions

## Plan

1. **Add `'skipped'` to MeetingStatus types** — Update status unions in core + frontend
   - Acceptance: `npm run typecheck` surfaces downstream issues

2. **Extend backend `updateMeeting` + add skip/unskip routes** — Write `status: skipped` to frontmatter with guards
   - Acceptance: skip sets frontmatter; unskip resets; guards reject invalid transitions

3. **Add frontend API functions + hooks** — `skipMeeting()`, `unskipMeeting()`, `normalizeStatus` update
   - Acceptance: hooks importable, correct query keys invalidated

4. **Wire ReviewPage dismiss button to backend** — Immediate API call with optimistic UI
   - Acceptance: clicking "Dismiss" removes meeting immediately; "Done Reviewing" disabled during dismiss

5. **Update StatusBadge, MeetingDetail, MeetingsIndex, MetadataPanel** — Visual treatment + un-skip
   - Acceptance: skipped meetings show "Skipped" badge, dimmed in list, un-skip works

6. **Tests** — Backend routes, normalizeStatus, component tests, ReviewPage tests
   - Acceptance: all tests pass, no regressions

## Risks
- normalizeStatus must be updated or feature is invisible
- Header badge fallback shows "Approved" for unknown statuses — must add skipped case
- Race with "Done Reviewing" — mitigated by disabling button during dismiss

## Out of Scope
- Bulk dismiss from MeetingsIndex
- Confirmation dialog (dismiss is reversible via un-skip)
- Writing `importance: skip`
