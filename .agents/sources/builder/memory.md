# Build Memory

Institutional knowledge for developing Areté. This system helps you work effectively with the builder and avoid repeating mistakes.

## Memory Locations

| Content | Location |
|---------|----------|
| Architecture decisions, refactors, tooling changes | `memory/entries/YYYY-MM-DD_slug.md` |
| Collaboration observations (in entry Learnings section) | `memory/entries/YYYY-MM-DD_slug.md` |
| Synthesized builder collaboration profile | `memory/collaboration.md` |
| Index of all entries | `memory/MEMORY.md` |
| "Park this for later" | `scratchpad.md` |

**Do not** write to `memory/items/` or `.arete/memory/` — those are product templates for end users.

## Leverage Build Memory

Before substantive work:

1. **Read `memory/collaboration.md`** — patterns, preferences, and Corrections to avoid repeat mistakes
2. **Scan `memory/MEMORY.md`** — recent entries relevant to your task
3. **Read specific entries** if the task relates to a documented decision or pattern

This prevents repeating mistakes and ensures you work in a way the builder prefers.

## When to Create Entries

Create an entry (`memory/entries/YYYY-MM-DD_slug.md`) after work that meets any of these criteria:

- Refactors (especially multi-file or architectural)
- Tooling changes (test setup, build scripts, CLI commands)
- Architectural decisions (new patterns, file structure changes)
- Breaking changes or migrations
- Fixes worth remembering (subtle bugs, gotchas)
- Anything you'd want to remember in 6 months

**Entry format:** `YYYY-MM-DD_slug.md` (e.g. `2026-02-13_dev-cleanup-phase-1-learnings.md`)

## Entry Structure

Each entry should include:

### Required Sections

- **What changed** — Brief summary of the work completed
- **What worked well** — Patterns to repeat (e.g., "Parallel subagent execution for simple moves")
- **What didn't work** — Patterns to avoid (e.g., "Assumed docs scope without checking backlog")
- **Learnings for next time** — Concrete improvements (e.g., "Add documentation planning checklist to dev.mdc")

### Optional Sections

- **Learnings / Collaboration Patterns** — How the builder works, preferences, corrections
- **Learnings / Corrections (for collaboration.md)** — Explicit corrections to apply to the collaboration profile
- **Execution Path** — Which execution path was used (Direct / PRD / Direct + pre-mortem)
- **Pre-mortem effectiveness** — Risks identified vs. risks materialized
- **Metrics** — Tasks completed, tests added, files changed, token usage

### Learnings Section (Collaboration)

If you noticed collaboration patterns during the work, include them in a **Learnings** section:

```markdown
## Learnings

### Collaboration Patterns

- **Builder preference:** [observation about how builder likes to work]
- **Corrections:** [if builder corrected you, document here]
- **What worked:** [interaction patterns that went well]
- **What didn't work:** [patterns to avoid]
```

These observations feed into `memory/collaboration.md` via the `synthesize-collaboration-profile` skill.

## Index Updates

After creating an entry, add a line to `memory/MEMORY.md` (top of Index section):

```markdown
- YYYY-MM-DD [Title](entries/YYYY-MM-DD_slug.md) — one-line summary
```

## Entries vs Scratchpad vs Backlog

| Content | Location | Examples |
|---------|----------|----------|
| **What happened** — decisions, changes, learnings | `memory/entries/` | Refactors, architectural decisions, methodology findings |
| **Raw or underdeveloped ideas** | `scratchpad.md` | "We should eventually build onboarding"; quick capture, parking lot |
| **Mature future work** — discussed, with a plan | `dev/backlog/` | Idea + general plan, enough detail to become a PRD |

**Do not** put backlog items or future work in entries. Entries record what was decided or done; scratchpad and backlog record what might be done.

## Collaboration Profile (collaboration.md)

`memory/collaboration.md` is a synthesized profile of how to work with the builder, derived from **Learnings** sections in entries.

### When to Synthesize

Run `.agents/skills/synthesize-collaboration-profile/SKILL.md` when:

1. **Builder asks** — "Synthesize collaboration profile", "Update collaboration from entries"
2. **After PRD post-mortem** — prd-post-mortem skill suggests synthesis
3. **Several entries with Learnings** — 5+ new entries include Learnings or Corrections sections
4. **After major build phase** — Large feature complete, multi-PRD run done
5. **Periodic** — Monthly or every 10 entries with Learnings

**Do not** synthesize after every single entry; batch so the profile evolves in coherent passes.

### What Goes in collaboration.md

- Builder's working style and preferences
- Communication patterns (e.g., "Prefers brief summaries over detailed explanations")
- Corrections from previous mistakes
- Task breakdown preferences
- Documentation preferences
- Quality standards and expectations

### How It's Used

At the start of new build conversations, agents read `memory/collaboration.md` to immediately understand how to work with the builder. This creates continuity across sessions.

## Auto-Capture Corrections

When the builder corrects you during a session:

1. **Automatically add to the entry's Learnings section** (don't ask)
2. **If this is a recurring correction**, mark it for `memory/collaboration.md`
3. **Document under "Learnings / Corrections"** in the entry

This ensures corrections are captured and fed into the collaboration profile.

## Prompt to Add Memory

After a notable refactor, tooling change, architectural decision, or fix worth remembering, **ask the builder:**

> "Should I add this to build memory (memory/MEMORY.md)?"

If yes, create a dated entry and add a line to the index. Include a **Learnings** section if you noticed collaboration patterns during the session.

## Execution Path Tracking

In each memory entry, include a brief "Execution Path" section:

```markdown
## Execution Path
- **Size assessed**: Small / Medium / Large
- **Path taken**: Direct / Direct + pre-mortem / PRD
- **Decision tree followed?**: Yes / No / Partially
- **Notes**: (e.g., "Builder chose direct over recommended PRD")
```

This creates a lightweight audit trail for execution path decisions.

## Examples

See `memory/entries/` for real examples of well-structured entries:

- `2026-02-13_dev-cleanup-phase-1-learnings.md` — Comprehensive PRD execution learning
- `2026-02-13_multi-ide-path-fix.md` — Bug fix with architectural implications
- `2026-02-13_quality-practices-abstraction.md` — Methodology change with pre-mortem analysis

## References

- **Full memory guidance:** `.cursor/rules/agent-memory.mdc`
- **Memory index:** `memory/MEMORY.md`
- **Collaboration profile:** `memory/collaboration.md`
- **Synthesize skill:** `.agents/skills/synthesize-collaboration-profile/SKILL.md`
