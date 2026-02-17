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

Produce a **structured meeting agenda** (sections, optional time allocation) for an upcoming meeting. Choose or infer meeting type, load a template, gather context when it adds value (see step 4), then build and save the agenda.

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

**Load agenda template** — run this command (replace `{type}` with `one-on-one`, `leadership`, `customer`, `dev-team`, or `other`) and use its output as the agenda structure. Do not add sections from elsewhere:
```
arete template resolve --skill prepare-meeting-agenda --variant {type}
```
The command output defines the complete section structure. If the user wants a different type, switch and re-run the command.

### 4. Gather Context When It Adds Value

**Default: gather context** so the agenda can include suggested items (recent topics, open action items, related projects).

- Run the **get_meeting_context** pattern (see [PATTERNS.md](../PATTERNS.md)) with the meeting's attendees and use its outputs to suggest bullets under the template sections.
- If attendees are known/resolved, run stale-aware refresh before using highlights:
  - `arete people memory refresh --person <slug> --if-stale-days 3`
- Check attendee person files for `## Memory Highlights (Auto)` and call out recurring asks/concerns as suggested agenda items.
- If attendees are unknown, skip refresh and proceed with template-only agenda.
- **Meetings index** — Read `resources/meetings/index.md` for high-level themes: recent meeting titles and dates often surface recurring topics, priorities, or follow-ups to include as agenda ideas.
- **Latest meetings** — Read the latest 2–3 meeting files (by filename date) for summaries and key points; use them to suggest agenda items (e.g. follow-ups, open threads, decisions to revisit).

**Gather context when** (proactive; don't wait for the user to ask):
- The meeting has a specific purpose (e.g. kickoff, strategic planning, two teams meeting, "get things in motion").
- The user named attendees or teams — resolve them and pull their context.
- Multiple attendees or cross-group meeting — context is especially valuable.
- Planning/strategy files are relevant (e.g. `goals/quarter.md`, `now/week.md` open or referenced) — read them and align suggested items.
- The user gave more than a generic "create an agenda" (e.g. "agenda for the Acme kickoff tomorrow").

**Skip context only when**: No attendees are identified and the user explicitly wants a blank template, or the user says they only want the template structure with no suggested items.

Do not reimplement calendar or context logic; use existing commands and patterns only.

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
- **Meetings**: `resources/meetings/index.md` (high-level themes); latest 2–3 files in `resources/meetings/` (summaries, key points for agenda ideas)
- **Calendar**: `arete pull calendar --today --json` or `--days N`
- **Templates**: `arete template list meeting-agendas`, `arete template view meeting-agenda --type <type>`
- **Save location**: `now/agendas/` (primary); project folder or clipboard as alternatives
- **Related skills**: meeting-prep (prep brief), process-meetings (run after the meeting)
