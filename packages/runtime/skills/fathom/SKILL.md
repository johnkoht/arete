---
name: fathom
description: Pull meeting recordings from Fathom and save to workspace
work_type: operations
category: essential
intelligence:
  - synthesis
triggers:
  - pull from fathom
  - fathom recordings
  - fetch my fathom meetings
  - sync fathom
  - fathom integration
  - fetch fathom
  - fathom recording
  - pull fathom
  - fetch my latest fathom recording
---

# Fathom Skill

Pull meeting recordings from Fathom and save structured meeting files to `resources/meetings/`. After pulling, run **process-meetings** to add Areté-generated intelligence (Summary, Action Items, Decisions, Learnings).

## Two-Stage Flow

```
Stage 1 — Pull (this skill):  arete pull fathom → saves raw meeting files
Stage 2 — Enrich:             process-meetings  → adds Areté Summary, Action Items, Decisions, Learnings
```

Always suggest running `process-meetings` after a successful pull.

## When to Use

- "Pull my Fathom meetings from this week"
- "Fetch yesterday's customer call from Fathom"
- "Get all my Fathom recordings for the last two weeks"
- "Fetch summaries for meetings in resources/meetings/ that have a Fathom recording URL" (backfill)

## Workflow

### 1. Check Integration Status

```bash
arete integration list --json
```

Confirm `fathom` shows `status: active`. If not active:

```
Fathom isn't connected yet. Run:
  arete integration configure fathom

You'll need your Fathom API key from https://fathom.video/settings/api
```

### 2. Confirm Time Range

Ask the user what time range to pull (default: last 7 days). Common options:
- Today / yesterday
- Last N days (e.g. `--days 7`)
- Specific date range

### 3. Pull Recordings

```bash
# List available recordings first (to preview what will be imported)
arete fathom list --days 7

# Pull all recordings in range
arete pull fathom --days 7 --json

# Pull a single recording by ID
arete fathom get <recording_id>
# Or: arete pull fathom --id <recording_id>
```

Use a **numeric** recording ID (e.g. `12345`), not the placeholder literal. Get IDs from `arete fathom list`.

### 4. Name Enrichment

Fathom may return email-only or first-name-only attendees. These are enriched during the process-meetings step — specifically, during entity resolution (step 2), which uses the **enrich_meeting_attendees** pattern — see [PATTERNS.md](../PATTERNS.md) § enrich_meeting_attendees. No enrichment action is needed during pull.

### 5. Save Meeting Files

For each recording, save to `resources/meetings/{date}-{title-slug}.md` using the meeting template. The file is structured for process-meetings:

- **Empty** `## Summary`, `## Action Items`, `## Next Steps`, `## Decisions`, and `## Learnings` sections (Areté will fill these)
- Fathom's AI summary preserved in a collapsed `<details>` block under `## Fathom Notes`
- Transcript in a collapsed `<details>` block under `## Transcript`

Template: `arete template resolve --skill fathom --variant meeting`

### 6. Backfill Existing Meeting Files

When the user wants to fetch Fathom data for meetings already in `resources/meetings/`:

1. List files in `resources/meetings/` (exclude `index.md`)
2. For each file, read frontmatter for `recording_id` or a Fathom URL (`fathom.video`, `share_url`); extract recording ID from URL if needed
3. For each meeting with a Fathom ID, run `arete fathom get <recording_id>` — updates the file in place
4. Confirm which files were updated, then suggest process-meetings

### 7. Post-Pull

After all recordings are saved:

```markdown
## Fathom Pull Complete

**Recordings imported**: N
**Date range**: {start} – {end}
**Saved to**: resources/meetings/

### Imported
| Date | Title | File |
|------|-------|------|
| ... | ... | ... |

### Suggested Next Step
Run **process-meetings** to extract people, decisions, and learnings from these recordings.
```

Then prompt: "Would you like me to run process-meetings on these now?"

### 8. Error Handling

| Error | Resolution |
|-------|-----------|
| `auth_expired` | Generate new API key at https://fathom.video/settings/api; run `export FATHOM_API_KEY="new-key"` |
| `not_configured` | Run `arete integration configure fathom` |
| `recording_not_found` | Verify the numeric ID from `arete fathom list --days 30` |
| `no_transcript` | Transcript may not be enabled for this recording in Fathom settings |

## Related

- **process-meetings** — Run after pull to extract intelligence and update people
- **enrich_meeting_attendees** pattern — Fill in missing attendee names/emails before entity resolution — see [PATTERNS.md](../PATTERNS.md) § enrich_meeting_attendees
- [PATTERNS.md](../PATTERNS.md) — Full pattern documentation
