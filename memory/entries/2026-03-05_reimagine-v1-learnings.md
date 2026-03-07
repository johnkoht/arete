# Areté Reimagine v1 Learnings

**Date**: 2026-03-05
**Branch**: reimagine
**Status**: ✅ Complete (3 iterations + polish)

---

## What Was Built

A full reimagination of Areté from a passive CLI tool to a proactive Product Intelligence Operating System. Three iterations across two competing implementation streams.

### Plan A: The Intelligence Engine (CLI + Services)
- `arete daily` — morning intelligence brief: calendar, overdue commitments, active projects, recent decisions, signal patterns
- `arete momentum` — commitment momentum (hot/stale/critical) + relationship momentum (active/cooling/stale)
- `arete status` — enhanced workspace health overview with intelligence metrics
- Background file watcher — auto-processes new meetings via Pi SDK when files land in `resources/meetings/`
- `GET /api/events` SSE endpoint — broadcasts meeting processing events to web clients
- `packages/core/src/services/patterns.ts` — cross-person signal pattern detection (topics appearing in 2+ meetings × 2+ people)
- `packages/core/src/services/momentum.ts` — commitment and relationship momentum computation
- `packages/core/src/utils/attendees.ts` — shared `extractAttendeeSlugs` utility

### Plan B: The Beautiful Workspace (Web App)
Transformed Meeting Minder into a full Product Intelligence Dashboard:

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/` | Today's meetings, recent meetings, commitment pulse, active projects, recent memory, signal patterns, activity feed |
| Meeting Triage | `/meetings` | Existing meeting list with triage |
| People Intelligence | `/people` | Sortable table with health, drawer with stances/commitments |
| Goals Alignment | `/goals` | Strategy → Quarter → Week → Commitments cascade |
| Memory Feed | `/memory` | Searchable decisions & learnings |
| Intelligence | `/intelligence` | Cross-person signal patterns with day filter |
| Commitments | `/commitments` | Full commitments management with mark-done/drop |
| Global Search | `/search` | Cross-workspace search (meetings, people, memory, projects) |

### Backend Routes Added
calendar, projects, memory, people, goals, intelligence (patterns + commitments), search, activity

---

## Metrics

| Metric | Value |
|--------|-------|
| Total commits | 8 feature commits + 2 docs + 1 polish |
| Tests before | ~1360 |
| Tests after | 1436 (root) + 112 (backend) |
| New tests added | ~230+ |
| Web pages built | 8 (was 2 with Meeting Minder) |
| Backend routes built | 9 new route modules |
| CLI commands added | 2 new (`daily`, `momentum`) |
| Core services added | 3 (`patterns`, `momentum`, `activity`) |
| Web build size | 482 KB JS, 70 KB CSS |
| TypeScript errors | 0 |

---

## Architecture Decisions

1. **Two competing streams → review → merge** — spawning Plan A (intelligence-first) and Plan B (visual workspace) as separate implementations then having an Engineering Lead review revealed integration gaps (SSE not wired to UI, patterns not surfaced) that a single-stream approach would have missed.

2. **SSE auto-refresh as the ambient intelligence conduit** — the file watcher → `broadcastSseEvent` → `useProcessingEvents` → `queryClient.invalidateQueries` loop is the architectural centerpiece. The Dashboard feels "live" because it is.

3. **Pattern detection without LLM** — `detectCrossPersonPatterns` uses regex-based extraction from Key Points/Summary sections + normalized topic deduplication. Fast, testable, no API calls. Good enough for v1.

4. **Activity events written at the watcher callsite** — `writeActivityEvent` is called in `index.ts` alongside `broadcastSseEvent`, not inside `server.ts` closures. Keeps the broadcaster pure.

5. **Global search via file scanning** — no index, just concurrent file reads with substring matching. Sufficient for <500 file workspaces; would need the existing search index for larger workspaces.

---

## Learnings

1. **Parallel subagent execution hit lock file contention** — pi's lockfile prevents two agents from running simultaneously on the same workspace. Run sequentially, not in parallel, for same-codebase work. (Or use separate worktrees.)

2. **`\z` is PCRE-only** — Not valid in JavaScript regex. `\z` in a regex literal silently fails to match end-of-string as intended. Use index-based section parsing for complex multi-section documents.

3. **Test mocking level matters** — The initial `dashboard.test.ts` mocked entire routes (returning hardcoded data), which tested the contract but not the implementation. The I2-3 task caught that the actual `parseQuarterOutcomes`, `parseWeekPriorities` etc. had zero test coverage. Both levels of tests are needed: contract tests for integration shape, unit tests for parsing logic.

4. **The Engineering Lead cross-model review pattern catches integration gaps** — The reviewer caught: SSE not wired to dashboard, patterns not surfaced in UI, `extractAttendeeSlugs` duplicated, strategy preview bug, `\z` regex. Single-stream development would have shipped all these.

5. **`yaml.stringify` outputs unquoted strings by default** — Test assertions like `content.includes('title: "Weekly Sync"')` break after switching from manual frontmatter construction to `yaml.stringify`. Use `content.includes('title: Weekly Sync')` (unquoted).

6. **Optimistic mutation pattern for commitments** — `cancelQueries` + `getQueryData` + `setQueryData` + `onError` rollback is the right TanStack Query pattern for optimistic updates. The mark-done UX in CommitmentsPage feels instant.

---

## What's Next (Backlog)

Things worth building in future iterations:
- Relationship health drift alert on Dashboard (cooling/stale people surfaced proactively)
- Settings page (configure integrations, workspace preferences)
- Mobile push notifications (when meetings auto-process outside business hours)
- Visual project board (cards with status, linked meetings, milestones)
- `arete daily --watch` mode (live-updating morning brief)
- Export decisions/learnings to Notion
