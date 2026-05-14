---
name: slack-digest
description: Slack daily/weekly digest — agent pulls today's threads, extracts intelligence with user-tuned significance rules, reconciles against existing work, then engages once with a single curated action plan + proposed memory/commitment writes.
triggers:
  - "slack digest"
  - "what happened on slack"
  - "process my slack"
  - "slack recap"
  - "catch me up on slack"
  - "what did I miss on slack"
  - "pull my slack conversations"
  - "daily slack"
category: essential
work_type: operations
primitives:
  - User
  - Risk
intelligence:
  - entity_resolution
  - memory_retrieval
  - synthesis
integration:
  outputs:
    - type: resource
      path: "resources/notes/{date}-slack-digest.md"
      index: true
---

# Slack Digest — chef-orchestrator pattern

This skill is built on the four chef-orchestrator patterns from
`PATTERNS.md`. The agent pulls Slack conversations, assembles
context, extracts intelligence (`significance_analyst`), reconciles
against existing work (week.md, commitments, Waiting On), and
engages the user **once** with a single curated action plan
(Pattern 1: `do-all-work-then-engage`).

Every staged action / extracted item carries a one-line reason
(Pattern 2: `curate-with-reason-labels`). When uncertain — sender
ambiguous, dedup-vs-existing unclear, decision-shaped-but-not-
decisive — surface to `## Uncertain — your call`.

Memory writes, commitment creates, and outbound Slack DMs appear as
action proposals at the end of the curated view with mode tags
(Pattern 3: `propose-with-mcp-action`). Never auto-execute.

Auto-filtered threads (newsletters, bot DMs, bulk channels) roll up
to a single count line. The persistent digest file at
`resources/notes/YYYY-MM-DD-slack-digest.md` IS the durable
artifact; the curated view in chat is the engagement surface
(Pattern 4: `surface-deferred-as-sidecar` adapted — the digest
file is the sidecar-equivalent for the wiki trail, and Slack
itself remains the durable backing store for the source threads).

**Read first** (if exists): `.arete/skills-local/slack-digest.md`.
This is the user's per-skill APPEND: significance rules
(`significance_analyst` per-user tunings), which channels are
high-priority, which Slack reactions act as user-flags, which Slack
DMs translate to commitments_create, which Notion docs to propose
updates against. Treat its content as opinion-defining context.

> **Phase 1 wiki-expansion note**: this skill emits a
> `slack-thread-eval` event per thread (Phase 2c-bis) for the
> substantial-thread heuristic shadow run. The slack-summary writer
> is gated by `ARETE_SLACK_SUMMARIES=1` (default OFF during the
> 7-day shadow). See Phase 2c-bis for the CLI invocation.

## When to Use

- "Slack digest" / "Process my slack"
- "What happened on slack today?"
- "Catch me up on slack"
- End-of-day reconciliation (via daily-winddown)
- End-of-week reconciliation (via weekly-winddown, with
  `--days-back=7`)

## Prerequisites

- Slack MCP integration connected
- User's Slack user ID available from MCP tool metadata

## Arguments

- `today` (default) — pull today's conversations
- `--days-back=N` — pull last N days (default max 3 standalone;
  weekly-winddown uses 7)
- `--channel <name>` — limit to a specific channel or DM
- `--person <name>` — limit to conversations with a specific person
- `--no-extract` — just summarize, don't extract items

## Workflow — chef-orchestrator pattern

**Gather → judge → engage once.** Do not engage between gather and
judge. Do not engage between judge and the curated view. The single
engagement happens at Phase 4 below.

### Step 0 — Read APPEND + log start

```bash
arete skill resolve slack-digest
cat .arete/skills-local/slack-digest.md 2>/dev/null || echo "(no APPEND file)"
```

### Phase 1 — Pull & Organize (gather)

**Parallelize 1a–1e where independent.**

#### 1a. Determine Time Range

Default: today. If `--days-back=N`, extend backward. Calculate
`after:YYYY-MM-DD`.

#### 1b. Search Slack (Parallel)

Two parallel MCP searches to capture both sides of conversations:

**Search 1** — Messages you sent:
```
slack_search_public_and_private:
  query: "from:<@{user_id}> after:{date}"
  sort: timestamp
  sort_dir: asc
  limit: 20
  include_bots: false
```

**Search 2** — Messages sent to you:
```
slack_search_public_and_private:
  query: "to:<@{user_id}> after:{date}"
  sort: timestamp
  sort_dir: asc
  limit: 20
  include_bots: false
```

Paginate with `cursor` until exhausted or capped at 5 pages per
search (100 messages). For deep thread context, use
`slack_read_thread` with the thread's `message_ts`.

#### 1c. Organize by Conversation

Group messages by `channel_id` (each unique channel/DM = one
conversation). Within a channel, group by `thread_ts` if threaded.
Deduplicate messages appearing in both searches.

For each conversation, capture:
- Channel ID, type (dm / channel / group DM), channel name
- Participant names
- Message count, time range
- Raw content (for extraction)

#### 1d. Resolve Participants

For each unique participant name:

```bash
arete resolve "Person Name" --type person --json
```

Build `{slack_name -> person_slug}`. Unresolved participants are
queued for Phase 5c.

#### 1e. Filter (if arguments provided)

- `--channel`: match against channel name or ID
- `--person`: resolve name via `arete resolve`, then filter to
  conversations including that person

### Phase 2 — Context Assembly & Extraction (judge)

#### 2a. Assemble Context Bundle

Use `context_bundle_assembly` to ground extraction:

```bash
arete search "current priorities goals" --scope context --json
arete search "recent decisions" --scope memory --json
arete commitments list --json
arete topic list --active --slugs --json
```

For each resolved participant:

```bash
arete people show <slug> --memory
```

**Token budget**: ~2,500 words total. If many participants,
prioritize people in DMs over channel participants.

#### 2b. Extract Intelligence (significance_analyst)

For each conversation, apply `significance_analyst` (not keyword
scanning):

1. Internalize the context bundle.
2. Read conversation content knowing what matters to the user's
   strategy.
3. Apply judgment: genuinely significant? Connects to goals?
   Contradicts prior decisions? Worth remembering in 3 months?
4. Rank candidates with grounding — cite specific
   goal/decision/stance.

Extract these item types:

| Type | What to Look For |
|------|-----------------|
| **Decisions** | Choices made or confirmed |
| **Learnings** | Insights, market/competitive signals |
| **Commitments (outgoing)** | Things you promised to do |
| **Commitments (incoming)** | Things others promised you |
| **People signals** | Stances, concerns, asks, relationship |

**Deduplication** — check candidates against:
- Existing commitments from 2a
- Cross-conversation duplicates (same topic in multiple channels)

Flag potential dupes for the curated view.

**Per-thread topic slugs** — propose 1–3 slugs per conversation
biased against the active-topic list (2a). The bias block must be
byte-equal to `TOPIC_BIAS_BLOCK_PROMPT` in
`packages/core/src/services/meeting-extraction.ts`:

<!-- BIAS_BLOCK_START -->
**Prefer these existing topic slugs when applicable.** Only propose a new slug
when the meeting is substantively about something not covered. Matching an
existing slug keeps knowledge compounding instead of sprawling:
<!-- BIAS_BLOCK_END -->

Per-thread output shape:

```ts
{
  channel_id: string,
  participants: string[],
  topics: string[],  // 1-3 slugs, biased toward the active list above
  // ...extracted items
}
```

A thread with no clear topic match emits `topics: []`. Two threads
in the same digest may emit the same slug — Phase 5a dedups.

#### 2c. Slack-thread heuristic eval (MC3 shadow run)

For each thread evaluated in 2b, emit a `slack-thread-eval` event:

```bash
arete events log slack-thread \
  --thread "<channel_id>/<thread_ts>" \
  --messages <message_count> \
  --participants <participant_count> \
  $([ <decision_detected> = true ] && echo --decision) \
  $([ <user_flagged> = true ] && echo --user-flag) \
  --json
```

Default heuristic — `would_summarize=true` when **any** of:
- `messages >= 10`
- decision detected by significance_analyst
- `participants >= 3`
- user-flagged via slack reaction or skill arg

Best-effort: if CLI errors, continue. After ≤20% combined
false-pos/false-neg rate over 7 days, `ARETE_SLACK_SUMMARIES=1`
goes live writing to `.arete/memory/summaries/slack/<thread-id>.md`.

#### 2d. Area Association

If conversations map to known areas:

```bash
arete search "<conversation topic>" --scope areas --json
```

Tag extracted items with `area: <slug>` for routing.

### Phase 3 — Reconcile Against Existing Work (judge)

The highest-value phase. Slack conversations confirm, update,
block, or resolve things already tracked.

#### 3a. Load Current Work Surface

```bash
cat now/week.md
arete commitments list --json
cat now/tasks.md
```

#### 3b. Match Slack Activity Against Week Tasks

For each task in `week.md`:

| Signal | Recommendation |
|--------|---------------|
| **Completed** | Mark `[x]` |
| **Blocked** | Add blocker note, demote if in Must |
| **Reprioritized** | Move between Must/Should/Could |
| **Delegated** | Move to Waiting On with person tag |
| **Refined** | Update task text |

Number matches globally (across all sections).

#### 3c. Reconcile Commitments

Against `arete commitments list`:

1. **Resolve candidates** — Slack confirms fulfillment.
2. **Update candidates** — details changed (deadline / scope /
   blocker).
3. **Duplicate detection** — extracted commitment matches existing
   — surface to Uncertain.
4. **Net-new commitments** — genuinely new items.

#### 3d. Reconcile Waiting On

Scan `week.md → Waiting On`. For each item, check Slack for a
response or delivery.

### Phase 4 — Compose curated view + persist + engage user once

Build the single message to the user. **No engagement before this.**

**Output template** — numbered globally across sections so the user
can batch-respond ("approve 1-5, 8-12, skip 6, edit 3"):

```markdown
## Slack Digest Action Plan — YYYY-MM-DD ({N} items)

{1-2 sentence summary: M conversations, P participants resolved,
N items proposed.}

### Week Task Updates (stage for approval)

1. Mark complete: "Set up dev repo scaffolding…" — Slack confirms delivery
2. Update: "Schedule [topic]" → add "after sprint planning" — sender pushed back
3. Delegate: "Review templates" → Waiting On [Person F] — F took it over

### Commitments to Resolve (stage)

4. cmt_ea59 [Person C]: Import workflow — confirmed ready in #channel
5. cmt_7d1d [Person E]: Feature emails — confirmed: no plans

### Commitments to Add (stage)

6. Present research findings at team standup → @[user] → @person-b — by Monday
7. Check [Person G] access → @[user] → @person-b — open commitment, escalating

### Decisions & Learnings (stage to memory)

8. Decision: Team members assumed to get repo access — appears in #onboarding
9. Learning: Inbound + threading are top feature priorities — multi-thread signal
10. Learning: [Company A] is biggest volume contributor — confirmed in pricing thread

### People Signals (refresh)

11. [Person A]: Impressed by CLI tool speed — positive health signal
12. [Person D]: Has frontend capacity, pragmatic about backend deps — capacity update

## Uncertain — your call

- [ ] Item 13: cmt_dedup_check — extracted "Send proposal to [vendor]" matches cmt_3f80 ([Person X] owes proposal). **Same commitment or net-new?**
- [ ] Item 14: "Push back on Q3 churn" mentioned in #internal — no decision, just context. **Capture as learning or skip?**

{N} threads auto-filtered (newsletter / bot / already-replied; no
sidecar — Gmail/Slack are durable stores).

## Proposed actions

[1] arete.commitments_resolve id=cmt_ea59 resolution="confirmed in slack thread"
[2] arete.commitments_create text="Present research findings at standup" target_person=person-b due=monday
[3] arete.commitments_create text="Check [Person G] access" target_person=person-b
[4] slack.send_dm to @lauren: "Saw Q3 churn ping — want a 15-min sync this week?"
[5] notion.update_page page_id_or_title="Glance 2.0 stakes" content="Decision: assume team gets repo access (2026-05-15 #onboarding)"
[6] (draft) jira.create_ticket project=GLANCE type=Task summary="Investigate [Company A] volume bias for pricing model"

What's your call? (e.g. "approve 1-12, skip 13-14, action 1-5, draft 6")
```

**Reason-label rules** (Pattern 2): ≤12 words, inline after em-dash
or in evidence column. Standard taxonomy plus:

- **Conversation source** — `#channel-name / DM-with-@person`
- **Decision strength** — `confirmed / discussed / inferred`
- **Reconciliation signal** — `completed in slack / blocked /
  delegated`
- **Dedup status** — `matches cmt_<hash> / net-new`

**Uncertain-tier rule (Phase 3.5 C2 convention)** — surface to
`## Uncertain — your call` when in doubt rather than guessing.
Three explicit defer-category examples that ALWAYS surface:

- **"needs verification"** — decision-shaped language but inconclusive
  (e.g., "I think we should go API-first").
- **"interesting future"** — content not actionable now but plausibly
  relevant later (e.g., teammate flags a customer trend without an ask).
- **"covered elsewhere"** — extracted item duplicates existing memory
  / commitment / topic page; agent isn't sure if Slack adds new signal.

LOW-confidence items default to Uncertain, not auto-extracted.

**Action proposal rules** (Pattern 3): inline numbered list, verb +
parameters, `(draft)` prefix for draft-only.

### Step 4.5 — Persist the curated view BEFORE engaging

Write the full Phase-4 curated view verbatim to
`now/archive/slack-digest/slack-digest-YYYY-MM-DD.md`. This is the
audit trail; the chat buffer is volatile.

```bash
mkdir -p now/archive/slack-digest
cat > "now/archive/slack-digest/slack-digest-$(date +%Y-%m-%d).md" <<'EOF'
{full Phase-4 curated view, including all sections}
EOF
```

On re-run (same day), append `## Re-run at HH:MM` divider; do not
overwrite.

### Step 4 — Engage user once

After persisting, send the curated view as a single message. Wait
for user response.

Acceptable responses:
- `approve all` — apply everything
- Number ranges — `approve 1-12, skip 13-14, action 1-5`
- Section-level — `approve tasks and commitments, skip learnings`
- `edit 3 → "..."` — modify before applying
- Free-form pushback / questions — engage normally

### Phase 5 — Execute approved changes + write digest

After approval (and only after):

#### 5a. Apply approved changes

**1. Week plan updates** — edit `now/week.md`:
- Mark `[x]` completed tasks
- Update task text where refined
- Move reprioritized items
- Move delegated items to Waiting On
- Add net-new tasks (urgency cue → Must/Should/Could)

**2. Commitment changes**:

```bash
# Resolve fulfilled commitments
arete commitments resolve <id> --yes --status resolved

# Net-new commitments — use --skip-qmd in batches, run arete index once at end
arete commitments create "<text>" \
  --person <slug> \
  --direction i_owe_them \
  --person-name "<display>" \
  --source "YYYY-MM-DD-slack-digest.md" \
  --skip-qmd \
  --json
```

For `they_owe_me`, after CLI creation, add Waiting On entry:
```markdown
- [ ] <text> @person(<slug>) @from(commitment:<id-prefix>)
```

**3. Non-commitment action items** — add to `now/week.md` under
Must / Should / Could per urgency cues.

**4. Memory writes** (`extract_decisions_learnings`):
- Decisions → `.arete/memory/items/decisions.md`
- Decisions (area-mapped) → also append to `areas/<slug>.md →
  ## Notes`
- Learnings → `.arete/memory/items/learnings.md`

**5. People updates**:

```bash
arete people memory refresh --person <slug>
```

#### 5b. Save Digest File

Write `resources/notes/YYYY-MM-DD-slack-digest.md`. The `topics:`
frontmatter is the **deduped union of per-thread topic slugs from
Phase 2b**, scoped to user-approved threads. Sort for stable output.

```markdown
---
title: "Slack Digest — YYYY-MM-DD"
date: YYYY-MM-DD
type: slack-digest
conversations: N
participants: [...]
items_extracted: N
items_approved: N
tasks_updated: N
commitments_resolved: N
commitments_added: N
areas: [...]
topics: [slug1, slug2, ...]
---

# Slack Digest — YYYY-MM-DD

## Conversations

### 1. DM with [Person A]
[2-3 sentence summary]
- Topics: [Project X], [Product Y]

…

## Reconciliation Summary

### Week Tasks Updated
- [x] …
- [~] …

### Commitments Resolved / Added / Cleared
- …

## Decisions & Learnings Saved
- Decision: … → decisions.md
- Learning: … → learnings.md
```

#### 5c. Integrate Topics & Re-index

```bash
SLUGS="<comma-separated topics from digest frontmatter>"
DIGEST="resources/notes/YYYY-MM-DD-slack-digest.md"

if [ -n "$SLUGS" ]; then
  TOPIC_OUT=$(arete topic refresh --slugs "$SLUGS" --source "$DIGEST" --yes --json 2>&1) || true
  if echo "$TOPIC_OUT" | grep -q '"error":"seed_lock_held"'; then
    echo "Topic refresh deferred — seed lock held by another operation."
    echo "Re-run when complete: arete topic refresh --slugs $SLUGS --source $DIGEST --yes"
  fi
fi

arete index
```

**Lock-contention contract**: `arete topic refresh` exits non-zero
with `{"error":"seed_lock_held"}` on stdout when
`.arete/.seed.lock` is held. Skill MUST catch and continue — the
digest, commitments, memory items, and people refreshes have
already committed; only the topic narrative side effect is
deferred. Re-running is idempotent (content-hash dedup).

#### 5d. Handle Unresolved Participants

For participants unresolved in Phase 1d, surface as a small follow-
on engagement (not the main curated view — those are stitching
follow-ups):

```
I couldn't match these Slack users to workspace people:
1. [Unresolved Person 1] (email@example.com)
2. [Unresolved Person 2] (mentioned, no direct messages)

Add to internal / customers / users / skip?
```

#### 5e. Report

```
Slack Digest — YYYY-MM-DD:
- 6 conversations, 5 participants resolved
- 3 week tasks updated, 2 commitments resolved, 1 added
- 2 decisions + 1 learning → memory
- Digest: resources/notes/YYYY-MM-DD-slack-digest.md
```

## Action verbs this skill may propose

| Verb | Mode | When |
|---|---|---|
| `arete.commitments_create` | executable | Net-new outgoing/incoming commitment |
| `arete.commitments_resolve` | executable | Slack confirms a commitment is done |
| `slack.send_dm` | executable | Follow-up on a thread (APPEND-gated) |
| `slack.send_channel` | executable | Cross-post — APPEND-gated |
| `notion.update_page` | executable | Slack surfaced a Notion-doc update |
| `jira.create_ticket` | draft-only | Slack surfaced a task wanting a ticket |
| `arete.inbox_add` | executable | Capture loose thought from the digest |

User extends or restricts via `.arete/skills-local/slack-digest.md`.

## Integration with Daily Winddown

When called from `daily-winddown`, this skill runs as **Phase 3g** —
after meeting processing is complete. The reconciliation step (Phase
3) reads the current state of commitments/decisions/learnings/week —
so meeting outputs naturally dedup. Only genuinely new items from
Slack surface for approval.

## Integration with Weekly Winddown

Called with `--days-back=7` (or since last weekly winddown). All
meetings from the week are already processed; slack-digest catches
week-long async threads that didn't surface in meetings.

## Pagination & Limits

- Slack search returns max 20 per page.
- Paginate up to 5 pages per direction (100 messages each).
- If capped: "Showing first 100 per direction. Use `--channel` or
  `--person` to focus."

## Edge Cases

| Case | Handling |
|------|----------|
| No messages found | "No Slack activity for {date}." |
| Bot messages | Filtered by `include_bots: false` |
| Very long threads | `slack_read_thread`, summarize before extracting |
| Shared links/files | Note in digest, don't fetch content |
| Threads you didn't participate in | Skip unless @mentioned |
| Sensitive content (creds, PII) | Skip — do not extract |
| Person resolution fails | Queue for 5d |
| No context bundle (new workspace) | Fall back to keyword scanning |

## Files this skill touches

- **Reads**: Slack MCP, `now/week.md`, `now/tasks.md`,
  `arete commitments list`, `people/`, `arete topic list --active`,
  `.arete/memory/items/`.
- **Writes (after user approval)**:
  `resources/notes/YYYY-MM-DD-slack-digest.md` (durable digest),
  `now/archive/slack-digest/slack-digest-YYYY-MM-DD.md` (curated-
  view persistence), `.arete/memory/items/{decisions,learnings}.md`,
  commitments via `arete commitments create/resolve`,
  `arete topic refresh` (topic integration).
- **APPEND**: `.arete/skills-local/slack-digest.md`.

## References

- **Patterns**: [PATTERNS.md](../PATTERNS.md) —
  `significance_analyst`, `context_bundle_assembly`,
  `extract_decisions_learnings`, `refresh_person_memory`, plus
  chef-orchestrator patterns 1–4.
- **CLI**: `arete resolve`, `arete people show --memory`,
  `arete people memory refresh`, `arete commitments list / create /
  resolve`, `arete search`, `arete index`,
  `arete topic list --active --slugs --json`,
  `arete topic refresh --slugs <list> --source <path>`,
  `arete events log slack-thread`.
- **MCP**: `slack_search_public_and_private`, `slack_read_channel`,
  `slack_read_thread`, `slack_search_users`.
- **Related**: `capture-conversation` (single thread),
  `process-meetings` (extraction model), `daily-winddown` /
  `weekly-winddown` (orchestrators).

<!-- ARETE_INTEGRATION_START -->
## Areté Integration

**Output**: `resources/notes/{date}-slack-digest.md`.

**Indexing**: Run `arete index` after Phase 5.

### Topic Wiki Coverage

This skill writes `topics: [...]` frontmatter (Phase 5b) and
triggers Hook 2 via `arete topic refresh` (Phase 5c) so each digest
contributes to the topic wiki at `memory/topics/`. Pre-existing
digests lack `topics:` frontmatter and are silently skipped by
`discoverTopicSources`. To pick them up: re-run with `--days-back=N`.
<!-- ARETE_INTEGRATION_END -->

## Rollback

```bash
git log --oneline -- packages/runtime/skills/slack-digest/
git revert <commit-hash>
```

MC5 sunset applies — no `SKILL.legacy.md` ships.
