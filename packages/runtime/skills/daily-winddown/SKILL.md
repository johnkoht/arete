---
name: daily-winddown
description: End-of-day reconciliation — pull recordings, process inbox, process meetings, triage action items, update weekly plan, and prime intelligence for tomorrow.
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

# Daily Winddown Skill

End-of-day reconciliation using **subagent orchestration** for reliability and parallelism. The orchestrator spawns focused subagents for independent work (recording pulls, per-meeting processing), then merges results, handles user approvals, and writes verified outputs.

## When to Use

- "Daily winddown"
- "End of day" / "Close the day"
- "Wind down"
- "What did I do today?"
- "Reconcile my day"
- "Daily review"
- "Process my inbox"
- "Triage my tasks"

## Architecture

```
ORCHESTRATOR (you)
│
├─ Phase 1: Gather ──────────────── orchestrator
│   ├─ 1a. Pull recordings
│   ├─ 1b. Read local state (week.md, goals/)
│   ├─ 1c. ⚠️ MERGE AGENDAS into meeting files (CRITICAL — do not skip)
│   ├─ 1d. Process inbox (triage captured items)
│   └─ 1e. Area association checkpoint (batch confirm areas for today's meetings)
│
├─ ✅ CHECKPOINT ────────────────── verify Phase 1 complete before proceeding
│
├─ Phase 2: Process Meetings ────── parallel subagents (1 per meeting, max 4)
│   ├─ Subagent: Meeting A ──┐
│   ├─ Subagent: Meeting B   ├──── each follows process-meetings skill (steps 1-4)
│   ├─ Subagent: Meeting C   │
│   └─ Subagent: Meeting D ──┘
│
├─ Phase 2.5: Optional Review UI ── orchestrator (opt-in, default: off)
│   ├─ Check useReviewUI config
│   ├─ If enabled + staged items: `arete view --path /review --wait`
│   ├─ On success: continue with approved items
│   └─ On timeout/error: fallback to CLI triage
│
├─ Phase 3: Review & Intelligence ── orchestrator (sequential)
│   ├─ User reviews in arete view (external)
│   ├─ Triage approved action items
│   ├─ Refresh stakeholder memory
│   ├─ Review agenda carryover
│   ├─ Track thread progress
│   └─ 3g. Slack digest (optional, opt-in)
│
└─ Phase 4: Update & Close ──────── orchestrator
    ├─ Update weekly plan (now/week.md)
    ├─ Pull tomorrow's calendar
    └─ Re-index, final report
```

## Workflow

### Phase 1: Gather

This phase runs in the orchestrator. Pull recordings, read local state, merge agendas, and process inbox.

#### 1a. Pull Recordings

Check `arete.yaml` for active recording integrations (under `integrations:`). Pull from whichever are configured:

```bash
# If krisp is configured:
arete pull krisp --days 1

# If fathom is configured:
arete pull fathom --days 1
```

Pull from **all** configured recording integrations (krisp, fathom, or both). If a pull fails or an integration is not configured, note the error and continue with the next integration.

Then list today's meeting files:

```bash
ls resources/meetings/YYYY-MM-DD-*.md
```

(Use today's actual date.)

Capture:
- List of today's meeting file paths
- Count of recordings pulled (across all integrations)

If all pulls fail or no recording integrations are configured, continue — meetings already in `resources/meetings/` can still be processed.

#### 1b. Read Local State

Read current goals and weekly plan from local files:

```bash
# Current week plan
cat now/week.md

# Quarter goals
cat goals/quarter.md
```

Capture:
- Current week outcomes and focus
- Active goals with status
- Tasks in progress (from week.md ## Tasks sections)

#### 1c. Merge Agendas into Meeting Files ⚠️ CRITICAL

> **DO NOT SKIP THIS STEP.** Agendas contain prep notes, questions, and context that must be preserved in the meeting record. If you skip this step, agenda content is lost and carryover items cannot be identified in Phase 3e.

First, check if any agendas exist for today (or the processing date):

```bash
ls now/agendas/YYYY-MM-DD-*.md
```

If agendas exist, you MUST merge them before proceeding to Phase 2.

For each meeting file from 1a, check for a matching agenda in `now/agendas/`:

```bash
ls now/agendas/YYYY-MM-DD-*.md
```

**Matching logic**: Fuzzy-match agenda filename to meeting filename by normalizing both (lowercase, remove common words like "intro", "weekly", "sync", compare attendee names). Examples:
- `now/agendas/2026-03-18-lindsay-1-1.md` → `resources/meetings/2026-03-18-john-lindsay-11.md` ✓
- `now/agendas/2026-03-18-intro-scott.md` → `resources/meetings/2026-03-18-intro-scott-john.md` ✓

**For each matched pair:**

1. Read the agenda file content
2. Read the meeting file content
3. Insert agenda content as `## Agenda / Notes` section immediately after the frontmatter (before any existing ## sections like Key Points or Transcript)
4. Write the combined content back to the meeting file
5. Delete the agenda file from `now/agendas/`
6. Log: "Merged agenda into meeting: {meeting_filename}"

**Agenda section format in meeting file:**
```markdown
## Agenda / Notes

<!-- Merged from now/agendas/{agenda_filename} -->

{original agenda content with frontmatter stripped}
```

**If no match found**: Leave the agenda file in `now/agendas/` (it may be for a future meeting or a meeting that didn't happen). Note unmatched agendas in the final report.

If no meeting files exist for today, skip Phase 2 and proceed to Phase 3.

#### 1d. Process Inbox

Triage items captured during the day into appropriate destinations.

##### 1d.1 Read Inbox

Read `now/week.md ## Inbox` section to get all captured items.

```bash
# Inbox items are plain text — no metadata required on capture
# Example inbox content:
# - Review Q1 metrics with Sarah
# - Schedule onboarding sync
# - Update API docs before launch
```

**If inbox is empty**: 
> "Inbox is empty — nothing to triage."
> 
> (Continue to Phase 1 checkpoint)

##### 1d.2 Analyze Each Item

For each inbox item, infer context and recommend a destination:

**Metadata Inference**:
- **@area()**: Match keywords to areas in `areas/` directory (e.g., "onboarding" → @area(product))
- **@project()**: Match to active projects in `projects/active/` (e.g., "API docs" → @project(api-v2))
- **@person()**: Resolve names via `arete resolve` (e.g., "Sarah" → @person(sarah-chen))
- **@due()**: Extract explicit dates or urgency cues (e.g., "before launch", "by Friday")

**Destination Inference**:
| Cues | Recommended Destination | Confidence |
|------|------------------------|------------|
| "urgent", "ASAP", "today", "critical", explicit near due date | Must | 0.9 |
| "this week", "important", "need to", "should" | Should | 0.85 |
| "when you can", "eventually", "nice to have" | Could | 0.8 |
| No urgency cues, general task | Anytime | 0.7 |
| "someday", "maybe", "backlog", "parking lot" | Someday | 0.85 |
| "owe", "promised", "committed", person mentioned | Create Commitment | 0.75 |

**Confidence Calculation**:
- Base confidence from destination match (see table above)
- +0.1 if area/project match is exact
- +0.05 if person resolves unambiguously
- -0.1 if multiple destinations could fit
- -0.15 if no metadata could be inferred

##### 1d.3 Present for Triage

Present each item with inference results for user decision.

**Standard presentation** (when confidence < 0.8):

```markdown
> **Quick capture**: Review Q1 metrics with Sarah
> → Inferred: @area(analytics) @project(q1-review) @person(sarah-chen)
> → Suggested: Should (important, not blocking)
> → Confidence: 0.82
>
> [1] Accept  [2] Edit  [3] Skip  [4] Create Commitment
```

##### 1d.4 Handle User Choice

**[1] Accept**: 
- Use **TaskService.addTask()** to move item to destination
- Add inferred metadata tags via TaskService metadata parameter
- Remove from inbox

**[2] Edit**:
- Prompt for destination override: "Where should this go? [Must/Should/Could/Anytime/Someday]"
- Prompt for metadata corrections: "Any metadata to change? (area, project, person, due)"
- Use **TaskService.moveTask()** with corrected destination

**[3] Skip**:
- Leave item in inbox for next triage
- Mark as skipped in this session (don't re-present)
- Item will appear again in next winddown

**[4] Create Commitment**:
- Prompt for direction: "Is this something you owe someone (i_owe_them) or they owe you (they_owe_me)?"
- Prompt for counterparty if not inferred
- Use **CommitmentsService.create()** with `createTask: true` for i_owe_them direction
  - This automatically creates a linked task in inbox with `@from(commitment:XXX)` metadata
- For they_owe_me: Creates commitment only (no linked task) — add to `## Waiting On` section
- Remove from inbox

**Task creation via services** (not direct file writes):

```typescript
// Move from inbox to destination
await taskService.moveTask(taskId, 'should');

// Add new task with metadata
await taskService.addTask(text, 'must', {
  area: 'product',
  project: 'onboarding',
  person: 'sarah-chen',
});

// Create commitment with linked task (i_owe_them)
await commitmentsService.create(
  'Send API specs to Sarah',
  'sarah-chen',
  'Sarah Chen',
  'i_owe_them',
  { createTask: true } // Creates linked task automatically
);

// Create commitment without task (they_owe_me)
await commitmentsService.create(
  'Sarah will send contract draft',
  'sarah-chen',
  'Sarah Chen',
  'they_owe_me',
  { createTask: false }
);
```

##### 1d.5 Batch Processing (Optional)

If inbox has >5 items, offer batch mode:

```markdown
> You have 12 inbox items. Process individually or batch?
>
> [1] One by one (full control)
> [2] Show all with recommendations (approve/skip each)
> [3] Auto-place high confidence, review low confidence
```

**Option 3** (recommended for efficiency):
- Auto-place items with confidence ≥ 0.8
- Present remaining items one by one
- Show summary at end: "Auto-placed 8 items. 4 items need your input."

---

#### 1e. Area Association (Checkpoint)

Before processing meetings, associate each meeting with a workspace area so that area context (current state, recent decisions) can be injected into extraction.

**Get suggestions**: Use `suggestAreaForMeeting()` from AreaParserService to get area suggestions for all today's meetings in a single pass:

```typescript
// Conceptual — agent uses available tools
const areas = await areaParser.listAreas(); // all area slugs
for (const meetingPath of todaysMeetings) {
  const meeting = parseMeetingFile(meetingPath);
  const suggestion = await areaParser.suggestAreaForMeeting({
    title: meeting.title,
    summary: meeting.summary,
    transcript: meeting.transcript,
  });
}
```

**Present as a single batch table** (⚠️ Pre-Mortem R3: one prompt, not N prompts for N meetings):

```
I've gathered {N} meetings for processing. Here are my area suggestions:

| Meeting Title | Date | Suggested Area | Confidence |
|--------------|------|----------------|------------|
| Weekly Sync  | 2026-04-01 | team-meetings | 1.0 |
| Acme Intro   | 2026-04-01 | — | — |
| Product Review | 2026-04-01 | product-dev | 0.8 |

Areas available: {comma-separated list of all area slugs}

Options:
1. **Confirm** — proceed with these associations
2. **Adjust** — specify different areas (format: "Meeting Title → area-slug")
3. **Skip** — process without area associations

Your choice?
```

**After confirmation**: Save confirmed areas to meeting frontmatter (`area: <slug>`) before dispatching Phase 2 processing subagents. Include the area in each subagent's prompt context.

**Edge cases**:
- **All suggestions null**: "No area suggestions available for today's meetings. Would you like to assign areas manually, or skip area association? Available areas: {list}"
- **User provides invalid area**: "'{area}' not found. Available areas: {list}. Please try again."
- **User provides custom area not in suggestions**: Valid — any area slug from the available list can be used, not just the suggested ones.
- **No meetings today**: Skip this step entirely (Phase 2 will also be skipped).

---

### ✅ Phase 1 Checkpoint — VERIFY BEFORE PROCEEDING

**STOP. Before starting Phase 2, verify all Phase 1 steps completed:**

```bash
# 1. Confirm recordings were pulled (or attempted)
ls resources/meetings/YYYY-MM-DD-*.md

# 2. Confirm agendas were checked
ls now/agendas/YYYY-MM-DD-*.md

# 3. Confirm merges completed (if agendas existed)
# Each merged meeting should have "## Agenda / Notes" section
grep -l "## Agenda" resources/meetings/YYYY-MM-DD-*.md

# 4. Confirm inbox was processed (or empty)
# Check ## Inbox section in week.md

# 5. Confirm area associations were offered (or no meetings)
# Meetings with confirmed areas should have area: in frontmatter
grep -l "^area:" resources/meetings/YYYY-MM-DD-*.md
```

**Checklist:**
- [ ] 1a. Recordings pulled (or error noted)
- [ ] 1b. Local state read (week.md, goals/)
- [ ] 1c. Agendas merged into meeting files (or confirmed none exist for today)
- [ ] 1d. Inbox processed (or confirmed empty)
- [ ] 1e. Area associations confirmed (or skipped, or no meetings)

**If agendas exist but weren't merged**: GO BACK and complete step 1c now.

Only proceed to Phase 2 after all checkboxes are confirmed.

---

### Phase 2: Process Meetings (parallel subagents)

For each meeting file from Phase 1, spawn a subagent that follows the **process-meetings** skill (steps 1-4 only — stage items, don't approve).

Max 4 concurrent subagents. If more than 4 meetings, batch into groups of 4.

**Before spawning**: Read `people/index.md` (or list `people/**/*.md`) to build a list of existing person slugs. Pass this list into each subagent prompt.

**Per-Meeting Subagent Prompt:**

```
PROMPT: |
  Process a single meeting file following the process-meetings skill (steps 1-4 only).

  MEETING FILE: {meeting_file_path}
  EXISTING PERSON SLUGS: {comma-separated list}

  ## Instructions

  Follow the process-meetings skill workflow, steps 1-4:

  ### Step 1: Build Context
  Run: arete meeting context {meeting_file_path} --json > /tmp/context.json

  ### Step 2: Map to Area (if applicable)
  The context command handles area mapping. Check the output for area association.

  ### Step 3: Extract & Stage Intelligence
  Run: arete meeting extract {meeting_file_path} --context /tmp/context.json --stage --reconcile --skip-qmd --json

  This writes staged sections (## Staged Action Items, ## Staged Decisions, ## Staged Learnings)
  with full metadata (confidence scores, dedup source, owner attribution, reconciliation annotations)
  directly to the meeting file. The --reconcile flag enables cross-meeting dedup and batch LLM review.

  **STOP HERE** — Do not run approval or person refresh. The user will review in arete view.

  ## Output

  Read the processed meeting file and return:

  ### MEETING SUMMARY
  - file: {meeting_file_path}
  - title: <from frontmatter or first heading>
  - date: <YYYY-MM-DD>
  - attendees: <comma-separated names>
  - area: <area slug if mapped, or "none">
  - status: processed | failed

  ### STAGED ITEMS
  Count of staged items:
  - Action items: <count>
  - Decisions: <count>
  - Learnings: <count>

  ### UNKNOWN ATTENDEES
  List any attendees from the context output that aren't in EXISTING PERSON SLUGS:
  - name: <name>
  - email: <email if available>

  ### AGENDA CARRYOVER
  If the meeting has a ## Agenda / Notes section, identify unaddressed items:
  - item: <text>
  - type: question | ask | next_step | topic
  - recommendation: carryover | skip

  (Or "No agenda section" if none exists.)

  ### ERRORS
  Any errors encountered during processing.
```

**Orchestrator**: Wait for all meeting subagents to complete. Collect all outputs.

---

### Phase 2.5: Optional Review UI

> **OPT-IN FEATURE**: Review UI is disabled by default. Users who prefer the traditional CLI triage workflow are unaffected. Enable only when you want the visual review experience.

**Configuration**: Check if `useReviewUI` is enabled in skill config or via agent flag.
- Default: **false** (CLI triage is the default path)
- Enable: Pass `--review-ui` flag when invoking skill, or set `skills.daily-winddown.useReviewUI: true` in `arete.yaml`

**If no staged items exist**:
> "No staged items to review — proceeding to triage."
>
> (Skip directly to Phase 3)

**If useReviewUI is false OR config not set**:
> "Using CLI triage (default). To use the visual review UI, pass `--review-ui` or set `useReviewUI: true` in config."
>
> (Skip directly to Phase 3)

**If staged items exist AND useReviewUI is true**:

#### 2.5.1 Invoke Review UI with Wait

```bash
arete view --path /review --wait --timeout 300 --json
```

This command:
- Opens the review UI in the browser at `/review`
- Blocks until the user completes review or timeout (5 minutes)
- Returns JSON output with the result

#### 2.5.2 Handle Completion Results

**On successful completion** (JSON output with `approved`/`skipped` arrays):

Parse the result:
```json
{
  "approved": [{ "id": "abc123", "type": "decision" }, ...],
  "skipped": [{ "id": "def456", "type": "learning" }, ...]
}
```

Actions:
- Log: "Review complete: {N} approved, {M} skipped"
- Approved items will be committed to memory in Phase 3b
- Skipped items remain in staged sections for next run
- Continue to Phase 3 with approved items pre-selected

#### 2.5.3 Handle Timeout

**On timeout** (JSON output `{ "timedOut": true }`):

```markdown
> Review UI timed out after 5 minutes.
>
> Staged items remain in meeting files for next run.
>
> Continue with CLI triage? [Y/n]
```

User choices:
- **Yes** → Proceed to Phase 3 with standard CLI triage
- **No** → Exit gracefully with note: "Staged items remain for next winddown run."

#### 2.5.4 Handle Errors

**On error** (command fails or non-zero exit):

```markdown
> Review UI unavailable: {error message}
>
> Falling back to CLI triage...
```

Auto-fallback to Phase 3 (CLI triage). Do not prompt — maintain flow.

---

### Phase 3: Review & Intelligence (orchestrator — sequential)

This phase runs in the orchestrator context. It handles user interaction, writes, and verification.

#### 3a. Prompt User to Review in UI

If any meetings were processed with staged items, prompt the user:

```markdown
## Meetings Ready for Review

I've processed {N} meetings and staged items for review:

| Meeting | Action Items | Decisions | Learnings |
|---------|-------------|-----------|-----------|
| {title} | {count}     | {count}   | {count}   |

**Next step**: Review and approve items in the web UI:

```bash
arete view
```

Let me know when you're done reviewing, and I'll help you triage the approved items.
```

Wait for user confirmation before proceeding to 3b.

#### 3b. Triage Approved Action Items

After user confirms they've reviewed in the UI, gather approved action items:

```bash
arete commitments list --json
```

Also read processed meeting files to collect any approved items:

```bash
# Check each processed meeting for ## Approved Action Items section
```

Present items for triage with recommendations based on:
- Due date proximity (this week vs later)
- Source meeting recency
- Related goals/outcomes from week.md

```markdown
## Action Items for Triage

### Recommend: Add to Week
- [ ] Send Cover Whale API spec to Anthony — Source: Anthony 1:1
- [ ] Review transformer docs before Friday — Source: CW Sync

### Recommend: Not This Week
1. Get Jamie spreadsheet — Source: Jamie 1:1
2. Send Lindsay PRD — Source: Lindsay 1:1
3. Write up POP retrospective — Source: Standup

### Waiting On Others
- Lindsay: Confirm rollback procedure — Source: Lindsay 1:1
- Anthony: Send API credentials — Source: Anthony 1:1

---
Confirm recommendations, or adjust (e.g., "add 1 to must complete, punt 2")
```

**On user confirmation:**

1. **"Add to Week" items** → Use **TaskService.addTask()** to add to `now/week.md` under appropriate section:
   - High priority / urgent → `must` destination
   - Important but flexible → `should` destination
   - Nice to have → `could` destination
   - TaskService automatically handles metadata and commitment linking via `@from(commitment:XXX)` tags

2. **"Not This Week" items** → Remain in commitments, will surface in future daily plans

3. **"Waiting On Others" items** → Create via **CommitmentsService.create()** with `they_owe_me` direction, then add to `now/scratchpad.md` under a `## Waiting On` section

#### 3c. Refresh Stakeholder Memory

For each unique attendee across all processed meetings:

```bash
arete people memory refresh --person <slug>
```

This updates person files with enriched intelligence (stances, open items, relationship health).

#### 3d. Handle Unknown Attendees

If any subagents reported unknown attendees, offer to add them:

```markdown
I found {N} attendees that aren't tracked yet:

1. Jane Doe (jane.doe@external.com)
2. Bob Smith (bob@vendor.co)

Would you like me to add any of them? Categories:
- people/customers/ — customer contacts
- people/users/ — user community members
- people/internal/ — team members

Tell me which category for each, or "skip" to ignore.
```

#### 3e. Agenda Carryover Review

Combine all `AGENDA CARRYOVER` sections from Phase 2 subagent reports.

Present carryover candidates grouped by meeting:

```markdown
## Agenda Carryover Review

### From: John/Lindsay 1:1
- [ ] "Ask: Rollback procedure — who has authority?" — **question** → carryover
- [ ] "Schedule Nick workflow automation intro" — **next_step** → carryover

### From: Anthony Sync
- [ ] "Confirm signature standardization" — **ask** → carryover

For each: **Add to scratchpad** | **Skip**
```

On user selection:
- "Add to scratchpad" → Append to `now/scratchpad.md` under `## Carryover from {date}` or organized by person/topic
- "Skip" → No action (item remains visible in meeting file's Agenda section)

#### 3f. Thread Progress

Identify key threads from today's meetings, decisions, and tasks.

For each thread:

```bash
arete search "<thread>" --timeline --days 1 --json
```

Build:

```markdown
### Threads That Moved Today
| Thread | What Happened | Net Status |
|--------|--------------|------------|
| <name> | <event>      | <status>   |
```

#### 3g. Slack Digest (Optional — opt-in)

> **OPT-IN FEATURE**: Slack digest is disabled by default. Users need Slack MCP integration connected (via Claude Desktop or Claude Code) and must explicitly enable this phase.

**Configuration**: Check if `slackDigest` is enabled in skill config.
- Default: **false** (Slack digest phase is skipped)
- Enable: Pass `--slack` flag when invoking skill, or set `skills.daily-winddown.slackDigest: true` in `arete.yaml`
- Requires: Slack MCP integration connected

**If slackDigest is false OR config not set**:
> (Skip silently — proceed to Phase 4.)

**If slackDigest is true**:

Run the [slack-digest](../slack-digest/SKILL.md) workflow with `today`:

1. Execute slack-digest Phases 1-4 (full interactive review in chat)
2. All meeting decisions, learnings, and commitments are already committed at this point — slack-digest's reconciliation reads the current state and only surfaces what's genuinely new from Slack
3. Approved items are written to memory, commitments, and week.md immediately

**Why this position**: Meetings are the primary intelligence source. Slack catches what meetings missed — follow-ups, async decisions, side conversations. Running slack-digest after meeting processing means its reconciliation sees all meeting output and avoids duplicates.

**Error handling**: If slack-digest fails or Slack MCP is unavailable, log the error and continue to Phase 4. Do not block the winddown flow.

---

### Phase 4: Update & Close

#### 4a. Update Weekly Plan

Read `now/week.md` and update with today's progress:

0. **Clear stale `@due` tags** from previous day's incomplete items:

   Before updating anything else, scan Must/Should/Could sections for `@due(YYYY-MM-DD)` tags where the date is **before today**. For each incomplete task (`- [ ]`) with a stale `@due` tag, remove the `@due(...)` portion from the line.

   **Why**: The daily-plan skill tags focus tasks with `@due(today's date)`. If those tasks aren't completed by end of day, the stale `@due` tag would cause them to show as "overdue" in the Today view indefinitely. Clearing stale tags lets the next daily-plan session re-select and re-tag as appropriate.

   **Rules**:
   - Only clear `@due` from **incomplete** tasks (`- [ ]`). Completed tasks (`- [x]`) keep their `@due` tag as historical metadata.
   - Only clear `@due` tags with dates **before today**. Today's `@due` tags are still active.
   - Preserve all other metadata tags (`@area`, `@project`, `@person`, `@from`).

   **Example**:
   ```markdown
   ### Must complete
   - [ ] Send API docs to Sarah @area(product) @person(sarah-chen) @due(2026-04-01)
   ```
   Becomes (if today is 2026-04-02):
   ```markdown
   ### Must complete
   - [ ] Send API docs to Sarah @area(product) @person(sarah-chen)
   ```

1. **Update `## Today` section** with actual focus and outcomes

2. **Add entry to `## Daily Progress`** (matching daily-plan format):

```markdown
### {Day} {Date}
**Focus**: {1-2 sentence summary of what you focused on}
**Meetings**: {comma-separated list of meeting titles}
**Progress**:
- {brief outcome notes — what moved forward, what was decided}
```

**Important**: Do NOT include:
- Action item lists (those go in `## Tasks` section)
- Full decision/learning details (those go in `.arete/memory/`)
- Verbose breakdowns (keep it scannable)

**Example**:
```markdown
### Wed Mar 25
**Focus**: Shadow sessions and email KPI strategy with Lindsay.
**Meetings**: Lindsay 1:1, Shadow: Austin Childers, Shadow: Nestor Arias, Paragon Claims Call, Tech Demos, Arc Meeting
**Progress**:
- Completed 2 adjuster shadows — rich workflow insights on templates and workarounds
- Defined email KPI tracking strategy (cycle time, escalation feedback)
- Claude task force scheduled for April
```

3. **Update task checkboxes** — Mark any completed tasks as done (`- [x]`)

4. **Auto-resolve linked commitments** — Use **TaskService.completeTask()** for completed tasks:

   **Detection**: Scan `now/week.md` for completed tasks

   **For each completed task**:
   1. Call `TaskService.completeTask(taskId)`
   2. TaskService automatically checks for `@from(commitment:XXX)` metadata
   3. If linked commitment exists, TaskService calls `CommitmentsService.resolve()` internally
   4. Log: "✓ Completed task: {text}" (and "✓ Resolved commitment" if linked)

   **No manual link handling needed** — TaskService manages `@from()` metadata and auto-resolution.

5. **Resolve unlinked completed tasks** (fallback) — For completed tasks WITHOUT `@from(commitment:XXX)`:

   **Use CommitmentsService.reconcile()** to fuzzy-match against open commitments:

   ```typescript
   const candidates = await commitmentsService.reconcile([
     { text: 'Review transformer docs', source: 'week.md' },
     { text: 'Clean up Jira backlog', source: 'week.md' },
   ]);
   
   // Returns matches sorted by confidence (Jaccard ≥ 0.6)
   // candidates[0].confidence = 0.85
   // candidates[0].commitment = { id: 'd382c0d6...', text: '...' }
   ```

   **For high-confidence matches (≥ 0.8)**: Auto-resolve and log
   **For medium-confidence (0.6-0.8)**: Present for user confirmation
   **For no match (<0.6)**: Skip

Verify the edit by reading back `now/week.md`.

#### 4b. Tomorrow Preview

Pull tomorrow's calendar:

```bash
arete pull calendar --days 1
```

Parse and summarize:
- Tomorrow's meetings: time, title, attendees
- Flag meetings that need prep (1:1s, customer meetings, reviews)
- Note any scheduling conflicts

#### 4c. Re-index and Report

Run `arete index` to re-index the workspace.

Compile the final report:

```markdown
## Daily Winddown — YYYY-MM-DD

### Meetings Processed
- {N} meetings: {titles}
- Recordings pulled: {count}

### Inbox Triaged
- Items placed: {count}
- Items skipped: {count}
- Commitments created: {count}

### People Updated
- New: {list of new person files}
- Refreshed: {count}

### Decisions & Learnings
- {N} decisions approved
- {N} learnings captured

### Tasks Triaged
- Added to week: {count}
- Kept in commitments: {count}
- Waiting on others: {count}

### Threads That Moved
| Thread | What Happened | Net Status |
|--------|--------------|------------|

### Agendas
- Merged: {count}
- Unmatched: {count}
- Carryover items: {count} added to scratchpad

### Tomorrow Preview
- Key meetings: {titles and times}
- Suggested focus: {based on week priorities and open threads}

### Slack Digest
- Status: {processed | skipped | disabled}
- Conversations: {count}
- Items extracted: {count}
- Commitments resolved: {count}
- Commitments added: {count}

### Notes
- {any errors, skipped steps, or issues}
```

---

## Task Destinations Reference

| Destination | File | Section | When to Use |
|-------------|------|---------|-------------|
| inbox | week.md | `## Inbox` | Captured items awaiting triage |
| must | week.md | `### Must complete` | Critical this week, blocking others |
| should | week.md | `### Should complete` | Important, not blocking |
| could | week.md | `### Could complete` | Nice to have this week |
| anytime | tasks.md | `## Anytime` | No specific timeline, do when available |
| someday | tasks.md | `## Someday` | Backlog, maybe later |

## Confidence Thresholds

| Confidence | Behavior |
|------------|----------|
| ≥ 0.8 | Auto-place in batch mode |
| 0.6 - 0.8 | Present with strong recommendation |
| 0.4 - 0.6 | Present with weak recommendation |
| < 0.4 | Present without recommendation, ask user |

## Skippable Triage (Harvester Requirement)

The skip option is critical for maintaining flow:

- **Never force a decision** — user can skip any item
- **Skipped items persist** — they stay in inbox for next triage
- **No guilt** — skipping is a valid choice, not a failure
- **Session tracking** — skipped items don't re-appear in same session

## Error Handling

- **Recording pull fails**: Note the error and continue — meetings already in `resources/meetings/` can still be processed.
- **No meetings today**: Skip Phase 2, proceed to Phase 3 (task triage with existing commitments).
- **Meeting subagent fails**: Note the failed meeting, process the rest. Report which meetings were not processed.
- **arete view not used**: If user skips UI review, triage can still work with staged items directly from meeting files.
- **Review UI fails or times out**: Auto-fallback to CLI triage (Phase 2.5.3/2.5.4). Never block the winddown flow.
- **Slack MCP unavailable**: Log "Slack digest skipped — MCP not connected" and continue to Phase 4. Never block the winddown flow.
- **`arete index` fails**: Note the failure but do not block the final report.
- **Subagent returns malformed output**: Skip that subagent's data and note the issue. Process what's available from other subagents.
- **Agenda merge fails for single file**: Log the error and continue. Agenda file remains in `now/agendas/`.
- **Phase 1c skipped entirely**: STOP. Do not proceed to Phase 2 until you go back and complete step 1c. Check `ls now/agendas/YYYY-MM-DD-*.md` — if files exist, merge them before processing meetings.
- **No inbox section**: Create it, note "Inbox section created"
- **Entity resolution fails**: Present item without metadata, note "Couldn't infer context"
- **TaskService.addTask() fails**: Retry once, then report error and skip item

## Notes

- **Review UI is opt-in**: The visual review UI (Phase 2.5) is disabled by default. Set `skills.daily-winddown.useReviewUI: true` in `arete.yaml` or pass `--review-ui` flag to enable. This preserves the traditional CLI triage workflow for users who prefer it (Harvester requirement: don't force new UX on users).
- **Slack digest is opt-in**: The Slack digest phase (3g) is disabled by default. Set `skills.daily-winddown.slackDigest: true` in `arete.yaml` or pass `--slack` flag to enable. Requires Slack MCP integration connected via Claude Desktop or Claude Code. Runs after all meeting processing is complete so its reconciliation naturally deduplicates against meeting output.
- **Approval flow**: User reviews and approves items in `arete view` (web UI) if Review UI is enabled, or via CLI triage (Phase 3a) if disabled. The agent then helps triage approved items into the week plan vs commitments for later.
- **Local-first**: All state is in local markdown files (`now/week.md`, `goals/quarter.md`, `people/`, `.arete/memory/`). No external integrations required for core workflow.
- **Commitments as backlog**: Items marked "Not This Week" stay in `.arete/commitments.json` and surface in future daily plans. Nothing falls through the cracks.
- **Commitment auto-resolution**: TaskService.completeTask() auto-resolves linked commitments via `@from(commitment:XXX)` metadata. No manual link handling needed.
- **Process-meetings delegation**: Phase 2 follows the process-meetings skill (steps 1-4) for consistency. See that skill for details on context building, area mapping, and extraction.
- **Idempotency**: Safe to run multiple times. Recording pull skips already-saved files, processed meetings are marked with `status: processed`, triage can be re-run. Commitment resolution is also idempotent — already-resolved commitments are skipped with a warning.
- **Subagent limits**: Max 4 concurrent subagents in Phase 2. If more than 4 meetings, batch into groups of 4.

## References

- **Recordings**: `arete pull krisp --days 1` / `arete pull fathom --days 1` (whichever integrations are active in `arete.yaml`)
- **Process-meetings skill**: [process-meetings](../process-meetings/SKILL.md) — Phase 2 delegates to steps 1-4
- **CLI commands**:
  - `arete meeting context <file> --json` — build context bundle
  - `arete meeting extract <file> --context - --stage --reconcile --json` — extract and stage intelligence with dedup
  - `arete commitments list --json` — list open commitments
  - `arete people memory refresh --person <slug>` — refresh person highlights
  - `arete search "<query>" --timeline` — thread progress
- **Services**:
  - `TaskService.addTask(text, destination, metadata)` — add task with metadata
  - `TaskService.moveTask(taskId, destination)` — move task between destinations
  - `TaskService.completeTask(taskId)` — mark complete + auto-resolve linked commitment
  - `CommitmentsService.create(text, personSlug, personName, direction, options)` — create commitment with optional linked task
  - `CommitmentsService.reconcile(completedItems)` — fuzzy-match completed tasks to commitments
- **Local files**:
  - `now/week.md` — weekly plan with inbox, tasks, and daily progress
  - `now/tasks.md` — anytime/someday task backlog
  - `now/scratchpad.md` — carryover items and waiting-on-others
  - `now/agendas/` — prepared agendas (merged into meetings, then deleted)
  - `goals/quarter.md` — quarter goals
  - `resources/meetings/` — meeting files
  - `.arete/memory/items/` — decisions and learnings
  - `.arete/commitments.json` — tracked commitments
- **Web UI**: `arete view` — review and approve staged items
- **Review UI with wait**: `arete view --path /review --wait --timeout 300 --json` — blocks until user completes review (Phase 2.5)
- **Related skills**: process-meetings, daily-plan, week-plan, week-review, weekly-winddown, prepare-meeting-agenda, [slack-digest](../slack-digest/SKILL.md)
