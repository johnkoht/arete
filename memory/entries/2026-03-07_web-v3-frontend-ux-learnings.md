# Web V3 Frontend UX — PRD Execution Learnings

**Date**: 2026-03-07
**PRD**: dev/work/plans/web-v3/prd.md
**Status**: ✅ Complete (6/6 tasks)

---

## Metrics

| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 (100%) |
| First-Attempt Success | 6 (100%) |
| Iterations Required | 0 |
| Tests Added | ~109 |
| Final Test Count | 1441 passing |
| Commits | 6 |
| Token Usage | ~90K total (~20K orchestrator + ~70K subagents) |

---

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Applied | Effective |
|------|-------------|-------------------|-----------|
| Bundle size (BlockNote) | No | Lazy loading via React.lazy() | Yes |
| Markdown fidelity | No | Round-trip tests, documented lossy behavior | Yes |
| Theme mismatch | No | CSS variable mapping documented | Yes |
| Unsaved changes | No | useBlocker navigation guard | Yes |
| Backend API gaps | No | Explicit backend ACs per task | Yes |
| Scope creep (V3-5) | No | Clarified "default selection" as frontend-only | Yes |
| Test coverage | No | Every task included explicit test requirements | Yes |
| V3-1 foundation risk | No | Completed prototype tested before dependent tasks | Yes |

**Pre-mortem effectiveness**: 8/8 risks identified, 0 materialized. Mitigations were actionable and applied.

---

## What Worked Well

1. **Pre-work sanity checks**: Reviewer caught ambiguities before development started (V3-2 phone field, V3-3 category semantics, V3-5 redundant ACs). This prevented wasted effort.

2. **Expertise profiles**: Web and backend profiles provided accurate context. Developers followed patterns without reimplementing existing functionality.

3. **LEARNINGS.md culture**: V3-3 discovered a gray-matter caching gotcha; it was documented immediately. Future tasks in this repo will avoid the same issue.

4. **Refined ACs from reviewer feedback**: The pre-work sanity check improved AC clarity (e.g., "use `useBlocker`" → full code example in task prompt).

5. **Cross-cutting concerns in pre-mortem**: Backend dependencies flagged early (V3-3 Favorites, V3-4 Commitments) ensured backend work was included in scope.

---

## What Didn't Work (or Could Be Improved)

1. **AC over-specification in initial plan**: Some ACs described existing behavior (V3-5 collapsible sections, skipped item styling). Pre-work review caught these, but tighter initial planning would save a round-trip.

2. **Missing useBlocker pattern**: First use of `useBlocker` required providing the full code pattern in the task prompt. Future tasks with first-use APIs should default to including examples.

3. **Test infrastructure gaps identified late**: BlockNote/jsdom limitations weren't in LEARNINGS.md until V3-1 implementation. Could have been caught in pre-mortem research.

---

## Subagent Insights

Synthesized from developer reflections:

| Task | What Helped Most | Token Estimate |
|------|------------------|----------------|
| V3-1 | LEARNINGS.md existing patterns (TipTap → BlockNote) | ~12K |
| V3-2 | Clear pre-mortem mitigation (useBlocker pattern) | ~25K |
| V3-5 | Existing localStorage patterns in LEARNINGS.md | ~18K |
| V3-6 | Clear scope with existing MeetingSheet base | ~8K |
| V3-3 | Pre-mortem identifying backend requirements | ~15K |
| V3-4 | Multi-param URL pattern in LEARNINGS.md | ~12K |

**Key insight**: When LEARNINGS.md had relevant patterns documented, developers completed tasks faster with fewer clarifications.

---

## Collaboration Patterns

- **Builder confirmed clarifications quickly**: When the plan had ambiguities (V3-5 "default selection"), explicit clarification was provided.
- **Pre-mortem followed**: All 8 risks had documented mitigations; orchestrator referenced them in task prompts.
- **Reviewer integration worked well**: Pre-work sanity checks caught 4 refinements; code reviews all passed first attempt.

---

## System Improvements Applied

| File | Change |
|------|--------|
| `packages/apps/web/LEARNINGS.md` | BlockNote integration patterns, useBlocker/data router testing |
| `packages/apps/backend/LEARNINGS.md` | gray-matter caching gotcha |

---

## Recommendations

### Continue
- Pre-work sanity checks before every task
- Including first-use code examples in task prompts
- Updating LEARNINGS.md immediately when gotchas discovered
- Using expertise profiles for context injection

### Stop
- Specifying ACs for already-implemented features (waste of review cycles)

### Start
- Researching test infrastructure limitations during pre-mortem (e.g., jsdom + BlockNote)
- Adding "first-use patterns" section to pre-mortem template for novel APIs

---

## Refactor Items

None identified — implementation was clean.

---

## Documentation Updates Needed

- [x] LEARNINGS.md (web) — BlockNote, useBlocker (done during execution)
- [x] LEARNINGS.md (backend) — gray-matter caching (done during execution)
- [ ] None outstanding — AGENTS.md doesn't need updates for this feature work

---

## Next Steps

1. Review and merge (builder)
2. Manual UX validation in browser
3. Consider scratchpad items: `formatDuration` utility extraction, person slug formatter
