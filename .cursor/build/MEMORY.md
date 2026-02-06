# Build memory (Arete project)

Index of significant changes to **Arete’s build, tooling, and architecture**. Detail lives in dated entries; this file is the index.

- **USER.md** (gitignored): User-specific context — copy from `USER.md.example`.
- **Entries**: `.cursor/build/entries/YYYY-MM-DD_short-title.md` — one file per change or decision.

## Conventions

- **When to add an entry**: Refactors, tooling changes, architectural decisions, breaking changes, or anything you’d want to remember in 6 months.
- **Entry format**: `YYYY-MM-DD_slug.md` (e.g. `2025-02-05_build-memory-system.md`).
- **In MEMORY.md**: One line per entry: `- YYYY-MM-DD [title](entries/YYYY-MM-DD_slug.md) — one-line summary.`

## Index

<!-- Add new entries at the top -->

- 2026-02-05 [Fathom Node migration & API URL fix](entries/2026-02-05_fathom-node-migration.md) — Fathom integration moved from Python to Node; External API base URL and URL() fix; fetch flow uses list-with-includes.
- 2025-02-05 [Build memory system](entries/2025-02-05_build-memory-system.md) — Added USER.md, MEMORY.md, build entries, and dev.mdc for Arete’s build process.
