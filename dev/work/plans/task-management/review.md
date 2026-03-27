# Review: Task Management System

**Type**: Plan (pre-execution)
**Audience**: User — This is end-user functionality for PMs managing tasks and commitments

## Concerns

### 1. Scope / Phasing
14 steps is large. Pre-mortem R1 correctly identifies this. However, the plan doesn't specify explicit **phase gates**.

**Suggestion**: Add explicit "Phase 1 Complete" verification step after Step 5 before proceeding to Phase 2. Same for Phase 2→3 and 3→4.

### 2. External Dependency (arete-reserv)
Steps 9-10 pull skills from `arete-reserv` but don't specify:
- Where is arete-reserv? (path, repo, branch)
- What's the current state of those skills?
- Are they tested?

**Suggestion**: Add pre-step: "Read daily-winddown and weekly-winddown from arete-reserv, document external references to remove"

### 3. Task Dependencies Not Explicit
Step 4 (link commitments) depends on Step 3 (TaskService). Step 6-7 depend on Steps 1-5. But Step 8 (inbox processing) seems independent of Step 6-7.

**Suggestion**: Add dependency markers: `depends: [step-3]` to each step in PRD

### 4. Web App Backend Not Specified
Step 11-13 add `/review` route and completion signals. But the plan doesn't specify:
- Backend API endpoint paths
- State management (where are "staged items" stored?)
- How does backend know which items to show?

**Suggestion**: Add API design step before Step 11, or expand Step 11 acceptance criteria to include backend routes

### 5. Catalog Update Missing
Plan touches CommitmentsService, creates TaskService, modifies skills—all capabilities that should be registered in `dev/catalog/capabilities.json`.

**Suggestion**: Add "Update capabilities catalog" to documentation step

### 6. Test Strategy Underspecified
Steps mention "unit tests" but don't specify test file locations or patterns to follow.

**Suggestion**: Reference existing patterns (e.g., "follow CommitmentsService test pattern at `packages/core/src/services/__tests__/commitments.test.ts`")

## Strengths

- Clear mental model table for task locations (Inbox vs Tasks vs Waiting On)
- Persona council summary provides concrete requirements (Harvester: zero-friction; Architect: transparency; Preparer: speed)
- Explicit out-of-scope section prevents scope creep
- Risks section acknowledges key challenges

## Devil's Advocate

**If this fails, it will be because...** The commitment-task linkage (Step 4) introduces bidirectional state that's hard to keep consistent. One system gets updated but not the other. A user completes a task expecting the commitment to resolve, but it doesn't. Or worse: resolving a commitment orphans the task, leaving stale items in week.md. This is the riskiest integration point.

**The worst outcome would be...** Users lose trust in the task system because items appear/disappear unexpectedly. A commitment they resolved still shows as pending. A task they completed resurfaces. The mental model breaks down and they stop using the system entirely.

## Verdict

- [ ] Approve — Ready to proceed
- [x] **Approve with suggestions** — Address the following before PRD:
  1. Add explicit phase gates (verification steps between phases)
  2. Specify arete-reserv location and pre-pull checklist
  3. Add task dependencies to each step
  4. Expand Step 11 to include backend API design

Minor improvements (can address during PRD creation):
- Test pattern references
- Catalog update step
