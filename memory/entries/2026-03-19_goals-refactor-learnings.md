# Goals Refactor — Learnings

**PRD**: `dev/work/plans/goals-refactor/prd.md`
**Executed**: 2026-03-17 to 2026-03-19
**Duration**: ~3 hours

## Overview

Migrated goals from single `quarter.md` file to individual goal files with frontmatter. Updated parser, backend, context service, and 6 skills. Added migration to `arete update` for automatic conversion.

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 10/10 complete |
| First-Attempt Success | 100% (all tasks approved on first review) |
| Iterations | 0 (no rework required) |
| Tests Added | 61+ (22 migration, 36 parser, 3 context) |
| Files Changed | 15+ (core, backend, cli, 6 skills) |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Format detection failure | No | Yes (all 3 formats + tests) | Yes |
| Context regression | No | Yes (fallback + tests) | Yes |
| API shape change | No | Yes (exact shape + integration test) | Yes |
| Skill inconsistency | No | Yes (ship all 6 together) | Yes |
| CLI seed mismatch | No | Yes (update seed in Task 2.5) | Yes |
| Frontmatter schema not documented | No | Yes (added to skills) | Yes |
| Performance degradation | Deferred | Defer caching to Phase 3 | N/A |
| Migration backup not discoverable | No | Yes (output message) | Yes |

**Surprises** (not in pre-mortem):
- None — pre-mortem covered all scenarios encountered

## What Worked Well

1. **Task sequencing**: Foundation tasks (migration, type, parser) before consumers (backend, skills) prevented blocking dependencies
2. **Fallback-first design**: Every consumer falls back to `quarter.md`, ensuring backward compatibility for unmigrated workspaces
3. **Idempotent migration**: Running `arete update` multiple times is safe — migration skips if individual files exist
4. **Shared parser service**: All consumers use `parseGoals()` from core, eliminating duplicate parsing logic
5. **Frontmatter standardization**: `Goal` type with explicit fields (`id`, `status`, `quarter`, `orgAlignment`, `successCriteria`) enables future features (goal completion, filtering)

## What Didn't Work

1. **Initial format detection scope**: Originally only tested Format A (`## Goal N:`); reviewer caught Format B (`### Qn-N`) during pre-mortem — required explicit AC for all formats
2. **Skills bundled into single tasks**: Task 6 and Task 7 each covered 2 skills — could have been split for clearer commits

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Individual files over sections | Enables independent status tracking, better git history, flexible ordering |
| Backup as `.quarter.md.backup` | Hidden file won't clutter workspace, easy to find if needed |
| Frontmatter schema | Match `Goal` type exactly for type safety between parser and consumers |
| Exclude `strategy.md` from glob | Strategy file is organizational context, not a goal file |
| Defer caching | Parser performance acceptable for MVP; cache adds complexity |

## Architecture Changes

**Before**:
```
goals/
  quarter.md     # All goals in sections
  strategy.md    # Org strategy
```

**After**:
```
goals/
  2026-Q1-1-title-slug.md    # Individual goal with frontmatter
  2026-Q1-2-another-goal.md  # Each goal is a file
  strategy.md                # Unchanged
  .quarter.md.backup         # Backup of migrated file
```

**Frontmatter schema**:
```yaml
---
id: "Q1-1"
title: "Goal Title"
status: active | complete | deferred
quarter: "2026-Q1"
type: outcome | milestone
orgAlignment: "Company OKR reference"
successCriteria: "Measurable criteria"
---
```

## Components Touched

- `packages/core/src/services/goal-migration.ts` — New migration service
- `packages/core/src/services/goal-parser.ts` — New parser service
- `packages/core/src/models/entities.ts` — `Goal` type
- `packages/core/src/services/context.ts` — Glob individual files
- `packages/apps/backend/src/routes/goals.ts` — Use parser, add `/list` endpoint
- `packages/cli/src/commands/update.ts` — Run migration
- `packages/cli/src/commands/seed.ts` — Scaffold new format
- 6 skills: quarter-plan, goals-alignment, week-plan, daily-plan, week-review, prepare-meeting-agenda

## Recommendations

**Continue** (patterns to repeat):
1. Foundation tasks before consumers (prevents blocking)
2. Fallback-first design for file format migrations
3. Idempotent migrations with clear skip conditions
4. Shared services in core for cross-package parsing

**Stop** (patterns to avoid):
1. Bundling multiple skills in single tasks (harder to review)

**Start** (new practices to adopt):
1. For file format migrations, explicitly enumerate ALL legacy formats in AC
2. Consider `/api/.../list` endpoint pattern for new entity types

## Deferred Work

- **Parser caching**: Add caching layer when performance becomes an issue (Phase 3)
- **Goal completion workflow**: Status field exists; workflow for completing goals TBD

---

## Summary

Clean execution of a medium-sized migration. The fallback-first design ensured zero breaking changes for existing workspaces while providing a better structure for new ones. All 10 tasks completed with 0 iterations, validating the pre-mortem coverage and task sequencing.
