---
title: Web Fast Follow
slug: web-fast-follow
status: complete
size: large
tags: [web, ui, polish]
created: 2026-03-09T16:49:55.423Z
updated: 2026-03-10T02:15:21.102Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 12
---

# Web Fast Follow

Fast-follow improvements for the web UI and related data model changes.

---

## Execution Approach

**Hybrid: Foundation → Parallel Tracks**

### Phase 1 — Foundation (sequential)
Build shared dependencies before parallel work:

1. **Item F1: Badge/Pill System Audit** — Define consistent color palette and styles
2. **Item F2: PageHeader Standardization** — Audit existing PageHeader; ensure all pages use it
3. **Item F3: SearchableSelect Component** — Reusable filterable dropdown
4. **Item F4: Data Model Changes** — Add projectSlug to Commitment type

### Phase 2 — Parallel Execution (3 sub-orchestrators)

| Track | Items | Scope | File Ownership |
|-------|-------|-------|----------------|
| **A: Project Features** | 2, 4 | ReviewItems.tsx, agent prompts | `ReviewItems.tsx`, `packages/runtime/skills/` |
| **B: Page Polish** | 6, 7, 10 | MeetingDetail, PeopleIndex, pagination | `MeetingDetail.tsx`, `PeopleIndex.tsx`, `MemoryFeed.tsx` |
| **C: Page Redesigns** | 8, 9 | PersonDetail, Commitments | `PersonDetailPage.tsx`, `CommitmentsPage.tsx` |

---

## Phase 1 Items (Foundation)

### F1. Badge/Pill System Audit

**Problem:** Badge and pill styles are inconsistent across pages (category badges, status pills, etc.)

**Acceptance Criteria:**
- [ ] Document current badge/pill usage across all pages
- [ ] Define consistent color palette (success/warning/error/info/muted)
- [ ] Update or create `StatusBadge` component with variants
- [ ] Category badges (Internal/Customer/User) use same style as meeting status badges

**Files:** `StatusBadge.tsx`, potentially new `Badge.tsx` in ui/

---

### F2. PageHeader Standardization

**Problem:** PageHeader component exists but not all pages use it. MeetingsIndex and MeetingDetail have custom headers.

**Acceptance Criteria:**
- [ ] All list pages use `<PageHeader>` component
- [ ] Header height is consistent (with or without subtitle)
- [ ] Left alignment matches across all pages
- [ ] MeetingsIndex and MeetingDetail refactored to use PageHeader

**Files:** `PageHeader.tsx`, all page files in `src/pages/`

---

### F3. SearchableSelect Component

**Problem:** Need consistent way to filter/select from lists (projects, people, etc.)

**Acceptance Criteria:**
- [ ] Component renders dropdown with search input
- [ ] Supports `items`, `selected`, `onSelect`, `placeholder`, `allowClear` props
- [ ] "None" option available when `allowClear=true`
- [ ] Keyboard navigation works (arrow keys, enter, escape)
- [ ] Basic unit test exists

**Files:** `src/components/ui/searchable-select.tsx`, test file

---

### F4. Data Model Changes

**Problem:** Commitments have no project association.

**Acceptance Criteria:**
- [ ] `Commitment` type has `projectSlug?: string` field
- [ ] `ReviewItem` type has `projectSlug?: string` field
- [ ] Extraction flow copies meeting's `projectSlug` to action items
- [ ] Backend API returns projectSlug in commitment responses
- [ ] Projects API verified to return data for dropdown

**Files:** `packages/core/src/models/entities.ts`, extraction services, backend routes

---

## Phase 2 Items

### Track A: Project Features

#### A1. Project Picker in Review UI

**Problem:** Users need to see/change project assignment during review.

**Acceptance Criteria:**
- [ ] Action item cards show project pill (icon + name or icon-only if none)
- [ ] Clicking pill opens SearchableSelect dropdown
- [ ] Inherited projects shown muted; explicit selections shown normal
- [ ] Selection updates local state; saved on approve
- [ ] Projects loaded from API on mount

**Files:** `ReviewItems.tsx`, `src/api/types.ts`

---

#### A2. Agent Flow: Project Context

**Problem:** Agent doesn't inform user about project assignment.

**Acceptance Criteria:**
- [ ] Agent prompt mentions project when meeting has one
- [ ] User can override per-item or globally
- [ ] "No Project" option available

**Files:** Meeting processing prompts/templates in `packages/runtime/`

---

### Track B: Page Polish

#### B1. Meeting Details Page Improvements

**Problem:** Meeting detail page has UX issues.

**Acceptance Criteria:**
- [ ] Uses PageHeader component
- [ ] Action item text renders without raw markdown (`**bold**` → **bold** or stripped)
- [ ] Action item click either toggles completion or has no click affordance
- [ ] Content area has `max-w-4xl` (~896px) constraint
- [ ] Project badge displayed if meeting has projectSlug

**Files:** `MeetingDetail.tsx`

---

#### B2. People Intelligence Table Redesign

**Problem:** Table layout inconsistent, columns spread too wide.

**Acceptance Criteria:**
- [ ] Name column uses `flex-1` to fill available space
- [ ] Right columns (Category, Health, etc.) are compact, right-aligned
- [ ] Category badges use standardized badge styles (from F1)
- [ ] Uses PageHeader component

**Files:** `PeopleIndex.tsx`

---

#### B3. Pagination

**Problem:** No pagination — all items render at once.

**Acceptance Criteria:**
- [ ] MeetingsIndex, PeopleIndex, CommitmentsPage, MemoryFeed have pagination
- [ ] Default page size: 25 items
- [ ] Pagination component shows page numbers and prev/next
- [ ] Backend supports `limit` and `offset` parameters (verify)

**Files:** `MeetingsIndex.tsx`, `PeopleIndex.tsx`, `CommitmentsPage.tsx`, `MemoryFeed.tsx`

---

### Track C: Page Redesigns

#### C1. People Detail Page Redesign

**Problem:** Single-column layout with no hierarchy.

**Sub-tasks:**
1. **C1a. Header bar** — Back link, name, category badge, edit button
2. **C1b. Two-column layout** — Left (commitments, meetings, notes) / Right (overview, role, style)
3. **C1c. Commitment/Meeting tables** — Compact tables with "View All" links
4. **C1d. Markdown editor drawer** — Edit button opens drawer with MarkdownEditor

**Acceptance Criteria:**
- [ ] Header matches PageHeader style
- [ ] Two-column layout with max-width ~1200px
- [ ] Left column: Open Commitments (3-5 rows), Recent Meetings (5 rows), Key Notes
- [ ] Right column: Overview card, Role & Context, Working Style
- [ ] Edit opens drawer (not inline editing)
- [ ] Category badge uses standardized style

**Files:** `PersonDetailPage.tsx`, possibly new sub-components

---

#### C2. Commitments Page Fixes

**Problem:** Multiple styling and UX issues.

**Acceptance Criteria:**
- [ ] Uses PageHeader component
- [ ] Mine/Theirs/All uses underlined tab style (not pills)
- [ ] Status badges use standardized styles
- [ ] Table alignment fixed
- [ ] Direction shows icon or abbreviated label
- [ ] Completion checkbox on left, delete on right
- [ ] Click commitment text to view source meeting (if source available)

**Files:** `CommitmentsPage.tsx`

---

## Out of Scope

- Decisions/learnings project context (future item)
- Infinite scroll (using pagination instead)
- Full design system overhaul (just badge consistency)
- Mobile responsiveness improvements
- Dark mode adjustments

---

## Testing Notes

- SearchableSelect should have unit test
- Visual regression testing optional but recommended for PageHeader
- Existing ReviewItems tests should pass after changes
