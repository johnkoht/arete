---
name: prepare-meeting-agenda
description: Create a structured meeting agenda with type-based sections and optional time allocation. Use when the user wants to build an agenda document for an upcoming meeting (leadership, customer, dev team, 1:1, or other).
triggers:
  - meeting agenda
  - create agenda
  - prepare agenda
  - agenda for
  - build agenda
  - create meeting agenda
  - prepare meeting agenda
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
requires_briefing: false
---

# Prepare Meeting Agenda Skill

Produce a **structured meeting agenda** (sections, optional time allocation) for an upcoming meeting. Choose or infer meeting type, load a template, optionally pull in context for suggested items, then build and save the agenda.

## When to Use

- "Create a meeting agenda for my 1:1 with Jane"
- "Prepare an agenda for the leadership sync"
- "Build an agenda for this customer call"
- When the user wants a **document** they can save or share (not just a prep brief)

## Related: meeting-prep

- **meeting-prep**: Builds a **prep brief** (attendees, recent meetings, action items, talking points). Use when the user says "prep me for my meeting with Jane" or "call with Acme".
- **prepare-meeting-agenda**: Builds a **structured agenda document** with sections and time allocation. Use when the user says "create an agenda" or "prepare an agenda for this meeting".

Use **meeting-prep** for context and talking points; use **prepare-meeting-agenda** when the deliverable is an agenda document to save or share.

## Workflow

### 1. Identify Meeting

- If calendar is configured: run `arete pull calendar --today --json` (or `--days 7`) and list events; user picks one. Use event title, duration, and attendees.
- Otherwise: ask for meeting title, date, duration (optional), and attendee names.

### 2. Select or Infer Meeting Type

Use the **context inference rules** below to suggest a type. User can override.

| Type        | Title / context signals                    | Attendee signals                    |
|------------|---------------------------------------------|-------------------------------------|
| 1:1        | "1:1", "one-on-one", "1:1 with", "check-in" | Single attendee                     |
| leadership | "leadership", "exec", "sync", "staff"        | Multiple; exec/staff                |
| customer   | "customer", "QBR", "partner", "client"      | External domain / customers/       |
| dev-team   | "dev", "engineering", "sprint", "standup"    | Engineering / dev                  |
| other      | (default)                                   | No strong signal                   |

### 3. Choose Template

- Default for the selected type is loaded from package templates (or workspace override in `.arete/templates/meeting-agendas/`).
- To list all: run `arete template list meeting-agendas`. To view a template: `arete template view meeting-agenda --type <type>`.
- If user wants a different type, switch and reload template.

### 4. Optionally Gather Context

- For suggested agenda items: run the **get_meeting_context** pattern (see [PATTERNS.md](../PATTERNS.md)) with the meeting’s attendees.
- Use outputs (recent meetings, open action items, related projects) to suggest bullets under the template sections. Do not reimplement calendar or context logic; use existing commands and patterns only.

### 5. Build Agenda

- Start from the template’s ## sections.
- If duration is known, apply **time allocation** from the template (e.g. "Updates (10 min)").
- Inject any suggested items from context into the right sections.
- Output format (see below): `# Meeting Agenda: [Title]`, metadata, ## sections with optional (Xmin), bullets and checkboxes.

### 6. Review and Adjust

- Present the draft. Offer to add, remove, or reorder items. (Inline section customization is out of scope for v1; document the workflow only.)

### 7. Save or Copy

- Offer to save to: `now/agendas/YYYY-MM-DD-meeting-title.md` (primary), or `projects/active/[project]/agendas/[title].md` if project-specific, or copy to clipboard only.
- Suggest running **process-meetings** after the meeting to capture notes and propagate decisions/learnings.

## Output Format

Produce markdown in this shape:

```markdown
# Meeting Agenda: [Title]

- **Date**: YYYY-MM-DD
- **Duration**: [X min] (if known)
- **Attendees**: [names]
- **Type**: [leadership | customer | dev-team | one-on-one | other]

## [Section 1] (Xmin)
- Bullet or suggested item
- [ ] Action item if applicable

## [Section 2] (Xmin)
...
```

Use template section names and optional time from template’s `time_allocation` when duration is known.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context (for suggested items)
- **Calendar**: `arete pull calendar --today --json` or `--days N`
- **Templates**: `arete template list meeting-agendas`, `arete template view meeting-agenda --type <type>`
- **Save location**: `now/agendas/` (primary); project folder or clipboard as alternatives
- **Related skills**: meeting-prep (prep brief), process-meetings (run after the meeting)
