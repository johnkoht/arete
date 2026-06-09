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

### 4. Gather Context + Pre-Seed the Agenda (REQUIRED — verb invocation is the gate)

**Always invoke `arete agenda scaffold --meeting "<exact meeting title>"` as your first action.** This is the gate. The scaffold verb internally calls the typed `arete brief --meeting` aggregator AND pulls the qualitative person-file signal the brief alone does not surface (`## 1:1 Discussion Topics` / `## Standing 1:1 Discussion Prompts`, `## Next 1:1 Focus`), then routes every candidate into the meeting-type template's sections. It returns a **pre-populated agenda skeleton**: each themed section already filled with real candidate bullets (open commitments with IDs, recent-meeting callbacks, discussion-topic questions, owed-sweep items, wiki callbacks), each tagged with its `[source]`.

```
arete agenda scaffold --meeting "Anthony / John Weekly"
# options: --type <one-on-one|leadership|customer|dev-team|other> (default: inferred)
#          --project <slug>   (pin project context)
#          --json             (structured output)
```

Your job is **CURATE + FRAME, not synthesize from an empty template**:
- Read the scaffold top-to-bottom. The framing block (carried from `## Next 1:1 Focus`) is your meeting lead-in — use it.
- For each section: keep/cut/merge the candidate bullets into specific talking points, add a one-line framing lead-in, and **strip the `[source]` tags**. Where a `## 1:1 Discussion Topics` / `## Standing 1:1 Discussion Prompts` question fits a theme, weave it in verbatim.
- **The `## Cross-cutting / touches their lane` block is the OWNER's own/global ledger, not this person's owed-items.** It is context, not the primary agenda. Pull an item up into a themed section ONLY when it needs THIS person's input or a handoff. Do NOT paste the whole block into Priorities — that is the regression this bucket exists to prevent.
- **Route the `## Unrouted signal` block**: place each candidate into a section above or drop it deliberately — never silently ignore it.
- **An `_EMPTY — ...` line is an explicit FAILURE STATE, not acceptable output.** When a section is empty, either synthesize from the brief signal or replace the line with a one-line honest reason it is empty. Never ship a section whose only content is the EMPTY placeholder.

Do NOT shortcut by reading person files directly with the Read tool — that path produces the regressed thin-template output. Only fall back to per-attendee briefs (`arete brief --person <slug>`) when the scaffold prints the `(unresolved — ...)` title-only note.

If you want richer person memory before composing, run `arete people memory refresh --person <slug> --if-stale-days 3 --skip-qmd` first, then re-run the scaffold.

**Critical: scaffold/brief section names map to agenda sections, but candidate bullets are RAW signal, not finished agenda lines.** Frame them. The target shape: themed sections with short framing prose, specific bullets citing commitment IDs / meeting dates / wiki pages, and an "ask" or "decision needed" line where appropriate.

Example agenda quality bar: `resources/meetings/2026-04-29-john-lindsay-11.md` lines 88-158 and `resources/meetings/2026-04-28-anthony-john-weekly.md` lines 57-105. Themed time-boxed sections ("Glance 2.0 Roadmap — Start the Conversation (20min)", "Discovery Process Update (10min)", "Status Letters — Lock the TDD (12min)"), specific commitment IDs ("commitment 45ef9b64"), discussion-topic questions woven in verbatim, prior-conversation callbacks ("Per our 4/22 conversation, past misfires came from leadership defining the experience before adjuster-driven research"). That is the target shape — the scaffold hands you the raw materials; you frame them to this bar. Match its depth.

Do not reimplement calendar or context logic; use existing commands and patterns only.

### 4b. Batch mode — anti-degradation rule (LOAD-BEARING)

If you are preparing agendas for **more than one meeting in this run** (a batch), this is the confirmed failure mode (F3): the cheap section (Priorities) gets filled and the expensive qualitative synthesis (Feedback/Growth, themed sections, callbacks) gets skeletoned for all of them. **Do NOT let this happen.**

Treat each agenda as a fully independent task:
- Run steps 4 → 5 → 5a (self-check) **per meeting, start to finish, before moving to the next meeting.** Do not scaffold all meetings first and then mass-produce skeletons.
- There is NO shared shortcut, no "same template for all," no "Priorities-only" batch output. Every agenda in the batch gets the full per-agenda curation + framing pass and must independently pass the step-5a self-check.
- The quality bar does NOT drop because there are more meetings. An agenda generated as #4 of 4 must be as deep as one generated alone. If you are running low on effort, do FEWER agendas fully rather than MORE agendas thinly.

See PATTERNS.md → `get_meeting_context` → "Batch anti-degradation" for the recorded anti-pattern.

### 5. Build Agenda — split into named, themed, time-boxed sections

- **Start from the scaffold output (step 4), not the bare template.** The scaffold carries the template's generic `## ` sections (Priorities / Feedback and Growth / Support and Blockers / Next Steps) + time-boxes + pre-seeded candidates. Those generic headings are SCAFFOLDING, **not** the deliverable.
- **Split the seeded candidates into 2–4 named, THEMED, time-boxed sections** — the April quality bar. A theme comes from cross-source signal: an open commitment + a related decision + a recent-meeting callback + a discussion-topic question = one themed section. Rename "Priorities (30min)" into specific themes like "Status Letters — Lock the TDD (12min)" and "POP MVP — Sequence the Roadmap (10min)". A flat generic "Priorities (30min)" bullet-dump is a FAILED agenda.
- **Write a one-line framing lead-in per section** (why this is on the agenda now), then 2–4 specific bullets citing commitment IDs / meeting dates / prior decisions, and an "ask" or "decision needed" line where appropriate.
- **Weave in ≥1 dated prior-conversation callback per themed section** where the source supports it — quote a date + what was decided/said ("Per the 4/28 weekly, we agreed the import script gets the DOI drop method before…"). The scaffold's `[recent meeting]` candidates and the framing block give you these dates; use them.
- **Weave discussion-topic / standing-prompt questions verbatim** into the Feedback/Growth-type themed sections — quote them as bullets, don't paraphrase them away.
- Distribute the duration budget across your themed sections so each header carries `(Xmin)`.
- Keep the frontmatter the scaffold emitted (`meeting_title`, `date`, `type`, `attendees`) — it enables auto-linking. Drop the SCAFFOLD guardrail blockquote and strip every `[source]` tag.
- Output format (see below): `# Meeting Agenda: [Title]` (or `# 1:1: [Name]`), a one-line **Goal** under the title, metadata, ## themed sections with `(Xmin)`, bullets and checkboxes.

### 5a. Self-check before saving (AC1 gate — non-skippable, NOT skippable in batch)

Before you save or present any agenda, run this check against it. State the result to yourself explicitly:

1. **No empty qualitative section.** For each `## ` section other than a pure "Next Steps" checklist: does it contain synthesized content OR an explicit one-line honest reason it is empty ("No open blockers from Lindsay's side this week")? A section carrying only the `_EMPTY — ...` placeholder, or only the template's generic bullets, is a FAILURE — go back to step 5.
2. **Themed, not template-shaped.** Are there ≥2 sections named by TOPIC (not the generic template names Priorities / Feedback and Growth / Support and Blockers)? At least the headline themes of the meeting must be named sections.
3. **≥1 dated callback.** Does at least one themed section weave in a dated prior-conversation callback? If recent-meeting signal existed in the scaffold and no agenda section references it, fix it.
4. **Commitment IDs cited.** Did the attendee-scoped open commitments appear with their IDs in the relevant themed sections?
5. **1:1 discussion topics woven in.** For a 1:1: are the person's discussion-topic / standing-prompt questions present verbatim in the Feedback/Growth-type sections?
6. **No scaffold artifacts remain.** No `[source]` tags, no SCAFFOLD guardrail blockquote, no `## Unrouted signal` block (every item placed or deliberately dropped), no `## Cross-cutting / touches their lane` block left verbatim (pulled-up items folded into themes; the rest dropped).
7. **Time-boxed.** If duration is known, does each section carry `(Xmin)`?

If any check fails, you are NOT done. Return to step 5 and synthesize the missing depth before saving. This applies identically to every agenda in a batch. "Skeleton + empty qualitative sections" is the regression this skill exists to prevent.

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

- **Scaffold verb**: `arete agenda scaffold --meeting "<title>"` — deterministic agenda pre-seeding (pulls brief + discussion topics + next-focus + commitments + recent meetings + wiki; routes them into the template's sections). This is the step-4 gate.
- **Pattern**: [PATTERNS.md](../PATTERNS.md) - get_meeting_context (for suggested items)
- **Quarter goals**: `goals/quarter.md`
- **Week plan**: `now/week.md`
- **Meetings**: `resources/meetings/index.md` (high-level themes); latest 2-3 files in `resources/meetings/` (summaries, key points for agenda ideas)
- **Calendar**: `arete pull calendar --today --json` or `--days N`
- **Templates**: `arete template list meeting-agendas`, `arete template view meeting-agenda --type <type>`
- **Save location**: `now/agendas/` (primary); project folder or clipboard as alternatives
- **Related skills**: meeting-prep (prep brief), process-meetings (run after the meeting)

