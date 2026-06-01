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
`PATTERNS.md` to meeting batch processing. Pattern names:

- Pattern 1 — `do-all-work-then-engage` (gather + extract +
  stage + judge across the batch, then engage once).
- Pattern 2 — `curate-with-reason-labels` (every staged + deferred
  item carries a reason, including cross-meeting dedup notes).
- Pattern 3 — `propose-with-mcp-action` (action proposals at end
  of batch review).
- Pattern 4 — `surface-deferred-as-sidecar` (deferred items roll
  to a per-batch sidecar or the parent skill's sidecar).

The agent extracts and stages **all** meetings upfront (in parallel
where possible), applies judgment using wiki + memory + APPEND, and
engages the user **once** with a curated review across the batch.

The legacy step-by-step "extract, ask, extract, ask" flow is gone;
the agent does the gather + extraction work concurrently and presents
one consolidated curated view at the end.

**Read first** (if exists): `.arete/skills-local/process-meetings.md`.

## When to Use

- "Process my meetings"
- "Update people from meetings"
- "Extract decisions from my meetings"
- After syncing / saving new meetings
- Called from `daily-winddown` as a primitive (subagent-style invocation)

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

{N} items deferred — see now/archive/process-meetings/deferred-batch-{date}.md (or inline if small)

## Unknown attendees

{list of attendees not in people/ — propose adding}

## Proposed actions

[1] arete.commitments_create text="Send API spec to Anthony" target_person=anthony
[2] slack.send_dm to @alice (cw): "Welcome — looking forward to working with you"
[3] arete.inbox_add source=manual "Add Alice (CoverWhale) to people/customers/"
[4] (draft) jira.create_ticket project=GLANCE summary="API docs gap — customer-validated" labels=[docs,priority]

What's your call?
```

### Step 4 — Persist the curated view + engage user once

**Persist the curated view to disk BEFORE engaging the user.** Write
the full Step-3 output verbatim to
`now/archive/process-meetings/process-meetings-YYYY-MM-DD.md` (or append a numeric suffix if
the skill runs multiple times same-day with distinct batches —
`now/archive/process-meetings/process-meetings-YYYY-MM-DD-2.md`). When called as a primitive
from daily-winddown / weekly-winddown, the **caller** is responsible
for persisting their consolidated view; this skill's standalone
runs persist independently.

```bash
mkdir -p now/archive/process-meetings
# Standalone-run path — caller skill writes its own file when invoked
# as a primitive
cat > "now/archive/process-meetings/process-meetings-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated batch review}
EOF
```

After persisting, send curated review. Wait for response. Standard
response format (see PATTERNS.md Pattern 3).

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

- File: `now/archive/process-meetings/deferred-batch-{date-or-label}.md` (when invoked
  standalone) OR shares the parent skill's sidecar (e.g., when called
  from daily-winddown, the daily-winddown sidecar is the right home;
  the parent skill owns the file).
- Group by meeting + reason category.

## Integration with caller skills

When called by `daily-winddown` or `weekly-winddown` as a primitive:

- The caller is responsible for engaging the user (single engage at
  the parent skill level).
- This skill's "Step 3 curated review" output is **input** to the
  parent skill's curated view, not a separate engagement.
- The parent skill aggregates this skill's per-meeting summaries
  into the parent's primary view.

When called standalone (`/process-meetings` directly):

- This skill owns the engagement at Step 4.
- Sidecar is `now/archive/process-meetings/deferred-batch-{date}.md`.

## Gather-only mode

This skill supports the **gather-only composition** sub-mode
documented in `PATTERNS.md` (§ "gather-only composition"). An
orchestrating chef skill (Phase 8's unified daily-winddown
reconciler is the named consumer) invokes process-meetings in
gather-only mode, collects structured loop output, composes with
other sources (slack-digest, email-triage, calendar), and engages
the user **once**.

### Invocation contract (per PATTERNS.md AC1 anchor)

The orchestrator includes the `[gather-only]` marker at the top of
its invocation prompt to this skill, plus a sentence like:

> "Run the process-meetings skill in `[gather-only]` mode. Return
> the structured loop output described in process-meetings
> SKILL.md's 'Gather-only mode' section. Do NOT engage the user,
> stage items to meeting frontmatter, write `now/archive/`, run
> `arete meeting apply`, or propose actions — those run only when
> process-meetings is invoked standalone."

The sub-agent reads this section to learn which steps to skip. This
is a **best-effort prose contract** (per PATTERNS.md § gather-only
composition, "Explicit limitation" subsection) — no harness gate
enforces it.

### Which steps run in gather-only mode

| Step | Standalone | Gather-only |
|---|---|---|
| 0 — Read APPEND + log start | yes | yes |
| 1 — Pull recordings / list today's meetings | yes | yes |
| 2 — Extract intelligence (per-meeting) | yes | yes |
| 3 — Curated review (compose Stage / Uncertain / Defer) | yes | **skipped** — return JSON to orchestrator |
| 3.5 — Persist curated view to `now/archive/process-meetings/` | yes | **skipped** — no persist |
| 4 — Engage user once | yes | **skipped** — orchestrator engages |
| 5a — `arete meeting apply` per approved meeting | yes | **skipped** |
| 5b — Update commitments / week.md | yes | **skipped** |
| 5c — Refresh person/area memory | yes | **skipped** |
| 5d — Re-index | yes | **skipped** |

The skill in gather-only mode MUST NOT:
- Run `arete meeting apply` (no frontmatter staging).
- Write to `now/archive/process-meetings/`.
- Write to `.arete/memory/items/` (no decisions/learnings persisted).
- Run `arete commitments create / resolve` or `arete topic refresh`.
- Edit `now/week.md`.
- Engage the user.

### JSON output shape

Return a JSON object matching the canonical gather-only loop shape:

```json
{
  "skill": "process-meetings",
  "mode": "gather-only",
  "loops": [
    {
      "source": "meeting",
      "source_ref": "resources/meetings/2026-05-30-john-nate-pre-runyon-checkin.md#ai_002",
      "counterparty": "lindsay-gray",
      "timestamp": "2026-05-30T15:30:00Z",
      "text": "Confirm with Lindsay the pre-read package was sent to Runyon",
      "evidence_pointer": "meeting:resources/meetings/2026-05-30-john-nate-pre-runyon-checkin.md",
      "kind": "commitment-outgoing",
      "confidence": 0.88,
      "area": "glance-2-mvp",
      "meeting_importance": "normal"
    },
    {
      "source": "meeting",
      "source_ref": "resources/meetings/2026-05-30-john-nate-pre-runyon-checkin.md#de_001",
      "counterparty": null,
      "timestamp": "2026-05-30T15:30:00Z",
      "text": "V3 prototype will use the workspace + intelligent notepad pattern",
      "evidence_pointer": "meeting:resources/meetings/2026-05-30-john-nate-pre-runyon-checkin.md",
      "kind": "decision",
      "confidence": 0.92,
      "area": "glance-2-mvp"
    }
  ],
  "unknown_attendees": [],
  "partial": false
}
```

**Per-loop fields** (per PATTERNS.md § gather-only composition):
- Required: `source` (always `"meeting"`), `source_ref` (meeting file
  path + extracted-item ID), `counterparty` (slug or `null`),
  `timestamp` (meeting start time), `text` (verbatim extracted item),
  `evidence_pointer` (workspace-relative meeting path), `kind`.
- Optional: `confidence`, `area`, `topics`, `meeting_importance`,
  `dedup_key`.

**`kind` taxonomy for process-meetings** (mirrors slack-digest where
applicable; adds meeting-specific types):
- `commitment-outgoing` — user (John) promised someone something.
- `commitment-incoming` — someone promised user something.
- `incoming-ask` — someone asked user something.
- `outgoing-ask` — user asked someone something.
- `decision` — a decision was made or confirmed in the meeting.
- `learning` — an insight or observation from the meeting.
- `prep-intent` — meeting-extracted "prepare X for upcoming event"
  intent; Phase 8 Rule 3 (action moot, event passed) consumer.
- `dedup-candidate` — extracted item matches existing commitment /
  decision / topic (orchestrator decides whether to surface).

**Top-level fields**:
- `skill: "process-meetings"`, `mode: "gather-only"` — identifiers.
- `loops: []` — possibly empty; gather-only with no meetings today
  is valid.
- `unknown_attendees: []` — attendees that failed entity resolution
  (Step 2's entity-resolution gap). Orchestrator surfaces if
  nontrivial.
- `partial: boolean` — `true` if any per-meeting extraction failed.
  Orchestrator may surface a `(partial meeting pull)` note.

### Side-effects allowed in gather-only mode

These are read-only or telemetry-only and do not violate the contract:

- `arete pull krisp|fathom` (read; surfacing meeting files).
- `arete meeting context <file>` (read; assembling extraction context).
- `arete meeting extract <file>` WITHOUT `--stage` (read-only extraction
  returning JSON; does NOT write frontmatter).
- `arete commitments list` (read; for dedup_key candidate detection).
- `arete people show <slug>` (read; entity resolution).
- `arete topic list --active --slugs` (read).

**Fallback if this section is missing or sub-agent cannot follow**:
the orchestrator (Phase 8 daily-winddown) parses today's staged items
from meeting frontmatter via `arete meeting extract <file> --staged`
or similar read-only path. This fallback is documented in Phase 8's
daily-winddown SKILL.md (Step 1m) and is the safety net if gather-only
mode is not fully wired here.

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

## Uncertain-tier judgment (when in doubt, surface)

Process-meetings is the highest-leverage point for the dismissal-as-
signal feedback loop: every staged item carries a stake on the user's
attention. Auto-deferring a customer-touching item or a novel learning
costs more than asking a yes/no question.

**Category-level rule — these defer reasons are LOW-confidence
auto-defers; surface to Uncertain instead unless the chef can
articulate a specific, confident defer reason** (already a known open
commitment; same item already approved earlier this week; explicitly
out of scope per APPEND):

- **"needs verification"** — a claim or fact mentioned in the meeting
  that may want fact-check before being committed (e.g., a customer
  cited a deadline; user might want to confirm). Don't auto-defer;
  surface as "Verify or save as-is?"
- **"interesting future"** — a forward-looking observation or idea
  worth knowing but not yet a priority (e.g., a new integration
  pattern surfaced in passing). Don't auto-defer; surface as
  "Capture as learning, save to inbox, or skip?"
- **"covered elsewhere"** — chef thinks another decision/learning/
  area page already covers this — but the overlap is fuzzy. Don't
  auto-defer; surface with the proposed cover-by reference for the
  user to confirm.

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
- **Related skills**: `daily-winddown` (parent caller),
  `weekly-winddown` (parent caller), `meeting-prep` (sister skill —
  pre-meeting; this is post-meeting).

## Rollback

If this rewrite degrades process-meetings quality, revert the Phase 2
process-meetings rewrite commit (per-skill commit; surgical revert):

```bash
git log --oneline packages/runtime/skills/process-meetings/SKILL.md
git revert <phase-2 process-meetings rewrite commit>
```

Note: process-meetings is heavily used; if it regresses, revert it
first. The user fork can also be restored from a `.fork-base/`
snapshot if the user has run `arete skill fork process-meetings`.
