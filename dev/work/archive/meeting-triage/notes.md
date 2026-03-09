# Meeting Triage — Planning Notes

## Problem Statement

The post-meeting workflow in Areté is entirely agent-driven and requires 2-3 manual steps per meeting. When meetings pile up at end of day, the review burden is high. There's no UI layer for reviewing and approving extracted items before they get committed to memory.

**Current flow:**
1. `arete pull krisp` → saves raw meeting file (status: synced conceptually)
2. `arete process-meetings` (agent skill) → entity resolution + extracts decisions/learnings → **immediately commits to memory**
3. User reviews in agent chat (no structured UI)

**Core friction:** No staging layer. Extracted items get committed without review. No way to approve/skip individual decisions, learnings, or action items.

---

## Product Vision

A focused meeting triage UI — shipped as `arete view` — that makes post-meeting review fast and intentional. Built as a foundation for a larger workspace UI (projects, people, context, etc.) later.

**Not:** A full Notion-like workspace (that's v2+).
**Yes:** A tight, high-value triage workflow for meetings.

---

## Status State Machine

```
arete pull krisp
      ↓
  SYNCED
  (file exists, raw Krisp content: summary, action items, transcript)
      ↓
  arete meeting process --file <path> (people resolution, CLI-backed)
  + agent runs process-meetings skill (AI-backed: decisions, learnings, summary)
      ↓
  PROCESSED
  (attendees resolved + attendee_ids written; extracted items STAGED in meeting file)
      ↓
  User reviews in UI → approves/edits/skips items individually
      ↓
  APPROVED
  (approved items written to .arete/memory/items/, meeting marked done)
```

---

## Key Technical Distinction: Two Types of Processing

| Processing Type | Backed By | CLI Command | Reprocessable from UI? |
|-----------------|-----------|-------------|------------------------|
| People resolution | `arete meeting process --file` | ✅ CLI | ✅ Yes — instant |
| Content (summary, decisions, learnings, action items) | AI agent (process-meetings skill) | ❌ AI only | ⚠️ v2 — async/agent session |

**Implication for v1**: The UI "Reprocess" action means "Reprocess People" (CLI-backed). Content reprocessing requires triggering an AI agent session — deferred to v2.

---

## Data Model Changes

### Meeting Frontmatter (after sync — updated by saveMeetingFile)
```yaml
title: "Design Review — Notifications"
date: "2026-03-04"
source: "Krisp"
status: synced                      # NEW: synced | processed | approved
attendees:                          # Krisp provides these at sync time
  - name: "John Koht"
    email: "john@reserv.com"
recording_url: "https://krisp.ai/..."
```

### Meeting Frontmatter (after processing)
```yaml
status: processed
attendee_ids: [john-koht, lindsay-smith]
processed_at: "2026-03-04T18:30:00Z"
```

### New Body Sections (written by process-meetings skill — STAGED, not committed)
```markdown
## Staged Action Items
- [ ] si_ai_a1b2: Follow up on notification spec (@john-koht)
- [ ] si_ai_c3d4: Share Figma link with Lindsay

## Staged Decisions
- si_de_e5f6: We'll use push notifications for urgent alerts only

## Staged Learnings
- si_le_g7h8: Users are ignoring in-app banners for non-urgent items
```

**ID format**: `si_<type>_<6-char-random>` where type = `ai` (action item), `de` (decision), `le` (learning)

**Item status tracking**: Tracked in frontmatter (not in body) to avoid markdown mangling:
```yaml
staged_item_status:
  si_ai_a1b2: approved
  si_ai_c3d4: skipped
  si_de_e5f6: pending
  si_le_g7h8: approved
staged_item_edits:
  si_ai_a1b2: "Follow up on notification spec with Lindsay by Friday"
```

---

## API Endpoints

### Meetings
- `GET  /api/meetings` — list all, parse frontmatter for table data
- `GET  /api/meetings/:slug` — full parsed meeting (frontmatter + staged items + content sections)
- `DELETE /api/meetings/:slug` — delete file

### Sync & Processing
- `POST /api/meetings/sync` — shell out to `arete pull krisp` (async, returns job ID)
- `GET  /api/jobs/:id` — poll job status (for sync)
- `POST /api/meetings/:slug/process-people` — shell out to `arete meeting process --file <path> --json`

### Editing
- `PUT  /api/meetings/:slug` — save edits (summary, title, etc.)

### Per-item triage
- `PATCH /api/meetings/:slug/items/:id`
  - `:id` = staged item ID (e.g. `si_ai_a1b2`)
  - Body: `{ action: 'approve' | 'skip' | 'edit', text?: string }`
  - Updates `staged_item_status` + `staged_item_edits` in frontmatter

### Bulk approval
- `POST /api/meetings/:slug/approve`
  - Reads all `approved` staged items from frontmatter
  - Commits to `.arete/memory/items/` (decisions.md, learnings.md)
  - Writes approved action items to `## Action Items` section in meeting file
  - Removes all `## Staged *` sections
  - Clears `staged_item_status` and `staged_item_edits` from frontmatter
  - Sets `status: approved`

---

## Architecture

Ships as `packages/viewer` within Areté repo.

```
packages/
  viewer/
    server/   ← Node.js (Hono), reads/writes workspace via @arete/core
    client/   ← React + Vite SPA
```

Launched via: `arete view` command (starts server, opens browser to localhost)

---

## V1 Scope

### In
- Meeting index table with status badges (synced/processed/approved)
- Meeting detail view with metadata panel
- Triage UI: per-item approve/skip/edit for action items, decisions, learnings (ID-based)
- Sync button (async, polls for completion)
- Process People button (shells to `arete meeting process --file`)
- Inline summary editing
- Save & Approve flow → commits to memory
- `process-meetings` skill behavior change: stage instead of commit
- `arete view` CLI command

### Out (v2+)
- AI content reprocessing from UI (requires agent session)
- People / memory / projects / context views
- Full Notion-like editor
- Fathom support
- Search / filter in index
- Keyboard shortcuts for triage

---

## Bugs Found (2026-03-05)

### Setup/DX Issues (NOT YET FIXED)
- **Clunky startup**: Need to improve `arete view` to handle API key configuration better; currently requires manual env var export before starting backend
- **API key integration**: Backend uses `getEnvApiKey()` which only checks env vars; should consider reading from Pi's stored credentials

### UI Bugs — FIXED (2026-03-05)

1. ✅ **Process modal doesn't refresh page** — Fixed: Added query invalidation when modal closes after successful processing.

2. ⚠️ **Invalid Date** — Partially addressed: Date parsing should work for ISO strings. If still seeing issues, it's likely missing date data from Krisp.

3. ✅ **Duration shows "0 minutes"** — Fixed: Backend now parses `**Duration**: X minutes` format from Krisp meeting body.

4. ✅ **Approved meeting view is empty**:
   - 4.1 ✅ Removed "Next in Triage" link from approved view
   - 4.2 ✅ Fixed: `commitApprovedItems` now stores approved items in frontmatter (`approved_items` field), and `ApprovedItemsSection` displays them. Also writes approved action items to `## Approved Action Items` section in meeting file.

5. ✅ **"View recording" does nothing** — Fixed: Now shows "No recording available" if no URL, otherwise opens the recording URL in new tab.

6. ✅ **"New meeting" does nothing** — Fixed: Button is now disabled with "Coming soon" tooltip.

### New Features Added (2026-03-05)

- ✅ **Reverse chronological order** — Backend already sorts by date descending
- ✅ **Column sorting** — Added clickable column headers with sort indicators for Title, Date, Status, Duration, Source

### Skill/Data Issues (NOT YET FIXED)
- **22 items extracted from one meeting** — Likely over-extraction by the process-meetings skill; needs tuning (follow-up separately)

---

## Open Questions (Resolved)

1. ✅ **Item identity**: ID-based (`si_<type>_<6-char-random>`)
2. ✅ **process-meetings change**: Stage items in meeting file; CLI `--commit` flag preserves old behavior
3. ✅ **Reprocess in UI**: Scoped to people only (CLI-backed); content reprocess = v2
4. ✅ **Item status storage**: In frontmatter (`staged_item_status` map), not in body
