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

## [Unreleased]

### Added
- Cross-meeting reconciliation in backend (`runProcessingSessionTestable`) — deduplicates items across meetings, skips completed tasks
- `--reconcile` flag for CLI `meeting extract` command with relevance scoring and tier badges
- `loadRecentMeetingBatch()` helper in core for loading processed meetings
- Enhanced `/review` skill with tiered review paths (Quick for tiny/small, Full for medium+)
- AC validation rubric with anti-pattern detection and good/bad examples
- Expertise profile loading in reviews for domain-aware validation
- Pre-mortem gating by complexity (Large plans require pre-mortem before approval)
- Two output modes: Direct Refinement vs Structured Suggestions
- LEARNINGS.md for review-plan skill with gotchas and invariants
- `[Build Principles]` section in AGENTS.md with 6 execution principles for autonomous work
- Integrity check in `build-agents.ts` to prevent root AGENTS.md from being overwritten with GUIDE content

### Fixed
- Restored BUILD mode AGENTS.md that had been accidentally overwritten with GUIDE content (commit c57e944)
- AGENTS.md now correctly includes `[Identity]`, `[Expertise]`, `[Roles]`, and all 10 build skills
- Added missing expertise profiles (backend, web) and roles (gitboss) to AGENTS.md

### Added
- `pullCalendarHelper()` with DI pattern for testable calendar pulls
- Calendar JSON output includes `importance`, `organizer`, `notes`, `hasAgenda` fields
- Agenda lookup caching (caller-side) for performance optimization
- `captureConsole<T>` shared test helper in `packages/cli/test/helpers.ts`
- Integration test for calendar pull CLI error paths

### Changed
- Week-plan skill Step 2.5 now classifies meetings by importance (🔴 High priority / 🟡 Prep-worthy)
- Week template includes `## Key Meetings` section between Weekly Priorities and Today

### Fixed
- Unused `Importance` type import removed from pull.ts

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
