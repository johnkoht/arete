---
title: Web Pagination
slug: web-pagination
status: draft
size: medium
tags: [web, backend, pagination]
created: 2026-03-09T17:30:00.000Z
updated: 2026-03-09T17:30:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Web Pagination

Add pagination to all list pages in the web UI.

---

## Problem Statement

Currently all list pages (Meetings, People, Commitments, Memory Feed) render all items at once. This causes:
- Slow initial load with large datasets
- Poor UX when scrolling through hundreds of items
- No way to navigate to specific pages of results

## Success Criteria

- All 4 list pages have working pagination
- Users can navigate between pages
- Default page size is 25 items
- Backend supports limit/offset queries

---

## Plan

### 1. Backend Pagination Support

Add `limit` and `offset` query parameters to list endpoints.

**Acceptance Criteria:**
- [ ] `/api/meetings` accepts `?limit=25&offset=0`
- [ ] `/api/people` accepts `?limit=25&offset=0`
- [ ] `/api/commitments` accepts `?limit=25&offset=0`
- [ ] `/api/memory` accepts `?limit=25&offset=0`
- [ ] Response includes `total` count for pagination UI
- [ ] Default limit is 25, default offset is 0

**Files:**
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/backend/src/routes/people.ts`
- `packages/apps/backend/src/routes/commitments.ts`
- `packages/apps/backend/src/routes/memory.ts`

---

### 2. Pagination Component

Create or enhance a shared Pagination component.

**Acceptance Criteria:**
- [ ] Component shows current page and total pages
- [ ] Previous/Next buttons work
- [ ] Page number buttons for quick navigation
- [ ] Disabled states when at first/last page
- [ ] Compact design (matches Linear style)

**Files:**
- `packages/apps/web/src/components/ui/pagination.tsx`

---

### 3. Frontend Integration - Meetings & Memory

Add pagination to MeetingsIndex and MemoryFeed.

**Acceptance Criteria:**
- [ ] MeetingsIndex shows 25 items per page
- [ ] MemoryFeed shows 25 items per page
- [ ] URL updates with page parameter (?page=2)
- [ ] Loading state while fetching new page
- [ ] Pagination component at bottom of list

**Files:**
- `packages/apps/web/src/pages/MeetingsIndex.tsx`
- `packages/apps/web/src/pages/MemoryFeed.tsx`
- `packages/apps/web/src/hooks/meetings.ts`
- `packages/apps/web/src/hooks/memory.ts`

---

### 4. Frontend Integration - People & Commitments

Add pagination to PeopleIndex and CommitmentsPage.

**Acceptance Criteria:**
- [ ] PeopleIndex shows 25 items per page
- [ ] CommitmentsPage shows 25 items per page
- [ ] URL updates with page parameter
- [ ] Consistent UX with Meetings/Memory pages

**Files:**
- `packages/apps/web/src/pages/PeopleIndex.tsx`
- `packages/apps/web/src/pages/CommitmentsPage.tsx`
- `packages/apps/web/src/hooks/people.ts`
- `packages/apps/web/src/hooks/commitments.ts`

---

## Out of Scope

- Infinite scroll (using pagination instead)
- Configurable page sizes
- "Load more" pattern
- Cursor-based pagination

---

## Dependencies

- None (can start immediately)

---

## Testing Notes

- Test navigation between pages
- Test URL persistence (refresh maintains page)
- Test edge cases (last page with fewer items)
- Verify total count accuracy
