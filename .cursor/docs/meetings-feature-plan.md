# Meetings Feature Plan

**Created**: 2026-02-06  
**Status**: Implemented  
**Scope**: Shared meetings service + paste-into-chat manual capture

---

## Overview

Two related features:

1. **Shared Meetings Service** – Centralize meeting save logic (file write + index update) so Fathom and future integrations (Granola, etc.) use one code path.
2. **Manual Meeting Capture** – When the user doesn't own the recorder (e.g. someone sends them a Fathom/Granola link), they paste content into chat → agent parses → calls the meetings service.

---

## Part 1: Shared Meetings Service

### Goals

- Single entry point for saving meetings (file + index)
- Integration-agnostic: Fathom, Granola, manual paste all produce `MeetingForSave` and call the same service
- Index (`resources/meetings/index.md`) stays up to date whenever meetings are saved

### Components

#### 1.1 Shared Type: `MeetingForSave`

- **Location**: Move to `src/core/meetings.ts` or `src/types.ts` (or keep in fathom/types and re-export from core)
- **Rationale**: Shared shape across all meeting sources. Fathom already defines this; we need a canonical place. Options:
  - **A**: Add `MeetingForSave` to `src/types.ts` as the canonical type; fathom/types imports or extends it
  - **B**: Define in `src/core/meetings.ts` and export; fathom types extend or alias it
- **Fields**: `title`, `date`, `summary`, `transcript`, `url`, `duration_minutes`, `action_items`, `highlights`, `attendees`, `recording_id`, `share_url`, etc. (current fathom shape)

#### 1.2 Core Meetings Module

**Location**: `src/core/meetings.ts`

**Exports**:

| Function | Purpose |
|----------|---------|
| `saveMeetingFile(meeting, outputDir, paths, options)` | Writes meeting markdown to disk using integration-meeting template. Options: `integration` (string, e.g. "Fathom"), `force` (boolean). Returns `string \| null` (path or null if skipped). |
| `updateMeetingsIndex(meetingsDir, newEntry)` | Reads `index.md`, merges `newEntry` into "Recent Meetings", writes back. Entry: `{ filename, title, date }`. Maintains sort order (newest first), dedupes, limits to N entries (e.g. 20). |
| `saveMeeting(meeting, outputDir, paths, options)` | Orchestrates: calls `saveMeetingFile`, then if saved, calls `updateMeetingsIndex`. Returns `{ saved: boolean, path: string \| null }`. |

**Index format** (to preserve):

```markdown
# Meetings Index

Meeting notes and transcripts organized by date.

## Recent Meetings

- [2026-02-05 Product Review](2026-02-05-product-review.md) – 2026-02-05
- [2026-02-04 Standup](2026-02-04-standup.md) – 2026-02-04
...
```

**Design decisions**:

- `integration` param: Template uses `{integration}` for "Source: Fathom" vs "Source: Manual" etc. Pass as option.
- Template path: Reuse existing `getTemplatePath` logic (move to core or keep as dependency).

#### 1.3 Refactor Fathom Integration

- **fathom/save.ts**: Remove `saveMeeting`; keep `meetingFromListItem`, `meetingFilename`, `renderMeetingTemplate`-like logic, or move template rendering into core.
- **fathom/index.ts**: Import `saveMeeting` from `src/core/meetings.js`. Pass `{ integration: 'Fathom' }`. Same for `doFetchRecordings` and `getRecording`.
- **Template rendering**: Core module needs template resolution + variable substitution. Either:
  - Move `getTemplatePath`, `renderMeetingTemplate`, `meetingFilename` from fathom/save.ts into core (generalized with `integration` param), or
  - Core imports fathom's helpers and passes `integration` – but that creates a dependency from core → fathom. Prefer moving shared logic to core.

**Proposed split**:

- **core/meetings.ts**: `slugify`, `meetingFilename`, `getTemplatePath`, `renderMeetingTemplate`, `saveMeetingFile`, `updateMeetingsIndex`, `saveMeeting`
- **fathom/save.ts**: `meetingFromListItem`, `formatTranscriptFromList`, `meetingDurationMinutes` (Fathom-specific transform from API → MeetingForSave)
- **fathom/types.ts**: Keep `FathomMeeting`, etc.; `MeetingForSave` moves to core or types

#### 1.4 Workspace Paths

- `outputDir` = `paths.resources + '/meetings'`
- Index path = `paths.resources + '/meetings/index.md'`
- Core module receives `WorkspacePaths | null`; uses `getWorkspacePaths(findWorkspaceRoot())` if needed, or caller passes it.

---

## Part 2: Manual Meeting Capture (Paste into Chat)

### Goals

- User pastes meeting content (summary, transcript, URL, title, date) into chat
- User says "save this meeting" or similar
- Agent parses content, extracts structured data, calls meetings service
- Works for any source (Fathom, Granola, Zoom, Read.ai, email, etc.)

### Components

#### 2.1 CLI Command: `arete meeting add`

**Purpose**: Accept meeting data from agent (or human) and save via the shared meetings service.

**Interface options**:

| Option | Use case |
|--------|----------|
| `--file <path>` | Agent writes JSON to temp file, passes path. Best for long transcripts. |
| `--stdin` | Read JSON from stdin. `echo '{"title":"..."}' \| arete meeting add --stdin` |
| Individual flags | `--title`, `--summary`, `--transcript`, `--url`, `--date` – simpler cases, but transcript can exceed shell limits |

**Recommendation**: Support `--file <path>` as primary (agent-friendly). Optional: `--stdin` for piping. Skip individual flags for transcript to avoid shell/arg limits.

**Input format** (JSON file or stdin):

```json
{
  "title": "Product Review",
  "date": "2026-02-05",
  "summary": "...",
  "transcript": "...",
  "url": "https://...",
  "action_items": ["Item 1", "Item 2"],
  "attendees": []
}
```

Minimal required: `title`, `summary` or `transcript` (at least one). Defaults: `date` = today, `url` = "", etc.

**Behavior**:

1. Read input (file or stdin)
2. Validate / normalize to `MeetingForSave`
3. Resolve workspace paths
4. Call `saveMeeting(meeting, outputDir, paths, { integration: 'Manual', force: false })`
5. Print result (path saved or "skipped")

#### 2.2 Save Meeting Skill

**Location**: `.cursor/skills/save-meeting/SKILL.md`

**When to use**:

- "save this meeting"
- "add this to my meetings"
- User pastes meeting content (summary, transcript, URL) and wants it saved
- "I was sent a Fathom/Granola link and the transcript – save it"

**Workflow**:

1. **Recognize**: User has pasted meeting content (summary, transcript, URL, possibly title/date).
2. **Extract**: Parse the paste to extract:
   - Title (or infer from context)
   - Date (or use today)
   - Summary
   - Transcript
   - URL (if present)
   - Action items (if present)
3. **Validate**: Ensure at least title + (summary or transcript). Ask user if critical fields missing.
4. **Save**:
   - Write extracted data to a temp JSON file (e.g. `working/meeting-to-save.json` or system temp)
   - Run: `arete meeting add --file <path>`
   - Or: if workspace has Node/tsx, agent could call the meetings service directly – but CLI is more robust for agent use
5. **Confirm**: Report success ("Saved to resources/meetings/2026-02-05-...") or error.

**Skill structure** (follow existing skill format):

- Frontmatter: `name`, `description`
- "When to Use" section with trigger phrases
- "Workflow" section with steps
- "Parsing Tips" – how to extract from messy paste (sections, headers, URLs)
- "Integration" – reference to `arete meeting add`

#### 2.3 Shell Script Entry Point

- **arete** bash script: Add `meeting` subcommand routing to `node bin/arete.js meeting add --file ...`
- **cli.ts**: Add `meeting add` command

---

## Implementation Order

1. **Phase 1: Core meetings module**
   - [ ] Create `src/core/meetings.ts` with `MeetingForSave` (or add to types), `saveMeetingFile`, `updateMeetingsIndex`, `saveMeeting`
   - [ ] Move/generalize template logic from fathom/save.ts
   - [ ] Unit tests for `updateMeetingsIndex`, `saveMeeting`

2. **Phase 2: Refactor Fathom**
   - [ ] Fathom index.ts and get flow call core `saveMeeting`
   - [ ] Slim fathom/save.ts to Fathom-specific transforms only
   - [ ] Integration tests: fetch → verify file + index updated

3. **Phase 3: `arete meeting add`**
   - [ ] CLI command + shell routing
   - [ ] `--file` and optionally `--stdin` support
   - [ ] Test with sample JSON

4. **Phase 4: Save Meeting skill**
   - [ ] Create `.cursor/skills/save-meeting/SKILL.md`
   - [ ] Add to skills index if applicable
   - [ ] Manual test: paste meeting content, trigger skill, verify save

---

## Testing

| Component | Test focus |
|-----------|------------|
| `updateMeetingsIndex` | Parse index, merge entry, preserve format, dedupe, limit |
| `saveMeeting` | File created, index updated, skip on duplicate |
| Fathom refactor | Fetch still works, index updates |
| `meeting add` CLI | Valid JSON → file + index; invalid → error |

---

## Out of Scope (Later)

- URL fetch (paste link → scrape transcript): Best-effort future enhancement for known share formats
- `arete meeting import <file.md>`: Structured import from markdown file
- Webhook-based auto-capture when user owns recorder

---

## References

- Existing: `src/integrations/fathom/save.ts`, `index.ts`
- Template: `templates/inputs/integration-meeting.md`
- Install creates: `resources/meetings/index.md`
- Scratchpad: "Auto-populate meeting index" (2026-02-03)
