---
name: project
description: Open a project with holistic context — the project brief (background, recent area meetings, open commitments, decisions, related wiki topics, siblings) plus what changed since the README was last touched. Read-only.
triggers:
  - open project
  - /project
  - work on project
  - let's work on
  - pull up project
  - project context for
  - load project
  - load the project
  - load up
  - review project
  - look at project
  - look at the project
work_type: general
category: essential
primitives: []
intelligence:
  - context_injection
requires_briefing: false
---

# Project Skill

Open a project with its full surrounding context in one move: `/project <name>` resolves the project, assembles the brief (README context + recent area meetings + open commitments + decisions/learnings + related wiki topics + sibling projects), and shows what changed since the README was last touched.

**This flow is READ-ONLY. Opening a project NEVER writes to the project README or any other workspace file.** It computes relevant context for display only. Write-back belongs to a separate, approval-gated flow (`/update-project` — see `update-project/SKILL.md`) — never to open.

## When to Use

- "/project glance-2-mvp"
- "open the status letter project"
- "let's work on inbound emails"
- "pull up project context for claims review"
- "load project glance-2-roadmap and review" (any load/review/look-at phrasing
  that names a project means THIS flow — use the assembled CLI surface, do
  not freestyle with manual file reads)

## Workflow

### 0. No slug given → list and let the user pick (don't make them remember the slug)

If the user invoked `/project` with **no name** ("/project", "open a project", "which projects do I have"), run:

```
arete project list --json
```

Present a **numbered** list (slug — name — area — status, most-recently-touched first) and ask which one. **Never auto-open** — this mirrors the disambiguation rule. Once the user picks, re-run step 1 with the exact slug. Empty workspace → say "No active projects" and stop.

### 1. Resolve and Open (CLI is the data path)

Run:

```
arete project open "<name>" --json
```

**No LLM in the data path** — the CLI performs deterministic resolution and assembly. Your judgment applies only ON TOP of the returned context (summarizing, suggesting next steps), never inside retrieval. If the returned envelope has a `resume` block (the "where you left off" note from a prior `/project-exit`), surface it FIRST — it's the catch-up signal.

### 2. Handle the Three Response Shapes

**a) Disambiguation** (`disambiguation: true`): the name matched multiple projects with close scores. **Never auto-pick.** Show the candidates (slug + score, archived labeled) and ask the user which one, then re-run with the exact slug.

**b) Archived** (`archived: true`): tell the user the project is archived and where it lives. Offer to read the archived README directly if they want it — still read-only.

**c) Brief** (normal case): present the context, leading with what's most actionable.

### 3. Present

- **Header**: project name, area (or the "No area resolved" line verbatim if present — it tells the user how to fix it), status, Jira refs when present.
- **What's new since last touched**: meetings, refreshed wiki topics, newly-opened commitments. This is the "catch me up" signal — lead with it when non-empty.
- **Brief sections**: background/status excerpt, recent activity, open work, decisions & learnings, related wiki pages, sibling projects.
- **ALWAYS show the Sibling-projects and Related-wiki-pages sections when they are present in the CLI output** — never drop them as "secondary" detail; they are the cross-project and knowledge edges the user opened this flow to get. When a section is absent from the CLI output, say so in one line ("No siblings / no wiki pages matched") instead of silently omitting it.
- Then offer to dig in: open a wiki topic, prep for a related meeting, review open commitments.

### 3a. When the user works from here — adopt the project-agent disposition

Opening is read-only and the brief is a *starting signal*, not verified truth. The moment the user starts **working or reviewing** from this project — drafting or updating an agenda, deciding something, asking "is this still right?", reconciling tickets — **adopt the `.agents/profiles/project-agent.md` disposition** for the rest of the conversation:

- **Read the real body, not just the brief.** `arete project open` does NOT surface the README's own `## Decisions` block and returns zero Jira — read `## Decisions` / `## Open Questions` and recent `working/` docs directly.
- **Verify Jira live.** Before repeating any ticket title/status/owner, check it against the Atlassian MCP. Flag any decision that a later one superseded; don't silently pick.

This is the SAME disposition agenda prep uses (one shared source, so the two can't drift). **Live-grounding is on-when-working, OFF on a bare open / "catch me up"** — keep plain opens fast and read-only. This is a reasoning posture, not a write: it does not change the read-only-on-open boundary below.

### 4. Boundaries

- **Never write to the project README on open** — no topics cache, no status updates, no frontmatter edits. If the user asks to update the project, that is a different flow; do the edits they explicitly approve, never as a side-effect of opening.
- If the brief shows the "No area resolved" line, suggest `arete project backfill-area` (preview first) or adding `area:` to the README — don't add it yourself unprompted.

## Rollback

Skill prose only — `git revert` of the commit that added this file removes the flow; the underlying CLI (`arete project open`) is independent.
