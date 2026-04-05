# Product Simplification — Phase 3: Hierarchy Tightening Learnings

**Date**: 2026-04-04
**Plan**: product-simplification-phase3
**Execution**: Single sub-orchestrator in worktree (worktree-agent-aa4e0093)

## What Was Built

Phase 3 adds soft constraints to connect goals, areas, and projects without hard enforcement.

### Tasks 3 and 5: Already Done (Verified)

**Task 3 (Tasks inherit scope)**: Area inheritance from meeting→task was already implemented. The CLI `meeting approve` command extracts `meetingArea` from meeting frontmatter and passes it to `services.tasks.addTask()`. The backend `approveMeeting()` does the same. No code change needed.

**Task 5 (Commitment inherits goal/area)**: The meeting approval flow already passes both `area` (from meeting frontmatter) and `goalSlug` (from user prompt) to `services.commitments.create()`. CommitmentsService stores both fields on the Commitment object. Already done in CLI (meeting.ts L1169-1238) and backend (workspace.ts L626-726).

**Lesson**: Always verify gaps in code before building fixes. Two of five tasks were already done.

### Tasks 1, 2, 4: Implemented via Skill Updates

All three implemented as skill markdown changes — no TypeScript required. The `Goal` type already had `area?: string`. The existing infrastructure supported everything; the gap was the UX prompting.

1. **quarter-plan**: Added Step 1.5 (discover areas from `areas/*.md`), added area prompt to each goal definition, added `area: ""` to template frontmatter, added unlinked goal callout on close.

2. **general-project**: Added Step 1.5 (link to active quarter goal), replaced free-text `**Goal**` field in template with typed `**Linked Goal**` (goal ID format: Q1-2). Graceful skip if no goals exist.

3. **week-plan**: Added Step 1.5 (area scoping): lists areas, asks user to select focus areas for the week, shows goals grouped by area in Step 2 prompt. Auto-selects if only 1 area. Skips entirely if no areas. Tasks and commitments remain unfiltered (graceful degradation for partial area tagging).

## Key Metrics

- 2/5 tasks already done (verified in code before building)
- 3/5 tasks implemented via skill updates (no TypeScript changes)
- 0 new tests needed (skill files are markdown, not code)
- 8 files changed: 5 skill files + 3 plan files
- Quality gates: typecheck ✓ (0 errors), test ✓ (2654 passing, 0 failing), build ✓

## Key Learnings

### Skills-only for UX gaps
When the gap is "the LLM agent doesn't prompt for X," the fix is a skill instruction change — not a TypeScript model or service change. The data model already supported `area` on goals, `goalSlug` on commitments, etc. The missing piece was agent behavior, which is controlled by skill markdown.

### Soft constraints > hard enforcement
Area assignment for goals, goal linkage for projects, and area-scoping for week planning are all implemented as SOFT prompts with graceful skip paths. This follows the "hierarchy should feel like it builds itself from natural workflow" principle. Never block creation — always offer skip.

### Worktree branch context matters
This worktree branched from `worktree-product-simplification-p2`, NOT from `product-simplification` (Phase 1+2). Phase 2 changes (Jaccard dedup in addTask, confidence threshold 0.65, existingTasks in MeetingContextBundle) are NOT in this branch. Each worktree is isolated — verify the actual branch and what's present before assuming previous phase changes are available.

### area: "" vs area: null in YAML
GoalParserService handles area as `typeof frontmatter.area === 'string' && frontmatter.area.trim()`. Using `area: ""` in templates is correct: YAML parses it as empty string, `.trim()` returns `""` which is falsy, so `area` is correctly stored as `undefined` on the parsed Goal object. This is the right representation for "no area assigned."
