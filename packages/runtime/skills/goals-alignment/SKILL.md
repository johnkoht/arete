---
name: goals-alignment
description: View and compare PM quarter goals to org strategy. Use when the user wants to view goals, compare to org, or roll up alignment.
primitives:
  - Problem
work_type: planning
category: essential
intelligence:
  - context_injection
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

#### Team Health Check (Optional)

Before reviewing alignment, offer a brief **team health check** using the Five Dysfunctions pyramid (Patrick Lencioni): (1) **Trust** — vulnerability-based, (2) **Conflict** — healthy disagreement, (3) **Commitment** — clarity and buy-in, (4) **Accountability** — peers hold each other, (5) **Results** — team outcomes over individual. If any level is weak, alignment will be fragile. Ask: "Want to run through the Five Dysfunctions check before we look at the alignment?"

- **Read** `goals/strategy.md` — org pillars, OKRs, strategic framework.
- **Read** the current quarter file: `goals/quarter.md`.

### 2. Build Alignment View

Produce an **alignment view** that includes:

- **Org side**: Pillars and/or OKRs from `goals/strategy.md`.
- **PM side**: Quarter goals from the quarter file, with their stated org links.
- **Mapping**: Table or list showing My goal → Org pillar/OKR.
- **Gaps (optional)**: Org pillars/OKRs with no PM goal linked; PM goals with no org link.

### 3. Present and Optionally Save

- **Default**: Output the alignment view in the reply (no new file).
- **Optional**: If the user asks to save a snapshot, write to `goals/archive/alignment-YYYY-Qn.md` (e.g. `alignment-2026-Q1.md`) with the same content and a short note (e.g. "Snapshot for [date]").

### 4. Suggest Follow-ups

- If gaps exist, suggest adding or adjusting quarter goals (**quarter-plan**) or updating `goals/strategy.md`.
- If alignment looks good, suggest **week-plan** to break the quarter into weekly priorities.

## References

- **Org strategy**: `goals/strategy.md`
- **Quarter plan**: `goals/quarter.md`
- **Optional snapshot**: `goals/archive/alignment-YYYY-Qn.md`

## Error Handling

- If no quarter file exists, say so and suggest running **quarter-plan** first.
- If `goals/strategy.md` is missing, show only PM goals and note that org context is not set.
