# Onboarding Improvements Phase 3 Learnings

**Date**: 2026-02-18  
**PRD**: `dev/prds/onboarding-improvements/prd.md`  
**Task list**: `dev/autonomous/prd.json` (phase3)

## Metrics

- Tasks completed: **8/8**
- First-attempt success: **100%**
- Iterations: **0**
- New tests added: **4**
  - `packages/core/test/utils/context-dump-quality.test.ts`
  - expanded `packages/core/test/services/people-intelligence.test.ts`
  - expanded `packages/cli/test/integration/people-intelligence.integration.test.ts`
- Quality gates:
  - `npm run typecheck` ✅
  - `npm test` ✅ (297 passing)
- Integration validation:
  - `./node_modules/.bin/tsx --test 'packages/core/test/integration/**/*.test.ts' 'packages/cli/test/integration/**/*.test.ts'` ✅ (15 passing)

## Deliverables

- Added Stream B extraction-quality utilities:
  - `packages/core/src/utils/context-dump-quality.ts`
  - export via `packages/core/src/utils/index.ts`
- Added Stream C policy + toggles + persistence in `EntityService`:
  - policy loading (`context/people-intelligence-policy.json`)
  - feature toggles (`enableExtractionTuning`, `enableEnrichment`)
  - optional enrichment evidence and `enrichmentApplied`
  - KPI snapshot persistence (`.arete/memory/metrics/people-intelligence.jsonl`)
  - malformed-line-tolerant snapshot reads
- Enhanced CLI digest flow:
  - `people intelligence digest` supports feature flags and extraction quality input
  - digest output surfaces policy/toggle state and extraction quality KPI

## Pre-Mortem Outcomes

| Risk | Materialized? | Mitigation Applied? | Effective? |
|---|---|---|---|
| Scope leakage into unrelated systems | No | Yes (targeted utility + entity-service changes only) | Yes |
| Breaking prior phase behavior | No | Yes (feature toggles default false) | Yes |
| Config fragility | Partial (invalid config possible) | Yes (safe sanitize + fallback defaults) | Yes |
| KPI persistence corrupting flow | No | Yes (JSONL append + malformed line tolerance) | Yes |
| Incomplete integration coverage | No | Yes (added end-to-end integration regression test) | Yes |

## What Worked Well

1. Implementing Phase 3 behind default-off toggles preserved independent-ship constraints and backward compatibility.
2. JSONL snapshots were a simple, durable pattern for trend persistence with low complexity.
3. Integration tests at CLI boundary gave fast confidence on contract hints + fallback behavior.

## What Didn’t Work / Gaps

1. Extraction-quality utilities are not yet wired into a dedicated runtime ingestion path (currently utility-level + optional score injection).
2. Interruption complaints KPI remains a placeholder metric without direct telemetry source.

## Recommendations for Next Iteration

1. Wire extraction-quality scoring into the actual rapid-context-dump execution path when that runtime path is formalized.
2. Add a lightweight CLI command to view recent KPI snapshots/trends.
3. Add explicit user feedback capture to compute interruption complaints from real interactions.

## Refactor Backlog

- Refactor items added: **0**

## Documentation Gaps

- Consider documenting policy file format (`context/people-intelligence-policy.json`) and digest feature flags in user docs.
