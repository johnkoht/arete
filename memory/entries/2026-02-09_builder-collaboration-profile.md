# Builder collaboration profile and mode-aware memory

**Date**: 2026-02-09

## What changed

- Created `.cursor/build/collaboration.md` — synthesized builder collaboration profile, seeded from observations previously in `memory/items/agent-observations.md`.
- Reset `memory/items/agent-observations.md` to a clean product template (GUIDE mode only).
- Rewrote `.cursor/rules/agent-memory.mdc` to be mode-aware: BUILDER routes observations to build entries (Learnings section) and synthesizes into `.cursor/build/collaboration.md`; GUIDE routes to `.arete/memory/items/agent-observations.md` and synthesizes into `.arete/memory/summaries/collaboration.md`.
- Updated `.cursor/build/MEMORY.md` and `.cursor/rules/dev.mdc` to reference the new collaboration file and entry Learnings convention.

## Why

Builder observations about the developer were being written to the product user memory location (`memory/items/agent-observations.md`), conflating two concerns: (1) how to work with the developer building Areté, and (2) how to work with an end user of the Areté product. Splitting them by mode keeps the build system clean and the product templates ready for end users.

## Design decisions

- **Entries include Learnings**: Rather than a separate `agent-observations.md` for builder mode, collaboration observations are captured as a Learnings section within build entries. Entries already capture what happened; learnings capture what was observed about working style and preferences in that session.
- **collaboration.md is a synthesis**: Periodically synthesized from Learnings across entries — same pattern as GUIDE mode (observations → collaboration profile), just with entries as the input instead of a separate observations file.
- **No separate builder observations file**: Entries are the atomic unit in builder mode. Keeping observations inline avoids yet another file to maintain.

## Learnings

- Builder prefers discussing the design and getting alignment before implementation — raised the concern, talked through the approach, then said "please make the updates."
- Builder thinks in terms of clean separation of concerns: spotted that two different contexts (builder vs user) were sharing a single file and immediately wanted them split.
