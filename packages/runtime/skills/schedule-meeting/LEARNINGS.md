# Schedule-Meeting Skill — Learnings

UX patterns and decisions from building the schedule-meeting skill.

---

## UX Patterns

### 1. Numbered slots grouped by day (not letters)

**Before**: `A) Mon 2pm, B) Tue 10am, C) Tue 1pm`

**After**:
```
Tomorrow (Mon, Feb 26):
1) 2:00 PM CT

Tuesday (Feb 27):
2) 10:00 AM CT
3) 1:00 PM CT
```

**Why**: Grouping by day is easier to scan. Numbers are more natural to type than letters. "Tomorrow" as a header provides quick orientation.

### 2. Follow-up question for meeting agenda

After booking, ask: "Would you like me to prepare a meeting agenda?"

**Why**: Completes the booking→prep flow without requiring user to remember to do it. Links to existing meeting-prep and prepare-meeting-agenda skills.

### 3. Block time is a separate flow

When no person is mentioned and request sounds like personal time (focus, deep work), skip FreeBusy entirely.

**Why**: FreeBusy requires another calendar to check against. Block time is just for the user — simpler flow, no external dependencies.

---

## Implementation Notes

### CLI commands used

- `arete resolve "<person>" --type person --json` — entity resolution
- `arete availability find --with <email> --days N --duration D --limit 3 --json` — FreeBusy
- `arete calendar create --title "..." --with <email> --start "..." --duration N --json` — event creation

### Response parsing

Keep it simple:
- Trim whitespace and punctuation
- Numbers only (1, 2, 3) — not letters
- "none", "cancel", "nevermind" to exit
- Re-prompt up to 2 times, then offer to start over

---

## References

- Related skills: [meeting-prep](../meeting-prep/SKILL.md), [prepare-meeting-agenda](../prepare-meeting-agenda/SKILL.md)
- CLI: `arete calendar create --help`
