---
name: week-plan
description: Plan the week and set weekly priorities. Use when the user wants to plan the week or set top weekly outcomes linked to quarter goals.
triggers:
  - weekly plan
  - plan my week
  - plan the week
  - week planning
  - set weekly priorities
  - prepare a weekly plan
  - prepare weekly plan
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - area_context
---

# Week Plan Skill

Guide the PM to define the top 3-5 outcomes for the week, linked to quarter goals. Read current quarter goals, last week file, active projects, and scratchpad/commitments. Output is `now/week.md`.

## When to Use

- "plan the week"
- "set weekly priorities"
- "what should I focus on this week?"
- "week planning"

## Workflow

### 1. Gather Context

**Timing-aware opening**: Before gathering context, detect timing and set expectations:
- If Friday 4pm or later, or weekend: "Let's plan next week (Week of [next Monday date])"
- Otherwise: "Let's plan the rest of this week (Week of [this Monday date])"

This helps set expectations but doesn't change calendar range.

**Gather silently** (no user interaction needed for this step):

- **Read** current quarter goals from individual files: `goals/*.md` (excluding `strategy.md`).
  - Parse frontmatter from each file to extract: `id`, `title`, `status`, `area`.
  - Filter to `status: active` goals.
  - **Group by area**: Note which goals have `area:` field set and group them for display.
- **Fallback**: If no individual goal files exist, read `goals/quarter.md` (legacy format).
- **Read** last week file: `now/week.md` for carry-over and continuity.
- **Read** `projects/active/` (README or key files) for commitments tied to projects.
- **Read** `now/scratchpad.md` for ad-hoc commitments or "due this week" items.
- **Open Commitments with Area Grouping**: Run `arete commitments list --json` and group results by area:
  - Extract unique area values from commitments
  - Count commitments per area (commitments without area go to "Unassigned")
  - Format as: "Area Name: N open commitments" (e.g., "Glance Communications: 3 open commitments")
  - Surface this summary in the "Area Commitments" section of the week file
- **Area Context Summaries**: For each area that has open commitments or linked goals:
  - Use the **get_area_context** pattern (see [PATTERNS.md](../PATTERNS.md))
  - Call `AreaParserService.getAreaContext(areaSlug)` to retrieve Current State section
  - Include brief area context (1-2 lines) in the weekly plan for situational awareness
- **Try Calendar (if configured)**: Run `arete pull calendar --days 7 --json`. If the command succeeds and returns events (`success: true` and non-empty `events`), use them to list the week's meetings (by day). If the command fails, returns no events, or is not configured, skip calendar and rely on the user for meeting context.

### 2. Week's Meetings and Prep

If you have calendar events from step 1:

- **List** the week's meetings by day (title, time, attendees if useful).
- **Call out** meetings that look like ones that often need prep. Use the meeting title (and notes if present) to flag types such as:
  - **QBR / Quarterly business review** - e.g. "QBR", "quarterly business review", "quarterly review"
  - **Monthly / product review** - e.g. "monthly product review", "product review", "monthly review"
  - **Stakeholder / leadership** - e.g. "stakeholder", "leadership", "exec review", "board"
  - **Product update / launch** - e.g. "product update", "launch review", "release review"
  - **Customer / external** - e.g. "customer", "customer review", "partner"
  - **Recurring cadences** - e.g. "all-hands", "all hands", "standup", "sync", "1:1" (optional; call out if the user cares about prep)
- **Propose or ask**: "Which of these meetings do you want to prepare for this week?" Suggest adding any that need prep to **Commitments due this week** or to a short "Meetings to prep" list. If the user names others (e.g. no calendar), add those too.

If you have no calendar data, briefly ask: "Any key meetings this week you want to plan prep for?" and fold the answer into commitments or outcomes as appropriate.

### 3. Shape Priorities (Two Phases)

**Phase 1: Open-ended ask**

After context gathering, pause and ask open-ended:

> "Based on your calendar and goals, what are your top 3-5 priorities this week? Just tell me in your own words - we'll add structure after."

Wait for the user's response. **Capture their exact wording** - don't paraphrase or immediately reframe.

**Phase 2: Add structure**

For each priority the user stated, help add structure:

- **Outcome** - Preserve user's wording, clarify "what done looks like" if needed.
- **Advances quarter goal** - Link to a goal ID from frontmatter (e.g. `Q1-2`). Suggest based on context; user confirms.
- **Success criteria** (optional) - How we know it's done.
- **Effort** (optional) - deep / medium / quick.

Present the structured list back for confirmation before writing.

Also capture (from earlier context, no extra asks needed):

- **Commitments due this week** - From meetings, stakeholders, scratchpad, and any "meetings to prep" from step 2.
- **Carried over from last week** - Incomplete items from the previous week file.

> **Exchange budget**: Target ≤5 exchanges before file is written. Gather context silently, ask priorities once, confirm structure once, write file.

### 4. Write Week File

- **File**: `now/week.md`.
- **Structure**: Run this command and use its output as the week file structure. Do not add sections from elsewhere:
  ```
  arete template resolve --skill week-plan --variant week-priorities
  ```

  Template sections:
  - Week dates
  - Top 3-5 outcomes with quarter goal links
  - **Area Overview** — area context summaries with commitment counts (see format below)
  - Commitments due this week
  - Carried over from last week
  - **Today's Plan** - auto-updated by **daily-plan** (see below)
  - Optional "End of week review" section (filled during **week-review**).

  **About Today's Plan**: This section is a placeholder for **daily-plan** to populate. When daily-plan runs, it updates `### Focus` and `### Meetings` with today's context. The `### Notes` subsection is preserved across daily-plan updates, so users can add notes that won't be overwritten.

  **Area Overview format** (include this section when areas have commitments or linked goals):
  ```markdown
  ## Area Overview
  _Active work domains for the week with current state and open commitments._

  ### Glance Communications
  - **Current State**: Partnership progressing well. API integration complete.
  - **Open Commitments**: 3
  - **Linked Goals**: Q1-2 (Launch partner API)

  ### Product Team
  - **Current State**: Feature freeze in effect. Focus on stability.
  - **Open Commitments**: 5
  - **Linked Goals**: Q1-1 (Ship v2.0), Q1-3 (Improve test coverage)

  ### Unassigned
  - **Open Commitments**: 2
  ```

  **Format rules**:
  - Show each area that has either open commitments OR linked goals
  - Include brief Current State summary (1-2 lines from area file's Current State section)
  - Show commitment count: "Area Name: N open commitments"
  - List linked goal IDs (goals with `area:` matching this area slug)
  - Group commitments without area under "Unassigned" (show count only, no context)
  - Skip this section entirely if no areas have commitments or linked goals

### 5. Stakeholder Watchouts (Opt-in)

After writing the week file, offer:

> "Would you like stakeholder watchouts for your meetings this week? (refreshes person memory for key attendees)"
>
> Default: skip unless user says yes.

**If user opts in**:

- For meetings likely to need prep, resolve attendees and run stale-aware refresh as needed:
  - `arete people memory refresh --person <slug> --if-stale-days 7`
- Add a compact section to `now/week.md`: **Stakeholder watchouts this week** with 3–5 high-signal themes.
- Keep this strategic and concise (avoid per-person dumps unless requested).

**If user skips**: Proceed directly to Step 6 (Confirm and Close).

### 6. Confirm and Close

- Summarize the week's focus and quarter links.
- Suggest **week-review** at the end of the week to close out and carry over.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_area_context
- **Quarter goals**: `goals/*.md` (excluding `strategy.md`) — individual goal files with frontmatter (includes `area:` field)
- **Legacy quarter goals**: `goals/quarter.md` (fallback for older workspaces)
- **Last week**: `now/week.md`
- **Output**: `now/week.md`
- **Template**: `templates/plans/week-priorities.md` (override) or `.agents/skills/week-plan/templates/week-priorities.md` (default)
- **Context**: `projects/active/`, `now/scratchpad.md`
- **Areas**: `areas/*.md` — area files with context sections (Current State, Key Decisions, etc.)
- **Commitments by area**: `arete commitments list --area <slug>` or `arete commitments list --json` (group by area)
- **Calendar**: `arete pull calendar --days 7 --json` (optional; same as daily-plan)

## Notes

- **Recurrence**: The calendar integration (icalBuddy) does not expose whether an event is recurring. Meeting-type callouts (QBR, monthly review, etc.) are based on **event title** (and notes) only. A future provider (e.g. Google Calendar API) could add recurrence if needed.
- **Area Integration**: Goals and commitments can be linked to areas via the `area:` field. The week plan shows area-organized views to help users see which work domains need attention. Areas provide persistent context (Current State, Key Decisions) that enriches weekly planning beyond simple task lists.
- **Related skills**: daily-plan, meeting-prep, and process-meetings also use area context via the **get_area_context** pattern for consistent area-aware workflows.

## Error Handling

- If no quarter file exists, still create the week file; note "Quarter link TBD" and suggest **quarter-plan**.
- If the user has more than 5 outcomes, suggest ranking and moving the rest to "backup" or next week.
