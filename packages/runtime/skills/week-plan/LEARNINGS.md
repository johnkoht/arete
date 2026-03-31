# Week Plan Skill — LEARNINGS

> Component-specific gotchas, invariants, and pre-edit checklists.

---

## Section Semantics (week.md)

The `now/week.md` file has specific sections with defined purposes:

| Section | Purpose | Format | Populated By |
|---------|---------|--------|--------------|
| **Weekly Priorities** | Top 3-5 high-level goals for the week | Numbered list (1. 2. 3.) | week-plan skill |
| **Key Meetings** | Prep-worthy meetings flagged by importance inference | `- [ ] Day Time: Title (attendees) — prep: [link] or "needs prep"` | week-plan skill (Step 2.5 → Step 4) |
| **Today** | Current day's focus and meetings | Focus line + meeting list | daily-plan skill |
| **Inbox** | Quick capture during daily winddown | Plain text, no metadata required | User (via daily-winddown) |
| **Notes** | Working notes throughout the week | Free-form, preserved across updates | User |
| **Tasks** | Week's actionable items by priority | Checkboxes in Must/Should/Could subsections | week-plan, daily-winddown |
| **Waiting On** | What others owe you | `- [ ] Person: Description @person(slug) @from(commitment:id)` | Meeting processing (they_owe_me) |
| **Carried from last week** | Incomplete items from previous week | Checkboxes | week-plan (auto-populated) |
| **Daily Progress** | Archive of previous days | Auto-generated from Today section | daily-plan skill |

### Section Invariants

1. **Notes is sacred** — Never overwritten or moved by any skill. User's working scratchpad.
2. **Daily Progress is append-only** — daily-plan archives previous Today here; never deletes entries.
3. **Today is transient** — Replaced daily by daily-plan; previous content moves to Daily Progress.
4. **Inbox is temporary** — Items should be triaged to Tasks or tasks.md during daily winddown.

### Backward Compatibility

- The section was previously named `## Outcomes`; renamed to `## Weekly Priorities` in 2026-03.
- Backend parser (`parseWeekPriorities()`) searches for `### N. Title` patterns within the file, NOT section headers.
- Any code that reads week.md should tolerate missing sections gracefully.

---

## Gotchas

### Backend Parsing Independence
The backend `parseWeekPriorities()` function in `packages/apps/backend/src/routes/goals.ts` does NOT depend on section headers. It searches for `### N. Title` or `### N Title` patterns globally in the content. This means renaming `## Outcomes` to `## Weekly Priorities` has no impact on parsing.

### Inbox Has No Metadata Requirements
Unlike Tasks which support `@area()`, `@project()`, `@person()`, `@due()` metadata, Inbox items are intentionally free-form. This supports quick capture during winddown — metadata is inferred during triage.

### Waiting On vs Tasks
- **Waiting On**: Things others owe YOU (they_owe_me commitments). Not actionable by you.
- **Tasks**: Things YOU need to do (may include linked i_owe_them commitments via `@from()`).

---

## Pre-Edit Checklist

Before modifying week.md template or parsing:

- [ ] Check if `parseWeekPriorities()` in backend uses any section headers (currently: no)
- [ ] Check if daily-plan skill assumes specific section names (references Today, Notes, Daily Progress)
- [ ] Check if Key Meetings section is parsed by any skill or backend route
- [ ] Verify Notes section preservation logic in daily-plan
- [ ] Test with existing week.md files to ensure backward compatibility

---

## Task-Pulling Workflow (Step 3)

### Move vs Copy Semantics

When moving tasks from `tasks.md` Anytime to `week.md`:
- **DELETE** from source (`now/tasks.md` `## Anytime`)
- **ADD** to destination (`now/week.md` `### Must/Should/Could complete`)
- Preserve all metadata tags

This is intentional — avoids duplicate tasks across files.

### Candidate Sources

| Source | Filter | On Selection | On Skip |
|--------|--------|--------------|---------|
| `tasks.md` Anytime | All items | Move to week.md | Ask: Someday? |
| Commitments | `i_owe_them` without linked tasks | Create task with `@from(commitment:)` | Stays uncommitted |
| week.md Carryover | Incomplete (`- [ ]`) only | Move to selected section | Stays in place |

### Deduplication

Before adding to week.md, check if normalized task text already exists:
- Normalize: lowercase, trim, remove `@tag()` metadata
- If duplicate: skip with user notification
- Prevents "Review metrics" appearing twice if already in week.md

### Commitment Filtering

Filter out commitments that already have linked tasks:
- Search all tasks (week.md + tasks.md) for `@from(commitment:xxx)` where xxx matches commitment ID
- If found, commitment already has a task — don't create another

---

## Change History

- **2026-03-27**: Added task-pulling workflow (Step 3) with move semantics, dedup, and remaining Anytime handling. (task-management PRD, Task 7)
- **2026-03-27**: Added Inbox, Waiting On sections. Renamed Outcomes → Weekly Priorities. (task-management PRD, Task 2)
