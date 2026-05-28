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
# Resolve which SKILL.md to load (Phase 3 two-tier: .agents/skills/
# wins over .arete/skills/). Used for shell-substitution-style path
# discovery; not strictly required for the agent to run.
arete skill resolve daily-winddown

# Log winddown start
arete events log winddown --event start

# Read APPEND file
cat .arete/skills-local/daily-winddown.md 2>/dev/null || echo "(no APPEND file)"
```

The APPEND file (if present) tells the agent which MCPs are wired,
which initiatives are active, which people to watch, which action
verbs to propose. Treat its content as the user's running briefing
for this skill.

### Step 0.5 — Scan previous day's deferred sidecar for pulled-back items

**Phase 3.5 D2 — dismissal-as-signal feedback loop.** Before any
gather, scan `now/archive/daily-winddown/deferred-YYYY-MM-DD.md` for the prior calendar day
(or the most recent sidecar with date < today). For each item the
user pulled back — i.e., bullet lines that no longer carry the
`[[defer]]` tag, OR lines explicitly marked `[[pull-back]]` — log a
`deferral_disagreement` event so future runs can tighten
defer-confidence.

```bash
# Find most recent prior-day sidecar (skip today's own).
prior_sidecar=$(ls -t now/archive/daily-winddown/deferred-*.md 2>/dev/null \
  | grep -v "deferred-$(date +%Y-%m-%d).md" \
  | head -n 1)

if [ -n "$prior_sidecar" ]; then
  # For each pulled-back item, log the disagreement event:
  #   - <item-text>: the bullet line content (stripped of bullet prefix and tags)
  #   - <original-reason>: the reason label from the bullet (text after the em-dash)
  arete events log deferral-disagreement \
    --item "<item-text>" \
    --source "$prior_sidecar" \
    --reason "<original-reason>" \
    --json
fi
```

Pull-back detection rules:

- A bullet that previously had `[[defer]]` and no longer does → pulled
  back.
- A bullet explicitly tagged `[[pull-back]]` → pulled back.
- A bullet with no defer/pull-back tags but present in the sidecar
  → not yet decided; do NOT log.

The event is fire-and-forget — if the CLI fails (workspace
unresolved, log write race), continue with Step 1 gather. The
disagreement signal is best-effort context for the chef's defer
calibration over time, not a hard dependency.

### Step 1 — Gather (all primitives, parallelize where independent)

**Run in parallel (no engagement gates between).** The chef-orchestrator
pattern's speed win comes from *actually* running 1a–1f as concurrent
tool calls in a single agent turn. Sequential reads here defeat the
purpose. If the harness supports parallel tool calls, use them.

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
#
# ALWAYS perform the body merge, EVEN IF the meeting frontmatter already
# has an `agenda:` pointer to the source file. The body is the durable
# record: the meeting markdown file stays in `resources/meetings/` forever,
# but `now/agendas/` is ephemeral and gets cleaned by this step. A
# frontmatter pointer alone is not sufficient durability — once the source
# agenda file is deleted (which step 1g also does), the pointer becomes
# dangling. Always-merge keeps the agenda content in the meeting body so
# it survives any future agenda-folder cleanup, ships with the meeting on
# any export, and is human-readable inside the meeting file. DO NOT
# skip the merge as "redundant" because frontmatter points at the agenda.

# 1h. Process meetings (extract + stage + reconcile, all in one pass per file)
# For each meeting file from 1b, run:
arete meeting context <file> --json > /tmp/<slug>-context.json
arete meeting extract <file> --context /tmp/<slug>-context.json --stage --reconcile --skip-qmd --json
# Process up to 4 in parallel; for batches larger than 4, process in waves of 4
# (start the next wave when the previous wave completes; do not skip files).
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
- 7 parser-bug mirror-pair duplicates — see action [4]

{N} items deferred — see now/archive/daily-winddown/deferred-YYYY-MM-DD.md

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
- Write `now/archive/daily-winddown/deferred-YYYY-MM-DD.md` if ≥3 items
  deferred. Only ≤2-item cases roll inline ("2 items auto-deferred (low
  importance / no sidecar)"). Count raw deferred items, not "substantive
  after dedup" — the substantive-count loophole keeps low-signal items
  in the primary view and bloats it. When in doubt, write the sidecar.
- Sidecar contents: full deferred list grouped by reason category.
- User pulls back via sidecar edit (`[[pull-back]]` marker) or
  next-run mention.

**Batch-resolution rules** (parser-bug mirror-pairs — stopgap until Phase 5):
- The direction-parser bug emits mirror-pair commitments (e.g.,
  `personSlug=john-koht direction=i_owe_them` paired with the real
  counterparty commitment) — typically from compound sentences in
  transcripts. These are zero-judgment cleanup.
- **Do not enumerate each pair** in `## Pruning candidates`. Surface
  as a single line referencing the batch action:
  `N parser-bug mirror-pair duplicates — see action [X]`
- Full IDs appear only in one corresponding `arete.commitments_resolve`
  batch action with a single resolution string (e.g., "Parser-bug
  duplicate; tracked via counterpart commitment"). One action per
  batch, not per pair.
- On heavy days (≥5 mirror pairs), this alone saves 5-10 lines of
  scrollage with no judgment cost.

**Action proposal rules** (Pattern 3):
- Inline numbered list. Include verb name + parameters.
- Mode tag prefix `(draft)` for `draft-only` verbs (e.g., Jira).
- Propose only verbs the APPEND file lists OR `arete.*` (always
  available).
- Never auto-execute. User responds with action numbers to run / edit
  / skip.

### Step 4 — Persist the curated view + engage user once

**Persist the curated view to disk BEFORE engaging the user.** Write
the full Step-3 output verbatim to `now/archive/daily-winddown/winddown-YYYY-MM-DD.md`. This
is the audit trail: reason labels, Uncertain tier, action proposals,
sidecar references. Without this, the curated view exists only in
the chat buffer and is lost when the conversation scrolls. AC10/AC11
soak evaluation depends on it.

```bash
mkdir -p now/archive/daily-winddown
cat > "now/archive/daily-winddown/winddown-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated view, including all sections}
EOF
```

If the file already exists for today (re-run), append a `## Re-run at
HH:MM` divider and re-write the latest curated view below it; do not
silently overwrite earlier history.

After persisting, send the curated view as a single message. Wait for
user response. Do not run any further primitives or writes until
response received.

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

**When in doubt, surface to Uncertain rather than auto-defer.** This
is especially important on the first few runs — the APPEND file may
be empty, and the chef hasn't yet learned the user's deferral
pattern. Better to ask 3 yes/no questions than silently drop a
customer-touching item. Trust earns over time as
`deferral_disagreement` events accumulate (Phase 0 substrate); the
chef can tighten its defer-confidence as the disagreement rate drops.

**Category-level rule — these defer reasons are LOW-confidence
auto-defers; surface to Uncertain instead unless the chef can
articulate a specific, confident defer reason** (open task already
covers it; explicitly out of scope per APPEND; user dismissed similar
item recently with same source/topic):

- **"needs verification"** — a fact-check or claim that the user
  might want to confirm now while context is fresh (e.g., "JPM eChecks
  pricing changed Q3"). Don't auto-defer; surface as "Verify or skip?"
- **"interesting future"** — a forward-looking idea/observation that
  may or may not become a priority (e.g., "per-adjuster instructions
  could help the LEAP UK rollout"). Don't auto-defer; surface as
  "Capture as inbox item or skip?"
- **"covered elsewhere"** — chef thinks another item, area page, or
  active commitment already covers this — but the overlap is fuzzy
  (e.g., "Pay Choice demo tomorrow — assumed covered by Sarah's
  ownership"). Don't auto-defer; surface with the proposed cover-by
  reference so the user can confirm.

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
  - `arete skill resolve daily-winddown` — Phase 3 two-tier path resolution.
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
- **Sidecar**: `now/archive/daily-winddown/deferred-YYYY-MM-DD.md` (workspace root,
  user-facing).
- **Related skills**: `process-meetings`, `weekly-winddown`,
  `week-plan`, `meeting-prep`.

## Rollback

If this rewrite degrades winddown quality, revert the Phase 2 daily-winddown
rewrite commit (per-skill commit; surgical revert):

```bash
git log --oneline packages/runtime/skills/daily-winddown/SKILL.md
git revert <phase-2 daily-winddown rewrite commit>
```

The user fork can also be restored from a `.fork-base/` snapshot if the
user has run `arete skill fork daily-winddown` and the recorded base
predates the regression.

If the patterns themselves are wrong (vs. one specific skill misapplying
them), pause skill rewrites, fix `PATTERNS.md`, re-derive affected
skills.
