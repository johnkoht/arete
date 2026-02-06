---
name: meeting-prep
description: Build a prep brief for an upcoming (or past) meeting. Use when the user wants to prepare for a meeting, get context before a call, or refresh after a meeting.
---

# Meeting Prep Skill

Build a prep brief for a meeting: attendee details, recent meetings with those people, related projects, open action items, and suggested talking points. Uses the get_meeting_context pattern.

## When to Use

- "Prep for my meeting with Jane"
- "I have a call with Acme in 30 minutes"
- "Meeting prep for Product Review"
- Before or after a meeting to refresh context

## Get Meeting Context (Pattern)

Before building the brief, gather context for the meeting. This pattern is shared with the **daily-plan** skill.

**Inputs**: Meeting title (optional), attendee names or slugs.

**Steps**:

1. **Resolve attendees** — Match names to people slugs (search `people/` by name, or use slug directly).
2. **Read person files** — For each attendee: `people/{internal|customers|users}/{slug}.md`. Extract name, role, company.
3. **Search meetings** — List `resources/meetings/*.md`. Filter where frontmatter `attendee_ids` includes attendee slugs, or body/attendees list mentions their names. Sort by date descending; take 1–3 most recent.
4. **Read projects** — Scan `projects/active/` READMEs. Find projects where `stakeholders` or body mentions attendee names/slugs.
5. **Extract action items** — From recent meetings with attendees: look for "## Action Items" or similar; collect unchecked items (e.g. `- [ ] ...`). Prefer items that reference the attendee or "For me" / "Follow up".

**Outputs** (for skill use):
- Attendee details (name, role, company, last met date)
- Recent meetings (1–3 with brief summary)
- Related projects (where they're stakeholders)
- Outstanding action items
- Prep suggestions (derived from above)

## Workflow

### 1. Identify Meeting

- User provides: meeting title and/or attendee names.
- If not provided, ask: "Which meeting? Please share the title and/or attendee names."
- Note: No calendar integration in v1; user supplies title/attendees.

### 2. Gather Context

Run the **get_meeting_context** pattern above. Resolve attendees, read people, meetings, projects; extract action items.

### 3. Build Prep Brief

Output markdown:

```markdown
## Prep: [Meeting Title]

### Attendees
- **Name** — Role, Company | Last met: YYYY-MM-DD (or "No prior meetings")

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

Keep it concise and prep-focused. User can ask for more or less detail.

### 4. Close

- Offer to save the brief to a note or scratchpad if useful.
- Suggest **process-meetings** after the meeting to propagate attendees and extract decisions.

## References

- **People**: `people/` (internal, customers, users)
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `attendees`)
- **Projects**: `projects/active/` READMEs (`stakeholders`)
- **Related**: process-meetings, daily-plan
