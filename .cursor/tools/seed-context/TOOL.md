---
name: seed-context
description: Bootstrap workspace context by importing historical data from connected integrations
lifecycle: one-time
duration: Single session (minutes to hours depending on data volume)
---

# Seed Context Tool

A tool for bootstrapping your Areté workspace with historical data from external integrations. Use this when you want to backfill meetings, notes, or other context from a specific time period—perfect for getting started or catching up after time away.

> **Why Seed?**: Starting with a populated workspace dramatically improves the agent's ability to provide relevant context, identify patterns, and make connections across your work.

## When to Use

- "Seed my context from Fathom"
- "Import my meetings from the last 2 months"
- "Backfill my meeting history"
- "Bootstrap my workspace with historical data"
- "I want to import my past recordings"

## When NOT to Use

- Syncing recent/new data → Use `sync` skill instead
- Daily/weekly sync → Configure integration for scheduled sync
- Single item import → Use `sync` skill

## Review Model

Seed operations use **queue-based review**—extracted decisions and learnings are saved to `memory/pending-review.md` for later processing. This is appropriate for bulk imports where inline review would be overwhelming.

| Sync Type | Review Approach |
|-----------|-----------------|
| **Focused** (sync skill) | Inline - propose and confirm immediately |
| **Bulk** (this tool) | Queue - save to pending review for later |

After seeding, process the queue by saying "review pending items" or during weekly planning.

## Scope Options

### Quick Seed (30 days)
Fast bootstrap with recent context.

- Last 30 days of data
- ~15-50 items typically
- Completes in minutes
- Good for: Getting started quickly, recent context only

### Standard Seed (60 days)
Balanced coverage with reasonable volume.

- Last 60 days of data
- ~30-100 items typically
- Completes in 5-15 minutes
- Good for: Most users, solid context foundation

### Deep Seed (90+ days)
Comprehensive historical context.

- Custom date range up to integration limits
- 50-200+ items possible
- May take 15-30+ minutes
- Good for: New workspace setup, comprehensive context

---

## Workflow

### 1. Activation

When user requests seeding:

1. **Check available integrations**
   - Read `.cursor/integrations/registry.md`
   - Identify integrations with `seed: true` capability
   - Note which are Active vs need setup

2. **Confirm integration selection**
   - If single integration mentioned, confirm it
   - If multiple available, ask which to seed from
   - Verify the integration is Active

### 2. Configuration

Gather seeding parameters:

**Required**:
- Integration(s) to seed from
- Time range (or use default)

**Optional filters**:
- Specific participants/attendees
- Keywords in titles
- Meeting types
- Exclude patterns

Example prompt:
```
I'll help you seed your workspace from Fathom. Let me confirm a few things:

1. **Time Range**: How far back should I go?
   - Quick (30 days) - Fast, recent context
   - Standard (60 days) - Balanced coverage  
   - Deep (90+ days) - Comprehensive history
   - Custom date range

2. **Filters** (optional):
   - Any specific people to include/exclude?
   - Keywords to filter by?
   - Meeting types to skip (e.g., skip 1:1s)?
```

### 3. Preview

Before executing, show what will be imported:

```markdown
# Seed Preview - Fathom

**Configuration**:
- Time Range: Dec 5, 2025 - Feb 5, 2026 (62 days)
- Filters: None
- Destination: resources/meetings/

**Found**: 47 meetings

## Sample Items
| Date | Title | Duration | Attendees |
|------|-------|----------|-----------|
| Feb 5 | Product Roadmap Review | 45 min | 6 |
| Feb 4 | User Interview - Sarah | 30 min | 2 |
| Feb 3 | Sprint Planning | 60 min | 8 |
| ... | ... | ... | ... |

## Estimates
- Import time: ~10 minutes
- Disk usage: ~2-5 MB

**Proceed with seed?** [Y/n]
```

### 4. Execution

Execute the seed with progress tracking:

```markdown
# Seed Progress - Fathom

Started: 2026-02-05 10:00 AM
Status: In Progress

## Configuration
- Range: Dec 5, 2025 - Feb 5, 2026 (62 days)
- Filter: None
- Destination: resources/meetings/

## Progress
- [x] Connected to Fathom API
- [x] Fetched meeting list (47 meetings)
- [x] Downloaded meeting data (47/47)
- [ ] Transforming to templates (32/47)
- [ ] Saving to workspace

## Current
Processing: "Q4 Planning Session" (Dec 15)

## Stats
- Processed: 32/47
- Skipped (duplicates): 0
- Errors: 0
- Elapsed: 4 min 23 sec
```

For each item:
1. Fetch full data from integration
2. Check for existing duplicate in destination
3. Apply template transformation
4. Save to destination with proper naming
5. Update progress

### 5. Completion & Synthesis Queueing

When seed completes, extract candidate decisions/learnings and add to the review queue:

```markdown
# Seed Complete - Fathom

Completed: 2026-02-05 10:12 AM
Duration: 12 minutes

## Import Results
| Metric | Count |
|--------|-------|
| Items found | 47 |
| Items imported | 45 |
| Skipped (duplicates) | 2 |
| Errors | 0 |

## Imported To
`resources/meetings/` - 45 new files

## Sample Imports
- 2026-02-05-product-roadmap-review.md
- 2026-02-04-user-interview-sarah.md
- 2026-02-03-sprint-planning.md
- ...

## Synthesis Queue
Extracted potential decisions and learnings from imported content:

| Type | Count | Status |
|------|-------|--------|
| Decisions | 12 | Added to review queue |
| Learnings | 18 | Added to review queue |

Items saved to `memory/pending-review.md` for your review.

## Next Steps

1. **Process review queue**: Say "review pending items" to approve/edit/skip
2. **Or defer to weekly planning**: Queue will be surfaced during planning
3. **Spot check imports**: Scan a few files to verify quality
```

#### Extraction Logic

When extracting from imported meetings, look for:

**Decisions** (look for):
- Explicit choices: "we decided", "we chose", "going with"
- Conclusions from debates: "after discussing", "the consensus was"
- Action outcomes: "we will", "the plan is"

**Learnings** (look for):
- User insights: quotes, behaviors, feedback patterns
- Process observations: what worked/didn't work
- Market/competitive insights

Add each candidate to `memory/pending-review.md` with:
- Title (concise summary)
- Source (link to imported file)
- Extracted date
- Context/insight
- Suggested rationale/implications

### 6. Post-Seed Actions

After successful seed:

1. **Update registry**: Add seed to history
   ```markdown
   | 2026-02-05T10:12:00Z | Fathom | Seed (62d) | 45 | Success |
   ```

2. **Update integration config**: Set `last_sync`

3. **Offer to process queue**:
   - "You have 30 items in your review queue. Process now or save for later?"
   - If now → Present items in batches for approval
   - If later → Items remain in `memory/pending-review.md`

4. **Remind about weekly planning**:
   - "Your review queue will be surfaced during weekly planning"
   - "Say 'review pending items' anytime to process the queue"

---

## Integration-Specific Seeding

### Fathom

**What's imported**:
- Meeting title and date
- AI-generated summary
- Key moments and highlights
- Action items
- Attendee list
- Duration
- Full transcript (if enabled in Fathom)

**Seed limits**:
- Maximum: 90 days (Fathom retention)
- Rate limit: ~100 requests/minute

**Best filters**:
- By attendee: Focus on customer meetings
- By keyword: "interview", "planning", "review"
- Exclude: Internal 1:1s if too noisy

**API Script** (for agent execution):
```bash
# Fetch and save meetings from last 60 days
python scripts/integrations/fathom.py fetch --days 60 --output resources/meetings/

# Fetch with custom date range
python scripts/integrations/fathom.py fetch --start 2025-12-01 --end 2026-02-01 --output resources/meetings/

# List meetings first (preview)
python scripts/integrations/fathom.py list --days 60 --json
```

### Calendar

**What's imported**:
- Event title and time
- Attendees and organizer
- Description/agenda
- Location (if set)
- Recurring event info

**Seed limits**:
- Maximum: Varies by provider
- Google: 2 years history
- Outlook: 6 months default

**Best filters**:
- Exclude declined events
- Focus on meetings (skip focus time, OOO)
- Filter by attendee count (>2)

### Slack

**What's imported**:
- Message content
- Thread context
- Reactions and timestamps
- File attachments (links)

**Seed limits**:
- Depends on Slack plan
- Free: 90 days
- Paid: Full history

**Best filters**:
- Specific channels only
- Starred messages
- Threads with many replies

---

## Error Handling

### Authentication Errors

```markdown
## Seed Failed - Authentication

**Integration**: Fathom
**Error**: API key invalid or expired

### Resolution
1. Visit https://fathom.video/settings/api
2. Generate a new API key
3. Update credentials:
   ```bash
   export FATHOM_API_KEY="your-new-key"
   ```
4. Run seed again
```

### Rate Limiting

```markdown
## Seed Paused - Rate Limited

**Integration**: Fathom
**Error**: Too many requests

### Status
- Completed: 23/47 items
- Waiting: 2 minutes before retry
- Will auto-resume

The seed will continue automatically. You can also resume manually later.
```

### Partial Failure

```markdown
## Seed Completed with Errors

**Integration**: Fathom
**Items imported**: 42/47
**Errors**: 5

### Failed Items
| Item | Error |
|------|-------|
| "Dec 10 Meeting" | Transcript not available |
| "Dec 15 Call" | Permission denied |

### Options
1. Retry failed items: "Retry failed seed items"
2. Skip and continue: Items are logged, can retry later
3. Investigate: Check Fathom for these specific meetings
```

---

## Resuming Interrupted Seeds

If a seed is interrupted:

```markdown
## Resume Seed

A previous seed was interrupted:
- Integration: Fathom
- Started: 2026-02-05 10:00 AM
- Progress: 23/47 items
- Last item: "Jan 15 Planning"

**Options**:
1. Resume from where it stopped
2. Start fresh (will skip already-imported items)
3. Cancel and discard progress
```

---

## Related

- [Integration Framework](../../integrations/README.md)
- [Integration Registry](../../integrations/registry.md)
- [Sync Skill](../../skills/sync/SKILL.md) - For incremental syncs
- [Synthesize Skill](../../skills/synthesize/SKILL.md) - Process seeded content
