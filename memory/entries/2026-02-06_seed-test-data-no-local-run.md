# Seed test-data: do not run in arete repo

**Date**: 2026-02-06

## Context

The `arete seed test-data` command copies fixture data into the current workspace. The arete development repo is both the CLI package source and an Areté workspace, so running seed there writes test fixtures into `people/`, `resources/meetings/`, `projects/active/`, `memory/items/`, `context/`, etc.

## Agent instructions

When working on testing or seed functionality:

1. **Do not run** `arete seed test-data` when the workspace root is the arete repo (contains `test-data/`, `src/commands/seed-test-data.ts`, etc.).
2. **Remind the user** not to run seed test-data locally in the arete repo; they should use a separate Areté-enabled project.
3. **After completing a task**, check if seed data was accidentally generated:
   - `people/internal/jane-doe.md`, `alex-eng.md`
   - `people/customers/bob-buyer.md`, `carol-champion.md`
   - `resources/meetings/2026-*.md` (fixture meetings)
   - `resources/plans/quarter-2026-Q1.md`, `week-2026-W06.md`
   - `projects/active/onboarding-discovery/`
   - `TEST-SCENARIOS.md` at workspace root
   
   If found, ask the user: "Seed test data appears to have been generated in this workspace. Should I remove it?"

## References

- `test-data/` — source fixtures (never modified by seed)
- `memory/items/learnings.md` — learning entry
- `.cursor/rules/testing.mdc` — testing rule with seed guidance
