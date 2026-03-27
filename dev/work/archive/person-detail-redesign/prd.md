# PRD: Person Detail Page — Edit Button Relocation

**Version**: 1.0  
**Status**: Ready  
**Date**: 2026-03-10  
**Depends on**: None (existing infrastructure)  
**Size**: Tiny (1 task)

---

## 1. Problem & Goals

### Problem

The PersonDetailPage currently has the Edit button inside the Notes card header, which is:
- Less discoverable than a top-level action
- Inconsistent with common patterns (Linear, Notion place edit actions in page headers)
- The plan originally called for Edit in the header, but implementation placed it in the card

### Goals

1. **Better UX** — Move Edit button to the header bar for improved discoverability
2. **Consistency** — Follow the pattern of primary actions in page headers
3. **No breaking changes** — Keep existing EditNotesSheet functionality intact

### Out of Scope

- PersonEditDrawer for roleContext/workingStyle (API doesn't support these fields)
- View All Meetings link (MeetingsIndex doesn't support person filtering)
- Backend API changes
- New edit functionality

---

## 2. Implementation

### Single Task: Move Edit Button to Header

Move the Edit button from inside the Notes card to the header bar, positioned after the CategoryBadge.

**Files to modify:**
- `packages/apps/web/src/pages/PersonDetailPage.tsx`

**Implementation approach:**
1. Add Edit button to the header section (after CategoryBadge)
2. Remove Edit button from Notes card CardTitle
3. Button should open existing EditNotesSheet (no changes to sheet logic)
4. Use appropriate button variant (likely `variant="ghost"` or `variant="outline"`)

---

## 3. Tasks

### Task 1: Relocate Edit Button to Header

**Description**: Move the Edit button from the Notes card header to the main page header bar. The button should appear on the right side of the header, after the CategoryBadge.

**Acceptance Criteria**:
- [ ] Edit button appears in header row, positioned right of CategoryBadge
- [ ] Edit button uses appropriate styling (ghost or outline variant)
- [ ] Clicking Edit opens EditNotesSheet (existing functionality)
- [ ] Edit button removed from Notes card CardTitle
- [ ] No regressions: save and cancel flows work correctly
- [ ] Tests pass: `npm run typecheck && npm test`

**Estimated complexity**: Simple — moving an existing button, no new logic

---

## 4. Testing Plan

| Scenario | Expected Result |
|----------|-----------------|
| Click Edit in header | EditNotesSheet opens |
| Edit → Save | Notes are saved, sheet closes, toast confirms |
| Edit → Cancel | Sheet closes, no changes saved |
| Edit → Make changes → Cancel | Sheet closes, changes discarded |
| Empty notes state | Edit button still appears, can add notes |

---

## 5. Risk Mitigations

From pre-mortem analysis:

| Risk | Mitigation |
|------|------------|
| Breaking EditNotesSheet | Only move the button; don't modify sheet logic |
| State management issues | Test all flows after change |
| Scope creep | Explicitly out-of-scope: no new edit fields, no API changes |

---

## 6. Success Criteria

- [ ] Edit button is in header (visually verified)
- [ ] All edit flows work correctly
- [ ] No UI regressions
- [ ] All tests pass
