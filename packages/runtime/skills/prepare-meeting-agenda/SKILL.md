---
name: prepare-meeting-agenda
description: Create a structured meeting agenda with type-based sections and optional time allocation. Use when the user wants to build an agenda document for an upcoming meeting (leadership, customer, dev team, 1:1, or other).
triggers:
  - meeting agenda
  - create agenda
  - prepare agenda
  - agenda for
  - build agenda
  - create meeting agenda
  - prepare meeting agenda
primitives:
  - User
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
requires_briefing: false
---

# Prepare Meeting Agenda Skill

Produce a **structured meeting agenda** (sections, optional time allocation) for an upcoming meeting. Choose or infer meeting type, load a template, gather context when it adds value (see step 4), then build and save the agenda.

## When to Use

- "Create a meeting agenda for my 1:1 with Jane"
- "Prepare an agenda for the leadership sync"
- "Build an agenda for this customer call"
- When the user wants a **document** they can save or share (not just a prep brief)

## Related: meeting-prep

- **meeting-prep**: Builds a **prep brief** (attendees, recent meetings, action items, talking points). Use when the user says "prep me for my meeting with Jane" or "call with Acme".
- **prepare-meeting-agenda**: Builds a **structured agenda document** with sections and time allocation. Use when the user says "create an agenda" or "prepare an agenda for this meeting".

Use **meeting-prep** for context and talking points; use **prepare-meeting-agenda** when the deliverable is an agenda document to save or share.

## Workflow

### 1. Identify Meeting

- If calendar is configured: run `arete pull calendar --today --json` (or `--days 7`) and list events; user picks one. Use event title, duration, and attendees.
- Otherwise: ask for meeting title, date, duration (optional), and attendee names.

### 2. Select or Infer Meeting Type

Use the **context inference rules** below to suggest a type. User can override.

| Type        | Title / context signals                    | Attendee signals                    |
|------------|---------------------------------------------|-------------------------------------|
| 1:1        | "1:1", "one-on-one", "1:1 with", "check-in" | Single attendee                     |
| leadership | "leadership", "exec", "sync", "staff"        | Multiple; exec/staff                |
| customer   | "customer", "QBR", "partner", "client"      | External domain / customers/       |
| dev-team   | "dev", "engineering", "sprint", "standup"    | Engineering / dev                  |
| other      | (default)                                   | No strong signal                   |

### 3. Choose Template

**Load agenda template** - run this command (replace `{type}` with `one-on-one`, `leadership`, `customer`, `dev-team`, or `other`) and use its output as the agenda structure. Do not add sections from elsewhere:
```
arete template resolve --skill prepare-meeting-agenda --variant {type}
```
The command output defines the complete section structure. If the user wants a different type, switch and re-run the command.

### 4. Gather Context (REQUIRED — verb invocation is the gate)

**Always invoke** `arete brief --meeting "<exact meeting title>"` as your first action. The brief verb is the single source of truth for context aggregation. Do NOT shortcut by reading person files directly with the Read tool — that path produces the regressed thin-template output and is what Phase 9 was built to replace.

Only fall back to per-attendee briefs (`arete brief --person <slug>` for each attendee) when `arete brief --meeting` returns the `(unresolved — no calendar match, no saved file)` AC4d path.

If you want richer person memory before composing, run `arete people memory refresh --person <slug> --if-stale-days 3 --skip-qmd` to refresh stale stances. The `--skip-qmd` flag prevents the auto-index output from being surfaced to the user as a status prompt.

**Critical: brief section names are NOT agenda section names.** The brief returns sections like `## Open commitments touching this group`, `## Related wiki pages`, `## Attendees`. These are organizational headers in the *input*, not headers for the *output*. **Synthesize themed agenda sections** named by topic (e.g., "Glance 2.0 Roadmap — Start the Conversation", "Discovery Process Update", "30/60/90 Surface", "Carries"). Each themed section should weave together signal from multiple brief sections.

**Concrete synthesis pattern**:
- Read the brief output top-to-bottom.
- Identify 3-6 themes the meeting needs to cover. Themes come from cross-source signal: an open commitment + a related decision + a wiki callback = one themed section.
- For each theme, draft a section with: short framing prose, 2-4 specific bullets citing commitment IDs/meeting dates/wiki pages, an "ask" or "decision needed" framing line where appropriate.
- Do not pattern-fill the template's generic sections (Priorities / Feedback / Next Steps) without synthesizing first. Those sections belong AT THE END after the themed sections.

Example agenda quality bar: `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158. Themed sections ("Glance 2.0 Roadmap — Start the Conversation (20min)", "Discovery Process Update (10min)"), specific commitment IDs ("commitment 45ef9b64"), prior-conversation callbacks ("Per our 4/22 conversation, past misfires came from leadership defining the experience before adjuster-driven research"). That's the target shape.

Do not reimplement calendar or context logic; use existing commands and patterns only.

### 5. Build Agenda

- Start from the template's ## sections.
- If duration is known, apply **time allocation** from the template (e.g. "Updates (10 min)").
- Inject any suggested items from context into the right sections.
- Output format (see below): `# Meeting Agenda: [Title]`, metadata, ## sections with optional (Xmin), bullets and checkboxes.

### 6. Review and Adjust

- Present the draft. Offer to add, remove, or reorder items. (Inline section customization is out of scope for v1; document the workflow only.)

### 7. Save or Copy

- Offer to save to: `now/agendas/YYYY-MM-DD-meeting-title.md` (primary), or `projects/active/[project]/agendas/[title].md` if project-specific, or copy to clipboard only.
- Suggest running **process-meetings** after the meeting to capture notes and propagate decisions/learnings.

## Output Format

Produce markdown with **YAML frontmatter** for automatic meeting linking:

```markdown
---
meeting_title: "John / Lindsay 1:1"  # REQUIRED: Exact calendar event title for auto-linking
date: 2026-03-25
type: one-on-one
attendees:
  - Lindsay Gray
---

# 1:1: Lindsay Gray

## [Section 1] (Xmin)
- Bullet or suggested item
- [ ] Action item if applicable

## [Section 2] (Xmin)
...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `meeting_title` | **Yes** | Exact calendar event title (e.g., "John / Lindsay 1:1"). This enables automatic linking when the meeting is processed via Fathom/Krisp. |
| `date` | Yes | Meeting date in YYYY-MM-DD format |
| `type` | No | Meeting type (leadership, customer, dev-team, one-on-one, other) |
| `attendees` | No | List of attendee names |
| `status` | No | Set to `processed` after meeting is processed |

**Why `meeting_title` matters**: When you sync a meeting from Fathom or Krisp, the meeting file uses the calendar event title. By storing the exact same title in the agenda's frontmatter, `process-meetings` can automatically link them — no fuzzy matching required.

Use template section names and optional time from template's `time_allocation` when duration is known.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) - get_meeting_context (for suggested items)
- **Quarter goals**: `goals/quarter.md`
- **Week plan**: `now/week.md`
- **Meetings**: `resources/meetings/index.md` (high-level themes); latest 2-3 files in `resources/meetings/` (summaries, key points for agenda ideas)
- **Calendar**: `arete pull calendar --today --json` or `--days N`
- **Templates**: `arete template list meeting-agendas`, `arete template view meeting-agenda --type <type>`
- **Save location**: `now/agendas/` (primary); project folder or clipboard as alternatives
- **Related skills**: meeting-prep (prep brief), process-meetings (run after the meeting)

