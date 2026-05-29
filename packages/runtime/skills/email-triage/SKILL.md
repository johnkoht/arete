---
name: email-triage
description: Gmail-scoped thread triage — agent pulls today's important threads, applies user-tuned significance rules, then engages once with a curated, reason-labeled triage view + proposed actions.
work_type: operations
category: essential
triggers:
  - check my email
  - email triage
  - important emails
  - email summary
  - unread emails
intelligence:
  - entity_resolution
  - memory_retrieval
  - synthesis
---

# Email Triage — chef-orchestrator pattern

This skill is built on the four chef-orchestrator patterns from
`PATTERNS.md`. The agent pulls Gmail threads, classifies each
against the user-tuned PM rubric, and engages **once** with a
curated triage view (Pattern 1: `do-all-work-then-engage`).

Every staged thread carries a one-line "why surfaced" reason; every
auto-filtered thread carries a "why filtered" reason (Pattern 2:
`curate-with-reason-labels`). When uncertain (thread sender unknown,
action item ambiguous), surface to `## Uncertain — your call`.

Action proposals — save-as-conversation, create-commitment,
send-reply-via-MCP, escalate-to-jira — appear at the end with mode
tags (Pattern 3: `propose-with-mcp-action`). Never auto-execute.

Low-relevance threads roll up to a single count line — they're not
written to a sidecar file (Gmail itself is the durable backing
store; the curated view is the lens) (Pattern 4:
`surface-deferred-as-sidecar` adapted — Gmail's own threading is
the sidecar-equivalent durable store, so no separate `.md` file
is needed for the deferred tier).

**Read first** (if exists): `.arete/skills-local/email-triage.md`.
This is the user's per-skill APPEND: which senders are
high-importance, which keywords trigger action-needed, which Slack
channels to FYI'd routed threads, which Jira project + labels to
draft against. Treat its content as opinion-defining.

## When to Use

- "check my email" / "email triage" / "important emails"
- "what's in my inbox?" (Gmail-scoped — for workspace inbox/, use
  **inbox-triage**)

## Workflow — chef-orchestrator pattern

**Gather → judge → engage once.** No mid-flow questions.

### Step 0 — Read APPEND

```bash
arete skill resolve email-triage
cat .arete/skills-local/email-triage.md 2>/dev/null || echo "(no APPEND file)"
```

The APPEND file (if present) defines per-user routing rules: which
senders are high-importance, what counts as "action needed,"
which Slack channels are appropriate FYI targets, which Jira
project + labels apply.

### Step 1 — Gather (all primitives, parallelize where independent)

```bash
# 1a. Pull today's important unread (or with --query for a wider net)
arete pull gmail --days 1 --json

# 1b. Read week priorities + active commitments
cat now/week.md
arete commitments list --json

# 1c. List active people (for sender matching)
ls people/internal/*.md people/customers/*.md people/users/*.md 2>/dev/null

# 1d. Search context for "important sender" patterns
arete search "important contacts" --scope context --limit 3
```

### Step 2 — Apply judgment

For each thread:

- **Resolve sender** — match `from` email against `people/`
  directory. Capture role (internal / customer / user / partner /
  unknown).
- **Score relevance** — apply rubric:

  **High (stage):**
  - Sender is in people/ AND content has action language ("please",
    "by Friday", "need from you", "can you", "ASAP", "deadline").
  - Decision language ("decided", "agreed", "approved", "signed
    off").
  - Sender appeared in recent meetings or active week-priority
    threads.

  **Medium (Uncertain):**
  - Known sender but no clear action item.
  - FYI / informational from a high-importance contact.
  - Question directed at the user without explicit "by when."

  **Low (auto-defer to count line):**
  - Automated notifications.
  - Newsletters / bulk that slipped through filters.
  - Threads the user already replied to (recent received-after-reply).

- **Dedup against state** — if a thread topic matches an open
  commitment or active week-priority entry, label it with the link
  rather than re-staging.

- **Importance gate** — APPEND high-importance-sender list takes
  precedence over the heuristic. APPEND-listed senders default to
  stage; everyone else uses the rubric.

### Step 3 — Compose the curated view

```markdown
## Email Triage — YYYY-MM-DD

{1-2 sentence summary: N threads scored, X actionable, Y FYI, Z
auto-filtered.}

## Action required (your approval)

| # | Subject | From | Action | Why |
|---|---------|------|--------|-----|
| 1 | "Re: Glance 2.0 launch" | Lindsay (internal) | Reply by EOD: confirm Wed review | open commitment to Lindsay, deadline today |
| 2 | "Q3 budget approval" | Jane (customer) | Schedule call | customer-touching + decision language |

## Save as context (no action needed, capture only)

- "Sprint retro notes" from Anthony — internal, useful for next
  retro prep
- "Competitor pricing change" from Lauren — relates to Q3 churn
  focus

## Uncertain — your call

- [ ] "FYI: vendor onboarding" from acme-rep@acme.com — unknown
  sender, possibly relevant to active vendor work. **Capture or
  skip?**
- [ ] "Q&A from last week's panel" from public-list@... — newsletter-
  shaped, but contains a customer quote about our product. **Stage
  or filter?**

{N} threads auto-filtered (newsletters / automated / already-replied)
— no sidecar; Gmail is the durable store.

## Proposed actions

[1] arete.commitments_create text="Reply to Lindsay on Glance 2.0 by EOD" target_person=lindsay due=today
[2] slack.send_dm to @anthony: "Saw your retro notes — want to bring them into next planning meeting?"
[3] arete.inbox_add source=email-triage "Competitor pricing change context for Q3 churn deep-dive"
[4] (draft) jira.create_ticket project=GLANCE type=Task summary="Address vendor onboarding ask" description="Acme rep flagged onboarding pain in 4/30 email; investigate before Q3 review"

What's your call?
```

**Reason-label rules** (Pattern 2): ≤12 words, inline after em-dash
or in "Why" column. Standard taxonomy plus skill-specific:

- **Sender role** — `internal | customer | user | partner | unknown`
- **Action language** — `deadline today / by Friday / "need from you"`
- **Open-commitment match** — `open with @sender, Nd old`
- **Newsletter / automated** — `bulk send → filtered`
- **Already replied** — `received after my Nd-old reply → filtered`

**Uncertain-tier rule (Phase 3.5 C2 convention)** — surface to
Uncertain when in doubt rather than guessing. Explicit defer-category
examples that ALWAYS surface:

- **"needs verification"** — the thread might or might not contain
  an actionable ask (e.g., "happy to chat sometime — what works?").
- **"interesting future"** — content that's not actionable now but
  plausibly relevant later (e.g., conference invitations 3+ months
  out).
- **"covered elsewhere"** — thread duplicates existing memory or
  commitment, and the agent isn't sure if the email adds new signal.

LOW-confidence threads default to Uncertain, not auto-filtered.

**Action proposal rules** (Pattern 3): inline numbered list, verb +
parameters, `(draft)` prefix for draft-only.

### Step 4 — Persist the curated view + engage user once

**Persist BEFORE engaging.** Write the full Step-3 output verbatim
to `now/archive/email-triage/email-triage-YYYY-MM-DD.md`.

```bash
mkdir -p now/archive/email-triage
cat > "now/archive/email-triage/email-triage-$(date +%Y-%m-%d).md" <<'EOF'
{full Step-3 curated view, including all sections}
EOF
```

On re-run (same-day), append `## Re-run at HH:MM` divider and
re-write below; do not overwrite earlier history.

After persisting, send the curated view as a single message. Wait
for user response.

Acceptable responses:
- `1, 3` → execute actions 1 and 3
- `stage 2 as uncertain` → move thread 2 to Uncertain in the next
  run
- `mark 1 as covered by commitments_create` → annotate Gmail label
  + skip create
- `skip all uncertain` → auto-filter them this run

### Step 5 — Execute approved actions + log fates

After user approval:

```bash
# Run approved MCP / CLI actions per user response
# For threads marked "stage as uncertain" or "covered elsewhere",
# emit an item-fate event so the chef learns user preferences over
# time:
arete events log winddown --event email-triage-fate --json
```

(The dismissal-as-signal feedback loop from Phase 3.5 covers
deferral disagreement; email-triage participates by emitting fates
for "should not have surfaced this" feedback.)

## Gather-only mode

This skill supports the **gather-only composition** sub-mode
documented in `PATTERNS.md` (§ "gather-only composition"). An
orchestrating chef skill (Phase 8's unified daily-winddown reconciler
is the named consumer) invokes email-triage in gather-only mode,
collects structured loop output, composes with other sources
(slack-digest, calendar, meeting), and engages the user **once**.

### Invocation contract (per PATTERNS.md AC1 anchor)

The orchestrator includes the `[gather-only]` marker at the top of its
invocation prompt to this skill, plus a sentence like:

> "Run the email-triage skill in `[gather-only]` mode. Return the
> structured loop output described in email-triage SKILL.md's
> 'Gather-only mode' section. Do NOT engage the user, write to
> `now/archive/email-triage/`, run `arete commitments create`,
> propose actions, or send Slack DMs — those run only when
> email-triage is invoked standalone."

The sub-agent reads this section to learn which steps to skip. This
is a **best-effort prose contract** (per PATTERNS.md § gather-only
composition, "Explicit limitation" subsection) — no harness gate
enforces it.

### Which steps run in gather-only mode

| Step | Standalone | Gather-only |
|---|---|---|
| 0 — Read APPEND | yes | yes |
| 1 — Gather (1a–1d): pull gmail, read week, read commitments, read context | yes | yes |
| 2 — Apply judgment (sender resolve, score, dedup) | yes | yes |
| 3 — Compose curated view | yes | **skipped** — return JSON to orchestrator instead |
| 4 — Persist to `now/archive/email-triage/` + engage user once | yes | **skipped** — no persist, no engage |
| 5 — Execute approved actions + log fates | yes | **skipped** |

The skill in gather-only mode MUST NOT:
- Write to `now/archive/email-triage/` (no persistence — orchestrator
  owns persistence for the composed view).
- Run `arete commitments create / resolve`.
- Send Slack DMs or otherwise propose actions to the user in chat.
- Engage the user in chat.
- Log per-skill fate events (the orchestrator logs its own
  composed-view fates).

### JSON output shape

Return a JSON object matching the canonical gather-only loop shape:

```json
{
  "skill": "email-triage",
  "mode": "gather-only",
  "loops": [
    {
      "source": "email",
      "source_ref": "gmail-thread-id-1789AB",
      "counterparty": "lindsay-gray",
      "timestamp": "2026-05-27T11:04:00Z",
      "text": "Lindsay asked to confirm Wed Glance 2.0 review by EOD.",
      "evidence_pointer": "https://mail.google.com/mail/u/0/#inbox/1789AB",
      "kind": "incoming-ask",
      "confidence": 0.88,
      "area": "glance-communications",
      "dedup_key": "glance-2.0-review-wed"
    },
    {
      "source": "email",
      "source_ref": "gmail-thread-id-1899CD",
      "counterparty": null,
      "timestamp": "2026-05-27T15:22:00Z",
      "text": "Unknown sender flagged vendor onboarding pain — relevant to vendor work.",
      "evidence_pointer": "https://mail.google.com/mail/u/0/#inbox/1899CD",
      "kind": "uncertain",
      "confidence": 0.55
    }
  ],
  "auto_filtered_count": 12,
  "partial": false
}
```

**Per-loop fields** (per PATTERNS.md § gather-only composition):
- Required: `source` (always `"email"`), `source_ref` (Gmail thread
  id), `counterparty` (slug or `null` if sender unresolved),
  `timestamp`, `text`, `evidence_pointer`, `kind`.
- Optional: `confidence`, `area`, `topics`, `dedup_key`.

**`kind` taxonomy for email-triage**:
- `incoming-ask` — a sender asked you something (deadline /
  question / decision request).
- `incoming-fyi` — informational from a high-importance contact;
  worth orchestrator review.
- `decision` — a decision was made or announced (e.g., approval).
- `commitment-outgoing` — you committed to reply / act in-thread.
- `dedup-candidate` — thread topic matches an existing commitment or
  active priority (orchestrator decides whether to surface).
- `uncertain` — sender unknown or action ambiguous; orchestrator
  routes to its Uncertain tier.

**Top-level fields**:
- `skill: "email-triage"`, `mode: "gather-only"` — identifiers.
- `loops: []` — possibly empty.
- `auto_filtered_count: N` — count of threads auto-filtered as
  newsletters / automated / already-replied. The orchestrator may
  surface as a single count line.
- `partial: boolean` — `true` if `arete pull gmail` failed mid-run.
  Orchestrator may surface a `(partial gmail pull)` note.

### Side-effects allowed in gather-only mode

These are read-only and do not violate the contract:

- `arete skill resolve` (Step 0 read).
- `arete pull gmail --days 1 --json` (read; produces no workspace
  artifacts — Gmail is the durable store).
- `arete search` (read).
- `arete commitments list` (read).
- `arete people show` (read).

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `arete.commitments_create` | executable | Thread requires reply / ack by a deadline |
| `arete.commitments_resolve` | executable | Reply already sent or task closed |
| `slack.send_dm` | executable | FYI a colleague about the thread |
| `slack.send_channel` | executable | Cross-post to a channel (rare; APPEND-gated) |
| `notion.update_page` | executable | Thread surfaces a Notion-doc update |
| `arete.inbox_add` | executable | Capture for later workspace triage |
| `jira.create_ticket` | draft-only | Thread surfaces a task wanting a ticket |

User extends or restricts via `.arete/skills-local/email-triage.md`.

## Files this skill touches

- **Reads**: gmail (via `arete pull gmail`), `now/week.md`,
  `people/`, commitments via `arete commitments list`.
- **Writes (after user approval)**:
  `now/archive/email-triage/email-triage-YYYY-MM-DD.md` (curated
  view persistence), commitments via `arete commitments create`,
  optional MCP-backed actions per user approval.
- **APPEND**: `.arete/skills-local/email-triage.md`.

## References

- **Patterns**: [PATTERNS.md](../PATTERNS.md) — chef-orchestrator
  patterns 1–4.
- **CLI**: `arete pull gmail --query <q>`, `arete commitments`,
  `arete people show`.
- **Related skills**: `inbox-triage` (workspace `inbox/` scope),
  `process-meetings` (meeting-scoped extraction).

## Rollback

```bash
git log --oneline -- packages/runtime/skills/email-triage/
git revert <commit-hash>
```

MC5 sunset applies — no `SKILL.legacy.md` ships.
