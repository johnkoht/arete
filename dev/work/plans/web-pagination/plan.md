---
title: Web Pagination
slug: web-pagination
status: building
size: medium
tags: [web, backend, pagination]
created: 2026-03-09T17:30:00.000Z
updated: 2026-03-10T05:00:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 3
---

# Web Pagination

Add pagination to Meetings, People, and Commitments list pages in the web UI.

---

## Problem Statement

Currently the Meetings, People, and Commitments list pages render all items at once. This causes:
- Slow initial load with large datasets
- Poor UX when scrolling through hundreds of items
- No way to navigate to specific pages of results

**Note**: Memory already has full pagination support (backend + frontend). This plan focuses only on the remaining 3 pages.

## Success Criteria

- Meetings, People, and Commitments pages have working pagination
- Users can navigate between pages
- Default page size is 25 items
- Backend supports limit/offset queries with consistent response format
- URL-based page state for shareability
- Changing filters resets page to 1

---

## Plan

### 1. Backend Pagination Support

Add `limit` and `offset` query parameters to list endpoints.

**Acceptance Criteria:**
- [ ] `/api/meetings` accepts `?limit=25&offset=0` and returns `{ meetings, total, offset, limit }`
- [ ] `/api/people` accepts `?limit=25&offset=0` and returns `{ people, total, offset, limit }`
- [ ] `/api/commitments` accepts `?limit=25&offset=0` and returns `{ commitments, total, offset, limit }`
- [ ] Response format consistent: `{ items: T[], total: number, offset: number, limit: number }`
- [ ] Default limit is 25, default offset is 0
- [ ] Filters are applied before pagination (total reflects filtered count)

**Files:**
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/backend/src/routes/people.ts`
- `packages/apps/backend/src/routes/intelligence.ts` (contains commitments router)

---

### 2. Frontend Integration - Meetings

Add pagination to MeetingsIndex.

**Acceptance Criteria:**
- [ ] `useMeetings({ limit, offset })` hook accepts optional pagination params
- [ ] MeetingsIndex shows 25 items per page
- [ ] URL updates with page parameter (?page=2) using `useSearchParams`
- [ ] Loading state while fetching new page
- [ ] Pagination UI at bottom of list (Previous/Next + page info)
- [ ] Changing filter tabs resets page to 1
- [ ] Client-side sorting works within fetched page (known limitation)

**Files:**
- `packages/apps/web/src/pages/MeetingsIndex.tsx`
- `packages/apps/web/src/hooks/meetings.ts`
- `packages/apps/web/src/api/meetings.ts`

---

### 3. Frontend Integration - People & Commitments

Add pagination to PeopleIndex and CommitmentsPage.

**Acceptance Criteria:**
- [ ] `usePeople({ limit, offset })` hook accepts optional pagination params
- [ ] `useCommitments({ limit, offset, ...filters })` hook accepts pagination params
- [ ] PeopleIndex shows 25 items per page with pagination UI
- [ ] CommitmentsPage shows 25 items per page with pagination UI
- [ ] URL updates with page parameter using `useSearchParams`
- [ ] Changing any filter (category, direction, priority, status) resets page to 1
- [ ] Consistent UX with MeetingsIndex pagination

**Files:**
- `packages/apps/web/src/pages/PeopleIndex.tsx`
- `packages/apps/web/src/pages/CommitmentsPage.tsx`
- `packages/apps/web/src/hooks/people.ts`
- `packages/apps/web/src/hooks/intelligence.ts`
- `packages/apps/web/src/api/people.ts`
- `packages/apps/web/src/api/intelligence.ts`

---

## Out of Scope

- Memory pagination (already implemented)
- Infinite scroll (using pagination instead)
- Configurable page sizes (hardcoded to 25)
- "Load more" pattern
- Cursor-based pagination
- Server-side sorting (using client-side for MVP)

---

## Dependencies

- None (can start immediately)

---

## Testing Notes

- Test navigation between pages
- Test URL persistence (refresh maintains page)
- Test edge cases (last page with fewer items, empty results)
- Test filter + pagination interaction (filter change → page 1)
- Verify total count accuracy with filters applied

---

## Risk Mitigations (from Pre-Mortem)

1. **Memory already done** — Verified during planning; excluded from scope
2. **Correct file paths** — Commitments in `intelligence.ts`, not separate file
3. **Consistent response format** — All endpoints return `{ items, total, offset, limit }`
4. **Filter reset behavior** — All filter changes reset page to 1
5. **Backward compatible hooks** — Pagination params optional with defaults
