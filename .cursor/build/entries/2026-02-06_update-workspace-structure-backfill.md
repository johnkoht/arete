# Update workspace structure backfill

**Date**: 2026-02-06

## Summary

`arete update` now ensures existing workspaces get any **missing** workspace directories and default files. This makes rolling out new features (e.g. `people/`) sustainable: users who already have a workspace get the new structure when they run `arete update`, without re-running install or manual steps.

## What was done

- **Single source of truth**: Added `src/core/workspace-structure.ts` exporting `WORKSPACE_DIRS`, `DEFAULT_FILES`, and `ensureWorkspaceStructure(workspaceRoot, options?)`. Install and update both use this; new features add dirs/files here only once.
- **ensureWorkspaceStructure**: Creates any missing dirs and default files; never overwrites existing files. Optional `dryRun: true` for `arete update --check` (report only).
- **Install**: Refactored to import `WORKSPACE_DIRS` and `DEFAULT_FILES` from `workspace-structure.js` (no duplication).
- **Update**: Runs `ensureWorkspaceStructure(workspaceRoot, { dryRun: check })` at start; reports and (when not `--check`) creates missing structure; summary includes "Structure (new dirs/files)" when anything was added.
- **Tests**: `test/core/workspace-structure.test.ts` for WORKSPACE_DIRS, DEFAULT_FILES, ensureWorkspaceStructure (create, no overwrite, dryRun, idempotent).

## Usage

- **New workspace**: `arete install` — unchanged; still creates full structure.
- **Existing workspace**: `arete update` — syncs skills/rules as before, and adds any missing dirs/default files (e.g. `people/`, `people/index.md`). Existing files are never overwritten.
- **Check only**: `arete update --check` — reports what would be added (structure + skills/rules) without creating; structure uses dryRun.
