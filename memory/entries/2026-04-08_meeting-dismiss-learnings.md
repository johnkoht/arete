# Meeting Dismiss (Skip) Feature

**Date**: 2026-04-08
**Plan**: `dev/work/plans/meeting-dismiss/`
**Size**: Medium (12 files, +403/-47)

## What Changed

Added `'skipped'` as a new meeting status lifecycle state. Meetings can now be dismissed from triage (ReviewPage) or from MeetingDetail, setting `status: skipped` in frontmatter. Dismissed meetings show a "Skipped" badge, appear dimmed in MeetingsIndex, and leave the triage queue. Unskip restores to `processed`.

### Files touched
- **Core**: `packages/core/src/integrations/meetings.ts` — status union
- **Backend**: `src/routes/meetings.ts`, `src/services/workspace.ts` — skip/unskip routes, `getMeetingStatus()`, `updateMeeting` extended
- **Web API**: `src/api/meetings.ts`, `src/api/types.ts` — `normalizeStatus` + API fns
- **Web hooks**: `src/hooks/meetings.ts` — `useSkipMeeting`, `useUnskipMeeting`
- **Web pages**: `ReviewPage.tsx`, `MeetingDetail.tsx`, `MeetingsIndex.tsx`
- **Web components**: `StatusBadge.tsx`, `MetadataPanel.tsx`
- **Tests**: 6 new backend route tests (36 total pass)

## Key Decisions

1. **Extend `updateMeeting()` vs. new service functions**: Chose to add `status` param to existing `updateMeeting()` (DRY) rather than creating separate `skipMeeting()`/`unskipMeeting()` service functions.
2. **Unskip restores to `'processed'`**: Not to the original pre-skip status. Simple and correct — processed means "ready for review."
3. **Optimistic UI in ReviewPage**: Meeting items removed from view immediately on dismiss, rolled back on API error. Uses `dismissedSlugs` Set state.

## Learnings

- **TOCTOU in status guards**: Initial implementation had `getMeetingStatus()` outside `withSlugLock`, creating a race condition. Review caught it. Fix: status check + update must both be inside the same `withSlugLock` call. Return a discriminated union (`{ conflict: true, error }` or `{ conflict: false }`) from inside the lock to propagate 409s.
- **`normalizeStatus()` is the single chokepoint**: The frontend `normalizeStatus()` function maps backend status strings to the `MeetingStatus` union. Forgetting to add a case there makes the entire feature invisible (unknown statuses fall through to `'synced'`). Always update this when adding new statuses.
- **StatusBadge config uses `defaultConfig` fallback**: The `StatusBadge` component falls through to `defaultConfig` for unknown statuses, so missing a config entry won't crash — but the badge text will still display via `displayStatus()`. Adding an explicit config entry is still necessary for correct styling.

## Review Notes

- Engineering lead review caught 1 issue: TOCTOU race condition in skip/unskip routes (status check outside withSlugLock). Fixed by moving both check and update inside the lock.
- 3 pre-existing test failures in `agent.test.ts` (unrelated, confirmed on clean main).
