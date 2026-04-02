# Enhance Review Skill — Learnings

**Plan**: `dev/work/plans/enhance-review-skill/plan.md`
**Executed**: 2026-04-02
**Status**: Complete

## Summary

Enhanced the `/review` skill to be a rigorous quality gate with tiered review paths, strict AC validation, expertise profile loading, and actionable output modes. Direct execution (no subagents) since this was a documentation task.

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 6/6 |
| Files Changed | 2 (SKILL.md rewritten, LEARNINGS.md created) |
| Line Count | 180 → 465 |
| Pre-mortem Risks | 7 identified, 0 materialized |
| Commits | 2 |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Referenced sections don't exist | No | Yes (verified all) | Yes |
| Structural inconsistency | No | Yes (followed execute-prd pattern) | Yes |
| Tiered path confusion | No | Yes (explicit criteria + flowchart) | Yes |
| Self-referential loop | No | Yes (added guidance note) | Yes |
| Examples become stale | No | Yes (generic examples) | Yes |
| Breaking agent behavior | No | Yes (preserved output format) | Yes |
| Skill becomes too long | Partial | Yes (target 400, got 465) | Acceptable |

## What Worked Well

- **Direct execution for documentation tasks**: Skipping the full ship workflow (worktree + execute-prd + subagents) was the right call. Documentation tasks don't need code quality gates.
- **Pre-mortem drove structure**: The 7 risks directly shaped the implementation. Profile section mapping, tiered criteria, and output format preservation all came from pre-mortem.
- **Memory synthesis informed PRD**: build-context-injection learnings about profile section mapping was directly applied.

## What Could Improve

- **Line count target was optimistic**: 400 lines wasn't realistic for the scope. 465 is justified but the estimate should have been higher.
- **Ship skill could detect documentation tasks**: Currently treats all PRDs the same. Could add a "documentation mode" that skips worktree/subagents.

## Key Additions to Review Skill

1. **Tiered Review Paths**: Quick (≤3 steps, ≤2 files) vs Full (everything else)
2. **Expertise Profile Loading**: Core/CLI/Backend/Web profiles with section-specific extraction
3. **LEARNINGS.md Scanning**: Check affected directories for gotchas
4. **AC Validation Rubric**: 6 good/bad examples, anti-pattern phrase list
5. **Test Coverage Requirements**: Flag code tasks without test expectations
6. **Pre-Mortem Gating**: Large plans cannot be approved without pre-mortem
7. **Output Modes**: Direct Refinement vs Structured Suggestions

## Collaboration Patterns

- Builder recognized documentation tasks don't need full ship workflow — confirmed with "let's do B" for direct execution
- Pre-mortem and review were already done before ship, showing the lifecycle gates are being followed

## Recommendations

**Continue**:
- Using pre-mortem mitigations as implementation checklist
- Direct execution for single-file documentation tasks
- Profile-specific section extraction (not assuming uniform structure)

**Start**:
- Consider adding "documentation mode" to ship skill
- Set more realistic line count targets for comprehensive skill rewrites

## References

- Plan: `dev/work/plans/enhance-review-skill/plan.md`
- Pre-mortem: `dev/work/plans/enhance-review-skill/pre-mortem.md`
- Review: `dev/work/plans/enhance-review-skill/review.md`
- Enhanced skill: `.pi/skills/review-plan/SKILL.md`
- Skill LEARNINGS: `.pi/skills/review-plan/LEARNINGS.md`
