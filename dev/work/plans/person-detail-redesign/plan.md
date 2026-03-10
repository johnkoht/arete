---
title: Person Detail Page Redesign
slug: person-detail-redesign
status: complete
size: tiny
tags: [web, ui, people]
created: 2026-03-09T17:30:00.000Z
updated: 2026-03-10T06:01:00.000Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 1
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

- ✅ Two-column layout separates activity (left) from profile info (right)
- ✅ Recent commitments and meetings visible at a glance
- ⬜ Edit button in header (cleaner UX)
- ✅ Category badge uses standardized style

---

## Current State Analysis (Post-Review)

After code review, **~95% of this work is already implemented**:

### Already Completed ✅

1. **Header Bar** - Back link, name, CategoryBadge ✅
2. **Two-Column Layout** - lg:grid-cols-3 with lg:col-span-2, responsive ✅
3. **Left Column Activity Sections**:
   - Open Commitments with direction indicators ✅
   - Recent Meetings with "Showing X of Y" ✅
   - Notes section with BlockEditor ✅
   - "See all commitments →" link ✅
4. **Right Column Profile Cards**:
   - Overview Card with health status, stats ✅
   - Role & Context Card ✅
   - Working Style Card (stances, repeated asks/concerns) ✅
5. **EditNotesSheet** - For editing person notes ✅

### Scope Revisions from Review

| Original Plan Item | Decision | Reason |
|--------------------|----------|--------|
| PersonEditDrawer | **REMOVED** | Backend API only supports notes editing (`patchPersonNotes`), not roleContext/workingStyle fields |
| View All Meetings link | **REMOVED** | MeetingsIndex doesn't support `?person=` filtering; "Showing X of Y" is acceptable |
| Header Edit button | **KEEP** | Only remaining UX improvement |

---

## Revised Plan

### 1. Move Edit Button to Header

Move the Edit button from the Notes card to the header bar for better discoverability.

**Acceptance Criteria:**
- [ ] Edit button appears in header row (right side, after CategoryBadge)
- [ ] Clicking Edit opens the existing EditNotesSheet
- [ ] Edit button removed from Notes card header
- [ ] Edit button uses appropriate variant (ghost or secondary)

**Files:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`

**Risk Mitigations Applied:**
- Keep EditNotesSheet working as-is (just change where the button is)
- Test edit → save and edit → cancel flows after change

---

## Out of Scope

- ~~PersonEditDrawer for roleContext/workingStyle~~ (API doesn't support)
- ~~View All Meetings link~~ (MeetingsIndex doesn't support person filter)
- Person creation flow
- Activity timeline (just recent items)
- Person merge/delete functionality

---

## Testing Notes

- Verify Edit button click opens sheet
- Verify save/cancel flow works
- Responsive behavior unchanged (already tested)
- Empty states unchanged (already handled)

---

## Pre-Mortem Mitigations

From `pre-mortem.md`:
1. ✅ Scoped down based on actual API capabilities
2. ✅ No backend changes needed
3. ✅ Minimal change to existing functionality
