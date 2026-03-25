---
name: daily-plan
description: Surface today's focus, week priorities, and meeting context for each of today's meetings. Use when the user wants a daily plan or "what's on my plate today".
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
  - area_context
---

# Daily Plan Skill

Build a daily plan: today's focus from week priorities, meeting context per meeting (who, what you owe, prep suggestions), commitments due, and carry-over. Uses the **get_meeting_context** and **get_area_context** patterns for each meeting.

> **Deprecated**: `now/today.md` is no longer created. Daily plan now writes directly to `now/week.md`.

## When to Use

- "What's on my plate today?"
- "Daily plan"
- "Today's focus"

## Gather Context for Meetings

For each of today's meetings:
1. Run the **get_meeting_context** pattern — see [PATTERNS.md](../PATTERNS.md). Use the outputs to summarize per meeting: who, what you owe them, 1–2 line prep suggestion.
2. Run the **get_area_context** pattern — see [PATTERNS.md](../PATTERNS.md). If the meeting maps to an area via `getAreaForMeeting()`, include area state (Current State section) in the daily focus.

## Workflow

### 1. Check Timing

- **After 6pm**: Default to planning for tomorrow
  - Confirm: "Planning for tomorrow (Wed 3/19)? [Y/n]"
  - Use confirmed date for calendar pull and section content

### 2. Check Week Plan Exists

- **If `now/week.md` does not exist**:
  - Prompt: "No week plan found. Run week-plan first, or continue with minimal plan?"
  - If continue: Create minimal `now/week.md` with just the Today's Plan section structure

### 3. Gather Context

- **Read** `now/week.md` (current week priorities).
- **Read** quarter goals from individual files: `goals/*.md` (excluding `strategy.md`) if needed for goal context.
  - Parse frontmatter to extract: `id`, `title`, `status`.
  - Filter to `status: active` goals.
- **Fallback**: If no individual goal files exist, read `goals/quarter.md` (legacy format).
- **Read** `now/scratchpad.md` for ad-hoc items.
- **Try Calendar (if configured)**: Run `arete pull calendar --today --json` (or `--tomorrow` if planning for tomorrow). If the command succeeds and returns events (check `success: true` and non-empty `events` array), use those as the meeting list and note the calendar names. If the command fails, returns no events, or is not configured, fall back to asking the user.
- **Ask** user for meetings (fallback if calendar unavailable): "List today's meetings (title + attendees) or say 'none'."
- **Open Commitments**: Run `arete commitments list` (unfiltered, all open). Surface relevant commitments. Filter by attendees in your context. Do NOT call `--person` per attendee (avoids N×M calls).

### 4. For Each Meeting

- Resolve attendee slugs and run stale-aware person memory refresh for relevant attendees:
  - `arete people memory refresh --person <slug> --if-stale-days 3`
- Run **get_meeting_context** (see [PATTERNS.md](../PATTERNS.md)). Summarize per meeting: who, what you owe them, 1–2 line prep suggestion.
- Add one concise stakeholder watchout when available from person memory highlights.

**Area Context Lookup** (see [PATTERNS.md](../PATTERNS.md) — get_area_context):

For each meeting, check if it maps to an area:
1. Call `AreaParserService.getAreaForMeeting(meetingTitle)` — uses case-insensitive substring matching against `recurring_meetings[].title` in area files
2. If match found (non-null `AreaMatch`), call `AreaParserService.getAreaContext(areaSlug)` to retrieve the area's Current State section
3. Store area matches for display in Step 7

**Example**: Meeting "CoverWhale Sync" → matches area `glance-communications` → include "Partnership progressing well. API integration complete." in daily focus.

### 5. Offer Agenda Creation

After gathering meeting context, identify **prep-worthy meetings** and offer to create agendas inline.

**Prep-worthy title patterns** (case-insensitive match):
- `QBR`, `customer`, `leadership`, `review`, `partner`, `1:1`, `planning`, `standup`, `sync`

**For each prep-worthy meeting**:

1. **Check existence**: Look for existing agendas matching `now/agendas/YYYY-MM-DD-*` where `YYYY-MM-DD` is today's date (or tomorrow if planning for tomorrow). Fuzzy match the title slug against filenames — if an agenda exists that contains the meeting title (slugified), skip offering.

2. **Offer prompt** (only if no existing agenda):
   ```
   Create agenda for [Meeting Title]? [y/N]
   ```

3. **If user says yes**: Create the agenda inline using the **prepare-meeting-agenda** workflow:
   - Infer meeting type from title patterns (see prepare-meeting-agenda Step 2)
   - Load template: `arete template resolve --skill prepare-meeting-agenda --variant {type}`
   - Pre-fill context: date, title, attendees (already resolved from Step 4)
   - Build agenda with suggested items from the meeting context already gathered
   - Save to `now/agendas/YYYY-MM-DD-{title-slug}.md`
   - Track the created agenda path for display in Step 7

4. **Track agenda links**: For each meeting (prep-worthy or not), note if an agenda exists (pre-existing or just created) so it can be shown in the meeting list.

**Skip this step entirely if**:
- No meetings are prep-worthy (none match title patterns), OR
- All prep-worthy meetings already have agendas

### 6. Check for User Content (Merge-Aware Update)

Before writing, check if `## Today's Plan` section already exists in `now/week.md`:

**Section boundary**: Content between `## Today's Plan` and the next `##` header (or EOF).

**If section exists with non-placeholder content** (any real text in `### Focus` or `### Meetings`, not just `- [placeholder]`):

Prompt the user:
```
You have content in Today's Plan. Options:
 1. Update meetings only (keep focus items)
 2. Replace everything (notes preserved)
 3. Cancel
```

- **Option 1**: Update only `### Meetings` subsection; preserve `### Focus` as-is
- **Option 2**: Replace both `### Focus` and `### Meetings` with new content
- **Option 3**: Abort without changes

**Critical**: `### Notes` subsection is ALWAYS preserved regardless of choice.

### 7. Write to Week.md

Write the daily plan to `## Today's Plan` section in `now/week.md`.

**If `## Today's Plan` section doesn't exist**:
- Insert before `## End of week review` if that header exists
- Otherwise append at end of file

**Output format (≤25 lines)**:

```markdown
## Today's Plan
<!-- This section is auto-updated by daily-plan. User notes in ### Notes subsection are preserved. -->

### Focus
- [Top 1-3 items from week priorities]

### Area Context
_Include this section only when at least one meeting maps to an area._

- **Glance Communications** (CoverWhale Sync at 2:00): Partnership progressing well. API integration complete.
- **Product Team** (Sprint Review at 4:00): Feature freeze in effect. Focus on stability.

### Meetings
- **9:00** Team standup
- **2:00** CoverWhale Sync → [area: Glance Communications] [prep: review API status]
- **3:30** 1:1 with Jane → [prep: discuss promotion timeline]
- **4:00** Sprint Review → [area: Product Team] [agenda](now/agendas/2026-03-18-sprint-review.md)

### Notes
- [User notes preserved here]
```

**Format guidelines**:
- `### Focus`: Top 1-3 outcomes from week priorities or scratchpad. Concise bullets.
- `### Area Context`: For meetings that map to areas (via `getAreaForMeeting()`), show the area's Current State summary. One line per area — include the meeting time and area name with a brief state summary. Skip this section if no meetings have area associations.
- `### Meetings`: Time + title + brief context/prep. One line per meeting. Include source at top: "Pulled from Calendar (calendar-names)" or "User provided".
  - **Area indicator**: For meetings with area associations, show `→ [area: Area Name]` before prep notes
  - **Agenda links**: If an agenda exists (pre-existing or created in Step 5), show `→ [agenda](path)` instead of prep notes. Format: `- **9:00** Meeting title → [agenda](now/agendas/YYYY-MM-DD-title-slug.md)`
- `### Notes`: Always preserve existing content. If no prior notes, add placeholder `- [Add notes here]`.

### 8. Confirm Update

After writing, confirm to user:
- What was updated (focus/meetings/both)
- What was preserved (notes, user focus items if option 1)
- The target date if planning for tomorrow

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_area_context
- **Week file**: `now/week.md`
- **Agendas**: `now/agendas/` — meeting agenda documents (created in Step 5)
- **Quarter goals**: `goals/*.md` (excluding `strategy.md`) — individual goal files with frontmatter
- **Legacy quarter goals**: `goals/quarter.md` (fallback for older workspaces)
- **Scratchpad**: `now/scratchpad.md`
- **Areas**: `areas/*.md` — area files with recurring meeting mappings and context
- **Related**: meeting-prep, prepare-meeting-agenda, week-plan, week-review
