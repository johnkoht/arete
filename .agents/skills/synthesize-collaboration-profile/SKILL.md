---
name: synthesize-collaboration-profile
description: Review build entries' Learnings and Corrections, merge into memory/collaboration.md, and update the builder collaboration profile. Use when the builder asks to update the profile, after a major build phase or PRD post-mortem, or when several entries with learnings have accumulated.
category: build
work_type: synthesis
primitives: []
requires_briefing: false
---

# Synthesize Collaboration Profile Skill

Systematically update `memory/collaboration.md` from **Learnings** and **Corrections** sections in `memory/entries/`. Produces a single, non-repetitive profile that future agents read at conversation start.

## When to Use (Triggers)

**Run this skill when:**

1. **Builder asks** — "Synthesize collaboration profile", "Update collaboration from entries", "Extract learnings to collaboration.md", "Refresh collaboration.md"
2. **After PRD post-mortem** — prd-post-mortem skill suggests: "Consider running synthesize-collaboration-profile to push learnings into collaboration.md"
3. **Several entries with Learnings** — 5+ new entries (since last synthesis) include Learnings or Corrections sections
4. **After a major build phase** — Large feature complete, multi-PRD run done, or quarterly review
5. **Periodic** — Monthly or every 10 entries with Learnings (builder's preference)

**Do not run** after every single entry; batch so the profile evolves in coherent passes.

## Workflow

### 1. Determine Scope

- Read `memory/collaboration.md` and note the **Last Synthesized** date at the bottom.
- List entries in `memory/entries/` (by date, newest first). Optionally limit to:
  - **Since last synthesis**: Only entries dated after "Last Synthesized"
  - **Last N entries**: e.g. last 15 entries (default if no "Last Synthesized" or builder wants full pass)
- If builder said "since X" or "last N", use that scope.

### 2. Extract Learnings and Corrections

For each entry in scope:

- Open `memory/entries/YYYY-MM-DD_slug.md`.
- Extract:
  - **Learnings** section — collaboration observations, process preferences, what worked/didn't, builder preferences
  - **Corrections (for collaboration.md)** section — explicit corrections to apply (if present)
  - **Collaboration Patterns** subsection (if present inside Learnings or at top level)
- For each item, note: **source entry** (date + slug), **observation/correction**, **implication** (how to behave).

Build a working list:

```text
| Source        | Type        | Content (short)                    | Implication |
|---------------|-------------|------------------------------------|-------------|
| 2026-02-10_multi-ide | Correction | Report format: one comprehensive  | Single report by theme, no duplication |
| 2026-02-10_multi-ide | Learning   | Builder values conciseness        | Keep reports 1-2 pages, one pass |
```

### 3. Map to Profile Sections

`memory/collaboration.md` has these sections (keep this structure):

- **Working Patterns** — How the builder likes to work (planning, review, handoffs)
- **Design Philosophy** — Preferences on design, scope, integrations
- **Process Preferences** — Backlog, scratchpad, PRD vs enhancements, closing projects
- **Areté Product Strategy** — Product OS, primitives, integration moat (update only when strategy changes)
- **Writing & Communication** — Tone, length, format (add when observed)
- **Corrections** — Explicit corrections; append new, keep date and one-line summary

Map each extracted item to the best section. Prefer merging into existing bullets over duplicating. If the same theme appears in multiple entries, **merge into one bullet** with the clearest implication.

### 4. Merge (No Duplication)

- **Add new**: Observations that aren’t already reflected in the profile.
- **Strengthen existing**: If a bullet already captures the idea, add a date or nuance only if it adds value.
- **Corrections**: Always append to **Corrections** with format `- **Short title** (YYYY-MM-DD): One-line description.`
- **Prune**: Remove or shorten bullets that are obsolete or superseded (rare; when in doubt, keep and add "Superseded by..." only if clear).

Do **not** repeat the same learning in multiple sections. One theme = one place in the profile.

### 5. Write Updated collaboration.md

- Keep the header and "How This Works" as-is unless they need a one-time clarification.
- Update each section with merged content. Use bullets; keep language in second person or "Builder prefers / Values..."
- Update **Last Synthesized** at the bottom:

```markdown
## Last Synthesized

YYYY-MM-DD — [One-line summary of what was added or changed].
```

### 6. Report to Builder

Output:

```markdown
# Collaboration profile updated

**Scope**: [X] entries reviewed (since [date] / last [N] entries).
**Sources**: [List entry slugs that contributed].
**Changes**:
- [Section]: [what you added or changed]
- Corrections: [N] new item(s) added
**Last Synthesized**: [date] — [summary]

Review `memory/collaboration.md` and edit if anything is off. No need to re-run unless more entries with learnings accumulate.
```

If **nothing new** to add (all learnings already in profile):

```markdown
# Collaboration profile — no changes

**Scope**: [X] entries reviewed (since [date]).
**Result**: All learnings already reflected in profile. No edits made.
**Suggestion**: Run again after 5–10 more entries with Learnings, or after the next major build phase.
```

## Output Format

- **During execution**: Don’t paste the full profile; only report scope, sources, and changes.
- **Final output**: Use one of the two report blocks above (updated vs no changes).

## Success Criteria

- Entries in scope were read and Learnings/Corrections extracted.
- Profile sections updated without duplicate or contradictory bullets.
- Corrections appended with date and one-line description.
- "Last Synthesized" updated.
- Builder gets a short, actionable report.

## How This Is Triggered

| Trigger | How |
|--------|-----|
| **Manual** | Builder says "synthesize collaboration profile" or "update collaboration from entries". Agent loads this skill and runs the workflow. |
| **After prd-post-mortem** | prd-post-mortem skill ends with: "Consider running **synthesize-collaboration-profile** to push learnings into collaboration.md." Builder or next agent can run it. |
| **After entries accumulate** | agent-memory.mdc says to offer synthesis when "several entries have accumulated learnings". Agent offers: "Several entries have Learnings. Should I run the synthesize-collaboration-profile skill?" |
| **Periodic** | Builder schedules (e.g. monthly) or sets a reminder. No automatic trigger; skill is always on-demand or offered. |

**No automatic/scheduled execution** — the skill runs when the builder (or an agent following the rules) explicitly runs it or is prompted to offer it.
