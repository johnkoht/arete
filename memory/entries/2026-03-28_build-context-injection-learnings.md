# Build Context Injection — Learnings

**Plan**: `dev/work/plans/build-context-injection/plan.md`
**Executed**: 2026-03-28
**Status**: Complete

## Summary

Fixed a gap where reviewer subagents and the /ship final review were not receiving expertise profiles (Layer 4 of the 4-layer context stack). Developers knew the invariants when building, but reviewers couldn't verify code against them.

## Metrics

| Metric | Value |
|--------|-------|
| Steps | 4/4 |
| Files Changed | 3 |
| Pre-mortem Risks | 5 identified, 0 materialized |
| Tests | All passing (2408) |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Inconsistent profile selection | No | Yes (reference Step 10) | Yes |
| Ship Phase 4.2 lacks profile info | No | Yes (git diff approach) | Yes |
| Profile content becomes stale | No | Yes (documented trade-off) | Yes |
| Reviewer prompt too long | No | Yes (key sections only) | Yes |
| Edit location ambiguity | No | Yes (search by name) | Yes |

## What Worked Well

- **Review caught profile structure mismatch**: The review identified that CLI profile lacks the same sections as core (no Invariants/Anti-Patterns). This would have caused silent failures.
- **Pre-mortem prevented DRY violations**: Risk 1 explicitly called out "don't duplicate profile selection heuristics" which kept the implementation clean.
- **Fallback strategy**: Adding explicit fallback for unknown profiles (first 150-200 lines) ensures new profiles work without code changes.

## What Didn't Work

- **Initial plan assumed uniform profile structure**: Had to revise plan after review to add profile-specific section mapping.

## Recommendations

**Continue**:
- Running review after pre-mortem — caught structural issues pre-mortem missed
- Profile-specific section mapping pattern for any future profile usage

**Start**:
- Consider standardizing profile sections across all expertise profiles (Core, CLI, future profiles) to simplify injection logic

## Documentation Created

- `.pi/skills/LEARNINGS.md` — New cross-skill learnings file with 4 gotchas about profile injection

## References

- Pre-mortem: `dev/work/plans/build-context-injection/pre-mortem.md`
- Review: `dev/work/plans/build-context-injection/review.md`
- Collaboration.md correction that triggered this: "Always inject expertise profiles for reviews"
