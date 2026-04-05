# Update Area Template Structure

**Date**: 2026-04-04
**Type**: Refactor
**Scope**: packages/core, packages/cli, packages/runtime

## Summary

Migrated area file sections from old structure (`Current State`, `Key Decisions`, `Active Goals`, `Active Work`, `Open Commitments`) to new structure (`Goal`, `Focus`, `Horizon`, `Projects`, `Stakeholders`, `Backlog`, `Notes`). The new structure better reflects how areas are actually used — linking goals, tracking current priorities, and maintaining stakeholder context.

## What Changed

### Type & Logic (4 files)
- `AreaSections` type in `entities.ts` — 5 old fields replaced with 5 new fields (`goal`, `focus`, `horizon`, `projects`, `stakeholders`); `backlog` and `notes` unchanged
- `area-parser.ts` — section extraction updated; `suggestAreaForMeeting()` keyword matching uses `focus` (was `currentState`)
- `workspace-structure.ts` — area template updated with new sections including markdown tables for Projects and Stakeholders
- `meeting-extraction.ts` — extraction prompt uses `**Focus**` and `**Area Goals**` (was `**Current State**` and `**Recent Area Decisions**`)

### Tests (6 files)
- `area-parser.test.ts`, `area-memory.test.ts`, `meeting-extraction.test.ts`, `meeting-context.test.ts`, `workspace.test.ts`, `create.test.ts` — all fixtures and assertions updated

### Documentation (6 files)
- `GUIDE.md`, `PATTERNS.md`, `meeting-prep/SKILL.md`, `process-meetings/SKILL.md`, `week-plan/SKILL.md`, `UPDATES.md`

## Results

- 2635 tests pass (core + CLI), 0 failures
- Core package typechecks clean
- Also fixed pre-existing type errors in 3 test files (untyped arrays, missing `rawItems`/`updates`/`listSubdirectories`/`getModified` properties)

## Learnings

- **Section renames propagate widely**: Changing area section names touched 16 files across core types, services, tests, CLI tests, and runtime docs. The `AreaSections` type is the single source of truth — grep for the old field names after changing it to find all consumers.
- **Pre-existing type drift in tests**: Test files had accumulated type errors from incremental type changes (`rawItems` added to `MeetingExtractionResult`, `updates` added to `SourcePaths`, `listSubdirectories`/`getModified` added to `StorageAdapter`). Tests still passed at runtime because TypeScript strict checking wasn't enforced during test execution. Worth periodically running `tsc --noEmit` on the full project to catch drift.
