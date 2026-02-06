---
name: daily-plan
description: Surface today's focus, week priorities, and meeting context for each of today's meetings. Use when the user wants a daily plan or "what's on my plate today".
---

# Daily Plan Skill

Build a daily plan: today's focus from week priorities, meeting context per meeting (who, what you owe, prep suggestions), commitments due, and carry-over. Uses the get_meeting_context pattern for each meeting.

## When to Use

- "What's on my plate today?"
- "Daily plan"
- "Today's focus"

## Get Meeting Context (Pattern)

For each of today's meetings, gather context. Same pattern as **meeting-prep** skill:

1. Resolve attendees to people slugs
2. Read person files
3. Search meetings involving attendees (by `attendee_ids` or attendee names)
4. Read projects where attendees are stakeholders
5. Extract unchecked action items from recent meetings

## Workflow

### 1. Gather Context

- **Read** current week file: `resources/plans/week-YYYY-Www.md` (use ISO week for today).
- **Read** quarter file if needed: `resources/plans/quarter-YYYY-Qn.md` for goal context.
- **Read** `scratchpad.md` for ad-hoc items.
- **Ask** user for today's meetings: "List today's meetings (title + attendees) or say 'none'." No calendar integration in v1.

### 2. For Each Meeting

Run the **get_meeting_context** pattern:
- Attendee details, recent meetings, related project, open action items, prep suggestions.
- Summarize per meeting: who, what you owe them, 1–2 line prep suggestion.

### 3. Build Daily Plan

Output markdown:

```markdown
## Daily Plan — YYYY-MM-DD

### Today's Focus
- [Top 2–3 outcomes from week priorities or scratchpad]

### Meetings
- **[Meeting title]** — Attendees: X, Y  
  Context: [1–2 line summary]; Prep: [suggestion]

### Commitments Due
- From week file "Commitments due" or scratchpad

### Carry-Over
- [Unfinished items from yesterday if captured]
```

### 4. Optional

- Offer to create `resources/plans/day-YYYY-MM-DD.md` with this content for reference. (Phase 2: structured day files; v1 output to chat only.)

## References

- **Week file**: `resources/plans/week-YYYY-Www.md`
- **Quarter file**: `resources/plans/quarter-YYYY-Qn.md`
- **Scratchpad**: `scratchpad.md`
- **People, Meetings, Projects**: See meeting-prep skill
- **Related**: meeting-prep, week-plan, week-review
