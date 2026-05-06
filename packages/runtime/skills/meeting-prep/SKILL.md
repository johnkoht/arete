---
name: meeting-prep
description: Build a prep brief for an upcoming meeting — agent gathers all context upfront (attendees, recent meetings, commitments, area state, threads), applies relationship judgment, and engages once with a curated brief + optional pre-meeting actions.
triggers:
  - meeting prep
  - prep for meeting
  - prep me for
  - call with
  - meeting prep for
primitives:
  - User
  - Problem
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
  - area_context
---

# Meeting Prep — chef-orchestrator pattern

This skill applies the four chef-orchestrator patterns from
`PATTERNS.md` to pre-meeting briefing. Pattern names:

- Pattern 1 — `do-all-work-then-engage` (gather + judge across all
  context sources, then engage once with the brief).
- Pattern 2 — `curate-with-reason-labels` (relationship signals,
  open commitments, recent meetings — each with a reason).
- Pattern 3 — `propose-with-mcp-action` (pre-meeting actions:
  drafted DMs, commitment status, captures).
- Pattern 4 — `surface-deferred-as-sidecar` (rare for meeting-prep
  — used only when historical context is large).

The agent gathers **all** context upfront (attendees, recent
meetings, commitments, area state, recent threads) using existing
patterns (`get_meeting_context`, `get_area_context`,
`relationship_intelligence`, `topic_page_retrieval`,
`contextual_memory_search`), applies relationship + topic judgment,
and engages the user **once** with a curated brief.

When the meeting maps to known counterparties or commitments, the
agent proposes pre-meeting actions ("you committed to send Lauren
the doc — want me to draft the message now?").

**Read first** (if exists): `.arete/skills-local/meeting-prep.md`.

## When to Use

- "Prep for my meeting with Jane"
- "I have a call with Acme in 30 minutes"
- "Meeting prep for Product Review"
- "Call with @person" / "Meeting prep for X"
- Before a meeting to load context; after a meeting fast-recall is
  better served by the meeting file itself or `process-meetings`.

## Workflow — chef-orchestrator pattern

### Step 0 — Read APPEND, identify meeting

```bash
arete skill resolve meeting-prep
cat .arete/skills-local/meeting-prep.md 2>/dev/null || echo "(no APPEND file)"

# Identify the meeting from user input. Three paths:
# (a) User mentioned a person or company → infer the meeting
#     from upcoming calendar
# (b) User mentioned a meeting title → fuzzy match against
#     recent meetings + upcoming calendar
# (c) User passed a file path or slug → use directly
```

If meeting is ambiguous (e.g., user said "prep for Anthony" and
multiple Anthony meetings exist this week), surface to the
`## Uncertain — your call` tier in Step 3 — don't guess.

### Step 1 — Gather (parallelize)

**Run in parallel** for the identified meeting:

```bash
# 1a. Attendee resolution + person profiles
# Use get_meeting_context pattern (PATTERNS.md upper section)
# - Match attendee names to people/ slugs
# - Read each person file
# - Read enriched person memory:
arete people show <slug> --memory
# (Stances, open items, relationship health)

# 1b. Recent meetings with same attendees / topic
# Scan resources/meetings/index.md or fuzzy-search recent files
# Take 1-3 most recent

# 1c. Area context (if meeting matches a recurring area)
# Use get_area_context pattern
# AreaParserService.getAreaForMeeting(title) → AreaContext

# 1d. Open commitments with attendees
arete commitments list --person <slug>  # for each attendee
# (Both directions: i_owe_them + they_owe_me)

# 1e. Topic page retrieval for meeting subject
arete topic find "<meeting title or topic>" --area <slug-if-known> --limit 2 --budget 600 --json

# 1f. Context bundle (existing pattern)
arete search "<topic>" --scope context --limit 3
arete search "<topic>" --scope memory --limit 3

# 1g. Past meeting summaries for this attendee/topic (Phase 1 layer)
ls .arete/memory/summaries/meetings/ 2>/dev/null
# Filter for files that mention attendee or topic
```

### Step 2 — Apply judgment

For each gathered signal, decide whether and how to surface:

- **Attendee-specific signals** (stances, open items, relationship
  health) — surface verbatim with reason labels.
- **Recent meetings** — top 1-3 most relevant; include 1-line
  summary + carryover items (unaddressed asks / questions).
- **Open commitments** — list both directions:
  - `i_owe_them` (overdue or due-soon) → surface with urgency reason
  - `they_owe_me` → surface as "remind to ask about X"
- **Topic context** — pull `bodyForContext` from top topic page; cite
  inline.
- **Relationship trajectory** — apply `relationship_intelligence`
  pattern (PATTERNS.md upper). Health weakening? Stances
  strengthening?

**Importance signals** for the meeting itself:
- 1:1 with leadership / customer → surface more context, propose
  pre-meeting prep actions.
- Routine standup → surface compressed brief; many items defer to
  sidecar.
- Customer review → surface stances + open issues prominently.

### Step 3 — Compose the curated prep brief

```markdown
## Meeting Prep — {Title}

**When**: {time / date}
**Where**: {video / room}
**Attendees**: {list with role + company}

### Brief context

{1-2 sentences: what's the meeting about, what's the trajectory.}

### Attendees — what to know

#### {Attendee 1, e.g., Sarah Chen — Engineering Lead at Acme}
- **Health**: 7/10 — stable but architecture doc delay is a risk
  (last meeting: 2026-04-12)
- **Recent stances**:
  - "API docs are our biggest gap" (strong, 3 mentions) — open issue
  - "Prefer async communication" (moderate)
- **Open items**:
  - Architecture doc owed by us — 2 weeks overdue
- **Recent activity**: Last meeting 2026-04-12 — committed to send
  spec by Friday (not yet delivered)

### Recent meetings touching this topic / these attendees

- 2026-04-12 — Sarah / John 1:1 (key decision: JWT auth)
- 2026-04-08 — Acme leadership review (Sarah present, raised docs concern)

### Open commitments (both directions)

#### I owe them
- [ ] Send architecture doc to Sarah — 14d overdue, due priority

#### They owe me
- Sarah → confirm webhook system feedback (mentioned 4d ago)

### Topic context

**API docs gap** ([[topic-slug]]):
{bodyForContext snippet — current state + open questions, ~200 words}

### Talking points (suggested)

1. **Lead with**: Architecture doc status. Have a concrete delivery date.
2. **Acknowledge**: The 2-week delay impact on Sarah's team.
3. **Leverage**: Sarah's webhook excitement (last meeting) to rebuild engagement.
4. **Ask**: What other areas is your team working around? Hidden friction.

### Uncertain — your call

- [ ] Sarah mentioned she might bring the docs concern back up — do
  we want to preemptively show our roadmap, or let her raise it?

### Proposed pre-meeting actions

[1] arete.commitments_resolve id=cmt_arch_doc resolution="sent today before meeting"
    (only if you've sent it; otherwise skip)
[2] slack.send_dm to @sarah: "Quick heads up — sending the architecture doc
    in the next hour, would love your eyes on the auth section before our 2pm"
[3] notion.update_page page_id="acme-account-status" content="Architecture
    doc delivery: 2026-05-15 — pre-meeting commitment honored"
[4] (draft) jira.create_ticket project=DOCS type=Task summary="API docs gap
    — customer-validated by Sarah" labels=[docs,customer-feedback]

### Related context

- {1-2 line carryovers from agenda files matching this meeting}
- {Strategy / goal alignment if relevant}

What's your call? Approve actions before the meeting, or just take the brief.
```

### Step 4 — Engage user once

Send brief. Wait for response. Standard response format.

### Step 5 — Execute approved pre-meeting actions

After approval:

```bash
# Run approved actions (executable)
# (draft) actions: confirm acknowledgment

# Optionally drop a copy of the brief into now/agendas/<meeting-slug>.md
# so daily-winddown will merge it into the meeting file post-call.
```

## Sidecar conventions

Meeting-prep usually doesn't need a sidecar — the prep brief itself
is the curated view, and "deferred" context simply isn't surfaced.
If the meeting has a lot of historical context (e.g., 10+ recent
meetings, 5+ topic pages), surface a short tier ("12 prior meetings
on this topic — see ./deferred-{meeting-slug}.md").

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `slack.send_dm` | executable | Pre-meeting heads-up to attendee |
| `calendar.create_event` | executable | Schedule follow-up before main meeting |
| `notion.update_page` | executable | Update account / customer doc with prep notes |
| `jira.create_ticket` | draft-only | File ticket from upcoming meeting topic |
| `arete.commitments_resolve` | executable | Mark a pre-meeting deliverable done |
| `arete.commitments_create` | executable | Capture new "I owe them" pre-meeting promise |
| `arete.inbox_add` | executable | Capture a thought to handle post-meeting |

## Reason taxonomy (skill-specific extensions)

In addition to PATTERNS.md standard taxonomy:

- **Pre-meeting prep** — `committed deliverable due before this meeting`
- **Health weakening** — `relationship trajectory: 7/10 → 6/10 est.`
- **Stance match** — `confirms Sarah's "API docs are biggest gap" stance`
- **Carryover from agenda** — `unaddressed in last meeting agenda`
- **Customer-touching** — `customer in attendees`
- **Cold attendee** — `no recent 1:1; suggest icebreaker context`

## Existing patterns this skill reuses

From PATTERNS.md upper section (do not reinvent):

- `get_meeting_context` — attendees, recent meetings, projects,
  open action items.
- `get_area_context` — area state for recurring meetings.
- `enrich_meeting_attendees` — calendar cross-reference for
  email-only attendees.
- `context_bundle_assembly` — strategy + memory + people context.
- `topic_page_retrieval` — topic-page narrative pull.
- `contextual_memory_search` — lightweight memory retrieval.
- `relationship_intelligence` — trajectory assessment +
  prep-recommendations.

The chef-orchestrator wrapper around these patterns is what's new
in Phase 2; the patterns themselves stay.

## References

- **PATTERNS.md** — chef-orchestrator patterns 1–4 + the existing
  context patterns above.
- **APPEND** — `.arete/skills-local/meeting-prep.md`.
- **CLI primitives** — `arete people show --memory`,
  `arete commitments list --person`, `arete search`,
  `arete topic find`, `arete pull calendar --json`.
- **Local files** — `people/`, `resources/meetings/`,
  `.arete/memory/topics/`, `.arete/memory/summaries/meetings/`,
  `areas/`, `now/agendas/`, `goals/quarter.md`.
- **Sidecar** (rarely): `./deferred-{meeting-slug}.md`.
- **Related skills**: `process-meetings` (post-meeting sister
  skill), `prepare-meeting-agenda` (creates the agenda this skill
  reads), `daily-winddown` (post-meeting consumer).

## Rollback

If this rewrite degrades meeting-prep quality, revert the Phase 2
meeting-prep rewrite commit (per-skill commit; surgical revert):

```bash
git log --oneline packages/runtime/skills/meeting-prep/SKILL.md
git revert <phase-2 meeting-prep rewrite commit>
```

Note: meeting-prep is heavily used; if the chef brief feels worse
than the pre-Phase-2 step-by-step, revert this first. The user fork
can also be restored from a `.fork-base/` snapshot if the user has run
`arete skill fork meeting-prep`.
