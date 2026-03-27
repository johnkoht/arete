# Review: Person Detail Page Redesign

**Type**: Plan
**Audience**: User (end-user functionality for PMs using Areté)

---

## Concerns

### 1. **Scope Mismatch: PersonEditDrawer**

The plan calls for a `PersonEditDrawer` component to edit `roleContext` and `workingStyle`. However:

- The API (`patchPerson`) only supports `{ favorite?: boolean }` 
- Notes editing uses `patchPersonNotes` which edits `rawContent` (notes)
- `roleContext` and `workingStyle` are not editable fields in the current API

**Suggestion**: Scope down to:
- Move Edit button to header
- Keep EditNotesSheet for notes editing (already works)
- Remove PersonEditDrawer from scope (not supported by backend)

### 2. **Missing Route: /meetings?person={slug}**

The plan assumes `/meetings?person={slug}` filtering exists. MeetingsIndex does NOT currently support person filtering via URL params.

**Suggestion**: Two options:
1. **Add person filtering to MeetingsIndex** (scope expansion) 
2. **Remove the "View All Meetings" link** and keep the inline "Showing X of Y" text (current behavior)

Recommend option 2 for scope containment since the current behavior is acceptable.

### 3. **Work Already Done**

~80% of the plan is already implemented:
- ✅ Two-column layout (lg:grid-cols-3 with lg:col-span-2)
- ✅ Header with back link, name, CategoryBadge
- ✅ Open Commitments section with direction indicators
- ✅ Recent Meetings section
- ✅ Notes section with BlockEditor
- ✅ Right column cards (Overview, Role & Context, Working Style)
- ✅ EditNotesSheet for notes editing

**Suggestion**: Acknowledge completed work and scope plan to ONLY remaining gaps.

### 4. **Header Edit Button Location**

Plan says Edit button should be in header. Current implementation has Edit button inside Notes card. This is a minor UX decision.

**Suggestion**: Moving Edit to header makes sense - it's more discoverable and follows common patterns (Linear, Notion). Accept this change.

---

## Strengths

- Clear two-column layout structure already implemented
- Good use of existing components (Sheet, Card, CategoryBadge)
- Responsive design handled correctly (lg:grid-cols-3 collapses on mobile)
- EditNotesSheet with lazy-loaded BlockEditor is performant
- Empty states handled for all sections

---

## Devil's Advocate

**If this fails, it will be because...**
We scope-creep by trying to add PersonEditDrawer and meetings filtering that don't exist in the backend, spend time building UI that can't save, and lose focus on the simple remaining work.

**The worst outcome would be...**
Building new components (PersonEditDrawer) and routes (/meetings?person=) that require backend changes, turning a small frontend refinement into a cross-stack feature that takes days instead of hours.

---

## Verdict

- [x] **Approve with revisions** — Scope must be clarified

### Required Revisions

1. **Remove PersonEditDrawer from scope** — Backend doesn't support editing roleContext/workingStyle
2. **Remove "View All Meetings" link** — MeetingsIndex doesn't support person filtering (keep current "Showing X of Y" text)
3. **Acknowledge existing work** — Plan should reflect that ~80% is done

### Actual Remaining Work

1. Move Edit button from Notes card to header bar
2. (Optional) Minor polish if needed

This is now a **tiny** (1 step) plan, not **medium**.
