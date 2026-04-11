# Krisp OAuth Fix + Weekly Winddown Alignment

**Date**: 2026-04-10
**Branch**: feat/slack-digest
**Scope**: packages/core (krisp client), packages/runtime (weekly-winddown skill)

## What Changed

1. **Krisp OAuth redirect URI fix** — `configure()` always re-registers the client so the dynamic port matches the OAuth server's registered redirect URI. Previously reused stale credentials from a prior port.

2. **Weekly winddown aligned with daily winddown meeting pipeline** — Added area association checkpoint (Phase 1.5), agenda merge, explicit process-meetings subagent template, unknown attendee handling (Phase 3d), agenda carryover review (Phase 3e).

3. **Fixed dead commitment format** — Weekly winddown used `<!-- c:XXXXXXXX -->` HTML comments which had zero code support. Replaced with `@from(commitment:XXX)` metadata tags (the format TaskService actually parses). All other skills (daily-winddown, daily-plan, week-plan, slack-digest) already used the correct format.

4. **Generalized recording pull** — Weekly winddown hardcoded `arete pull fathom`; now checks `arete.yaml` for all configured integrations (krisp, fathom, or both).

## Metrics

- Files changed: 3 source files (client.ts, LEARNINGS.md, SKILL.md)
- Tests: 30/30 pass (krisp tests), 2961/2963 pass (full suite, 2 pre-existing flaky)
- Reviewer cycles: 2 (first caught stale LEARNINGS.md, second approved all changes)

## Learnings

- **Skill drift is silent** — weekly-winddown claimed "exact same template as daily-winddown" but had diverged on area association, agenda merge, commitment format, and subagent output format. The delegation claim masked the drift because nobody compared them.
- **Dead formats in skills** — `<!-- c:XXXXXXXX -->` was documented in weekly-winddown but never implemented in TaskService. Skills that reference code formats should be verified against the actual implementation.
- **OAuth dynamic port registration** — The LEARNINGS.md in integrations/ documented the correct pattern ("re-register per run") but section 1 contradicted it ("skip if client_id exists"). Both sections were written in the same session — internal doc contradictions happen.

## Recommendations

- **Continue**: Having the reviewer check LEARNINGS.md consistency as part of code review
- **Start**: Periodic diff between daily-winddown and weekly-winddown meeting processing sections to catch drift
- **Stop**: Vague "see other skill for template" references in skills — inline the template or reference process-meetings as the canonical source
