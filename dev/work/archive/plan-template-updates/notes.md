# Weekly Template Redesign

## Problem

The current weekly plan template is verbose and doesn't capture the rolling nature of a PM's week. It lacks:
- Clear daily progress tracking
- MoSCoW-style task prioritization  
- Automatic archival of previous day's plan

## Goal

Redesign the weekly plan template and skill instructions to be more action-oriented, with automatic daily progress archival.

## New Weekly Plan Format

```markdown
# Week — Mar 24, 2026

## Outcomes
1. POP ready for 3/31 launch
2. CoverWhale through compliance
3. UK priorities finalized

## Today — Tue Mar 25
**Focus**: CoverWhale transformer sync. First shadow.

**Meetings**:
- 10:00 Anthony 1:1 → [agenda](now/agendas/anthony-1-1.md) ⭐
- 12:45 Mayra intro → [agenda](now/agendas/mayra-intro.md)
- 14:00 Shadow: LaTisha → [agenda](now/agendas/shadow-latisha.md)

## Notes
<!-- Working notes captured throughout the week -->

## Tasks
### Must complete
- [ ] Monitor POP ticket velocity
- [ ] Get CoverWhale templates through compliance

### Should complete
- [ ] 

### Could complete
- [ ] 

## Carried from last week
- [ ] 

## Daily Progress
### Mon Mar 24
**Focus**: Email compose release day.
**Meetings**: UK Eng, PM Bi-Weekly, Prod Access
**Progress**:
- Email compose shipped (100%)
- UK priorities: KinetiQ → Motor → CIA
```

## Key Decisions

| Decision | Resolution |
|----------|------------|
| Area-linked goals | Stay in area files (Active Work, Current Focus) — no separate section in weekly |
| Tasks section | Pull from `arete commitments list` + allow ad-hoc additions |
| Agenda links | Link to `now/agendas/{slug}.md` |
| Daily Progress automation | daily-plan moves previous Today to Daily Progress |
| Key meeting marker (⭐) | Manual during agenda creation |
| Notes section | Standalone, preserved across updates (not moved to progress) |

## Daily Progress Flow

```
1. User runs daily-plan on Tuesday morning
2. Agent reads existing "## Today — Mon Mar 24" section
3. Agent creates "### Mon Mar 24" entry under "## Daily Progress"
   - Copies Focus, Meetings (Notes stay in place)
4. Agent writes new "## Today — Tue Mar 25" section
5. Notes section stays in place (user's working scratchpad)
```

## Edge Cases

- **First day of week** (no previous Today) → Skip archival step
- **Same day re-run** → Don't duplicate in Daily Progress (check date matches)
- **Old format week.md** → Agent handles gracefully, updates to new format

## Plan

### Task 1: Update week-plan template
**File**: `packages/runtime/skills/week-plan/templates/week-priorities.md`

Replace current structure with new format:
- Outcomes (simple numbered list)
- Today — Day Date (Focus, Meetings)
- Notes (standalone section)
- Tasks (Must/Should/Could subsections)
- Carried from last week
- Daily Progress (entries by day)

**Acceptance Criteria**:
- [ ] Template has all sections in correct order
- [ ] Placeholder text guides user on each section
- [ ] Template renders correctly when skill creates new week

### Task 2: Update week-plan skill instructions
**File**: `packages/runtime/skills/week-plan/SKILL.md`

Update skill to generate plans matching new template:
- Tasks section pulls from `arete commitments list --json`
- Prioritize into Must/Should/Could based on due dates and user input
- Remove old "Top 3-5 outcomes with success criteria" verbosity
- Reference new template structure

**Acceptance Criteria**:
- [ ] Skill instructions reference new section names
- [ ] Tasks generation documented (commitments + ad-hoc)
- [ ] Outcomes section is simple numbered list

### Task 3: Update daily-plan skill for Today section and archival
**File**: `packages/runtime/skills/daily-plan/SKILL.md`

Update daily-plan to:
1. Read existing `## Today — [Day Date]` section
2. If date is different from today: move to `## Daily Progress` as `### [Day Date]`
3. Write new `## Today — [Day Date]` with Focus and Meetings
4. Preserve Notes section (don't move to progress)

**Acceptance Criteria**:
- [ ] Previous day's Today is archived to Daily Progress
- [ ] Same-day re-run doesn't duplicate entries
- [ ] Notes section preserved in place
- [ ] First day of week (no previous) handled gracefully

### Task 4: Update UPDATES.md
**File**: `packages/runtime/UPDATES.md`

Document the template changes:
- New weekly format with sections explained
- Daily progress automation
- Note that existing week.md files update on next run

**Acceptance Criteria**:
- [ ] Changes documented for users
- [ ] Examples show before/after

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing week.md incompatibility | Medium | Low | Agent reads what exists, updates structure on write |
| Notes section accidentally moved | Low | Medium | Clear instruction: Notes is separate from Today |
| Merge logic complexity | Medium | Medium | Keep simple: read → archive if different day → write |

## Out of Scope

- Progress field content (what you accomplished) → Added manually or via winddown
- Task completion tracking → Handled by week-review
- Auto-agenda creation → Manual via agent request
- Area Overview section → Goals stay in area files

## Size

**Small** (4 tasks) — all are documentation/template updates to skill markdown files
