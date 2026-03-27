---
name: week-plan
description: Plan the week and set weekly priorities. Use when the user wants to plan the week or set top weekly outcomes linked to quarter goals.
triggers:
  - weekly plan
  - plan my week
  - plan the week
  - week planning
  - set weekly priorities
  - prepare a weekly plan
  - prepare weekly plan
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - area_context
  - memory_retrieval
---

# Week Plan Skill

Guide the PM to define the top 3-5 weekly priorities. Read current quarter goals, last week file, active projects, and commitments. Output is `now/week.md`.

## When to Use

- "plan the week"
- "set weekly priorities"
- "what should I focus on this week?"
- "week planning"

## Workflow

### 1. Gather Context

**Timing-aware opening**: Before gathering context, detect timing and set expectations:
- If Friday 4pm or later, or weekend: "Let's plan next week (Week of [next Monday date])"
- Otherwise: "Let's plan the rest of this week (Week of [this Monday date])"

**Gather silently** (no user interaction needed):

- **Quarter goals**: Read `goals/*.md` (excluding `strategy.md`). Parse frontmatter for `id`, `title`, `status`, `area`. Filter to `status: active`.
- **Fallback**: If no individual goal files, read `goals/quarter.md` (legacy format).
- **Last week**: Read `now/week.md` for carry-over items and continuity.
- **Projects**: Scan `projects/active/` README files for active work.
- **Scratchpad**: Read `now/scratchpad.md` for ad-hoc items.
- **Commitments**: Run `arete commitments list --json` to get open commitments.
- **Calendar** (if configured): Run `arete pull calendar --days 7 --json`. If successful, use events for meeting context. If not configured, skip.

### 2. Shape Priorities

**Phase 1: Open-ended ask**

> "Based on your calendar and goals, what are your top 3-5 priorities this week? Just tell me in your own words."

Wait for user response. **Capture their exact wording**.

**Phase 2: Confirm and link**

For each priority:
- Preserve user's wording
- Link to quarter goal ID if relevant (e.g., `[Q1-2]`)
- Clarify "what done looks like" if ambiguous

Present the numbered list back for confirmation.

> **Exchange budget**: Target ≤5 exchanges before file is written.

### 2.5. Surface Key Meetings

**Purpose**: Meeting titles and attendees are inputs for memory search — confirm which meetings matter before searching memory for related decisions.

From the calendar pull in Step 1, identify **prep-worthy meetings** this week:
- QBRs, customer calls, leadership syncs
- Planning sessions, key 1:1s
- Any meeting with external stakeholders

Present a concise list:
> "I see some key meetings this week:
> - Wed: CoverWhale QBR (Sarah, Jamie)
> - Thu: UK Roadmap Review (Product team)
> - Fri: Lindsay 1:1
>
> Any others I should flag, or remove from this list?"

User confirms/modifies the list.

### 2.6. Memory-Informed Context

Use the **contextual_memory_search** pattern (see [PATTERNS.md](../PATTERNS.md)).

**Gather search terms** from:
1. User's priority keywords (from Step 2)
2. Confirmed meeting titles (from Step 2.5)
3. Key attendees (resolved from meetings)

**Run searches** (batch, keep concise):
```bash
arete search "<priority keyword>" --scope memory --limit 2
arete search "<meeting topic>" --scope memory --limit 2
arete search "<key attendee>" --scope memory --limit 2
```

**Surface relevant items** (max 5 total, only if genuinely useful):
> "A few things from memory:
> - **Decision** [3/15]: CoverWhale needs legal sign-off before compliance
> - **Learning** [3/10]: Sarah prefers data-driven QBR agendas
> - **Decision** [3/12]: UK roadmap should prioritize enterprise features
>
> Anything here that changes your priorities?"

**Empty results**: If no relevant memory found, note briefly: "No directly relevant past decisions found." Proceed without delay — don't ask the "anything here" question.

### 3. Build Tasks List

From commitments and context, populate the Tasks section:

**Must complete** — Critical items with due dates this week or blocking dependencies:
- Commitments with `due:` this week
- Items user explicitly marked as critical

**Should complete** — Important but not blocking:
- Commitments without hard deadlines
- Project milestones

**Could complete** — Nice to have:
- Backlog items user wants to tackle
- Low-priority improvements

Also capture:
- **Carried from last week**: Incomplete items from previous `now/week.md`

### 4. Write Week File

**File**: `now/week.md`

**Template**: Resolve via:
```
arete template resolve --skill week-plan --variant week-priorities
```

**Sections**:
- **Weekly Priorities** — Simple numbered list (1-5 items, formerly "Outcomes")
- **Today** — Placeholder for daily-plan (Focus, Meetings)
- **Inbox** — Quick capture area for daily winddown (no metadata required)
- **Notes** — Empty, user's working scratchpad
- **Tasks** — Must/Should/Could subsections populated from commitments
- **Waiting On** — What others owe you (they_owe_me commitments)
- **Carried from last week** — Incomplete items
- **Daily Progress** — Empty, populated by daily-plan

**Format example**:
```markdown
# Week — Mon Mar 24, 2026

## Weekly Priorities
1. POP ready for 3/31 launch
2. CoverWhale through compliance
3. UK priorities finalized

## Today — Mon Mar 24
**Focus**: Week kickoff and planning.

**Meetings**:
- 10:00 Team standup
- 14:00 PM sync

## Inbox

## Notes

## Tasks
### Must complete
- [ ] Monitor POP ticket velocity
- [ ] Get CoverWhale templates through compliance

### Should complete
- [ ] Review UK roadmap draft
- [ ] Prep for Thursday QBR

### Could complete
- [ ] Clean up Jira backlog

## Waiting On
- [ ] Sarah: Legal sign-off on CoverWhale templates @person(sarah-chen) @from(commitment:abc123)

## Carried from last week
- [ ] Finalize Q2 OKRs

## Daily Progress
```

### 5. Confirm and Close

- Summarize the week's focus
- Mention that **daily-plan** will update the Today section each day
- Suggest **week-review** at end of week

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{week_start_date}` | Monday of the week | Mon Mar 24, 2026 |
| `{day_date}` | Current day | Mon Mar 24 |

## References

- **Quarter goals**: `goals/*.md` (individual files with frontmatter)
- **Legacy goals**: `goals/quarter.md` (fallback)
- **Last week**: `now/week.md`
- **Output**: `now/week.md`
- **Template**: `packages/runtime/skills/week-plan/templates/week-priorities.md`
- **Commitments**: `arete commitments list --json`
- **Calendar**: `arete pull calendar --days 7 --json`

## Notes

- **Today section**: Placeholder for daily-plan. When daily-plan runs, it updates Focus and Meetings, and archives previous day to Daily Progress.
- **Notes section**: User's working scratchpad. Preserved across all updates — never moved or overwritten.
- **Tasks vs Outcomes**: Outcomes are high-level goals ("CoverWhale through compliance"). Tasks are specific action items ("Get templates through compliance review").
- **Area context**: Goals and commitments may have `area:` field linking to areas. Area context (Current State, Key Decisions) lives in area files, not duplicated here.

## Error Handling

- If no quarter goals exist, create week file anyway; suggest **quarter-plan**.
- If >5 priorities, suggest ranking and deferring extras to next week.
