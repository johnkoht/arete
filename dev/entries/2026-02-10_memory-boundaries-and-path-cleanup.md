# Memory boundaries and path cleanup

**Date**: 2026-02-10  
**Context**: Tightened entries vs scratchpad vs backlog conventions; replaced stale `.cursor/build/` paths with `dev/`.

---

## Memory boundaries (entries vs scratchpad vs backlog)

**Problem**: Agents were putting backlog items and future work in `dev/entries/`, which is for decisions and changes (what happened), not future work.

**Conventions now explicit**:

| Content | Location |
|---------|----------|
| What happened — decisions, changes, learnings | `dev/entries/` |
| Raw or underdeveloped ideas | `scratchpad.md` (root) |
| Mature future work — discussed, with a plan | `dev/backlog/` |

**Rule**: Do not put backlog or future work in entries. If an analysis produces a prioritized backlog, put the backlog in `dev/backlog/` (or scratchpad if still rough), not in the entry.

**Files updated**: `dev.mdc`, `dev/collaboration.md`, `dev/backlog/README.md`, `agent-memory.mdc`

---

## Path cleanup: `.cursor/build/` → `dev/`

**Problem**: Many active docs and skills still referenced `.cursor/build/` after the 2026-02-09 repo reorganization that moved build assets to `dev/`.

**Files updated** (active docs and skills; historical entries left as-is):
- `dev/skills/execute-prd/SKILL.md`
- `dev/agents/prd-task.md`
- `dev/autonomous/skills/execute-prd/SKILL.md`
- `dev/autonomous/skills/prd-to-json/SKILL.md`
- `dev/autonomous/TESTING.md`
- `dev/autonomous/README.md`
- `dev/backlog/features/progress-dashboard.md`
- `dev/backlog/improvements/automated-code-review.md`
- `dev/TEST-EXECUTE-PRD-PROMPT.md`
- `dev/QUICK-START-ORCHESTRATION.md`
- `dev/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md`
- `dev/prds/intelligence-and-calendar/prd.md`
- `dev/prds/meeting-intelligence/prd.md`
- `SETUP.md`
- `README.md`
- `src/core/briefing.ts` (comment)

**Not updated**: `dev/entries/*` (historical record; MEMORY.md note explains mapping), `dev/MEMORY.md` index lines (historical summaries).

**Subsequent cleanup**: Removed duplicate `dev/autonomous/skills/execute-prd/` (canonical is `dev/skills/execute-prd/`). Moved `dev/autonomous/skills/prd-to-json/` to `dev/skills/prd-to-json/` so all build skills live in `dev/skills/`.
