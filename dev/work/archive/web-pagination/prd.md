# PRD: Web Pagination

**Version**: 1.0  
**Status**: Planned  
**Date**: 2026-03-10  
**Branch**: `arete--web-pagination` (worktree)

---

## 1. Problem & Goals

### Problem

The Areté web dashboard's list pages (Meetings, People, Commitments) render all items at once. This causes:

- Slow initial load with large datasets (hundreds of meetings/people/commitments)
- Poor UX when scrolling through long lists
- No way to navigate to specific sections of results
- Browser performance issues with large DOM trees

**Note**: The Memory page already has pagination implemented. This PRD covers only the remaining 3 pages.

### Goals

1. **Backend pagination**: Add `limit` and `offset` query parameters to `/api/meetings`, `/api/people`, and `/api/commitments` endpoints
2. **Consistent response format**: All paginated endpoints return `{ items, total, offset, limit }` for frontend consistency
3. **Frontend pagination**: Add pagination UI to MeetingsIndex, PeopleIndex, and CommitmentsPage
4. **URL state**: Page number persists in URL (`?page=2`) for shareability and refresh persistence
5. **Filter awareness**: Changing filters resets page to 1; total reflects filtered count

### Out of Scope

- Memory pagination (already implemented)
- Infinite scroll (using pagination pattern)
- Configurable page sizes (hardcoded to 25)
- "Load more" pattern
- Cursor-based pagination
- Server-side sorting (using client-side for MVP)

---

## 2. Technical Approach

### Backend

Each endpoint adds optional `limit` (default: 25, max: 100) and `offset` (default: 0) query params. The response includes:

```typescript
{
  meetings: Meeting[],  // or people/commitments
  total: number,        // total count after filters applied
  offset: number,       // current offset
  limit: number         // current limit
}
```

Filters are applied before slicing, so `total` always reflects the filtered count.

### Frontend

Each page:
1. Reads `page` from URL search params (default: 1)
2. Calculates `offset = (page - 1) * PAGE_SIZE`
3. Passes `{ limit: 25, offset }` to data hooks
4. Renders pagination UI at bottom when `total > PAGE_SIZE`
5. Resets page to 1 when filters change

Use the existing shadcn/ui pagination primitives from `components/ui/pagination.tsx`.

---

## 3. Tasks

### Task A: Backend Pagination Support

Add pagination to the three backend endpoints.

**Files:**
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/backend/src/routes/people.ts`
- `packages/apps/backend/src/routes/intelligence.ts` (commitments router)

**Acceptance Criteria:**
- [ ] A1: `/api/meetings` accepts `?limit=25&offset=0` query params
- [ ] A2: `/api/meetings` returns `{ meetings, total, offset, limit }` response shape
- [ ] A3: `/api/people` accepts `?limit=25&offset=0` query params
- [ ] A4: `/api/people` returns `{ people, total, offset, limit }` response shape
- [ ] A5: `/api/commitments` accepts `?limit=25&offset=0` query params
- [ ] A6: `/api/commitments` returns `{ commitments, total, offset, limit }` response shape
- [ ] A7: Default limit is 25, max limit is 100
- [ ] A8: Existing filters (status, direction, priority for commitments; category for people; tabs for meetings) apply before pagination
- [ ] A9: All tests pass (`npm test` in backend package)

---

### Task B: Frontend - Meetings Pagination

Add pagination to MeetingsIndex page.

**Files:**
- `packages/apps/web/src/pages/MeetingsIndex.tsx`
- `packages/apps/web/src/hooks/meetings.ts`
- `packages/apps/web/src/api/meetings.ts`

**Acceptance Criteria:**
- [ ] B1: `useMeetings({ limit, offset })` hook accepts optional pagination params with defaults
- [ ] B2: `fetchMeetings(params)` API function supports pagination params
- [ ] B3: MeetingsIndex reads `page` from URL search params using `useSearchParams`
- [ ] B4: MeetingsIndex shows 25 items per page
- [ ] B5: Pagination UI shows at bottom when total > 25 (Previous/Next buttons, page info)
- [ ] B6: Clicking Next/Previous updates URL and fetches new page
- [ ] B7: Changing filter tabs (All/Triage/Approved) resets page to 1
- [ ] B8: Loading skeleton shows while fetching new page
- [ ] B9: Page state persists on refresh (URL-based)

---

### Task C: Frontend - People Pagination

Add pagination to PeopleIndex page.

**Files:**
- `packages/apps/web/src/pages/PeopleIndex.tsx`
- `packages/apps/web/src/hooks/people.ts`
- `packages/apps/web/src/api/people.ts`

**Acceptance Criteria:**
- [ ] C1: `usePeople({ limit, offset })` hook accepts optional pagination params with defaults
- [ ] C2: `fetchPeople(params)` API function supports pagination params
- [ ] C3: PeopleIndex reads `page` from URL search params
- [ ] C4: PeopleIndex shows 25 items per page
- [ ] C5: Pagination UI shows at bottom when total > 25
- [ ] C6: Changing category tabs (Favorites/All/Internal/Customer/User) resets page to 1
- [ ] C7: Changing commitment filter (?filter=overdue) resets page to 1
- [ ] C8: Loading skeleton shows while fetching new page
- [ ] C9: Consistent UX with MeetingsIndex pagination

---

### Task D: Frontend - Commitments Pagination

Add pagination to CommitmentsPage.

**Files:**
- `packages/apps/web/src/pages/CommitmentsPage.tsx`
- `packages/apps/web/src/hooks/intelligence.ts`
- `packages/apps/web/src/api/intelligence.ts`

**Acceptance Criteria:**
- [ ] D1: `useCommitments({ limit, offset, ...filters })` hook accepts pagination params
- [ ] D2: `fetchCommitments(params)` API function supports pagination params
- [ ] D3: CommitmentsPage reads `page` from URL search params
- [ ] D4: CommitmentsPage shows 25 items per page
- [ ] D5: Pagination UI shows at bottom when total > 25
- [ ] D6: Changing filter tabs (Open/Overdue/This Week/All) resets page to 1
- [ ] D7: Changing direction tabs (Mine/Theirs/All) resets page to 1
- [ ] D8: Changing priority tabs (All/High/Medium/Low) resets page to 1
- [ ] D9: Consistent UX with other paginated pages

---

## 4. Risk Mitigations

From pre-mortem analysis:

| Risk | Mitigation |
|------|------------|
| Memory already done | Excluded from scope; verified during planning |
| Wrong file paths | Commitments in `intelligence.ts`, corrected in PRD |
| Response format inconsistency | Standard format: `{ items, total, offset, limit }` |
| Filter reset behavior | All filter changes reset page to 1 |
| Hook backward compatibility | Pagination params optional with defaults |
| Sorting + pagination | Client-side sorting within fetched page (known limitation) |

---

## 5. Testing Notes

- Test navigation between pages (first, middle, last)
- Test URL persistence (set page, refresh, verify page is preserved)
- Test edge cases: last page with fewer items, empty results, single-page results
- Test filter + pagination interaction (change filter → page 1)
- Verify total count accuracy with filters applied
- Run `npm run typecheck && npm test` before marking complete
