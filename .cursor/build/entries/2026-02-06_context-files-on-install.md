# Context files created on install

**Date**: 2026-02-06

## Summary

`arete install` (and `arete update`) now create the **context** files by default with placeholder content. Previously only the `context/` directory was created; new workspaces had an empty context, which didn’t match SETUP.md or the skills that reference `context/goals-strategy.md`, etc.

## What was done

- **DEFAULT_FILES** in `src/core/workspace-structure.ts`: Added seven context entries (only created when missing; never overwrite):
  - `context/README.md` — Short intro and list of context files
  - `context/business-overview.md`
  - `context/users-personas.md`
  - `context/products-services.md`
  - `context/business-model.md`
  - `context/goals-strategy.md`
  - `context/competitive-landscape.md`
- Placeholder content matches the template structure already in the repo’s `context/` (purpose block, section headings, `[placeholder]` prompts).
- **Tests**: `workspace-structure.test.ts` — DEFAULT_FILES includes all context paths; ensureWorkspaceStructure creates context files with expected content.

## Learning

When we document a **canonical set of user-facing files** (e.g. in SETUP.md, README, or skills that reference paths like `context/goals-strategy.md`), those files should be created by install/update with placeholder content. Otherwise new users get an empty structure and a mismatch between docs and first-run experience. When adding new “canonical” files in the future, add them to `workspace-structure.ts` DEFAULT_FILES so install and update backfill them.
