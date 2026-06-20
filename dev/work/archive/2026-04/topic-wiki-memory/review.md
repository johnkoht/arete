# Topic Wiki Memory — Reviewer Feedback (v1 plan)

**Date**: 2026-04-22
**Reviewers**: 4 parallel Plan agents, distinct expert lanes
**Plan under review**: `plan.md` v1 (pre-synthesis)

## Convergent findings (≥2 reviewers)

1. **Topics already exist in the meeting-extraction pipeline.** `meeting-extraction.ts:651` already prompts the LLM for 3–6 topic slugs, `meeting-apply.ts:201` writes them to frontmatter, and ~5 arete-reserv meetings have populated `topics:`. The plan's "LLM proposal at ingest" would run a second, overlapping LLM call. **Must reframe Step 2 as consume-and-alias, not propose.** (Core)

2. **`MemoryService.search()` cannot return topic pages.** It hardcodes reads to `decisions.md`/`learnings.md`/`agent-observations.md` (`memory.ts:196-206`). Step 7's "qmd or `MemoryService.search()`" is wrong. Topic retrieval must go through `SearchProvider.semanticSearch()` with fallback provider for QMD-less installs. (Search, Core, Skills)

3. **qmd auto-covers topic pages.** `SCOPE_PATHS.memory = '.arete/memory'` with `**/*.md` mask (`qmd-setup.ts:410, 624`). Open question #6 closes with "yes, no config change." Topic writes must complete before `refreshQmdIndex` in meeting-apply for same-cycle retrieval. (Search)

4. **Cost discipline missing across most LLM-spending commands.** `seed-topics` was gated; `refresh --topics`, per-ingest topic updates (up to 25 calls per `meeting apply`), and `memory lint` were not. Every LLM-spending command needs `--dry-run` and `--confirm`/`--yes`. `meeting apply` needs `--skip-topics`. (CLI)

5. **Rule/doc updates missing from Critical Files.** `agent-memory.mdc`, `pm-workspace.mdc`, and `GUIDE.md` all enshrine L1/L2/L3 without topics. Shipping without updates creates contradictions on day one. (Skills)

6. **Ingest hook is under-specified.** Two distinct moments conflated: topic assignment (safe at `applyMeetingIntelligence`) vs topic-page rewrite (only safe at `commitApprovedItems`, after human approval of action items). (Core)

## Unique findings by lane

### Core / services (reviewer 1)

- Incremental rewrite contract is rhetoric without structured LLM output. Specify `{ updated_sections: Record<SectionName, string>, new_change_log_entry, new_open_questions? }` and merge section-by-section.
- `sources_hash` + `sources_integrated` not disambiguated — specify: `sources_integrated: [{path, date, hash}]`.
- Aliasing at Jaccard ≥0.8 is too loose for slugs. Add LLM adjudication at propose-time (Haiku batch).
- `topics.enabled` feature flag is not a pattern used elsewhere; gate on `callLLM` presence only.
- `TopicMemoryService` must be wired in `factory.ts` or it's invisible to CLI.
- Reuse `parseMeetingFile` (`meeting-context.ts:959`); don't re-parse.
- Services must use `StorageAdapter`, not `fs` (`services/LEARNINGS.md:35`).

### CLI / UX (reviewer 2)

- `--topics` vs `--topic <slug>` vs `refresh-topics` tangle + collision with `computed-topic-memory/design.md:117`. **Move all topic commands to the `arete topic` noun** (mirrors `arete people`).
- Make topic refresh part of the default `arete memory refresh` path, gated on `services.ai.isConfigured()` — same pattern as cross-area synthesis (`intelligence.ts:481-486`).
- Every new command needs empty-workspace, no-LLM, missing-slug, and broken-wikilink behavior spelled out as AC (not "returns reasonable output").
- `arete status` integration needs `services.topicMemory.listTopicMemoryStatus()` method mirroring area-memory. Stale threshold should be configurable (`arete config set topics.stale_days`).
- JSON-mode outputs must be parseable in error paths. All file-writing commands need `--skip-qmd` per LEARNINGS.md.
- Global `ARETE_NO_LLM=1` escape hatch.

### Skills / runtime (reviewer 3)

- **Actual grep finding**: no skill or cursor rule reads named sections of `.arete/memory/areas/*.md` today. Plan overstates regression risk from removing Keywords/Recently-Completed.
- Skills read the **user-curated** `areas/<slug>.md` (workspace root) via `AreaParserService` (`PATTERNS.md:128–138`) — different file. Plan conflates these in places.
- Bigger risk: context-bundle word budget (`PATTERNS.md:585–595` — 1000 words for memory). A single topic page can exceed that. Specify truncation: frontmatter + Current state only by default.
- Add a named `topic_page_retrieval` pattern in `PATTERNS.md`. Reference it from `context_bundle_assembly` and `contextual_memory_search`.
- Decision needed on `intelligence: topic_retrieval` vs folding into `memory_retrieval`. Reviewer leans toward distinct mode with alias; simpler path is fold-into-memory.
- Rule updates mandatory: `agent-memory.mdc`, `pm-workspace.mdc`, `GUIDE.md` — all three document the L1/L2/L3 model.

### Search / indexing (reviewer 4)

- qmd coverage is automatic; drop open question #6.
- Step 7: use `SearchProvider.semanticSearch(q, { paths: ['.arete/memory/topics/'] })` — the `providers/fallback.ts:137` handles QMD-less silently. Pattern exists at `meeting-reconciliation.ts:113` (`matchPriorWorkspace`).
- `index.md` is redundant with qmd for retrieval. Keep only if it serves Obsidian as a landing page; then regenerate **only on `arete memory refresh`**, not on every write.
- `log.md` needs strict grammar: `## [ISO-8601Z] event | topic=<slug> source=<path> sources_hash=<h> llm_model=<m> llm_cost_usd=<n>`. Without `llm_model` and `sources_hash` in the log, replay/debug is impossible.
- Lint split into two:
  - Phase 3 (cheap/deterministic): orphans via `\[\[([a-z0-9-]+)\]\]` regex; stale via `last_refreshed`; empty via body length; near-duplicates via `jaccardSimilarity` in `utils/similarity.ts:28` (already used by `hygiene.ts:346`).
  - Phase 5 (LLM): actual contradiction diff pass — Jaccard can't tell "shipping Friday" from "delayed to May."
- No existing `[[wikilink]]` parser in core — new primitive #1.
- Meeting-apply flow: Steps 2/3 writes must complete before `meeting.ts:958` `refreshQmdIndex` call.

## Reviewer sign-offs (what's fine as-is)

- Function-injection `callLLM?: LLMCallFn` pattern (Steps 2, 3) matches `refreshPersonMemory` + `refreshAllAreaMemory` conventions. (Core)
- Pure render/parse separation (Step 1) matches `person-memory.ts` pattern. (Core)
- Sentinel-comment pattern on *topic pages* is justified (user-writable annotations outside the block). Sentinels on `index.md`/`log.md` are **not** justified — those are system-owned. (Core)
- BUILDER/GUIDE boundary is clean — topics are correctly GUIDE-only. (Skills)
- L2 remaining atomic and user-approved — no reviewer objected. (Implicit)
- `summaries/` staying alone — no reviewer objected. (Implicit)

## Rejected / pushed back

- `AUTO_MEMORY` sentinels on `index.md`/`log.md` — overruled by Core reviewer, dropped in v2.
- `topics.enabled` feature flag — overruled, dropped in v2 (gate on callLLM only).
- `--topics` flag on `arete memory refresh` — overruled, moved to `arete topic` noun in v2.
- "Skills that relied on Keywords/Recently-Completed may degrade" risk line — overruled by Skills reviewer's grep, replaced with real risks in v2.

## Decisions deferred to follow-up plans

- `intelligence: topic_retrieval` vs fold-into-`memory_retrieval` — defaulted to fold-into-memory in v2 (simpler migration); a follow-up plan can introduce the distinct mode if skill authoring ergonomics demand it.
- Background-queue vs sync topic updates at ingest — defaulted to sync with `--skip-topics` escape in v2; move to background queue if `meeting apply` feels slow in practice.
- Phase 5 LLM-driven contradiction lint — split out as its own plan.
- `summaries/collaboration.md` + `summaries/sessions.md` wiring — separate plan.
- `agent-observations.md` writer-of-record — separate plan.
- Auto-close / archive behavior for stable topics — separate plan.

---

## Round 2 review (Step 9 CLAUDE.md addition)

Scope: single core-services lead review on the added Step 9 (boot
context via CLAUDE.md regeneration) and Step 2's shared-formatter
addition.

### Load-bearing correctness fixes (folded into v3)

1. **`update()` contract was wrong.** Passing `memory = undefined` on
   `arete update` silently strips Active Topics for days until the
   next refresh. Fixed: all three call-sites (init / update / refresh)
   load memory with failure fallback; only `init` legitimately has
   `memory = undefined` (no memory exists yet on fresh workspace).
   Contract table added to §9.4.

2. **Idempotency was aspirational, not real.** `generateFooter()` at
   `claude-md.ts:140` bumps timestamp every call; "Last refreshed:
   YYYY-MM-DD" header was using wall clock; sort had no slug
   tiebreak. "Byte-equal = no write" could never hold. Fixed: footer
   stripped of wall-clock; section header shows
   `max(entries[].lastRefreshed)` not `Date.now()`; sort tiebreaks
   on slug; ASCII compare only; dedicated clock-stability test
   (`Date.now()` mocked 24h forward, same inputs → byte-equal output).

3. **Shared formatter was wrong shape.** One `renderActiveTopicsBlock`
   used by both CLAUDE.md and the extraction LLM prompt was a leaky
   abstraction — wikilinks in an LLM prompt round-trip as `[[...]]`
   in the output JSON's `topics[]` field. Fixed: split into data
   primitive (`getActiveTopics`) + two view renderers
   (`renderActiveTopicsAsWikilinks` for CLAUDE.md,
   `renderActiveTopicsAsSlugList` for the extraction prompt).
   Relocated to `packages/core/src/models/active-topics.ts` to fix
   a generators-importing-from-services layer inversion.

### Architectural corrections (folded into v3)

4. **`MemorySummary` moved to `models/`**, not
   `generators/claude-md.ts` or `services/topic-memory.ts`. Avoids
   the adapter interface importing service types.

5. **CursorAdapter no longer silent-accepts memory.** Phase A
   contract: `supportsMemoryInjection() → false` and refuses the
   param at the type level. Signature-level enforcement prevents
   Phase B from being perpetually deferred without the compiler
   noticing.

### Failure modes expanded

6. **Partial memory state** (corrupt topic file): `listAll()` returns
   `{ topics, errors }`; valid topics still render; errors logged
   to stderr.
7. **Double-fallback safety**: if `generateClaudeMd` throws even
   without memory, do not write — leave existing CLAUDE.md
   untouched.
8. **Storage atomicity**: explicit contract requirement that
   `StorageAdapter.write` is atomic (tmp + rename). Test added.
9. **Concurrent refresh + update race**: documented (next refresh
   restores); optional `.arete/.refresh.lock` deferred.

### Observability added

Refresh stdout now distinguishes `updated` vs `unchanged` writes;
`arete status` shows CLAUDE.md memory age; `log.md` gains
`claude_md_regen` event kind.

### Sound without changes

- Extending the pure generator is the right seam (not a separate
  appender).
- Gating on `services.ai.isConfigured()` follows existing patterns.
- Wholesale overwrite (no sentinels) matches
  `adapters/LEARNINGS.md:21`.

### Full test matrix

16 test rows specified in §9.7, covering: no-memory regression,
byte-equality within day, byte-equality across day boundary, sort
stability, locale independence, view renderer differences, partial
memory state, idempotent write (both branches), init/update/refresh
integration, double-fallback safety, storage atomicity, and Cursor
type-level refusal.

