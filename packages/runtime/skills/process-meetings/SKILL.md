---
name: process-meetings
description: Process meeting files into people and memory — agent extracts + stages all meetings upfront, applies judgment with reason labels, and engages once with a curated review.
primitives:
  - User
  - Risk
work_type: operations
category: essential
intelligence:
  - entity_resolution
  - synthesis
  - memory_retrieval
  - area_context
integration:
  outputs:
    - type: resource
      path: "resources/meetings/{name}.md"
      index: true
---

# Process Meetings — chef-orchestrator pattern

This skill applies the four chef-orchestrator patterns from
`PATTERNS.md` to meeting batch processing. The agent extracts and
stages **all** meetings upfront (in parallel where possible), applies
judgment using wiki + memory + APPEND, and engages the user **once**
with a curated review across the batch.

The legacy step-by-step "extract, ask, extract, ask" flow is gone;
the agent does the gather + extraction work concurrently and presents
one consolidated curated view at the end.

**Read first** (if exists): `.arete/skills-local/process-meetings.md`.

## When to Use

- "Process my meetings"
- "Update people from meetings"
- "Extract decisions from my meetings"
- After syncing / saving new meetings
- Called from `daily-winddown` Phase 2 (subagent-style invocation)

## Default behavior (staged mode)

Writes extracted action items, decisions, and learnings as **staged
sections** directly into each meeting file for review. Does NOT
write to memory until user approves.

`--commit` flag: writes directly to `.arete/memory/items/` (legacy
behavior). Use only for CLI-only workflows without `arete view`.

## Workflow — chef-orchestrator pattern

### Step 0 — Read APPEND, identify scope

```bash
arete skill resolve process-meetings
cat .arete/skills-local/process-meetings.md 2>/dev/null || echo "(no APPEND file)"

# Identify meetings to process (typically passed in by caller skill)
# When invoked alone, default to today + unprocessed:
ls resources/meetings/*.md | grep -v -e 'status: approved' -e 'status: processed'
```

### Step 1 — Gather (parallelize)

**Run in parallel** for each meeting in the batch:

```bash
# 1a. Per-meeting context bundle
arete meeting context <file> --json > /tmp/<slug>-context.json

# 1b. Per-meeting area suggestion (batch, not individual prompts)
# Use AreaParserService.suggestAreaForMeeting for each meeting in
# one pass; collect suggestions into a single batch table.
```

**Sequenced (after gather)**:

```bash
# 1c. Resolve attendees (entity resolution + people intelligence)
arete people intelligence digest --input <path> --json
# Per-meeting; respects unknown_queue for low-confidence

# 1d. Extract + stage + reconcile (max 4 in parallel; batch larger)
arete meeting extract <file> --context /tmp/<slug>-context.json --stage --reconcile --skip-qmd --json
# This writes ## Staged Action Items / Staged Decisions /
# Staged Learnings into the meeting file with full metadata.

# 1e. Read each meeting's `## Could include` section (post-Phase-1
# absorption work — these are wiki-aware extraction's "worth knowing"
# bullets)
```

### Step 2 — Apply judgment per meeting + across batch

For each meeting, apply judgment to its staged items:

- **High-confidence + matches priorities** — stage in primary view.
- **Could-include side threads** — surface to user for selective
  promotion (Pattern 2 uncertain tier).
- **Low-importance / dismissal pattern** — defer to sidecar.
- **Owner ambiguity** — flag for user decision (Pattern 2 uncertain).

**Importance gating**: read `meeting.frontmatter.importance` per
meeting. Heavy meetings get high default surfacing weight; light
meetings need explicit reason to stage extracted items.

**Cross-meeting dedup**: items extracted from multiple meetings in
the same batch (e.g., decision mentioned in both a customer call and
the followup standup) collapse to one entry with both source
references.

### Step 3 — Compose the curated batch review

```markdown
## Process Meetings — N meetings ({date or batch label})

{Brief: meetings processed, attendees resolved, headline themes.}

## Stage for approval

### Decisions ({count})
- {meeting-slug}: We decided to use JWT auth — Q3 milestone-week match
- ...

### Action Items ({count})
- [ ] {owner} → {counterparty}: Send API spec — open commitment, customer-touching
- ...

### Learnings ({count})
- Customers building unofficial API guides — confirms Sarah's "API
  docs are biggest gap" stance (3+ mentions)
- ...

## Uncertain — your call

- [ ] Promote `## Could include` from {meeting}: "Risks: Sara flagged
  churn assumption" — Save as **learning**, **decision**, or **action**?
- {meeting}: ambiguous owner — "Send Lindsay the doc" attributed to
  John or Lindsay?

## Per-meeting status

| Meeting | Status | Items staged | Area | Issues |
|---|---|---|---|---|
| 2026-05-15-anthony-1-1 | processed | 5/2/3 | glance-comms | — |
| 2026-05-15-cw-sync | processed | 2/1/0 | cover-whale | unknown attendee: alice@cw.com |

{N} items deferred — see ./deferred-batch-{date}.md (or inline if small)

## Unknown attendees

{list of attendees not in people/ — propose adding}

## Proposed actions

[1] arete.commitments_create text="Send API spec to Anthony" target_person=anthony
[2] slack.send_dm to @alice (cw): "Welcome — looking forward to working with you"
[3] arete.inbox_add source=manual "Add Alice (CoverWhale) to people/customers/"
[4] (draft) jira.create_ticket project=GLANCE summary="API docs gap — customer-validated" labels=[docs,priority]

What's your call?
```

### Step 4 — Engage user once

Send curated review. Wait for response. Standard response format
(see PATTERNS.md Pattern 3).

### Step 5 — Execute approved + commit

After approval:

```bash
# Commit approved staged items per meeting
for slug in <approved-meetings>; do
  arete meeting approve $slug
done

# Run approved actions
# (executable verbs run; draft-only get acknowledged but not run)

# Refresh stakeholder memory
arete people memory refresh

# Re-index
arete index
```

## Sidecar conventions

- File: `./deferred-batch-{date-or-label}.md` (when invoked
  standalone) OR shares the parent skill's sidecar (e.g., when called
  from daily-winddown, the daily-winddown sidecar is the right home;
  the parent skill owns the file).
- Group by meeting + reason category.

## Integration with caller skills

When called by `daily-winddown` or `weekly-winddown` Phase 1h:

- The caller is responsible for engaging the user (single engage at
  the parent skill level).
- This skill's "Step 3 curated review" output is **input** to the
  parent skill's curated view, not a separate engagement.
- The parent skill aggregates this skill's per-meeting summaries
  into the parent's primary view.

When called standalone (`/process-meetings` directly):

- This skill owns the engagement at Step 4.
- Sidecar is `./deferred-batch-{date}.md`.

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `arete.commitments_create` / `_resolve` | executable | New / closed commitments from extraction |
| `slack.send_dm` | executable | "Send to @attendee" type follow-ups |
| `notion.update_page` | executable | "Update [doc] with new decision" |
| `jira.create_ticket` | draft-only | Action items warranting tracked work |
| `calendar.create_event` | executable | Follow-up meeting derived from decision |

## Reason taxonomy (skill-specific extensions)

In addition to PATTERNS.md standard taxonomy:

- **Cross-meeting** — `same decision in 2 meetings; collapsed`
- **Owner ambiguous** — `owner unclear in transcript`
- **Side thread** — `from could-include — promotion candidate`
- **Customer-touching** — `customer in attendees`

## Configuration

### Legacy fallback (still supported)

`internal_email_domain` in `arete.yaml` or `~/.arete/config.yaml`:

```yaml
internal_email_domain: "acme.com"
```

### Preferred path (People Intelligence)

Use People Intelligence digest for uncertainty-safe classification:

- Build attendee candidates from meeting files
- Run `arete people intelligence digest --input <path> --json`
- Respect `unknown_queue` for low-confidence candidates

Optional policy file: `context/people-intelligence-policy.json`

## Arguments

- `--commit` — write directly to memory (legacy; CLI-only workflows
  without `arete view`)
- `--review-ui` — invoke web review UI for batch approval (opt-in)

## Error handling

- **Per-meeting extraction fails** — note in batch review's
  `## Per-meeting status` table, process the rest.
- **Unknown attendees** — surface in dedicated section; propose
  adding via `arete.inbox_add` or direct creation.
- **Area mapping fails** — proceed without area; note in status table.
- **Reconciliation fails** — proceed with raw extraction; note.

## References

- **PATTERNS.md** — chef-orchestrator patterns 1–4.
- **APPEND** — `.arete/skills-local/process-meetings.md`.
- **CLI primitives** — `arete meeting context|extract|approve`,
  `arete people intelligence digest`, `arete people memory refresh`,
  `arete pull krisp|fathom`.
- **Existing patterns referenced** — `get_meeting_context`,
  `get_area_context`, `extract_decisions_learnings`,
  `enrich_meeting_attendees`, `significance_analyst`,
  `context_bundle_assembly`, `relationship_intelligence` (all from
  PATTERNS.md upper section).
- **Local files** — `resources/meetings/`,
  `.arete/memory/items/{decisions,learnings}.md`,
  `.arete/commitments.json`, `people/`.
- **Related skills**: `daily-winddown` (Phase 1h caller),
  `weekly-winddown` (Phase 1h caller), `meeting-prep` (sister skill —
  pre-meeting; this is post-meeting).

## Rollback

```bash
export ARETE_LEGACY_SKILL_PROSE=process-meetings
```

Per-skill rollback. Note: process-meetings is heavily used; if it
regresses, revert it first while keeping daily-winddown / weekly
on the chef pattern.
