---
name: goals-alignment
description: View and compare PM quarter goals to org strategy. Use when the user wants to view goals, compare to org, or roll up alignment.
---

# Goals Alignment Skill

Read org strategy and the current quarter plan, then output an alignment view: org pillars/OKRs vs PM quarter goals, with optional gap analysis. No new file is created by default; optionally save a snapshot to the archive.

## When to Use

- "view goals"
- "compare to org"
- "roll up"
- "goals alignment"
- "how do my goals map to company goals?"

## Workflow

### 1. Read Inputs

- **Read** `context/goals-strategy.md` — org pillars, OKRs, strategic framework.
- **Read** the current quarter file in `resources/plans/` (e.g. `quarter-2026-Q1.md`). If multiple quarter files exist, use the most recent or the one the user specifies.

### 2. Build Alignment View

Produce an **alignment view** that includes:

- **Org side**: Pillars and/or OKRs from `context/goals-strategy.md`.
- **PM side**: Quarter goals from the quarter file, with their stated org links.
- **Mapping**: Table or list showing My goal → Org pillar/OKR.
- **Gaps (optional)**: Org pillars/OKRs with no PM goal linked; PM goals with no org link.

### 3. Present and Optionally Save

- **Default**: Output the alignment view in the reply (no new file).
- **Optional**: If the user asks to save a snapshot, write to `resources/plans/archive/alignment-YYYY-Qn.md` (e.g. `alignment-2026-Q1.md`) with the same content and a short note (e.g. "Snapshot for [date]").

### 4. Suggest Follow-ups

- If gaps exist, suggest adding or adjusting quarter goals (**quarter-plan**) or updating `context/goals-strategy.md`.
- If alignment looks good, suggest **week-plan** to break the quarter into weekly priorities.

## References

- **Org strategy**: `context/goals-strategy.md`
- **Quarter plan**: `resources/plans/quarter-*.md`
- **Optional snapshot**: `resources/plans/archive/alignment-YYYY-Qn.md`

## Error Handling

- If no quarter file exists, say so and suggest running **quarter-plan** first.
- If `context/goals-strategy.md` is missing, show only PM goals and note that org context is not set.
