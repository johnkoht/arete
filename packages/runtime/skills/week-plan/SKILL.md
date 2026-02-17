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
---

# Week Plan Skill

Guide the PM to define the top 3–5 outcomes for the week, linked to quarter goals. Read current quarter goals, last week file, active projects, and scratchpad/commitments. Output is `now/week.md`.

## When to Use

- "plan the week"
- "set weekly priorities"
- "what should I focus on this week?"
- "week planning"

## Workflow

### 1. Gather Context

- **Read** current quarter goals: `goals/quarter.md`.
- **Read** last week file: `now/week.md` for carry-over and continuity.
- **Read** `projects/active/` (README or key files) for commitments tied to projects.
- **Read** `now/scratchpad.md` for ad-hoc commitments or "due this week" items.
- **Try Calendar (if configured)**: Run `arete pull calendar --days 7 --json`. If the command succeeds and returns events (`success: true` and non-empty `events`), use them to list the week’s meetings (by day). If the command fails, returns no events, or is not configured, skip calendar and rely on the user for meeting context.

### 2. Week’s Meetings and Prep

If you have calendar events from step 1:

- **List** the week’s meetings by day (title, time, attendees if useful).
- **Call out** meetings that look like ones that often need prep. Use the meeting title (and notes if present) to flag types such as:
  - **QBR / Quarterly business review** — e.g. "QBR", "quarterly business review", "quarterly review"
  - **Monthly / product review** — e.g. "monthly product review", "product review", "monthly review"
  - **Stakeholder / leadership** — e.g. "stakeholder", "leadership", "exec review", "board"
  - **Product update / launch** — e.g. "product update", "launch review", "release review"
  - **Customer / external** — e.g. "customer", "customer review", "partner"
  - **Recurring cadences** — e.g. "all-hands", "all hands", "standup", "sync", "1:1" (optional; call out if the user cares about prep)
- **Propose or ask**: "Which of these meetings do you want to prepare for this week?" Suggest adding any that need prep to **Commitments due this week** or to a short "Meetings to prep" list. If the user names others (e.g. no calendar), add those too.

If you have no calendar data, briefly ask: "Any key meetings this week you want to plan prep for?" and fold the answer into commitments or outcomes as appropriate.

### 3. Guide to Top 3–5 Outcomes

Ask the PM to choose **3–5 outcomes** for the week. For each outcome capture:

- **Outcome** — What done looks like.
- **Advances quarter goal** — Link to a quarter outcome (e.g. "Q1-2", "Q1 outcome 2").
- **Success criteria** (optional) — How we know it’s done.
- **Effort** (optional) — deep / medium / quick.

Also capture:

- **Commitments due this week** — From meetings, stakeholders, scratchpad, and any "meetings to prep" from step 2.
- **Carried over from last week** — Incomplete items from the previous week file.

### 4. Write Week File

- **File**: `now/week.md`.
- **Structure**: **Load week priorities template** — attempt each path in order.
  1. Attempt to read `templates/plans/week-priorities.md`
     → **Exists**: use its sections as the week file structure. Do not read step 2. Stop.
     → **Missing**: continue.
  2. Attempt to read `.agents/skills/week-plan/templates/week-priorities.md`
     → **Exists**: use its sections. Stop.
     → **Missing**: proceed without template.
  If step 1 succeeds, step 2 is irrelevant — do not consult it.

  Template sections:
  - Week dates
  - Top 3–5 outcomes with quarter goal links
  - Commitments due this week
  - Carried over from last week
  - Optional "End of week review" section (filled during **week-review**).

### 5. Stakeholder Watchouts (Summary)

- For meetings likely to need prep, resolve attendees and run stale-aware refresh as needed:
  - `arete people memory refresh --person <slug> --if-stale-days 7`
- Add a compact section: **Stakeholder watchouts this week** with 3–5 high-signal themes.
- Keep this strategic and concise (avoid per-person dumps unless requested).

### 6. Confirm and Close

- Summarize the week’s focus and quarter links.
- Suggest **week-review** at the end of the week to close out and carry over.

## References

- **Quarter goals**: `goals/quarter.md`
- **Last week**: `now/week.md`
- **Output**: `now/week.md`
- **Template**: `templates/plans/week-priorities.md` (override) or `.agents/skills/week-plan/templates/week-priorities.md` (default)
- **Context**: `projects/active/`, `now/scratchpad.md`
- **Calendar**: `arete pull calendar --days 7 --json` (optional; same as daily-plan)

## Notes

- **Recurrence**: The calendar integration (icalBuddy) does not expose whether an event is recurring. Meeting-type callouts (QBR, monthly review, etc.) are based on **event title** (and notes) only. A future provider (e.g. Google Calendar API) could add recurrence if needed.

## Error Handling

- If no quarter file exists, still create the week file; note "Quarter link TBD" and suggest **quarter-plan**.
- If the user has more than 5 outcomes, suggest ranking and moving the rest to "backup" or next week.
