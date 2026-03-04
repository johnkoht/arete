# Agent Learning Loop — Planner Identity, Patterns Guide, Maintenance Protocol

**Date**: 2026-03-01
**Branch**: `agent-refactor` (followed directly from agent-experts PRD)
**Commit**: `7f86d9c`
**Plan**: `dev/work/archive/agent-learning-loop/`

---

## What Was Done

Three follow-on improvements to close gaps left by the agent-experts PRD:

1. **Planner Identity** — Added `[Identity]` section to AGENTS.md. The planner now knows who it is: primary agent for Areté development, thinks before acting, routes to experts for complex work. Simple 6-line section but eliminates the "missing persona" gap where subagent roles had identity and the planner didn't.

2. **Patterns Guide** — Created `.pi/standards/patterns.md` (~200 lines). Documents 9 code-verified codebase-level architectural patterns (DI via constructor, StorageAdapter abstraction, testDeps injection, provider pattern, compat layer strategy, model organization, CLI→core boundary, config resolution). All 9 patterns verified against current code in `notes.md` before writing. Referenced from `build-standards.md` and both expertise profiles.

3. **Maintenance & Learning Protocol** — Created `.pi/standards/maintenance.md` as standalone source of truth (68 lines). Two modes: Light (tiny/small tasks) and Detailed (medium/large, PRDs). Defines what Developer, Reviewer, and Orchestrator each own in the learning loop. Role files updated to reference it. `execute-prd` SKILL.md updated with Step 17 (Documentation Improvement in Phase 3) and "System Improvements Applied" section in the report template. `APPEND_SYSTEM.md` updated to reference `maintenance.md`.

## Files Changed

**New files:**
- `.pi/standards/patterns.md` — 9 architectural patterns (193 lines)
- `.pi/standards/maintenance.md` — learning protocol, 2 modes, 3 roles (68 lines)

**Updated:**
- `AGENTS.md` — [Identity] section added
- `.pi/APPEND_SYSTEM.md` — reference to maintenance.md
- `.pi/agents/developer.md` — learning ownership responsibilities
- `.pi/agents/reviewer.md` — Step 3.7 Documentation Review
- `.pi/agents/orchestrator.md` — documentation improvement in holistic review
- `.pi/skills/execute-prd/SKILL.md` — Step 17 + System Improvements Applied template
- `.pi/standards/build-standards.md` — cross-reference to patterns.md
- `.pi/expertise/cli/PROFILE.md` — cross-reference to patterns.md
- `.pi/expertise/core/PROFILE.md` — cross-reference to patterns.md

**Total**: 11 files changed, +330/-15 lines.

## Metrics

| Metric | Value |
|--------|-------|
| Steps completed | 5/5 |
| Commits | 1 (direct execution, not via execute-prd) |
| Files changed | 11 |
| Lines added | ~330 |
| Tests added | 0 (documentation-only change) |

## Key Decisions

- **Standalone maintenance.md vs APPEND_SYSTEM.md**: Review analysis noted APPEND_SYSTEM.md was ~80 lines; maintenance content would push it to 150+. Created standalone file matching the `build-standards.md` pattern — APPEND_SYSTEM.md routes, standards files hold content.
- **Role files reference maintenance.md, don't repeat it**: Avoided the "two places to update" problem by making maintenance.md the source of truth and role files provide 1-2 sentence summaries + a reference link.
- **patterns.md pre-verified**: All 9 pattern claims were verified against actual source code (notes.md) before the file was written. No pattern claims are aspirational — all reflect current codebase reality.
