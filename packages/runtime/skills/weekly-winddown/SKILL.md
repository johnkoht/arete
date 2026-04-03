<!-- Adapted from arete-reserv/.agents/skills/weekly-winddown/ -->
---
name: weekly-winddown
description: End-of-week review and transition — catch up unprocessed meetings via parallel subagents, review wins and progress, plan next week, refresh stakeholder intelligence, and identify context gaps.
triggers:
  - weekly winddown
  - end of week
  - close the week
  - friday winddown
  - weekly review and plan
  - wind down the week
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
  - synthesis
---

# Weekly Winddown Skill

End-of-week reconciliation and transition using **subagent orchestration** for reliability and parallelism. The orchestrator spawns focused subagents for independent work (recording pulls, per-meeting processing, thread arcs, context health), then merges results, handles user approvals, compiles the weekly review, and creates next week's plan.

## When to Use

- "weekly winddown"
- "end of week" / "close the week"
- "friday winddown"
- "weekly review and plan"
- "wind down the week"
- Best run Friday afternoon or end of last working day; also fine Monday morning to close the prior week.

## Architecture

```
ORCHESTRATOR (you)
│
├─ Phase 1: Gather ──────────────── parallel subagents
│   ├─ Subagent: Pull recordings + list unprocessed meetings
│   └─ Subagent: Gather planning context (week.md, quarter.md, projects, scratchpad, commitments)
│
├─ Phase 2: Process meetings ────── parallel subagents (1 per meeting, max 4, batched)
│   ├─ Subagent: Meeting A ──┐
│   ├─ Subagent: Meeting B   ├──── safe writes + diffs (same as daily-winddown)
│   ├─ Subagent: Meeting C   │
│   └─ Subagent: Meeting D ──┘
│   (repeat batches if >4 unprocessed meetings)
│
├─ Phase 3: Merge & Intelligence ── orchestrator (sequential)
│   ├─ Merge person file diffs
│   ├─ Verify all writes
│   ├─ Decisions/learnings from ALL week's meetings (user approval gate 1)
│   └─ Refresh stakeholder memory
│
├─ Phase 4: Review & Reconcile ──── parallel subagents + orchestrator
│   ├─ Subagent: Build thread arcs (memory timeline per thread)
│   ├─ Subagent: Context health check
│   └─ Orchestrator: Commitments reconciliation (user approval gate 2)
│
├─ Phase 5: Weekly Review ───────── orchestrator (sequential)
│   ├─ Significance analysis (what actually mattered this week)
│   ├─ Compile review (thread arcs + commitments + outcomes + intelligence)
│   └─ Update week.md with review section
│
├─ Phase 6: Next Week ──────────── parallel subagents + orchestrator
│   ├─ Subagent: Brief for next week
│   ├─ Subagent: Pull next week's calendar
│   └─ Orchestrator: Create next week's plan (week-plan skill, approval gate 3)
│
└─ Phase 7: Finalize ───────────── orchestrator
    ├─ Global people refresh
    ├─ Re-index
    └─ Final report
```

## Workflow

### Phase 1: Gather (parallel)

Spawn two subagents in parallel.

**Subagent 1A — Pull Recordings + Identify Unprocessed** (`subagent_type: "shell"`):

```
PROMPT: |
  Pull this week's meeting recordings and identify unprocessed meetings.

  Run: arete pull fathom --days 7

  If the pull fails or fathom is not configured, that's okay — continue with existing files.

  Then list all meeting files from this week:
    ls resources/meetings/YYYY-MM-DD-*.md
  (use date patterns for each day of the current week, Monday through today)

  For each meeting file, check if it has `attendee_ids` in its YAML frontmatter.
  A meeting is "unprocessed" if it LACKS attendee_ids.

  RETURN:
  - Fathom pull result (success/failure/not configured)
  - Total meeting files found for this week (list filenames)
  - Which are UNPROCESSED (no attendee_ids) — these need Phase 2 processing
  - Which are already processed — these still need decisions/learnings scanning
  - Count of new recordings pulled
```

**Subagent 1B — Gather Planning Context** (`subagent_type: "generalPurpose"`, `readonly: true`):

```
PROMPT: |
  Gather workspace context for the weekly winddown review.

  Read these files and return their key content:

  1. `now/week.md` — This week's planned outcomes, tasks, and any daily progress logged
  2. `goals/quarter.md` — Current quarter goals
  3. `now/scratchpad.md` — Parked items and action items
  4. List and read README.md from each directory in `projects/active/`

  Run: `arete commitments list --json`
  Capture open commitments (what you owe others, what others owe you).

  RETURN:
  - This week's planned outcomes (from week.md)
  - Tasks with completion status (from week.md — checked [x] vs unchecked [ ])
  - Daily progress entries (from week.md)
  - Quarter goals (from quarter.md)
  - Active project summaries (from each project README)
  - Scratchpad action items and parked items
  - Carried-over items from last week (if present in week.md)
  - Open commitments (from arete commitments list)
```

**Orchestrator**: Wait for both. Capture:
- List of unprocessed meeting file paths (from 1A)
- List of all week's meeting file paths (from 1A)
- Planning context + commitments (from 1B)

If no unprocessed meetings exist, skip Phase 2.

---

### Phase 2: Process Unprocessed Meetings (parallel subagents)

Same pattern as the **daily-winddown** skill — spawn one subagent per unprocessed meeting, max 4 concurrent. If more than 4 unprocessed meetings, batch into groups of 4.

**Before spawning**: Read `people/index.md` (or list `people/**/*.md`) to build a list of existing person slugs. Pass this list into each subagent prompt.

Use the **exact same per-meeting subagent prompt template** from the daily-winddown skill. Each subagent:
- **Runs**: `arete meeting process --file <path> --json` for AI extraction with confidence scores, people intelligence, entity resolution, and staged items
- **Writes**: meeting frontmatter (attendee_ids) + new person files (safe, no conflicts)
- **Returns**: diffs for existing person files, staged items (decisions/learnings with confidence), action items

See [daily-winddown](../daily-winddown/SKILL.md) Phase 2 for the full prompt template.

**Additionally**: For meetings that were ALREADY processed (have `attendee_ids`), the orchestrator still needs decisions/learnings and action items scanned. Spawn read-only subagents for these:

**Already-Processed Meeting Subagent** (`subagent_type: "generalPurpose"`, `readonly: true`):

```
PROMPT: |
  Scan an already-processed meeting for decisions, learnings, and action items.
  This meeting has already been processed for people and frontmatter — only
  extract candidates.

  MEETING FILE: {meeting_file_path}

  Read the full meeting file. Extract:

  ### MEETING SUMMARY
  - title, date, attendees (from frontmatter), key_themes

  ### DECISION CANDIDATES
  - **D#: <title>** — Context: "<quote>" — Confidence: high|medium|low
  (Or "None".)

  ### LEARNING CANDIDATES
  - **L#: <title>** — Context: "<quote>" — Confidence: high|medium|low
  (Or "None".)

  ### ACTION ITEMS
  - **Owner**: <name> — **Item**: <description> — **Source**: <meeting>
  (Or "None".)
```

Batch all meetings (unprocessed + already processed) into groups of 4 for subagent processing. Unprocessed meetings use the full template, already-processed use the lighter read-only template.

**Orchestrator**: Wait for all meeting subagents. Collect all outputs.

---

### Phase 3: Merge & Intelligence (orchestrator — sequential)

#### 3a. Merge Person File Diffs

Same as daily-winddown Phase 3a:

1. Group `EXISTING PEOPLE DIFFS` by slug across all subagent reports.
2. For each person: read current file, append role context additions, key notes, interaction log entries, working style.
3. **Verify**: Read back each modified file to confirm changes persisted. Retry once if missing; report failure if it persists.

#### 3b. Decisions and Learnings (user approval gate 1)

Combine ALL `DECISION CANDIDATES` and `LEARNING CANDIDATES` from every subagent (both unprocessed and already-processed meeting subagents). De-duplicate candidates that reference the same decision across meetings.

Present the **full week's** combined list for user review:

```markdown
## This Week's Decisions & Learnings for Review

### Decisions
- **D1: <title>** — Source: <meeting>, <date> — <context>
...

### Learnings
- **L1: <title>** — Source: <meeting>, <date> — <context>
...

For each: Approve / Edit / Skip
```

Write approved items to `.arete/memory/items/decisions.md` and `.arete/memory/items/learnings.md` using the exact format below.

**Approval gate 1**: Nothing writes to memory without user approval.

**CRITICAL — Memory write format**: Each approved item MUST be appended using this exact structure:

```markdown
## <Concise, specific title>
- **Date**: YYYY-MM-DD
- **Source**: <Meeting title> (<Key attendee names>)
- <1-3 sentence description with context, rationale, and implications>
```

**DO NOT** append raw bullet points without the `## Heading` + `Date` + `Source` structure. Every entry must have all three fields. One entry per decision or learning — do not combine multiple items under one heading.

#### 3c. Refresh Stakeholder Intelligence

For each unique attendee slug across all processed meetings this week:

```bash
arete people memory refresh --person <slug>
```

Runs AFTER all person file writes are verified (3a).

---

### Phase 4: Review & Reconcile (parallel + orchestrator)

Spawn subagents for independent analysis while the orchestrator handles task reconciliation.

**Subagent 4A — Thread Arcs** (`subagent_type: "shell"`):

```
PROMPT: |
  Build narrative thread arcs for the weekly review.

  THREADS TO TRACE:
  {orchestrator inserts: key threads identified from meeting summaries,
   decisions, and project names — e.g. "email templates", "Cover Whale",
   "onboarding", "calendar view", "workflow automation"}

  For each thread, run:
    arete search "<thread>" --timeline --days 7 --json

  For each thread, build a narrative arc:
  - Where it started at the beginning of the week
  - Key events during the week (meetings, decisions, learnings)
  - Where it stands now (momentum, next steps)

  RETURN a structured summary:
  ### Thread Arcs
  For each thread:
  - **<Thread Name>**
    - Start of week: <status>
    - Key events: <what happened>
    - End of week: <current status>
    - Momentum: accelerating | steady | stalled | new
```

**Subagent 4B — Context Health Check** (`subagent_type: "shell"`):

```
PROMPT: |
  Run a quick context health check for the weekly winddown.

  Run: arete context --for "weekly review" --inventory

  RETURN:
  - Files not updated in 2+ weeks (stale context)
  - Product primitives with no coverage
  - Suggested context files to refresh next week
  - Keep to 3-5 bullet points max
```

**Orchestrator — Commitments Reconciliation** (runs after 4A and 4B complete):

Reconcile completed tasks from `week.md` against open commitments, and surface new commitment candidates from meeting action items.

#### 4c-1. Auto-resolve completed commitments

From Phase 1B, identify tasks marked complete in `week.md` (checked `[x]` items).
From Phase 1B, get the list of open commitments.

**Step 1 — Resolve linked commitments (high confidence)**:

Scan completed tasks for explicit commitment links: `- [x] Task text <!-- c:XXXXXXXX -->`

For each linked task:
1. Extract the commitment ID (8-char prefix after `c:`)
2. Run: `arete commitments resolve XXXXXXXX`
3. Remove the `<!-- c:XXXXXXXX -->` comment from the line in `week.md`
4. Log: "✓ Auto-resolved: {task text}"

**Step 2 — Fuzzy-match unlinked tasks (needs confirmation)**:

For completed tasks WITHOUT `<!-- c:ID -->` links:
- Fuzzy-match against remaining open commitments (by description/owner)
- If match found with high confidence → flag for user confirmation (don't auto-resolve)
- If match uncertain → skip

Report:
```markdown
### Commitments Auto-Resolved (linked)
- <commitment description> — linked task "<task name>" ✓

### Needs Confirmation (fuzzy-matched)
- Task "<task name>" might match commitment "<commitment>" — resolve? (y/n)

### Unmatched Completed Tasks
- "<task name>" — no commitment link or match found
```

This two-step approach ensures linked tasks are resolved automatically, while unlinked tasks get a fallback prompt.

#### 4c-2. New commitment candidates (approval gate 2)

From Phase 2 meeting processing, collect all ACTION ITEMS.

De-dupe and categorize:
- **I owe someone**: Action items where user is the owner
- **Someone owes me**: Action items where another person is the owner

Present for approval:

```markdown
### New Commitment Candidates from Meetings

**I owe:**
- [ ] <description> — to <person> — from <meeting> — Create commitment? (y/n)

**Others owe me:**
- [ ] <description> — from <person> — from <meeting> — Create commitment? (y/n)
```

For approved items, create commitments. Update `now/scratchpad.md` with "waiting on others" items organized by person.

---

### Phase 5: Weekly Review (orchestrator — sequential)

Compile the weekly review using thread arcs (4A), commitments reconciliation (orchestrator), context health (4B), planning context (1B), and significance analysis.

#### 5a. Weekly Significance Analysis

Apply the `significance_analyst` expert pattern to assess what actually mattered this week.

**Assemble a context bundle** using the `context_bundle_assembly` pattern — **limited to two sections only**:

1. **Strategy & goals** — Run `arete search "<topic>"` where topic is derived from the week's focus areas (key themes from the week file's outcomes, thread arcs, and decisions, e.g. "API launch progress, customer onboarding, Q2 planning"). Take top 3 results, max 300 words each.
2. **Existing memory** — Run `arete search "<topic>" --scope memory`. Take top 5 results, max 200 words each.

If both sections return empty results, note: `⚠️ Sparse context — significance assessment based primarily on week content.`

**Apply `significance_analyst`** to the assembled bundle, thread arcs (4A), and the week's raw content (accomplishments, outcomes, decisions from Phase 3b).

- Ask: *"Given everything that happened this week and current goals/strategy, what was actually significant?"*
- Separate signal from noise — not everything that happened matters equally.
- Identify patterns: recurring themes, blocked areas, momentum shifts, surprising outcomes.
- Connect to strategy: how does this week advance or hinder quarter goals?
- For each significant item, **cite the specific goal or prior decision from the context bundle** that makes it significant. If you cannot cite bundle content, downgrade the item's ranking.

**Output — Weekly Intelligence section** (include in the review):

```markdown
### Weekly Intelligence

#### Most Significant Events
- [Event] — [WHY it matters, citing specific goal or decision from context]
- ...

#### Patterns Identified
- [Recurring theme / blocked area / momentum shift]
- ...

#### Strategic Connections
- [How this week advances or hinders quarter goals]
- ...
```

> **Sparse-context behavior**: If the context bundle is sparse, weight the week's raw content and thread arcs more heavily and note: "Limited context — significance based primarily on week content analysis."

#### 5b. Compile Review

Read `now/week.md` planned outcomes. For each, mark status:
- **Done** — Completed; note the outcome.
- **Partial** — Some progress; note what's left.
- **Carried** — Incomplete; carry to next week or drop.

Generate review:

```markdown
## End of Week Review — [date range]

### Wins
- <from completed outcomes, thread arcs, decisions made>

### Progress Against Quarter Goals
- <which quarter outcomes advanced and how>

### Key Decisions Made
- <from approved decisions in Phase 3b>

### Threads in Motion
| Thread | Arc | Momentum |
|--------|-----|----------|
| <name> | <start → events → current> | <accelerating|steady|stalled|new> |

### Commitments Resolved
- <commitments closed this week>

### Carried to Next Week
- <incomplete items with context>

### Blockers or Risks
- <anything stalled, at risk, or needing escalation>

### Weekly Intelligence
<from 5a significance analysis — most significant events, patterns, strategic connections>

### Context Health
- <3-5 bullets from subagent 4B>
```

#### 5c. Update Week File

Append the review section to `now/week.md`. Verify by reading back.

---

### Phase 6: Next Week (parallel subagents + orchestrator)

Spawn subagents for independent data gathering, then orchestrator runs the week-plan skill.

**Subagent 6A — Brief for Next Week** (`subagent_type: "shell"`):

```
PROMPT: |
  Assemble an intelligence briefing for next week's planning.

  Run: arete brief --for "next week priorities" --json

  RETURN the full briefing output:
  - Relevant context files
  - Recent memory (decisions, learnings)
  - Resolved entities
  - Entity relationships
  - Temporal signals
```

**Subagent 6B — Next Week's Calendar** (`subagent_type: "shell"`):

```
PROMPT: |
  Pull next week's calendar for planning.

  Run: arete pull calendar --days 7 --json

  RETURN:
  - List of next week's meetings: day, time, title, attendees
  - Flag meetings that likely need prep (1:1s, customer meetings, reviews, QBRs)
  - Note any scheduling conflicts
  - Note any heavy/light days
```

**Orchestrator**: Wait for both subagents. Then follow the **week-plan** skill workflow using the briefing (6A) and calendar (6B) as enriched context:

1. **Assess calendar bandwidth**: Count meetings for next week. Determine capacity:
   - Heavy week (many meetings, > ~6/day average): target **2–3 outcomes**
   - Standard week: target **3–5 outcomes**
   - Light week: target **4–5 outcomes**
   - Also note any OOO days that reduce the working week.

2. **Ask the user for their priorities**: Present the carried items, open commitments, and context — then explicitly ask:
   > "Before I draft the plan, what are your top priorities for next week? Given your calendar [summarize: X meetings, heavy/light days, OOO], I'd suggest aiming for [N] outcomes."
   Wait for the user's response before writing the plan.

3. **Build the plan** from the user's stated priorities:
   - Map each priority to existing commitments where relevant
   - Include carried items from this week's review
   - Present a draft plan for review before writing anything

4. **Approval gate 3 (plan review)**: Show the draft `now/week.md`. User approves, edits, or adjusts before anything is written.

5. **Write approved plan**:
   - Archive current `now/week.md` to `now/archive/week-YYYY-MM-DD.md`
   - Write new `now/week.md` (outcomes + tiered task lists: Must Complete / Should Complete / Complete If Time)

**Tiered task format** for `now/week.md`:

```markdown
## Tasks

### Must Complete
> Blocking or directly tied to week outcomes.
- [ ] <task> (due date if relevant) <!-- c:XXXXXXXX -->

### Should Complete  
> High value, not strictly blocking. Strong preference to finish.
- [ ] <task> <!-- c:XXXXXXXX -->

### Complete If Time
> Nice to have. Will carry with no consequence if skipped.
- [ ] <task>
```

**Commitment linking**: When adding tasks from commitments, include `<!-- c:ID -->` (first 8 chars of commitment ID) at the end of the task line. This enables auto-resolution when the task is completed in daily-winddown or the next weekly-winddown. Tasks not derived from commitments (e.g., user-added priorities) don't need links.

Reference the [week-plan](../week-plan/SKILL.md) skill for the full week.md template.

---

### Phase 7: Finalize (orchestrator)

#### 7a. Global Memory Refresh

```bash
arete memory refresh
```

Refreshes all L3 computed memory: area summaries (`.arete/memory/areas/`) and person memory highlights. Ensures next week's intelligence is current.

#### 7b. Re-index

```bash
arete index
```

Makes all content from this session searchable for next week.

#### 7c. Final Report

```markdown
## Weekly Winddown — [date range]

### Week in Review
- Wins: <count and highlights>
- Key decisions: <count> approved and saved
- Learnings: <count> approved and saved
- Threads: <count> tracked, momentum summary

### Meetings Processed
- Total this week: X meetings
- Newly processed in this session: Y
- Already processed (scanned for decisions/learnings): Z
- Subagents: X spawned, X succeeded, X failed

### Memory Refreshed
- Area memories updated: <count>
- People memories updated: <count>
- New person files: <list>
- Updated person files: <list with new interaction log entries>

### Commitments Reconciled
- Resolved: X | New created: Y | Carried: Z

### Context Health
- <3-5 bullets>

### Next Week
- Top outcomes: <from week-plan>
- Key meetings: <from calendar>
- Week file: now/week.md

### Notes
- <steps skipped, subagent failures, errors>
```

---

## Error Handling

- **Recording pull fails**: Subagent 1A reports failure. Orchestrator continues with existing meeting files. Noted in final report.
- **No unprocessed meetings**: Skip Phase 2 processing subagents. Still run read-only subagents on already-processed meetings for decisions/learnings scanning.
- **Meeting subagent fails**: Orchestrator notes the failure, processes remaining meetings. Reports which meetings were not processed.
- **Person file write conflict**: If two subagents both create a new person file for the same slug, orchestrator detects and merges.
- **Thread arc subagent fails**: Orchestrator builds the review without thread arcs, using meeting summaries and decisions instead.
- **Context health subagent fails**: Skip context health section. Note in final report.
- **`arete brief` fails**: Subagent 6A reports failure. Orchestrator proceeds with manual context (quarter.md, week.md, projects, scratchpad) already gathered in Phase 1B.
- **`arete index` fails**: Note failure but do not block final report.
- **Commitment resolution fails**: Note which commitments could not be resolved. User can manually resolve later.
- **Many unprocessed meetings (>8)**: Batch into groups of 4 for Phase 2. Log progress between batches.
- **Subagent returns malformed output**: Skip that subagent's data, note the issue, process what's available from other subagents.

## Notes

- **Relationship to existing skills**: This skill orchestrates and extends `week-review` and `week-plan`. It can be used instead of running them separately at week's end. The standalone skills remain available for mid-week use.
- **Approval gates**: Three approval points: (1) decisions/learnings in Phase 3b, (2) commitment creation in Phase 4, (3) next week's plan in Phase 6. Everything else runs automatically.
- **Idempotency**: Safe to re-run. Recording pulls skip already-saved files, process-meetings subagents skip files with `attendee_ids`, commitment resolution checks for duplicates, review section checks if already present.
- **Scope**: Covers the full current week (7 days). For single-day reconciliation, use the **daily-winddown** skill.
- **Friday ritual**: Best run Friday afternoon or end of last working day. Also works Monday morning to close the prior week.
- **week.md is source of truth**: `now/week.md` is the canonical weekly plan. Commitments track obligations (what you owe, what others owe you). Tasks live inline in week.md.
- **CLI extraction**: Phase 2 uses `arete meeting process` for AI-powered extraction with confidence scores, producing staged items compatible with `arete view` triage UI. Falls back to manual LLM extraction if the CLI command fails.
- **Commitments for tracking**: Commitments (`arete commitments`) track obligations. "Waiting on others" items also go to `now/scratchpad.md` for visibility.
- **Commitment linking**: Tasks from commitments include `<!-- c:ID -->` comments (8-char prefix). Phase 4c-1 auto-resolves linked tasks when marked complete. Phase 6 adds links when creating next week's plan from commitments. This closes the loop between task completion and commitment tracking.
- **Subagent limits**: Max 4 concurrent subagents. Phase 1 uses 2, Phase 2 batches at 4, Phase 4 uses 2, Phase 6 uses 2. All within limits.
- **Verification principle**: The orchestrator always reads back files after writing in Phase 3a. Subagents verify their own safe writes before returning.
- **Why hybrid writes**: Same as daily-winddown — subagents own conflict-free writes (frontmatter, new person files), return diffs for shared person files. Orchestrator merges once per person.
- **Shared subagent prompt**: Phase 2 uses the same per-meeting subagent prompt template as daily-winddown (which uses `arete meeting process`). See [daily-winddown](../daily-winddown/SKILL.md) Phase 2 for the full template.

## References

- **Daily winddown**: [daily-winddown](../daily-winddown/SKILL.md) — shares the per-meeting subagent prompt template
- **Fathom**: `arete pull fathom --days 7`
- **Process meetings**: [process-meetings](../process-meetings/SKILL.md)
- **Week plan**: [week-plan](../week-plan/SKILL.md)
- **Week review**: [week-review](../week-review/SKILL.md) (this skill supersedes week-review for end-of-week use)
- **Memory format**: See Phase 3b for required `## Heading` + `Date` + `Source` structure for decisions.md / learnings.md writes
- **CLI meeting processing**: `arete meeting process --file <path> --json` (AI extraction, people intelligence, entity resolution, staged items)
- **Commitments**: `arete commitments list`, `arete commitments resolve <id>`
- **Week file**: `now/week.md` (source of truth for weekly plan and tasks)
- **Quarter file**: `goals/quarter.md`
- **Scratchpad**: `now/scratchpad.md` (waiting on others, parked items)
- **Related skills**: daily-winddown, process-meetings, sync, week-plan, week-review, daily-plan
