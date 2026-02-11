# Feature: Prepare Meeting Agenda Skill

**Status**: Implemented (2026-02-11)  
**PRD**: [dev/prds/meeting-agenda-skill/prd.md](../prds/meeting-agenda-skill/prd.md)  
**Category**: Skill (planning / meeting intelligence)

## Summary

A dedicated skill to **create a meeting agenda** (not just prep context). Distinct from **meeting-prep**, which builds a brief (who, recent meetings, action items, talking points). This skill produces a structured agenda document, with:

1. **Context selector** — Meeting type (leadership, dev team, customer, 1:1, etc.) shapes the agenda template and suggested sections.
2. **Calendar-aware flow** (when integration exists) — "Which meeting?" → list from calendar → user picks → use title + attendees from invite; optionally resolve attendees to workspace people.
3. **Agenda output** — Sections, optional time allocation, and suggested items drawn from workspace context (get_meeting_context or lighter variant).

## Problem

Users can ask the agent to "create a meeting agenda" and get ad-hoc output. There is no skill that defines how to build an agenda, so quality and consistency vary. **meeting-prep** gives context *about* people and past meetings but does not produce an agenda document or account for meeting type (leadership vs customer vs dev team).

## Proposed Behavior

### 1. Which meeting?

- **If calendar is configured**: Run `arete pull calendar --today --json` (or upcoming days). Present list of events (title, time, attendees). User picks one. Use event title + attendees from invite; optionally enrich attendees via existing person resolution (as in pull-calendar).
- **If no calendar**: Ask user for meeting title and attendee names (same fallback as meeting-prep).

### 2. Context selector (meeting type)

- **Explicit**: "What type of meeting? (e.g. 1:1, leadership update, dev team sync, customer call, other)"
- **Optional inference**: From title/attendees (e.g. "Exec Sync" → leadership; single external domain → customer; "Eng" / "Dev" in title → dev team). Always allow user to override.

Meeting type drives **agenda template** and suggested sections, for example:

| Type        | Example sections / focus |
|------------|---------------------------|
| Leadership | Updates, decisions needed, asks, blockers |
| Dev team   | Tech topics, blockers, next sprint, decisions |
| Customer   | Discovery, objections, demo, next steps, follow-up |
| 1:1        | Check-in, growth, feedback, priorities, action items |
| Other      | Generic: objectives, discussion, action items, next steps |

### 3. Build agenda

- Optionally run **get_meeting_context** (or a lighter pass) for chosen attendees to suggest agenda items: open action items, recent topics, decisions to align on.
- Output a **structured agenda** (markdown): title, date/duration if known, sections with optional time allocation, and bullet items (suggested from context where relevant).
- Offer to save (e.g. to `resources/meetings/` as a draft agenda or to clipboard).

## Dependencies / reuse

- **Calendar**: `arete pull calendar --today --json` (and possibly `--days N` for upcoming). Existing `CalendarEvent` and pull-calendar’s enriched attendees (person slug, role, category) can inform context selector and person-aware suggestions.
- **People resolution**: Same as meeting-prep (attendee names/emails → people slugs; read person files).
- **Pattern**: get_meeting_context (PATTERNS.md) for suggested items; skill may use a lighter variant (e.g. only action items + last meeting) if full brief is not needed.
- **Skill router**: New triggers e.g. "meeting agenda", "create agenda", "prepare agenda", "agenda for meeting" so "create an agenda" routes here; "prep for meeting with Jane" continues to route to meeting-prep.

## Out of scope (for initial version)

- Automatic inference of meeting type from calendar event metadata (e.g. "1:1" in title) is optional; explicit selector is first-class.
- No new CLI command required; skill is agent-driven (calendar and context already exposed via existing commands and patterns).

## Acceptance criteria

- [ ] Skill file: `runtime/skills/prepare-meeting-agenda/SKILL.md` (or similar name) with description, triggers, workflow.
- [ ] Workflow: (1) identify meeting (calendar list or user input), (2) select or infer meeting type (context selector), (3) optionally gather context for attendees, (4) produce structured agenda with type-appropriate sections.
- [ ] Router: Triggers added so "create meeting agenda" / "prepare agenda for this meeting" route to this skill; meeting-prep still used for "prep for meeting with [name]".
- [ ] Documentation: PATTERNS.md or skill doc mentions when to use meeting-prep vs prepare-meeting-agenda; AGENTS.md updated if we add a new pattern.

## Notes

- **Naming**: "prepare-meeting-agenda" or "meeting-agenda" TBD; avoid overloading "meeting-prep."
- **Context selector** can be a simple list (leadership / dev team / customer / 1:1 / other) with room to add more types or make them configurable later.
- Calendar flow mirrors daily-plan: try calendar first, fall back to "list your meetings" or "title + attendees."
