---
name: inbox-triage
description: Classify, route, and extract insights from inbox items using workspace context
work_type: operations
category: default
triggers:
  - triage my inbox
  - process inbox
  - what's in my inbox
  - inbox triage
  - check inbox
primitives:
  - User
  - Problem
intelligence:
  - entity_resolution
  - memory_retrieval
  - context_injection
integration:
  outputs:
    - type: resource
      path: "{destination}"
      index: true
---

# Inbox Triage Skill

Classify inbox items by content type, match against workspace entities (projects, areas, goals, people), and route to the right destination — with user approval before any files move.

**Default behavior**: Scan all unprocessed inbox items, present a triage plan, wait for approval.

## When to Use

- "triage my inbox"
- "process inbox"
- "what's in my inbox"
- "inbox triage"

## Workflow

### 1. Scan and Inventory

List all files in `inbox/` (excluding `README.md`).

Separate into:
- **unprocessed**: files with `status: unprocessed`, no status field, or no frontmatter
- **needs-review**: files previously flagged for user decision

Report inventory:

```
Found N unprocessed items and M items needing review.
```

If `needs-review` items exist, present them first for user decision before processing new items.

If inbox is empty, say so and stop.

### 2. Assemble Context Bundle

Before analyzing content, build a context bundle following the **context_bundle_assembly** pattern (see [PATTERNS.md](../PATTERNS.md) § context_bundle_assembly):

1. **Strategy & goals** — `arete search "inbox triage" --scope context --limit 3`. Max 300 words each.
2. **Active areas** — List all `areas/*.md` files with `status: active`. Note their goals and focus sections.
3. **Active projects** — List all `projects/active/*/README.md` files. Note descriptions and current status.
4. **Existing memory** — `arete search "recent decisions" --scope memory --limit 5`. Max 200 words each.
5. **People context** — List people slugs from `people/` for entity matching (names only, not full profiles).

This bundle is assembled once and reused for all items in the batch.

### 3. Analyze Each Item

For each unprocessed item, apply the **significance_analyst** pattern (see [PATTERNS.md](../PATTERNS.md) § significance_analyst):

**3a. Read content**

Parse the file. Extract any existing frontmatter. Handle file types by tier:

| Tier | Formats | Handling |
|------|---------|----------|
| **Guaranteed** | `.md`, `.txt` | Read content directly |
| **Best-effort** | `.pdf` | Read and analyze; if agent can't parse, create companion `.md` stub with `status: needs-review` |
| **Environment-dependent** | `.png`, `.jpg`, `.webp` | Use vision to describe and extract text; if unavailable, create stub: "image file, manual review needed" |
| **Unsupported** | Other binary | Flag as `status: needs-review` with note. Never fail silently. |

**3b. Classify content type**

- article / blog post
- research paper / report
- meeting note / conversation
- person-specific intel
- raw note / thought
- decision / announcement
- reference material
- screenshot / image
- unsupported binary

**3c. Extract entities**

Match against workspace data:
- **People**: Match names/emails against `people/` directory
- **Projects**: Match topics/keywords against active projects
- **Areas**: Match themes against area definitions and recurring meetings
- **Goals**: Match content against active goals

**3d. Assess significance**

Using the context bundle:
- Is this actionable or reference material?
- Does it connect to a current goal, project, or area?
- Does it contain decisions, learnings, or observations worth capturing in memory?
- Does it contradict or reinforce existing decisions?

**Grounding directive**: Cite specific bundle content that makes the routing decision. If you cannot cite specific context, routing confidence drops.

**3e. Decide routing destination**

| Destination | When to route here | Example |
|------------|-------------------|---------|
| `projects/active/{slug}/inputs/` | Content clearly maps to an active project | Research article matching a discovery project |
| `areas/{slug}/` (as reference note) | Content relates to an area but no specific project | Industry trend relevant to a responsibility area |
| `resources/notes/` | General reference material, no clear project/area match | Interesting article, useful but not urgent |
| `resources/conversations/` | Conversation captures, interview notes | Slack thread, email exchange |
| `people/{slug}/` | Person-specific intel (profile info, preferences) | LinkedIn profile, bio, contact info |
| `.arete/memory/items/` | Contains decisions, learnings, observations to append | Key insight for institutional memory |
| `inbox/` (stays) | Confidence < 0.6 or ambiguous routing | Interesting but unclear where it belongs |

Assign a confidence level: high (>= 0.8), medium (0.6-0.8), or low (< 0.6).

**3f. Generate summary**

2-3 sentence summary of the content and why it's being routed to that destination.

### 4. Present Triage Plan

**Do not move files automatically.** Present the triage plan as a table:

```markdown
## Inbox Triage Plan

| # | Item | Type | Route to | Confidence | Why |
|---|------|------|----------|------------|-----|
| 1 | competitive-analysis.md | article | projects/active/market-research/inputs/ | high | Matches active market-research project; cites Q2 competitive analysis goal |
| 2 | interesting-thread.md | conversation | resources/conversations/ | medium | Slack thread with customer feedback; no clear project match |
| 3 | random-thought.md | note | inbox/ (stays) | low | Unclear routing -- needs your input |

### Items needing your input:
- **random-thought.md**: Could be relevant to [area-x] or [project-y]. Where should this go?

### Memory updates:
- **competitive-analysis.md** contains a decision: "Competitor X pivoted to API-first" -- append to `.arete/memory/items/learnings.md`? (Significant because it relates to our own API-first goal)

Approve all? [Y] Apply all  [N] Skip all  [1,2] Select items  [E] Edit routing
```

**Approval gate rules:**
- High confidence (>= 0.8): Recommended to apply, but still needs approval
- Medium confidence (0.6-0.8): Presented with reasoning, user decides
- Low confidence (< 0.6): Stays in inbox, user prompted for routing decision
- Memory updates: Always require explicit approval

### 5. Execute Approved Routing

For each approved item:

1. **Move file** to destination directory. For binary files with companion `.md`, move both together.
2. **Update frontmatter**: Set `status: triaged`, add `triaged_to: <destination>`, add `triaged_date: <ISO date>`.
3. **Memory updates**: If approved, append to the appropriate `.arete/memory/items/` file (decisions.md, learnings.md, or observations.md).
4. **Index**: Run `arete index` once after all files are moved so new locations are searchable.

### 6. Report

```markdown
## Triage Complete

Processed: N items
- Routed: X items
- Kept in inbox: Y items (needs review)
- Memory updates: Z items added

Inbox remaining: R unprocessed items
```

## Error Handling

| Error | Resolution |
|-------|-----------|
| Empty inbox | Report "Inbox is empty" and stop |
| Unreadable file | Flag as `status: needs-review` with note, continue with other items |
| No workspace context | Proceed with content-only analysis, note: "Limited context — routing based on content type only" |
| User declines all | Keep all items in inbox, no changes made |

## References

- **Patterns**: [PATTERNS.md](../PATTERNS.md) § context_bundle_assembly, § significance_analyst, § research_intake
- **CLI**: `arete inbox add`, `arete search`, `arete index`
- **Workspace**: `inbox/` directory, `inbox/README.md`
- **Related**: `research_intake` is project-scoped (processes `inputs/` within a project). `inbox_triage` is workspace-scoped (processes top-level `inbox/`). Triage may route TO a project's `inputs/`, where `research_intake` later processes.
