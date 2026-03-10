# Web Pagination Implementation

**Date**: 2026-03-10
**Type**: Feature
**Status**: Complete

## Summary

Added pagination to Meetings, People, and Commitments list pages in the web UI. Memory pagination already existed and was excluded from scope.

## What Was Built

### Backend (commit 9a7fc50)
- Added `limit` and `offset` query parameters to `/api/meetings`, `/api/people`, `/api/commitments`
- All endpoints return consistent response format: `{ items, total, offset, limit }`
- Default limit is 25, max limit is 100
- Filters are applied before pagination (total reflects filtered count)

### Frontend (commits 0615cf9, 0f59a14, 880aeb8)
- MeetingsIndex, PeopleIndex, and CommitmentsPage have pagination UI
- URL-based page state (`?page=2`) for shareability
- Changing any filter resets page to 1
- Consistent UI: Previous/Next buttons + "Page X of Y" + "Showing X-Y of Z"

## Key Decisions

1. **URL-based pagination** — Used `useSearchParams` for page state so URLs are shareable and browser back works
2. **25 items default** — Balanced between load time and usefulness
3. **Filter reset behavior** — All filter changes reset to page 1 to avoid confusing empty pages
4. **Client-side sorting** — Sorting operates on current page only (known limitation, acceptable for MVP)

## Files Changed

**Backend:**
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/backend/src/routes/people.ts`
- `packages/apps/backend/src/routes/intelligence.ts`

**Frontend:**
- `packages/apps/web/src/pages/MeetingsIndex.tsx`
- `packages/apps/web/src/pages/PeopleIndex.tsx`
- `packages/apps/web/src/pages/CommitmentsPage.tsx`
- `packages/apps/web/src/hooks/meetings.ts`
- `packages/apps/web/src/hooks/people.ts`
- `packages/apps/web/src/hooks/intelligence.ts`
- `packages/apps/web/src/api/meetings.ts`
- `packages/apps/web/src/api/people.ts`
- `packages/apps/web/src/api/intelligence.ts`
- `packages/apps/web/src/api/types.ts`

## Learnings

1. **Consistent response format matters** — All paginated endpoints must return `{ items, total, offset, limit }`. The commitments endpoint originally returned `{ commitments: [...] }` without pagination fields — easy to miss when retrofitting pagination to existing endpoints.

2. **Hook backward compatibility** — Making pagination params optional with defaults ensures existing consumers don't break. The hooks work with or without pagination params.

3. **Filter + pagination interaction** — Must reset page to 1 when any filter changes, otherwise users can end up on an empty page that doesn't exist for the new filter combination.
