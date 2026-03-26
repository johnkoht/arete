# PRD: Goals Refactor (Phase 2)

## Overview

**Problem**: Goals are stored in a single `goals/quarter.md` file with inconsistent formats. Users want individual goal files with frontmatter for better tracking, status management, and flexibility.

**Solution**: Migrate to individual goal files with frontmatter. Update parser, backend, context service, and all 6 skills that reference goals.

**Success Criteria**:
1. Individual goal files created via `arete update` migration
2. All 6 skills read/write new format
3. Web UI works unchanged (same API response shape)
4. Backward compatible for unmigrated workspaces

---

## Out of Scope

- Parser caching (defer to Phase 3)
- Dynamic context service configuration
- Automated tests for web UI components
- Goal completion workflow (beyond status field)

---

## Tasks

### Task 0: Create Migration Script
**Description**: Add migration to `arete update` that converts `quarter.md` → individual goal files.

**Acceptance Criteria**:
1. Migration detects all 3 legacy formats: `## Goal N: Title`, `### [Qn-N] Title`, `### Qn-N Title`
2. Creates individual files: `goals/2026-Q1-1-title-slug.md` with frontmatter
3. Frontmatter includes: `id`, `title`, `status: active`, `quarter`, `type: outcome`, `orgAlignment`, `successCriteria`
4. Renames `quarter.md` to `.quarter.md.backup`
5. Outputs: "Migrated N goals to individual files. Backup saved to .quarter.md.backup"
6. Idempotent: If individual files exist, skips migration
7. Test: Migration fixture for each format variant

**Files**: `packages/cli/src/commands/update.ts`, `packages/core/src/services/goal-migration.ts`

---

### Task 1a: Add Goal Type
**Description**: Add `Goal` type to entities.ts for individual goal files.

**Acceptance Criteria**:
1. `Goal` type in `packages/core/src/models/entities.ts`
2. Fields: `id: string`, `slug: string`, `title: string`, `status: 'active' | 'complete' | 'deferred'`, `quarter: string`, `type: 'outcome' | 'milestone'`, `orgAlignment: string`, `successCriteria: string`, `filePath: string`
3. Exported via `packages/core/src/models/index.ts`
4. Type tests or usage in parser

**Files**: `packages/core/src/models/entities.ts`, `packages/core/src/models/index.ts`

---

### Task 1b: Create Goal Parser Service
**Description**: Create goal parser that reads individual files and falls back to legacy format.

**Acceptance Criteria**:
1. Create `packages/core/src/services/goal-parser.ts`
2. `parseGoals(goalsDir: string, storage: StorageAdapter): Promise<Goal[]>` — main entry
3. `parseIndividualGoals()`: Glob `goals/*.md` (excluding `strategy.md`), parse frontmatter
4. `parseLegacyQuarterFile()`: Handle all 3 legacy formats, return `Goal[]`
5. Fallback: If no individual files, try legacy format
6. Unit tests for: new format, each legacy format, empty dir, malformed files
7. Export via `packages/core/src/services/index.ts`

**Files**: `packages/core/src/services/goal-parser.ts`, `packages/core/src/services/index.ts`, `packages/core/test/services/goal-parser.test.ts`

---

### Task 2: Update Backend Goals Route
**Description**: Use goal-parser service and maintain API response shape.

**Acceptance Criteria**:
1. Import `parseGoals` from `@arete/core`
2. Replace inline `parseQuarterOutcomes` with service call
3. `/api/goals/quarter` returns exact same shape: `{ outcomes: QuarterOutcome[], quarter: string, found: boolean }`
4. Add `/api/goals/list` endpoint returning `Goal[]` with full metadata
5. Fix existing test failures (format mismatch documented in LEARNINGS.md)
6. Add integration test with real filesystem (temp dir)
7. Test: Response shape assertion for backward compat

**Files**: `packages/apps/backend/src/routes/goals.ts`, `packages/apps/backend/test/routes/goals.test.ts`

---

### Task 2.5: Update CLI Seed
**Description**: Scaffold new goal structure for new workspaces.

**Acceptance Criteria**:
1. Modify `packages/cli/src/commands/seed.ts`
2. Create individual goal files instead of `quarter.md`
3. Example goal: `goals/2026-Q1-1-example-outcome.md` with frontmatter
4. If `quarter.md` exists, don't overwrite (backward compat)
5. Seed fixture updated

**Files**: `packages/cli/src/commands/seed.ts`, seed fixtures

---

### Task 3: Update Context Service
**Description**: Include individual goal files in context injection.

**Acceptance Criteria**:
1. Modify `packages/core/src/services/context.ts`
2. Glob `goals/*.md` for goal files (excluding `strategy.md`)
3. Fallback: Include `goals/quarter.md` if no individual files found
4. Category: `goals` for all goal files
5. Test: "Only quarter.md exists" scenario
6. Test: "Individual files only" scenario
7. Test: "Mixed format" scenario

**Files**: `packages/core/src/services/context.ts`, `packages/core/test/services/context.test.ts`

---

### Task 4: Update Quarter-Plan Skill
**Description**: Write individual goal files instead of single quarter.md.

**Acceptance Criteria**:
1. Modify `packages/runtime/skills/quarter-plan/SKILL.md`
2. Step 3 writes individual files: `goals/YYYY-Qn-N-title-slug.md`
3. Frontmatter structure matches `Goal` type
4. Update template for individual file format
5. Remove `quarter.md` writing (migration creates it)
6. Document: "Individual files created for each outcome"

**Files**: `packages/runtime/skills/quarter-plan/SKILL.md`, `packages/runtime/skills/quarter-plan/templates/`

---

### Task 5: Update Goals-Alignment Skill
**Description**: Read individual goal files for alignment view.

**Acceptance Criteria**:
1. Modify `packages/runtime/skills/goals-alignment/SKILL.md`
2. Step 1 reads individual files: `goals/*.md` (excluding strategy.md)
3. Build alignment from frontmatter `orgAlignment` field
4. Maintain same output format (alignment table)
5. Graceful fallback: If no individual files, read `quarter.md`

**Files**: `packages/runtime/skills/goals-alignment/SKILL.md`

---

### Task 6: Update Week-Plan and Daily-Plan Skills
**Description**: Read goals from individual files for context.

**Acceptance Criteria**:
1. Modify `packages/runtime/skills/week-plan/SKILL.md`
2. Modify `packages/runtime/skills/daily-plan/SKILL.md`
3. Step 1 reads individual goal files: `goals/*.md`
4. Link priorities to goal slugs (e.g., `Advances: Q1-2`)
5. Graceful fallback: If no individual files, read `quarter.md`
6. Update references section

**Files**: `packages/runtime/skills/week-plan/SKILL.md`, `packages/runtime/skills/daily-plan/SKILL.md`

---

### Task 7: Update Week-Review and Prepare-Meeting-Agenda Skills
**Description**: Read goals from individual files.

**Acceptance Criteria**:
1. Modify `packages/runtime/skills/week-review/SKILL.md`
2. Modify `packages/runtime/skills/prepare-meeting-agenda/SKILL.md`
3. Read individual goal files for context
4. Graceful fallback to `quarter.md`
5. Update references section

**Files**: `packages/runtime/skills/week-review/SKILL.md`, `packages/runtime/skills/prepare-meeting-agenda/SKILL.md`

---

### Task 8: Migration Guide and Changelog
**Description**: Document the migration for users.

**Acceptance Criteria**:
1. Update `arete update` output to show migration status
2. Add migration instructions to user workspace (if applicable)
3. Update AGENTS.md if skill triggers change
4. Add memory entry for goals refactor

**Files**: `AGENTS.md`, memory entry

---

## Pre-Mortem Summary

| Risk | Mitigation |
|------|------------|
| Format detection failure | All 3 formats + tests + dry-run |
| Context regression | Fallback + tests |
| API shape change | Exact shape + integration test |
| Skill inconsistency | Ship all 6 together |
| CLI seed mismatch | Update seed in Task 2.5 |

---

## Metadata

- **Created**: 2026-03-17
- **Size**: Medium (10 tasks)
- **Risk**: Medium
- **Dependencies**: None
- **Branch**: `feature/goals-refactor`
