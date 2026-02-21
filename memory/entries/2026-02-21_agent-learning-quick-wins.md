# Agent Learning Quick Wins

**Date**: 2026-02-21
**Type**: New convention + extension
**Execution Path**: PRD (execute-prd skill, multi-agent with subagents)

## What Changed

Added two mechanisms to reduce agent regressions:

1. **LEARNINGS.md convention** — Component-local knowledge files (7-section template: How This Works, Key References, Gotchas, Invariants, Testing Gaps, Patterns That Work, Pre-Edit Checklist). Seeded 6 files in high-regression areas from real past incidents.

2. **Auto-injection pi extension** — `.pi/extensions/agent-memory/index.ts` (~45 lines) automatically injects `memory/collaboration.md` into every agent session's system prompt via `before_agent_start` hook using `systemPrompt` return (not `message`).

### Files Created/Modified

**New files**:
- `.pi/extensions/agent-memory/index.ts` — auto-injection extension
- `.pi/extensions/agent-memory/agent-memory.test.ts` — 7 unit tests
- 6 LEARNINGS.md files: `.pi/extensions/plan-mode/`, `packages/core/src/search/`, `packages/core/src/services/`, `packages/core/src/integrations/`, `packages/cli/src/commands/`, `packages/runtime/rules/`

**Modified files**:
- `.cursor/rules/dev.mdc` — LEARNINGS.md Convention section, SYNC comment, checklist item
- `.pi/APPEND_SYSTEM.md` — compressed behavioral rules, SYNC comment
- `.agents/sources/builder/memory.md` — LEARNINGS.md section
- `.agents/sources/builder/conventions.md` — LEARNINGS.md in commit workflow
- `.agents/skills/execute-prd/SKILL.md` — Pre-task LEARNINGS.md check in Prepare Context step
- `scripts/build-agents.ts` — compression functions updated for LEARNINGS.md references
- `dev/catalog/capabilities.json` — `pi-agent-memory-extension` entry
- `AGENTS.md` — regenerated (2 LEARNINGS.md references)

## What Worked Well

- **Pre-mortem was highly effective**: 7 risks identified, 0 materialized. The `systemPrompt` vs `message` decision (Risk 1) was the highest-leverage finding — prevented a subtle token accumulation bug.
- **Reviewer caught factual errors**: The runtime/rules LEARNINGS.md had incorrect claims about `claude-code/` directory (wrong extensions, wrong transform state). Caught in review, fixed before commit.
- **Source material mapping**: Listing specific memory entries and source files per LEARNINGS.md file produced high-quality, incident-anchored content.
- **Parallel task execution**: Tasks 3 and 4 ran in parallel after Task 1 completed, saving time.

## What Didn't Work

- **Pre-existing test/typecheck failures**: 74 test failures and 38+ typecheck errors pre-exist on this branch. This made AC verification noisy — had to `git stash` to confirm failures weren't introduced. Consider fixing these as a separate task.
- **`npm test` broken in worktree**: `tsx` not in PATH for the worktree. Task 4 developer fixed this by changing npm scripts to use `npx tsx`. This is a worktree-specific environment issue.
- **build-agents.ts hardcoded compression**: Source file changes to memory.md and conventions.md don't automatically propagate to AGENTS.md — the compression functions in `build-agents.ts` must also be updated. This is non-obvious and should be documented.

## Learnings

### Collaboration Patterns
- Builder prefers to see execution resume cleanly after session interruptions — check execution state files and pick up where left off.
- Pre-mortem + review before execution is worth the investment for medium plans — all 7 risks were mitigated before any code was written.

### Technical Learnings
- **Pi extension `systemPrompt` vs `message`**: `systemPrompt` is chained across extensions per-turn without persisting in session history. `message` creates persistent entries that accumulate. For background context injection, always use `systemPrompt`.
- **Pi extensions loaded by jiti**: No compile step, no `npm run typecheck` coverage. Extension tests must be run separately: `npx tsx --test '.pi/extensions/.../*.test.ts'`.
- **build-agents.ts compression gap**: Sections that use hardcoded compression functions (memory, conventions, CLI) require updating the compress function alongside the source file. Document this in `.agents/sources/README.md`.

## Execution Path
- **Size assessed**: Medium (5 tasks)
- **Path taken**: PRD (execute-prd skill with subagents)
- **Decision tree followed?**: Yes
- **Pre-mortem**: 7 risks, 0 materialized
- **Commits**: 4 (186de7f, bdbe728, bdc561b, 58de109)
