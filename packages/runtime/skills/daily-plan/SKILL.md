---
name: daily-plan
description: Surface today's focus, week priorities, and meeting context for each of today's meetings. Use when the user wants a daily plan or "what's on my plate today".
primitives:
  - User
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
---

# Daily Plan Skill

Build a daily plan: today's focus from week priorities, meeting context per meeting (who, what you owe, prep suggestions), commitments due, and carry-over. Uses the **get_meeting_context** pattern for each meeting.

## When to Use

- "What's on my plate today?"
- "Daily plan"
- "Today's focus"

## Gather Context for Meetings

For each of today's meetings, run the **get_meeting_context** pattern — see [PATTERNS.md](../PATTERNS.md). Use the outputs to summarize per meeting: who, what you owe them, 1–2 line prep suggestion.

## Workflow

### 1. Gather Context

- **Read** `now/week.md` (current week priorities).
- **Read** `goals/quarter.md` if needed for goal context.
- **Read** `now/scratchpad.md` for ad-hoc items.
- **Try Calendar (if configured)**: Run `arete pull calendar --today --json`. If the command succeeds and returns events (check `success: true` and non-empty `events` array), use those as today's meeting list and note the calendar names. If the command fails, returns no events, or is not configured, fall back to asking the user.
- **Ask** user for today's meetings (fallback if calendar unavailable): "List today's meetings (title + attendees) or say 'none'."

### 2. For Each Meeting

Run **get_meeting_context** (see PATTERNS.md). Summarize per meeting: who, what you owe them, 1–2 line prep suggestion.

### 3. Build Daily Plan

Output markdown:

```markdown
## Daily Plan — YYYY-MM-DD

### Today's Focus
- [Top 2–3 outcomes from week priorities or scratchpad]

### Meetings
[Note: Include source at the top: "Pulled from Calendar (calendar-names)" or "User provided"]

- **[Meeting title]** — Attendees: X, Y  
  Context: [1–2 line summary]; Prep: [suggestion]

### Commitments Due
- From week file "Commitments due" or scratchpad

### Carry-Over
- [Unfinished items from yesterday if captured]
```

### 4. Optional

- Offer to create `now/today.md` with this content for reference. (Phase 2: structured day files; v1 output to chat only.)

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **Week file**: `now/week.md` | **Quarter**: `goals/quarter.md` | **Scratchpad**: `now/scratchpad.md`
- **Related**: meeting-prep, week-plan, week-review
