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

- **Quarter goals**: Read `goals/quarter.md`. Goals are markdown headings (`## Goal Title`) with `Area`, `Success`, and `Status` fields. Filter to `Status: Active`.
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

**Parse calendar JSON** from Step 1 (`arete pull calendar --days 7 --json`). Each event contains:
- `importance`: "light" | "normal" | "important"
- `hasAgenda`: boolean (agenda file exists in `now/agendas/`)
- `organizer`: `{ name, email, self }` or null
- `attendees`: `[{ name, email, personSlug? }]`

**Classify meetings into two groups**:

🔴 **High priority** — `importance === "important"`
- 1:1s (2 attendees total)
- You organized (organizer.self === true)

🟡 **Prep-worthy** — `importance === "normal"` AND one of:
- `hasAgenda === true`
- Has external attendee (email domain differs from organizer's domain)

**Determine "why flagged"** for each meeting:
- `(1:1)` — exactly 2 attendees
- `(you organized)` — organizer.self === true
- `(has agenda)` — hasAgenda === true
- `(external: @domain.com)` — attendee domain differs from organizer domain

**Fallback**: If `importance` field is missing (older calendar output), use title matching:
- QBR, quarterly, customer, client → important
- 1:1, one-on-one, sync → important
- Leadership, exec, board → important

**Hide `light` importance meetings** unless user explicitly asks to see them.

**Present grouped list**:
> "Key meetings this week:
>
> 🔴 **High priority**
> - Wed 2:00pm: Sarah Chen 1:1 (1:1)
> - Thu 10:00am: CoverWhale QBR (you organized)
>
> 🟡 **Prep-worthy**
> - Tue 3:00pm: UK Roadmap Review (external: @acme.com)
> - Fri 11:00am: Product Sync (has agenda)
>
> Add, remove, or skip any? (Enter numbers to remove, + to add, or press Enter to confirm)"

**User confirms/modifies** the list using quick selection (preserve existing UX pattern).

**⚠️ Keep this confirmed list for Step 4 output** — the Key Meetings section will include exactly these meetings with their flags.

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

### 3. Build Tasks List (Pull from Task Store)

Rather than creating tasks from scratch, pull existing tasks from the workspace:

#### 3.1 Gather Candidates

Read from three sources:

1. **Task Backlog**: Read `now/tasks.md` `## Anytime` section
2. **Open Commitments**: Run `arete commitments list --json`, filter to:
   - `direction: i_owe_them` only
   - Check both `now/tasks.md` and `now/week.md` for existing tasks with `@from(commitment:HASH)` matching this commitment's ID
   - If a linked task already exists: show it with label **(already a task: "task text")** and skip auto-create
   - WITHOUT existing linked tasks (no `@from(commitment:)` match in tasks.md or week.md)
3. **Last Week Carryover**: Read `now/week.md` Tasks section, filter to incomplete (`- [ ]`) items

#### 3.2 Present Grouped Candidates

Present candidates in a numbered list grouped by source:

```markdown
## From Task Backlog (Anytime)
1. Review Q1 metrics @project(analytics)
2. Update onboarding docs @area(product)
3. Research competitor pricing @project(pricing)

## From Open Commitments (Not Yet Tasks)
4. Send API specs to Sarah @person(sarah-chen)
5. Review contract draft @person(jamie)

## Carried from Last Week (Incomplete)
6. Finalize compliance checklist
7. Schedule design review
```

> "Here are your candidate tasks for this week. Which ones should be on your plate?"

#### 3.3 User Selects Destinations (Numbered List)

Prompt user with numbered selection:

> "Which tasks for this week? Enter numbers for each bucket:
> - **Must** (critical this week): 
> - **Should** (important, not blocking): 
> - **Could** (nice to have): "

Example user response: "Must: 1, 4. Should: 2, 6. Could: 3"

#### 3.4 Move Selected Tasks

For selected tasks from **Task Backlog (Anytime)**:
- **MOVE** (not copy): Remove from `now/tasks.md` `## Anytime`, add to `now/week.md` appropriate section
- Preserve all metadata (`@area()`, `@project()`, `@person()`, `@due()`, `@from()`)

For selected tasks from **Open Commitments**:
- Create new task in `now/week.md` with `@from(commitment:id)` link
- Include `@person()` from commitment counterparty

For **Carryover** items:
- Already in week.md — move to appropriate section (Must/Should/Could) if in wrong section

**Deduplication**: Before adding to week.md, check if task text already exists in Tasks section:
- If duplicate found: Skip with note: "Skipped 'Review Q1 metrics' — already in week.md"
- Compare normalized text (lowercase, trimmed, ignore metadata tags)

#### 3.5 Handle Remaining Anytime Items

After selections, if Anytime tasks remain unselected:

> "These tasks remain in your Anytime backlog:
> - Research competitor pricing @project(pricing)
> - Clean up Jira labels @area(product)
>
> Would you like to move any to **Someday** (parking lot for later)? Enter numbers, or press Enter to keep in Anytime."

If user provides numbers, move those tasks from `## Anytime` to `## Someday` in `now/tasks.md`.

#### Summary: Task Destinations

| Source | Selected | Not Selected |
|--------|----------|--------------|
| Anytime (tasks.md) | → week.md (Must/Should/Could) | Ask: Anytime or Someday? |
| Open Commitments | → week.md + @from(commitment:) | Stays uncommitted |
| Carryover (week.md) | → appropriate section | Stays in current section |

### 4. Write Week File

**File**: `now/week.md`

**Template**: Resolve via:
```
arete template resolve --skill week-plan --variant week-priorities
```

**Sections**:
- **Weekly Priorities** — Simple numbered list (1-5 items, formerly "Outcomes")
- **Key Meetings** — Confirmed prep-worthy meetings from Step 2.5 (optional, omit if empty)
- **Today** — Placeholder for daily-plan (Focus, Meetings)
- **Inbox** — Quick capture area for daily winddown (no metadata required)
- **Notes** — Empty, user's working scratchpad
- **Tasks** — Must/Should/Could subsections populated from commitments
- **Waiting On** — What others owe you (they_owe_me commitments)
- **Carried from last week** — Incomplete items
- **Daily Progress** — Empty, populated by daily-plan

**Key Meetings format** (from confirmed list in Step 2.5):
```markdown
## Key Meetings
- [ ] Wed 2:00pm: Sarah Chen 1:1 (Sarah Chen) — prep: needs prep
- [ ] Thu 10:00am: CoverWhale QBR (Sarah, Jamie, Alex) — prep: [CoverWhale QBR](now/agendas/coverwhale-qbr.md)
- [ ] Fri 11:00am: Product Sync (Product team) — prep: needs prep
```

**Empty state**: If no high-priority or prep-worthy meetings, write:
```markdown
## Key Meetings
No high-priority meetings this week — light calendar!
```

**Format example**:
```markdown
# Week — Mon Mar 24, 2026

## Weekly Priorities
1. POP ready for 3/31 launch
2. CoverWhale through compliance
3. UK priorities finalized

## Key Meetings
- [ ] Wed 2:00pm: Sarah Chen 1:1 (Sarah Chen) — prep: needs prep
- [ ] Thu 10:00am: CoverWhale QBR (Sarah, Jamie, Alex) — prep: [CoverWhale QBR](now/agendas/coverwhale-qbr.md)

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

- **Quarter goals**: `goals/quarter.md`
- **Last week**: `now/week.md`
- **Output**: `now/week.md`
- **Template**: `packages/runtime/skills/week-plan/templates/week-priorities.md`
- **Commitments**: `arete commitments list --json`
- **Calendar**: `arete pull calendar --days 7 --json`

## Notes

- **Today section**: Placeholder for daily-plan. When daily-plan runs, it updates Focus and Meetings, and archives previous day to Daily Progress.
- **Notes section**: User's working scratchpad. Preserved across all updates — never moved or overwritten.
- **Tasks vs Outcomes**: Outcomes are high-level goals ("CoverWhale through compliance"). Tasks are specific action items ("Get templates through compliance review").
- **Area context**: Goals and commitments may have `area:` field linking to areas. Area context (Focus, Goals, Horizon) lives in area files, not duplicated here.

## Error Handling

- If no quarter goals exist, create week file anyway; suggest **quarter-plan**.
- If >5 priorities, suggest ranking and deferring extras to next week.
