# Pre-Mortem: Task Management UI

## Risk 1: Date-Based Model vs Bucket-Based Model Mismatch

**Problem**: The plan introduces "Today/Upcoming/Anytime/Someday" tabs implying date-based scheduling, but `TaskDestination` is bucket-based (`inbox`, `must`, `should`, `could`, `anytime`, `someday`). The UI treats "Today" as tasks with `@due(today)`, but the underlying model has no "today" destination. Tasks in `must` without `@due` would be invisible in the new model. This could cause silent data loss or confusing UX.

**Mitigation**: 
1. Before implementing, audit how `@due` is currently used in real workspace files
2. "Today" tab should query by `@due` date OR `must` bucket (combined view)
3. Add explicit "Bucket View" toggle for users who prefer the GTD must/should/could model
4. Document migration path: existing `must` tasks without `@due` → shown in "Today" with no date badge

**Verification**: Step 1 API tests should include test cases for: tasks with only bucket, tasks with only @due, tasks with both.

---

## Risk 2: Suggestion Logic Complexity Underestimated

**Problem**: `GET /api/tasks/suggested` needs meeting context + commitment priority scoring. The `task-scoring.ts` service exists and is sophisticated (40+ lines of scoring logic), but it requires a `ScoringContext` object with `todayMeetingAttendees`, `todayMeetingAreas`, `weekPriorities`, `availableFocusHours`, and `needsAttentionPeople`. Assembling this context requires reading calendar data, parsing week.md priorities, and cross-referencing people — significant work hidden in one AC bullet.

**Mitigation**: 
1. Split Step 1 into 1a (CRUD routes) and 1b (suggested endpoint with scoring)
2. In 1b, explicitly read `task-scoring.ts` and use `scoreTasks()` + `buildScoringContext()`
3. Accept V1 heuristic: if full scoring context is too complex, use simplified version (just meeting attendees + commitment ages)

**Verification**: Step 1 PR should include tests for suggested endpoint with mock scoring context.

---

## Risk 3: Drag-and-Drop State Sync

**Problem**: `@dnd-kit/core` requires careful state management. When a task is dragged from "Anytime" to "Today", the frontend must: (1) optimistically update UI, (2) call PATCH /api/tasks/:id, (3) handle failure gracefully with rollback. Cross-section drag (e.g., dragging into "Waiting On" which shows commitments, not tasks) could confuse the model.

**Mitigation**:
1. Step 7 should clarify: drag-and-drop is ONLY between task sections (Today/Anytime/Someday)
2. "Waiting On" is a filter/view, not a drag target — tasks linked to commitments stay where they are
3. Use React Query's optimistic updates pattern (already used in CommitmentsPage)
4. Test with slow network simulation to verify rollback works

**Verification**: Manual test with throttled network (Chrome DevTools) before shipping Step 7.

---

## Risk 4: Fresh Context for Subagents (If PRD Execution)

**Problem**: Steps 3-8 are frontend-heavy and require understanding CommitmentsPage patterns, existing component library (shadcn/ui), and API hook patterns. Subagents spawned fresh won't know about `useCommitments`, `useMarkCommitmentDone`, `<EmptyState>`, `<PageHeader>`, or the toast notification pattern.

**Mitigation**: For each frontend step, prompt should include:
- "Read packages/apps/web/src/pages/CommitmentsPage.tsx first (reference UI pattern)"
- "Use existing hooks pattern from @/hooks/intelligence.js"
- "Use components: EmptyState, PageHeader, Tabs, Badge, Tooltip from existing imports"
- Include mini-context: "This web app uses Hono backend, React Query for data fetching, shadcn/ui components"

**Verification**: Before spawning Step 2 agent, verify prompt includes file reading list.

---

## Risk 5: Tab Implementation Scope Creep

**Problem**: The plan mentions 5 tabs (Today, Upcoming, Anytime, Someday, Waiting On) but "Waiting On" is described as a "filter toggle" not a tab. Step 8 says "Filter toggle shows tasks/commitments" — mixing two different data types (WorkspaceTask vs Commitment) in one view. This could balloon scope if implementers interpret it as a full tab.

**Mitigation**:
1. Clarify in PRD: "Waiting On" is a filter toggle button, NOT a 5th tab
2. When Waiting On is toggled ON, show only tasks where `task.metadata.from?.type === 'commitment'`
3. Do NOT show raw commitments in TasksPage — that's what CommitmentsPage is for
4. AC for Step 8 should be: "Filter shows tasks with @from(commitment:*) metadata"

**Verification**: Review Step 8 AC before execution; reject if it mentions showing Commitment objects.

---

## Risk 6: Test Coverage Gaps

**Problem**: `tasks.test.ts` exists for TaskService (1000+ lines), but there are no frontend tests for TasksPage. CommitmentsPage has `CommitmentsPage.test.tsx` (12KB) as a reference, but if frontend tests are skipped for speed, regressions could slip through.

**Mitigation**:
1. After Step 2 (shell with tabs), add basic render test
2. After Step 3 (task list), add test for task completion flow
3. Reference `CommitmentsPage.test.tsx` for React Testing Library patterns
4. Run `npm test` after each step (not just at end)

**Verification**: Each frontend step should have at least one test file committed.

---

## Risk 7: Avatar Component Dependencies

**Problem**: Plan mentions "Avatar — initials with tooltip" and references `AvatarStack` component. Need to verify this component exists and handles single-person case (not just stacked avatars). If it doesn't exist, Step 3 could get blocked on building a new component.

**Mitigation**:
1. Before Step 3, verify `AvatarStack` or similar exists and supports single-person display
2. If not, add mini-task to Step 3: "Create or adapt Avatar component for single person with initials + tooltip"
3. Check `@/components/` for existing avatar implementations

**Verification**: `grep -r "Avatar" packages/apps/web/src/components/` before starting Step 3.

---

## Risk 8: Quick Schedule Popup Interaction Design

**Problem**: Step 4 requires a "quick schedule popup" with Today/Tomorrow/Date picker/Anytime/Someday options. This is a custom UI component not used elsewhere in the app. Design decisions not specified: popover vs modal? keyboard navigation? mobile touch behavior? Date picker library choice?

**Mitigation**:
1. Use Radix `Popover` (already in deps via shadcn/ui) — not a modal
2. Use existing date picker if available, or shadcn/ui DatePicker
3. Add to AC: "Popup dismisses on outside click, Escape key, or selection"
4. Keep mobile scope minimal for V1 (click works, no gestures)

**Verification**: Before Step 4, check if shadcn/ui DatePicker is already set up in the project.

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Context Gaps, Test Patterns, Integration, Scope Creep, Code Quality, Dependencies

**Highest severity risks**:
1. **Date vs Bucket model mismatch** — could cause data visibility issues
2. **Suggestion logic complexity** — hidden complexity in one API endpoint
3. **Waiting On scope creep** — mixing data types could balloon scope

**Recommendations**:
1. ✅ Keep Phase 1/Phase 2 split as documented (Steps 1-5 vs 6-8)
2. ⚠️ Consider splitting Step 1 (CRUD vs Suggestions) given scoring complexity
3. ⚠️ Clarify "Waiting On" is filter, not tab — update plan before PRD
