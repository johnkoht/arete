# Onboarding Refresh PRD Learnings

**Date**: 2026-03-26
**PRD**: `dev/work/plans/onboarding-refresh-2026-03/`
**Branch**: `feature/onboarding-refresh-2026-03`

---

## Summary

Refreshed the onboarding experience based on issues found during fresh workspace testing. Covered model defaults, messaging, file creation, session context injection, CLI enhancements, and getting-started skill overhaul.

## Metrics

- **Tasks**: 9/9 complete (100%)
- **Success rate**: 100% first-attempt (no iterations needed)
- **Commits**: 8 implementation commits
- **Tests**: 2126 passing, 2 skipped, 0 failures
- **Token estimate**: ~40K total across all tasks

## Deliverables

### Phase 1: Quick Fixes
1. **Model tiers updated** — Changed to `-latest` suffix for auto-updating (sonnet-4-latest, opus-4-latest)
2. **Onboard messaging improved** — Added "AI Configuration" header and explanation before credential prompts
3. **agent-observations.md created** — Added to DEFAULT_FILES for session-start context

### Phase 2: Onboarding Overhaul
4. **Session-start context injection** — Added rule section to both Cursor and Claude Code agent-memory.mdc
5. **CLI onboard enhanced** — Calendar choice (Apple/Google/Skip), context prompts, first-win suggestions
6. **Skill structural updates** — Added now/ workspace guidance
7. **Skill calendar integration** — Direct command execution via bash, not CLI delegation
8. **Skill discovery questions** — Simplified to 3 focused questions with routing table

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| No test coverage | No | Manual verification in ACs | Yes |
| Wrong file location (agent-observations.md) | No | Specified workspace-structure.ts | Yes |
| Multi-IDE drift | No | Updated both rule files, diff verified | Yes |
| 2.1→2.2 dependency | No | Enforced task order | Yes |
| Model name format | No | Verified existing convention | Yes |
| Scope creep in 2.2 | No | Split into subtasks | Yes |

**Surprises**:
- Positive: All tasks completed on first attempt
- Negative: Subagents committed to main branch instead of worktree branch (workaround: fast-forward merge)

## Known Gaps

### AI Credentials in Agent Path

The getting-started skill does not handle AI credentials setup. This was identified in parity verification.

**Mitigation**: Expected workflow is CLI-first (`arete onboard` → "Let's get started"), so users should already have credentials.

**Recommendation**: Add AI credentials check/setup to getting-started skill in future iteration.

## Learnings

### What Worked Well

1. **Pre-mortem mitigations were effective** — All 6 risks had mitigations applied; none materialized
2. **Task splitting (2-2a/b/c)** — Breaking the skill update into subtasks prevented scope creep
3. **Explicit file paths in prompts** — Line number references helped developers find exact locations
4. **Sanity check before implementation** — Caught command name error (configure calendar vs configure apple-calendar)

### What Could Improve

1. **Worktree workflow** — Subagents committed to main instead of feature branch; need clearer cwd context
2. **AI credentials parity** — Should have been caught earlier in planning, not during parity verification
3. **Test coverage** — Still no dedicated tests for onboard.ts; added to backlog consideration

### Collaboration Patterns

- **Reviewer pre-work checks** caught real issues (command names, missing pre-mortem mitigations)
- **Exact replacement text** in task prompts enabled clean implementation
- **8-AC tasks** are acceptable when cohesive (all modify one flow)

## Refactor Items

None filed — implementation was clean.

## Documentation Updates Needed

- [ ] AGENTS.md may need CLI section update (new onboard phases)
- [ ] User-facing docs could mention calendar integration in onboard

## Recommendations

### Continue
- Pre-mortem with explicit mitigations table
- Reviewer sanity checks before implementation
- Task splitting for multi-faceted changes
- Explicit line references in task prompts

### Stop
- Committing from worktrees without verifying correct branch
- Assuming "obvious" features are present (AI credentials in skill)

### Start
- Add dedicated test file for onboard.ts
- Add AI credentials handling to getting-started skill
- Consider `--non-interactive` flag for onboard (vs just --json)

---

## Related

- **Plan**: `dev/work/plans/onboarding-refresh-2026-03/plan.md`
- **PRD**: `dev/work/plans/onboarding-refresh-2026-03/prd.md`
- **Pre-mortem**: `dev/work/plans/onboarding-refresh-2026-03/pre-mortem.md`
- **Parity analysis**: `dev/executions/onboarding-refresh-2026-03/parity-analysis.md`
