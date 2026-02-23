# Google Calendar Provider PRD — Execution Learnings

Date: 2026-02-22
Plan: `google-calendar-provider`
Branch: `google-calendar`

## Metrics

- Tasks completed: **7/7**
- First-attempt approvals: **7/7**
- Iterate loops required: **0**
- Commits delivered:
  - `117b50c` (types extraction)
  - `55ddc1b` (registry)
  - `df1cadd` (OAuth + credentials)
  - `5e58a70` (Google provider + tests)
  - `2e4eeff` (factory/configure/pull/status wiring)
  - `61956c3` (integration round-trip tests)
  - `ba0f944` (error hardening + docs)
- Test delta during execution: **541 → 564 pass** (+23 passing tests)
- Final quality gates:
  - `npm run typecheck` ✅
  - `npm test` ✅ (564 pass, 0 fail, 2 skipped)
- Estimated token usage: ~**65K-80K** total (orchestrator + subagents)

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|---|---|---|---|
| Producer-consumer provider string mismatch | Partial (caught during prompt sanity review before code) | Yes (`provider: 'google'` comments at producer + consumer + tests) | Yes |
| Types extraction import breakage | No | Yes (typecheck gate after task completion) | Yes |
| Credential storage overwrite of other keys | No | Yes (atomic merge under `google_calendar`) | Yes |
| OAuth redirect mismatch / loopback confusion | No | Yes (127.0.0.1 loopback flow + docs guidance) | Yes |
| Fresh context gaps in subagents | No | Yes (explicit file-first prompts + reviewer pre-checks) | Yes |
| REST client edge cases missed | No | Yes (pagination + realistic fixtures + round-trip tests) | Yes |
| Token refresh / 401 handling gaps | No | Yes (refresh-on-expiry + 401 retry + invalid_grant tests) | Yes |
| Scope creep in configure UX | No | Yes (kept to checkbox selection + existing CLI patterns) | Yes |
| Registry/factory/configure naming drift | No | Yes (canonical naming table + regression tests) | Yes |
| Documentation and catalog drift | No | Yes (explicit task + AGENTS rebuild + capabilities update) | Yes |

## What Worked Well

1. **Reviewer pre-work sanity checks prevented architectural drift early** (especially factory availability semantics).
2. **Producer-consumer regression testing** around config values (`provider: 'google'`) prevented repeat of prior `macos`/`ical-buddy` mismatch class.
3. **File-first context lists** in subagent prompts reduced exploration overhead and ambiguity.
4. **Realistic fixture integration tests** (not just unit mappings) gave high confidence in end-to-end behavior.
5. **Doc + source + generated artifact synchronization** (runtime docs + `.agents/sources` + rebuilt `AGENTS.md`) avoided stale guidance.

## What Didn’t Work / Friction

1. Task 7 first developer handoff returned an incomplete/in-progress response; required re-dispatch to finish end-to-end.
2. Execution `status.json` lagged behind task progress and required explicit close-out update.

## Subagent Insights (Synthesis)

- LEARNINGS.md was consistently useful for catching config producer-consumer invariants and CLI UX conventions.
- The strongest prompt ingredient was explicit "read these files first" context.
- The execution loop stayed efficient with no iterate cycles when prompts were concrete and reviewer-gated.

## Collaboration Patterns Observed

- Builder preference for structured, end-to-end completion maps well to execute-prd loop with reviewer gates.
- Keeping outputs concise and progress-oriented preserved clarity while maintaining speed.

## Recommendations for Next PRD Executions

1. Add a **status.json sync step after every approved task** (not only at start/end).
2. Add a small **subagent completion quality check**: if response is process-oriented ("I’ll start by..."), auto re-dispatch.
3. Keep mandatory reviewer pre-work sanity checks for medium tasks; they paid off on interface-contract decisions.
4. Continue explicit producer-consumer tests for any config-writing command.

## Refactor Items

- None required during this PRD.
- Non-blocking enhancement candidates:
  - Add direct smoke coverage for `getTodayEvents()` date-window helper behavior.
  - Consider caching calendar name resolution to reduce API calls in repeated queries.

## Documentation/Catalog Coverage

Updated in this execution:
- `SETUP.md`
- `ONBOARDING.md`
- `packages/runtime/GUIDE.md`
- `packages/runtime/integrations/README.md`
- `packages/runtime/integrations/registry.md`
- `.agents/sources/guide/intelligence.md`
- `.agents/sources/shared/cli-commands.md`
- `AGENTS.md` (rebuilt)
- `packages/core/src/integrations/LEARNINGS.md`
- `dev/catalog/capabilities.json`

No remaining documentation gaps identified for this PRD scope.
