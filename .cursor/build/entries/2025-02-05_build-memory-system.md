# Build memory system (2025-02-05)

## What

Added a small “memory” layer for **Arete’s build process** (separate from the PM workspace `memory/`):

- **USER.md** (from USER.md.example): User-specific context; gitignored.
- **MEMORY.md**: This index; lives in `.cursor/build/MEMORY.md`.
- **entries/**: Dated files `YYYY-MM-DD_short-title.md` with details.
- **.cursor/rules/dev.mdc**: Linters, formatting, and dev best practices for agents.

## Why

- End-user memory lives in `memory/` (PM workspace). Build/refactor decisions had no persistent place.
- USER.md gives “me”-specific context so agents don’t assume the wrong env or tools.
- MEMORY.md + entries give a lightweight changelog/decision log for the project itself.
- dev.mdc centralizes lint/format and conventions so agents and contributors stay consistent.

## Files touched

- `USER.md.example` (new), `USER.md` in .gitignore
- `.cursor/build/MEMORY.md`, `.cursor/build/entries/*.md`
- `.cursor/rules/dev.mdc`
