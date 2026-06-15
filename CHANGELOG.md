# Changelog

## [0.17.0] — 2026-06-14 — Active Topics ranked by open work; skill routing stops misfiring on common words

The agent's boot "Active Topics" list now surfaces and ranks topics by their open work, not just recency — reviving a filter/sort signal that had been dead because no live caller populated it. Separately, the `wrap` and `finalize-project` skills no longer collide, and the natural-language skill router stops letting a common word in a skill's name (or a bare single-word trigger) hijack queries — e.g. "finalize project" was landing on the read-only `project` brief.

### Added
- **`AreaMemoryService.getOpenItemsBySlug()`** — harvests the per-topic `open_items` already persisted in area-memory frontmatter (`.arete/memory/areas/*.md`) into a `Map<slug, count>`; bounded by the number of areas, parsed with the `yaml` package, never throws. Wired into the two boot-context call sites (`arete` memory-refresh CLAUDE.md regen and `arete update`) so `getActiveTopics` finally receives `openItemsBySlug`. The extraction-bias slug-list callers are deliberately left untouched.
- **Real `triggers:` on `finalize-project`** — the skill previously had no `triggers:` array, so it routed only by id/description luck. It now owns the project-archival phrases ("finalize project", "complete this project", "archive project", "archive this project", "commit changes to context").

### Changed
- **Active Topics rank by open work** — `getActiveTopics`' previously-dead `openItems > 0` keep-arm and open-items sort key are now live: a topic with open work stays in boot context regardless of age, and topics order by open-item weight (then recency, then slug). The v0.16.0 durable-status arm is retained as a complementary signal. The count is a deliberately-approximate ranking signal (a sum of never-decremented extraction snapshots, bounded by area-memory's 60-day exclusion), not a ledger.
- **`wrap` is lightweight-only for projects** — `wrap` drops the `archive this project` trigger and re-scopes its description to "close out completed work"; its archive step now structurally refuses to archive a `projects/active/` directory, redirecting to `finalize-project` for the full ceremony (dated archive, context reconciliation, closed-project retro) with an up-front hand-off — so `wrap` can never produce a second, divergent archive path. `work_type` corrected `review` → `analysis`.

### Fixed
- **Skill router no longer over-matches common words** — `scoreMatch` had three bugs: it matched a skill id against query tokens by *substring* (so "we" matched `week-plan`'s id), a dashified-id bonus that only ever misfired for single-word ids like `project` (granting +15 on any query containing that word), and a flat trigger weight that let a bare single-token trigger (`/project` → `["project"]`) tie a precise multi-word trigger. Now: id matches by token-equality; the dashified bonus applies to multi-word ids only (compared dash-to-dash); and trigger weight is specificity-ranked (multi-token 22 > id mention 20 > single-token 10). Result: "finalize project" / "complete this project" / "archive this project" route to `finalize-project`, "what did we learn" routes to `wrap`, and `weekly-winddown`'s own triggers no longer lose to `week-plan` — verified by a full per-skill routing sweep with zero new regressions.

## [0.16.0] — 2026-06-14 — Project search distinguishes drafts from decisions

`arete search` now labels project results by source folder and ranks in-progress `working/` drafts below everything else, so scratch no longer outranks a real decision. The qmd index is unchanged — results are reordered and labeled, not excluded. Also fixes durable-but-quiet topics silently dropping from the agent's boot context after 90 days.

### Added
- **Project-result provenance in `arete search`** — results under a project are tagged `[published]` (`outputs/` or the project `README.md`), `[reference]` (`inputs/`), or `[draft]` (`working/`); `working/` results are stable-sunk below all others. Path-keyed classifier (`classifyProvenance`/`applyProvenance` in `packages/cli/src/lib/provenance.ts`), applied after the minScore/person filters; the displayed relevance score is never mutated. The durable long-tail (project-root docs, `skill/`, `plan/`, etc.) stays neutral and unlabeled. Inverted from a "published allowlist" after validating against the real workspace — only `working/` is a reliable scratch signal. Agent guidance for the labels added to the CLAUDE.md generator.

### Fixed
- **Durable-status topics survive the boot recency cutoff** — `getActiveTopics` had been keeping only recently-refreshed topics because its `openItems` OR-branch was dead (`openItemsBySlug` is never populated by a live boot caller, collapsing the filter to recency-only). Topics with status `active`/`stable`/`blocked` now stay in the Active Topics list regardless of age; `stale`/`archived` still age out.

## [0.15.1] — 2026-06-12 — Wiki section no longer silently dropped on qmd timeout

Briefs (`/project` and every mode's "Related wiki pages" section) intermittently lost their wiki section run-to-run. Root cause: semantic wiki retrieval shells out to `qmd query` — an LLM expansion + embedding + rerank that takes ~6s on a realistic brief query — but shared the 5s timeout meant for BM25 `qmd search`. On timeout the rejection was swallowed to an empty result, indistinguishable from a genuine no-match, so the section was suppressed *and* the jaccard fallback was skipped.

### Fixed
- **qmd semantic timeout split out from BM25** — `qmd query` (semantic) now gets `SEMANTIC_TIMEOUT_MS=15000`; `qmd search` (keyword) keeps the 5s budget. A timeout is distinguished from a genuine qmd error (`isTimeoutError`) and surfaced as a degradation signal (opt-in `SearchOptions.onDegraded`) rather than masquerading as an empty result.
- **Degraded ≠ empty** — `retrieveRelevant` threads a `degraded` flag; `retrieveWiki` now falls through to the `listAll` + alias-jaccard fallback when the search was cut short, while still respecting a genuine empty (no spurious matches). `arete topic` reports a timeout instead of "No matching topics".

## [0.15.0] — 2026-06-11 — Area aliases: rename safety + integrity check

Areas can now be renamed without orphaning history. An area file declares its former slugs in `aliases:` frontmatter; historical `area:` references in meetings, projects, goals, topic pages, memory items, and commitments keep resolving and joining — stored data is never rewritten (point-in-time records stay as written).

### Added
- **`aliases:` frontmatter on areas** — `getAreaContext()` resolves former slugs (direct filename lookup always wins; duplicate aliases resolve first-claim-wins in slug order with a warning; an alias shadowing another area's canonical slug is ignored). New primitives `loadAreaAliasMap()` / `canonicalizeAreaSlug()`.
- **Canonical joins everywhere** — briefs (person/project/area/meeting), `meetingsForArea` (both the `area:` and `topics:` arms), `unionProjectCommitments`, `commitments listOpen --area`, area-memory aggregation, meeting-manifest generation, memory-index topic counts, and person-memory area stamping all compare canonicalized slugs, so old-slug content surfaces under the renamed area.
- **Write paths persist canonical only** — `arete meeting set-area`, `arete commitments create --area`, and area-memory file keying write the canonical slug even when given an alias (no alias laundering into new data).
- **`arete areas check`** — report-only integrity diagnostic: dangling `area:` references grouped by value (meetings, active+archived projects incl. prose `**Area**:` lines, notes, goals, topic pages), duplicate aliases, shadowing aliases, orphan area-keyed memory artifacts. `--json` supported; exit 1 on problems.



Completes the projects-first-class program (phases 13+14; plans under `dev/work/plans/arete-v2-chef-orchestrator/`). Projects now have a full read-in/write-back loop, and `area:` is a first-class edge on all three entities (projects, commitments, meetings).

### Added
- **Meeting area edge** — `arete meeting process` proposes an area (≥0.7 confidence, signal-typed: summary-only name matches refused, title-only flagged `name-only`); `arete meeting set-area` writes it on confirm with provenance; commitments created at approve inherit the meeting's area automatically. `arete meeting backfill-area` (preview-by-default / `--apply` / `--reset`, zero-write-call reruns) covers history. `meetingsForArea` prefers explicit `area:` — topic-mention leakage into area briefs ends once areas are applied (topics-union remains the fallback for untagged meetings; the multi-area recall trade-off is documented + tested).
- **`/update-project` write-back skill** — scans what changed since the README was last touched (area meetings, refreshed topics, new commitments), proposes itemized typed edits (status update, decision/learning, open question, meeting link, commitment claim, topics refresh) with per-item approval on the winddown "proposed" surface. Never auto-writes; rejecting leaves the README untouched. Acceptance case: the live "June-fixation" stale-goal-date contradiction, shipped as a named integration test.
- **`arete project refresh-topics`** — system-owned `topics:` frontmatter cache (cap 5, retrieval-score floor calibrated on live wiki pages); change-gated: same slug set → zero write calls even under `--apply`. Display-only by contract (tested — no consumer behavior depends on it).
- **Close→retro** — `finalize-project` now emits an idempotent `## Closed project:` retro entry to memory items, integrated to the wiki via the standard refresh path (no new wiki-write surface).
- **`arete commitments claim <id> --project <slug>`** — stamps/clears `projectSlug` so a sibling project's brief stops surfacing commitments another sibling has claimed.
- **Sibling projects derive from shared `area:`** (union with README links; archived `YYYY-MM_` dirs resolve); `jira:` frontmatter surfaced read-only in project briefs; `/project` triggers broadened ("load/review/look at project"); formatter polish (dated status prefixes, nested-bullet rendering, comment-free meeting excerpts).
- **PATTERNS.md**: "propose-edits-back-to-source-doc" interaction contract (winddown staged items, /update-project, future published-doc-sync).

### Fixed
- **Dropped ≠ done** — resolving a commitment as `dropped` (e.g. winddown dedup of mirror duplicates) no longer falsely checks its linked week.md/tasks.md tasks. Back-propagation now fires only for `resolved`. (Fired live 2026-06-10: 6 duplicate drops marked 7 tasks complete.)

## [0.13.0] — 2026-06-10 — Projects as first-class citizens (read side)

A project's area is now a reliably-present, system-derived field, so the already-built project brief lights up (plan: `dev/work/plans/arete-v2-chef-orchestrator/phase-12-projects-first-class/plan.md`, slices A+B+C; the write-back flow `/update-project` and close→retro are deferred to a follow-up phase).

### Added
- **Project area resolution** — `area` derives in priority order (frontmatter `area:` → `areas[0]` → prose `**Area**:` link line) in all project read paths; both project-brief constructors share one resolver. When no area resolves, the brief says so honestly in one line instead of silently degrading. Frontmatter/prose divergence warns.
- **`arete project backfill-area`** — preview-by-default inference of `area:` for area-less active projects (0.7 confidence floor; below it, nothing is proposed). `--apply` writes with `area_set_by: backfill` provenance; `--reset` reverts only backfill-stamped values. `--json` on all paths.
- **`arete project open <name>` + `/project` skill** — read-only project open: resolved brief + "what's new since the README was last touched" (area meetings, fresher topics, newly-opened commitments). Ties disambiguate top-N, never auto-load. Open performs zero writes (test-asserted).
- **Topic-aware, project-grained brief** — wiki re-rank query strengthened with README Key Questions/Background; commitments are project-claimed ∪ unclaimed-area (sibling-claimed excluded); sibling projects section (archived labeled).
- **Creation-time area proposal** — `general-project`, `create-prd`, and `discovery` skills propose a best-match area at project creation (optional, default + skip; never a blocking field).

## [0.12.0] — 2026-06-09 — Wiki repair (foundation fixes)

A verified audit found the wiki's write/read arteries degraded in ways rich data masked. This release repairs the foundation (plan + retro: `dev/work/plans/wiki-repair-foundation/plan.md`).

### Added
- **Meeting summaries on the live path** — `arete meeting approve` now writes `.arete/memory/summaries/meetings/<date>-<slug>.md` (own failure isolation; topic integration consumes the summary on the same approve, cutting integration tokens). `## Could include` headlines are persisted at `extract --stage` and carried into the summary's FYI section instead of vanishing.
- **Seed-lock resilience** — stale locks from killed runs are atomically taken over (rename-guarded exclusive break + own-pid verify); lock-blocked integration is surfaced loudly (exit stays 0) with a `topic-integration-skipped` log event.
- **Per-call LLM timeout** in the topic-integration path (120s default, `ARETE_LLM_TIMEOUT_MS`, one timeout-only retry, fails forward) — ends the wedged-`topic refresh` class.
- **Observability** — per-source `ingest` log events (`input_kind`, chars); log-append failures warn instead of vanishing; `topic refresh` prints `page N/M` progress; staleness labels ("as of YYYY-MM-DD — stale") on all brief wiki sections and extraction topic context.
- **Brief correctness** — decisions/learnings parser matches the live `items/` format with Topics-based area attribution (project briefs went from 0 to 100+ surfaced items, newest-first); recent-activity matching unions meeting `topics:` with `area:`; project display names fall back `name:`→`title:`→`project:`→slug.

### Removed
- **Org-entity dark code** (never fired in the live flow; ~−1,300 lines) and the **slack-thread-summaries shadow** (1-day orphan experiment incl. per-digest eval spend). `arete status`'s permanently-stale "Cross-Area Synthesis" fossil line dropped.

### Fixed
- qmd collections now verified-and-migrated on every `arete index`/`update` (tri-state verify; "unverifiable" surfaced); wrong recovery hint (`memory refresh` → `topic refresh`); process-meetings skill verb misnomer.

## [0.11.0] — 2026-06-09 — Areté v2 (chef-orchestrator)

Cumulative v2 effort (Phases 1–12). Large feature merge: the daily flow moves from step-by-step CLI/approve loops to a "chef" pattern (do-all-work-then-engage, curate-with-reason-labels, propose-with-MCP-action), the skills system splits into a managed + user layer, the memory system grows a summaries/wiki leg, and commitments get a v2 substrate with dedup. See `dev/work/plans/arete-v2-chef-orchestrator/POST-MORTEM.md` for the full program retro.

**Also in 0.11.0 (post-merge cleanup):** fixed BUG-1/2/3 → full test suite green (two were fixed-date-fixture test time-bombs, not product bugs; plus a `view` event-loop hang); un-truncated the extractor topic-bias list so low-ranked canonical topics reach the LLM bias; added `arete topic add-aliases`; dropped an inert `areas:` write from slack-digest (digest knowledge flows via `topics:`); persisted dupe→source mapping in the dedup-decisions log (rebuild seam for a future `[[unmerge]]` wire-in); and **restored meeting-agenda synthesis quality** — a deterministic agenda scaffold (`arete agenda scaffold`, with attendee-scoped priorities + dual-header discussion-topic extraction) carrying a themed-section framing pass, fixing the post-v2 agenda regression.

### Added
- **Chef-orchestrator skill pattern** — skills do all their analysis up front, then engage the user with curated proposals carrying reason labels, surfacing deferred work as a sidecar. Codified in `packages/runtime/skills/PATTERNS.md`; applied to the five Phase-2 daily-flow skills and propagated to `inbox-triage`, `email-triage`, `slack-digest`, `schedule-meeting` (Phase 4). (Phase 2's `ARETE_LEGACY_SKILL_PROSE` runtime rollback flag was sunset in Phase 3 — rollback is now a surgical per-skill `git revert` of the rewrite commit.) Lived daily-winddown median dropped from a 30–45 min baseline to ~21 min.
- **Two-tier skills split** — managed skills now live in `.arete/skills/` (refreshed by `arete update`) and user forks live in `.agents/skills/` (preserved). New `arete skill fork <name>` / `arete skill diff <name>` / `arete skill merge <name>` verbs let users fork a managed skill, see upstream changes after an update, and merge them. Adapter resolution prefers the user fork at agent-load time. `arete update` migrates pre-Phase-3 `.agents/skills/` copies into `.arete/skills/` (byte-equal) and preserves forks. Core: `services/skill-fork.ts`, `services/skill-resolver.ts`, `services/skills-local.ts`.
- **Wiki / summaries memory leg** — source-summary writers, org-entity pages, and summary-driven topic integration give the memory system the "raw → summaries + entities + concepts" Karpathy shape it lacked. Core: `services/summary-writer.ts`, `services/org-entity.ts`, `services/memory-summary-loader.ts`; models `source-summary.ts`, `org-entity.ts`, `memory-summary.ts`. Phase 3.5 added wiki discoverability surface.
- **Daily-winddown cross-skill reconciler** — the winddown orchestrator runs a shared per-day reconciliation surface; the chef mutates staged item status with reason labels rather than forcing one-by-one approvals (Phase 10).
- **Typed `arete brief` modes** — `arete brief` now takes exactly one of `--person`, `--project`, `--area`, `--meeting` (typed assemblers) or `--for` (free-text), restoring the pure-aggregator briefing that `prepare-meeting-agenda` regressed on after earlier over-stripping. `--raw` is retained as a no-op (raw is now the only mode; no LLM synthesis). Core: `services/brief-assemblers.ts`, `services/brief-formatters.ts` (Phase 9).
- **Commitment v2 + dedup** — v2 commitment substrate with counterparty parsing and a content hash (`commitments-hash-v2.ts`, `commitments-counterparty-parser.ts`), a reactive dedup pipeline reused retroactively via the new `arete dedup` command (`--dry-run` default, `--apply` under lock, `--explain <id>` for provenance), and a background dedup hygiene pass. Core: `services/background-dedup.ts`, `services/commitment-dedup-pipeline.ts`, `services/dedup-decisions-log.ts`, `services/dedup-explain.ts`, `services/extract-dedup-wiring.ts`.
- **Commitment migrations & backfill** — `arete commitments migrate` (v1→v2, dry-run by default, `--apply --owner-slug`, 24h quiet-window guard, pre-migration snapshot), `arete commitments backfill-area` (preview by default, `--apply`), `arete commitments restore --from <path>`, and `arete events backfill item-fates`. Core: `services/migrations/migrate-to-v2.ts`.
- **Topic detection as a first-class core service** — `services/topic-detection.ts` extracted as the shared lexical detector behind meeting + slack topic tagging.
- **Phase 11 external commitment resolution (ships gated OFF)** — Gmail-evidence auto-resolution (`arete commitments resolve-from-gmail`) is wired but dormant behind `PHASE_11_AUTO_RESOLVE_ENABLED=false`. Even when enabled it only *proposes*, never writes. The golden-set precision number is a hand-written oracle, not a real run — leave the gate false. `COMMITMENTS_V2_ACTIVE` also ships false (no downstream readers yet). Core: `services/commitment-resolution-pipeline.ts`, `services/resolution-decisions-log.ts`, `services/resolution-directives.ts`, `services/resolution-ordering.ts`.

### Changed
- **Phase-4 skill demotions** — 12 skill directories removed; several skill behaviors collapsed into CLI verbs / the chef pattern rather than standalone prose skills. The adds-vs-removes ledger went negative at Phase 4 (~+13 → ~+1 cumulative).

### Notes
- **Phase 12 (projects-first-class) is plan-only** — not built in this merge. It would derive a project's `area` so `arete brief --project` lights up, add a system-owned `topics:` cache, and ship `/project` + `/update-project` flows.
- **Ledger regrowth in Phases 9–12** — restoring `brief` and adding the Commitment-v2 + external-resolution substrate is net **+~13.3k production LOC**. Defensible per-item (regressed-capability restore + net-new substrate) but the "no add without a remove" rule was not enforced for these late phases; recorded as an eyes-open accepted exception.

## [0.10.1] - 2026-05-01

### Removed
- **Pre-monorepo legacy `/src/` and `/test/` directories** at repo root, plus the orphan `tsconfig.test.json`. Not in any active build path; legacy code did not compile due to broken imports.
- **Four zero-caller `@deprecated` symbols**: `extractKeywords` (area-memory), `findMatchingCompletedItem` (meeting-processing), `getDocument` on `KrispMcpClient` (Krisp MCP removed `get_document`), and `PRODUCT_RULES_ALLOW_LIST` (replaced by `getProductRulesAllowList(ideTarget)`).
- **`person-signals.ts` action-item LLM cluster** — `buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson`, plus `RawActionItemResult`, `VALID_ACTION_ITEM_DIRECTIONS`, and the orphaned regex fallback (`extractActionItemsRegex`, `THEY_OWE_PATTERNS`, `I_OWE_PATTERNS`, plus 5 file-private helpers `slugify` / `personPattern` / `mentionsPerson` / `isOwnerActor` / `isPersonActor`). Superseded by `parseActionItemsFromMeeting` from `meeting-parser.ts`. ~50 tests removed alongside.
- **`ContextService.getContextForSkill`** — zero in-repo callers.

### Changed
- **`ToolService` class → free `listTools` / `getTool` functions** in `@arete/core`. The class held no state beyond a `StorageAdapter` and existed to "mirror SkillService for consistency" — symmetry without payoff. Public surface change: `services.tools.list(toolsDir)` → `listTools(services.storage, toolsDir)`. Migrated 4 production call sites (`cli/{tool,route,skill}.ts`, factory wiring, services barrel) and 2 test files. The `services.tools` key is removed from `AreteServices`. Behavior unchanged: same `ToolDefinition` shape, same TOOL.md frontmatter parsing.
- **Refactor: extracted module-private `buildTopicWikiContext` helper** from the 47-line inline block in `meeting-context.ts`. Returns `{ context?: TopicWikiContext; warning?: string }`; caller assigns conditionally to preserve "absent key" semantics on `bundle.topicWikiContext`. Pure refactor; all 5 enrichment tests pass unmodified.

### Internal
- Net ~4.7K LOC removed across 90 files. Consolidates 3 LEARNINGS.md files (services, cli/commands, runtime/tools) and the core expertise PROFILE.md to reflect the post-refactor surface.

## [0.9.2] - 2026-04-30

### Fixed
- **Reconciliation false positives on real data.** The cross-meeting + LLM batch review pass was running on `reconciliation: fast` (Haiku) by default, which proved unreliable in practice — same inputs produced 6/6 false-positive flags on one run and 0/0 on the next. New workspaces created via `arete onboard` now ship with `reconciliation: standard` (Sonnet). Workspace-level `arete.yaml` values still win over the runtime default; existing workspaces should manually update `ai.tasks.reconciliation: fast → standard` to get the improvement.
- **`batchLLMReview` prompt over-aggressive.** Dropped the "Vague or unactionable items that add no signal" criterion — it was the loosest, most subjective bullet and produced the bulk of false-positive flags.
- **`batchLLMReview` scope mismatch.** The review now runs only on action items. "Skipped" / "already done" is coherent vocabulary for a commitment, but a learning is an insight and a decision is a point-in-time fact — neither has a "done" state. Decisions and learnings still get cross-meeting duplicate detection, but the disposition is different (see Changed below).

### Changed
- **Duplicate decisions and learnings are now silently merged into committed memory** instead of being marked `skipped`/`reconciled` in the staged sections. The matching content is already captured; surfacing it as "skipped" forced the user to dismiss something with no value. Action items keep the visible marker — that vocabulary is still right for a commitment.
- **JSON output shape**: `arete meeting extract --reconcile --json` adds a `silentlyMerged: { decisions, learnings }` field alongside the existing `skippedBySource`. Anyone scripting against the JSON output for "how many items did reconciliation drop?" needs `skippedBySource.reconciled + silentlyMerged.decisions + silentlyMerged.learnings` going forward.

## [0.9.1] - 2026-04-30

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
