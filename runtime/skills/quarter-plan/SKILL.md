---
name: quarter-plan
description: Set quarter goals and align to org strategy. Use when the user wants to set quarter goals, plan the quarter, or align PM outcomes to org pillars/OKRs.
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
---

# Quarter Plan Skill

Guide the PM through defining 3–5 quarter outcomes, success criteria, and alignment to org strategy. Output is `goals/quarter.md`.

## When to Use

- "set quarter goals"
- "plan the quarter"
- "align to org"
- "quarter planning"
- "define my Qn goals"

## Workflow

### 1. Gather Context

- **Read** `goals/strategy.md` — org pillars, OKRs, and strategic direction.
- **Read** `goals/quarter.md` if it exists (may have prior quarter content) to carry forward themes or unfinished outcomes.

### 2. Guide to 3–5 Outcomes

Ask the PM to define **3–5 outcomes** for the quarter. For each outcome capture:

- **Title** — Short, outcome-oriented (e.g. "Ship onboarding v2", "Complete discovery for X").
- **Success criteria** — 1–2 sentences: how we know it’s done.
- **Org alignment** — Which pillar or OKR from `goals/strategy.md` this supports (e.g. "Pillar 2: Retention", "O1-KR2").

### 3. Write Quarter File

- **File**: `goals/quarter.md`.
- **Structure**: Use the template at `templates/plans/quarter-goals.md`:
  - Quarter dates
  - 3–5 outcomes with success criteria and org pillar/OKR link
  - **Alignment table**: My goal → Org pillar/OKR (so roll-up and review are easy).

### 4. Confirm and Close

- Summarize the quarter outcomes and alignment.
- Suggest next steps: **goals-alignment** to view the alignment view, **week-plan** when ready to plan the first week.

## References

- **Org strategy**: `goals/strategy.md`
- **Output**: `goals/quarter.md`
- **Template**: `templates/plans/quarter-goals.md`

## Error Handling

- If `goals/strategy.md` is missing or sparse, still create the quarter file; note "Org alignment TBD" and suggest the user fill in context later.
- If the PM has more than 5 outcomes, suggest grouping or moving lower-priority items to "stretch" or next quarter.
