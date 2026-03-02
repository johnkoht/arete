# Agent Experts PRD — Execution Learnings

**Date**: 2026-03-02
**PRD**: Agent Experts — BUILD Mode Context Refactor
**Branch**: agent-refactor

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 9/9 |
| First-attempt success | 8/9 (89%) |
| Iterations | 1 (Task 8 — missed 5 active .cursor/rules/ refs) |
| Tests | 901 passing, 0 failures |
| Tests added | 0 (documentation-only PRD) |
| Commits | 10 |
| Pre-mortem risks | 0/8 materialized |

## Pre-Mortem Analysis

All 8 risks identified in pre-mortem were mitigated. 0 materialized. The pre-mortem was effective — embedding mitigations directly in subagent prompts (proven pattern from execute-prd LEARNINGS.md) prevented issues.

Key mitigations that worked:
- **Risk 1 (plan-mode extension paths)**: Explicit file list in Task 1 prompt caught all 3 hardcoded paths
- **Risk 5 (profile accuracy)**: Mandatory source reading + spot-checking 3 claims produced accurate profiles
- **Risk 7 (GUIDE pipeline)**: Build verification in Task 3 confirmed dist/AGENTS.md remained intact
- **Risk 4 (content overlap)**: Designing AGENTS.md and APPEND_SYSTEM.md together (same task) prevented boundary violations

## What Worked Well

1. **Reviewer pre-work sanity checks caught scope gaps**: Task 1 reviewer identified BUILD vs USER path distinction and 5 internal SKILL.md cross-references — critical catches that would have caused broken agent instructions. Task 2 reviewer clarified the "duplicated standards" vs "role procedures" boundary.

2. **Parallel task dispatch for independent work**: Tasks 4+5 (expertise profiles) ran simultaneously, as did Tasks 7+8+9. Significant time savings with no conflicts.

3. **Dense compressed format in AGENTS.md**: The `[Section]|key:value` format carries high information density in minimal token budget. Planner context dropped from 409 to 186 lines while improving clarity.

4. **Content boundary design before implementation**: Explicitly defining "what exists" (AGENTS.md) vs "how to work" (APPEND_SYSTEM.md) before writing either file prevented the overlap problem.

## What Didn't Work Well

1. **Task 8 grep scope was too narrow**: Initial developer only searched DEVELOPER.md, SETUP.md, and capabilities.json. Missed 5 active files (route.ts, review-plan SKILL.md, reviewer.md, README.md, prd-task-agent.md). Reviewer caught it. **Fix for future**: broader grep scope in task prompts, or a final "sweep" grep across the entire repo.

## Subagent Insights

- **Developer**: Consistently reported that file lists ("Read These Files First") were the most valuable prompt element. Source reading requirements for profiles (Tasks 4-5) produced accurate results.
- **Reviewer**: Pre-work sanity checks added meaningful value — caught issues that would have required iteration post-implementation. The BUILD vs USER path distinction was the highest-value catch.
- **Parallel execution**: No conflicts when tasks operate on different file sets. Profile creation (Tasks 4-5) and final cleanup (Tasks 7-9) both parallelized cleanly.

## Recommendations for Next PRD

1. **Continue**: Pre-mortem mitigation embedding in prompts, reviewer pre-work sanity checks, parallel dispatch for independent tasks, file lists in developer prompts
2. **Stop**: Narrow grep scopes for cleanup tasks — always include full repo sweep
3. **Start**: Consider a "verification sweep" as the penultimate task in cleanup-heavy PRDs — dedicated task that greps for ALL old paths across the entire repo

## Deliverables

- `.pi/standards/build-standards.md` — consolidated coding standards (218 lines)
- `.pi/expertise/core/PROFILE.md` — core package domain map (244 lines)
- `.pi/expertise/cli/PROFILE.md` — CLI package domain map (205 lines)
- `AGENTS.md` — rewritten planner context (75 lines, hand-written)
- `.pi/APPEND_SYSTEM.md` — rewritten process rules (111 lines)
- All 5 role files updated with Composition sections
- Orchestrator + execute-prd updated for expertise-aware spawning
- `dev/work/plans/agent-experts/smoke-tests.md` — 10 validation scenarios

## Deleted

- `.agents/skills/` — moved to `.pi/skills/`
- `.agents/sources/builder/` — consolidated into hand-written AGENTS.md
- `.cursor/rules/` — consolidated into build-standards.md and APPEND_SYSTEM.md
- `build:agents:dev` script — no longer needed
