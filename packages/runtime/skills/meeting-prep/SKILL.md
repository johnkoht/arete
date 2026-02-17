---
name: meeting-prep
description: Build a prep brief for an upcoming (or past) meeting. Use when the user wants to prepare for a meeting, get context before a call, or refresh after a meeting.
triggers:
  - meeting prep
  - prep for meeting
  - prep me for
  - call with
  - meeting prep for
primitives:
  - User
  - Problem
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
---

# Meeting Prep Skill

Build a prep brief for a meeting: attendee details, recent meetings, related projects, open action items, and suggested talking points. Uses the **get_meeting_context** intelligence pattern.

## Agent Instructions

**When the user asks for meeting prep** (e.g. "prep me for my meeting with Jane", "call with Acme"):

1. **Use this skill** — Execute this workflow. Do not substitute ad-hoc grep/read only; use the get_meeting_context pattern.
2. **Use QMD when available** — Run `qmd query "..."` to find related decisions/learnings; incorporate into the brief (step 6 of the pattern).
3. **If the user asks what you used** — Report: "I used the **meeting-prep** skill (get_meeting_context pattern), person/meeting/project reads, and QMD for related context."

## When to Use

- "Prep for my meeting with Jane"
- "I have a call with Acme in 30 minutes"
- "Meeting prep for Product Review"
- Before or after a meeting to refresh context

## Gather Context

Run the **get_meeting_context** pattern — see [PATTERNS.md](../PATTERNS.md). Inputs: meeting title (optional), attendee names or slugs. Outputs: attendee details, recent meetings, related projects, outstanding action items, and person memory highlights (if present). Include QMD queries (step 6) for decisions/learnings involving the attendee or topic.

## Workflow

### 1. Identify Meeting

- User provides: meeting title and/or attendee names.
- If not provided, ask: "Which meeting? Please share the title and/or attendee names."
- No calendar integration in v1; user supplies title/attendees.

### 2. Gather Context

Run **get_meeting_context** (see PATTERNS.md). Use the outputs to build the brief.

### 3. Build Prep Brief

Output markdown:

```markdown
## Prep: [Meeting Title]

### Attendees
- **Name** — Role, Company | Last met: YYYY-MM-DD (or "No prior meetings")
- **Memory highlight** — Repeated asks/concerns from prior meetings (if available)

### Recent Meetings
- YYYY-MM-DD — [Meeting title] — Brief summary

### Related Projects
- [Project name] — Brief status / link

### Open Action Items
- [ ] Item from meeting with [attendee]
- [ ] ...

### Suggested Talking Points
- Follow up on [X] from last meeting
- Share update on [Y]
- Ask about [Z]
```

Keep it concise and prep-focused.

### 4. Close

- Offer to save the brief to a note or scratchpad if useful.
- Suggest **process-meetings** after the meeting to propagate attendees and extract decisions.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **People**: `people/` (internal, customers, users)
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `attendees`)
- **Projects**: `projects/active/` READMEs (`stakeholders`)
- **Related**: process-meetings, daily-plan
