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
  - area_context
---

# Meeting Prep Skill

Build a prep brief for a meeting: attendee details, recent meetings, related projects, open action items, and suggested talking points. Uses the **get_meeting_context**, **get_area_context**, and **relationship_intelligence** patterns.

## Agent Instructions

**When the user asks for meeting prep** (e.g. "prep me for my meeting with Jane", "call with Acme"):

1. **Use this skill** — Execute this workflow. Do not substitute ad-hoc grep/read only; use the get_meeting_context and get_area_context patterns.
2. **Use QMD when available** — Run `qmd query "..."` to find related decisions/learnings; incorporate into the brief (step 6 of the pattern).
3. **If the user asks what you used** — Report: "I used the **meeting-prep** skill (get_meeting_context + get_area_context patterns), person/meeting/project reads, and QMD for related context."
4. **Area context enrichment** — For recurring meetings like "CoverWhale Sync", automatically look up and include area context (Focus, Goals, Horizon) from the matched area file.

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

### 2. Area Context Lookup

Use the **get_area_context** pattern (see [PATTERNS.md](../PATTERNS.md)) to identify if this meeting belongs to a persistent work area:

1. **Match meeting to area** — Call `AreaParserService.getAreaForMeeting(meetingTitle)`:
   - Uses case-insensitive substring matching against `recurring_meetings[].title` in area files
   - Returns `AreaMatch | null`: `{ areaSlug: string; matchType: 'recurring' | 'inferred'; confidence: number }`

2. **When area found** — Call `AreaParserService.getAreaContext(areaSlug)` to retrieve:
   - `focus` — Current priorities and active work streams
   - `goal` — Linked goals for this area
   - `horizon` — Upcoming work and future priorities
   - Store these for inclusion in the brief (Step 6)

3. **When area not found** — For recurring meetings (detected by title pattern or user indication):
   - Prompt user: "This appears to be a recurring meeting. Would you like to associate it with an area?"
   - If yes, offer to either:
     - Select from existing areas: list `areas/*.md` files
     - Create a new area: `arete create area <slug>`
   - For one-off meetings, proceed without area context (no prompt needed)

**Example**: Meeting title "CoverWhale Sync" → matches `areas/glance-communications.md` → auto-pulls Glance Communications context (Focus, Goals, Horizon).

### 3. Lazy Refresh Person Memory (stale-aware)

After attendee slugs are resolved, refresh only if stale/missing:

- For each attendee, run:
  - `arete people memory refresh --person <slug> --if-stale-days 3`
- If many attendees (e.g. 5+), ask before refreshing all: "Refresh person memory highlights now?"
- If refresh fails, continue prep with existing person context (fail-open).

### 4. Gather Context

Run **get_meeting_context** (see [PATTERNS.md](../PATTERNS.md)). Use the outputs to build the brief.

### 4.5. Search Related Memory

Search for past decisions and learnings related to this meeting.

1. **Extract search terms**:
   - Meeting topic keywords (e.g., "CoverWhale compliance", "roadmap review")
   - Each key attendee name

2. **Run searches**:
   ```bash
   arete search "<meeting topic>" --scope memory --limit 3
   arete search "<attendee name>" --scope memory --limit 2
   ```
   Run for each key attendee (cap at 3 attendees to avoid noise).

3. **Filter for relevance**:
   - Keep only items that directly inform this meeting
   - Prioritize recent decisions (last 30 days)
   - Skip generic matches that don't add prep value

4. **Include in prep brief**:
   - Add findings under a "Related Memory" section (see Step 6)
   - Keep concise: 2-4 items max

5. **Empty results**: If no relevant memory found, omit the "Related Memory" section entirely. Don't say "nothing found."

### 4.7. Email Context (Optional — requires Google Workspace)

If Google Workspace integration is active, enrich the prep brief with recent email context for each attendee.

1. **Check integration status**:
   ```bash
   arete integration list --json
   ```
   Look for `google-workspace` with `status: 'active'`. If not active, skip this step entirely — meeting-prep works without it.

2. **Search for attendee email threads**:
   For each attendee with a known email address (from their person profile), search for recent threads:
   ```bash
   arete pull gmail --query "from:<email> OR to:<email>" --days 14 --json
   ```
   Cap at 3 attendees to avoid excessive API calls.

3. **Filter for relevance**:
   - Keep only threads that appear related to the meeting topic (match subject or snippet against meeting title/keywords)
   - Discard automated notifications, newsletters, or unrelated threads
   - Keep at most 3-5 threads per attendee

4. **Include in prep brief**:
   Add a `## Recent Email Context` section (see Step 6) with relevant threads grouped by attendee:
   ```markdown
   ### Recent Email Context
   _Sourced from Gmail — last 14 days_

   **Jane Smith** (jane@example.com):
   - 2026-04-01 — **Re: Roadmap Q2** — "Here's the updated timeline..."
   - 2026-03-28 — **Budget Approval** — "Approved the $50k allocation for..."

   **Alex Rivera** (alex@example.com):
   - 2026-03-30 — **Sprint Review Notes** — "Key decisions from Friday's review..."
   ```

5. **Empty results**: If no relevant email threads are found for any attendee, omit the section entirely. Do not mention that email was checked.

### 5. Relationship Intelligence Analysis

Using the person profiles and context already gathered by **get_meeting_context** (do NOT re-run `arete people show`), apply the **relationship_intelligence** pattern from PATTERNS.md for each attendee who has a person profile:

1. **Review known relationship state** — Note current stances (strength/direction), open items, relationship health score, last interaction date from the people context already in hand.
2. **Compare against recent meeting content** — Identify new or shifted stances, resolved items, and positive/negative health signals since the last recorded interaction.
3. **Assess trajectory** — Is the relationship strengthening, stable, or weakening? Are concerns accumulating?
4. **Generate prep recommendations** — Topics to address proactively, wins to acknowledge, questions to ask, and recommended approach (direct vs. exploratory) for each key attendee.

Collect the resulting intelligence insights; they populate the **Intelligence Insights** section of the brief.

### 6. Build Prep Brief

Output markdown:

```markdown
## Prep: [Meeting Title]

### Area Context
_Include this section only when an area was matched in Step 2._

**Area**: [Area Name] (areas/[slug].md)

**Focus**:
[Summary from area's Focus section — 2-3 key priorities and active work streams]

**Goals**:
- [Goal name](link) — one-liner
_(Show goals from the area)_

**Horizon**:
- [Upcoming work or next phase]
_(Show upcoming work from the area)_

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

### Related Memory
_Include only when relevant items were found in Step 4.5. Omit section if empty._

- **Decision** [YYYY-MM-DD]: [Relevant decision for this meeting]
- **Learning** [YYYY-MM-DD]: [Relevant learning for this meeting]

### Recent Email Context
_Include only when GWS is active and relevant threads were found in Step 4.7. Omit section if empty._

**[Attendee Name]** ([email]):
- YYYY-MM-DD — **[Subject]** — "[snippet]"

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

### 7. Close

- Offer to save the brief to a note or scratchpad if useful.
- Suggest **process-meetings** after the meeting to propagate attendees and extract decisions.
- If an area was associated, remind user that decisions/learnings from this meeting can be routed to the area via process-meetings.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_area_context
- **Pattern**: [PATTERNS.md](../PATTERNS.md) — relationship_intelligence
- **People**: `people/` (internal, customers, users)
- **Meetings**: `resources/meetings/` (frontmatter: `attendee_ids`, `attendees`)
- **Projects**: `projects/active/` READMEs (`stakeholders`)
- **Areas**: `areas/*.md` (recurring meeting mappings, area context)
- **Related**: process-meetings, daily-plan
