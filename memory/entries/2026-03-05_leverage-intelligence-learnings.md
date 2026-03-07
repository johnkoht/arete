# Leverage Intelligence — Expert Agent Layer Phase 1 Learnings

**Date**: 2026-03-05
**PRD**: Expert Agent Layer for GUIDE mode skills
**Status**: ✅ Complete (5/5 tasks)

## What Was Done

Created an Expert Agent Layer that separates workflow orchestration from intelligent judgment in skills:

1. **Three new patterns**: `context_bundle_assembly`, `significance_analyst`, `relationship_intelligence`
2. **Three skill updates**: process-meetings (Step 7 Significance Analyst), meeting-prep (Relationship Intelligence), week-review (Weekly Significance Analysis)
3. **Updated existing pattern**: `extract_decisions_learnings` with conditional Significance Analyst reference
4. **Authoring guide**: New Expert Agent Patterns section

## Metrics

- Tasks: 5/5 complete
- Engineering lead review: 1 critical, 4 important, 3 minor → all fixed
- Pre-mortem: 8 risks identified, 8/8 mitigated
- Commits: 8
- All docs/skill file changes — no TypeScript code

## Pre-Mortem Effectiveness

| Risk | Materialized | Mitigation Effective |
|------|-------------|---------------------|
| Sparse context fallback | No (not yet tested in production) | Yes — specified |
| finalize-project breakage | No | Yes — conditional fallback with explicit naming |
| Pattern ambiguity (overlap) | No | Yes — hierarchy cross-references |
| Vague expert mode | No | Yes — worked examples are behavioral |
| Scope creep | No | Yes — Phase 1 boundary held |
| Week-review people resolution | No | Yes — explicitly excluded in AC |
| Token budget unbounded | No | Yes — hard limits specified |
| Step reference drift | Yes (C1) | Partial — plan was corrected but developer still referenced wrong pattern |

## Learnings

1. **Worked examples are the linchpin for expert patterns** — Both pre-mortem and review flagged this as the make-or-break element. The significance_analyst before/after example genuinely shows different behavior (rejecting "OAuth configuration" as architecture description, promoting "unofficial guides" by citing Sarah Chen's stance). Without these examples, the pattern would be documentation theater.

2. **Pre-mortem → plan feedback loop must be explicit** — The reviewer caught that pre-mortem mitigations were identified but not applied to the plan's ACs. Always fold recommended additions into step ACs BEFORE building.

3. **Subagents struggle with very large files** — PATTERNS.md at 500+ lines caused two subagent failures. The orchestrator had to write the patterns directly. For future work: consider breaking patterns into separate files or giving more targeted instructions.

4. **Step reference accuracy across files is fragile** — The developer referenced `get_meeting_context` in process-meetings Step 6.5, but process-meetings doesn't use that pattern (meeting-prep does). Always verify references against the actual target file, not plan descriptions.

5. **Scope discipline requires explicit exclusions** — "Do NOT add `arete people show` calls" in week-review AC was essential. Without it, a developer would naturally add people resolution when building a context bundle.

6. **Conditional patterns need explicit branching structure** — Prose conditionals ("when bundle available, use analyst; otherwise keyword scan") get skipped by agents that jump to Steps headers. Adding separate `Steps (bundle)` and `Steps (fallback)` headers makes branching impossible to miss.
