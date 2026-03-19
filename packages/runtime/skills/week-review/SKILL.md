---
name: week-review
description: Review and close the week; mark priorities done/partial/carried and note quarter progress. Use when the user wants to review the week or close the week.
work_type: planning
category: essential
intelligence:
  - context_injection
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

- **Read** the current week file: `now/week.md`.
- **Read** individual goal files: `goals/*.md` (excluding `strategy.md`).
  - Parse frontmatter from each file to extract: `id`, `title`, `status`, `quarter`, `successCriteria`.
  - Filter to `status: active` goals for the current quarter.
- **Fallback**: If no individual goal files exist, read `goals/quarter.md` (legacy format).
- **Check for Today's Plan section**: Look for `## Today's Plan` in the week file.
  - If present with real content (not just placeholders like `- [placeholder]` or empty subsections), note that daily planning was active this week.
  - If absent or placeholder-only, proceed normally — this is backward compatible with older week files.

### 2. Review Each Priority

For each outcome in the week file:

- **Done** — Completed; briefly note outcome if useful.
- **Partial** — Some progress; note what’s left or move to "carried over."
- **Carried** — Not done; add to "Carried over" for next week (or drop if no longer relevant).

Update the week file with these statuses (e.g. checkboxes, "[Done]", or a short note).

### 2.5. Commitment Review

Run `arete commitments list`. If non-empty, present the list.

> Type 'skip' to skip this section.

For each open commitment, ask:
- Done → `arete commitments resolve <id> --yes`
- Carried to next week → leave open (no action)
- Dropped (de-scoped, no longer relevant) → `arete commitments resolve <id> --yes --status dropped`

Resolution is agent-mediated: confirm per item with the user, then run the resolve command on their behalf.
Commitments marked "carried" remain open and will surface again next week.

### 3. Quarter Goal Progress

Give a **brief quarter goal progress** summary:

- Which quarter outcomes advanced this week?
- Any blockers or risks to call out?

No need to rewrite the quarter file unless the user wants to adjust goals.

### 3.5. Weekly Significance Analysis

Apply the `significance_analyst` expert pattern to assess what actually mattered this week.

**Assemble a context bundle** using the `context_bundle_assembly` pattern — **limited to two sections only**:

1. **Strategy & goals** — Run `arete search "<topic>"` where topic is derived from the week's focus areas (key themes from the week file's outcomes and notes, e.g. "API launch progress, customer onboarding, Q2 planning"). Take top 3 results, max 300 words each.
2. **Existing memory** — Run `arete search "<topic>" --scope memory`. Take top 5 results, max 200 words each.

> **Do NOT** add `arete people show` calls. Week-review does not resolve attendees.

If both sections return empty results, note: `⚠️ Sparse context — significance assessment based primarily on week content.`

**Apply `significance_analyst`** to the assembled bundle and the week's raw content (accomplishments, outcomes, notes from the week file).

> **Exclude Today's Plan**: When extracting the week's raw content, skip the `## Today's Plan` section entirely. This section contains ephemeral daily content that shouldn't influence weekly significance analysis. Focus on: Top outcomes, Commitments, Carried over, and End of week review sections.

- Ask: *"Given everything that happened this week and current goals/strategy, what was actually significant?"*
- Separate signal from noise — not everything that happened matters equally.
- Identify patterns: recurring themes, blocked areas, momentum shifts, surprising outcomes.
- Connect to strategy: how does this week advance or hinder quarter goals?
- For each significant item, **cite the specific goal or prior decision from the context bundle** that makes it significant. If you cannot cite bundle content, downgrade the item's ranking.

**Output — Weekly Intelligence section** (include in the review):

```markdown
## Weekly Intelligence

### Most Significant Events
- [Event] — [WHY it matters, citing specific goal or decision from context]
- ...

### Patterns Identified
- [Recurring theme / blocked area / momentum shift]
- ...

### Strategic Connections
- [How this week advances or hinders quarter goals]
- ...

<!-- If daily planning was active, include: -->
📅 Daily planning was active this week.
```

> **Daily planning note**: Only include the "📅 Daily planning was active" line if `## Today's Plan` contained real content (not just placeholders). Omit if section was absent or empty.

> **Sparse-context behavior**: If the context bundle is sparse, weight the week's raw content more heavily and note: "Limited context — significance based primarily on week content analysis."

### 4. Optional Capture

- **Option A**: Add one short paragraph to `.arete/memory/summaries/sessions.md` (e.g. "Week of YYYY-MM-DD: …").
- **Option B**: Fill the "End of week review" section in the week file with a few sentences.
- Ask the user if they want either before writing.

### 5. Close and Next Steps

- Summarize: what was done, what’s carried, and quarter progress.
- Suggest **week-plan** for next week when ready.

## References

- **Week file**: `now/week.md`
- **Individual goals**: `goals/*.md` (excluding `strategy.md`) — one file per goal with frontmatter
- **Legacy quarter plan**: `goals/quarter.md` (fallback for older workspaces)
- **Optional**: `.arete/memory/summaries/sessions.md`
- **Patterns**: `context_bundle_assembly` (context bundle limited to goals + memory only), `significance_analyst` (weekly significance assessment)

### Goal File Frontmatter

Individual goal files use this frontmatter structure:
```yaml
---
id: "Q1-1"
title: "Goal title"
status: active
quarter: "2026-Q1"
type: outcome
orgAlignment: "Pillar 2: Retention"
successCriteria: "Measurable target"
---
```

Use `status` and `quarter` to identify active goals for the current quarter.

## Error Handling

- If no week file exists, say so and suggest **week-plan** to create one for the current or next week.
- If the user hasn’t used week-plan before, briefly explain done/partial/carried and offer to create next week’s plan.
