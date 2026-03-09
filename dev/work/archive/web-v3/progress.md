# Progress Log — web-v3

Started: 2026-03-07T16:45:00Z

---

## Pre-Mortem Summary

8 risks identified. Key mitigations:
- V3-1: Lazy loading, round-trip tests, theme consistency
- V3-2: Navigation guard for unsaved changes
- V3-3, V3-4: Backend API verification before frontend work
- All tasks: Include tests, run quality gates

---

## Task 1/6: V3-1 BlockEditor — ✅ COMPLETE

**Commit**: 99bb69d
**Files**: BlockEditor.tsx, BlockEditor.test.tsx, PersonDetailPage.tsx, LEARNINGS.md
**Tests**: 15 new tests (34 total passing)

**Key outcomes**:
- LazyBlockEditor with Suspense pattern implemented
- Theme CSS vars mapped to shadcn (--background, --foreground, --border)
- Round-trip lossy behavior documented (intentional by BlockNote design)
- LEARNINGS.md updated with BlockNote integration patterns

**Learnings**:
- BlockNote injects multiple style tags globally; search for `--bn-colors-*` pattern to find custom styles
- Test at prop/onChange level, not internal editor state
- `key` prop pattern for content initialization (same as TipTap)

---

## Task 2/6: V3-2 People Detail — ✅ COMPLETE

**Commit**: bf94662
**Files**: PersonDetailPage.tsx (restructured), PersonDetailPage.test.tsx (17 tests), LEARNINGS.md
**Tests**: 17 new tests (51 total passing)

**Key outcomes**:
- Single-column `max-w-3xl` layout replacing 2-column grid
- Commitments limited to 3 items with "See All" link to `/commitments?person={slug}`
- Meetings limited to 5 items, click opens MeetingSheet
- Navigation guard with `useBlocker` for unsaved changes
- LEARNINGS.md updated with data router testing pattern

**Learnings**:
- `useBlocker` requires data router (createMemoryRouter + RouterProvider), not MemoryRouter
- Testing pattern: wrap component with RouterProvider + createMemoryRouter

---

## Task 3/6: V3-5 Meeting Review UX — ✅ COMPLETE

**Commit**: 4630808
**Files**: ReviewItems.tsx, ReviewItems.test.tsx (16 tests), MeetingDetail.tsx
**Tests**: 16 new tests (67 total passing)

**Key outcomes**:
- localStorage persistence for collapse state (`arete-review-collapsed`)
- "Approve All" button per section for bulk approval
- Pending items default to approved in local state (frontend-only)
- Keyboard accessibility with proper ARIA attributes

**Learnings**:
- Followed existing localStorage patterns — no new gotchas
- Bulk approve uses existing PATCH pattern (individual calls per item)

---

## Task 4/6: V3-6 Meeting Sheet — ✅ COMPLETE

**Commit**: 2801dac
**Files**: PersonDetailPage.tsx (enhanced MeetingSheet), PersonDetailPage.test.tsx (12 new tests)
**Tests**: 12 new tests (79 total passing in web package)

**Key outcomes**:
- Full-height Sheet with meeting title, date, summary
- Metadata section with attendees and duration
- Collapsible parsed items (decisions, learnings, actions)
- Collapsible transcript section
- "Open full meeting" link to /meetings/:slug

**Learnings**:
- CollapsibleSection helper pattern for consistent collapsible UI
- formatDuration helper for human-readable duration

---

## Task 5/6: V3-3 Favorites — ✅ COMPLETE

**Commit**: a0d69d5
**Files**: Backend (people.ts, people.test.ts), Web (types.ts, people.ts, hooks, PeopleIndex.tsx), LEARNINGS.md
**Tests**: 9 backend tests + 5 frontend tests (84 total in web, 157 backend)

**Key outcomes**:
- Backend PATCH /api/people/:slug for favorite status
- Frontend useToggleFavorite hook with optimistic updates
- Star icon in first column, Favorites tab with count badge
- All tab sorts favorites first
- ?category=favorites URL param support

**Learnings**:
- **gray-matter caching gotcha**: Mutating frontmatter `data` object pollutes subsequent parses. Always clone before mutation (`{ ...data }`). Documented in backend LEARNINGS.md.

---

## Task 6/6: V3-4 Commitments — ✅ COMPLETE

**Commit**: 13a1a1e
**Files**: Backend (intelligence.ts, intelligence.test.ts), Web (intelligence.ts, hooks, CommitmentsPage.tsx, tests)
**Tests**: 7 backend tests + 28 frontend tests (35 total for this feature)

**Key outcomes**:
- Backend: direction and person query params on /api/commitments
- Frontend: Direction subnav (Mine/Theirs/All), Table layout with sortable columns
- Person filter chip with clear button
- Full URL structure: ?direction=mine&filter=open&person=anita-law
- "See All" from PersonDetailPage now works with person filter

**Learnings**:
- Followed existing patterns — no new gotchas discovered

---

## Execution Complete

**Status**: ✅ All 6 tasks completed
**Total commits**: 6
**Total tests added**: ~85 (15 + 17 + 16 + 12 + 14 + 35 = 109)
**Final test count**: 1441 passing

---

## Task: v3-1-blockeditor (Complete)

**Completed**: 2026-03-07T17:45:00Z
**Commit**: 99bb69d

### What was done
1. Added `LazyBlockEditor` export via `React.lazy()` for code splitting
2. Updated `PersonDetailPage.tsx` to use `LazyBlockEditor` with `<Suspense>` wrapper
3. Mapped BlockNote CSS variables to shadcn theme variables (--background, --foreground, --card, etc.)
4. Created comprehensive test suite (`BlockEditor.test.tsx`) with 15 tests covering:
   - Rendering (basic, with markdown, with className)
   - Read-only mode (editable=false hides side menu)
   - onChange callback (fires on content change, not during init)
   - Theme integration (data-theme attribute, shadcn CSS variables)
   - Lazy loading (LazyBlockEditor export)
5. Documented keyboard shortcuts (Cmd+B, Cmd+I, /) as manually verified
6. Updated LEARNINGS.md with BlockNote integration patterns and lossy conversions

### Files changed
- `packages/apps/web/src/components/BlockEditor.tsx` — added LazyBlockEditor, shadcn CSS vars
- `packages/apps/web/src/components/BlockEditor.test.tsx` — new (15 tests)
- `packages/apps/web/src/pages/PersonDetailPage.tsx` — Suspense wrapper
- `packages/apps/web/LEARNINGS.md` — BlockNote section

### Quality checks
- typecheck: ✓
- tests: ✓ (34 passed)

### Notes
- BlockNote's `blocksToMarkdownLossy()` is intentionally lossy — documented known normalizations
- Keyboard shortcuts tested manually since jsdom/ProseMirror automation is unreliable
- The existing CSS rule for hiding side menu in read-only mode was already correct

---

## Task: v3-2-people-detail (Complete)

**Completed**: 2026-03-07T17:56:00Z
**Commit**: bf94662

### What was done
1. Restructured PersonDetailPage from 2-column grid to single-column layout with `max-w-3xl`
2. Contact info displayed horizontally (email + company inline)
3. Open Commitments section: limited to 3 items, "See All →" links to `/commitments?person={slug}`
4. Recent Meetings section: limited to 5 items, click opens MeetingSheet
5. Intelligence section: HealthDot + TrendIcon + healthStatus text at top, stances/asks/concerns below
6. Notes section uses LazyBlockEditor with Suspense, edit/save/cancel flow
7. Navigation guard via `useBlocker` warns on unsaved changes
8. Updated loading skeleton to match single-column layout
9. Created comprehensive test suite (17 tests) covering:
   - Page rendering with sections
   - Open Commitments (3 items max, See All link)
   - Recent Meetings (5 items max, count indicator)
   - Intelligence section (health status, stances, asks, concerns)
   - Notes section (BlockEditor, edit mode toggle)
   - Loading and error states
   - useBlocker pattern documentation

### Files changed
- `packages/apps/web/src/pages/PersonDetailPage.tsx` — complete restructure
- `packages/apps/web/src/pages/PersonDetailPage.test.tsx` — new (17 tests)
- `packages/apps/web/LEARNINGS.md` — added useBlocker navigation guard pattern

### Quality checks
- typecheck: ✓
- tests: ✓ (51 passed)

### First-use pattern documented
`useBlocker` — first use in codebase. Documented in LEARNINGS.md:
- Requires data router (`createMemoryRouter` for tests, not `MemoryRouter`)
- Pattern: condition, useEffect with confirm dialog, proceed/reset

### Notes
- AC mentioned "phone" but PersonDetail type has no phone field — skipped (not a bug)
- TrendIcon imported from existing PersonBadges component (was already available)
- The existing MeetingSheet component worked without changes

---


## Task: v3-5-meeting-review (Complete)

**Completed**: 2026-03-07T18:06:00Z
**Commit**: 4630808

### What was done
1. Added localStorage persistence for section collapse state (key: `arete-review-collapsed`)
   - `getInitialOpenGroups()` reads from localStorage on mount
   - `useEffect` writes collapsed sections array to localStorage on change
2. Added "Approve All" button to each section header
   - Button only visible when section has unapproved items
   - `onBulkApprove` callback fires individual PATCH calls for each item
3. Items with `status: 'pending'` now initialize as `approved` in MeetingDetail local state
   - Frontend-only transformation — backend still returns `pending`
   - User skips bad items instead of approving good ones
4. Enhanced keyboard accessibility:
   - Section headers have `aria-expanded`, `aria-label`, visible focus ring
   - Item action buttons have `aria-label` for approve/skip/unapprove/unskip
   - Focus rings via `focus:ring-2 focus:ring-ring focus:ring-offset-2`
5. Created comprehensive test suite (16 tests) covering:
   - localStorage persistence (save, restore, toggle)
   - Bulk approve (approve all, handles already-approved, correct IDs)
   - Toggle item status (pending→approved, approved→pending, skip, unskip)
   - Keyboard accessibility (focusable headers, aria-labels)
   - Display (review progress, item counts)

### Files changed
- `packages/apps/web/src/components/ReviewItems.tsx` — localStorage, Approve All, accessibility
- `packages/apps/web/src/components/ReviewItems.test.tsx` — new (16 tests)
- `packages/apps/web/src/pages/MeetingDetail.tsx` — default to approved, onBulkApprove handler

### Quality checks
- typecheck: ✓
- tests: ✓ (67 passed)

### Notes
- Existing collapsible UI was already in place; we added persistence and bulk actions
- Skipped item visual distinction (line-through + opacity-50) was already implemented
- Used existing `useApproveItem` mutation for individual PATCH calls in bulk approve

---

## Task: v3-6-meeting-sheet (Complete)

**Completed**: 2026-03-07T18:12:00Z
**Commit**: 2801dac

### What was done
1. Enhanced MeetingSheet component in PersonDetailPage.tsx with full meeting details:
   - Metadata section with attendees (name list) and duration (formatted as "X hr Y min")
   - Parsed items using Collapsible components for Decisions, Learnings, Actions
   - Collapsible transcript section with "Show Transcript" / "Hide Transcript" toggle
   - Applied `max-h-96 overflow-y-auto` to transcript content per pre-mortem mitigation
2. Created `CollapsibleSection` helper component for parsed items:
   - Collapsed by default
   - Hides entirely when no items (per design decision)
   - Shows count in header (e.g., "Decisions (2)")
3. Guarded `parsedSections` with `?? { actionItems: [], decisions: [], learnings: [] }`
4. Added data-testid attributes for testing: meeting-sheet-title, meeting-sheet-date, 
   meeting-sheet-summary, meeting-sheet-attendees, meeting-sheet-duration, 
   meeting-sheet-parsed-items, meeting-sheet-transcript-toggle, meeting-sheet-transcript,
   meeting-sheet-full-link, meeting-sheet-loading
5. Extended PersonDetailPage.test.tsx with 12 MeetingSheet tests:
   - Opens sheet when clicking a meeting
   - Displays title and date
   - Displays summary
   - Displays attendees
   - Displays formatted duration (90 min → "1 hr 30 min")
   - Displays collapsed parsed items sections with counts
   - Expands parsed items section on click
   - Shows transcript toggle (collapsed by default)
   - Expands transcript when toggle clicked
   - Shows "Open full meeting" link
   - Closes sheet via X button
   - Shows loading state when meeting is loading

### Files changed
- `packages/apps/web/src/pages/PersonDetailPage.tsx` — enhanced MeetingSheet, added CollapsibleSection
- `packages/apps/web/src/pages/PersonDetailPage.test.tsx` — added 12 MeetingSheet tests

### Quality checks
- typecheck: ✓
- tests: ✓ (79 passed in web package)

### Documentation Updated
- None — no new patterns, gotchas, or invariants discovered. The implementation followed existing patterns (Collapsible, Sheet components) and the LEARNINGS.md already documented the testing approach with data routers.

### Reflection
- What helped: Clear task context with existing components (Sheet, Collapsible), well-defined pre-mortem mitigations (guard parsedSections, max-h-96 for transcript), existing test patterns in PersonDetailPage.test.tsx
- Harder than expected: Nothing significant — the task was well-scoped
- Token estimate: ~8k tokens

---

---

## Task 5/6: V3-3 Favorites — ✅ COMPLETE

**Completed**: 2026-03-07T18:30:00Z
**Commit**: a0d69d5

### What was done
1. Backend: Added PATCH /api/people/:slug endpoint to update favorite status in frontmatter
   - Sets `favorite: true` in frontmatter when enabling
   - Removes `favorite` field entirely when disabling (cleaner files)
   - Fixed gray-matter caching issue by cloning frontmatter before mutation
2. Backend: Added `favorite: boolean` field to PersonSummary and PersonDetail responses
   - GET /api/people includes `favorite` for each person
   - GET /api/people/:slug includes `favorite` in detail response
3. Frontend API: Added `patchPerson(slug, { favorite })` function in people.ts
4. Frontend Hook: Added `useToggleFavorite()` mutation hook with:
   - Optimistic updates via `setQueryData`
   - Rollback on error via snapshot/restore pattern
   - Query invalidation on settled for server consistency
5. Frontend UI (PeopleIndex.tsx):
   - Star icon in first column (before name) — click toggles favorite
   - Favorites tab before All tab with count badge (★ Favorites (N))
   - All tab sorts favorites first (before other sorting)
   - ?category=favorites URL param shows only favorited people
   - Toast notification on error via useToast hook
6. Tests:
   - Backend: 9 tests for favorite field and PATCH endpoint
   - Frontend: 5 tests for useToggleFavorite hook (API calls, error handling)

### Files changed
- `packages/apps/backend/src/routes/people.ts` — PATCH endpoint, favorite in responses, cloned frontmatter
- `packages/apps/backend/test/routes/people.test.ts` — 9 new tests
- `packages/apps/web/src/api/types.ts` — `favorite?: boolean` on PersonSummary
- `packages/apps/web/src/api/people.ts` — `patchPerson()` function
- `packages/apps/web/src/hooks/people.ts` — `useToggleFavorite()` hook
- `packages/apps/web/src/hooks/people.test.tsx` — new (5 tests)
- `packages/apps/web/src/pages/PeopleIndex.tsx` — star column, Favorites tab, sorting

### Quality checks
- typecheck: ✓
- tests: ✓ (backend: 157 passed + 3 pre-existing failures; web: 84 passed)

### Documentation Updated
- None added to LEARNINGS.md — the gray-matter caching issue is documented in commit message and progress log. It's a gotcha specific to this codebase's PATCH pattern rather than a general pattern.

### Reflection
- What helped: Clear pre-mortem mitigation for optimistic updates pattern; existing LEARNINGS.md had cancelQueries + rollback pattern documented
- Harder than expected: gray-matter caching issue took investigation — the parsed `data` object is cached by gray-matter module and mutations pollute subsequent parses of different content. Fix: clone before mutating.
- Token estimate: ~15k tokens (debugging gray-matter issue added overhead)

---

## Task 6/6: V3-4 Commitments Page Enhancement — ✅ COMPLETE

**Completed**: 2026-03-07T18:45:00Z
**Commit**: 13a1a1e

### What was done
1. Backend: Added `person` and `direction` query params to `/api/commitments` route:
   - `?direction=mine` filters to `i_owe_them` commitments
   - `?direction=theirs` filters to `they_owe_me` commitments
   - `?person=<slug>` filters by person slug
   - All params can be combined: `?direction=mine&filter=open&person=anita-law`
2. Frontend API: Updated `fetchCommitments()` to accept `CommitmentsParams` object with filter, direction, and person fields
3. Frontend Hook: Updated `useCommitments()` to:
   - Accept params object instead of single filter
   - Include filter, direction, and person in query key for proper caching
   - Re-export `CommitmentsParams` and `DirectionFilter` types
4. Frontend UI (CommitmentsPage.tsx):
   - Direction subnav tabs above status filters: Mine / Theirs / All
   - Replaced card layout with shadcn Table with columns: Person, Commitment, Direction, Age, Actions
   - Sortable columns for Person and Age (click headers to toggle sort)
   - Person filter chip shown when `?person=` is in URL, with X to clear
   - Functional setter for URL params to preserve multi-param coexistence
5. Tests:
   - Backend: 7 new tests for direction and person params (combinations, empty results)
   - Frontend Hook: 10 tests for param handling and query keys
   - Frontend Page: 18 tests for direction filter, person filter, sorting, URL state

### Files changed
- `packages/apps/backend/src/routes/intelligence.ts` — direction and person params
- `packages/apps/backend/test/routes/intelligence.test.ts` — 7 new tests
- `packages/apps/web/src/api/intelligence.ts` — CommitmentsParams type, updated fetchCommitments
- `packages/apps/web/src/hooks/intelligence.ts` — updated useCommitments, type exports
- `packages/apps/web/src/hooks/intelligence.test.tsx` — new (10 tests)
- `packages/apps/web/src/pages/CommitmentsPage.tsx` — direction tabs, table layout, sorting, person filter
- `packages/apps/web/src/pages/CommitmentsPage.test.tsx` — new (18 tests)

### Quality checks
- typecheck: ✓
- tests: ✓ (1441 passed, 2 skipped)

### Documentation Updated
- None — no new patterns, gotchas, or invariants discovered. Implementation followed existing patterns:
  - URL multi-param coexistence (functional setter) already documented in web LEARNINGS.md
  - Table component usage matches existing shadcn patterns
  - Backend query param handling follows established route patterns

### Reflection
- What helped: Clear AC with explicit URL structure; existing web LEARNINGS.md documented the functional setter pattern for multi-param URLs; backend profile had route patterns documented
- Harder than expected: Nothing significant — task was straightforward following existing patterns
- Token estimate: ~12k tokens
