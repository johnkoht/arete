---
title: "Workspace Areas Refactor"
slug: create-areas
status: complete
size: large
tags: [areas, workspace, refactor]
created: "2026-03-25T05:00:00.000Z"
updated: 2026-03-25T17:38:39.356Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 9
---

Good call! Updated plan:

---

## Plan: Weekly Template Redesign

**Size**: Small (4 steps)

### Plan:

1. **Update week-plan template** (`packages/runtime/skills/week-plan/templates/week-priorities.md`)
   - Replace current structure with new format
   - Sections: Outcomes, Today, Notes, Tasks (Must/Should/Could), Carried, Daily Progress
   - AC: New template matches approved format

2. **Update week-plan skill instructions** (`packages/runtime/skills/week-plan/SKILL.md`)
   - Update section descriptions to match new template
   - Tasks pulls from `arete commitments list` + allows ad-hoc additions
   - Remove old "Top 3-5 outcomes with success criteria" format
   - AC: Skill generates plans matching new template

3. **Update daily-plan skill for Today section** (`packages/runtime/skills/daily-plan/SKILL.md`)
   - Update to write to `## Today — Day Date` format
   - **Before writing new Today**: Move existing Today section to Daily Progress
   - Preserve Notes section content (don't move to progress)
   - AC: daily-plan archives previous day then writes new day

4. **Update UPDATES.md with template changes**
   - Document new weekly format
   - Note: existing week.md files will be updated on next run
   - AC: Users know what changed

---

**Daily Progress flow:**
```
1. User runs daily-plan on Tuesday morning
2. Agent reads existing "## Today — Mon Mar 24" section
3. Agent creates "### Mon Mar 24" entry under "## Daily Progress"
   - Copies Focus, Meetings (preserves Notes in place)
4. Agent writes new "## Today — Tue Mar 25" section
5. Notes section stays in place (user's working scratchpad)
```

**Edge cases:**
- First day of week (no previous Today) → Skip archival step
- Same day re-run → Don't duplicate in Daily Progress (check date)

---

**Risks:**
- Merge logic complexity → Keep it simple: read → archive → write
- Notes preservation → Notes section is separate, not under Today

**Out of scope:**
- Progress field (what you accomplished) → Added manually or via winddown
- Task completion tracking → Handled separately

Ready to `/approve` and `/build`?