# Calendar Integration UX Fixes and Build-Memory Learnings

**Date**: 2026-02-11

## What Changed

1. **icalBuddy binary name** (earlier fix): Homebrew formula is `ical-buddy` but the installed binary is `icalBuddy` (camelCase). Code was checking/invoking `ical-buddy`; updated detection and execution to use `icalBuddy` everywhere (provider, integration configure, pull-calendar, tests).

2. **Calendar list parsing**: `icalBuddy calendars` outputs multi-line blocks per calendar (e.g. `• Reminders`, `type: CalDAV`, `UID: ...`). List was previously split by newline so every line became an option. Now we parse: only lines starting with `• ` are calendar names; drop metadata lines.

3. **Checkbox UX**: Replaced "numbered list + comma-separated numbers or all" with a single inquirer **checkbox** prompt (like `arete setup` and `arete seed`): "Which calendars should Areté include?" with all calendars checked by default.

4. **pageSize**: Checkbox showed ~5–6 items at a time. Added `pageSize: 12` so at least 10 visible without scrolling as much.

## Context: The Miss

The arete setup flow has a polished CLI (checkbox for integrations, clear prompts). The calendar integration had:
- Wrong binary name (ical-buddy vs icalBuddy) → "not found" despite icalBuddy installed
- Raw icalBuddy output shown as options (bullets, type, UID lines)
- Number-based selection instead of checkbox

User reported the bugs and asked for parity. The agent fixed the issues well but:
- **Did not add an entry** — so the change and rationale weren’t in build memory.
- **Did not capture learnings** — so the pattern ("match setup/seed UX when doing integration flows; record it") wasn’t written down for future sessions.

Result: the same kind of miss could repeat (e.g. another integration with subpar CLI and no entry/learnings).

## Learnings

- **CLI: use established patterns, not bare minimum** (major): Whenever we are updating or adding CLI features, we should use **established design patterns and experience** (e.g. setup, seed) rather than the bare minimum or whatever the agent wants. Calendar had number-based selection and raw output because the agent didn't check how similar flows work; the fix was to match setup/seed (checkbox, parsing, pageSize). Default to existing patterns first; don't invent a lesser UX.
- **UX parity for similar flows**: When adding or fixing integration/CLI flows, check existing flows first. Setup and seed use checkbox + clear copy; calendar (and any similar "pick from a list" flow) should match that quality. Don’t ship a worse UX for the same interaction type.
- **Entries after meaningful fixes**: Bug fixes or UX improvements that close a real gap (especially when the user had to ask) are entry-worthy. Add a dated entry and index it in MEMORY.md so future work can see what was fixed and why.
- **Learnings section**: Use the **Learnings** section in entries to record process/collaboration observations, not just code facts. "Match setup UX for integration flows" and "add entry when fixing a reported gap" are learnings that reduce repeat mistakes.
- **icalBuddy detail**: Homebrew formula = `ical-buddy`; binary = `icalBuddy` (camelCase). Use `icalBuddy` for `which` and `execFile`; keep "brew install ical-buddy" in messages.
