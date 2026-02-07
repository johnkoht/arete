---
name: meeting-prep
description: Build a prep brief for an upcoming (or past) meeting. Use when the user wants to prepare for a meeting, get context before a call, or refresh after a meeting.
triggers:
  - meeting prep
  - prep for meeting
  - prep me for
  - call with
  - meeting prep for
---

# Meeting Prep Skill

Build a prep brief for a meeting: attendee details, recent meetings with those people, related projects, open action items, and suggested talking points. Uses the get_meeting_context pattern.

## Agent Instructions

**When the user asks for meeting prep** (e.g. "prep me for my meeting with Jane", "call with Acme", "meeting prep for Product Review"):

1. **Use this skill** — Read and execute this skill's workflow. Do not substitute ad-hoc grep/read only; follow the get_meeting_context pattern and steps below.
2. **Use QMD when available** — Run `qmd query "..."` (or `qmd search` / `qmd vsearch`) to find related decisions, learnings, and context; incorporate into the brief (see "QMD" in Gather Context).
3. **If the user asks what you used** — Report: "I used the **meeting-prep** skill (get_meeting_context pattern), read person/meeting/project files, and ran QMD queries for related decisions/learnings where applicable."

## When to Use

- "Prep for my meeting with Jane"
- "I have a call with Acme in 30 minutes"
- "Meeting prep for Product Review"
- Before or after a meeting to refresh context

## Get Meeting Context (Pattern)

Before building the brief, gather context for the meeting. This pattern is shared with the **daily-plan** skill.

**Inputs**: Meeting title (optional), attendee names or slugs.

**Steps**:

1. **Resolve attendees** — Match names to people slugs (search `people/` by name, or use slug directly). Optionally run `qmd query "[attendee name] person"` to find the right person file.
2. **Read person files** — For each attendee: `people/{internal|customers|users}/{slug}.md`. Extract name, role, company, and any action items or notes in the person file.
3. **Search meetings** — List `resources/meetings/*.md`. Filter where frontmatter `attendee_ids` includes attendee slugs, or body/attendees list mentions their names. Sort by date descending; take 1–3 most recent.
4. **Read projects** — Scan `projects/active/` READMEs. Find projects where `stakeholders` or body mentions attendee names/slugs.
5. **Extract action items** — From recent meetings with attendees: look for "## Action Items" or similar; collect unchecked items (e.g. `- [ ] ...`). Prefer items that reference the attendee or "For me" / "Follow up".
6. **QMD (optional but recommended)** — Run QMD to surface related institutional memory and context. Execute in shell, then use results in the brief:
   - `qmd query "decisions or learnings involving [attendee name] or [company]"`
   - `qmd query "meetings or notes about [project topic]"`
   - Include any relevant decisions, learnings, or past context in "Suggested talking points" or a short "Related context" line.

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

Run the **get_meeting_context** pattern above. Resolve attendees, read people, meetings, projects; extract action items. **Run QMD queries** (step 6 of the pattern) to pull in decisions/learnings that mention the attendee or meeting topic; incorporate into the brief.

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
- **QMD**: Run `qmd query "..."` for semantic search across context, memory, projects (see SETUP.md if QMD not configured).
- **Related**: process-meetings, daily-plan
