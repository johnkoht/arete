# Shared meetings service and index update (2026-02-06)

## What

- **Core meetings module** (`src/core/meetings.ts`): Centralized logic for saving meeting files and updating the meetings index. Exports `MeetingForSave`, `saveMeetingFile`, `updateMeetingsIndex`, `saveMeeting`, `meetingFilename`. Template rendering and index merge logic moved here from Fathom.
- **Index update**: `updateMeetingsIndex()` reads `resources/meetings/index.md`, merges new entry into "Recent Meetings", dedupes by filename, sorts by date desc, limits to 20. Handles "None yet." placeholder and creates index if missing.
- **Fathom refactor**: Fathom `save.ts` now only contains `meetingFromListItem` (API → MeetingForSave). Saving and index updates use core `saveMeeting()` with `integration: 'Fathom'`.
- **`arete meeting add`**: New CLI command for manual capture. Accepts `--file <path>` (JSON) or `--stdin`. Normalizes input to `MeetingForSave` and calls core `saveMeeting()` with `integration: 'Manual'`.
- **Save Meeting skill** (`.cursor/skills/save-meeting/SKILL.md`): Agent workflow for paste-into-chat flow—parse pasted content, write temp JSON, run `arete meeting add --file`.

## Why

- Fathom fetch saved meeting files but did not update the index (bug).
- Future integrations (Granola, etc.) will need the same save + index behavior.
- Manual capture (user doesn't own recorder, pastes from shared link) needs a way to add meetings.

## Learnings

1. **Single entry point for saving**: All meeting sources (Fathom, manual, future integrations) produce `MeetingForSave` and call `saveMeeting()`. Index update is automatic—no way to forget it.
2. **`MeetingForSave.attendees`**: Core type uses `Array<{ name?: string | null; email?: string | null } | string>` to accept both Fathom's `Invitee[]` (which has `name?: string | null`) and manual input.
3. **Index format**: Entries are `- [Title](filename) – date`. Regex `INDEX_ENTRY_REGEX` parses; `formatIndexEntries` renders. Fallback when "## Recent Meetings" section missing: append section to end of file.
4. **Meeting add for agents**: Agent pastes content → extracts JSON → writes temp file → runs `arete meeting add --file`. `--file` chosen over `--stdin` for long transcripts (shell arg limits).

## Files touched

- **Added**: `src/core/meetings.ts`, `src/commands/meeting.ts`, `test/core/meetings.test.ts`, `test/commands/meeting.test.ts`, `.cursor/skills/save-meeting/SKILL.md`, `.cursor/build/entries/2026-02-06_meetings-service-and-index.md`
- **Updated**: `src/integrations/fathom/save.ts` (slimmed to Fathom-specific transforms), `src/integrations/fathom/index.ts` (uses core saveMeeting), `src/integrations/fathom/types.ts` (removed MeetingForSave), `src/cli.ts` (meeting add command), `arete` (meeting subcommand routing), `.cursor/rules/pm-workspace.mdc` (save-meeting in skills table), `test/integrations/fathom.test.ts` (import meetingFilename from core)
