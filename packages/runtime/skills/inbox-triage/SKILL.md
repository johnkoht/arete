---
name: inbox-triage
description: Workspace-scoped inbox triage — agent does all gather + judgment work upfront across every inbox item, then engages once with a curated, reason-labeled routing plan + optional MCP-backed action proposals.
work_type: operations
category: essential
triggers:
  - triage my inbox
  - process inbox
  - what's in my inbox
  - inbox triage
  - check inbox
primitives:
  - User
  - Problem
intelligence:
  - entity_resolution
  - memory_retrieval
  - context_injection
integration:
  outputs:
    - type: resource
      path: "{destination}"
      index: true
---

# Inbox Triage — chef-orchestrator pattern

This skill is built on the four chef-orchestrator patterns from
`PATTERNS.md`. The agent does **all** primitive work upfront —
scanning, content-reading, entity extraction, significance scoring —
then engages the user **once** with a curated routing plan (Pattern 1:
`do-all-work-then-engage`).

Every routed item carries a one-line "why this destination" reason;
every item kept in inbox carries a "why deferred" reason (Pattern 2:
`curate-with-reason-labels`). When uncertain (confidence < 0.6, or
ambiguous between two destinations), surface to a
`## Uncertain — your call` mini-tier rather than guessing.

Action proposals (memory writes, follow-ups) appear at the end of the
curated view with full parameters and mode tags (Pattern 3:
`propose-with-mcp-action`). The agent never auto-executes — every
move and every memory write requires user approval.

Items kept in `inbox/` with `status: needs-review` are NOT a sidecar —
they're the deferred tier with a reason label inline (Pattern 4
adapted to inbox scope: deferred items stay in inbox/ with a status
flag, not a separate file).

**Read first** (if exists): `.arete/skills-local/inbox-triage.md`.
This is the user's per-skill APPEND file — what kinds of content
they care about, which destinations are preferred for what,
which action verbs to propose. Treat its content as opinion-defining
context for this run.

## When to Use

- "triage my inbox" / "process inbox" / "inbox triage" / "check inbox"
- "what's in my inbox?"

**Not this skill**: Use **email-triage** for Gmail thread triage.
Use **process-meetings** for meeting-file extraction. Use the
`research_intake` PATTERNS recipe for project-scoped `inputs/`
folders (this skill handles the workspace-scoped top-level `inbox/`).

## Workflow — chef-orchestrator pattern

The flow is **gather → judge → engage once**. Do not engage the user
between gather and judge. Do not engage between judge and the curated
view. The single engagement happens at step 4 below.

### Step 0 — Read APPEND + scan inventory

```bash
# Two-tier skill resolution (Phase 3): user fork wins over managed.
arete skill resolve inbox-triage

# Read APPEND file
cat .arete/skills-local/inbox-triage.md 2>/dev/null || echo "(no APPEND file)"
```

The APPEND file (if present) tells the agent which destinations are
preferred for which content types, what memory categories matter,
which trigger phrases route to other skills. Treat its content as
the user's running briefing.

### Step 1 — Gather (all primitives, parallelize where independent)

**Run in parallel.** The chef-orchestrator pattern's speed win comes
from running 1a–1f as concurrent tool calls in a single agent turn.

```bash
# 1a. List unprocessed inbox files
ls inbox/ | grep -v "^README\.md$" || true

# 1b. Read week/quarter for active priorities
cat now/week.md
cat goals/quarter.md

# 1c. List active areas + projects
ls areas/*.md
ls projects/active/*/README.md

# 1d. Search context for strategy signals
arete search "inbox priorities" --scope context --limit 3

# 1e. Search memory for recent decisions
arete search "recent decisions" --scope memory --limit 5

# 1f. Read each unprocessed inbox file (one read per file)
# Handle types by tier:
#   - .md / .txt: read directly
#   - .pdf: best-effort parse
#   - .png / .jpg / .webp: vision describe + extract text
#   - other binary: flag as status=needs-review with a note
```

### Step 2 — Apply judgment (context_bundle_assembly +
### significance_analyst patterns)

**Build the context bundle once** (per PATTERNS.md
§ `context_bundle_assembly`) using the gathered outputs. Reuse it
across every inbox item — do not re-assemble.

For each unprocessed item, apply the **significance_analyst** pattern
(per PATTERNS.md). Extract:

- **Content type** — article / research / meeting note / conversation
  / person intel / decision / reference / image / unsupported.
- **Entities** — match against `people/`, active projects, areas,
  goals.
- **Destination** — apply the routing matrix (Step 3 below).
- **Significance** — does it contain a decision/learning worth
  appending to `.arete/memory/items/`?

**Routing matrix:**

| Destination | When to route here |
|------------|-------------------|
| `projects/active/{slug}/inputs/` | Content clearly maps to an active project |
| `areas/{slug}/` (as reference note) | Content relates to an area but no specific project |
| `resources/notes/` | General reference material, no project/area match |
| `resources/conversations/` | Conversation captures, interview notes |
| `people/{slug}/` | Person-specific intel |
| `.arete/memory/items/` | Decision, learning, or observation worth appending |
| `inbox/` (stays — deferred) | Confidence < 0.6 or ambiguous |

**Importance gating** — items matching active week.md priorities get
a `stage` bias; items duplicating already-captured memory items
auto-defer with reason "covered elsewhere"; items contradicting an
existing decision get a `## Uncertain — your call` surfacing.

**Don't guess.** When a reasonable person could disagree on
destination, surface to Uncertain rather than auto-routing.

### Step 3 — Compose the curated view

Build the single message to the user. **No engagement before this.**

**Output template** (sections only appear if non-empty):

```markdown
## Inbox Triage — YYYY-MM-DD

{1-2 sentence summary: N items processed, headline routing.}

## Route now (high confidence — your approval to move)

| # | Item | Type | Route to | Why |
|---|------|------|----------|-----|
| 1 | competitive-analysis.md | article | projects/active/market-research/inputs/ | matches active project; ties to Q2 competitive analysis goal |
| 2 | customer-thread.md | conversation | resources/conversations/ | Slack thread w/ customer feedback; no current project match |

## Uncertain — your call

- [ ] random-thought.md → projects/active/glance-comms/ OR resources/notes/? **Glance comms is active, but the note is generic UX. Stage or defer?**

## Pruning candidates

{Items in inbox already covered elsewhere or now irrelevant.}

- old-notion-clip.md — covered by 2026-04-12 customer-strategy decision; defer or delete?

{N} items deferred (kept in inbox with status: needs-review).

## Memory updates (your approval required)

- competitive-analysis.md contains a learning: "Competitor X pivoted to API-first" — append to `.arete/memory/items/learnings.md`? **Significant because it tracks our own API-first goal trajectory.**

## Proposed actions

[1] arete.inbox_add source=triage "<remember-later thought>"
[2] slack.send_dm to @alex: "FYI on the competitive-analysis doc you flagged — moved to projects/market-research/inputs/."
[3] (draft) jira.create_ticket project=PROD type=Task summary="Address competitor pivot finding"

## Notes

{Any errors, unparseable files, or items needing review.}

What's your call? (e.g. "1, 2 yes / 3 stays / approve memory")
```

**Reason-label rules** (Pattern 2):
- ≤12 words.
- Inline after a single em-dash for stage rows; in the "Why" column
  for the route table.
- Pull from the standard taxonomy in PATTERNS.md (importance match /
  time pressure / relationship / volume / dismissal / confidence /
  importance gate / status).

**Uncertain-tier rule (Phase 3.5 C2 convention)** — when in doubt,
surface to `## Uncertain — your call` rather than guessing. Use
Uncertain liberally; better to ask 3 yes/no questions than to
silently auto-defer an item the user wanted to see. Explicit
defer-category examples that should ALWAYS surface to Uncertain:

- **"needs verification"** — extracted decision/learning where the
  surrounding context is ambiguous (e.g., "we *might* go API-first")
- **"interesting future"** — content that's not actionable now but
  has plausible future relevance
- **"covered elsewhere"** — content that overlaps existing memory /
  topic page / area state and the agent isn't sure if it adds new
  signal

LOW-confidence items default to Uncertain, not auto-defer.

**Action proposal rules** (Pattern 3):
- Inline numbered list. Verb name + parameters.
- Mode tag prefix `(draft)` for `draft-only` verbs (Jira).
- Propose only verbs the APPEND file lists OR `arete.*` (always
  available).
- Never auto-execute. User responds with action numbers.

### Step 4 — Persist the curated view + engage user once

**Persist the curated view to disk BEFORE engaging the user.** Write
the full Step-3 output verbatim to
`now/archive/inbox-triage/inbox-triage-YYYY-MM-DD.md`. This is the
audit trail: routing decisions, reason labels, Uncertain tier,
memory proposals.

```bash
mkdir -p now/archive/inbox-triage
cat > "now/archive/inbox-triage/inbox-triage-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated view, including all sections}
EOF
```

If the file already exists for today (re-run), append a
`## Re-run at HH:MM` divider and re-write the latest curated view
below it; do not silently overwrite earlier history.

After persisting, send the curated view as a single message. Wait
for user response.

Acceptable user responses:
- `1, 2` → execute moves 1 and 2; skip the rest
- `1 with destination=resources/notes/` → edit and execute move 1
- `approve memory 1, skip 2` → memory update 1 yes, 2 no
- `defer all uncertain` → mark Uncertain items `status: needs-review`
  in inbox/
- Free-form pushback / questions → engage normally

### Step 5 — Execute approved routing + commit approved items

After user approval (and only after):

```bash
# For each approved route:
#   - mv inbox/<file> <destination>/<file>
#   - update frontmatter: status: triaged, triaged_to, triaged_date
# For each approved memory update:
#   - append to .arete/memory/items/<category>.md per the standard format
# For each deferred item:
#   - update frontmatter: status: needs-review (stays in inbox/)
# Run approved MCP / CLI actions per user response
# Reindex
arete index
```

## Action verbs this skill may propose

The chef proposes only verbs the user's APPEND file lists. Defaults:

| Verb | Mode | When |
|---|---|---|
| `arete.inbox_add` | executable | New "remember later" thought captured during triage |
| `slack.send_dm` | executable | FYI to a colleague about a routed item |
| `notion.update_page` | executable | Routing surfaced an update to a Notion doc |
| `jira.create_ticket` | draft-only | Triage surfaced a task that wants a ticket |
| `arete.commitments_create` | executable | Item is an "I owe @person" capture |

User extends or restricts via `.arete/skills-local/inbox-triage.md`.

## Reason taxonomy (skill-specific extensions)

In addition to the standard taxonomy in PATTERNS.md, inbox-triage
uses these skill-specific reasons:

- **Project match** — `matches active project <slug>`
- **Area match** — `relates to area <slug>`
- **Goal alignment** — `ties to Q<N> goal <slug>`
- **Content type fit** — `<conversation|article|reference> → <destination>`
- **No clear match** — `no project/area match → resources/notes/`
- **Unsupported** — `<binary type> — needs manual review`
- **Covered elsewhere** — `duplicate of existing memory/topic page`

## Files this skill touches

- **Reads**: `inbox/*`, `now/week.md`, `goals/quarter.md`,
  `areas/*.md`, `projects/active/*/README.md`, `.arete/memory/items/`,
  `.arete/memory/topics/`, `people/`.
- **Writes (after user approval)**: target destinations (moves files
  from `inbox/`), `.arete/memory/items/<category>.md` (appends),
  `now/archive/inbox-triage/inbox-triage-YYYY-MM-DD.md` (curated
  view persistence).
- **APPEND**: `.arete/skills-local/inbox-triage.md`.

## References

- **Patterns**: [PATTERNS.md](../PATTERNS.md) — chef-orchestrator
  patterns 1–4, `context_bundle_assembly`, `significance_analyst`,
  `research_intake`.
- **CLI**: `arete inbox add`, `arete search`, `arete index`,
  `arete people show`.
- **Related skills**: `email-triage` (Gmail-thread scope),
  `process-meetings` (meeting-file scope). The `research_intake`
  pattern is project-scoped; this skill is workspace-scoped and may
  route TO a project's `inputs/`.

## Rollback

If this rewrite degrades inbox triage quality, revert the Phase 4
inbox-triage chef-rewrite commit (per-skill commit; surgical
revert):

```bash
git log --oneline -- packages/runtime/skills/inbox-triage/
git revert <commit-hash>
```

MC5 sunset applies — no `SKILL.legacy.md` ships. Rollback is
git-based.
