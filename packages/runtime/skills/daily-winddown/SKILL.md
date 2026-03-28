---
name: daily-winddown
description: End-of-day routine: process inbox, capture notes, review commitments. Use when the user wants to wind down the day or process their inbox.
triggers:
  - daily winddown
  - end my day
  - close out the day
  - process inbox
  - triage inbox
primitives:
  - Problem
  - Solution
work_type: planning
category: essential
intelligence:
  - context_injection
  - entity_resolution
  - memory_retrieval
---

# Daily Winddown Skill

End-of-day routine for processing the inbox, capturing notes, and reviewing commitments. This skill is the counterpart to daily-plan — run at end of day to close out and prepare for tomorrow.

> **Note**: This is a stub skill focused on inbox processing. Task 11 will pull the full daily-winddown skill from arete-reserv and integrate this inbox processing logic.

## When to Use

- "End my day"
- "Daily winddown"
- "Close out the day"
- "Process my inbox"
- "Triage my tasks"

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoTriage` | boolean | `false` | Auto-place high-confidence items without confirmation |
| `confidenceThreshold` | number | `0.8` | Minimum confidence for auto-placement (0.0-1.0) |

## Workflow

### Phase 1: Process Inbox

Triage items captured during the day into appropriate destinations.

#### 1.1 Read Inbox

Read `now/week.md ## Inbox` section to get all captured items.

```bash
# Inbox items are plain text — no metadata required on capture
# Example inbox content:
# - Review Q1 metrics with Sarah
# - Schedule onboarding sync
# - Update API docs before launch
```

**If inbox is empty**: 
> "Inbox is empty — nothing to triage. Let's move to the next phase."
> 
> (Skip to Phase 2)

#### 1.2 Analyze Each Item

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

#### 1.3 Present for Triage

Present each item with inference results for user decision.

**Standard presentation** (when confidence < threshold or autoTriage disabled):

```markdown
> **Quick capture**: Review Q1 metrics with Sarah
> → Inferred: @area(analytics) @project(q1-review) @person(sarah-chen)
> → Suggested: Should (important, not blocking)
> → Confidence: 0.82
>
> [1] Accept  [2] Edit  [3] Skip  [4] Create Commitment
```

**Auto-placement** (when confidence ≥ threshold AND autoTriage enabled):

```markdown
> ✓ Auto-placed: "Review Q1 metrics with Sarah" → Should
>   @area(analytics) @person(sarah-chen)
```

Show auto-placements in a batch summary, not interrupting the flow.

#### 1.4 Handle User Choice

**[1] Accept**: 
- Move item from `## Inbox` to target section in `week.md` or `tasks.md`
- Add inferred metadata tags
- Remove from inbox

**[2] Edit**:
- Prompt for destination override: "Where should this go? [Must/Should/Could/Anytime/Someday]"
- Prompt for metadata corrections: "Any metadata to change? (area, project, person, due)"
- Apply edits and move

**[3] Skip**:
- Leave item in inbox for next triage
- Mark as skipped in this session (don't re-present)
- Item will appear again in next winddown

**[4] Create Commitment**:
- Prompt for direction: "Is this something you owe someone (i_owe_them) or they owe you (they_owe_me)?"
- Prompt for counterparty if not inferred
- Call CommitmentsService.create() with appropriate direction
- If `i_owe_them`: Creates commitment + linked task (via Task 4 flow)
- If `they_owe_me`: Creates commitment + adds to `## Waiting On` section
- Remove from inbox

#### 1.5 Batch Processing (Optional)

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

### Phase 2: Quick Notes Capture

> **Note**: This phase will be expanded in Task 11 when pulling the full daily-winddown skill.

Prompt for any quick notes to capture:

```markdown
> Any notes to capture before closing out? (Enter to skip)
```

If provided, append to `now/week.md ## Notes` section with timestamp.

### Phase 3: Review Open Commitments

> **Note**: This phase will be expanded in Task 11 when pulling the full daily-winddown skill.

Quick check on commitment health:

```bash
arete commitments list --json
```

Surface any stale commitments (>7 days old):

```markdown
> **Stale commitments** (consider following up):
> - Send API specs to Sarah (9 days) @person(sarah-chen)
> - Review contract draft (12 days) @person(jamie)
>
> [1] Mark one as done  [2] Snooze for later  [3] Continue
```

### Phase 4: Close Out

Summarize the winddown:

```markdown
> **Winddown complete**
>
> **Inbox triaged**: 8 items placed, 2 skipped, 2 commitments created
> **Notes captured**: 1 note added
> **Commitments reviewed**: 2 stale items flagged
>
> Ready for tomorrow. Run `daily-plan` in the morning to start fresh.
```

## Task Destinations Reference

| Destination | File | Section | When to Use |
|-------------|------|---------|-------------|
| Must | week.md | `### Must complete` | Critical this week, blocking others |
| Should | week.md | `### Should complete` | Important, not blocking |
| Could | week.md | `### Could complete` | Nice to have this week |
| Anytime | tasks.md | `## Anytime` | No specific timeline, do when available |
| Someday | tasks.md | `## Someday` | Backlog, maybe later |
| Waiting On | week.md | `## Waiting On` | What others owe you (they_owe_me) |

## File Operations

All file operations use TaskService (not direct file writes):

```typescript
// Move from inbox to destination
await taskService.moveTask(taskId, 'should');

// Add new task with metadata
await taskService.addTask(text, 'must', {
  area: 'product',
  project: 'onboarding',
  person: 'sarah-chen',
});

// Create commitment with linked task
await commitmentsService.create({
  text: 'Send API specs to Sarah',
  personSlug: 'sarah-chen',
  direction: 'i_owe_them',
  createTask: true, // Creates linked task automatically
});
```

## Skippable Triage (Harvester Requirement)

The skip option is critical for maintaining flow:

- **Never force a decision** — user can skip any item
- **Skipped items persist** — they stay in inbox for next triage
- **No guilt** — skipping is a valid choice, not a failure
- **Session tracking** — skipped items don't re-appear in same session

This supports the Harvester persona who needs unobtrusive capture without constant interruptions.

## Confidence Thresholds

| Confidence | Behavior |
|------------|----------|
| ≥ 0.8 | Auto-place if `autoTriage` enabled |
| 0.6 - 0.8 | Present with strong recommendation |
| 0.4 - 0.6 | Present with weak recommendation |
| < 0.4 | Present without recommendation, ask user |

## Error Handling

- **No inbox section**: Create it, note "Inbox section created"
- **Entity resolution fails**: Present item without metadata, note "Couldn't infer context"
- **File write fails**: Retry once, then report error and skip item
- **Empty workspace**: Suggest running `week-plan` first

## References

- **Inbox source**: `now/week.md ## Inbox`
- **Week tasks**: `now/week.md ## Tasks` (Must/Should/Could)
- **Task backlog**: `now/tasks.md` (Anytime/Someday)
- **Commitments**: `.arete/commitments.json` via CommitmentsService
- **Entity resolution**: `arete resolve` command
- **Task operations**: TaskService (packages/core/src/services/tasks.ts)

## Future Enhancements (Task 11)

When the full daily-winddown skill is pulled from arete-reserv:
- Meeting recording processing (Fathom, Krisp integration)
- More comprehensive notes capture
- Tomorrow preview
- Integration with review UI (Task 17)
