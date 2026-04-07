---
title: "Inbox: Universal Content Ingest & Triage"
slug: inbox-triage
status: draft
size: medium
tags: [inbox, ingest, triage, skill, workspace]
created: "2026-04-06T00:00:00.000Z"
updated: "2026-04-06T00:00:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Inbox: Universal Content Ingest & Triage

## Context

Areté ingests structured data from integrations (meetings, calendar, Fathom, Slack) but has no general-purpose path for "I found something interesting and want it in my workspace." Users currently have no friction-free way to dump a URL, article, PDF, screenshot, or raw note and have it end up in the right place.

Karpathy's LLM Knowledge Bases tweet (April 2026) describes exactly this pattern: raw data → indexed directory → LLM compiles and routes. Areté already has the compile/route infrastructure — it just lacks the front door.

**Inspiration:** https://x.com/karpathy/status/2039805659525644595

### What exists today

- `templates/inputs/` — integration transform templates (meeting-note, integration-meeting). Not user-facing.
- `resources/notes/` — defined in workspace structure, mostly unused.
- `projects/{active}/inputs/` — project-scoped research inputs. Too specific for general capture.

### Design decision

Use a **top-level `inbox/`** directory in the workspace as the universal drop zone. Separate from `templates/inputs/` (which serves a different purpose) and `resources/` (which is for processed, categorized content).

---

## Critical Files

| File | Role |
|------|------|
| `packages/core/src/workspace-structure.ts` | Add `inbox/` to workspace dirs |
| `packages/cli/src/commands/clip.ts` | **New** — `arete clip <url>` command |
| `packages/runtime/skills/inbox-triage/SKILL.md` | **New** — triage skill definition |
| `packages/runtime/templates/inbox/clipped.md` | **New** — template for clipped web content |
| `packages/core/src/search/qmd-setup.ts` | Ensure `inbox/` is indexed for search |

---

## Plan

### Step 1 — Add `inbox/` to workspace structure

**Before starting**: Read `packages/core/src/workspace-structure.ts` in full, and check how `arete install` and `arete update` create directories.

- Add `'inbox'` to the workspace directories array in `workspace-structure.ts`
- Ensure `arete install` creates the directory for new workspaces
- Ensure `arete update` creates it for existing workspaces
- Add `inbox/` to QMD search scope so contents are searchable via `arete context --for`
- Add a brief `inbox/README.md` template (one-liner explaining "drop anything here for triage")

**AC**: `arete install` on a fresh workspace creates `inbox/`. `arete context --for` searches inbox contents. `arete update` on existing workspace adds the directory.

---

### Step 2 — `arete clip <url>` command

**Before starting**: Read an existing simple CLI command (e.g. a command that takes a single argument, fetches content, and writes a file) to understand the command pattern.

Build a CLI command that:

1. Takes a URL as argument
2. Fetches the page content and converts to markdown (use an existing markdown conversion approach or a simple HTML-to-markdown pass)
3. Downloads referenced images to `inbox/{slug}/images/` (optional — skip if complex, can be a follow-up)
4. Writes to `inbox/{slug}.md` with frontmatter:
   ```yaml
   ---
   source: <url>
   clipped: <ISO date>
   title: <extracted page title>
   status: unprocessed
   ---
   ```
5. Prints confirmation with file path

**Stretch (not required for v1):**
- `arete clip --from-clipboard` for pasting raw text
- `arete clip <filepath>` for local files (copy + add frontmatter)

**AC**: `arete clip https://example.com/article` creates `inbox/article.md` with frontmatter and readable markdown content. File is searchable via `arete context --for`.

---

### Step 3 — `inbox-triage` skill

**Before starting**: Read `packages/runtime/skills/synthesize/SKILL.md` and one other skill definition to understand the skill pattern. Read the workspace structure to understand valid routing destinations.

Create an `inbox-triage` skill that:

1. **Scans** `inbox/` for files where `status: unprocessed` (or no status)
2. **For each item**, the LLM:
   - Classifies content type (article, meeting note, research, person info, decision, etc.)
   - Extracts entities (people, projects, areas) by matching against existing workspace data
   - Generates a brief summary
   - Decides routing destination:
     - `resources/notes/` — general reference material
     - `resources/conversations/` — conversation captures
     - `projects/{active}/inputs/` — project-specific research (if a project match is clear)
     - `people/{slug}/` — person-specific intel
     - `inbox/` — stays if unclear (marks as `status: needs-review` with a note)
3. **Moves** the file to the destination
4. **Updates context** — if the content contains decisions, learnings, or observations, appends to the appropriate memory items file. If it's relevant to an area, notes the connection.
5. **Reports** what was triaged and where

The skill should be conservative: if routing is ambiguous, leave it in inbox with a note rather than misfile it.

**AC**: Dropping 3 different types of content into `inbox/`, running the triage skill, and seeing each routed to the correct destination with context files updated.

---

### Step 4 — Integration with existing workflows

**Before starting**: Read how `arete pull` works and how `arete status` reports workspace health.

- `arete status` shows inbox item count (e.g., "Inbox: 3 unprocessed items")
- Consider whether `inbox-triage` should run automatically after `arete pull` or stay manual-only (recommend: manual-only for v1, automatic as opt-in later)
- Ensure triage skill is listed in `arete skill list`

**AC**: `arete status` shows inbox count. Skill appears in skill list.

---

## Open Questions

1. **Image handling**: Should `arete clip` download images locally? Adds complexity but makes content self-contained. Could defer to v2.
2. **Bulk ingest**: Should there be an `arete clip` batch mode for multiple URLs? Or is the skill itself the batch processor (user dumps multiple files, runs triage once)?
3. **Triage frequency**: Manual-only vs. hook into `arete pull`? Manual is safer for v1.
