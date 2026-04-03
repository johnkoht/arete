---
name: daily-plan
description: Surface today's focus, meetings, and context. Archives previous day's plan to Daily Progress. Use when the user wants a daily plan or "what's on my plate today".
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
  - task_scoring
---

# Daily Plan Skill

Build a daily plan: today's focus from week priorities, meeting list with context and agenda links. Archives the previous day's Today section to Daily Progress before writing the new day.

## When to Use

- "What's on my plate today?"
- "Daily plan"
- "Today's focus"

## Workflow

### 1. Check Timing

- **After 6pm**: Default to planning for tomorrow
  - Confirm: "Planning for tomorrow (Wed 3/19)? [Y/n]"
  - Use confirmed date for calendar pull and section content

### 2. Check Week Plan Exists

- **If `now/week.md` does not exist**:
  - Prompt: "No week plan found. Run week-plan first, or continue with minimal plan?"
  - If continue: Create minimal `now/week.md` with the new template structure

### 3. Gather Context

- **Read** `now/week.md` (current week priorities, outcomes, tasks).
- **Read** `now/scratchpad.md` for ad-hoc items.
- **Calendar** (if configured): Run `arete pull calendar --today --json` (or `--tomorrow` if planning for tomorrow). If successful, use events as meeting list. Otherwise, ask user.
- **Commitments**: Run `arete commitments list --json` to surface relevant items.

### 3.5. Score and Select Tasks

Use intelligent task scoring to recommend today's focus from the week's task list.

**Build Scoring Context**:
1. **Meeting attendees**: Extract person slugs from today's calendar events
2. **Meeting areas**: Extract area slugs from today's meetings (via `getAreaForMeeting()`)
3. **Week priorities**: Extract priority text from `now/week.md` Outcomes section
4. **Focus hours**: Estimate available focus time from calendar gaps
5. **Needs attention**: People with `needs_attention: true` in their profile

**Score Tasks**:
1. Get all incomplete tasks from `now/week.md` Tasks sections (Must/Should/Could)
2. For each task, compute score across dimensions:
   - **Due Date (0-40)**: Overdue = 40, today = 35, this week = 25, next week = 10, later = 0
   - **Commitment (0-25)**: Has `@from(commitment:xxx)` = 25
   - **Meeting Relevance (0-20)**: Task `@person`/`@area` matches today's meeting = 20
   - **Week Priority (0-15)**: Task text matches word in week priorities = 15
3. Apply modifiers:
   - **+10**: Task `@person` is in `needsAttentionPeople`
   - **+20**: Task relates to today's meeting (attendee or area)
   - **-10**: Deep work task (write, design, analyze, etc.) but <2hrs focus available

**Present Recommendations**:
Show top 5 tasks with score breakdown for transparency:

```
**Recommended focus for today:**

1. Send API docs to Sarah (score: 75)
   - Due today: +35
   - Commitment: +25
   - Meeting with Sarah today: +15

2. Review compliance checklist (score: 55)
   - Due this week: +25
   - @area(coverwhale) has meeting today: +20
   - +10: @sarah needs attention

3. Draft transformer spec (score: 40)
   - Overdue: +40
   - -10: Deep work needs 2hrs, only 1hr available

4. Update project status (score: 25)
   - Due this week: +25

5. Explore new dashboard ideas (score: 0)
   - No due date
```

**User Confirmation**:
After presenting recommendations, confirm:
> "Any changes to today's focus? (You can swap tasks, add priorities, or accept as-is)"

- **Accept**: Use recommendations as Today's focus
- **Adjust**: User modifies list, agent updates accordingly
- **Skip**: User provides their own focus manually

The confirmed tasks become the **Focus** section content in the Today update.

### 3.6. Tag Selected Tasks with @due

After the user confirms their focus tasks, tag each selected task in `now/week.md` with `@due(YYYY-MM-DD)` using today's actual date (or tomorrow's if planning ahead).

**Why**: `@due(YYYY-MM-DD)` is the canonical source for the Task UI's Today view. The web UI filters Must/Should items by `@due(today)` to build the Today panel. Without this tag, selected tasks won't appear in the Today view.

**How**:
1. For each confirmed focus task, find its line in `now/week.md` (in Must/Should/Could sections)
2. If the task already has `@due(...)`, update it to today's date
3. If the task has no `@due(...)`, append `@due(YYYY-MM-DD)` to the task line
4. Only tag tasks the user confirmed — do NOT tag tasks they removed from focus

**Example**:
```markdown
### Must complete
- [ ] Send API docs to Sarah @area(product) @person(sarah-chen) @due(2026-04-02)
- [ ] Review compliance checklist @area(coverwhale) @due(2026-04-02)

### Should complete
- [ ] Update project status @area(product)
- [ ] Draft transformer spec @area(coverwhale) @due(2026-04-02)
```

In this example, "Update project status" was NOT selected for today's focus, so it has no `@due` tag.

**Lifecycle**: `@due` tags are set by daily-plan and cleared by daily-winddown for incomplete items. Tasks completed during the day keep their `@due` tag (it becomes historical metadata on the `[x]` line).

### 4. For Each Meeting

- Resolve attendees and run **get_meeting_context** pattern (see [PATTERNS.md](../PATTERNS.md)).
- Run **get_area_context** pattern: Call `getAreaForMeeting(meetingTitle)` to check for area association.
- Note prep suggestions and area context for display.

### 4.5. Memory-Informed Meeting Context

Use the **contextual_memory_search** pattern (see [PATTERNS.md](../PATTERNS.md)) to surface relevant past decisions for today's meetings.

**For each prep-worthy meeting**:
1. Extract search terms: meeting title keywords + key attendee names
2. Run: `arete search "<term>" --scope memory --limit 2`
3. If relevant results found, surface inline with the meeting:
   - "For your 2pm CoverWhale sync, note: [Decision] Legal sign-off required before compliance submission."
4. Keep concise: max 1 item per meeting

**Empty results**: If no relevant memory found for a meeting, don't mention it (silent skip). Only surface memory when it genuinely informs the meeting.

**Example**:
```
**Meetings**:
- 10:00 Anthony 1:1 → [agenda](now/agendas/2026-03-25-anthony-1-1.md) ⭐
- 12:45 Mayra intro → [agenda](now/agendas/2026-03-25-mayra-intro.md)
- 14:00 CoverWhale Sync → [area: Glance Communications]
  _Note: [Decision 3/15] Legal sign-off required before compliance_
- 16:00 UK Roadmap Review
  _Note: [Learning 3/10] Stakeholders prefer async review_
```

### 5. Offer Agenda Creation

For **prep-worthy meetings** (QBR, customer, leadership, 1:1, planning, etc.):

1. Check if agenda exists at `now/agendas/YYYY-MM-DD-{title-slug}.md`
2. If not, offer: "Create agenda for [Meeting Title]? [y/N]"
3. If yes, create using **prepare-meeting-agenda** workflow
4. Track agenda paths for meeting list display

### 6. Archive Previous Day to Daily Progress

**Before writing new Today section**, check if previous day's content exists:

1. **Find existing Today section**: Look for `## Today — ` header in `now/week.md`
2. **Extract date**: Parse the date from header (e.g., "## Today — Mon Mar 24" → "Mon Mar 24")
3. **Compare dates**: If the existing date is different from today (or tomorrow if planning ahead):

   **Archive to Daily Progress**:
   - Find or create `## Daily Progress` section
   - Create entry `### {Day Date}` (e.g., `### Mon Mar 24`)
   - Copy **Focus** and **Meetings** content from old Today section
   - Add empty **Progress** field for user to fill later
   - Do NOT copy area context (transient)

4. **Same-day re-run**: If date matches today, don't archive (would duplicate)
5. **First day of week**: If no Today section exists, skip archival

**Archive format**:
```markdown
## Daily Progress
### Mon Mar 24
**Focus**: Email compose release day.
**Meetings**: UK Eng, PM Bi-Weekly, Prod Access, Tech Standup
**Progress**:
- [User fills this in during winddown or week-review]
```

### 7. Write Today Section

Replace `## Today — {old date}` with new content.

> **Important**: The `## Today` section is a **generated read-only snapshot** — a quick-glance summary of today's plan. The canonical source of truth for today's tasks is the `@due(YYYY-MM-DD)` tags on tasks in the Must/Should/Could sections (set in step 3.6). The Task UI's Today view reads from those `@due` tags, not from this section.

**Header format**: `## Today — {Day} {Mon} {DD}` (e.g., `## Today — Tue Mar 25`)

**Content format**:
```markdown
## Today — Tue Mar 25
**Focus**: CoverWhale transformer sync. First shadow session.

**Tasks** _(from @due tagged items — edit in Must/Should/Could sections)_:
- Send API docs to Sarah
- Review compliance checklist
- Draft transformer spec

**Meetings**:
- 10:00 Anthony 1:1 → [agenda](now/agendas/2026-03-25-anthony-1-1.md) ⭐
- 12:45 Mayra intro → [agenda](now/agendas/2026-03-25-mayra-intro.md)
- 14:00 Shadow: LaTisha
- 16:00 CoverWhale Sync → [area: Glance Communications]
```

**Format guidelines**:
- **Focus**: 1-2 sentences from week outcomes or tasks. What's the main thing today?
- **Tasks**: List the tasks tagged with today's `@due` date. This is a snapshot — the actual tasks live in Must/Should/Could sections. Include a note directing users to edit there.
- **Meetings**: Time + title + optional markers:
  - `→ [agenda](path)` — Link to agenda if exists
  - `→ [area: Name]` — Area association from `getAreaForMeeting()`
  - `⭐` — Key meeting (user marks during agenda creation)
- **Calendar source**: If using calendar, note at top: "_From Calendar (calendar-names)_"

### 8. Preserve Notes Section

The `## Notes` section is the user's working scratchpad.

- **Never modify** this section
- **Never move** content to Daily Progress
- If Notes doesn't exist, don't create it (user adds when needed)

### 9. Confirm Update

After writing, confirm:
- Previous day archived (if applicable): "Archived Mon Mar 24 to Daily Progress"
- Today section updated: "Updated Today — Tue Mar 25"
- Target date if planning for tomorrow

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| First day of week | No archival, just write Today |
| Same-day re-run | Update Today in place, no archival |
| No Today section exists | Create it, no archival |
| Week.md doesn't exist | Create minimal file with new structure |
| Planning for tomorrow | Archive today if different, write tomorrow's date |

## @due Tag Lifecycle

| Phase | Action | Who |
|-------|--------|-----|
| Daily plan (step 3.6) | Add `@due(YYYY-MM-DD)` to selected focus tasks | daily-plan skill |
| During the day | Task UI Today view shows `@due(today)` items | web UI |
| Task completion | `@due` tag preserved on `[x]` completed line | user / TaskService |
| Daily winddown | Clear `@due` from previous day's incomplete items | daily-winddown skill |

This lifecycle ensures the Today view always reflects the current day's focus without stale items accumulating.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_meeting_context
- **Pattern**: [PATTERNS.md](../PATTERNS.md) — get_area_context
- **Service**: `@arete/core` — `scoreTask()`, `scoreTasks()`, `getTopTasks()`, `formatTaskRecommendations()`
- **Week file**: `now/week.md`
- **Agendas**: `now/agendas/`
- **Scratchpad**: `now/scratchpad.md`
- **Areas**: `areas/*.md`
- **Related**: week-plan, week-review, prepare-meeting-agenda, daily-winddown
