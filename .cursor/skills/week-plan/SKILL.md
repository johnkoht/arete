---
name: week-plan
description: Plan the week and set weekly priorities. Use when the user wants to plan the week or set top weekly outcomes linked to quarter goals.
---

# Week Plan Skill

Guide the PM to define the top 3–5 outcomes for the week, linked to quarter goals. Read current quarter goals, last week file, active projects, and scratchpad/commitments. Output is a week priorities file in `resources/plans/`.

## When to Use

- "plan the week"
- "set weekly priorities"
- "what should I focus on this week?"
- "week planning"

## Workflow

### 1. Gather Context

- **Read** current quarter goals: `resources/plans/quarter-YYYY-Qn.md`.
- **Read** last week file in `resources/plans/` if any (e.g. `week-YYYY-Www.md`) for carry-over and continuity.
- **Read** `projects/active/` (README or key files) for commitments tied to projects.
- **Read** `scratchpad.md` for ad-hoc commitments or "due this week" items.

### 2. Guide to Top 3–5 Outcomes

Ask the PM to choose **3–5 outcomes** for the week. For each outcome capture:

- **Outcome** — What done looks like.
- **Advances quarter goal** — Link to a quarter outcome (e.g. "Q1-2", "Q1 outcome 2").
- **Success criteria** (optional) — How we know it’s done.
- **Effort** (optional) — deep / medium / quick.

Also capture:

- **Commitments due this week** — From meetings, stakeholders, or scratchpad.
- **Carried over from last week** — Incomplete items from the previous week file.

### 3. Write Week File

- **File**: `resources/plans/week-YYYY-Www.md` (e.g. `week-2026-W06.md` using ISO week).
- **Structure**: Use the template at `templates/plans/week-priorities.md`:
  - Week dates
  - Top 3–5 outcomes with quarter goal links
  - Commitments due this week
  - Carried over from last week
  - Optional "End of week review" section (filled during **week-review**).

### 4. Confirm and Close

- Summarize the week’s focus and quarter links.
- Suggest **week-review** at the end of the week to close out and carry over.

## References

- **Quarter goals**: `resources/plans/quarter-YYYY-Qn.md`
- **Last week**: `resources/plans/week-YYYY-Www.md`
- **Output**: `resources/plans/week-YYYY-Www.md`
- **Template**: `templates/plans/week-priorities.md`
- **Context**: `projects/active/`, `scratchpad.md`

## Error Handling

- If no quarter file exists, still create the week file; note "Quarter link TBD" and suggest **quarter-plan**.
- If the user has more than 5 outcomes, suggest ranking and moving the rest to "backup" or next week.
