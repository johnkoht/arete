# Phase 2: Goals Refactor — Refined Plan

## Problem Statement

Goals are stored in a single `goals/quarter.md` file with inconsistent formats (parser expects `## Goal N:`, template uses `### [Qn-1]`). Users want individual goal files with frontmatter for better tracking and flexibility.

## Key Decisions from Reviews

1. **Force migration** — No dual-format support in new code. Migration converts old → new.
2. **Migration first** — Task 0 creates individual files before parser/backend/skills are updated.
3. **Fallback reading** — Parser reads both formats for graceful degradation during transition.
4. **New format writing** — All skills write new format only.
5. **Rename quarter.md** — Rename to `.quarter.md.backup` after migration, not delete.
6. **Context service** — Simple glob addition, not dynamic config system.
7. **All 6 skills** — quarter-plan, week-plan, daily-plan, week-review, goals-alignment, prepare-meeting-agenda.

## Refined Task Breakdown

### Phase 2A: Migration + Core (Tasks 0-3)

**Task 0: Create Migration Script**
- Add to `arete update` workflow
- Detect all 3 known formats: `## Goal N:`, `### [Qn-N]`, `### Qn-N`
- Output: Individual files in `goals/` with frontmatter + `.quarter.md.backup`
- Test: Migration fixture → verify individual files created

**Task 1a: Add Goal Type**
- Add `Goal` type to `entities.ts`
- Fields: `id`, `slug`, `title`, `successCriteria`, `orgAlignment`, `status`, `quarter`, `type`, `filePath`
- Export via models/index.ts

**Task 1b: Create Goal Parser Service**
- Create `packages/core/src/services/goal-parser.ts`
- `parseGoals(goalsDir, storage)`: Try individual files first, fallback to legacy
- `parseIndividualGoals()`: Read `goals/*.md` with frontmatter
- `parseLegacyQuarterFile()`: Handle all 3 legacy formats
- Export via services/index.ts

**Task 2: Update Backend Goals Route**
- Use goal-parser service instead of inline `parseQuarterOutcomes`
- Keep same response shape for `/api/goals/quarter`
- Add `/api/goals/list` returning full Goal[] with metadata
- Fix existing test failures documented in LEARNINGS.md
- Add integration test with real filesystem

**Task 2.5: Update CLI Seed**
- Modify `packages/cli/src/commands/seed.ts`
- Scaffold individual goal files instead of single `quarter.md`
- Maintain backward compat: if `quarter.md` exists, don't overwrite

**Task 3: Update Context Service**
- Add glob pattern `goals/*.md` (excluding strategy.md if needed)
- Keep `goals/quarter.md` in fallback for unmigrated workspaces
- Simple implementation, no dynamic config

### Phase 2B: Skill Updates (Tasks 4-7)

**Task 4: Update Quarter-Plan Skill**
- Write individual goal files with frontmatter
- Update template for new format
- Remove `quarter.md` writing (migration handles existing)

**Task 5: Update Goals-Alignment Skill**
- Read individual goal files
- Build alignment from frontmatter `orgAlignment`
- Maintain same output format

**Task 6: Update Week-Plan and Daily-Plan Skills**
- Read goals from individual files
- Link priorities to goal slugs
- Update context gathering section

**Task 7: Update Week-Review and Prepare-Meeting-Agenda Skills**
- Read goals from individual files
- Update references and context sections

### Phase 2C: Docs (Task 8)

**Task 8: Migration Guide and Changelog**
- Add migration instructions to `arete update` output
- Update AGENTS.md [Skills] section if triggers change
- Add changelog entry for workspace update

---

## Size: Medium (10 tasks, but several are small)
## Risk: Medium (touches core data model, multiple skills, backward compat)

## Pre-Mortem Flags

1. **Context service regression** — Glob change could break context for existing workspaces
2. **Skill reading inconsistency** — If some skills updated and others not, goals appear inconsistent
3. **Migration format detection** — All 3 legacy formats must be handled
4. **Backend response shape** — Must maintain exact shape for web UI
5. **CLI seed race** — New workspace scaffold must match parser expectations
