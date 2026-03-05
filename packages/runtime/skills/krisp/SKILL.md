---
name: krisp
description: Pull meeting recordings from Krisp and save to workspace
work_type: operations
category: essential
intelligence:
  - synthesis
triggers:
  - pull from krisp
  - krisp recordings
  - fetch my krisp meetings
  - sync krisp
  - krisp integration
  - fetch krisp
  - krisp recording
  - pull krisp
  - fetch my latest krisp recording
---

# Krisp Skill

Pull meeting recordings from Krisp and save them to `resources/meetings/`. This skill handles the **pull stage only** — after pulling, run the `process-meetings` skill to generate Areté intelligence (Summary, Action Items, Decisions, Learnings).

## Two-Stage Flow

```
Stage 1 — Pull (this skill):  arete pull krisp → saves raw meeting files
Stage 2 — Enrich:             process-meetings → adds Areté Summary, Action Items, Decisions, Learnings
```

Always suggest running `process-meetings` after a successful pull.

## When to Use

- "Pull my Krisp meetings from this week"
- "Fetch my latest Krisp recording"
- "Import yesterday's Krisp call"
- "Sync Krisp"

**Not this skill**: Use `process-meetings` for extracting decisions, updating people, or enriching already-saved meeting files.

## Workflow

### 1. Check Integration Status

```bash
arete integration list --json
```

Look for a `krisp` entry with `status: active`. If not active:

```
Krisp isn't connected yet. Run:
  arete integration configure krisp

This opens a browser to authorize Areté with your Krisp account.
Note: Requires a Krisp Core plan or higher.
```

Do not attempt to pull — authentication will fail without an active integration.

### 2. Confirm Time Range

Ask the user how far back to pull (default: 7 days):

- "today" → `--days 1`
- "this week" → `--days 7`
- "last 14 days" → `--days 14`

### 3. Pull Recordings

```bash
arete pull krisp --days N --json
```

The output includes a list of saved meeting files and any errors.

### 4. Name Enrichment

Krisp recordings sometimes include email-only or first-name-only attendees. Use the **enrich_meeting_attendees** pattern — see [PATTERNS.md](../PATTERNS.md) § enrich_meeting_attendees — to cross-reference calendar events and fill in missing names and emails before handing off to `process-meetings`.

### 5. Report and Hand Off

Report the results:

```
## Krisp Pull Complete

**Time range**: Last 7 days
**Recordings found**: 3
**Saved to**: resources/meetings/

### Saved Files
- 2026-03-04-product-review.md
- 2026-03-03-customer-call-acme.md
- 2026-03-01-sprint-planning.md

### Suggested Next Step
Run process-meetings to generate Areté Summary, Action Items, Decisions, and Learnings for these recordings.
```

## Error Handling

| Error | Resolution |
|-------|-----------|
| `auth_expired` | Re-run `arete integration configure krisp` to re-authorize |
| `plan_required` | Upgrade to Krisp Core plan — Basic plan does not expose recordings via API |
| `no_recordings` | No meetings in the requested time range; try a longer `--days` window |

## Notes

- **Krisp Core plan required** — The Krisp API integration requires a Core plan or higher. Basic plan users should export notes manually.
- Meeting files are saved to `resources/meetings/` using the naming convention `YYYY-MM-DD-{title_slug}.md`.
- The saved template documents the **final format** expected after `process-meetings` runs — see `templates/meeting.md`.

## References

- **Pattern**: [PATTERNS.md](../PATTERNS.md) — enrich_meeting_attendees, extract_decisions_learnings
- **Next step**: `process-meetings` skill
- **Output**: `resources/meetings/`
