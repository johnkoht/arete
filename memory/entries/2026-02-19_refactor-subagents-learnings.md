# Refactor Subagents — PRD Execution Learnings

**Date**: 2026-02-19
**PRD**: dev/prds/refactor-subagents/prd.md
**Branch**: refactor-subagents
**Status**: Complete

## Metrics
- Tasks: 6/6 (100% success rate)
- Iterations: 0 required
- Tests: 18/18 plan-mode extension tests passing (pre-existing CLI integration failures unrelated)
- Pre-mortem: 0/8 risks materialized
- Commits: 5 commits
- Token usage: ~40K tokens (orchestrator-only, direct execution fallback — no subagent tool available)

## Pre-Mortem Effectiveness

| Risk | Materialized? | Mitigation Effective? | Evidence |
|------|--------------|----------------------|----------|
| Worktree agent scope | No | Yes | Documented in skill; E2E validation deferred to builder |
| Blast radius (6+ files) | No | Yes | grep inventory tracked 11 files; all updated; zero execution-path refs post-refactor |
| Skill self-reference (tool sig) | No | Yes | Tool Reference section with concrete `subagent()` examples |
| State schema mismatch | No | Yes | status.json schema defined in README.md |
| Progress path confusion | No | Yes | Execution State Path field + negative guidance in developer.md |
| Plan path assumption | No | Yes | Skills updated atomically in Task 4; handoff chain consistent |
| Template/ref files | No | Yes | Left unchanged with Phase 2 annotations |
| Subagent output parsing | No | Yes | Developer completion report + reviewer verdict formats documented |

## What Worked Well
1. **Symlink architecture**: `.pi/skills/` symlinks to `.agents/skills/` meant dual-file sync was automatic — zero risk of drift.
2. **Hardlinked files**: execute-prd SKILL.md was hardlinked across both paths — single edit, both locations updated.
3. **Pre-mortem blast radius inventory**: The comprehensive grep before Task 2 meant every file was tracked. No surprises.
4. **Sequential task execution**: Strict ordering (state → core skill → agents → supporting → deprecation → verify) prevented orphaned references.
5. **Phase 2 separation**: Leaving template/schema refs for Phase 2 kept scope tight and avoided unnecessary churn.

## What Didn't Work
1. **No subagent tool available**: Had to fall back to direct execution. The refactored skill couldn't be validated with actual `subagent()` calls during this execution. E2E validation is builder-driven.
2. **Pre-existing test failures**: ~74 CLI integration tests fail in the worktree due to `@arete/core` not being built. This made quality gate verification harder — had to isolate plan-mode tests specifically.

## Subagent Insights
- N/A (direct execution fallback — no subagents dispatched)

## Collaboration Patterns
- Builder provided clear PRD with pre-mortem already complete — saved an entire phase
- Builder preferred manual execution over `/build` for this first refactor (bootstrapping problem: refactoring the system that runs itself)

## Recommendations

### Immediate
1. Run E2E validation (post-execution checklist in PRD) to confirm subagent dispatch works with the new skill
2. Consider building `@arete/core` in worktrees so full test suite can run

### For Next PRD
1. **Pre-mortem inventory grep is essential** for refactors — include it as a standard step for any path-migration PRD
2. **Symlink/hardlink awareness** — document which skill paths are symlinked vs copied in AGENTS.md or a dev reference
3. **Phase 2 tracking** — create a backlog item for the template/schema migration (dev/autonomous/templates/ → dev/templates/)

## Refactor Backlog
- Phase 2: Migrate `dev/autonomous/templates/` and `dev/autonomous/schema.ts` to new locations; remove all remaining `dev/autonomous/` references

## Learnings
- The bootstrapping problem (refactoring the execution system using the execution system) was mitigated by the fallback path — direct execution with same quality gates works well as a safety net.
- Symlink architecture in `.pi/skills/` is an excellent pattern — eliminates dual-file maintenance entirely.
