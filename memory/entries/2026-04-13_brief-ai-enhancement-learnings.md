# Brief AI Enhancement — Learnings

**Date**: 2026-04-13
**Branch**: worktree-agent-ab2ab108
**Scope**: packages/core (IntelligenceService), packages/cli (brief command)

## What Changed

Added AI synthesis to `arete brief --for "topic"`. The command now produces a concise 5-section briefing (Current Status, Key Decisions, Key People, Recent Activity, Open Questions/Risks) instead of raw markdown aggregation. Three modes: AI synthesis (default), raw fallback (AI not configured), explicit raw (`--raw` flag).

## Metrics

- Tasks: 4 executed (consolidated from 7 planned)
- Tests: 15 added (7 core, 8 CLI)
- First-attempt success: 100%
- Files changed: 10 source + dist artifacts

## Pre-mortem Effectiveness

| Risk | Materialized? | Mitigation Effective? |
|------|--------------|----------------------|
| CLI/core boundary violation | No | Yes — synthesis lives in IntelligenceService |
| AI failure breaks brief | No | Yes — graceful null fallback |
| Large context exceeds tokens | No | Yes — 12K char truncation ceiling |

## What Worked / What Didn't

**+** AIService as method parameter (not constructor dep) — clean DI without factory.ts changes
**+** Consolidating prompt/cache/synthesis into IntelligenceService — avoids over-engineering for small scope
**+** Detailed ACs with test file locations and mock patterns in the plan — subagents knew exactly what to build
**+** Content-hash caching deferred — kept scope tight for MVP

**-** Plan specified 7 tasks but orchestrator consolidated to 4 — the plan over-decomposed for this scope
**-** Plan specified separate files (briefing-prompts.ts, briefing-cache.ts, briefing-synthesis.ts) — unnecessary for this size

## Recommendations

- **Continue**: Method-parameter DI pattern for adding AI features to existing services
- **Continue**: Detailed ACs with test locations and mock patterns — subagent quality was high
- **Stop**: Over-decomposing small features into many files — let the orchestrator consolidate
- **Start**: Consider caching layer if brief synthesis becomes a hot path

## Follow-ups

- Add content-hash caching if synthesis latency becomes an issue
- Streaming support when AIService adds it
- Empty-briefing edge case test (minor)
