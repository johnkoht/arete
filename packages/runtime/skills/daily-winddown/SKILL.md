---
name: daily-winddown
description: End-of-day reconciliation — agent does all gather + judgment work upfront, then engages once with a curated, reason-labeled view + optional MCP-backed action proposals.
triggers:
  - daily winddown
  - end of day
  - close the day
  - wind down
  - daily review
  - what did I do today
  - reconcile my day
  - process inbox
  - triage inbox
work_type: operations
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
  - synthesis
---

# Daily Winddown — chef-orchestrator pattern

This skill is built on the four chef-orchestrator patterns from
`PATTERNS.md`. The agent does **all** primitive work upfront, applies
judgment using the wiki + memory + per-skill APPEND content, and
engages the user **once** with a curated view (Pattern 1:
`do-all-work-then-engage`).

Every staged item carries a one-line "why this surfaced" reason; every
deferred item carries a "why this was deferred" reason (Pattern 2:
`curate-with-reason-labels`). When uncertain, surface to a
`## Uncertain — your call` mini-tier rather than guessing.

Action proposals appear at the end of the curated view with full
parameters and mode tags (Pattern 3: `propose-with-mcp-action`). The
agent never auto-executes — every action requires user approval.

Auto-deferred items roll up to a count + sidecar reference; the user
can spot-check or pull items back (Pattern 4:
`surface-deferred-as-sidecar`).

**Read first** (if exists): `.arete/skills-local/daily-winddown.md`.
This is John's per-skill APPEND file — what to prioritize, which MCPs
he uses and how, what cross-references to pull, which action verbs to
propose. Treat its content as opinion-defining context for this run.

**Phase 0 instrumentation** — at skill start, run
`arete events log winddown --event start`. At the end (after the
final report), run `arete events log winddown --event end`. Best-effort.

## When to Use

- "Daily winddown" / "End of day" / "Close the day" / "Wind down"
- "What did I do today?" / "Reconcile my day" / "Daily review"
- "Process my inbox" / "Triage my tasks"

## Workflow — chef-orchestrator pattern

The flow is **gather → judge → engage once**. Do not engage the user
between gather and judge. Do not engage between judge and the curated
view. The single engagement happens at step 4 below; everything before
it runs in the agent without prompting.

### Step 0 — Read the APPEND file and log start

```bash
# Resolve which SKILL.md to use (honors ARETE_LEGACY_SKILL_PROSE)
arete skill resolve daily-winddown
# (this command's output is the path the harness will read; if it
# returns SKILL.legacy.md, the chef-orchestrator pattern is bypassed
# and the legacy step-by-step prose is used instead)

# Log winddown start
arete events log winddown --event start

# Read APPEND file
cat .arete/skills-local/daily-winddown.md 2>/dev/null || echo "(no APPEND file)"
```

The APPEND file (if present) tells the agent which MCPs are wired,
which initiatives are active, which people to watch, which action
verbs to propose. Treat its content as the user's running briefing
for this skill.

### Step 1 — Gather (all primitives, parallelize where independent)

**Run in parallel (no engagement gates between):**

```bash
# 1a. Pull recordings from configured integrations
arete pull krisp --days 1   # if krisp is configured
arete pull fathom --days 1  # if fathom is configured

# 1b. List today's meetings
ls resources/meetings/$(date +%Y-%m-%d)-*.md

# 1c. Read local state
cat now/week.md
cat goals/quarter.md

# 1d. List today's agendas
ls now/agendas/$(date +%Y-%m-%d)-*.md 2>/dev/null

# 1e. Read inbox section of week.md (already gathered in 1c)

# 1f. List staged items across today's meetings
# (parsed from meeting frontmatter; see "Staged sections" below)
```

**Sequenced (after gather):**

```bash
# 1g. Merge agendas into matched meeting files (CRITICAL — preserves prep notes)
# For each matched (agenda, meeting) pair:
#   - read agenda content
#   - insert as ## Agenda / Notes section in meeting file (after frontmatter)
#   - delete agenda file from now/agendas/
# If no match: leave agenda for future / unmatched.

# 1h. Process meetings (extract + stage + reconcile, all in one pass per file)
# For each meeting file from 1b, run:
arete meeting context <file> --json > /tmp/<slug>-context.json
arete meeting extract <file> --context /tmp/<slug>-context.json --stage --reconcile --skip-qmd --json
# Max 4 in parallel; batch larger sets.
# This stages items but does NOT approve them — approval is user-driven below.

# 1i. List open commitments + recent area state
arete commitments list --json
# (areas/ files already read in 1c)
```

### Step 2 — Read APPEND + apply judgment

**Read the APPEND file** for per-skill context (already loaded in Step 0).

**Apply judgment** using gathered output + APPEND + wiki context. For
each potential surface item (staged action, decision, learning,
agenda carryover, inbox item), decide:

- **Stage** — surface in the primary view. Reason: e.g., open
  commitment >7d, matches week focus, customer-touching.
- **Uncertain** — surface to `## Uncertain — your call`. Reason: a
  reasonable person could disagree. Quick yes/no proposal.
- **Defer** — auto-defer to sidecar. Reason: low importance + no
  decision, dismissal pattern, below confidence 0.6.

**Importance gating** — read each meeting's `frontmatter.importance`
field directly. `importance: light` items default to defer unless
they touch the user's stated priorities (from APPEND file or
week.md). `importance: heavy` items default to stage.

**Dedup against state** — items already in `now/week.md` or open
commitments shouldn't re-stage. Use `arete commitments list` output
to check.

**Conflict-with-priorities** — items contradicting week.md priorities
(or APPEND active initiatives) get a flag in their reason label.

### Step 3 — Compose the curated view

Build the single message to the user. **No engagement before this.**

**Output template** (sections only appear if non-empty):

```markdown
## Daily Winddown — YYYY-MM-DD

{Brief 1-2 sentence summary: meetings processed, recordings pulled,
inbox count, headline themes if any.}

## Stage for approval

{High-confidence items the user should approve. Each item: type +
text + reason label.}

- [ ] Send API spec to Anthony — open commitment to Anthony, 9d old
- Decision: Adopt Sonnet for reconciliation tier — matches week focus #2 (cost gate)
- Learning: Customer X validates pricing assumption — high-importance meeting, novel insight

## Uncertain — your call

{Items the agent isn't sure about. Brief yes/no proposal each.}

- [ ] Glance metrics ping to Lindsay — possibly resolved by today's standup. Stage or skip?
- [ ] Email follow-up to Sara — matches dismissal pattern but customer-touching. Stage or skip?

## Pruning candidates

{Stale items in week.md / commitments worth retiring. Reason label each.}

- Stale Notion doc from March — no movement in 35d
- Closed commitment to Jamie — already resolved per today's meeting

{N} items deferred — see ./deferred-YYYY-MM-DD.md

## Threads that moved today

{1-2 line entries for key threads. Pulled from search --timeline.}

| Thread | What happened | Net status |
|---|---|---|
| Cover Whale launch | Compliance signed off | Unblocked |

## Tomorrow preview

{Tomorrow's calendar — meetings + suggested focus from week priorities + open threads.}

## Proposed actions

{If any actions are warranted, propose with mode tags. Numbered inline.}

[1] slack.send_dm to @anthony: "Following up on auto-attachments — saw your PR comment, want to align Wed?"
[2] arete.commitments_resolve id=cmt_abc resolution="sent today per discussion in Anthony 1:1"
[3] (draft) jira.create_ticket project=INGEST type=Task summary="Default Attachments rollout test" description="Ready for testing per Tim. Test plan: ..." labels=[glance,defaults]

## Notes

{Any errors, skipped steps, or issues.}

What's your call?
```

**Reason-label rules** (Pattern 2):
- ≤12 words.
- Inline after a single em-dash.
- Pull from the standard taxonomy in PATTERNS.md when possible
  (importance match / time pressure / relationship / volume /
  dismissal pattern / confidence / importance gate / status).

**Sidecar rules** (Pattern 4):
- Write `./deferred-YYYY-MM-DD.md` only if ≥4 items deferred. Smaller
  counts roll inline ("3 items auto-deferred (low importance / no
  sidecar)").
- Sidecar contents: full deferred list grouped by reason category.
- User pulls back via sidecar edit (`[[pull-back]]` marker) or
  next-run mention.

**Action proposal rules** (Pattern 3):
- Inline numbered list. Include verb name + parameters.
- Mode tag prefix `(draft)` for `draft-only` verbs (e.g., Jira).
- Propose only verbs the APPEND file lists OR `arete.*` (always
  available).
- Never auto-execute. User responds with action numbers to run / edit
  / skip.

### Step 4 — Engage user once

Send the curated view as a single message. Wait for user response.
Do not run any further primitives or writes until response received.

Acceptable user responses:
- `1, 3` → execute actions 1 and 3
- `1 with target=@jamie` → edit and execute action 1
- `skip 2` → drop action 2
- `all` → execute all executable actions; confirm draft-only
- `approve all staged` → commit all `## Stage for approval` items via
  `arete meeting approve` per source meeting
- Free-form pushback / questions → engage normally

### Step 5 — Execute approved actions + commit approved items

After user approval (and only after):

```bash
# Commit approved staged items per meeting
for meeting in <approved-meetings>; do
  arete meeting approve <meeting-slug>
done

# Run approved MCP / CLI actions per user response
# (slack.send_dm, calendar.create_event, arete.commitments_resolve, etc.)
# (draft) actions: confirm acknowledgment but do not execute

# Refresh stakeholder memory for processed meetings
arete people memory refresh

# Update week.md (Tasks + Daily Progress)
# (use TaskService.addTask / completeTask as applicable)

# Re-index
arete index
```

### Step 6 — Log winddown end

```bash
arete events log winddown --event end
```

## Action verbs this skill may propose

The chef proposes only verbs the user's APPEND file lists. Defaults
likely to apply:

| Verb | Mode | When |
|---|---|---|
| `slack.send_dm` | executable | Action item is "ping <person>" or "follow up with <person>" |
| `slack.send_channel` | executable | Action is "post to #channel" |
| `calendar.create_event` | executable | Action is "schedule X with @person" |
| `notion.update_page` | executable | Action is "update Notion doc" |
| `jira.create_ticket` | draft-only | Action is "file ticket for X" |
| `arete.inbox_add` | executable | Captured-but-unprocessed thought |
| `arete.commitments_create` | executable | New "I owe @person" commitment |
| `arete.commitments_resolve` | executable | Completed "I owe @person" commitment |

User extends or restricts via `.arete/skills-local/daily-winddown.md`.

## Reason taxonomy (skill-specific extensions)

In addition to the standard taxonomy in PATTERNS.md, daily-winddown
uses these skill-specific reasons:

- **Open commitment age** — `open commitment to @person, Nd old`
- **Today's meeting source** — `from Anthony 1:1 today`
- **Inbox capture** — `inbox item from this morning`
- **Agenda carryover** — `unaddressed in <meeting>'s agenda`
- **Stale week.md item** — `in week.md, no movement Nd`

## Importance handling

`meeting.frontmatter.importance` is read directly when deciding
whether to surface meeting-derived items in winddown. No schema layer
needed — the chef reads frontmatter inline.

- `importance: heavy` → stage by default
- `importance: standard` → stage if it ties to week priorities or
  open commitments; otherwise defer
- `importance: light` → defer unless customer-touching or in APPEND
  active initiatives
- `importance: skip` → defer always

## Error handling

- **Recording pull fails** — note in Notes section, continue with
  meetings already in `resources/meetings/`.
- **No meetings today** — skip Step 1h (extract), proceed to inbox +
  commitments triage.
- **Meeting extraction fails for one file** — note the meeting in
  Notes, process the rest. Don't block.
- **Agenda merge fails for one pair** — note in Notes, continue.
- **Sidecar write fails** — fall back to inline deferred list (no
  sidecar reference).
- **Action execution fails** — surface error to user, do not retry
  without approval.
- **`arete index` fails** — note but don't block the curated view.

## References

- **PATTERNS.md** — `do-all-work-then-engage`,
  `curate-with-reason-labels`, `propose-with-mcp-action`,
  `surface-deferred-as-sidecar`, action verb taxonomy.
- **APPEND file** — `.arete/skills-local/daily-winddown.md`.
- **CLI primitives**:
  - `arete events log winddown --event {start,end}` — Phase 0 timing.
  - `arete pull krisp|fathom --days 1` — recording pulls.
  - `arete meeting context <file> --json` — context bundle.
  - `arete meeting extract <file> --context - --stage --reconcile`
    — extract + stage + dedup.
  - `arete commitments list --json` — open commitments.
  - `arete meeting approve <slug>` — commit staged → approved.
  - `arete people memory refresh` — refresh person highlights.
  - `arete search "<query>" --timeline` — thread progress.
  - `arete skill resolve daily-winddown` — Phase 2 legacy routing.
- **Local files**:
  - `now/week.md` — weekly plan with inbox, tasks, daily progress.
  - `now/scratchpad.md` — carryover and waiting-on-others.
  - `now/agendas/` — prepared agendas (merged into meetings then
    deleted).
  - `goals/quarter.md` — quarter goals.
  - `resources/meetings/` — meeting files.
  - `.arete/memory/items/` — decisions, learnings.
  - `.arete/commitments.json` — tracked commitments.
  - `.arete/memory/item-fates.jsonl` — Phase 0 item-fate log
    (deferral_disagreement events appended on pull-back).
- **Sidecar**: `./deferred-YYYY-MM-DD.md` (workspace root,
  user-facing).
- **Related skills**: `process-meetings`, `weekly-winddown`,
  `week-plan`, `meeting-prep`.

## Rollback

If this rewrite degrades winddown quality during soak:

```bash
export ARETE_LEGACY_SKILL_PROSE=daily-winddown
```

The skill resolver routes the agent to `SKILL.legacy.md` on next
invocation. Per-skill — other Phase 2 rewrites stay live.

If patterns themselves are wrong (vs. one specific skill misapplying
them), pause skill rewrites, fix `PATTERNS.md`, re-derive affected
skills.
