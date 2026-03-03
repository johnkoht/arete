# 2026-03-02: Skill Integration Hooks Learnings

PRD execution for skill integration hooks — behavioral context injection system that makes community skill outputs visible to Areté's intelligence layer.

## Metrics

- **Tasks**: 11/11 complete
- **Success rate**: 91% first-attempt (1 iterate cycle on task-3 — test update missed)
- **Iterations**: 1 (task-3: developer removed registry validation but didn't update corresponding test)
- **Tests added**: 67+ new tests (9 schema, 35 pure functions, 13 wiring, 10 CLI)
- **Commits**: 8 (6 feat, 1 docs, 1 fix)
- **Files changed**: 23 files, +1686/-22 lines

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| R1: SKILL.md mutation | No | Yes (sentinel markers) | Yes |
| R2: Migration drift | No | Yes (catalog + comparison) | Yes |
| R3: Template resolution | No | Yes (filesystem probe confirmed) | Yes |
| R4: Backward compat | No | Yes (optional fields + tests) | Yes |
| R5: Scope creep | No | Yes (schema validated first) | Yes |
| R6: Update path | No | Yes (wired day one) | Yes |
| R7: Path references | No | Yes (workspace-relative) | Yes |
| R8: Test coverage | No | Yes (67+ tests) | Yes |
| R9: Agent compliance | Deferred | Manual gate pending | N/A |

0/8 actionable risks materialized. R9 (agent compliance) is a manual validation gate — builder should test with a real community skill + agent conversation before considering the migration complete.

## What Worked Well

1. **Phase 0 pre-work validation**: Writing all 9 integration profiles on paper before coding caught 3 minor expressiveness gaps and confirmed no schema expansion was needed. Zero wasted code.
2. **Pure functions in utils/integration.ts**: Keeping generate/inject/derive as standalone utils (not on SkillService) avoided the WorkspaceService→SkillService dependency issue. Clean, testable, reusable.
3. **Sentinel markers for idempotency**: `<!-- ARETE_INTEGRATION_START/END -->` made the injection bullet-proof across install, update, and reinstall scenarios.
4. **Reviewer pre-work sanity check on task-2b**: Caught three underspecified behaviors (merge semantics, overwrite semantics, loop conditionality) before the developer started.

## What Didn't Work

1. **Task-3 test regression**: Developer removed registry validation (correct behavior change) but didn't update the test that expected the old behavior. Caught in review → 1 iterate cycle. Lesson: when changing behavior, AC should explicitly say "update existing tests that assert the old behavior."
2. **Task-7 token limit**: Developer response cut off on the 9-skill migration. Had to re-dispatch. For large batch tasks, consider splitting into smaller batches (3 skills each) or providing more concise prompts.

## Subagent Insights

- Developers reported LEARNINGS.md was consistently useful (StorageAdapter patterns, path conventions)
- The `merged = { ...fm, ...sidecar }` existing pattern made integration reading trivial — developer explicitly noted this
- Prompts with verbatim type definitions and exact function signatures got highest quality first-attempt results
- Reviewer pre-work checks caught real issues (3 blockers on task-2b) — worth the overhead for complex tasks

## Recommendations for Next PRD

1. **AC for behavior changes**: When a task changes existing behavior, add AC: "Update existing tests that assert the old behavior"
2. **Batch task sizing**: Tasks touching 5+ files should either provide more concise prompts or be split into batches
3. **Keep pure-function-first pattern**: Extracting logic as standalone utils before wiring into services worked extremely well for testability and service boundary management

## Validation Gate (R9): PASSED

Manually tested with two skills in a fresh workspace (`/tmp/arete-integration-test`):

| Signal | Breadboarding (community) | Competitive Analysis (native) |
|--------|--------------------------|-------------------------------|
| Correct save location | ✅ `resources/breadboards/user-onboarding-flow.md` | ✅ `projects/active/meeting-intelligence-competitive-analysis/` |
| Used template | N/A (resource) | ✅ analysis template with `working/competitor-profiles/` |
| Attempted `arete index` | ✅ (sandbox blocked) | ✅ (export cut off but project created) |
| Integration section followed | ✅ | ✅ |

**Observation**: Skill router failed on both prompts (returned `onboarding` and `daily-plan`) — agents self-corrected. Router is a separate issue, not related to integration hooks.

## Learnings

- **Root-level skill file deployment was a pre-existing bug**: Both `create()` and `syncCoreSkills()` used `listSubdirectories()` which only copied skill folders, not root-level `.md` files like PATTERNS.md and README.md. Fixed as part of this PRD. If you discover infrastructure bugs during feature work, fix them in the same PR when they're small and related.
- **Schema validation before coding is high-ROI**: 1 hour of pre-work (writing YAML profiles for all 9 skills) prevented potential days of schema redesign mid-implementation.
- **Skill router needs attention**: Both test prompts were misrouted. The integration hooks work regardless because agents read SKILL.md directly, but router quality affects first-touch experience.
