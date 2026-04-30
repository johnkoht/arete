---
name: slack-digest
description: Pull today's Slack conversations, extract action items, decisions, commitments, and context updates using workspace intelligence, then route to memory and people. Use when the user wants a daily Slack recap or to process async conversations.
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

# Slack Digest Skill

Pull today's Slack conversations, resolve participants to workspace people, assemble context, extract intelligence using the **significance_analyst** pattern, and route approved items to memory, commitments, and people files. Designed to run standalone or as a phase within `daily-winddown`.

## When to Use

- "Slack digest" / "Process my slack"
- "What happened on slack today?"
- "Catch me up on slack"
- End-of-day reconciliation (via daily-winddown)
- After a busy day with lots of async conversations

## Prerequisites

- Slack MCP integration connected (via Claude Desktop or Claude Code)
- User's Slack user ID available from MCP tool metadata (found in `slack_search_public_and_private` tool description)

## Arguments

- `today` (default) — pull today's conversations
- `--days-back=N` — pull last N days (default max 3 standalone; weekly-winddown uses 7)
- `--channel <name>` — limit to a specific channel or DM
- `--person <name>` — limit to conversations with a specific person (resolved via `arete resolve`)
- `--no-extract` — just summarize, don't extract items
- `--commit` — write items directly to memory (skip staged review)

---

## Workflow

### Phase 1: Pull & Organize Conversations

#### 1a. Determine Time Range

Default: today. If `--days-back=N`, extend backward.

Calculate the `after:` date filter: `after:YYYY-MM-DD`

#### 1b. Search Slack (Parallel)

Run two parallel MCP searches to capture both sides of conversations:

**Search 1** — Messages you sent:
```
slack_search_public_and_private:
  query: "from:<@{user_id}> after:{date}"
  sort: timestamp
  sort_dir: asc
  limit: 20
  include_bots: false
```

**Search 2** — Messages sent to you (DMs, mentions, group DMs):
```
slack_search_public_and_private:
  query: "to:<@{user_id}> after:{date}"
  sort: timestamp
  sort_dir: asc
  limit: 20
  include_bots: false
```

Paginate with `cursor` until exhausted or capped at 5 pages per search (100 messages). For deeper thread context, use `slack_read_thread` with the thread's `message_ts`.

#### 1c. Organize by Conversation

Group messages by **channel_id** (each unique channel/DM = one conversation). Within a channel, group by **thread_ts** if threaded. Deduplicate messages that appear in both search results.

For each conversation, capture:
- Channel ID, type (dm / channel / group DM), channel name
- Participant names (from message `From:` fields)
- Message count, time range
- Raw message content (for extraction)

#### 1d. Resolve Participants

For each unique participant name, resolve to a workspace person:

```bash
arete resolve "Person Name" --type person --json
```

Build a participant map: `{slack_name -> person_slug}`. If resolution fails, flag as unresolved for later (step 5c).

#### 1e. Filter (if arguments provided)

- `--channel`: match against channel name or ID
- `--person`: resolve name via `arete resolve`, then filter to conversations including that person

---

### Phase 2: Context Assembly & Extraction

#### 2a. Assemble Context Bundle

Use the **context_bundle_assembly** pattern to ground extraction in workspace strategy:

```bash
# Strategy and goals context
arete search "current priorities goals" --scope context --json

# Recent memory — decisions and commitments
arete search "recent decisions" --scope memory --json

# Existing commitments (for dedup)
arete commitments list --json

# Active topic slugs — biases per-thread topic extraction in Phase 2c.
# Same rendering meeting-extraction.ts uses; output shape: {"slugs": [...]}.
arete topic list --active --slugs --json
```

For each resolved participant, gather person context:

```bash
arete people show <slug> --memory
```

This provides stances, open items, relationship health — enriching extraction with awareness of what matters per person.

**Token budget**: ~2,500 words total per context_bundle_assembly guidelines. If many participants, prioritize people in DMs over channel participants.

#### 2b. Present Conversation Overview (Checkpoint)

Present the organized conversations before extracting:

```
## Today's Slack Activity — YYYY-MM-DD

| # | With | Channel | Topics | Messages |
|---|------|---------|--------|----------|
| 1 | [Person A] | DM | [Project X] setup, [Product Y] | 15 |
| 2 | [Person B] | DM | Research findings, AI tooling | 10 |
| 3 | [Person C], [Person D], [Person A] | Group DM | Email feature capacity | 5 |

Extract intelligence from all? Or select specific conversations (e.g., "1, 2")?
```

If `--no-extract`, stop here after summaries.

#### 2c. Extract Intelligence (significance_analyst pattern)

For each selected conversation, apply the **significance_analyst** pattern rather than keyword scanning:

1. **Internalize context bundle** — strategy, goals, existing decisions, person stances
2. **Read conversation content** knowing what matters to the user's strategy
3. **Apply judgment**: Is this genuinely significant? Does it connect to goals? Contradict prior decisions? Worth remembering in 3 months?
4. **Rank candidates** with grounding — cite specific goal/decision/stance that makes it significant

Extract these item types:

| Type | What to Look For | Format |
|------|-----------------|--------|
| **Decisions** | Choices made or confirmed in conversation | Title, context, rationale, who decided |
| **Learnings** | Insights, new information, market/competitive signals | Title, source, insight, implications |
| **Commitments (outgoing)** | Things you promised to do | Action, counterparty, deadline, deliverable |
| **Commitments (incoming)** | Things others promised you | Action, owner, deadline, deliverable |
| **People signals** | Stances, concerns, asks, relationship signals | Person slug, signal type, content |

**Deduplication** — Before finalizing candidates, check against:
- Existing commitments from `arete commitments list` output (step 2a)
- Cross-conversation duplicates (same topic in multiple channels)

Flag potential dupes: "This looks similar to existing commitment: [existing]. Skip? / Keep both?"

**Per-thread topic slugs** — For each conversation/thread, also propose
**1–3 topic slugs** describing what the thread is substantively about. These
flow into the digest's `topics:` frontmatter (Phase 5a, union across approved
threads) and drive Hook 2 source integration on the receiving topic pages.

Bias the proposals against the active-topic slug list captured in Phase 2a
(`arete topic list --active --slugs --json`). Render the slug list as bare
slugs (one per line, e.g. `cover-whale-templates — active: pilot in flight`)
and include the block below verbatim — the wording is byte-equal to the
meeting-extraction prompt's bias block (`TOPIC_BIAS_BLOCK_PROMPT` in
`packages/core/src/services/meeting-extraction.ts`) and a test enforces that
equality. Edit both surfaces together or the test fails.

<!-- BIAS_BLOCK_START -->
**Prefer these existing topic slugs when applicable.** Only propose a new slug
when the meeting is substantively about something not covered. Matching an
existing slug keeps knowledge compounding instead of sprawling:
<!-- BIAS_BLOCK_END -->

Per-thread output shape inside the skill's intermediate state:

```ts
{
  channel_id: string,
  participants: string[],
  topics: string[],  // 1-3 slugs, biased toward the active-slug list above
  // ...other extracted items
}
```

A thread with no clear topic match emits zero slugs (an empty `topics: []`)
rather than a forced match. Two threads in the same digest may legitimately
emit the same slug — the union dedups in Phase 5a.

#### 2d. Area Association (Optional)

If conversations map to known areas, attempt association. Check if conversation participants or topics match area files:

```bash
# Check if conversation topic relates to a known area
arete search "<conversation topic>" --scope areas --json
```

When area is identified, tag extracted items with `area: <slug>` for routing decisions to area files.

---

### Phase 3: Reconcile Against Existing Work

This is the highest-value phase. Slack conversations don't happen in a vacuum — they confirm, update, block, or resolve things you're already tracking. Before presenting new items, cross-reference against `week.md`, `commitments.json`, and `now/tasks.md`.

#### 3a. Load Current Work Surface

```bash
# Current week plan (tasks, Waiting On, outcomes)
cat now/week.md

# Open commitments
arete commitments list --json

# Task backlog
cat now/tasks.md
```

#### 3b. Match Slack Activity Against Week Tasks

For each task in `week.md` (Must / Should / Could), check whether today's Slack conversations contain evidence that the task:

| Signal | Action |
|--------|--------|
| **Completed** — conversation confirms the work was done or delivered | Recommend: mark `[x]` in week.md |
| **Blocked** — someone said they can't do it yet, or a dependency was surfaced | Recommend: add blocker note, move to Should/Could if in Must |
| **Reprioritized** — conversation suggests urgency changed (e.g., "let's push that to next week") | Recommend: move between Must/Should/Could or carry to next week |
| **Delegated** — you handed it off or someone else picked it up | Recommend: move to Waiting On with person tag |
| **Refined** — scope changed, deadline shifted, new details emerged | Recommend: update task text with new details |

Present matches with conversation evidence. **Number all items globally** — numbering continues across all sections so the user can batch-respond with numbers in Phase 4.

```
## Reconciliation: Week Tasks <-> Slack

### Task Updates (N matches found)

1. [DONE]: "Set up dev repo scaffolding and share with [Person A]"
   - Evidence: You shared the repo link with [Person A] in DM, they confirmed setup works
   - Recommend: Mark complete

2. [UPDATED]: "Schedule [topic] discussion with [Person B]"
   - Evidence: [Person B] said "let's see how sprint planning goes first"
   - Recommend: Keep, add note "after sprint planning or next week"

3. [DELEGATED]: "Review [System A] templates in spreadsheet"
   - Evidence: [Person F] fixed bracket issues and created import tab
   - Recommend: Move to Waiting On -> [Person F]
```

#### 3c. Reconcile Commitments

Cross-reference extracted Slack items against open commitments (`arete commitments list`):

1. **Resolve candidates** — Slack shows a commitment was fulfilled:
   - Someone delivered what they owed you (Waiting On -> resolved)
   - You delivered what you owed someone
   - Recommend: `arete commitments resolve <id> --yes --status resolved`

2. **Update candidates** — Commitment details changed:
   - New deadline mentioned
   - Scope refined
   - Blocker surfaced

3. **Duplicate detection** — Extracted commitment matches an existing one:
   - Flag: "This looks like existing commitment `{hash}`: '{text}'. Skip? / Update existing?"

4. **Net-new commitments** — Things from Slack not yet tracked:
   - These are the genuinely new items to add

Present:

```
## Reconciliation: Commitments <-> Slack

### Resolve (N) — Slack confirms these are done
| Hash | Person | Commitment | Evidence |
|------|--------|------------|----------|
| ea594040 | [Person C] | Complete import workflow | [Person C] confirmed sync ready in #project-channel |

### Update (N) — Details changed
| Hash | Person | Change | Evidence |
|------|--------|--------|----------|
| 5e59d5f7 | [Person C] | Inbound email scoping | Confirmed top priority is inbound + threading |

### Already Tracked (N) — Skip these
| Extracted Item | Matches Commitment |
|---------------|-------------------|
| "Discuss topic after sprint planning" | [Person B] owes: discuss after sprint (hash: ...) |

### Net-New (N) — Not yet tracked
| What | Direction | Person | By When |
|------|-----------|--------|---------|
| Present research findings at team standup | You owe | [Person B] | Monday |

Confirm? Resolve/update/add as shown, or adjust.
```

#### 3d. Reconcile Waiting On

Scan `week.md` -> Waiting On section. For each item, check if Slack contains a response or delivery:

```
### Waiting On Updates (N)
| Person | Waiting For | Slack Signal | Recommend |
|--------|------------|-------------|-----------|
| [Person A] | Send pricing proposal | No activity | Keep |
| [Person E] | Plans for templates? | [Person E] confirmed: "no plans, ignore" | Resolve |
| [Person C] | Complete import workflow | [Person C] ready to sync | Resolve |
```

---

### Phase 4: Review & Route

#### 4a. Present Combined Review

After reconciliation, present the **full action plan** — reconciliation changes + net-new items — in one view. **All items are globally numbered** so the user can batch-respond (e.g., "approve 1-3, 5, 7-12, skip 4, edit 6").

Number items sequentially across all sections starting at 1. Do not restart numbering per section.

```
## Slack Digest Action Plan — YYYY-MM-DD (N items)

### Week Task Updates
1. Mark complete: "Set up dev repo scaffolding..." (Slack confirms)
2. Update: "Schedule [topic] discussion" -> add "after sprint planning"
3. Delegate: "Review templates" -> Waiting On [Person F]

### Commitments to Resolve
4. `ea594040` [Person C]: Import workflow -> resolved
5. `7d1d22f2` [Person E]: Feature emails -> resolved (confirmed: no plans)

### Commitments to Add
6. Present research findings at team standup -> You owe [Person B], Monday
7. Check [Person G] access -> You owe [Person B], next week

### Waiting On to Clear
8. [Person E]: Template plans -> resolved

### Decisions
9. Assume team members will get repo access -> decisions.md
10. Ignore templates 3804-3810 -> decisions.md

### Learnings
11. Inbound email + threading are top feature priorities -> learnings.md
12. [Company A] is biggest volume contributor -> learnings.md

### People Signals
13. [Person A]: Impressed by CLI tool speed
14. [Person D]: Has frontend capacity, pragmatic about backend deps

---
**Approve all** / **Approve 1-8, skip 9-14** / **Custom** (e.g., "1-3, 5, 7-12 done, skip 4, edit 6")
```

#### 4b. User Review

The user can respond with:
- **"approve all"** — apply everything
- **Number ranges** — "approve 1-5, 8-12" / "skip 6, 7" / "edit 3"
- **Section-level** — "approve tasks and commitments, skip learnings"

For items the user wants to edit, present with conversation excerpt for context and allow modification before applying.

For commitments: confirm owner, counterparty (`@owner -> @counterparty`), deadline.
For task updates: confirm the change (mark done, move, update text).

#### 4c. Apply Approved Changes

Execute in order:

**1. Week plan updates** — Edit `now/week.md`:
- Mark completed tasks `[x]`
- Update task text where refined
- Move reprioritized items between Must/Should/Could
- Move delegated items to Waiting On
- Remove resolved Waiting On items
- Add net-new tasks to appropriate section

**2. Commitment changes**:
```bash
# Resolve fulfilled commitments
arete commitments resolve <id> --yes --status resolved
```

For **net-new commitments**, use the CLI:

```bash
# i_owe_them — creates commitment + linked task in week.md automatically
arete commitments create "<commitment text>" \
  --person <slug> \
  --direction i_owe_them \
  --person-name "<display name>" \
  --source "YYYY-MM-DD-slack-digest.md" \
  --skip-qmd \
  --json

# they_owe_me — creates commitment (no linked task)
arete commitments create "<commitment text>" \
  --person <slug> \
  --direction they_owe_me \
  --person-name "<display name>" \
  --source "YYYY-MM-DD-slack-digest.md" \
  --skip-qmd \
  --json
```

The CLI command automatically handles:
- ID generation (deterministic sha256 hash)
- Linked task creation for `i_owe_them` (task added to week.md with `@from(commitment:XXXX)` metadata)

Use `--skip-qmd` on each call during batch creation. Run `arete index` once at the end (step 6).

For `they_owe_me` commitments, after CLI creation, add a Waiting On entry to `now/week.md`:
```markdown
- [ ] <commitment text> @person(<slug>) @from(commitment:<id-prefix>)
```

**3. Non-commitment action items** — For tasks extracted from Slack that don't involve a counterparty commitment (e.g., "Research competitor pricing", "Update documentation"), add directly to `now/week.md` under the appropriate priority section:
- Urgent / time-sensitive -> `### Must complete`
- Important / this week -> `### Should complete`
- Nice to have -> `### Could complete`

Use urgency cues from the Slack conversation (deadlines mentioned, "ASAP", blocking others) to determine bucket. When no clear signal, default to `### Should complete`.

**4. Memory writes** — Following **extract_decisions_learnings** pattern:
- Decisions -> `.arete/memory/items/decisions.md` (standard format: `### YYYY-MM-DD: [Title]`)
- Decisions (area-mapped) -> also append to `areas/{slug}.md` -> `## Notes`
- Learnings -> `.arete/memory/items/learnings.md` (standard format)

**5. People updates**:
```bash
arete people memory refresh --person <slug>
```

This updates auto-managed memory sections (stances, open items, relationship health) per participant.

**6. Re-index**:
```bash
arete index
```

---

### Phase 5: Save Digest & Report

#### 5a. Save Digest File

Write to `resources/notes/YYYY-MM-DD-slack-digest.md`. The `topics:` frontmatter
field is the **deduped union of per-thread topic slugs** from Phase 2c, scoped
to threads the user approved in Phase 4b. Drop unapproved threads' slugs.
A thread with `topics: []` contributes nothing to the union. Sort the final
list for stable output:

```markdown
---
title: "Slack Digest — YYYY-MM-DD"
date: YYYY-MM-DD
type: slack-digest
conversations: N
participants: [person-a, person-b, ...]
items_extracted: N
items_approved: N
tasks_updated: N
commitments_resolved: N
commitments_added: N
areas: [area-slug1, ...]
topics: [slug1, slug2, ...]
---

# Slack Digest — YYYY-MM-DD

## Conversations

### 1. DM with [Person A]
[2-3 sentence summary]
- Topics: [Project X], [Product Y], volume metrics

### 2. DM with [Person B]
[2-3 sentence summary]
...

## Reconciliation Summary

### Week Tasks Updated
- [x] Set up dev repo scaffolding (confirmed in Slack)
- [~] Schedule [topic] discussion -> updated: "after sprint planning"

### Commitments Resolved
- ea594040: [Person C] import workflow -> resolved
- [Person E] template plans -> resolved (confirmed: no plans)

### Commitments Added
- Present research findings at team standup (@[user] -> @person-b, Monday)

### Waiting On Cleared
- [Person E]: Template plans -> done

## Decisions & Learnings Saved
- Decision: Assume team members will get repo access -> decisions.md
- Learning: Inbound email + threading are top feature priorities -> learnings.md
```

#### 5b. Integrate Topics & Re-index

After the digest file is written (5a), trigger Hook 2 — integrate the
just-written digest into each affected topic page's `sources_integrated`
trail and narrative — THEN run `arete index` so search picks up both the
digest and any topic-page updates.

The topic refresh is **scoped to the digest file** via `--source <path>`
so only this digest is integrated, not every prior digest tagged with
the same slugs (cost-correct semantics; see `--source` help text).

```bash
# Comma-separated union of approved-thread slugs from Phase 5a's `topics:` frontmatter.
SLUGS="<comma-separated topics from digest frontmatter>"
DIGEST="resources/notes/YYYY-MM-DD-slack-digest.md"

# Topic refresh — non-fatal on lock contention. The CLI exits non-zero
# with stdout JSON `{"error":"seed_lock_held",...}` if the seed lock is
# held by a concurrent `meeting approve` (or another topic refresh).
# Treat that case as recoverable: warn the user, leave the digest's
# `topics:` un-integrated, and recommend a manual re-run when the
# conflicting operation completes. Do NOT abort the rest of Phase 5.
if [ -n "$SLUGS" ]; then
  TOPIC_OUT=$(arete topic refresh --slugs "$SLUGS" --source "$DIGEST" --yes --json 2>&1) || true
  if echo "$TOPIC_OUT" | grep -q '"error":"seed_lock_held"'; then
    echo "Topic refresh deferred — seed lock held by another operation."
    echo "Re-run when complete: arete topic refresh --slugs $SLUGS --source $DIGEST --yes"
  fi
fi

arete index
```

**Lock-contention contract**: `arete topic refresh` exits non-zero with
the JSON marker `{"error":"seed_lock_held"}` on stdout when the
`.arete/.seed.lock` is held by another process (meeting approve, another
topic refresh, etc.). The skill MUST catch this and continue — the
digest file, commitments, memory items, and people refreshes from
earlier phases have already committed; only the topic-narrative side-
effect is deferred. Re-running the same `arete topic refresh --slugs ...
--source ...` after the conflicting operation completes is idempotent
(content-hash dedup applies).

#### 5c. Handle Unresolved Participants

If any Slack participants couldn't be resolved in step 1d:

```
I couldn't match these Slack users to workspace people:
1. [Unresolved Person 1] (email@example.com)
2. [Unresolved Person 2] (mentioned, no direct messages)

Would you like me to add any of them?
- people/internal/ — team members
- people/customers/ — customer contacts
- Skip
```

#### 5d. Report

```
Slack Digest — YYYY-MM-DD:
- 6 conversations, 5 participants resolved

Reconciliation:
- 3 week tasks updated (2 completed, 1 refined)
- 2 commitments resolved
- 1 commitment added
- 2 Waiting On items cleared

Intelligence:
- 2 decisions -> memory
- 1 learning -> memory
- 2 people refreshed

Net effect: week.md is current, 2 fewer open commitments.
Digest: resources/notes/YYYY-MM-DD-slack-digest.md
```

---

## Integration with Daily Winddown

When called from `daily-winddown`, this skill runs as **Phase 3g** — after all meeting processing and review is complete:

1. All meeting decisions, learnings, and commitments are already committed to memory files
2. Slack-digest's reconciliation (Phase 3) reads the current state of `commitments.json`, `decisions.md`, `learnings.md`, and `week.md` — so it naturally deduplicates against meeting output
3. Only genuinely new items from Slack are surfaced for approval
4. After approval, Phase 4 (Update & Close) in daily-winddown captures everything in the final report

This ordering matters: meetings are the primary intelligence source; Slack catches what meetings missed — follow-ups, async decisions, side conversations.

---

## Integration with Weekly Winddown

When called from `weekly-winddown`, this skill runs as **Phase 4d** — after commitment reconciliation, before the weekly review:

1. Run with `--days-back=7` (or since last weekly winddown)
2. All meetings from the week are already processed
3. Slack-digest catches week-long async threads that didn't surface in meetings
4. Phase 5 (Weekly Review) then has the complete picture

---

## Pagination & Limits

Slack search returns max 20 results per page. For busy days:

1. Fetch page 1 of both searches (40 messages)
2. Paginate with `cursor` up to 5 pages per search (100 messages each)
3. If capped: "Showing first 100 messages per direction. Use `--channel` or `--person` to focus."
4. For deep thread context, use `slack_read_thread` with specific `message_ts`

---

## Edge Cases

| Case | Handling |
|------|----------|
| No messages found | "No Slack activity for {date}. Nothing to digest." |
| Bot messages | Filtered by `include_bots: false` |
| Very long threads | Use `slack_read_thread` for full context, summarize before extracting |
| Shared links/files | Note in digest as context, don't fetch content |
| Threads you didn't participate in | Skip unless you were @mentioned |
| Sensitive content (creds, tokens, PII) | Skip — do not extract into workspace files |
| Person resolution fails | Queue for step 5c (user classifies) |
| No context bundle (new workspace) | Fall back to keyword scanning instead of significance_analyst |

---

## References

- **Patterns**: `significance_analyst`, `context_bundle_assembly`, `extract_decisions_learnings`, `refresh_person_memory` (see [PATTERNS.md](../PATTERNS.md))
- **CLI**: `arete resolve`, `arete people show --memory`, `arete people memory refresh`, `arete commitments list`, `arete commitments create`, `arete commitments resolve`, `arete search`, `arete index`, `arete topic list --active --slugs --json` (Phase 2a active-topic bias for extraction), `arete topic refresh --slugs <list> --source <path>` (Phase 5b Hook 2 — integrates the just-written digest into each tagged topic page; `--source` scopes the integration to this digest only)
- **MCP Tools**: `slack_search_public_and_private`, `slack_read_channel`, `slack_read_thread`, `slack_search_users`
- **Related Skills**: `capture-conversation` (single thread), `process-meetings` (extraction model), `daily-winddown` (orchestrator)
- **Data Models**: Person files (`people/**/*.md`), Memory (`decisions.md`, `learnings.md`), Commitments (`.arete/commitments.json`), Areas (`areas/*.md`)

<!-- ARETE_INTEGRATION_START -->
## Areté Integration

After completing this skill's workflow:

**Output**: Save to `resources/notes/{date}-slack-digest.md`.

**Indexing**: Run `arete index` to make output searchable by brief, context, and other skills.
<!-- ARETE_INTEGRATION_END -->
