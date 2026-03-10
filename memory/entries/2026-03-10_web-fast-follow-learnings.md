# Web Fast Follow — Learnings

**Date**: 2026-03-10  
**Plan**: web-fast-follow  
**Status**: Complete (partial execution)

---

## Summary

Implemented Phase 1 foundation and Track A project features for web UI consistency improvements. Several Track B and C items were already well-implemented upon verification.

---

## What Was Done

### Phase 1: Foundation
- **F1**: CategoryBadge updated to match StatusBadge pattern (dot + styled container)
- **F2**: MeetingsIndex refactored to use PageHeader component
- **F3**: Created SearchableSelect reusable component
- **F4**: Added `projectSlug` field to Commitment and ReviewItem types

### Track A: Project Features
- Project picker added to ReviewItems for action items
- Created projects API client and useProjects hook

### Verified Already Good
- CommitmentsPage: Already uses PageHeader, underlined tabs, completion on left
- PeopleIndex: Already has proper table layout
- MeetingDetail: Already has max-w-4xl constraint

---

## Follow-up Plans Created

1. **web-pagination** — Backend limit/offset + frontend pagination for all list pages
2. **person-detail-redesign** — Two-column layout, activity sections, edit drawer

Smaller items moved to `dev/work/backlog/web-ui-enhancements.md`.

---

## Learnings

### Process
- **Verify before building**: Several items were already implemented correctly. Checking existing state before planning execution saved significant time.
- **Split large plans into PRDs**: A large plan (10+ items) should either become a PRD for autonomous execution, or be split into multiple focused plans. We learned this mid-execution.
- **Plan → PRD flow is 1:1**: When remaining items from a plan need PRDs, create new plans rather than trying to attach multiple PRDs to one plan.

### Technical
- **SearchableSelect null vs empty string**: Initial implementation passed `""` for "None" selection, but consumers expected `null`. Type definition was correct (`string | null`), but implementation diverged. Engineering review caught this.
- **Markdown rendering snake_case conflict**: Using `_text_` for italic conflicts with snake_case identifiers in technical content. Limited markdown rendering to bold only.
- **React Query for API hooks**: Using `useQuery` with proper staleTime (5 min) provides good caching for reference data like projects list.

---

## Files Changed

```
packages/core/src/models/entities.ts
packages/apps/web/src/api/types.ts
packages/apps/web/src/api/projects.ts (new)
packages/apps/web/src/hooks/projects.ts (new)
packages/apps/web/src/components/ui/searchable-select.tsx (new)
packages/apps/web/src/components/people/PersonBadges.tsx
packages/apps/web/src/components/ReviewItems.tsx
packages/apps/web/src/components/ParsedItemsSection.tsx
packages/apps/web/src/pages/MeetingsIndex.tsx
```

---

## Commits

```
b4b3546 build: regenerate dist/AGENTS.md
a125e5d docs: Create follow-up plans from Web Fast Follow remaining items
d3c08d5 docs: Update Web Fast Follow plan with completion summary
94fee44 feat(web): Add project picker to ReviewItems (Track A)
5f41649 feat(web): Web Fast Follow Phase 1 foundation
```
