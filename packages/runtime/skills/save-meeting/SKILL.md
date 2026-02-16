---
name: save-meeting
description: Save pasted meeting content (summary, transcript, URL) to resources/meetings. Use when the user pastes meeting content and wants to save it, or says "save this meeting".
work_type: operations
category: essential
---

# Save Meeting Skill

Save meeting content that the user pastes into chat (e.g. from a shared Fathom/Granola/Zoom recording link) to `resources/meetings/` and update the meetings index.

## When to Use

- "save this meeting"
- "add this to my meetings"
- User pastes meeting summary and/or transcript
- "I was sent a recording link and the transcript – save it"
- User pastes content from Fathom, Granola, Read.ai, Zoom, or other recording tools

Also useful:
- When the user doesn't own the recorder (someone else shared the recording)
- Manual capture of meeting notes from any source

## Workflow

### 1. Recognize Pasted Content

The user has pasted meeting content. Look for:
- **Summary** – narrative or bullet summary
- **Transcript** – speaker-by-speaker dialogue (may have timestamps)
- **URL** – recording or share link
- **Title** – meeting name (may be in a header or first line)
- **Date** – meeting date (YYYY-MM-DD or similar)
- **Action items** – bullet list of follow-ups

### 2. Extract Structured Data

Parse the pasted content to extract:

| Field | Required | Notes |
|-------|----------|-------|
| title | Yes (or infer) | Use first header, "Meeting" line, or "Untitled Meeting" |
| date | No | Default: today (YYYY-MM-DD) |
| summary | Yes* | *At least one of summary or transcript required |
| transcript | Yes* | Full or partial transcript |
| url | No | Recording/share link if present |
| action_items | No | Array of strings |
| topics | No | Keywords or 1–2 sentences for the index; helps the agent scan and load relevant meetings. If omitted, derived from summary. |

**Parsing tips:**
- Look for section headers: "Summary", "Transcript", "Action Items"
- Timestamps in transcripts: `[00:01:23] Speaker: text` or `**Speaker**: text`
- URLs: Fathom, Granola, Zoom, Read.ai share links
- If structure is unclear, infer from context – the agent can extract from messy paste

### 3. Validate

Ensure at least **title** and (**summary** or **transcript**) are present. If critical fields are missing:
- Ask the user to provide them
- Or infer reasonable defaults (e.g. title = "Untitled Meeting", date = today)

### 4. Save via CLI

1. Write the extracted data to a temporary JSON file (e.g. in project `scratchpad` context or a temp path):
   ```json
   {
     "title": "Product Review",
     "date": "2026-02-06",
     "summary": "...",
     "transcript": "...",
     "url": "https://...",
     "action_items": ["Item 1", "Item 2"]
   }
   ```

2. Run the meeting add command:
   ```bash
   arete meeting add --file /path/to/meeting.json
   ```

3. If in an Areté workspace, the command will:
   - Save the meeting to `resources/meetings/YYYY-MM-DD-slug.md`
   - Update `resources/meetings/index.md` (table: Date | Title | Attendees | Recording | Topics). The agent can scan the index for topics/themes, then open the linked file.

### 5. Confirm

Report the result:
- **Success**: "Saved to `resources/meetings/YYYY-MM-DD-meeting-title.md` and updated the meetings index."
- **Skipped**: "Meeting file already exists (same date and title)."
- **Error**: Share the error message and suggest fixes.

## Example

**User pastes:**
```
Fathom - Product Review
Date: Feb 6, 2026
https://fathom.video/share/abc123

Summary:
Discussed Q1 roadmap. Decided to prioritize feature X.

Action items:
- Follow up with design on mockups
- Schedule eng sync
```

**Agent extracts:**
```json
{
  "title": "Product Review",
  "date": "2026-02-06",
  "summary": "Discussed Q1 roadmap. Decided to prioritize feature X.",
  "transcript": "",
  "url": "https://fathom.video/share/abc123",
  "action_items": ["Follow up with design on mockups", "Schedule eng sync"]
}
```

**Agent runs:** `arete meeting add --file /tmp/meeting-xxx.json`

**Agent responds:** "Saved to `resources/meetings/2026-02-06-product-review.md` and updated the meetings index."

## Integration

- Uses `arete meeting add --file <path>` (see `src/commands/meeting.ts`)
- Meetings are saved via the shared meetings service (`src/core/meetings.ts`)
- Same format as Fathom/Granola integrations – manual capture uses the same template
