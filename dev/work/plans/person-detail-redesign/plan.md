---
title: Person Detail Page Redesign
slug: person-detail-redesign
status: draft
size: medium
tags: [web, ui, people]
created: 2026-03-09T17:30:00.000Z
updated: 2026-03-09T17:30:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Person Detail Page Redesign

Redesign PersonDetailPage with two-column layout and better information hierarchy.

---

## Problem Statement

The current PersonDetailPage has a single-column layout with:
- No clear information hierarchy
- All sections stacked vertically
- Inline editing that's clunky
- No quick access to recent activity (commitments, meetings)

Users need to quickly understand a person's context (role, working style) while also seeing their recent activity.

## Success Criteria

- Two-column layout separates activity (left) from profile info (right)
- Recent commitments and meetings visible at a glance
- Edit functionality moved to drawer (cleaner UX)
- Category badge uses standardized style

---

## Plan

### 1. Header Bar Redesign

Create a proper header matching PageHeader style.

**Acceptance Criteria:**
- [ ] Back link to /people
- [ ] Person name as title
- [ ] Category badge (uses CategoryBadge component)
- [ ] Edit button on right side
- [ ] Consistent height with other page headers

**Files:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`

---

### 2. Two-Column Layout Structure

Implement responsive two-column layout.

**Acceptance Criteria:**
- [ ] Max-width ~1200px container
- [ ] Left column: ~60% width (activity)
- [ ] Right column: ~40% width (profile info)
- [ ] Responsive: stacks on mobile (<768px)
- [ ] Proper gap/spacing between columns

**Files:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`

---

### 3. Left Column: Activity Sections

Build activity sections with compact tables.

**Acceptance Criteria:**
- [ ] **Open Commitments** section (3-5 rows)
  - Status icon, text, due date
  - "View All" link to /commitments?person={slug}
- [ ] **Recent Meetings** section (5 rows)
  - Date, title, status badge
  - "View All" link to /meetings?person={slug}
- [ ] **Key Notes** section (if person has notes)
  - Rendered markdown
  - Collapsible if long

**Files:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`
- Possibly new sub-components in `src/components/people/`

---

### 4. Right Column: Profile Cards + Edit Drawer

Build profile info cards and edit drawer.

**Acceptance Criteria:**
- [ ] **Overview Card**
  - Company, role, contact info
  - Clean card styling
- [ ] **Role & Context Card**
  - Rendered markdown from person.roleContext
- [ ] **Working Style Card**
  - Rendered markdown from person.workingStyle
- [ ] **Edit Drawer**
  - Opens from Edit button in header
  - MarkdownEditor for roleContext and workingStyle
  - Save/Cancel buttons
  - Drawer slides in from right

**Files:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`
- `packages/apps/web/src/components/people/PersonEditDrawer.tsx` (new)

---

## Out of Scope

- Person creation flow (separate feature)
- Inline field editing (using drawer instead)
- Activity timeline (just recent items)
- Person merge/delete functionality

---

## Dependencies

- CategoryBadge component (already exists from Web Fast Follow)
- MarkdownEditor component (verify exists)

---

## Testing Notes

- Test responsive behavior at various widths
- Test drawer open/close/save flow
- Verify commitments/meetings data loads correctly
- Test empty states (person with no commitments)

---

## Design Reference

Two-column layout inspired by Linear's contact pages:
- Left: transaction/activity history
- Right: static profile information
