---
name: calendar
description: View and pull calendar events
work_type: operations
category: essential
triggers:
  - show my calendar
  - pull calendar events
  - calendar today
  - what meetings do I have
  - upcoming meetings
---

# Calendar Skill

View and pull calendar events from the configured calendar provider.

## When to Use

- "What meetings do I have today?"
- "Show my calendar for this week"
- "Pull calendar events"
- "What's upcoming?"

**Not this skill**: Use **meeting-prep** when preparing context for a specific meeting ("prep me for my call with Jane", "meeting prep for Product Review").

## Workflow

### 1. Check Provider

```bash
arete integration list --json
```

Look for an active calendar integration (`icalBuddy` or `google-calendar`). If none is active:

```
No calendar integration is configured. Run:
  arete integration configure calendar       # macOS Calendar (ical-buddy)
  arete integration configure google-calendar  # Google Calendar OAuth
```

### 2. Pull Events

```bash
# Today's events
arete pull calendar --today --json

# All upcoming (default range)
arete pull calendar --json

# Specific day count
arete pull calendar --days 3 --json
```

### 3. Display Events

Format the results as a readable list:

```
## Your Calendar

**Today, March 5**
- 10:00 AM – Product Sync (45 min) — with Jane, Alex
- 2:00 PM – Customer Call (30 min) — with Acme

**Tomorrow, March 6**
- 9:00 AM – Sprint Planning (60 min)
```

If no events are found, say so clearly: "No events found for this period."

### 4. Offer Next Steps

- Suggest **meeting-prep** for a specific event: "Want me to prep context for the Customer Call?"
- Offer to pull more days if the range seems short.
