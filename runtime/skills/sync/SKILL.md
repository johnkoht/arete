---
name: sync
description: Manually sync data between Areté and external integrations. Use when the user wants to pull data from or push updates to connected tools.
work_type: operations
category: essential
intelligence:
  - synthesis
---

# Sync Skill

Manually synchronize data between the Areté workspace and connected external integrations. This skill handles one-off sync operations—for bulk historical imports, use the `seed-context` tool instead.

## When to Use

- "Sync my meetings from this week"
- "Pull my Fathom recordings from yesterday"
- "Push this update to Slack"
- "Get my calendar for next week"
- "Import today's meeting notes"

## When NOT to Use

- Bulk historical imports → Use `seed-context` tool
- Initial setup/backfill → Use `seed-context` tool
- Continuous/automated sync → Configure integration for realtime

## Review Model

This skill uses **inline review** for synthesis—extracted decisions and learnings are presented immediately for user approval. This is appropriate for focused syncs where context is fresh.

| Sync Type | Review Approach |
|-----------|-----------------|
| **Focused** (this skill) | Inline - propose and confirm immediately |
| **Bulk** (seed-context) | Queue - save to `.arete/memory/pending-review.md` for later |

## Sync Types

### Pull Sync
Read data from external system into Areté workspace.

**Examples**:
- Pull meeting transcripts from Fathom
- Get upcoming calendar events
- Import Slack thread to project inputs

### Push Sync
Write data from Areté to external system.

**Examples**:
- Post project update to Slack channel
- Create calendar event from milestone
- Update Notion page with PRD summary

## Workflow

### 1. Identify Integration

First, check which integrations are configured:

1. Read `.cursor/integrations/registry.md` for available integrations
2. Confirm the requested integration is **Active** status
3. Read the integration config at `.cursor/integrations/configs/[name].yaml`

If integration is not active:
- Guide user to configure it first
- Check for authentication requirements

### 2. Determine Sync Parameters

Ask clarifying questions based on sync type:

**For Pull operations**:
- What time range? (today, this week, specific dates)
- Any filters? (specific meetings, attendees, keywords)
- Where should it go? (default from config, or project-specific)

**For Push operations**:
- What content to push?
- Which channel/destination?
- Any formatting preferences?

### 3. Execute Sync

#### Pull Execution

```markdown
## Sync Preview

**Integration**: Fathom
**Operation**: Pull
**Time Range**: 2026-02-03 to 2026-02-05
**Filters**: None
**Destination**: resources/meetings/

### Items Found
1. "Product Roadmap Review" - Feb 5, 45 min
2. "User Interview - Sarah" - Feb 4, 30 min
3. "Sprint Planning" - Feb 3, 60 min

Proceed with import? [Y/n]
```

For each item:
1. Check for duplicates in destination
2. Transform data using configured template
3. Save to destination with proper naming
4. Report success/failure

#### Push Execution

```markdown
## Push Preview

**Integration**: Slack
**Operation**: Push
**Destination**: #product-updates
**Content**: Project status summary

### Message Preview
---
📋 **Feature X - Status Update**

Progress: Implementation 75% complete
- ✅ API endpoints done
- ✅ Database schema migrated  
- 🔄 Frontend components in progress
- ⏳ Testing starts next week

Next milestone: Beta release Feb 15
---

Send this message? [Y/n]
```

### 4. Post-Sync Actions

After successful sync:

1. **Update registry**: Log sync to `.cursor/integrations/registry.md`
   ```markdown
   | 2026-02-05T10:30:00Z | Fathom | Pull | 3 | Success |
   ```

2. **Update config**: Set `last_sync` in integration config

3. **Extract and Review** (for meeting imports): Use the **extract_decisions_learnings** pattern — see [PATTERNS.md](../PATTERNS.md). Extract candidates from imported content, present for inline review, write approved items to `.arete/memory/items/`. Report: Decisions approved X, Learnings Y, Skipped Z.

### 6. Error Handling

If sync fails:

1. Check error type from integration config
2. Provide clear guidance:

```markdown
## Sync Failed

**Error**: auth_expired
**Message**: Fathom API token has expired.

### Resolution
1. Generate a new API key at https://fathom.video/settings/api
2. Update your credentials:
   - Environment: `export FATHOM_API_KEY="new-key"`
   - Or file: `~/.arete/credentials.yaml`
3. Try sync again
```

## Integration-Specific Guidance

### Fathom (Meeting Recorder)

**Pull capabilities**:
- Meeting summaries with AI-generated notes
- Full transcripts (if enabled)
- Action items and key moments
- Attendee information

**Useful commands**:
- "Pull my Fathom meetings from this week"
- "Import yesterday's customer call from Fathom"
- "Get all meetings with [person] from Fathom"

**Data mapping**:
- Destination: `resources/meetings/`
- Template: `templates/inputs/integration-meeting.md`
- Naming: `{date}-{title}.md`

**API Script** (for agent execution):
```bash
# List meetings from last 7 days
arete fathom list --days 7

# List meetings in date range
arete fathom list --days 7

# Fetch and save specific meeting
arete fathom get <recording_id>

# Batch fetch and save all meetings
arete fathom fetch --days 7
```

### Calendar

**Pull capabilities**:
- Upcoming meetings with attendees
- Meeting agendas and descriptions
- Event times and durations

**Push capabilities**:
- Create events from milestones
- Add prep notes to event descriptions
- Update event details

**Useful commands**:
- "What's on my calendar this week?"
- "Create a calendar event for the PRD review"
- "Pull tomorrow's meetings"

### Slack

**Pull capabilities**:
- Starred/saved messages
- Specific channel threads
- DM conversations

**Push capabilities**:
- Post to channels
- Send DMs
- Update channel topics

**Useful commands**:
- "Post this update to #product"
- "Pull the thread about feature X from Slack"
- "Share these decisions in #engineering"

## Templates

### Pull Result Summary

```markdown
## Sync Complete

**Integration**: [Name]
**Operation**: Pull
**Completed**: [Timestamp]

### Results
- Items found: X
- Items imported: Y
- Skipped (duplicates): Z
- Errors: N

### Imported Items
| Item | Destination |
|------|-------------|
| [Title] | resources/meetings/[file].md |

### Suggested Next Steps
- [ ] Review imported items
- [ ] Extract decisions to memory
- [ ] Synthesize if multiple items
```

### Push Result Summary

```markdown
## Push Complete

**Integration**: [Name]
**Operation**: Push
**Completed**: [Timestamp]

### Result
- Destination: [channel/location]
- Status: Sent successfully
- Link: [URL if available]
```

## Related

- [Integration Framework](../../integrations/README.md)
- [Integration Registry](../../integrations/registry.md)
- [Seed Context Tool](../../tools/seed-context/TOOL.md) - For bulk imports
- [Synthesize Skill](../synthesize/SKILL.md) - Process imported content
