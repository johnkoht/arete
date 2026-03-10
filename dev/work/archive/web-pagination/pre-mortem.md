# Pre-Mortem: Web Pagination

## Summary

Before implementing pagination across the web UI list pages, this pre-mortem identifies potential risks and mitigations.

**Key Finding**: Memory (backend + frontend) already has full pagination support. The plan should focus only on Meetings, People, and Commitments.

---

### Risk 1: Plan-Reality Mismatch — Memory Already Done

**Problem**: The plan lists Memory as needing pagination, but the backend already supports `limit`/`offset`/`total` query parameters, and the frontend (`MemoryFeed.tsx`) already has working pagination UI. Implementing "again" would be wasted effort or could introduce bugs.

**Mitigation**: 
- Update the plan to remove Memory from scope
- Only implement pagination for: Meetings, People, Commitments
- Verify existing Memory pagination works correctly before proceeding

**Verification**: Run the app and test MemoryFeed pagination before starting implementation.

---

### Risk 2: Backend Route Location Mismatch

**Problem**: The plan mentions `packages/apps/backend/src/routes/commitments.ts` but commitments are actually served from `intelligence.ts` via `createCommitmentsRouter`. Subagents following the plan would create wrong files or look in wrong places.

**Mitigation**:
- Update plan to reference correct file: `packages/apps/backend/src/routes/intelligence.ts`
- Ensure PRD tasks have correct file paths

**Verification**: PRD file paths match actual codebase structure.

---

### Risk 3: Inconsistent Pagination Response Format

**Problem**: Memory returns `{ items, total, offset, limit }` while new endpoints might return different structures, causing frontend code to handle different response shapes.

**Mitigation**:
- Establish standard pagination response format: `{ items: T[], total: number, offset: number, limit: number }`
- Document in PRD that all endpoints must follow this format
- Consider extracting a shared pagination utility

**Verification**: All implemented endpoints return consistent response shape.

---

### Risk 4: URL State Not Persisting Page Number

**Problem**: The plan mentions "URL updates with page parameter (?page=2)" but if implemented inconsistently, users refreshing or sharing links could lose their place.

**Mitigation**:
- Use React Router's `useSearchParams` consistently across all pages
- Reset page to 1 when filters change
- Test URL round-trip (set page, refresh, verify page is preserved)

**Verification**: Each page component uses URL-based page state.

---

### Risk 5: Empty State and Loading State Inconsistencies

**Problem**: MeetingsIndex, PeopleIndex, and CommitmentsPage have different loading skeleton and empty state patterns. Adding pagination might create visual inconsistencies.

**Mitigation**:
- Review existing loading/empty states in each component before adding pagination
- Follow the pattern established in MemoryFeed.tsx (which already has pagination)
- Keep pagination UI placement consistent (bottom of list, after content)

**Verification**: Visual review of all 4 pages showing consistent UX.

---

### Risk 6: Frontend Hooks Missing Pagination Parameters

**Problem**: Current hooks like `useMeetings()` and `usePeople()` don't accept pagination params. Adding them requires updating both the hook signature and all call sites.

**Mitigation**:
- Make pagination params optional with defaults (`limit=25`, `offset=0`)
- Update hooks to accept params object: `useMeetings({ limit, offset })`
- Ensure backward compatibility — existing callers without params get default behavior

**Verification**: Existing pages compile and work without changes to hook calls.

---

### Risk 7: Sorting + Pagination Interaction

**Problem**: MeetingsIndex and PeopleIndex have client-side sorting. When pagination is added, sorting should happen server-side, or users will only sort within the current page (confusing UX).

**Mitigation**:
- For MVP: Keep client-side sorting but paginate the full sorted list
- The backend loads all items, so sorting can remain client-side initially
- Document this as a known limitation for future server-side sort enhancement

**Verification**: Sorting works correctly across paginated views.

---

### Risk 8: Commitments Filters + Pagination Interaction

**Problem**: CommitmentsPage has multiple filters (open/overdue/thisweek, mine/theirs, priority). Pagination must work correctly with all filter combinations, and changing filters should reset to page 1.

**Mitigation**:
- Reset page to 1 whenever any filter changes
- Pass all filters to backend along with pagination params
- Backend returns `total` after all filters applied

**Verification**: Test pagination with various filter combinations; verify total count reflects filtered results.

---

## Summary

| Risk | Category | Severity |
|------|----------|----------|
| Memory Already Done | Scope | High (wasted effort) |
| Backend Route Mismatch | Context | Medium (wrong files) |
| Response Format Inconsistency | Integration | Medium |
| URL State Persistence | UX | Medium |
| Loading/Empty State UX | UX | Low |
| Hook Backward Compatibility | Integration | Medium |
| Sorting + Pagination | UX | Low (known limitation) |
| Filters + Pagination | Integration | Medium |

**Categories covered**: Context Gaps, Integration, Scope Creep, Code Quality, Platform Issues

**Ready to proceed with these mitigations incorporated into the PRD.**
