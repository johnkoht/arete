# Temporal + Person Memory v2 (Lean MVP)

## What changed

Implemented a lean follow-on to temporal memory focused on person-level recall:

- Added `EntityService.refreshPersonMemory()` to scan meeting notes/transcripts and refresh auto-managed person highlights.
- Added CLI command: `arete people memory refresh` (with `--person` and `--min-mentions`).
- Added marker-based upsert section in person files:
  - `## Memory Highlights (Auto)`
  - repeated asks
  - repeated concerns
  - mention counts, last-mentioned date, source references
- Updated runtime skill docs/patterns so meeting workflows can incorporate person memory highlights:
  - `process-meetings`
  - `meeting-prep`
  - `prepare-meeting-agenda`
  - `PATTERNS.md` (`refresh_person_memory`)
- Updated intelligence docs and CLI references in GUIDE and AGENTS sources.

## Tests and verification

- Added core tests: `packages/core/test/services/person-memory.test.ts`
- Added CLI tests: `packages/cli/test/commands/people.test.ts`
- Quality gates passed:
  - `npm run typecheck`
  - `npm test`
  - `npm run build:agents:dev`
  - `npm run build`

## Learnings

- Person-memory value can ship incrementally without waiting for full topic graph infrastructure.
- Marker-delimited auto sections are a practical pattern for keeping generated profile content idempotent and preserving manual notes.
- Meeting workflows benefit from lightweight, evidence-backed memory summaries before introducing heavier extraction/LLM logic.
