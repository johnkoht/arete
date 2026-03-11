# Ship It Skill — Build Memory Entry

**Date**: 2026-03-11
**PRD**: `dev/work/plans/ship-it/prd.md`
**Execution**: `dev/executions/ship-it/`
**Branch**: `ship-it`

---

## Summary

Created the `/ship` mega-build skill that automates the entire plan-to-PR workflow. After plan approval, the builder says `/ship` and walks away. The system handles: pre-mortem, review, memory scan, PRD creation, worktree setup, autonomous build via execute-prd, final wrap, and ship report — pausing only at intelligent gates when human judgment is needed.

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 8/8 complete |
| First-attempt success | 100% (0 iterations) |
| Pre-mortem risks | 0/8 materialized |
| Commits | 7 |
| Lines added | ~2400 (skill documentation) |
| Duration | ~2 hours |

---

## Deliverables

| Artifact | Path | Size |
|----------|------|------|
| Main skill | `.pi/skills/ship/SKILL.md` | 1932 lines |
| Orchestrator | `.pi/skills/ship/orchestrator.md` | 287 lines |
| Report template | `.pi/skills/ship/templates/ship-report.md` | 197 lines |
| Skills LEARNINGS | `.pi/skills/LEARNINGS.md` | 42 lines |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| pi-worktrees API Unknown | No | Yes (Task 1 discovery) | Yes |
| Terminal Fragmentation | No | Yes (macOS-only V1) | Yes |
| Skill-to-Skill Integration | No | Yes (explicit handoffs) | Yes |
| Gate Ambiguity | No | Yes (decision matrix) | Yes |
| Git State Assumptions | No | Yes (pre-flight checks) | Yes |
| Memory Search Noise | No | Yes (caps and filters) | Yes |
| Build in Wrong Context | No | Yes (CWD verification) | Yes |
| No Rollback | No | Yes (idempotent phases) | Yes |

---

## What Worked Well

1. **Task 2 thoroughness**: The comprehensive skill structure created in Task 2 satisfied multiple subsequent task ACs (Task 3 was verification-only). Investing upfront in complete documentation paid off.

2. **Pre-mortem mitigations**: All 8 risks were addressed in the skill documentation. Zero materialized during execution. The mitigation-per-task mapping in prompts ensured nothing was forgotten.

3. **Verification tasks are valid**: Task 3 being "already satisfied by Task 2" isn't a failure — it's the correct outcome when earlier tasks are thorough. The reviewer confirmed completeness.

4. **New skill structure pattern**: The `orchestrator.md` + `templates/` directory pattern works well for complex meta-orchestrator skills. Documented in `.pi/skills/LEARNINGS.md` for future use.

---

## What Could Improve

1. **Task overlap in PRDs**: Tasks 2 and 3 had significant overlap. Consider more aggressive deduplication when the first task is "create structure" — subsequent "implement phase X" tasks may only need enhancement, not creation.

2. **pi-worktrees testing**: We installed and configured the extension but didn't fully test the create/remove cycle in this execution (since we were already in a worktree). Real validation will come from first /ship usage.

---

## Patterns Discovered

### Complex Skill Structure Pattern (new)

For skills that orchestrate multiple other skills:
```
.pi/skills/{skill}/
├── SKILL.md           # Main workflow with phases
├── orchestrator.md    # Gate decision logic, personas
└── templates/         # Report templates
    └── {template}.md
```

**When to use**: Skill chains 3+ skills, has complex gates, produces formatted reports.
**When not to use**: Single-purpose skills, simple pass/fail logic.

---

## Recommendations

### Continue
- Pre-mortem mitigations mapped to each task
- Comprehensive Phase 1 (structure) with verification in Phase 2
- Documentation-first for skill development
- Reviewer pre-work sanity checks

### Start
- Test pi-worktrees create/remove cycle before first real /ship usage
- Consider "implementation completeness check" for structure-then-implement PRD patterns

### Stop
- Nothing identified

---

## Next Steps

1. Test `/ship` on a real small plan
2. Gather feedback on gate thresholds (too aggressive? too permissive?)
3. Consider V2 enhancements: Linux/Windows terminal support, holdpty integration
