---
name: weekly-winddown
description: End-of-week reconciliation — agent does all gather + judgment work upfront across the full week, then engages once with a curated, reason-labeled review + next-week setup proposals.
triggers:
  - weekly winddown
  - end of week
  - close the week
  - friday winddown
  - weekly review and plan
  - wind down the week
  - review the week
  - week review
  - what did I accomplish this week
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
  - synthesis
---

# Weekly Winddown — chef-orchestrator pattern

This skill applies the four chef-orchestrator patterns from
`PATTERNS.md` to a weekly time horizon. Pattern names:

- Pattern 1 — `do-all-work-then-engage` (single-engage variant —
  the agent does all primitive work upfront, then engages once
  with the curated review).
- Pattern 2 — `curate-with-reason-labels` (every staged + deferred
  item carries a one-line reason).
- Pattern 3 — `propose-with-mcp-action` (action proposals at end
  of view; never auto-execute).
- Pattern 4 — `surface-deferred-as-sidecar` (deferred items roll
  to a sidecar; pull-back logs `deferral_disagreement` events).

The agent does **all** primitive work upfront across the full week
(catch up unprocessed meetings, gather planning context, scan
thread arcs, check context health), applies judgment using wiki +
memory + APPEND, and engages the user **once** with a curated
weekly review + next-week setup.

The longer time horizon means the deferred sidecar will typically
be larger; group it by category (importance / dismissal /
confidence / status).

**Read first** (if exists): `.arete/skills-local/weekly-winddown.md`.

## When to Use

- "Weekly winddown" / "End of week" / "Close the week" / "Friday winddown"
- "Weekly review and plan" / "Wind down the week"
- Best run Friday afternoon or end of last working day; also fine
  Monday morning to close the prior week.

## Workflow — chef-orchestrator pattern

### Step 0 — Read APPEND, log start

```bash
arete skill resolve weekly-winddown
arete events log winddown --event start  # use winddown event for both daily + weekly
cat .arete/skills-local/weekly-winddown.md 2>/dev/null || echo "(no APPEND file)"
```

### Step 1 — Gather (parallelize across the week)

**Run in parallel** (single agent turn, concurrent tool calls):

```bash
# 1a. Pull recordings for the past week
arete pull krisp --days 7   # or however many since last winddown
arete pull fathom --days 7

# 1b. List unprocessed meetings (status != approved)
ls resources/meetings/$(date -v-7d +%Y-%m-%d)*.md 2>/dev/null
ls resources/meetings/$(date -v-6d +%Y-%m-%d)*.md 2>/dev/null
# ... through today
# (Or use a single grep-based scan of recent files; the agent picks
# whichever is cleaner.)

# 1c. Read planning context
cat now/week.md
cat goals/quarter.md
cat now/scratchpad.md 2>/dev/null
ls projects/active/

# 1d. List open commitments (full set; weekly view wants the
# accumulated picture)
arete commitments list --json

# 1e. Aggregate the week's processed-meeting outputs
# (read existing ## Approved Action Items / Decisions / Learnings
# from each processed meeting — these are the "what got committed
# this week" baseline for the review.)

# 1f. Read recent area files for state
ls areas/
```

**Sequenced (after gather)**:

```bash
# 1g. Merge agendas (any unmerged from earlier in the week)
# Same logic as daily-winddown step 1g.

# 1h. Process unprocessed meetings (batch)
# For each unprocessed meeting:
arete meeting context <file> --json > /tmp/<slug>.json
arete meeting extract <file> --context /tmp/<slug>.json --stage --reconcile --skip-qmd --json
# Max 4 in parallel; batch larger sets.

# 1i. Thread arcs across the week
# For each major thread (top topics from week's meetings + week.md
# priorities), run:
arete search "<thread>" --timeline --days 7 --json
# Aggregate into a "threads that moved this week" view.
```

#### 1j — Orphan agenda GC (cutoff: 14 days)

Daily-winddown's Step 1g cleans up `now/agendas/<date>-*.md` when the
agenda merges into a matched meeting file. But Step 1g only fires
when daily-winddown runs. On Fri/Sat/Sun when the day closes via
weekly-winddown (and daily-winddown is skipped), agendas accumulate
in `now/agendas/` indefinitely — the user reported 6 orphan agendas
spanning 2+ weeks before weekly-winddown gained this step.

Scan `now/agendas/` for files older than the configured cutoff
(default: 14 days back from today). For each orphan:

```bash
CUTOFF_DATE=$(date -v-14d +%Y-%m-%d)  # macOS; GNU: date -d "14 days ago" +%Y-%m-%d

for agenda in now/agendas/*.md; do
  [ -f "$agenda" ] || continue
  # Filename pattern: YYYY-MM-DD-*.md — extract date prefix.
  basename=$(basename "$agenda")
  agenda_date="${basename:0:10}"
  if [[ "$agenda_date" < "$CUTOFF_DATE" ]]; then
    # Orphan candidate — surface in `## Carryovers from agenda items`
    # OR auto-delete (user-configured per APPEND).
    echo "Orphan agenda: $agenda (date: $agenda_date)"
  fi
done
```

**Surface, don't auto-delete** by default. The default behavior is
to list orphan agendas under the curated review's `## Carryovers from
agenda items` section with a `[gc-candidate]` reason label, so the
user can:

- **Approve GC** — agenda's meeting never happened or was abandoned;
  delete the file.
- **Lift to next-week prep** — agenda is still relevant; carry into
  next week's prepare-meeting-agenda flow.
- **Keep in place** — agenda points at a future meeting that hasn't
  occurred yet; do nothing.

If the user's APPEND file (`.arete/skills-local/weekly-winddown.md`)
sets `auto_gc_orphan_agendas: true`, auto-delete agendas older than
the cutoff WITHOUT surfacing — listed under `## Notes` as a single
count line ("N orphan agendas GC'd, see action [X] for the IDs").

Mirror the daily-winddown 1g principle: prefer durability over
cleanup. An orphan agenda older than 14d almost certainly missed its
meeting — keeping it indefinitely just clutters `now/agendas/`. The
14-day cutoff is conservative; future-dated agendas (e.g., a Friday
agenda created Wed for a Mon meeting) are unaffected.

### Step 2 — Read APPEND + apply judgment

The weekly judgment is broader than daily:

- **Wins** — what got resolved, decided, learned this week. Pull from
  approved memory items + commitments resolved.
- **Carryovers** — open commitments aging out, week.md tasks not
  completed, agenda items still unaddressed.
- **Themes** — recurring topics across meetings (e.g., "3 meetings
  this week touched Cover Whale launch"). Use this to suggest next
  week's priorities.
- **Cold spots** — meetings that produced nothing (missing
  importance ratings, low-extraction); flag for `## Uncertain` if a
  pattern emerges.
- **Stale items** — week.md tasks >7d untouched, commitments >14d
  open. Pruning candidates.

**Importance gating**: same as daily-winddown — read
`meeting.frontmatter.importance` directly. Canonical taxonomy is
`'skip' | 'light' | 'normal' | 'important'` (see
`packages/core/src/integrations/meetings.ts` → `type Importance`).
`importance: important` meetings get higher-weight contribution to
themes; `importance: light` meetings rarely surface unless
customer-touching.

**Conflict-with-priorities**: this week's actual focus vs. the
priorities written into last week's plan. Mismatches surface in the
review with reason labels.

### Step 3 — Compose the curated weekly review

Single message, sections only if non-empty:

```markdown
## Weekly Winddown — Week of YYYY-MM-DD

{1-2 sentences: meetings processed, recordings pulled, headline
themes, energy / focus quality.}

## Wins this week

- {Decision / learning / commitment-resolved} — reason / source

## Themes that compounded

- Cover Whale launch — 3 meetings, 5 commitments, decision moved Tue
- Glance comms — 2 meetings, 1 stalled commitment to Anthony

## Stage for next week

- [ ] Send API spec to Anthony — open commitment, 11d old
- [ ] Push Q3 churn pushback to Lauren — matches week focus carryover

## Uncertain — your call

- [ ] Schedule LEAP retrospective — 2 mentions in week, no concrete owner. Stage or skip?

## Pruning candidates

- Stale commitment to Jamie — 23d, no movement
- Old week.md task "review Snapsheet roadmap" — 14d untouched

{N} items deferred — see now/archive/weekly-winddown/deferred-week-YYYY-WNN.md

## Threads that moved (week view)

| Thread | What happened | Net status |
|---|---|---|
| Cover Whale launch | Compliance signed off; rollout starts Mon | Unblocked |

## Carryovers from agenda items

- Lindsay 1:1 (Wed): "Authority limits restructure" — unresolved, propose ask next week

## Context gaps surfaced this week

{Things the chef noticed it couldn't answer well — missing person
files, missing area state, stale topic pages. Brief.}

- People without recent memory refresh: 4 (suggested: refresh)
- Areas with no entries this week: glance-uk (defer or archive?)

## Proposed actions

[1] arete.commitments_resolve id=cmt_xyz resolution="signed off Wed in compliance call"
[2] slack.send_dm to @anthony: "Heads up: Default Attachments rollout starts Mon — anything blocking?"
[3] (draft) jira.create_ticket project=GLANCE type=Story summary="UK Phase 2 rollout planning" description="..." labels=[uk,leap]
[4] arete.commitments_create text="Send Q3 churn pushback to Lauren" target_person=lauren due=2026-05-22

## Notes

{Errors, skipped steps, anything weird this week.}

What's your call?
```

### Step 4 — Persist the curated view + engage user once

**Persist the curated view to disk BEFORE engaging the user.** Write
the full Step-3 output verbatim to `now/archive/weekly-winddown/weekly-winddown-YYYY-MM-DD.md`
(date is the Friday or end-of-week date). This is the audit trail —
without it the curated view exists only in the chat buffer and is
lost when the conversation scrolls. AC10/AC11 soak evaluation depends
on it.

```bash
mkdir -p now/archive/weekly-winddown
cat > "now/archive/weekly-winddown/weekly-winddown-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated weekly review}
EOF
```

If the file already exists for today (re-run within the same week),
append a `## Re-run at HH:MM` divider rather than silently
overwriting.

After persisting, send the curated review. Wait for response.
Standard response format (see PATTERNS.md Pattern 3).

### Step 5 — Execute approved + commit

After approval:

```bash
# Commit approved staged items per meeting
arete meeting approve <slug>  # for each

# Run approved actions (executable verbs)
# (draft) actions: confirm acknowledgment

# Refresh stakeholder memory
arete people memory refresh

# Write next-week-prep stub to next week's week.md (or hand off to week-plan)
# This skill produces inputs; week-plan owns the actual draft.

# Re-index
arete index
```

### Step 6 — Log winddown end

```bash
arete events log winddown --event end
```

## Sidecar conventions (Pattern 4 specifics)

- File: `now/archive/weekly-winddown/deferred-week-YYYY-WNN.md` (ISO week number)
- Group by reason category for easier scan: importance / dismissal /
  confidence / status / stale.
- Pull-back: `[[pull-back]]` marker in sidecar OR mention in next
  daily-winddown / week-plan.
- Pull-back appends a `deferral_disagreement` event to
  `.arete/memory/item-fates.jsonl` (Phase 0 substrate).

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `slack.send_dm` / `slack.send_channel` | executable | End-of-week pings, weekly summary posts |
| `calendar.create_event` | executable | Next-week meetings derived from carryovers |
| `notion.update_page` | executable | Week-summary update to a Notion doc |
| `jira.create_ticket` | draft-only | Themes that warrant tracked work |
| `arete.commitments_create` / `_resolve` | executable | Open / close commitments based on week's events |

## Reason taxonomy (skill-specific extensions)

In addition to the standard taxonomy in PATTERNS.md:

- **Theme compounding** — `3 meetings this week, decision moved Tue`
- **Carryover age** — `unresolved from Wed Lindsay 1:1`
- **Stale (week)** — `in week.md, no movement 7d`
- **Cold meeting** — `meeting produced nothing; importance unset`

## Uncertain-tier judgment (when in doubt, surface)

The weekly horizon collects more signal than daily, so dismissal-as-
auto-defer carries more risk: a quietly-dropped customer-touching item
won't resurface this week. Bias toward Uncertain.

**Category-level rule — these defer reasons are LOW-confidence
auto-defers; surface to Uncertain instead unless the chef can
articulate a specific, confident defer reason** (already approved this
week; explicitly out of scope per APPEND; superseded by a later same-
week decision):

- **"needs verification"** — a claim or fact mentioned across the week
  that the user might want to confirm before next week starts. Don't
  auto-defer; surface as "Verify before Monday or skip?"
- **"interesting future"** — a forward-looking idea / observation
  surfaced this week that may or may not become a next-week priority.
  Don't auto-defer; surface as "Add to next-week themes or skip?"
- **"covered elsewhere"** — chef thinks an active commitment, area
  page, or week-plan priority already covers this — but the overlap
  is fuzzy. Don't auto-defer; surface with the proposed cover-by
  reference for the user to confirm.

## Error handling

- Same as daily-winddown — non-fatal degradation; surface in Notes;
  continue. Weekly is more forgiving than daily because the time
  horizon is larger; one bad meeting won't sink the week's review.

## References

- **PATTERNS.md** — chef-orchestrator patterns 1–4, action verbs.
- **APPEND** — `.arete/skills-local/weekly-winddown.md`.
- **CLI primitives** — same as daily-winddown plus
  `arete search ... --timeline --days 7` for thread arcs.
- **Sidecar** — `now/archive/weekly-winddown/deferred-week-YYYY-WNN.md`.
- **Related skills**: `daily-winddown`, `week-plan` (consumes this
  skill's "stage for next week" output). The former `week-review`
  skill was dropped in Phase 4; its functionality is fully covered
  by this skill (triggers "close the week" / "review the week" route
  here).

## Rollback

If this rewrite degrades weekly winddown quality, revert the Phase 2
weekly-winddown rewrite commit (per-skill commit; surgical revert):

```bash
git log --oneline packages/runtime/skills/weekly-winddown/SKILL.md
git revert <phase-2 weekly-winddown rewrite commit>
```

The user fork can also be restored from a `.fork-base/` snapshot if the
user has run `arete skill fork weekly-winddown`.
