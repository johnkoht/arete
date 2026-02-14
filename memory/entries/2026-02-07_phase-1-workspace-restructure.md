# Phase 1: Workspace Restructure (Product OS)

**Date**: 2026-02-07
**Branch**: `feature/product-os-architecture`

## What changed

Implemented Phase 1 of the Product OS vision: workspace restructure per `.cursor/build/prds/product-os/vision.md`.

## Changes

### 1. now/ folder
- New top-level `now/` with `scratchpad.md`, `week.md`, `today.md`
- Replaces root `scratchpad.md` and `resources/plans/week-*.md`
- Single `now/week.md` and `now/today.md` instead of dated filenames

### 2. goals/ folder
- New top-level `goals/` with `strategy.md`, `quarter.md`, `initiatives.md`
- Migrated from `context/goals-strategy.md` → `goals/strategy.md`
- Migrated from `resources/plans/quarter-*.md` → `goals/quarter.md`
- Week priorities now in `now/week.md` (was `resources/plans/week-*.md`)
- `goals/archive/` for alignment snapshots (was `resources/plans/archive/`)

### 3. .arete/memory/
- Moved `memory/items/` and `memory/summaries/` to `.arete/memory/items/` and `.arete/memory/summaries/`
- Moved `memory/activity-log.md` to `.arete/activity/activity-log.md`
- Added `.arete/config/` for future workspace configuration

### 4. Migration
- `migrateLegacyWorkspaceStructure()` in workspace-structure.ts
- `arete update` runs migration before backfill: copies from old locations to new; never overwrites
- Old files preserved; user can delete manually after verifying

### 5. Path updates
- workspace.ts: `paths.memory` → `.arete/memory`, added `paths.now`, `paths.goals`
- isAreteWorkspace: accepts `.arete/memory` OR legacy `memory/`
- All skills, rules, AGENTS.md, SETUP.md, pm-workspace.mdc, agent-memory.mdc updated
- seed-test-data: copies plans to goals/ and now/; context/goals-strategy → goals/strategy.md

## Files touched

- `src/core/workspace-structure.ts` — WORKSPACE_DIRS, DEFAULT_FILES, migrateLegacyWorkspaceStructure
- `src/core/workspace.ts` — isAreteWorkspace, getWorkspacePaths
- `src/types.ts` — WorkspacePaths (now, goals)
- `src/commands/update.ts` — call migration before ensureWorkspaceStructure
- `src/commands/seed-test-data.ts` — new destination paths
- `src/commands/seed.ts` — pending-review path
- Skills: process-meetings, daily-plan, week-plan, week-review, quarter-plan, goals-alignment, sync, workspace-tour, finalize-project, construct-roadmap, discovery, create-prd
- Rules: pm-workspace.mdc, agent-memory.mdc, arete-context.mdc
- AGENTS.md, SETUP.md, test-data/*

## Rationale

Per vision: "Where do I start my day?" needs a one-word answer (`now/`). Goals elevated to top-level because referenced constantly. Memory in `.arete/` as system-managed, consumed via intelligence layer.
