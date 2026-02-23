# PRD Archive + Plan Lifecycle Migration

**Date**: 2026-02-16
**Scope**: Build workspace planning artifacts

## Summary

Migrated legacy PRD tracking into the plan lifecycle system and archived old PRD docs.

### Changes made

- Created plan records under `dev/plans/{slug}/plan.md` for all legacy PRD folders.
- Applied confirmed statuses:
  - `completed` for completed initiatives
  - `planned` for `temporal-memory`
  - `on-hold` for `product-os`
- Archived legacy PRD docs:
  - `dev/prds/` → `dev/archive/prds/`
  - Added pointer file at `dev/prds/README.md` to avoid broken expectations.
- Updated migrated plan references from `dev/prds/...` to `dev/archive/prds/...`.
- Added follow-up cleanup task in `scratchpad.md`:
  - "Review and remove legacy PRD archive"

## Why

The new plan lifecycle is now the active system of record. Archiving preserves history while reducing ambiguity about where current status should be managed.

## Follow-up

- Run a repo-wide reference audit for `dev/prds/` and `dev/archive/prds/`.
- Remove `dev/archive/prds/` only after docs/prompts are fully migrated.

## Learnings

- When replacing a system-of-record path, preserve compatibility with a lightweight pointer (`README`) to reduce transition friction.
- After structural migrations, memory entry capture should happen in the same session as the change to avoid losing rationale and follow-up context.
