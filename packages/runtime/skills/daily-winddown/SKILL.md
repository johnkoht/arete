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

### Step 0.6 — Scan previous winddown for unactioned `commitments_resolve` proposals

**F4 — closes the "approved [6,7] of 4" leak.** Before Step 1 gather,
read the prior `now/archive/daily-winddown/winddown-YYYY-MM-DD.md` (most recent
file with date < today), extract every `arete.commitments_resolve
id=<ID>` from its `## Proposed actions` section, and cross-check each
ID against `commitments.json` status. Any ID still `status: open`
means: the chef proposed it, the user didn't approve it (or approved
a subset), and the proposal never resurfaced. Surface these at the
top of today's curated view in a short block:

```markdown
## Unactioned resolves from {prior date}
N commitments were proposed for resolve last run but not approved. Re-propose?

- <text> — `arete.commitments_resolve id=<ID>` (originally proposed [<N>])
```

Treat as an Uncertain-tier item, not auto-staged: the user may have
deliberately skipped it. If still relevant, lift into today's
`## Proposed actions` with the same ID. If not, propose as a `dropped`
status (or skip — non-action is fine).

```bash
prior_winddown=$(ls -t now/archive/daily-winddown/winddown-*.md 2>/dev/null \
  | grep -v "winddown-$(date +%Y-%m-%d).md" \
  | head -n 1)

# Then parse `commitments_resolve id=<X>` lines from its
# `## Proposed actions` section; for each, call
# `arete commitments list --json` and check whether the ID still
# appears as status=open. Open IDs are unactioned proposals.
```

Best-effort: if no prior winddown file exists (first run, or files
cleaned), skip. If `commitments list` fails, surface the file count
inline and proceed without the cross-check.

### Step 0.7 — Surface ONE stale topic with concrete alias candidates (AC6)

**Phase 3.5 followup-5 AC6 — wiki source discoverability.** A topic
page is "stale" when its canonical slug stops collecting sources because
the LLM proposes a sub-slug (e.g., `default-email-template`) instead of
the canonical (`email-templates`) at extract time. The chef can spot
this by scanning topic-memory status for pages with:

1. `stale === true` (no source integrated since `last_refreshed`), AND
2. ≥3 sources in `resources/meetings/` or `resources/notes/` since
   `last_refreshed` whose `topics:` include a slug that token-overlaps
   the canonical (≥1 shared token after singularize, per AC3 tokenizer).

When such a page is found, surface ONE — the page with the highest
adjacent-source count — in the `## Uncertain — your call` tier of the
curated view. Cap at ONE per winddown to protect the AC10 ≤15-min
target.

```bash
# Read topic-memory status (stale flag + last_refreshed per page)
arete topic list --json --status all
```

Adjacent-slug detection is a chef-side scan: for each stale topic, look
at recent `resources/meetings/*.md` + `resources/notes/*.md` frontmatter
since the topic's `last_refreshed` date. Count which non-canonical slugs
appear in `topics:` that token-overlap the canonical (use `tokenizeSlug`-
equivalent logic: split on `-`, filter `vs`/`and`/`or`, singularize
trailing `s` on length-≥4 tokens unless `-ss` ending).

Surface format (write into the `## Uncertain` block of Step 4's curated
view):

```markdown
- **{canonical} topic stale ({Nd}, {M} adjacent-slug sources since {last_refreshed})**.
  Suspected slug drift. Proposed aliases to add to `{canonical}.md`:
    - `{adjacent-slug-1}` ({K1} sources)
    - `{adjacent-slug-2}` ({K2} sources)
    - `{adjacent-slug-3}` ({K3} sources)
  Add aliases + run `arete topic refresh {canonical}`? [skip / accept / list-only]
```

The bash command the user runs after editing the topic page's
frontmatter to add `aliases: [...]`:

```bash
arete topic refresh <canonical-slug>
```

Post-AC2 (phase-3-5-followup-5), this re-integrates every source tagged
with the canonical OR any declared alias. The orphan sources rescue in
one call.

**Cap rule**: surface AT MOST ONE stale-topic-with-aliases prompt per
winddown. The one with the highest adjacent-source count wins. Other
stale topics roll up to a single line if you want to mention them at
all: "{N-1} other stale topics — see `arete topic list --status active`."

**Gate**: do NOT surface on the first chef run after a major install
upgrade (user hasn't established adjacent-slug patterns yet). Skip if
no topic page in the workspace has ≥1 `sources_integrated` entry.

**Surface tier**: `## Uncertain — your call`. This is a wiki-hygiene
suggestion, not an operational must-do. The user can `skip` without
penalty; the chef re-surfaces on a future run if the staleness persists.

### Step 1 — Cross-skill gather (parallel where independent)

**Phase 8 redesigns this step.** The chef now gathers from multiple
cross-skill sources in parallel — slack, email, meetings, calendar,
commitments, week.md, areas/epics, and channel-coverage audit — and
feeds them into the **Step 2 Reconcile** pass before staging anything
for the user. The Phase 8 plan calls this "always full" mode (D8): no
light/full toggle; the user runs winddown when they have time and
prefers completeness over speed. AC10 informal target is ≤30 min
median over the 14-day soak; AC11 hard stop is 45 min on any single
day → revert. Phase 8 explicitly accepts the AC10 ceiling raise in
exchange for fewer hand-skipped items per winddown.

**Run in parallel (no engagement gates between).** The chef-orchestrator
pattern's speed win comes from *actually* running 1a–1q as concurrent
tool calls in a single agent turn. Sequential reads here defeat the
purpose. If the harness supports parallel tool calls, use them.

#### 1a–1i — Local gather (existing primitives)

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

#### 1j — Snapshot now/archive mtimes (gather-only contract check, per AC1 / C5)

Before invoking any sub-skill in gather-only mode, snapshot the file
mtimes under `now/archive/<sub-skill>/` for the three gather-only
consumers (slack-digest, email-triage, process-meetings). This lets
the chef detect a contract violation — per PATTERNS.md § "gather-only
composition", a skill in gather-only mode MUST NOT write to its own
`now/archive/<skill>/` persistence path; the orchestrator owns
persistence for the composed view.

```bash
# Capture ls -la output (or equivalent stat snapshot). Any plausible
# format that lets the post-gather check distinguish "new file" from
# "pre-existing file" is fine.
ls -la now/archive/slack-digest/    2>/dev/null > /tmp/winddown-mtime-pre-slack.txt
ls -la now/archive/email-triage/    2>/dev/null > /tmp/winddown-mtime-pre-email.txt
ls -la now/archive/process-meetings/ 2>/dev/null > /tmp/winddown-mtime-pre-process.txt
```

This is **best-effort detection** (per Phase 8 plan AC1 / pre-mortem
R3). The snapshot covers `now/archive/<sub-skill>/` only — paths
outside that tree (e.g., slack-digest's `resources/notes/<date>-slack-
digest.md` durable wiki-source artifact) are intentionally NOT in
scope. That write IS expected in gather-only mode for slack-digest;
see the slack-digest "Gather-only mode" section for the carve-out
rationale (the digest file is the wiki source consumed by `arete topic
refresh`, distinct from the chef-curated composed view this skill
persists). Soak is the real fix layer for any other path mismatches.
Any detected mismatch in 1q below surfaces in the final `## Notes`
section.

#### 1k — slack-digest in gather-only mode

**Config pre-check (mirrors 1a's `if krisp/fathom is configured` style).**
Before invoking slack-digest, check whether Slack is configured: present
in `arete.yaml` `integrations` (any status other than `inactive`), OR the
Slack MCP server is connected. If Slack is NOT configured, **SKIP this
step SILENTLY** — do not invoke slack-digest and do not surface anything
in `## Notes`. A user without Slack is in their **normal** configuration,
not a degraded one. The degraded-warning path (see `## Notes` framing) is
reserved for an integration the user *uses* that *failed* — never for a
never-configured integration.

If Slack IS configured, invoke the slack-digest skill in `[gather-only]`
mode (per PATTERNS.md § "gather-only composition" → "Invocation
convention"). Include the canonical instruction sentence:

> "Run the slack-digest skill in `[gather-only]` mode. Return the
> structured loop output described in slack-digest SKILL.md's
> 'Gather-only mode' section. Do NOT engage the user, write to
> `now/archive/slack-digest/`, run `arete commitments create/resolve`,
> or propose actions — those run only when slack-digest is invoked
> standalone. The `resources/notes/<date>-slack-digest.md` digest file
> IS still written (durable wiki source consumed by `arete topic
> refresh`); that is a separate artifact from the orchestrator's
> composed view."

Collect the returned JSON `{skill, mode, loops[], unresolved_participants[], partial}`.
If the response is non-JSON or missing `loops[]`, note as a contract
violation (surface in 1q / `## Notes`) and continue with whatever
structured signal is salvageable.

#### 1l — email-triage in gather-only mode

**Config pre-check (same rule as 1k).** Before invoking email-triage,
check whether email/Gmail is configured: `google-workspace` (or another
email provider) present in `arete.yaml` `integrations` with a non-`inactive`
status, OR a Gmail MCP server connected. If email is NOT configured,
**SKIP this step SILENTLY** — no invocation, no `## Notes` entry. A user
without Gmail is in their normal configuration, not degraded. Only a
configured-but-failed email integration is "degraded."

If email IS configured, proceed. Same shape as 1k. Include the canonical
instruction sentence:

> "Run the email-triage skill in `[gather-only]` mode. Return the
> structured loop output described in email-triage SKILL.md's
> 'Gather-only mode' section. Do NOT engage the user, write to
> `now/archive/email-triage/`, run `arete commitments create/resolve`,
> or propose actions — those run only when email-triage is invoked
> standalone."

Collect the returned JSON. Same fallback on contract violation.

#### 1m — process-meetings in gather-only mode (today's action items as intent loops)

Invoke process-meetings in `[gather-only]` mode to surface today's
extracted meeting action items as **intent loops** the reconciler can
match against slack / email / calendar fulfillment evidence. Even
though process-meetings doesn't (yet) ship a formal `## Gather-only
mode` section, the orchestrator passes the canonical `[gather-only]`
marker per PATTERNS.md § "gather-only composition" and asks for loops
in the canonical shape:

> "Run the process-meetings skill in `[gather-only]` mode. For each
> today's meeting in resources/meetings/$(date +%Y-%m-%d)-*.md, return
> action items as intent loops: `{source: "meeting", source_ref:
> <meeting-slug>, counterparty: <person-slug>, timestamp: <meeting
> time>, text: <action item text>, evidence_pointer: meeting://<slug>,
> kind: "intent"}`. Do NOT engage the user, write to
> `now/archive/process-meetings/`, run `arete meeting approve`, or
> propose actions — those run only when process-meetings is invoked
> standalone."

If process-meetings is unable to respect gather-only mode (no formal
section), the chef may fall back to parsing the staged items from 1h's
`arete meeting extract --stage` output directly — same loop shape,
same downstream reconciler treatment. Note the fallback in `## Notes`.

#### 1n — Calendar pull (forward + backward windows, per D9)

```bash
# Forward window — next 30 days of events (per spec D9, Phase 7a AC6
# adds --days N support).
arete pull calendar --days 30 --json > /tmp/winddown-cal-forward.json

# Backward window — recent-past events for Rule 3 "action moot, event
# passed" detection. Phase 8-followup-1 added negative-integer support
# to --days; previously this required per-day --date workaround.
arete pull calendar --days -1 --json > /tmp/winddown-cal-recent.json
```

Both windows return the same `CalendarEvent[]` shape with
`organizer.self: boolean` (per Phase 7a AC6 finding). The reconciler
treats invited events as fulfillment candidates (Rule 2) regardless
of who organized them, and uses backward-window `startTime < now`
for Rule 3 detection.

#### 1o — Commitments + areas/epics watchlist + week.md

```bash
# Open commitments (re-run idempotency check uses this; see AC4)
arete commitments list --json > /tmp/winddown-commitments.json

# Active areas with jira_epics watchlist (Phase 7a AC4)
arete areas epics --active --json > /tmp/winddown-epics.json

# now/week.md already read in 1c above; re-use that content.
```

The epics output is **display-only** in Phase 8 — Jira MCP is not
wired yet, so the chef surfaces "Active epics: PLAT-11014,
PLAT-10025, ..." as context but does NOT pull Jira state. See the
parking-lot item in the Phase 8 plan.

#### 1p — Channel-coverage audit (per AC5 nudge)

```bash
arete people audit-channels --json > /tmp/winddown-audit.json
# Output shape: {success: true, audit: {total, with_email,
#   with_slack_user_id, with_slack_handle, with_phone,
#   with_alt_emails, no_channels}}
```

Compute `slack_coverage = audit.with_slack_user_id / audit.total`. If
`< 0.5`, the channel-backfill nudge fires (see Step 4 output template
§ `## Notes` and / or top-of-`## Closed today`). See AC5 in Phase 8
plan and pre-mortem R5 for the framing — Rule 1 is degraded at ship
until backfill progresses.

#### 1q — Mtime-snapshot post-check (gather-only contract violation surface)

After 1k–1m complete, re-snapshot the same paths from 1j and diff.
Any new file under `now/archive/slack-digest/`, `now/archive/email-triage/`,
or `now/archive/process-meetings/` whose mtime is later than the 1j
snapshot indicates a gather-only contract violation (the sub-skill
wrote a file in gather-only mode). Surface each violation as a line
in the final `## Notes` section of the curated view:

```
## Notes
- slack-digest gather-only contract violation detected: new file
  now/archive/slack-digest/slack-digest-2026-05-30.md (write occurred
  during gather-only invocation; expected no disk write). Soak should
  surface if recurring.
```

```bash
ls -la now/archive/slack-digest/    2>/dev/null > /tmp/winddown-mtime-post-slack.txt
ls -la now/archive/email-triage/    2>/dev/null > /tmp/winddown-mtime-post-email.txt
ls -la now/archive/process-meetings/ 2>/dev/null > /tmp/winddown-mtime-post-process.txt
diff /tmp/winddown-mtime-pre-slack.txt    /tmp/winddown-mtime-post-slack.txt    || true
diff /tmp/winddown-mtime-pre-email.txt    /tmp/winddown-mtime-post-email.txt    || true
diff /tmp/winddown-mtime-pre-process.txt  /tmp/winddown-mtime-post-process.txt  || true
```

**Best-effort caveat** (per AC1 / pre-mortem R3): the file may
already exist with the same mtime if it's a winddown re-run on the
same day. Only NEW files post-1j or mtimes strictly LATER than the
pre-snapshot count as violations. Detection is advisory, not a hard
gate — the soak window is where recurring violations get flagged for
sub-skill tightening.

### Step 2 — Reconcile (before staging, judgment in-context)

**New in Phase 8 (per AC2 / spec §3).** Before Step 3 applies
defer/stage/Uncertain judgment, the chef reads the merged loop
ledger from Step 1's cross-skill gather and applies the **four skip
rules** below (Rule 4 added in Phase 8 followup-7 — intent
→ already-tracked open commitment). The reconciler is **agent
judgment in-context** (D7) — no new CLI primitive. Conservative
collapse (D1): concrete evidence only; fuzzy matches drop to
`## Uncertain — your call`. All collapses are **proposed**, never
auto-executed (AC4).

**Rule order** (cheap-first): Rule 3 (moot, no fetch needed) →
**Rule 4** (open-commitment dedup, local-only) → Rule 1 (slack/
email fulfillment scan) → Rule 2 (forward-calendar attendee scan).

**Merge the ledger first.** Combine loops from 1k (slack), 1l (email),
1m (meetings as intents), 1n (calendar events), 1o (commitments as
intents). Order by timestamp. Each loop carries `{source, source_ref,
counterparty, timestamp, text, evidence_pointer, kind}` per PATTERNS.md
§ "gather-only composition" → "JSON output shape conventions".

**Re-run idempotency check (R7)** — BEFORE applying any rule, read
`arete commitments list --json` (from 1o). For any commitment with
`resolvedAt > today_start` (00:00:00 of the local day), **skip
proposing collapse for it** — it was already resolved earlier today
on a prior winddown run. Add a one-line note in `## Notes` if any
such commitments were skipped ("N commitments already resolved earlier
today — skipped from re-proposal").

#### Rule 3 — Action moot, event passed (cheapest; runs first)

For each prep action ("prepare X for meeting Y", "review X before
call Z", "find suitable staging claim for live walkthrough"): if the
named meeting/event has already passed (event timestamp < now), mark
as **moot** and propose collapse.

- **Concrete only**: needs explicit meeting/event reference in the
  intent text. No fuzzy timestamp inference.
- **Evidence**: the calendar event itself (from 1n today's pull) with
  its passed start time.
- **Cheapest rule**; runs first as a pre-filter before Rules 1 + 2.

This rule catches spec anchor `ai_003` ("Find a suitable staging
claim for live walkthrough" — Runyon walkthrough event already
passed).

#### Rule 4 — Intent → already-tracked open commitment

**New in Phase 8 followup-7.** For each staged-item candidate
emitted by `process-meetings` gather-only (Step 1m loops with
`kind: "commitment-outgoing" | "commitment-incoming" |
"incoming-ask" | "outgoing-ask"`) AND each open commitment from
`arete commitments list --json` (Step 1o output): check whether
the fresh capture is already represented by tracked state. If yes,
propose collapse **before** stage composition. This is the cheapest
rule after Rule 3 (no slack / email / calendar fetch — the
commitments list is already in cache from Step 1o), so it runs
**second** in the pipeline.

**Rule ordering**: Rule 3 → **Rule 4** → Rule 1 → Rule 2. Rule 4 is
local-only and cheaper than Rules 1+2 (which scan slack/email/
calendar); it runs as an early pre-filter after Rule 3's moot-check.

- **Counterparty resolution** uses **stakeholders[] set-overlap**
  (Phase 10 rewrite, phase-10a-pre). The match condition is
  `|commitment.counterparties ∩ meeting.attendees| ≥ 1`, where
  `commitment.counterparties` is the deduplicated set of slugs from
  `stakeholders[]` after EXCLUDING role='self' entries (M2 mitigation
  — a self-reminder must not match a recurring meeting attendee just
  because the owner is on the attendee list). Resolution still prefers
  `arete people show --channels` slug match for attendee identification.
  **Dual-shape read during 10a dry-run window (AC0a)**: when the
  commitment carries `stakeholders[]`, use it; when it does NOT
  (v1-shape entries written pre-migration), fall back to
  `[personSlug]` as a singleton set. The set-overlap math is identical
  in both cases — set-overlap of size-1 sets reduces to slug-equality,
  preserving v1 behavior. Helper: `computeCounterpartyOverlap()` in
  `commitments.ts` (exported from `@arete/core`). If counterparty
  set-overlap matches OR loop has no counterparty (fall-through),
  proceed to text compare.
- **Text overlap** ≥ **0.7 Jaccard** on normalized tokens
  (lowercased, non-alphanumeric stripped, split on whitespace).
  Threshold ships **stricter** than `CommitmentsService.reconcile()`'s
  `JACCARD_THRESHOLD = 0.6` because Rule 4 acts pre-stage —
  over-collapse silently drops a fresh capture, while under-collapse
  leaks one re-stage (visible at approve time). Conservative-collapse
  principle (D1) favors the stricter threshold for pre-stage gates.
  Uses the same normalize-then-Jaccard logic as
  `CommitmentsService.reconcile()` — see `commitments.ts:233-239` for
  the `normalize()` helper and `utils/similarity.js` for
  `jaccardSimilarity()`. Doc-pointer for traceability; if Rule 4 is
  ever hardened into a CLI verb, the agent + the code share one
  similarity definition.
- **Direction guard** (required match): open commitment direction
  (`i_owe_them` / `they_owe_me`) MUST match the loop kind direction
  (`commitment-outgoing` / `commitment-incoming` respectively). A
  fresh `outgoing-ask` MUST NOT collapse against an open
  `they_owe_me` of the same text — they are different commitments
  with the same words.
- **Mirror-pair signature exclusion** (per followup-7 review-1 C2):
  if two open commitments exist for the **same counterparty set +
  ≥0.9 text overlap + opposite directions** (the parser-bug
  mirror-pair signature; "same counterparty set" reads from
  `stakeholders[]` under the dual-shape rule above, falling back to
  `personSlug` equality for v1 entries), exclude **BOTH** from the
  Rule 4 candidate set and surface them to `## Uncertain — your call`
  with a `parser-bug-suspect` flag. Rule 4 must NOT mask a parser-bug
  mirror-pair via silent collapse — the user needs to see both sides
  to triage the bug.
- **Recurring-item guard** (per followup-7 review-1 C1): if the
  matched open commitment is **< 5 days old** AND the loop's
  source meeting has `source_meeting.recurring: true` (cadence
  meeting — weekly 1:1, standing sync, etc.), drop to
  `## Uncertain — your call` regardless of Jaccard. Rationale:
  recurring meetings legitimately re-emit the same-text action
  weekly ("send Anthony the weekly status"); a still-open commitment
  from last week's instance is a DIFFERENT obligation than this
  week's fresh capture. Auto-collapsing would silently lapse last
  week's commitment when the user resolves this week's. Pre-mortem
  R3 mitigation; neutralizes the most-likely production failure mode
  for John's weekly-1:1 workflow at ship.
- **Rule 1 precedence** (per followup-7 review-1 C3): if the
  matched commitment ID **also** appears as a Rule 1 fulfillment
  candidate in the same loop ledger (i.e., Rule 1 found a slack /
  email message authored by the user fulfilling that same
  commitment today), **prefer the Rule 1 CT line** (resolve
  commitment + cite the slack/email fulfillment) over the Rule 4
  CT line (skip-stage). Rationale: Rule 1's evidence is richer (a
  real fulfillment trace), and the user wants ONE collapse
  surface, not two competing ones. The cross-rule join is bounded —
  Rule 4's match output carries the commitment ID; Rule 1 already
  scans for fulfilling actions against open commitments.
- **Concrete match** (≥0.7 Jaccard + counterparty set-overlap ≥ 1 +
  direction match, NOT in mirror-pair signature, NOT in recurring-item
  guard, NOT preferred by Rule 1): propose collapse to
  `## Closed today (proposed)` with the action `skip staging this
  item (already tracked as commitment <ID>)`. NO new commitment
  created. NO staged item surfaced separately.
- **Fuzzy match** (0.5 ≤ Jaccard < 0.7, OR counterparty
  name-string-only fallback, OR direction-ambiguous): surface to
  `## Uncertain — your call` as "Possibly same as open commitment
  <ID> '<text>' — collapse or stage fresh?"
- **Below 0.5**: no match; proceed to Rules 1+2 (existing) and then
  the normal stage pipeline.

This rule closes the leak observed on the 2026-06-01 winddown: a
cadence-style meeting action was staged + surfaced even though an
already-open commitment with ≥0.7 Jaccard overlap was tracked.
Soak window: first 7 winddowns hand-verify Rule 4 proposed
collapses against the named commitment to confirm semantic match.

#### Rule 1 — Intent → fulfilling action elsewhere

For each open commitment (from 1o) AND each intent loop from today's
meetings (from 1m), scan the slack + email loop ledger (from 1k + 1l)
for a fulfilling action authored by the user matching the same
counterparty + topic + timestamp ≥ intent.

- **Match heuristic**:
  - **Counterparty resolution** preferred via `arete people show
    --channels` cache (slug-level resolve).
  - **Topic overlap** ≥ 50% Jaccard on normalized tokens (lowercased,
    stopwords removed, singularized).
  - **Timestamp ordering**: fulfilling action timestamp ≥ intent
    timestamp.
- **Concrete evidence** (real slack message OR sent email OR calendar
  invite created): propose collapse to `## Closed today (proposed)`
  with full trace.
- **Fuzzy** (partial counterparty match, weak topic overlap, OR
  graceful-degradation name-string fallback per below): surface in
  `## Uncertain — your call` with the candidate fulfillment, NOT in
  Closed today.

**Graceful degradation (per AC5 / pre-mortem R5)** — when counterparty
resolution falls back to **name-string heuristic** (the person's
`slack_user_id` is not populated, so the chef matches by display
name): confidence drops to "low" automatically and the match goes to
`## Uncertain` regardless of topic confidence. The user sees a line
like: "Lindsay agreed Wed via Slack (name-match only; populate
`slack_user_id` for high-confidence)." This is the realistic
**ships-degraded** state per AC1 review C1 — `slack_user_id` is 0%
populated in arete-reserv at ship.

This rule catches spec anchor `ai_002` ("Confirm with Lindsay the
pre-read package was sent to Runyon" — fulfilled via slack DM), but
**degraded to Uncertain** until backfill progresses.

#### Rule 2 — Intent → already-scheduled event

For each open "meet with X" / "talk to X" / "set up call with X"
intent (from open commitments 1o or today's meeting actions 1m): scan
the forward calendar (next 30 days, from 1n) for events with matching
attendees.

- **Match attendees regardless of `organizer.self`** (per spec anchor
  `ai_004` + Phase 7a AC6 finding: `arete pull calendar` returns
  invited events with `organizer.self: boolean`; reconciler treats
  invited events as fulfillment whether organized by the user or
  someone else).
- **Attendee resolution chain** (per pre-mortem R4): slug → email →
  name string, in that order. Without `slack_user_id` AND with only
  12% email coverage, this is also graceful-degradation territory;
  name-only matches drop to Uncertain.
- **Concrete event exists** with matching attendees: propose collapse
  to `## Closed today (proposed)` — the event IS the fulfillment.
- **Recurring-event guard (R6)**: recurring events with **generic
  titles** (e.g., "X / John 1:1" weekly standing) drop to `##
  Uncertain`, NOT auto-propose. Reason: the calendar event title is
  too weak to confirm the specific intent topic. The intent "set up
  call with X about Y" should NOT be auto-collapsed by a standing 1:1
  even if X is the attendee. Heuristic for "generic": event has
  `recurring: true` (or `recurrence:` rule present) AND title is
  one of {"X 1:1", "X / John 1:1", "John / X", "weekly", "sync",
  "standup", "check-in"}. When ambiguous, default to Uncertain.

This rule catches spec anchor `ai_004` ("Meet with Nick + Anthony to
review prototype" — Friday calendar invite already exists, organized
by someone else).

#### Conservative collapse summary (D1)

All three rules MUST cite a concrete piece of evidence — a real
message, sent email, calendar event, or passed timestamp. Fuzzy
matches → `## Uncertain` tier, **never silently collapsed**. Per AC4
(below), all proposed collapses surface for user approval — the
reconciler never executes the collapse itself.

#### Rule 5 — Chef writes a STRUCTURAL skip on staged items (phase-10-followup-2)

When a staged action item (in the meeting frontmatter) appears already
fulfilled by an earlier authored action (slack DM, sent email, calendar
event), the chef MUST write a structural marker to the meeting file
BEFORE the user runs `arete meeting approve`. Prose-only "remember to
exclude CT2" is not enough — `commitApprovedItems` honors only frontmatter.

**Data path** (load-bearing):

- `staged_item_status[id] = 'skipped'` (post-week-1 path) OR stays
  `'pending'` (week-1 gate, see "First-week confirm gate" below).
- `staged_item_skip_reason[id] = { reason, evidence, setBy, setAt }` —
  always populated when chef writes the skip. `setBy` encodes
  provenance: `'chef'` for post-week-1 / confirmed skips, `'chef-proposed'`
  for week-1 gate skips, `'user'` for explicit user-set skips.
- Inline `<!-- chef-skip: <reason> | evidence: <ref> -->` body comment
  next to the staged-item line for in-editor visibility.

Implementation lives in `writeChefSkipToFile(storage, filePath, itemId,
{reason, evidence, setBy})` — wraps `writeWithLock` (the meeting-file
lockfile from phase-10-followup-2 Step 2). The mutator returns ONLY
`staged_item_status` + `staged_item_skip_reason`; the F2 partial-merge
contract guarantees other sibling fields (edits, source, confidence,
owner) survive untouched by default.

**When chef writes a skip**: same "concrete match" precision threshold
as Rule 1 — real message authored by user, real sent email, real
calendar event, OR explicit in-meeting agreement that the action was
already done. No fuzzy matches. Override rate > 20% in soak → demote
via feature flag.

**First-week confirm gate (HP3 / AC8)**: during the first 7 days
post-ship (sentinel at `.arete/phase-10-followup-2-ship-date.json`),
chef writes `setBy: 'chef-proposed'` and leaves `staged_item_status`
at `'pending'`. The chef-proposed skip lapses harmlessly on apply
(pending items don't commit). User confirms via `[[confirm-skip <id>]]`
directive in the next winddown (flips status → `'skipped'` + setBy →
`'chef'`); user overrides via `[[unskip <id>]]` (deletes skip_reason).
Demotion criterion (v3 F1 stricter): +7d elapsed AND ≥1 CONFIRM AND
zero UNSKIP → chef demotes to direct write. Zero-CONFIRM at +7d → stay
in week-1, surface nudge "you haven't audited any chef skips this week
— review or run `arete dedup --scope chef-skips` to clear backlog."

**Three visibility surfaces** (all of, not one of):

1. **Winddown curated view** — every chef-proposed skip surfaces under
   the new "Chef-skip proposals (week-1)" subsection OR (post-demotion)
   the existing "Closed today (proposed)" section. Each line carries
   `[[unskip <id>]]` hint persistently (past first-week banner removal,
   PM C2). Week-1 lines additionally carry `[[confirm-skip <id>]]`.
2. **Meeting body audit comment** — inline `<!-- chef-skip ... -->`.
3. **Frontmatter** — load-bearing structural field.

**Filter for "Chef-skip proposals" section (M2 discriminator)**: chef
proposes filtering by `staged_item_skip_reason[id]?.setBy ===
'chef-proposed'`. Bare-pending items (extract default, no skip_reason
entry) MUST NOT be surfaced in this section — they're handled by the
existing staging flow.

**User override directives** (Step 6 parser):

- `[[unskip <id>]]` or `[[unskip <slug>:<id>]]` — flip status to
  `'pending'`, delete `staged_item_skip_reason[id]`, append UNSKIP audit
  line. Both id-alone and slug-qualified forms accepted from day 1.
- `[[confirm-skip <id>]]` (week-1 only) — flip status to `'skipped'`,
  update `setBy: 'chef'`, append CONFIRM audit line.
- Resolver scans meetings with non-empty `staged_item_status` map,
  capped at N=50 most-recent-mtime. Ambiguous id-alone NO-OPs with
  "please qualify" line in next winddown. Zero-match surfaces "no
  match — may have already been processed."

**Audit log**: `dev/diary/chef-skip-log.md`, one JSON line per event,
Phase 9 shape (`${ISO} chef-skip ${JSON.stringify(payload)}`). Actions:
SKIP / PROPOSE / UNSKIP / CONFIRM / ABSTAIN / APPLY-SKIP. Gitignored;
local-only soak observability.

**Apply path interaction (AC3 / F5)**: `commitApprovedItems` filter at
`staged-items.ts:487` accepts only `status === 'approved'`. Skipped
items drop. Cleanup at the same file (Step 4a, v3) filters sibling
fields by `approvedIds` — pending + skipped + chef-proposed entries
SURVIVE for next round if not committed. The body emits a `## Skipped
on Apply` section listing each dropped item with its reason + setBy.

### Step 3 — Read APPEND + apply judgment

**Read the APPEND file** for per-skill context (already loaded in Step 0).

**Apply judgment** using gathered output (Step 1 cross-skill ledger
minus Step 2 reconciler-collapsed candidates) + APPEND + wiki context.
Items that landed in `## Closed today (proposed)` from Step 2 are NOT
re-considered here — they're already surfaced for user approval. For
each remaining potential surface item (staged action, decision,
learning, agenda carryover, inbox item, slack open-thread, email
incoming-ask), decide:

- **Stage** — surface in the primary view. Reason: e.g., open
  commitment >7d, matches week focus, customer-touching.
- **Uncertain** — surface to `## Uncertain — your call`. Reason: a
  reasonable person could disagree. Quick yes/no proposal.
- **Defer** — auto-defer to sidecar. Reason: low importance + no
  decision, dismissal pattern, below confidence 0.6.

**Importance gating** — read each meeting's `frontmatter.importance`
field directly. The canonical taxonomy emitted by the extractor (see
`packages/core/src/integrations/meetings.ts` → `type Importance`) is
`'skip' | 'light' | 'normal' | 'important'`. `importance: light` items
default to defer unless they touch the user's stated priorities (from
APPEND file or week.md). `importance: important` items default to
stage.

**Dedup against state** — items already in `now/week.md` or open
commitments shouldn't re-stage. Use `arete commitments list` output
to check.

**Conflict-with-priorities** — items contradicting week.md priorities
(or APPEND active initiatives) get a flag in their reason label.

### Step 3.5 — Surface today's dedup decisions (phase-10b-aux, AC8a / AC4a)

The reactive dedup pipeline (Phase 10b) writes one line per decision to
`dev/diary/dedup-decisions.log` as `arete meeting extract` runs through
the day. This step reads that log and prepares two curated-view sections
so the user can SEE every merge the chef made (never silent) and recover
from wrong calls.

1. Read `dev/diary/dedup-decisions.log` (best-effort — if absent, skip
   this step; no error).
2. Parse + scope to TODAY's entries via the core helpers:

   ```ts
   import {
     parseDedupLog,
     formatDedupWinddownSections,
   } from '@arete/core';

   const entries = parseDedupLog(rawLog);                 // tolerant parse
   const block = formatDedupWinddownSections(entries, todayIso); // YYYY-MM-DD
   ```

   `formatDedupWinddownSections` returns BOTH sections (or `''` when the
   day had no dedup activity):

   - **`### Deduped today (N merges)`** — every MERGE decision, each with
     an inline, copy-paste-ready `[[unmerge: <canonical> ← <dupe>]]`
     directive (F3 discoverability). If a merge was wrong, the user adds
     the directive below it; the NEXT winddown's Step 2.6 (below) splits
     it back out.
   - **`### Possibly mergeable (N pairs — your call)`** — UNCERTAIN
     decisions. The pipeline registered these as NEW canonicals (never
     auto-merged); the user can confirm a merge in the per-meeting
     approval UI or leave them distinct.

3. Drop the returned block into the curated view under the
   `## Dedup activity (phase-10)` section (template below). Omit the
   section entirely when the block is empty.

**First-week banner (AC8a)**: for the first 7 days after Phase 10 ships,
OR until the user's first `[[unmerge]]` use (whichever comes first), add
this line to the top of the `## Dedup activity` section:

> Phase 10 dedup is active — merges in "Deduped today" below; use the
> `[[unmerge: <canonical> ← <dupe>]]` directive to undo any wrong call.

### Step 2.6 — Resolve `[[unmerge]]` directives from the prior winddown (phase-10b-aux, AC8)

Mirrors Step 0.6's directive scan. Before composing the new view, scan
the PREVIOUS winddown view for `[[unmerge: <canonical-id> ← <dupe-id>]]`
directives the user added, and resolve each:

```ts
import {
  parseUnmergeDirectives,
  resolveUnmerge,
  appendDedupDecisionLog,
} from '@arete/core';

const directives = parseUnmergeDirectives(priorWinddownContent);
// Under commitments.withLock(...): for each directive, resolveUnmerge(...)
// against the current commitment list, write the returned commitments,
// then appendDedupDecisionLog(root, resolution.logPayload).
```

`resolveUnmerge` (per Q7) splits the dupe back out as an INDEPENDENT
commitment carrying its ORIGINAL extracted wording (recovered from the
canonical's `textVariants[]`), removes that source meeting + variant from
the canonical, and returns an `UNMERGE` log payload. Surface
`"Unmerged N commitment(s)"` in the new view's `## Notes`. Resolution
statuses `no-canonical` / `nothing-to-split` surface their `.message` in
`## Notes` so the user sees why a directive didn't take (e.g. the merge
was already split, or the id was a typo).

Run this BEFORE Step 3.5 so the freshly-split commitments are reflected
in the day's surface.

### Step 4 — Compose the curated view

Build the single message to the user. **No engagement before this.**

**Output template** (sections only appear if non-empty):

```markdown
## Daily Winddown — YYYY-MM-DD

{Brief 1-2 sentence summary: meetings processed, recordings pulled,
inbox count, headline themes if any.}

## Closed today (proposed)

{From Step 2 Reconcile, all Rule 1/2/3 matches surface here as
PROPOSED collapses. Per AC4 (revised post review-1) — NO auto-collapse;
ALL collapses await user approval. Each line traces source →
fulfillment with an evidence pointer (slack URI, email message-id,
calendar event id, or meeting file path).}

3 intents the reconciler thinks are fulfilled. Approve to commit the
collapse; reject to keep in your queue.

[CT1] Open commitment `abc12345` 'Confirm with Lindsay X' appears
      fulfilled by Slack DM to @lindsay-gray at 11:42a today.
      Evidence: slack:D0AGP5S4S4U/p1748... (intent timestamp 9:30a
      < message 11:42a)
      Action if approved: arete commitments_resolve abc12345
        --reason "Auto-detected: Slack DM fulfillment"

[CT2] Meeting action 'Set up call with Nick & Anthony to review
      prototype' (from 2026-05-30-john-nate-pre-runyon-checkin.md)
      appears fulfilled — calendar invite already exists for Fri 5/31
      2p (organized by Nate; John attending).
      Evidence: calendar:abc123def
      Action if approved: skip staging this item (no commitment
      created)

[CT3] Meeting action 'Find suitable staging claim for live
      walkthrough' is moot — the Runyon walkthrough event passed at
      1:00p today.
      Evidence: calendar:def456ghi (start=2026-05-30T13:00)
      Action if approved: skip staging this item

[CT4] Meeting action 'Send Anthony the API spec' appears to already
      be tracked as open commitment `9f3b1c8e` ('Send API spec to
      Anthony', direction=i_owe_them, 9d old). Text Jaccard 0.82,
      counterparty match (Rule 4).
      Evidence: arete:commitments/9f3b1c8e
      Action if approved: skip staging this item (already tracked)

N items kept in `## Uncertain — your call` (low-confidence match;
channel backfill would lift these).

## Chef-skip proposals (week-1 — phase-10-followup-2)

{First 7 days post-ship of phase-10-followup-2 only. Each line: a
staged item the chef proposes skipping because cross-source evidence
shows it's already done. User confirms via `[[confirm-skip <id>]]`
or overrides via `[[unskip <id>]]`. Omitting both lapses harmlessly —
item stays pending and stages normally on apply. Filter by
`staged_item_skip_reason[id]?.setBy === 'chef-proposed'`.}

- [ai_0042] Share the Notion claim-review-process doc with Jamie
  ↪ chef proposes skip: already fulfilled via Slack DM to @jamie-burk today.
    Evidence: Slack DM → Jamie Burk, 2026-06-04
    Confirm: `[[confirm-skip ai_0042]]` · Override: `[[unskip ai_0042]]`

## Dedup activity (phase-10)

{From Step 3.5. Omit entirely when the day had no dedup activity. The
two sub-sections below are produced verbatim by
`formatDedupWinddownSections(entries, todayIso)`. First-week banner
prepended here per AC8a.}

Phase 10 dedup is active — merges in "Deduped today" below; use the
`[[unmerge: <canonical> ← <dupe>]]` directive to undo any wrong call.

### Deduped today (2 merges)

- merged ai_0042 → canonical c8e3d2f1 (jaccard 0.78, fast-tier SAME) — same actor + Dave + staffing
  → wrong? add `[[unmerge: c8e3d2f1 ← ai_0042]]` below to split next winddown
- merged ai_0050 → canonical c8e3d2f1 (exact text-hash match)
  → wrong? add `[[unmerge: c8e3d2f1 ← ai_0050]]` below to split next winddown

### Possibly mergeable (1 pair — your call)

- ai_0044 may be the same as canonical b22f1ccc (jaccard 0.62, fast-tier UNCERTAIN) — ambiguous staffing ref
  → confirm merge in the per-meeting approval UI, or leave as-is to keep them distinct

## Stage for approval

{High-confidence items the user should approve. Each item: type +
text + reason label. Items that landed in `## Closed today (proposed)`
above are NOT also staged here — the proposed collapse IS the surface.
Items chef has confirmed-skipped (`staged_item_status: 'skipped'` +
`setBy: 'chef'`) also do NOT appear here — surfaced under "Chef
already-skipped" below.}

- [ ] Send API spec to Anthony — open commitment to Anthony, 9d old
- Decision: Adopt Sonnet for reconciliation tier — matches week focus #2 (cost gate)
- Learning: Customer X validates pricing assumption — high-importance meeting, novel insight

## Chef already-skipped (post-week-1)

{Items where chef wrote `staged_item_status: 'skipped'` directly
(week-2+ demotion path OR earlier confirmed-then-flipped). These will
drop on apply. `[[unskip <id>]]` hint persists for the user to
override at any time (PM C2 — past banner removal).}

- [ai_0042] Share the Notion claim-review-process doc with Jamie
  ↪ chef skip-already-done: already fulfilled via Slack DM (2026-06-04)
    Override: `[[unskip ai_0042]]`

## Uncertain — your call

{Items the agent isn't sure about. Brief yes/no proposal each. Includes
graceful-degradation Rule 1 candidates (name-match-only fulfillment
evidence — channel backfill would lift these to Closed today).}

- [ ] Glance metrics ping to Lindsay — possibly resolved by today's standup. Stage or skip?
- [ ] Email follow-up to Sara — matches dismissal pattern but customer-touching. Stage or skip?
- [ ] Lindsay agreed Wed via Slack (name-match only; populate `slack_user_id` for high-confidence). Collapse or keep?

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

**Degraded vs. unconfigured (the `## Notes` distinction).** Only surface a
"degraded — <integration> skipped / unavailable" note when an integration
the user **uses** (configured per the 1k / 1l pre-checks) **failed** at
gather time — e.g. Slack MCP timed out, Gmail auth expired, a configured
pull errored. **Never** surface a degraded note for an integration that
was silently skipped because it is not configured (1k / 1l SKIP path). For
a new user who never set up Slack or Gmail, winddown ships **clean** — no
phantom "degraded — Slack/email skipped" line. Absence of a never-configured
integration is the normal configuration, not a degradation.

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

**Pruning-to-action rule** (F3 — closes the "prose-only pruning" leak):
- **Every prune candidate that proposes resolve, drop, or close MUST be
  lifted to a numbered `arete.commitments_resolve` (status=resolved or
  dropped) action in `## Proposed actions`.** Prose-only pruning is not
  actionable — the user reads the bullet, agrees mentally, and the
  commitment stays open forever.
- This includes aging-batch lists ("Aging i_owe_them ≥3wk: <IDs>") —
  each ID gets a corresponding numbered action, OR a single batched
  action with all IDs and one resolution string.
- The 5/27 winddown's 6-item "Aging i_owe_them" prose block had ZERO
  numbered actions; all 6 are still open. Do not repeat.
- A prune candidate that is NOT proposing resolve (e.g., "Reframe this
  task" or "Carry to next week") does not need an action — those are
  user-judgment items.

**Batch-resolution rules** (parser-bug mirror-pairs — extraction-side fix shipped
in Phase 8 followup-6; this block remains as defense-in-depth for any
pre-existing or escaped pairs):
- The direction-parser bug emits mirror-pair commitments (e.g.,
  `personSlug=john-koht direction=i_owe_them` paired with the real
  counterparty commitment) — typically from compound sentences in
  transcripts. These are zero-judgment cleanup.
- **As of Phase 8 followup-6**, the source-side fix (`dedupMirrorPairs` in
  `meeting-extraction.ts`) drops mirror pairs at extract time using a
  Jaccard ≥ 0.90 + opposite-direction + different-owner gate, with the
  canonical description logged to `validationWarnings[]`. The rules below
  apply only to (a) commitments already created BEFORE the fix shipped,
  and (b) the rare LLM emission that escapes both the prompt-side Pattern
  4 block and the deterministic dedup pass.
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

**Closed-today rendering rules** (Phase 8 AC3 + AC4):
- **Trace each proposed collapse** to a concrete source → fulfillment
  pair. Required content: intent text, fulfillment source + counterparty
  + timestamp, evidence pointer (slack URI, email message-id, calendar
  event id, or meeting file path).
- **ID prefix `CT<n>`** for each proposed collapse line (parallel to
  numbered actions `[1] [2] [3]`). User approves by typing `CT1, CT3`
  (or `all`).
- **Show the action-if-approved** inline so the user knows what the
  collapse commits to (e.g., `arete commitments_resolve <id>`, or "skip
  staging this item").
- **Uncertain-count footer** — list count of items kept in
  `## Uncertain` because the match was low-confidence (e.g., name-string
  fallback per graceful-degradation). This is the backfill-gap
  visibility prompt (per AC3 / Phase 8 plan): "N items kept in Uncertain
  (name-match only; channel backfill would lift these)."
- **Audit-channels nudge** (per AC5) — if `slack_coverage < 0.5` from
  Step 1p, surface a one-line nudge **inline at top of `## Closed today
  (proposed)`** OR at top of `## Notes`:
  `Reconciler match-rate degraded: <with_slack_user_id> of <total> people
   have slack_user_id populated. Phase 7a 'arete people audit-channels'
   shows the gap. Backfill via Slack MCP would lift reconciler accuracy.`
  **Cap**: once per winddown. Skippable.
- **Re-run idempotency (R7)** — for any commitment in `arete commitments
  list --json` with `resolvedAt > today_start`, SKIP proposing collapse
  for it. It was already resolved earlier today on a prior winddown
  run. Add a one-line note in `## Notes` ("N commitments already
  resolved earlier today — skipped from re-proposal") so the user knows
  the idempotency check fired.
- **NEVER auto-collapse.** All collapses are PROPOSED. User must
  approve. The original Phase 8 plan distinguished "auto-collapse for
  staged-only items" from "proposed for committed items"; review-1 C3
  killed that distinction — uniform-proposed is safer and simpler. Per
  AC4 the entire `## Closed today` surface is for user approval.

### Step 5 — Persist the curated view + engage user once

**Persist the curated view to disk BEFORE engaging the user.** Write
the full Step-4 output verbatim to `now/archive/daily-winddown/winddown-YYYY-MM-DD.md`. This
is the audit trail: reason labels, Uncertain tier, action proposals,
sidecar references. Without this, the curated view exists only in
the chat buffer and is lost when the conversation scrolls. AC10/AC11
soak evaluation depends on it.

```bash
mkdir -p now/archive/daily-winddown
cat > "now/archive/daily-winddown/winddown-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-4 curated view, including all sections}
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
- `CT1, CT3` → approve those proposed collapses (Closed today); leave
  others in queue. Approve to commit each collapse via the action-if-
  approved line shown alongside the CT entry.
- `all` → execute all executable actions AND approve all Closed today
  proposed collapses; confirm draft-only.
  **Caution during Phase 8 soak window (first 14 winddowns)**: prefer
  approving specific CT IDs (`CT1, CT3`) over blanket `all` so each
  reconciler-proposed collapse gets a moment of human review. The
  reconciler is conservative-by-design but new; `all`-muscle-memory
  on Closed-today proposals defeats the safety net. Once you have
  high confidence in the reconciler's match quality (typically after
  a week of soak with zero false positives), `all` becomes safer.
- `1 with target=@jamie` → edit and execute action 1
- `skip 2` → drop action 2
- `approve all staged` → commit all `## Stage for approval` items via
  `arete meeting approve` per source meeting
- Free-form pushback / questions → engage normally

### Step 6 — Execute approved actions + commit approved items

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

### Step 7 — Log winddown end

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
needed — the chef reads frontmatter inline. The canonical taxonomy is
`'skip' | 'light' | 'normal' | 'important'` (see
`packages/core/src/integrations/meetings.ts` → `type Importance`).

- `importance: important` → stage by default
- `importance: normal` → stage if it ties to week priorities or
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
