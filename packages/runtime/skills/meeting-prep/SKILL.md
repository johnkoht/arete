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

**Commitments**: Commitments appear inline in the person's memory section — no separate CLI call needed. The existing `arete people show <slug> --memory` call already surfaces them.

## Workflow

### 1. Identify Meeting

- User provides: meeting title and/or attendee names.
- If meeting identity is ambiguous, try calendar first:
  - Run `arete pull calendar --today --json`.
  - If events are available, present a concise selectable list (time + title + attendees if present).
  - Ask user to pick one meeting to prep.
- If no calendar data or calendar is unavailable, ask: "Which meeting? Please share the title and/or attendee names."

### 2. Lazy Refresh Person Memory (stale-aware)

After attendee slugs are resolved, refresh only if stale/missing:

- For each attendee, run:
  - `arete people memory refresh --person <slug> --if-stale-days 3`
- If many attendees (e.g. 5+), ask before refreshing all: "Refresh person memory highlights now?"
- If refresh fails, continue prep with existing person context (fail-open).

### 3. Gather Context

Run **get_meeting_context** (see PATTERNS.md). Use the outputs to build the brief.

### 4. Relationship Intelligence Analysis

Using the person profiles and context already gathered by **get_meeting_context** (do NOT re-run `arete people show`), apply the **relationship_intelligence** pattern from PATTERNS.md for each attendee who has a person profile:

1. **Review known relationship state** — Note current stances (strength/direction), open items, relationship health score, last interaction date from the people context already in hand.
2. **Compare against recent meeting content** — Identify new or shifted stances, resolved items, and positive/negative health signals since the last recorded interaction.
3. **Assess trajectory** — Is the relationship strengthening, stable, or weakening? Are concerns accumulating?
4. **Generate prep recommendations** — Topics to address proactively, wins to acknowledge, questions to ask, and recommended approach (direct vs. exploratory) for each key attendee.

Collect the resulting intelligence insights; they populate the **Intelligence Insights** section of the brief.

### 5. Build Prep Brief

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

### Stances
For each attendee with person intelligence (via `arete people show <slug> --memory`):

- **[Name]**: [stance direction] on [topic] — _Source: [meeting date/title]_
- Example: "**Sarah**: Skeptical of timeline estimates — _Source: 2026-02-15 Sprint Review_"

### Open Items
Split by ownership:

**I owe them:**
- [ ] [Item description] — _Source: [meeting date/title]_

**They owe me:**
- [ ] [Item description] — _Source: [meeting date/title]_

### Relationship Health
For each key attendee:

- **[Name]**: [health indicator: strong/neutral/at-risk] | Last met: YYYY-MM-DD | Frequency: [weekly/biweekly/monthly/sporadic] | Open loops: N

### Suggested Talking Points
Generate from person intelligence and meeting history:

- Follow up on [open item from "I owe them" or "They owe me"]
- Be aware: [person] [stance] (e.g. "Be aware: Sarah is skeptical of timeline estimates")
- Share update on [Y]
- Ask about [Z]

### Intelligence Insights
Derived from the **relationship_intelligence** pattern (Step 4). One entry per attendee with a person profile:

- **Relationship changes since last meeting** — trajectory direction (strengthening / stable / weakening) and key evidence (e.g., "Architecture doc still overdue → health declining")
- **Topics needing proactive attention** — unresolved concerns or accumulating issues the builder should raise first
- **Recommended approach per attendee** — direct vs. exploratory, what to lead with, what to acknowledge, what to leverage

Example:

- **Sarah Chen** — WEAKENING (doc delay + workarounds). Lead with concrete architecture doc ETA. Acknowledge the block. Use webhook enthusiasm to rebuild goodwill.
- **Alex Rivera** — STABLE. No open items. Ask about Q2 planning to surface new priorities.
```

Keep it concise and prep-focused.

### 6. Close

- Offer to save the brief to a note or scratchpad if useful.
- Suggest **process-meetings** after the meeting to propagate attendees and extract decisions.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **Pattern**: [PATTERNS.md](../PATTERNS.md) — relationship_intelligence
- **People**: `people/` (internal, customers, users)
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `attendees`)
- **Projects**: `projects/active/` READMEs (`stakeholders`)
- **Related**: process-meetings, daily-plan
