# Onboarding Improvements Phase 2 Learnings

**Date**: 2026-02-18  
**PRD**: `dev/prds/onboarding-improvements/prd.md`  
**Task list**: `dev/autonomous/prd.json`

## Metrics

- Tasks completed: **8/8**
- Success rate: **100% first-attempt**
- Iterations required: **0**
- New tests added: **6**
  - `packages/core/test/services/people-intelligence.test.ts` (4)
  - `packages/cli/test/commands/people-intelligence.test.ts` (2)
- Quality gates:
  - `npm run typecheck` ✅
  - `npm test` ✅ (290 passing)

## Deliverables

- Added new skill: `packages/runtime/skills/people-intelligence/SKILL.md`
- Added people-intelligence types in `packages/core/src/models/entities.ts`
- Implemented `EntityService.suggestPeopleIntelligence()` with:
  - confidence + evidence suggestions
  - unknown queue threshold routing
  - digest-mode batch output
  - graceful contract consumption (`context/profile.md`, `context/domain-hints.md`)
  - KPI metrics (misclassification rate, triage burden, interruption complaints, unknown queue rate)
- Added CLI flow: `arete people intelligence digest --input <file>`

## Pre-mortem Outcomes

| Risk | Materialized? | Mitigation Applied? | Effective? |
|---|---|---|---|
| Scope creep into Phase 3 enrichment | No | Yes (explicit out-of-scope in skill + task scoping) | Yes |
| Over-coupling to Stream A/B contracts | No | Yes (optional contract reads + fallbacks) | Yes |
| Low-confidence forced classification | No | Yes (threshold -> `unknown_queue`) | Yes |
| Review UX interruption noise | No | Yes (digest default, non-blocking output) | Yes |
| Missing traceability in recommendations | No | Yes (evidence kind/source/snippet payload) | Yes |

## What Worked Well

1. Extending `EntityService` avoided creating a parallel service graph and reused existing people primitives.
2. Contract consumption as optional inputs kept Stream C independently shippable.
3. CLI JSON-first digest output made acceptance criteria easy to verify via tests.

## What Didn’t Work / Gaps

1. KPI metrics are currently computed at digest runtime; no persistent longitudinal metrics store yet.
2. The confidence model is heuristic and should be calibrated with real usage data in Phase 3.

## Recommendations for Next PRD / Phase 3

1. Add policy/config file for confidence thresholds and role-signal weighting.
2. Add persisted metrics snapshots for week-over-week trend monitoring.
3. Add explicit review action capture (accept/reject/edit) to improve misclassification measurement quality.

## Refactor Backlog

- Refactor items added: **0**

## Documentation Gaps

- Consider documenting the new command in user-facing docs (`README.md` / setup docs) if this command is intended to be public-facing in MVP.
