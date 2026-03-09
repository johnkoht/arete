# Review: Areté Web App V3 — Frontend UX

**Type**: Plan
**Audience**: Builder (internal Areté development)
**Reviewer**: Product Manager + Engineering Lead perspective

---

## Concerns

### 1. **Backend Dependencies Not Scoped**
The plan focuses on frontend but several tasks require backend work:
- V3-3 (Favorites): New `favorite` field + PATCH endpoint
- V3-4 (Commitments): Person filter in API
- V3-2 (People Detail): Verify `rawContent` in person API response

**Suggestion**: Either (a) add explicit backend tasks to the plan, or (b) verify existing APIs support these features before starting. Add to each task's AC: "Verify/implement backend support."

### 2. **V3-1 Already Has Prototype — Plan Doesn't Acknowledge**
BlockEditor prototype was just created and tested. The plan should note this and clarify what remains:
- Theme refinement
- Test coverage
- GoalsView integration (not just PersonDetailPage)

**Suggestion**: Update V3-1 to reflect prototype status: "Refine existing BlockEditor prototype, add tests, integrate into GoalsView."

### 3. **V3-5 "Default Selection" Is Ambiguous**
"Items default to approved status" could mean:
- UI: Items appear checked but haven't been saved as approved yet
- Backend: Items come pre-approved from server

This is a significant UX/data-flow decision buried in the plan.

**Suggestion**: Clarify explicitly: "Frontend-only: items render as selected but backend still tracks them as pending until user confirms."

### 4. **V3-7 (Polish) Is Too Vague for Autonomous Execution**
"Empty states consistent" and "loading skeletons match new layouts" are not specific enough for acceptance criteria. What pages? What empty states?

**Suggestion**: Either (a) enumerate specific pages/states, or (b) make V3-7 a "manual polish pass" outside the PRD scope.

### 5. **Missing: Accessibility Considerations**
BlockNote and the new layouts should maintain keyboard navigation, screen reader compatibility, focus states. Not mentioned in the plan.

**Suggestion**: Add to V3-1 AC: "Keyboard shortcuts work (Cmd+B, Cmd+I)". Add to V3-2 AC: "Sections navigable via Tab."

### 6. **Bundle Size Concern Not Addressed**
BlockNote + Mantine adds significant weight. Plan doesn't address performance impact.

**Suggestion**: Add to V3-1 AC: "BlockEditor is lazy-loaded (not in main bundle)."

---

## Strengths

- **Clear dependency chain**: V3-1 → V3-2 makes sense; parallel tasks (V3-3, V3-4, V3-5) can be developed independently
- **Good prioritization**: Meeting Review UX (V3-5) is correctly prioritized as high daily friction
- **Explicit out-of-scope**: AI tuning separated into intelligence-tuning plan prevents scope creep
- **Single-column layout for People Detail**: Addresses a real usability issue
- **Detailed wireframe**: The ASCII layout diagram for V3-2 is helpful

---

## Devil's Advocate

**If this fails, it will be because...** The BlockEditor integration has subtle issues (theming, markdown fidelity, performance) that only surface after multiple iterations. Users write notes, save them, and the markdown is subtly corrupted — data integrity issue that erodes trust.

**The worst outcome would be...** Shipping V3-2 (People Detail restructure) that looks better but has broken notes editing. User writes important meeting notes, hits save, and markdown is mangled or lost. This is worse than the current "ugly but working" state.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

### Required Changes Before PRD:

1. **V3-1**: Update to acknowledge prototype exists; add explicit ACs for lazy loading, keyboard shortcuts, tests
2. **V3-3, V3-4**: Add AC "Verify/implement backend API support"
3. **V3-5**: Clarify "default selection" behavior explicitly in description
4. **V3-7**: Either make specific or mark as manual post-PRD polish

### Recommended (Not Blocking):

- Add accessibility notes to relevant tasks
- Note bundle size monitoring approach
