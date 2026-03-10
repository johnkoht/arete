# Review: Web Fast Follow

**Type**: Plan (pre-execution)
**Audience**: Builder (internal Areté development)

---

## Concerns

### 1. **Completeness — PageHeader Already Exists**
Item 5 says "Create shared `<PageHeader>` component" but `PageHeader.tsx` already exists in `packages/apps/web/src/components/`. It's used by 8 pages but NOT by MeetingsIndex or MeetingDetail.

- **Suggestion**: Reframe as "Audit and improve existing PageHeader; ensure all pages use it consistently." Also check why Meetings pages don't use it — there may be layout reasons that need addressing in the component itself.

### 2. **Scope — Item 8 is Large**
People Detail Page Redesign (Item 8) is essentially a full page rewrite: two-column layout, markdown editor drawer, commitment/meeting tables, parsing markdown sections. This alone could be 3-4 sub-tasks.

- **Suggestion**: Either break Item 8 into explicit sub-tasks in the plan, or acknowledge it's the riskiest item and allocate more time to Track C.

### 3. **Dependencies — Projects API**
Items 1-2 assume a Projects API exists to populate the project picker dropdown. Backend has `projects.ts` route, but need to verify it returns data in the format the SearchableSelect component expects.

- **Suggestion**: Add explicit verification step or note that Track A may need to implement/adjust the projects endpoint.

### 4. **Patterns — Badge System Undefined**
Items 7 and 9 mention "match category badge colors to meeting status badge style" and "audit pill styles — create consistent badge system." This is design system work that affects multiple components.

- **Suggestion**: Make badge/pill system audit an explicit Phase 1 step (alongside PageHeader). Define the color palette and styles BEFORE parallel tracks diverge, or risk inconsistent implementations.

### 5. **Acceptance Criteria — Missing**
The plan describes problems and solutions but lacks measurable acceptance criteria.

- **Suggestion**: For execution, each item needs ACs like:
  - "All list pages use PageHeader component with identical visual height"
  - "Pagination component renders for lists > 25 items"
  - "Action items render markdown or display stripped text (no raw `**bold**`)"

### 6. **Risk — Parallel Track Coordination**
The 3-track parallel approach is clever but introduces coordination risk. If Track B (pagination) changes how data is fetched and Track C (CommitmentsPage) also refactors Commitments — they could conflict.

- **Suggestion**: Define explicit file ownership per track. Example: "Track C owns `CommitmentsPage.tsx` entirely; Track B only adds pagination to `MeetingsIndex.tsx`, `PeopleIndex.tsx`, `MemoryFeed.tsx`."

### 7. **Completeness — Testing Not Mentioned**
No mention of tests. Web package has test files (e.g., `ReviewItems.test.tsx`, `BlockEditor.test.tsx`).

- **Suggestion**: Add note that UI changes should include visual regression or unit tests where feasible, especially for new components (SearchableSelect).

---

## Strengths

- **Clear problem statements**: Each item explains the "why" well
- **Visual references**: Screenshots provided for context
- **Phased execution**: Foundation → Parallel is smart — reduces coordination risk
- **Reusability thinking**: SearchableSelect designed for future use cases
- **Scope awareness**: Notes about what's out of scope (decisions/learnings project context)

---

## Devil's Advocate

**If this fails, it will be because...**

The parallel execution creates subtle inconsistencies. Three sub-orchestrators each make "reasonable" styling decisions — but without a shared reference, Track A's project picker looks different from Track B's pagination controls, which look different from Track C's commitment actions. The web app ends up visually "off" in ways that are hard to pinpoint.

**The worst outcome would be...**

The PageHeader/badge system work in Phase 1 gets rushed or skipped because it seems "foundational" rather than feature work. Then all three tracks implement their own header variants, and we end up with the same inconsistency problem we started with — just with more code.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Address concerns before execution
- [ ] **Revise** — Major gaps need resolution

### Recommended Changes Before Execution

1. **Reframe Item 5**: "Audit and standardize PageHeader usage" (not "create")
2. **Add badge system step to Phase 1**: Define color palette and badge styles before parallel work
3. **Define file ownership**: Explicitly state which track owns which files
4. **Break down Item 8**: It's too large — split into sub-tasks or flag as highest-risk
5. **Add minimal ACs**: At least for the 3 foundation items in Phase 1
