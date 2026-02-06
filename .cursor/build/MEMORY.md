# Build memory (Arete project)

Index of significant changes to **Arete’s build, tooling, and architecture**. Detail lives in dated entries; this file is the index.

- **USER.md** (gitignored): User-specific context — copy from `USER.md.example`.
- **Entries**: `.cursor/build/entries/YYYY-MM-DD_short-title.md` — one file per change or decision.

## Conventions

- **When to add an entry**: Refactors, tooling changes, architectural decisions, breaking changes, or anything you’d want to remember in 6 months.
- **Entry format**: `YYYY-MM-DD_slug.md` (e.g. `2025-02-05_build-memory-system.md`).
- **In MEMORY.md**: One line per entry: `- YYYY-MM-DD [title](entries/YYYY-MM-DD_slug.md) — one-line summary.`

## Index

<!-- Add new entries at the top -->

- 2026-02-06 [Meeting Intelligence PRD execution](entries/2026-02-06_meeting-intelligence-prd-execution.md) — meeting-prep and daily-plan skills; get_meeting_context pattern; docs updated.
- 2026-02-06 [PRD placement: build folder, not projects](entries/2026-02-06_prd-placement-build-not-projects.md) — Areté PRDs live in `.cursor/build/prds/`, not `projects/active/`; moved meeting-propagation and meeting-intelligence.
- 2026-02-06 [Meeting Propagation PRD execution](entries/2026-02-06_meeting-propagation-prd.md) — Template frontmatter, process-meetings skill, internal_email_domain config, docs.
- 2026-02-06 [PRD-task subagent and enriched instructions](entries/2026-02-06_prd-task-subagent-and-instructions.md) — Custom subagent `.cursor/agents/prd-task.md` for fresh context per task; execute-prd prefers it; instructions added for conventions, repo root, workspace-structure only-add, git, failure handling, Python test:py.
- 2026-02-06 [Context files on install](entries/2026-02-06_context-files-on-install.md) — Install/update now create context/ files (business-overview, goals-strategy, etc.) with placeholders; learning: canonical user-facing files in docs should be in DEFAULT_FILES.
- 2026-02-06 [Execute-PRD fallback when Task tool unavailable](entries/2026-02-06_execute-prd-fallback.md) — Documented fallback in execute-prd skill and autonomous README: when no Task/subagent tool exists, agent executes tasks in sequence with same quality gates and prd/progress updates.
- 2026-02-06 [PM Planning System PRD execution](entries/2026-02-06_pm-planning-system-execution.md) — Executed prd.json: four skills (quarter-plan, goals-alignment, week-plan, week-review), AGENTS.md §6 Planning System, SETUP.md and pm-workspace.mdc updates; branch feature/pm-planning-system, commit 191b9d7.
- 2026-02-06 [PM Planning System PRD and autonomous setup](entries/2026-02-06_pm-planning-system-prd-and-autonomous.md) — PRD and prd.json for PM planning (resources/plans, quarter/week skills); scratchpad automations and plan→execution feedback.
- 2026-02-06 [Update workspace structure backfill](entries/2026-02-06_update-workspace-structure-backfill.md) — arete update ensures missing workspace dirs and default files; single source of truth in workspace-structure.ts; existing workspaces get new structure (e.g. people/) on update.
- 2026-02-06 [People system](entries/2026-02-06_people-system.md) — People tracking (internal, customers, users); people/ dirs, index, core module, CLI (list/show/index); linking conventions for meetings and projects.
- 2026-02-06 [Autonomous agent loop system](entries/2026-02-06_autonomous-agent-loop.md) — Cursor-native autonomous execution for Areté development; prd-to-json and execute-prd skills; fresh Task subagents per task; progress tracking.
- 2026-02-06 [Shared meetings service and index update](entries/2026-02-06_meetings-service-and-index.md) — Core meetings module; Fathom refactor; arete meeting add; save-meeting skill; index auto-update on save.
- 2026-02-05 [Fathom Node migration & API URL fix](entries/2026-02-05_fathom-node-migration.md) — Fathom integration moved from Python to Node; External API base URL and URL() fix; fetch flow uses list-with-includes.
- 2025-02-05 [Build memory system](entries/2025-02-05_build-memory-system.md) — Added USER.md, MEMORY.md, build entries, and dev.mdc for Arete’s build process.
