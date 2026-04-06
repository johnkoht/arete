# Phase 3: Self-Review

## Summary

5 tasks to tighten the hierarchy between goals, projects, areas, and tasks.

## Gap Verification

**Tasks 3 and 5 are already done**:
- Task 3 (Tasks inherit scope): Meeting approve flow already passes `meetingArea` to `addTask()`. The `TaskMetadata` type already has `area`, `project`, `person`, `from` fields.
- Task 5 (Commitment inherits goal/area): CLI `meeting approve` and backend `approveMeeting()` both extract `area` from meeting frontmatter and accept `goalSlug`, passing both to commitment/task creation. Already verified in code.

**3 real gaps remain**:

1. **quarter-plan** — skill doesn't ask for area, template doesn't include `area:` frontmatter
2. **general-project** — skill doesn't ask which goal this project advances
3. **week-plan** — skill doesn't scope by area first

## Design Correctness

### Approach: Skill-level changes only
All three gaps are in skill markdown files, not TypeScript. The core types (`Goal`, `Commitment`, `TaskMetadata`) already support the fields. This is the right approach:
- Lower risk (no TypeScript changes)
- Faster to implement
- Directly addresses the UX gap (user prompting)

### Soft constraints are correct
The design principle "tighten, don't enforce" is correct. Goals without area, projects without goals, and weeks without area-scoping should all be allowed. The skill adds prompts and labels, not hard blocks.

### Area-scoping in week-plan
The fix is well-scoped: ask "Which areas this week?", filter goal/project display, but show all tasks (tasks may not be area-tagged yet). Graceful degradation if no areas exist.

## Risks

1. **Template format mismatch**: GoalParserService expects `area` as a string in frontmatter. If the template uses `area: null` vs `area: ""` vs `area:` (empty), parsing may differ. **Mitigation**: Use `area: ""` (explicit empty string) which YAML parses as `""` — GoalParserService already handles this via `frontmatter.area.trim()` check.

2. **project.md template already has `**Goal**` field**: The existing template has a `**Goal**` line which is "What are we trying to achieve?" — this is the project's goal description, not a link to a quarterly goal. Need to differentiate. **Mitigation**: Add `**Linked Goal**` (ID format: `Q1-1`) as a separate line from the narrative `**Goal**`.

3. **Week-plan area list may be empty**: New users or minimal workspaces may not have `areas/*.md`. **Mitigation**: Explicit graceful-skip instruction in the skill.

## Checklist

- [x] Gaps verified in real code before planning
- [x] Tasks 3 and 5 identified as already done
- [x] Soft constraint design principle applied
- [x] Graceful degradation for all three gaps
- [x] No TypeScript changes needed (correct — types already support the fields)
- [x] Template format verified against GoalParserService behavior
