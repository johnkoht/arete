# Pre-Mortem: Person Detail Page Redesign

Work: Complete the remaining gaps in PersonDetailPage redesign
Status: ~80% implemented, refinements needed
Scope: Header Edit button, PersonEditDrawer component, View All meetings link

---

## Risk Analysis

### Risk 1: Edit Drawer Scope Ambiguity

**Problem**: The plan calls for "PersonEditDrawer" to edit roleContext and workingStyle, but the current data model shows these as structured fields (stances, repeatedAsks, repeatedConcerns) derived from meetings, not directly editable markdown. The existing EditNotesSheet edits rawContent. It's unclear what fields PersonEditDrawer should actually edit.

**Mitigation**: 
- Review the Person type definition in `packages/apps/web/src/api/types.ts` or backend
- Review `useUpdatePersonNotes` to understand what's actually editable
- If roleContext/workingStyle aren't editable fields, clarify scope: just move Edit button to header for Notes editing

**Verification**: Before implementation, confirm which fields are editable via API.

---

### Risk 2: Backend API Mismatch

**Problem**: Adding a PersonEditDrawer for roleContext/workingStyle fields assumes the backend supports updating these fields. If the backend doesn't have these endpoints, we'll build UI that can't save.

**Mitigation**:
- Check `packages/apps/backend/src/routes/` for person update endpoints
- Verify what fields are in the update payload
- If API doesn't support it, scope down to what's supported (just notes)

**Verification**: API endpoint exists and accepts the fields we want to edit.

---

### Risk 3: Routing for View All Links

**Problem**: Plan calls for "View All" links to `/commitments?person={slug}` and `/meetings?person={slug}`. Need to verify these routes exist and support the person filter parameter.

**Mitigation**:
- Check existing commitments and meetings list pages for filter support
- Verify routes in `packages/apps/web/src/App.tsx` or router config

**Verification**: Navigate to /commitments?person=test and /meetings?person=test URLs work.

---

### Risk 4: Breaking Existing Functionality

**Problem**: Moving Edit button to header or restructuring the edit flow could break the existing working EditNotesSheet functionality.

**Mitigation**:
- Keep EditNotesSheet working as-is
- Test edit → save → cancel flow after changes
- Ensure Sheet state management remains correct

**Verification**: After implementation, verify: open edit, make changes, save works; open edit, cancel works.

---

## Summary

Total risks identified: 4
Categories covered: Scope Clarity, Integration (Backend), Dependencies (Routing), Code Quality

**Key Decision Needed**: Before building PersonEditDrawer, must clarify what fields are actually editable via the API. If only `rawContent` (notes) is editable, the scope simplifies to just moving the Edit button to the header.

**Ready to proceed with these mitigations?**
