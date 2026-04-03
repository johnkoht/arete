# Changelog
## [0.3.0] - 2026-03-28

### Added
- add [DONE:N] markers and expertise profile injection
- split changelog into BUILD (CHANGELOG.md) and GUIDE (UPDATES.md)
- audit skill - documentation audit orchestration

### Changed
- lean orchestrator - subagents read own profiles

### Fixed
- distinguish BUILD vs GUIDE docs in manifest
- audit findings - memory index + skill frontmatter
- use persistent report paths, add template rendering note


Build tooling and developer experience changes for Areté contributors.

For user-facing features, see [`packages/runtime/UPDATES.md`](packages/runtime/UPDATES.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] - 2026-04-03

### Added
- **AreaMemoryService** — computed L3 area summaries from existing data (keywords, active people, open work, recently completed, recent decisions)
- **`arete memory refresh`** CLI command — unified L3 refresh for area memory + person memory
- **Decision compaction** — groups old decisions by area, archives to `.arete/memory/archive/`
- **L3 freshness signals** — `arete status` shows stale area memory count with refresh recommendation
- **SSE task file watchers** — backend watches `now/week.md` and `now/tasks.md`, emits `task:changed` events
- **Task Management UI** — web UI for tasks with Today/Upcoming/Anytime/Someday/Completed views, task scoring engine, commitment-task linking
- Cross-meeting reconciliation in backend — deduplicates items across meetings, skips completed tasks
- `--reconcile` flag for CLI `meeting extract` with relevance scoring and tier badges
- `loadRecentMeetingBatch()` helper for loading processed meetings
- Enhanced `/review` skill with tiered review paths (Quick/Full)
- `[Build Principles]` section in AGENTS.md
- `pullCalendarHelper()` with DI pattern for testable calendar pulls
- Calendar JSON output includes `importance`, `organizer`, `notes`, `hasAgenda` fields

### Changed
- **L3 searchable** — QMD memory scope widened from `.arete/memory/items` to `.arete/memory` (includes areas + summaries)
- **Daily-winddown** integration-agnostic recording pull (checks arete.yaml for krisp/fathom)
- **Daily-plan** skill adds `@due(YYYY-MM-DD)` to focus tasks for Task UI Today view alignment
- **Daily-winddown** clears stale `@due` tags from previous day
- **Weekly-winddown** Phase 7 now calls `arete memory refresh`
- **Agent-memory rule** updated to reflect computed L3 architecture
- Week-plan skill classifies meetings by importance

### Fixed
- `parseMemorySections` heading level mismatch — now matches real `##` format with `- **Date**:` body lines
- Restored BUILD mode AGENTS.md from accidental GUIDE content overwrite
- Task UI: timezone dates, suggestions filtering, debounce removal, badge labels

---

## Historical

For changes before 0.2.0, see git history:

```bash
git log --oneline --since="2026-01-01" --until="2026-03-28"
```

Key milestones:
- **Plan mode** (`/plan`, `/ship`, `/wrap`, `/release`) — Feb-Mar 2026
- **Gitboss agent** — Mar 2026
- **PRD execution system** — Feb 2026
