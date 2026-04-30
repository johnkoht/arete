# Changelog

## [Unreleased]

### Fixed
- **Cross-meeting reconciliation self-match on reprocess** — when a meeting whose status was already `processed` or `approved` was reprocessed, `loadRecentMeetingBatch` picked it up alongside everything else, so the caller's `[...recentBatch, currentBatch]` flow handed `findDuplicates` two copies of the same meeting. "First occurrence wins" → on-disk staged items became canonical and the fresh extraction got flipped to `status: 'skipped'`, `source: 'reconciled'` (with no `matched_text` — the diagnostic tell). `loadRecentMeetingBatch` now accepts an optional `excludePath`; the CLI extract path, the backend `runProcessingSessionTestable` reconciliation step, and the backend priorItems loader all pass the current meeting's path. Verified end-to-end against the actual incident meeting: 0/12 items flipped, vs 11/12 with the bug present.

## [0.9.0] - 2026-04-29

### Added
- **Wiki-leaning meeting extraction** — when topics are detected on a transcript, the LLM sees existing topic-page sections + topic-tagged L2 items as "already known" and emits only deltas (new decisions, changed plans, new risks/questions). Verbatim delta directive includes a "When in doubt, INCLUDE" tiebreaker and a one-shot CONFIRMATION-of-uncertainty example. Char budget guard (`MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`) with 3-tier truncation; highest-scored topic never dropped.
- **Recap reshape** — extraction now produces `## Core` (free-form, principle-based — what's actionable/decided/changed) and `## Could include` (≤8 prioritized one-line headlines for side threads). `## Summary` retained for backward compat; both headings parse permanently. Production parsers (`apps/backend/src/routes/intelligence.ts`, `services/workspace.ts`, `services/patterns.ts`) updated to dual-anchor `/^##\s+(?:Summary|Core)\s*$/m`.
- **Topic detection** — new `detectTopicsLexical` / `detectTopicsLexicalDetailed` services with stop-token list (10 generic words: planning, review, sync, discussion, meeting, update, status, team, weekly, daily) and ≥2 non-stop slug tokens + ≥0.5 coverage threshold. Cap at 3 candidates at rollout.
- **L2 topic tags** — `learnings.md` and `decisions.md` entries gain `**Topics**: slug-a, slug-b` bullet for per-topic queryability. New `getMemoryItemsForTopics(paths, slugs, opts)` helper. Memory parser (`parseMemorySections`) now matches all three header shapes (`## Title`, `### YYYY-MM-DD: Title`, `### Title`) via single-pass classifier with priority order + code-fence tracking.
- **CLI tuning lever** — `arete meeting extract --dry-run-topics` runs detection only, prints score + matched tokens (separated stop vs non-stop) + last_refreshed for each detected slug; supports `--json`. Used to tune detection thresholds against real meetings before A/B rollout.
- **Frontmatter sanitizer** — `stripYamlDocSeparator` strips line-start `---` from LLM-generated `core` and `could_include[]` strings before they're written into staged sections of YAML-frontmattered meeting files. Strip-and-warn pattern (deliberately diverged from topic-memory.ts's drop-on-detect: LLM prose is more likely accidental than malicious).

### Changed
- **`daily-winddown` and `weekly-winddown` skills** gain a new orchestrator phase (Phase 2.4 daily / Phase 2.5 weekly) that scans each processed meeting's `## Could include` section and surfaces side-thread bullets to the user for selective promotion via chat. User replies `keep N,M,P` / `keep all` / `none` (default skip-all). Agent picks type from category prefix (`Risks:` → learning, `Decision:` → decision, `Action:` → action item; ambiguous → asks inline), generates next ID, moves bullet from `## Could include` into the matching staged section. Items left unpromoted stay as informational text in the meeting markdown — visible to future chat sessions, invisible to the staging UI. Pairs with the wiki-leaning extraction `could_include` field.

### Fixed
- **L2 parser/writer mismatch** — newly written learnings/decisions were unsearchable because writer emitted `## Title` while parser only matched `### Title`. Parser now matches all three header shapes.
- **Backend missing `activeTopicSlugs`** — CLI passed it to `extractMeetingIntelligence`; backend silently skipped, producing different extractions on the web path. Backend now mirrors CLI's assembly via `loadMemorySummary` + `renderActiveTopicsAsSlugList`.
- **`updateMeetingContent` anchor bug** — anchor regex looked for `## Summary` only; on files with `## Core` (post-rollout), would fail to anchor and APPEND new content rather than REPLACE, duplicating staged sections on re-extraction. Now dual-anchor.

## [0.8.1] - 2026-04-17

### Fixed
- **Meeting extraction fragmentation** — tightened `buildMeetingExtractionPrompt()` with a new Consolidation section that teaches the model to emit ONE action item per unit of work. Three named patterns now handled inline: handoff chain (A identifies → B agrees → C picks up = one item owned by the last person), collaborative-initiative split (pilot with multiple contributors = one item for the outcome, not one per sub-task), and same-outcome-different-verbs. Enabling sub-tasks ("get access", "provision Y", "send test data") now fold into the parent initiative rather than emitting as separate items. Speculation framing ("I wonder if…", "Maybe we try…") caps confidence at 0.5 instead of being elevated to commitments.
- Verified against two real meetings at frontier tier: a Claude damage-estimation pilot collapsed from 7 action items to 3 (one consolidated pilot item), and a handoff chain on a state case-sensitivity bug correctly collapsed to a single item owned by the person who picked up the work.

---

## [0.8.0] - 2026-04-15

### Added
- **Brief AI synthesis** — `arete brief --for "topic"` now produces concise 5-section AI-synthesized briefings (Current Status, Key Decisions, Key People, Recent Activity, Open Questions/Risks) instead of raw markdown dumps. Three modes: AI synthesis (default), raw fallback (AI not configured), explicit `--raw` flag
- `SynthesizedBriefing` type and `'brief'` AITask with standard tier routing
- `synthesizeBriefing()` method on IntelligenceService with method-parameter DI for AIService
- 12K character context truncation ceiling for AI synthesis
- **Getting-started web research** — onboarding skill now proactively researches the user's company via WebSearch/WebFetch before asking questions, replacing generic Q&A with an informed conversation
- 8-phase getting-started flow: profile check, consent, web research, present findings, targeted conversation, draft & review, integration scavenge, first win, graduation
- Graceful degradation ladder for web research failures
- 15 new tests (7 core synthesis + 8 CLI brief command)

### Fixed
- **SPA fallback on POST requests** — `serveStatic` middleware no longer serves `index.html` for POST/PUT/DELETE API calls, fixing "Unexpected token '<'" JSON parse errors when dismissing meetings

### Changed
- Brief JSON output now includes `synthesized`, `truncated`, `synthesis`, and `raw` fields (replaces `markdown`)
- Getting-started onboarding time updated from 15-30 to 30-45 minutes to reflect web research phase

---

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
