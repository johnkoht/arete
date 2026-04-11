# Changelog

## [0.7.0] - 2026-04-10

### Added
- **Extraction intelligence** — two-layer dedup architecture reducing ~40% decision/learning duplication in meeting extraction: prompt-level hardening (self-review instructions, exclusion lists, confidence guides, trivial/garbage filters) + post-reconciliation `batchLLMReview()` for semantic dedup against committed memory items
- Real confidence scores from extraction (no longer hardcoded 0.9)
- Prior meeting items fed into extraction prompts for cross-meeting context
- Prompt injection mitigations in `batchLLMReview` (input sanitization, ID validation)
- **Slack digest skill** — daily/weekly winddown integration for Slack channel summaries
- **Commitments create CLI** — `arete commitments create` for manual commitment entry
- **Workspace hygiene** — `arete hygiene scan` and `arete hygiene apply` for detecting and cleaning workspace entropy (Phase 1)

### Fixed
- **Krisp OAuth redirect URI** — corrected redirect URI for OAuth flow
- **Weekly-winddown alignment** — aligned with daily meeting processing pipeline
- **Direction-inversion bugs** — fixed ours/theirs direction swap in extraction pipeline
- **Cross-person bilateral dedup** — commitment extraction no longer creates duplicates when both directions extracted from same meeting

---

## [0.6.1] - 2026-04-09

### Added
- **Meeting dismiss** — skip/unskip meetings from triage (`arete meeting dismiss`)

### Fixed
- **Extraction intelligence dedup pipeline** — parse real extraction formats, notify-not-process mode, correct CLI flags
- **Meeting-manifest window test** — use relative date for stability

---

## [0.6.0] - 2026-04-07

### Added
- **Meeting intelligence** — enriched meeting frontmatter with topics, item counts; rolling `MANIFEST.md` with weekly grouping and aggregate stats
- **Area-memory topics** — aggregate topics from tagged meetings into area memory
- **Cross-area synthesis** — LLM-powered connections between area memories
- **Inbox triage** — `arete inbox add` (text, URL, file) with universal content ingest; inbox-triage skill for processing
- **Review page UX** — meeting-first layout, action items panel, area assignment in web UI
- **Claude Code integration** — slash commands, expertise profiles, new skills, `--ide` flag (#7)
- **GitHub Actions** — Claude Code Review and PR Assistant workflows

### Fixed
- GWS CLI command paths and `--params` JSON serialization
- Drive plain-text query wrapping (`fullText contains` syntax)
- GWS test mocks aligned with actual CLI command paths

---

## [0.5.0] - 2026-04-05

### Added
- **Google Workspace integration** (`gws` CLI) — Gmail, Drive, Docs, Sheets, and People access via `arete gws <resource>`
- **GWS detection** — auto-detects Google Workspace availability at startup; registers in integration registry
- **Jaccard deduplication** — `TaskService.addTask()` checks for near-duplicate tasks (≥80% similarity or matching commitment link) before inserting; idempotent writes across repeated skill runs
- **Meeting context injection** — daily-plan and week-plan skills read open tasks from `week.md`/`tasks.md` before proposing new work; prevents re-proposing already-captured items
- **Approve High Confidence** — one-click approval for all Review items at or above a configurable confidence threshold (default 80%)
- **Approve by Meeting** — Review items grouped by source meeting; approve or skip an entire meeting's items at once
- **Auto-approve preview banner** — amber banner surfaces when all items in a meeting exceed 0.8 confidence; nothing auto-approved silently
- **Review summary** — post-approval summary shows approved/skipped/undecided counts and lists auto-approved items for audit
- **Area-focused week planning** — week-plan skill opens by asking which areas to focus on, then scopes goals and projects to those areas

### Changed
- **Ship skill** — 2363→375 lines; extracted Phase 0 to `build-log-protocol.md`, multi-phase loop to `multi-phase-protocol.md`
- **Engineering-lead agent** — merged into orchestrator (Testing Requirements section, signal tag processing); 6 roles → 5
- **Signal tags** — replace token estimates in developer reflections; cascade through execute-prd, prd-post-mortem, orchestrator
- **Three-track routing** — Express/Standard/Full in APPEND_SYSTEM.md + review-plan `recommended_track` output
- **Working-memory structure** — explicit 4-section format (Discovered Patterns, Active Gotchas, Shared Utilities, Context Corrections)
- **plan-to-prd** — emits prd.md + prd.json in one pass (no separate prd-to-json step)
- **Recon check** — formal CONFIRMED/PHANTOM/PARTIAL classification in execute-prd Phase 0
- **prd-post-mortem** — 9→5 sections; Signal Patterns section; synthesize-collaboration-profile mandatory
- **Reviewer mindset** — grumpy-by-default ("assume something is wrong until proven otherwise")
- **synthesize-collaboration-profile** — triggers simplified: automatic after post-mortem + on-request only
- **Multi-phase ship** — meta-orchestrator loop with phase gates, GATE_PASS/GATE_FAIL escalation, project-working-memory.md
- **Reconciliation threshold** — raised from 0.5 → 0.65; lower-confidence items filtered earlier, reducing review queue noise
- **Goal/project hierarchy** — quarter-plan prompts for area on goal creation; general-project prompts for linked goal

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

---

Build tooling and developer experience changes for Areté contributors.

For user-facing features, see [`packages/runtime/UPDATES.md`](packages/runtime/UPDATES.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
