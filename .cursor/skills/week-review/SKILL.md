---
name: week-review
description: Review and close the week; mark priorities done/partial/carried and note quarter progress. Use when the user wants to review the week or close the week.
---

# Week Review Skill

Read the current week file and quarter file, then guide the PM to mark priorities as done/partial/carried, summarize quarter goal progress, and optionally capture a short summary in memory or in the week file.

## When to Use

- "review the week"
- "close the week"
- "week review"
- "what did I accomplish this week?"

## Workflow

### 1. Read Context

- **Read** the current week file: `resources/plans/week-YYYY-Www.md`.
- **Read** the quarter file: `resources/plans/quarter-YYYY-Qn.md` (for progress against goals).

### 2. Review Each Priority

For each outcome in the week file:

- **Done** — Completed; briefly note outcome if useful.
- **Partial** — Some progress; note what’s left or move to "carried over."
- **Carried** — Not done; add to "Carried over" for next week (or drop if no longer relevant).

Update the week file with these statuses (e.g. checkboxes, "[Done]", or a short note).

### 3. Quarter Goal Progress

Give a **brief quarter goal progress** summary:

- Which quarter outcomes advanced this week?
- Any blockers or risks to call out?

No need to rewrite the quarter file unless the user wants to adjust goals.

### 4. Optional Capture

- **Option A**: Add one short paragraph to `memory/summaries/sessions.md` (e.g. "Week of YYYY-MM-DD: …").
- **Option B**: Fill the "End of week review" section in the week file with a few sentences.
- Ask the user if they want either before writing.

### 5. Close and Next Steps

- Summarize: what was done, what’s carried, and quarter progress.
- Suggest **week-plan** for next week when ready.

## References

- **Week file**: `resources/plans/week-YYYY-Www.md`
- **Quarter file**: `resources/plans/quarter-YYYY-Qn.md`
- **Optional**: `memory/summaries/sessions.md`

## Error Handling

- If no week file exists, say so and suggest **week-plan** to create one for the current or next week.
- If the user hasn’t used week-plan before, briefly explain done/partial/carried and offer to create next week’s plan.
