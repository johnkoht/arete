# Calendar Events PRD — Learnings

**Date**: 2026-02-25  
**PRD**: calendar-events  
**Type**: PRD execution learnings

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 5/5 complete |
| Success rate | 100% first-attempt |
| Iterations | 0 |
| Tests added | 57 (19 core + 38 CLI) |
| Test total | 903 (901 pass, 0 fail) |
| Commits | 4 (d5fbe64, b287423, f52f727, 2f5a703) |
| Token usage | ~50K total (~15K orchestrator + ~35K subagents) |

---

## Pre-Mortem Analysis

**9 risks identified**, **0 materialized**. 100% mitigation effectiveness.

Key mitigations that prevented issues:
- **File lists in prompts**: Every task had explicit "Context - Read These Files First" which prevented pattern drift
- **Pre-mortem mitigations in subagent prompts**: Not just documented, but included directly in task context
- **Optional interface pattern**: Using `createEvent?` (optional) on CalendarProvider prevented ical-buddy breakage
- **Explicit date patterns**: Listing exactly which patterns to support prevented chrono-node scope creep

---

## What Worked Well

1. **Testing integrated with implementation** — Tasks 1 and 2 delivered tests as part of their scope. Task 5 was just verification that coverage was complete. This is more efficient than treating tests as a separate phase.

2. **Skill format via existing examples** — Using meeting-prep and daily-plan as templates made the schedule-meeting skill straightforward. The LEARNINGS.md warning about relative paths also prevented a common mistake.

3. **DI pattern consistency** — Following FreeBusyDeps → CreateEventDeps was a one-line pattern copy. The existing codebase patterns made new code predictable.

4. **Reviewer pre-work sanity checks** — Caught missing AC details (duration defaults, title generation, CLI options) before developer started work.

---

## What Could Improve

1. **Shared formatter extraction** — `formatSlotTime` ended up duplicated between availability.ts and calendar.ts. Should have extracted to shared utils before Task 2. Added refactor item.

2. **Skill routing verification** — No easy way to verify skill triggers work in the build repo (runtime skills deploy to user workspaces). Need better dev-time validation.

---

## Subagent Insights (Synthesized)

Common patterns from developer reflections:
- **Context files were critical**: "The file list + pattern references + explicit specs made implementation smooth"
- **Explicit specs eliminate ambiguity**: "Date parsing specification eliminated all ambiguity"
- **LEARNINGS.md prevented mistakes**: "The warning about relative paths prevented a common mistake"

Token estimates consistently accurate (~15-20K for medium tasks, ~6-8K for small tasks).

---

## Recommendations for Next PRD

### Continue
- Pre-mortem mitigations embedded in subagent prompts (not just documented)
- Explicit file lists with "why it's relevant"
- Testing as part of implementation tasks
- Reviewer pre-work sanity checks

### Stop
- N/A (no patterns to avoid this execution)

### Start
- Extract shared utilities proactively when duplication risk is identified in pre-mortem
- Add dev-time skill trigger validation before deploy

---

## Refactor Items

1. **formatSlotTime extraction** — `dev/work/plans/refactor-format-slot-time/plan.md`
   - Duplicated in availability.ts and calendar.ts
   - Extract to packages/cli/src/formatters.ts

---

## References

- PRD: `dev/work/plans/calendar-events/prd.md`
- Execution state: `dev/executions/calendar-events/`
- Related: Google Calendar provider (2026-02-22), FreeBusy API (2026-02-22)
