# Workflow Stability PRD Learnings

**Date**: 2026-03-27  
**PRD**: `dev/work/plans/workflow-stability/prd.md`  
**Branch**: `feature/workflow-stability`  

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 8/8 complete |
| First-attempt success | 100% |
| Iterations | 0 |
| Tests added | 99+ extension tests |
| Pre-mortem risks | 0/8 materialized |
| Token usage | ~120K total (orchestrator ~40K + subagents ~80K) |

## Deliverables

### New Commands
1. `/plan list` — Enhanced with filters (`--work`, `--backlog`, `--complete`, `--building`, `--planned`, `--archive`, `--all`), status grouping, footer notifications
2. `/plan promote <slug>` — Promotes backlog items to draft plans with proper frontmatter
3. `/release status|patch|minor [--dry-run]` — Semantic versioning with CHANGELOG and git tags
4. `/build <slug>` and `/ship <slug>` — Work without plan mode active

### New Modules
1. `.pi/extensions/plan-mode/release.ts` — Versioning utilities (36 tests)
2. `.pi/agents/gitboss.md` — Git gatekeeper agent for merge and version decisions
3. `scripts/migrate-ideas-to-backlog.ts` — Migration script with dry-run mode

### Lifecycle Improvements
- **Build gates**: `/build` and `/ship` reject idea/draft status
- **Auto-transition**: Status automatically updates (planned → building → complete)
- **Archive paths**: `dev/work/archive/YYYY-MM/{slug}/` with conflict handling

## Pre-Mortem Analysis

| Risk | Mitigated | Effective |
|------|-----------|-----------|
| Plan-mode state complexity | Yes | Yes — LEARNINGS.md in all prompts |
| Migration disrupts active work | Yes | Yes — dry-run mode |
| Ship skill integration breaks | Yes | Yes — hooks not inline changes |
| Gitboss scope creep | Yes | Yes — explicit Out of Scope section |
| /release conflicts with git state | Yes | Yes — pre-flight checks |
| Archive path conflicts | Yes | Yes — counter suffix (-2, -3) |
| Test coverage gaps | Yes | Yes — 399 extension tests |
| Backlog format inconsistency | Yes | Yes — simple format defined |

## What Worked Well

1. **Pre-mortem mitigations** — All 8 risks prevented. Especially effective: explicit file read lists, dry-run modes, explicit scope boundaries.

2. **Test coverage discipline** — Each task added tests before completion. Extension test count grew from ~300 to 399.

3. **Existing patterns in commands.ts** — `createTestPlanWithStatus()`, `loadPlan()` verification pattern, command handler structure all reused across tasks.

4. **LEARNINGS.md injection** — Every developer prompt included "read LEARNINGS.md first" which prevented state management bugs.

5. **Structured return types** — `preparePlanListItems()` returning `{ items, backlogCount }` pattern documented in LEARNINGS.md.

## What Could Improve

1. **Test inheritance from previous attempts** — Tests from Task 1-2 partial work needed fixing before Task 3. Future: run full test suite before resuming interrupted PRDs.

2. **Documentation updates not atomically committed** — PLAN-FORMAT.md updated separately from code changes. Consider adding doc updates to each task's AC.

## Recommendations

### Continue
- Pre-mortem with explicit mitigations in subagent prompts
- "Read LEARNINGS.md first" in all prompts
- Test-first task completion (tests in each task, not end)
- Status grouping/filtering pattern for list displays

### Stop
- Assuming partial PRD state is clean — verify tests before resuming

### Start
- Include PLAN-FORMAT.md updates in relevant task ACs
- Run `npx tsx --test` BEFORE dispatching first task (catches inherited failures)

## Refactor Items

None identified — all tasks completed cleanly.

## Documentation Updates

- `.pi/extensions/plan-mode/LEARNINGS.md` — Updated Key References with release.ts, backlog functions
- `.pi/extensions/plan-mode/PLAN-FORMAT.md` — Updated Commands Reference with new commands and filters
- `.pi/agents/gitboss.md` — Created (new agent)

## Files Changed

- `.pi/extensions/plan-mode/commands.ts` — handleBuild, handleShip, handleRelease, handlePromote, filters
- `.pi/extensions/plan-mode/persistence.ts` — archivePlan, listBacklogItems, promoteBacklogItem
- `.pi/extensions/plan-mode/release.ts` — new module
- `.pi/extensions/plan-mode/index.ts` — command registration
- `.pi/extensions/plan-mode/*.test.ts` — 99+ new tests
- `.pi/agents/gitboss.md` — new agent
- `.pi/skills/ship/SKILL.md` — Phase 5.6 references gitboss
- `scripts/migrate-ideas-to-backlog.ts` — migration script

## Learnings

- **Conventional commit categorization** works well for CHANGELOG generation (feat→Added, fix→Fixed, refactor→Changed)
- **YYYY-MM archive paths** with conflict handling is a clean pattern for historical organization
- **Pre-flight checks** pattern (`{ ok, errors }`) allows dry-run without blocking
- **Explicit Out of Scope sections** in agent definitions prevent scope creep effectively
