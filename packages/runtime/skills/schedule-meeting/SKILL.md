---
name: schedule-meeting
description: Schedule a meeting or block focus time through conversation. Finds mutual availability and books the event.
triggers:
  - schedule a meeting
  - book time with
  - set up a call
  - 1:1 with
  - find time with
  - book a meeting
  - block time
  - focus time
primitives:
  - User
work_type: operations
category: essential
intelligence:
  - entity_resolution
---

# Schedule Meeting Skill

Schedule a meeting with someone or block focus time through natural conversation. Finds mutual availability via FreeBusy, presents options, and books the event with a single letter response.

## When to Use

- "Schedule a meeting with Sarah"
- "Book time with John tomorrow"
- "1:1 with Alex next week"
- "Find time with the design team"
- "Set up a call with Jane for 30 minutes"
- "Block 2 hours for focus time"
- "Book focus time tomorrow morning"

## Workflow

### 1. Parse Request

Extract from the user's request:

| Element | Default | Examples |
|---------|---------|----------|
| **Person** | None (block time if missing) | "Sarah", "John Smith", "sarah@example.com" |
| **Time preference** | Today + 2 days | "today", "tomorrow", "next week", "Monday" |
| **Duration** | 30 minutes | "30-min sync", "hour-long meeting", "2 hours" |
| **Meeting type** | Inferred or ask | "1:1", "sync", "call", "meeting" |

**Time preference mapping**:
- No time preference → search today + 2 days (3 days total)
- "today" → today only (1 day)
- "tomorrow" → tomorrow only (1 day)
- "next week" → Monday through Friday of next week (5 days)

**Duration extraction**:
- "30-min" / "30 minute" → 30
- "hour" / "1 hour" / "hour-long" → 60
- "90 minutes" / "1.5 hours" → 90
- "2 hours" → 120

**Detect block time**: If no person is mentioned and the request sounds like personal time (focus time, deep work, heads down, block time), use the Block Time Flow.

### 2. Block Time Flow (no person)

When the user wants to block time for themselves:

1. **Confirm details** if not specified:
   - "What time would you like to block? (e.g., 'tomorrow 9am' or '2pm for 2 hours')"

2. **Create the event**:
   ```bash
   arete calendar create --title "<title>" --start "<time>" --duration <minutes>
   ```

3. **Confirm**:
   ```
   ✅ Blocked: Focus Time at Mon, Feb 26, 9:00 AM CT (2 hours)
   Calendar link: <url>
   ```

Skip to Step 6 (Confirm).

### 3. Meeting Flow — Resolve Person

When a person is specified:

1. **Resolve to email**:
   ```bash
   arete resolve "<person>" --type person --json
   ```

2. **Handle results**:
   - **Single match** → proceed with that email
   - **Multiple matches** → ask user to clarify: "I found multiple people named Sarah. Which one? Sarah Chen (sarah.chen@company.com) or Sarah Miller (sarah.m@example.com)?"
   - **No match** → ask: "I couldn't find [person] in your contacts. What's their email address?"

### 4. Meeting Flow — Find Availability

1. **Calculate days** based on time preference (see Step 1).

2. **Find mutual availability**:
   ```bash
   arete availability find --with <email> --days <N> --duration <D> --limit 3 --json
   ```

3. **Present options** with letter selection:
   ```
   Available times with Sarah:
   A) Mon, Feb 26, 2:00 PM CT (30 min)
   B) Tue, Feb 27, 10:00 AM CT (30 min)
   C) Wed, Feb 28, 3:30 PM CT (30 min)
   
   Which slot works? (A/B/C)
   ```

   **Time format**: Always include timezone abbreviation (CT, ET, PT, etc.).

4. **Handle no availability**:
   ```
   No mutual availability found with Sarah in the next 3 days.
   Would you like me to:
   - Check a different time range?
   - Send a scheduling link instead?
   ```

### 5. Handle User Response

**Parse the response**:
- Case-insensitive: "a" = "A"
- Trim whitespace and punctuation: " A. " → "A"
- Accept: A, B, C (matching the presented options)
- Accept: "none", "cancel", "nevermind" → cancel gracefully

**If invalid response**:
```
I didn't catch that. Please pick A, B, or C (or type 'none' to cancel).
```

Re-prompt up to 2 times, then offer to start over.

### 6. Create Event

1. **Generate title**:
   - Use meeting type from request: "1:1 with Sarah", "Sync with John", "Call with Jane"
   - If ambiguous, use: "Meeting with [Name]"
   - For block time: use the user's description ("Focus Time", "Deep Work", etc.)

2. **Create the event**:
   ```bash
   arete calendar create --title "<title>" --with <email> --start "<ISO time>" --duration <minutes> --json
   ```

3. **Parse response** for success or error.

### 7. Confirm

**On success**:
```
✅ Booked: 1:1 with Sarah
   📅 Mon, Feb 26, 2:00 PM CT (30 min)
   📧 Invite sent to sarah@example.com
   🔗 Calendar link: <url>
```

**On error**:
- Auth error → "Calendar not configured. Run: arete integration configure google-calendar"
- API error → Show the error message, offer to retry
- Unknown error → "Something went wrong. Would you like to try again?"

## Examples

### Example 1: Simple scheduling

**User**: "1:1 with Sarah tomorrow"

**Agent**:
1. Parse: person=Sarah, time=tomorrow, duration=30min, type=1:1
2. Resolve: `arete resolve "Sarah" --type person --json` → sarah@example.com
3. Find: `arete availability find --with sarah@example.com --days 1 --duration 30 --limit 3 --json`
4. Present:
   ```
   Available times with Sarah:
   A) Tue, Feb 27, 10:00 AM CT (30 min)
   B) Tue, Feb 27, 2:00 PM CT (30 min)
   
   Which slot works? (A/B)
   ```

**User**: "A"

**Agent**:
1. Create: `arete calendar create --title "1:1 with Sarah" --with sarah@example.com --start "2026-02-27T10:00:00" --duration 30 --json`
2. Confirm: "✅ Booked: 1:1 with Sarah at Tue, Feb 27, 10:00 AM CT"

### Example 2: Block time

**User**: "Block 2 hours for focus time tomorrow morning"

**Agent**:
1. Parse: no person (block time), time=tomorrow morning, duration=120min, title=Focus Time
2. Create: `arete calendar create --title "Focus Time" --start "2026-02-27T09:00:00" --duration 120 --json`
3. Confirm: "✅ Blocked: Focus Time at Tue, Feb 27, 9:00 AM CT (2 hours)"

### Example 3: Flexible time range

**User**: "Schedule a sync with John"

**Agent**:
1. Parse: person=John, time=default (today+2 days), duration=30min, type=sync
2. Resolve: `arete resolve "John" --type person --json` → john@example.com
3. Find: `arete availability find --with john@example.com --days 3 --duration 30 --limit 3 --json`
4. Present options...

## Error Handling

| Scenario | Response |
|----------|----------|
| Person not found | Ask for email or clarification |
| No availability | Offer to check different range or send scheduling link |
| Calendar not configured | Direct to: `arete integration configure google-calendar` |
| Invalid slot selection | Re-prompt: "Please pick A, B, or C (or type 'none' to cancel)" |
| API error | Show error, offer to retry |

## References

- **CLI Commands**: `arete calendar create`, `arete availability find`, `arete resolve`
- **Related Skills**: [meeting-prep](../meeting-prep/SKILL.md), [daily-plan](../daily-plan/SKILL.md)
- **Patterns**: [PATTERNS.md](../PATTERNS.md) — entity resolution
