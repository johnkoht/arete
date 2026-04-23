---
title: "Topic Wiki Memory: Encyclopedic L3 for AI Consumption"
slug: topic-wiki-memory
status: in_progress
size: large
tags: [memory, l3, topics, wiki, ingest, area-memory, context]
created: "2026-04-22T00:00:00.000Z"
updated: "2026-04-22T00:00:00.000Z"
execution: null
has_review: true
has_pre_mortem: false
has_prd: false
steps: 10
---

# Topic Wiki Memory: Encyclopedic L3 for AI Consumption

> **v2** — incorporates feedback from four parallel lane reviews
> (core / CLI / skills / search). See `review.md` for raw reviewer
> output and decisions.

## Context

Areté's current L3 memory (`.arete/memory/areas/*.md`) is an operational
rollup: a flat list of keywords, active people, open commitments,
recently completed commitments, and recent decisions — all partitioned
by **work area** (glance-communications, pm-operations, etc.).

This is useful for a human scanning "what's open in my area," but it is
a poor substrate for AI consumption. A real area file in
`~/code/arete-reserv/.arete/memory/areas/glance-communications.md`
contains ~50 people names and ~50 commitment lines with no synthesis,
no cross-references, and no narrative about any specific topic.

When an AI is asked "what's the state of Cover Whale email templates?",
it must re-derive the story by scanning 11 meeting files. The current L3
does not help — Cover Whale, LEAP, DOI language, signature logic, and
inbound email are all flattened into one bucket.

**Karpathy's personal-wiki pattern** (gist referenced in
`memory/reference_karpathy_knowledge_bases.md`) is the inspiration:
the LLM incrementally builds and maintains a **persistent, compounding
wiki** of topic pages. Knowledge is compiled once on ingest and kept
current, not re-derived on every query. The cross-references are
already there. The synthesis has already happened.

This plan introduces **topic pages as first-class L3 entities** and
reshapes the existing area memory into a thin navigation index.

### Contrast with `computed-topic-memory` plan

A parallel plan at `dev/work/plans/computed-topic-memory/design.md`
(2026-04-22) addresses a **different** problem: dedup in meeting
extraction via an ActivityStore read-view and a `findSimilar` cascade.
That plan explicitly rejects topic pages and a new `summaries/`
directory as "user-hostile."

The two plans are complementary, not contradictory:

- **computed-topic-memory** = plumbing layer for dedup + activity views
  (operational, query-time)
- **topic-wiki-memory** (this plan) = knowledge layer for AI context
  injection (encyclopedic, ingest-time)

Both extend the same `.arete/memory/` tree and both rely on the
`AreaMemoryService` refresh pipeline. If both ship, the ActivityStore
from computed-topic-memory becomes an ideal input to this plan's topic
ingest algorithm.

### What exists today (corrected from v1)

- `AreaMemoryService.refreshAreaMemory()` computes a per-area rollup
  file at `.arete/memory/areas/<slug>.md`
  (`packages/core/src/services/area-memory.ts:439`)
- `EntityService.refreshPersonMemory()` maintains an auto-section inside
  each `people/**/*.md` file between sentinel comments
  (`packages/core/src/services/entity.ts:1012`)
- **Meeting extraction already proposes topics.** `meeting-extraction.ts:651`
  prompts the LLM for 3–6 slugified topics per meeting;
  `meeting-apply.ts:201` writes them to frontmatter; a handful of
  arete-reserv meetings have populated `topics:`. `area-memory.ts:886-898`
  already aggregates `fm.topics` into the area file's existing
  `## Topics` section as `TopicEntry` with `{slug, meetingCount, openItems, lastReferenced}`.
  **This plan consumes and enriches that pipeline, not replaces it.**
- `MemoryService.search()` is hardcoded to L2 items only
  (`packages/core/src/services/memory.ts:196-206`); it cannot be used
  for topic retrieval without refactor.
- qmd's `memory` scope already covers `.arete/memory/**/*.md`
  via `SCOPE_PATHS.memory = '.arete/memory'` with `**/*.md` mask
  (`packages/core/src/search/qmd-setup.ts:410, 624`). **No qmd config
  change is needed** for topic pages to be indexed.
- `_synthesis.md` is LLM-written cross-area prose
  (cross-area-synthesis plan, shipped 2026-04-06).
- `.arete/memory/summaries/` is a scaffolded-but-empty directory with
  no writer-of-record. This plan leaves it alone.

### What's missing (that this plan adds)

1. A topic-scoped encyclopedic page per meaningful subject
   (e.g., `cover-whale-templates`, `leap-templates`, `signature-logic`)
2. An alias/merge pass at meeting-apply time that reconciles the
   LLM's extracted topics against existing topic pages
3. An incremental "integrate-source" pass that updates touched
   topic pages when meetings are committed (post-approval)
4. An optional wiki-level `index.md` (Obsidian landing page) and
   strict-grammar `log.md` (audit/replay)
5. Cross-topic and topic-to-person edges via Obsidian-style `[[wikilinks]]`
6. A lint pass (deterministic in Phase 3; LLM-driven in follow-up Phase 5)
   for stale, orphan, empty, and near-duplicate topics

## Resolved decisions (v2)

Decisions pre-baked into this plan (reviewers may challenge, but
the default stance is):

1. **Topics are consumed from existing meeting extraction**, not
   re-proposed. `meeting-extraction.ts` already emits 3–6 topic
   slugs; `TopicMemoryService` runs an alias/merge pass at
   apply-time to normalize slugs against existing topics and
   LLM-adjudicate near-duplicates. No second proposal pass.

2. **L2 primitives stay atomic and user-approved.** `decisions.md`,
   `learnings.md`, `agent-observations.md` remain the citation layer.
   Topic pages **reference** L2 entries via `[[slug]]`-style links;
   they do not duplicate them. No new approval flow for topic page
   content — topic pages are regenerated from L1+L2, not authored.

3. **Area memory shrinks to a navigation index.** Keywords section is
   removed. Active People trimmed to last-30-day activity. Recently
   Completed removed (absorbed into topic-page narratives). A new
   `## Topics` section lists topic pages in this area with one-line
   status. Open Work stays (the area's inbox view, genuinely different
   from the wiki). Skills/rules grep confirms no current dependency on
   the removed sections.

4. **Commitments stay read-only input.** The parallel
   `merge-commitments-into-tasks` worktree may restructure commitment
   storage; this plan consumes whatever primitive exists without
   reshaping it.

5. **Topic pages live at `.arete/memory/topics/*.md`.** The empty
   `summaries/` scaffold is **not repurposed** for topics.

6. **Incremental update on ingest is the core pattern.** The LLM
   receives the existing topic page + the new source + relevant L2
   items, and returns **structured section-by-section output**:
   `{ updated_sections: Record<SectionName, string>,
     new_change_log_entry: string, new_open_questions?: string[] }`.
   `TopicMemoryService` merges section-by-section into the parsed
   `TopicPage`, then re-renders. Full regeneration from all sources
   is a separate `refresh --all` path.

7. **Obsidian-style `[[wikilinks]]`** for cross-references. Parsed
   via `\[\[([a-z0-9-]+)\]\]` regex (new primitive — no existing
   wikilink parser in the codebase).

8. **Topic pages do NOT use `AUTO_TOPIC_MEMORY` sentinels.**
   Like `AreaMemoryService` output, topic pages are fully
   system-owned and overwritten wholesale on write. Users who want
   to annotate maintain a sibling file (out of scope here). Sentinels
   reserved for files that mix system and user content (person
   files), which topic pages don't.

9. **`index.md` and `log.md` are also fully system-owned**, no
   sentinels. `index.md` regenerated only on `arete memory refresh`
   (not on every write) — Obsidian-facing landing page, not a
   retrieval substrate. `log.md` is append-only with strict grammar
   (see Step 5).

10. **LLM gating follows the existing `callLLM` presence pattern.**
    No new `topics.enabled` config flag. Commands and services
    behave identically to `refreshPersonMemory` /
    `refreshAllAreaMemory`: skip topic work silently when
    `services.ai.isConfigured()` is false.

11. **Retrieval goes through `SearchProvider.semanticSearch()`** with
    path filter `{ paths: ['.arete/memory/topics/'] }`. The fallback
    provider handles QMD-less installs via token search over the
    same files. `MemoryService.search()` is **not** used for topic
    retrieval.

12. **Agent boot context lives in CLAUDE.md**, populated by extending
    the existing pure generator `generateClaudeMd()`. CLAUDE.md is
    already auto-loaded by Claude Code, already fully Areté-owned
    (regenerated on `arete init` / `arete update`), and already
    assembles derived content (slash commands from installed skills).
    Adding a derived "Active Topics" section is the same pattern.
    A new `AGENTS.local.md` convention is **not introduced** —
    no tool auto-loads it. Cursor/Codex AGENTS.md gets the same
    treatment in Phase B (asymmetric adapter path; CursorAdapter
    reads `dist/AGENTS.md` and transforms rather than generating
    purely, so injection requires a different approach).

13. **Extraction prompt and CLAUDE.md share the underlying active-topics
    data but use view-specific renderers**:
    `getActiveTopics(topics)` is the single source of truth. CLAUDE.md
    renders via `renderActiveTopicsAsWikilinks()` (Obsidian `[[...]]`
    links for agent navigation). The extraction LLM prompt renders
    via `renderActiveTopicsAsSlugList()` (bare slugs — wikilinks in an
    LLM prompt would leak `[[...]]` into the LLM's JSON output).
    Both renderers are pure functions in `models/active-topics.ts` so
    the generator and extraction service can depend on them without
    layer inversion.

## Critical files

| File | Role |
|------|------|
| `packages/core/src/services/topic-memory.ts` | **NEW** — TopicMemoryService: alias, merge, render, parse, integrateSource, refreshAllTopics, listTopicMemoryStatus |
| `packages/core/src/models/topic-page.ts` | **NEW** — TopicPage type + pure render/parse helpers |
| `packages/core/src/services/area-memory.ts` | Shrink output (remove Keywords + Recently Completed, add Topics index); no change to `refreshAreaMemory` signature |
| `packages/core/src/services/meeting-apply.ts` | Hook 1: alias/merge topic slugs into meeting frontmatter at apply time |
| `packages/core/src/services/meeting-commit.ts` (or wherever `commitApprovedItems` lives) | Hook 2: call `integrateSource` for each assigned topic after action-item approval |
| `packages/core/src/services/meeting-extraction.ts` | Read-only reference — keep extraction-time topic prompts unchanged |
| `packages/core/src/services/meeting-context.ts` | Reuse `parseMeetingFile` exported at line 959 |
| `packages/core/src/services/factory.ts` | Wire `TopicMemoryService` into service DI so CLI can reach it |
| `packages/core/src/utils/similarity.ts` | Reuse `jaccardSimilarity` for alias pass + lint near-dup detection |
| `packages/core/src/search/providers/fallback.ts` | Retrieval contract — `semanticSearch` with path filter |
| `packages/core/src/models/memory-summary.ts` | **NEW** — `MemorySummary` type lives at model layer (not services, not generators); avoids layer inversion |
| `packages/core/src/models/active-topics.ts` | **NEW** — `getActiveTopics(topics, opts)` data primitive + two view renderers: `renderActiveTopicsAsWikilinks()` (CLAUDE.md) and `renderActiveTopicsAsSlugList()` (extraction prompt) |
| `packages/core/src/generators/claude-md.ts` | Extend `generateClaudeMd()` to accept optional `memory?: MemorySummary`; add Active Topics section; stabilize footer (no wall-clock timestamps) |
| `packages/core/src/adapters/claude-adapter.ts` | Pass `memory` through `generateRootFiles` signature |
| `packages/core/src/adapters/ide-adapter.ts` | Add `supportsMemoryInjection(): boolean` capability method (default false) + optional `memory?: MemorySummary` to `generateRootFiles` |
| `packages/core/src/adapters/cursor-adapter.ts` | Return `false` from `supportsMemoryInjection()`; **do not accept the memory param** in Phase A (enforces explicit Phase B migration) |
| `packages/core/src/services/workspace.ts` | Init/update/refresh all load memory with failure fallback to `undefined`; new `regenerateRootFiles()` method |
| `packages/core/src/services/topic-memory.ts` | Export `listAll()` returning `{ topics, errors }` (partial-state tolerant) |
| `packages/cli/src/commands/topic.ts` | **NEW** — `arete topic list / show / refresh / lint / seed` |
| `packages/cli/src/commands/intelligence.ts` | `arete memory refresh` gains transparent topic refresh when AI configured |
| `packages/cli/src/commands/status.ts` | Surface stale/orphan/stub topic counts |
| `packages/cli/src/commands/meeting.ts` | Add `--skip-topics`; ensure topic writes complete before `refreshQmdIndex` call at line 958 |
| `packages/runtime/skills/PATTERNS.md` | **NEW pattern** — `topic_page_retrieval` with inputs, ranking, budget, truncation |
| `packages/runtime/skills/meeting-prep/SKILL.md` | Reference new pattern |
| `packages/runtime/skills/create-prd/SKILL.md` | Reference new pattern |
| `packages/runtime/skills/week-plan/SKILL.md` | Reference new pattern |
| `packages/runtime/skills/process-meetings/SKILL.md` | Reference new pattern |
| `packages/runtime/rules/cursor/agent-memory.mdc` | Update L1/L2/L3 model to include topics |
| `packages/runtime/rules/cursor/pm-workspace.mdc` | Same |
| `packages/runtime/GUIDE.md` | "Memory System" section (~line 1241) — include topic pages |
| `.arete/memory/topics/` | **NEW** — directory of topic pages |
| `.arete/memory/index.md` | **NEW** — Obsidian landing page, regenerated on `memory refresh` only |
| `.arete/memory/log.md` | **NEW** — append-only ingest/refresh event log with strict grammar |

## Plan

### Step 1 — Define topic page schema, renderer, parser

Schema:

- Frontmatter: `topic_slug`, `area`, `status`, `aliases[]`,
  `entities.people[]`, `entities.related_topics[]`, `first_seen`,
  `last_refreshed`, `sources_integrated: [{path, date, hash}]`
  (explicit shape; no separate `sources_hash` field)
- Sections in render order: `Current state`, `Why/background`,
  `Scope and behavior`, `Rollout/timeline` (optional),
  `Open questions`, `Known gaps`, `Relationships`, `Source trail`,
  `Change log`

Topic pages are **fully system-owned** — no sentinels; regenerated
wholesale on `refresh --all`; merged section-by-section on
`integrateSource`.

Pure helpers in `packages/core/src/models/topic-page.ts`:

- `renderTopicPage(page: TopicPage): string`
- `parseTopicPage(content: string): TopicPage | null`

No I/O in the model. Service layer (`TopicMemoryService`) uses
`StorageAdapter` exclusively — no direct `fs` calls (see
`services/LEARNINGS.md:35`).

**AC**:
- Schema documented in a module-level comment in `topic-page.ts`
- Render/parse round-trip lossless for all fields
- Unit tests at `packages/core/test/models/topic-page.test.ts`
- Exports: `TopicPage`, `renderTopicPage`, `parseTopicPage`, `SECTION_NAMES`

### Step 2 — Consume meeting-extraction topics; alias/merge at apply time

**Bias extraction with active topic slugs.** Before the alias/merge
pass, update `meeting-extraction.ts:651` to include the current active
topics list in the extraction prompt so the LLM prefers reuse at
propose-time. Uses `renderActiveTopicsAsSlugList()` from
`packages/core/src/models/active-topics.ts` — **bare slugs, no
wikilinks** (wikilinks in an LLM prompt would round-trip as `[[...]]`
in the output JSON's `topics[]` field).

Prompt addition after the JSON schema:

```
Prefer these existing topic slugs when applicable. Only propose a new
slug if the meeting is substantively about something not in the list:

cover-whale-templates — staging-validated, awaiting pilot adjusters
leap-templates — in staging testing
signature-logic — open compliance question
...
```

Data source identical to CLAUDE.md's Active Topics (`getActiveTopics()`
data primitive); only the view renderer differs. This is the first
line of defense against topic sprawl; the Jaccard + LLM alias pass
below is the second.



**Hook**: `applyMeetingIntelligence` — runs after meeting frontmatter is
finalized but before action items are committed. Safe to run here
because this step only normalizes/aliases slugs; no topic-page writes.

Algorithm:

1. Read `intelligence.topics[]` — already produced by
   `meeting-extraction.ts:651`.
2. For each slug, check against existing topic pages at
   `.arete/memory/topics/*.md` (slug + `aliases[]` from frontmatter).
3. **Jaccard alias check** (`utils/similarity.ts:28`): if a candidate
   scores ≥0.6 against any existing slug+aliases, short-circuit to the
   existing slug.
4. **LLM adjudication** for 0.4–0.6 (ambiguous band) — batch all
   ambiguous candidates in a single Haiku call and ask "is this the
   same topic as any existing slug?" Follows the `batchLLMReview`
   pattern in `meeting-reconciliation.ts:670`.
5. Below 0.4: treat as new topic. Create a stub page with only
   frontmatter + empty sections; real content arrives in Step 3.
6. Write-back normalized slugs to meeting frontmatter `topics:`.

Gating: function-injection `callLLM?: LLMCallFn` via service options
(matches `refreshPersonMemory`). Without `callLLM`, Step 2 still runs
the deterministic Jaccard check but skips adjudication — ambiguous
candidates become new topics (sub-optimal but safe; lint will flag
near-duplicates later).

**AC**:
- `TopicMemoryService.aliasAndMerge(candidates, callLLM?)`
  returns normalized slugs with provenance
- Meeting frontmatter `topics:` populated post-apply
- Zero cost when `callLLM` absent (Jaccard only)
- Idempotent: re-running on same meeting produces identical slugs
- Unit tests cover all three bands (>0.6 coerce, 0.4–0.6 LLM, <0.4 new)

### Step 3 — Incremental topic page update at commit time

**Hook**: `commitApprovedItems` — runs after the user approves the
meeting's action items. Topic-page rewrites happen only for meetings
whose extraction the user has actually accepted.

For each topic slug on the committed meeting:

1. Read existing topic page (or the Step 2 stub).
2. Build prompt with: existing topic page body + the new meeting's
   notes/transcript + L2 items (decisions, learnings) filtered by
   meeting area and mentioning the topic slug.
3. Request **structured LLM output** (JSON):
   ```ts
   type IntegrateOutput = {
     updated_sections: Partial<Record<SectionName, string>>;
     new_change_log_entry: string;
     new_open_questions?: string[];
     new_known_gaps?: string[];
   }
   ```
4. Merge into parsed `TopicPage`: overwrite each returned section,
   append the change log entry, append to open_questions and
   known_gaps. Leave other sections untouched.
5. Update frontmatter: `last_refreshed`, append
   `sources_integrated: {path, date, hash}`, update
   `entities.people[]` and `entities.related_topics[]` if new refs.
6. Re-render and write via `StorageAdapter`.

**Ordering invariant**: Step 3 writes must complete before
`refreshQmdIndex` is called in `meeting.ts:958`. Otherwise topic
pages lag qmd by one meeting-apply cycle.

**Fallback (no `callLLM`)**: write a minimal `Source trail` entry
(bulleted meeting link) and append `Change log` line. No narrative
synthesis, but the edge is recorded. Topic page remains retrievable.

**Cost**: ~$0.01–$0.03 per (topic, meeting) pair using Haiku with
structured output.

**AC**:
- `TopicMemoryService.integrateSource(topicSlug, meetingPath, callLLM?)`
  idempotent per `(topicSlug, meeting.path, meeting.mtime-hash)` —
  re-running is a no-op
- Structured LLM output validated against Zod-like schema; malformed
  output → fallback path
- `sources_integrated` frontmatter grows append-only
- Post-write ordering documented as a test
- Unit tests for the happy path, malformed LLM output, no-LLM fallback

### Step 4 — Shrink `AreaMemoryService` output

Refactor `computeAreaData` + `renderAreaMemory` in
`packages/core/src/services/area-memory.ts`:

- **Remove**: Keywords section, Recently Completed section
- **Add**: Topics section — one line per topic in this area
  `- [[cover-whale-templates]] — staging-validated — awaiting pilot adjusters (updated: 2026-04-22)`
- **Keep, trimmed**: Active People → last 30d only, sorted by recency
- **Keep, unchanged**: Open Work (inbox view)
- **Keep, unchanged**: Recent Decisions (pointers to `decisions.md`)

Existing area files overwrite on next refresh. No migration step.

**AC**:
- Updated tests in `packages/core/test/services/area-memory.test.ts`
- `arete memory refresh --area <slug>` produces new shape
- Skills/rules grep (done during review — no dependencies on removed
  sections) documented in test comments

### Step 5 — `index.md` (Obsidian landing) + `log.md` (strict-grammar audit)

**`index.md`** — regenerated only on `arete memory refresh`
(not on per-ingest writes). Organized by type, alphabetical within:

```markdown
# Memory Index

## Topics
- [[cover-whale-templates]] — staging-validated (2026-04-22)
- [[leap-templates]] — in-staging-testing (2026-04-20)
- ...

## People
- [[anthony-avina]] — engineering, active
- ...

## Areas
- [[glance-communications]] — 6 topics, 12 open items
- ...
```

**`log.md`** — append-only with strict grammar. Every line matches:

```
## [YYYY-MM-DDTHH:MM:SSZ] <event> | <k=v pairs>
```

Required fields per event:

| Event | Required fields |
|-------|-----------------|
| `ingest` | `topic=<slug>`, `source=<meeting-path>`, `sources_hash=<h>`, `llm_model=<m>`, `llm_cost_usd=<n>` |
| `refresh` | `scope=<all|topic|area|person>`, `targets=<n>`, `llm_cost_usd=<n>` |
| `lint` | `findings=<n>`, `by_kind=<k1:n1,k2:n2>` |
| `seed` | `meetings=<n>`, `topics_created=<n>`, `llm_cost_usd=<n>` |
| `failure` | `target=<slug>`, `error=<short-msg>` |

Multi-line details go in a fenced block **below** the prefix line so
`grep "^## \[" log.md` returns a clean timeline.

**AC**:
- Grammar documented at the top of `log.md` (intro lines before first
  `## [` entry)
- Parser for the line format exists as
  `packages/core/src/utils/memory-log.ts` (enables later replay tooling)
- Unit tests roundtrip every event kind
- `index.md` regeneration idempotent; no writes if content unchanged

### Step 6 — CLI surface

**Adopt the `arete topic` noun** (mirrors `arete people`).

New in `packages/cli/src/commands/topic.ts`:

- `arete topic list [--area <slug>] [--json]`
- `arete topic show <slug> [--json]`
- `arete topic refresh [<slug>] [--all] [--dry-run] [--confirm] [--skip-qmd]`
- `arete topic lint [--fix-orphans] [--json]`
- `arete topic seed [--dry-run] [--confirm] [--skip-qmd]`

Existing in `intelligence.ts`:

- `arete memory refresh` **(unchanged interface)** — transparently
  refreshes topics when `services.ai.isConfigured()`. Same pattern as
  cross-area synthesis at `intelligence.ts:481-486`. Gracefully skipped
  otherwise.

Existing in `meeting.ts`:

- `arete meeting apply` gains `--skip-topics` to defer topic
  integration. Prints "Will integrate N topics (~$X) — use
  --skip-topics to defer" before spending.

Cost/destructive discipline (**every LLM-spending command**):

- `--dry-run`: prints target count + cost estimate, no writes, no LLM
- `--confirm` (interactive prompt) / `--yes` (scripted) required for
  writes above a cost threshold (default $1 USD per invocation)
- `--skip-qmd` honored per `cli/src/commands/LEARNINGS.md:31-35`
- Global escape: `ARETE_NO_LLM=1` forces callLLM unavailable

Empty-workspace / error behavior (per-command ACs, not "reasonable"):

| Command | Empty workspace | No LLM | Missing slug |
|---------|----------------|--------|--------------|
| `topic list` | `info('No topics yet.')` + hint | OK | n/a |
| `topic show <slug>` | error: "No topics." | OK if topic exists | suggest `topic list` |
| `topic refresh` | exit 0, `info('No topics to refresh.')` | exit 1: "AI not configured; pass --allow-no-llm to write stub trails only" | error + list |
| `topic lint` | exit 0 with zero findings | OK (deterministic lint only; LLM pass skipped) | n/a |
| `topic seed` | exit 0, "No meetings." | exit 1 with same message as refresh | n/a |

**`arete status`** (`status.ts`):

- `services.topicMemory.listTopicMemoryStatus(paths)` returns
  `{slug, lastRefreshed, daysOld, stale, isStub, orphanRefs}[]` per
  topic (mirrors `AreaMemoryService.listAreaMemoryStatus`)
- Surface: "N stale topics" + "N stub topics (source trail only)" +
  "N orphan topics (no inbound [[refs]])"
- Stale threshold configurable: `arete config set topics.stale_days 60`
  (default 60)
- Remediation hint: "Run `arete topic refresh --all` to update N
  stale topic file(s)."

JSON-mode: all commands emit parseable JSON on both success and
error paths (per LEARNINGS.md gotcha).

**AC**:
- Every subcommand above exists and passes the empty/no-LLM/missing
  table
- `arete status` reports topic health on arete-reserv
- `arete topic refresh` on arete-reserv produces ≥20 topics (once
  seeded — see Step 8)
- `--skip-qmd` and `ARETE_NO_LLM` integration tests

### Step 7 — Skills context injection (new named pattern)

Add a **new** pattern to `packages/runtime/skills/PATTERNS.md`:
**`topic_page_retrieval`**. Inputs, ranking, budget, and truncation
all explicitly specified:

```markdown
## Pattern: topic_page_retrieval

**Inputs**: query string (free text), optional area filter, optional k=3

**Mechanism**:
1. Call `SearchProvider.semanticSearch(query, {
     paths: ['.arete/memory/topics/'], limit: k * 3 })`.
   Falls back to token search via `providers/fallback.ts:137`
   when qmd is not configured.
2. Re-rank by: qmd score (0.6 weight) + recency boost
   (`last_refreshed` within 30d: +0.2, 90d: +0.1) + area-match bonus
   if `options.area` matches topic frontmatter area (+0.1).
3. Take top k.

**Budget & truncation** (default 1000-word memory budget matches
`context_bundle_assembly` §3):
- Frontmatter (always)
- Section `Current state` (always)
- Sections `Why/background`, `Open questions`, `Relationships`
  (include until budget exhausted, in that order)
- Skip `Source trail` and `Change log` (low information density
  for context injection)

**Output**: `TopicPageContext[]` — `{ slug, frontmatter, bodyForContext }`.
```

Update `context_bundle_assembly` (`PATTERNS.md:557`) and
`contextual_memory_search` (`PATTERNS.md:603`) to delegate topic
retrieval to this pattern instead of inlining.

Update skills that declare `intelligence: memory_retrieval` to
reference `topic_page_retrieval` in their Data Access section:

- `meeting-prep` step 4.5 (currently `arete search --scope memory`)
- `create-prd`
- `week-plan`
- `process-meetings`

**Schema decision**: `intelligence:` frontmatter unchanged.
`memory_retrieval` continues to cover all memory layers including
topics; the substrate expansion is invisible to skill authors. A
follow-up plan can introduce `intelligence: topic_retrieval` as a
distinct mode if skill ergonomics demand it.

**AC**:
- `topic_page_retrieval` pattern documented in PATTERNS.md with
  inputs, mechanism, budget, truncation order, output shape
- Four skills reference the pattern
- Running `meeting-prep` on arete-reserv surfaces topic-page
  synthesis without exceeding the 1000-word memory budget

### Step 8 — Seed from existing workspace

One-shot backfill: `arete topic seed`

1. Iterate every meeting in `resources/meetings/` (in chronological
   order so newer content overwrites older).
2. For each, run Step 2 (alias/merge) then Step 3 (integrate-source).
3. Print cost estimate + meeting count + confirmation before
   spending. Require `--confirm` unless `--yes`.

On arete-reserv: ~200 meetings × ~3 topics × ~$0.015 ≈ **~$9
one-time**. Command is idempotent — re-running on seeded workspace
is a no-op via Step 3's content-hash dedup.

**AC**:
- `--dry-run` prints estimate without spending
- `--confirm` prompts with estimate and meeting count
- Post-seed arete-reserv has ≥20 topic pages with non-trivial content
- Re-running `seed` reports "0 updates needed."

### Step 9 — Agent boot-context via CLAUDE.md regeneration

**Goal**: active topics auto-loaded into agent attention on turn 1, so
any /guide conversation can resolve `[[topic-slugs]]` without a
round-trip search.

#### 9.1 Data primitive and view renderers (models layer)

`packages/core/src/models/active-topics.ts` (new, pure module,
no services imported):

```ts
export interface ActiveTopicEntry {
  slug: string;
  area?: string;
  status: string;             // "staging-validated", "in testing", etc.
  summary: string;            // Current-state one-liner
  openItems: number;
  lastRefreshed: string;      // ISO date
}

export function getActiveTopics(
  topics: TopicPage[],
  opts?: { limit?: number; today?: string },
): ActiveTopicEntry[];

export function renderActiveTopicsAsWikilinks(entries: ActiveTopicEntry[]): string;
export function renderActiveTopicsAsSlugList(entries: ActiveTopicEntry[]): string;
```

`getActiveTopics` filters to topics with open items OR
`last_refreshed` within 90d, then sorts by
`(openItems desc, lastRefreshed desc, slug asc)` — **deterministic
tiebreak on slug** to prevent sort instability across refreshes.
Default limit 25. Pure; no I/O; no clock reads unless `today` provided
(so tests can inject a fixed date).

`MemorySummary` lives in `packages/core/src/models/memory-summary.ts`
(new). Model-layer, not service- or generator-owned. Initial shape:

```ts
export interface MemorySummary {
  activeTopics: ActiveTopicEntry[];
  // Future additions: activeAreas, weekFocus, etc.
}
```

#### 9.2 Generator changes

`packages/core/src/generators/claude-md.ts`:

```ts
export function generateClaudeMd(
  config: AreteConfig,
  skills: SkillDefinition[],
  memory?: MemorySummary,
): string
```

New section inserted before "Working Patterns":

```markdown
## Active Topics

> Reflects memory as of 2026-04-22 • Full catalog: `.arete/memory/index.md`

- [[cover-whale-templates]] (glance-comms) — staging-validated …
- [[leap-templates]] (glance-comms) — in staging testing
- ...
```

**Header date source**: `max(entries[].lastRefreshed)` — the latest
topic refresh, **not** `Date.now()`. Two regens on different days
with identical topic data produce byte-equal output.

**Footer stability** (fixes existing generator bug at
`claude-md.ts:140`):
- `workspace_version` only — bumps on `arete update`, not on refresh
- Remove wall-clock timestamp from footer entirely (or render only
  `YYYY-MM-DD` of `workspace_version` release)
- Memory content has its own stability via the header date above

**Empty/absent memory behavior**:
- `memory === undefined` → Active Topics section omitted entirely
  (no header, no prose). Fresh workspaces have no section at all.
- `memory.activeTopics.length === 0` → same as undefined (omit).
  No "No active topics yet" placeholder (placeholder would land
  in git on first seed).

#### 9.3 Adapter interface

Extend `IDEAdapter` with a capability probe:

```ts
interface IDEAdapter {
  // existing methods...
  supportsMemoryInjection?(): boolean;   // default false
  generateRootFiles(
    config: AreteConfig,
    workspaceRoot: string,
    sourceRulesDir?: string,
    skills?: SkillDefinition[],
    memory?: MemorySummary,   // only consumed if supportsMemoryInjection() === true
  ): Record<string, string>;
}
```

- **ClaudeAdapter**: `supportsMemoryInjection() → true`; threads
  `memory` into `generateClaudeMd()`.
- **CursorAdapter**: `supportsMemoryInjection() → false`. Does **not**
  accept or use the `memory` param (signature-level enforcement of
  Phase B migration — a no-op param would be a silent footgun).
  Phase B flips the method to return true and implements AGENTS.md
  post-process injection.

Callers check the capability before loading memory (avoid pointless
reads for Cursor workspaces):

```ts
const memory = adapter.supportsMemoryInjection?.()
  ? await loadMemorySummary(paths).catch(() => undefined)
  : undefined;
```

#### 9.4 Call-site contracts — init / update / refresh

All three paths load memory with graceful fallback. **Corrected
from v2**: `update()` must not strip topics on npm upgrade.

| Path | Memory load | Rationale |
|------|-------------|-----------|
| `arete init` (`workspace.ts:399`) | `undefined` (no memory exists yet on fresh workspace) | First-run correctness |
| `arete update` (`workspace.ts:717`) | `await loadMemorySummary(paths).catch(() => undefined)` | Version bumps must not strip agent boot context |
| `arete memory refresh` (new `regenerateRootFiles()` called from `intelligence.ts` after all memory writes) | `await loadMemorySummary(paths)` (failure falls back to undefined, logged) | Fresh content is the point |

Without this, a user who runs `npm update -g arete` on Wednesday
loses their Active Topics until the next memory refresh — days of
regression on the invariant this step exists to establish.

#### 9.5 Idempotent write

In `workspaceService.regenerateRootFiles(paths)`:

1. Load memory per capability + call-site contract above
2. Call `adapter.generateRootFiles(..., memory)`
3. For each returned `{filename, content}`:
   - Read existing file via `StorageAdapter`
   - If byte-equal to new content → **skip write**; return `'unchanged'`
   - Else write atomically (tmp + rename via `StorageAdapter.write`;
     requires adapter to guarantee atomicity — verify or add it)
4. Return `{ filename: 'CLAUDE.md', result: 'unchanged' | 'updated' }`

Idempotency is **load-bearing** because `~/code/arete-reserv/CLAUDE.md`
is git-tracked; non-idempotent refresh = weekly diff noise.

**Sources of instability to pin down** (tested explicitly — see 9.7):
- No wall-clock timestamps in footer or header
- Deterministic topic sort with slug tiebreak
- Stable YAML frontmatter field ordering (affects `sources_integrated`
  render in Step 1 — leaks here if any frontmatter is inlined)
- ASCII string compare only, never `localeCompare`
- Consistent trailing newline handling
- Error collection from `listAll()` does NOT get rendered into
  CLAUDE.md output (internal diagnostic only)

#### 9.6 Failure modes

| Failure | Behavior |
|---------|----------|
| Some topic files unparseable | `listAll()` returns `{ topics, errors }`; errors logged to stderr with count; valid topics still render |
| `listAll()` throws | Catch → `memory = undefined`, regenerate CLAUDE.md without Active Topics section, log warning |
| `generateClaudeMd()` throws with memory | Catch → retry with `memory = undefined` |
| `generateClaudeMd()` throws without memory (double-fallback) | Catch → **do not write**; leave existing CLAUDE.md untouched; log error |
| Concurrent `memory refresh` + `arete update` | Document: last-writer-wins; the next refresh restores topics. Optional: advisory file lock at `.arete/.refresh.lock` |
| `StorageAdapter.write` fails mid-write | Adapter MUST guarantee atomic write (tmp + rename). Verify or add this contract; never leave CLAUDE.md truncated |

#### 9.7 Testing (load-bearing per user — "we need to test this")

| Test | Location | Asserts |
|------|----------|---------|
| No-memory regression | `packages/core/test/generators/claude-md.test.ts` | `generateClaudeMd(config, skills)` byte-equal to pre-change output |
| Memory section present | same | Active Topics section rendered with `[[wikilinks]]`; limit honored |
| Empty memory omits section | same | `{ activeTopics: [] }` → no section header/body |
| Byte-equal across same-day regens | same | Two calls with identical `memory` produce `===` strings |
| **Byte-equal across day boundary** (clock-stability) | same | Mock `Date.now()` 24h forward; identical inputs → identical output |
| Deterministic sort with equal scores | `packages/core/test/models/active-topics.test.ts` | Shuffled input produces identical rendered output (slug tiebreak works) |
| No `localeCompare` leakage | same | Under `LANG=tr_TR.UTF-8`, sort order unchanged (ASCII compare) |
| Wikilinks vs slug-list views differ | same | `renderActiveTopicsAsWikilinks` outputs `[[slug]]`; `renderActiveTopicsAsSlugList` outputs bare `slug`; same underlying entries |
| `loadMemorySummary` partial-state | `packages/core/test/services/topic-memory.test.ts` | Corrupt one topic file → `listAll()` returns valid ones + `errors[]` |
| Idempotent write — unchanged | `packages/core/test/services/workspace.test.ts` | `regenerateRootFiles` returns `'unchanged'` and performs zero writes when content equal |
| Idempotent write — updated | same | Returns `'updated'` and writes when content differs |
| `arete init` on fresh workspace | `packages/cli/test/commands/init.test.ts` | CLAUDE.md generated without Active Topics section (memory undefined path) |
| `arete update` preserves topics | `packages/cli/test/commands/update.test.ts` | Topics present pre-update remain present post-update |
| `arete memory refresh` regen | `packages/cli/test/commands/intelligence.test.ts` | Post-refresh CLAUDE.md contains current topics; stdout reports `updated` vs `unchanged` |
| Double-fallback safety | `packages/core/test/services/workspace.test.ts` | Inject two-throw scenario → existing CLAUDE.md untouched, stderr warning logged |
| Storage atomic write | `packages/core/test/adapters/storage.test.ts` | Simulate write interruption → file is either old content or new content, never partial |
| CursorAdapter refuses memory | `packages/core/test/adapters/cursor-adapter.test.ts` | TypeScript type error if `memory` passed to its `generateRootFiles`; `supportsMemoryInjection() === false` |

#### 9.8 Observability

Refresh completion stdout (every run):

```
Regenerated area memory: 6 areas refreshed
Integrated topics: 3 topics updated (~$0.04)
Regenerated CLAUDE.md: unchanged (14 active topics, no content change)
                   OR: updated (14 active topics)
```

The `unchanged` vs `updated` distinction tells the user whether
`git status` will be clean afterward.

`arete status` addition:

```
CLAUDE.md last reflects memory as of: 2026-04-22 (age: 2 days)
Run `arete memory refresh` to update agent boot context.
```

Source date: parse `Reflects memory as of <date>` header from the
written CLAUDE.md. If the section is missing (Cursor workspace,
pre-Phase-1 install, fresh init), surface: `CLAUDE.md does not
include memory context (Cursor workspace or not yet seeded)`.

`log.md` new event kind (extends Step 5's grammar):

```
## [2026-04-22T15:32:00Z] claude_md_regen | result=<updated|unchanged> active_topics=14 bytes=<n>
```

Add `claude_md_regen` to the event table in Step 5.

#### 9.9 Acceptance criteria

- `MemorySummary` and `ActiveTopicEntry` defined in `models/`, not
  services or generators
- `getActiveTopics` sort is deterministic with slug tiebreak and no
  `localeCompare`
- Two distinct view renderers for CLAUDE.md (wikilinks) vs extraction
  prompt (slug list); same data primitive
- `init / update / refresh` contract table above is honored; `update`
  preserves topics across npm version bumps
- Idempotent write: zero bytes written when content byte-equal
- Footer and section header free of wall-clock timestamps; fully
  stable under clock advancement given equal inputs
- Double-fallback safety: two generator throws leave CLAUDE.md untouched
- CursorAdapter `supportsMemoryInjection() === false` and refuses the
  memory param at the type level (signature-level Phase B enforcement)
- All test rows in 9.7 pass
- Observability: stdout reports `updated` vs `unchanged`; `arete status`
  shows CLAUDE.md memory age; `log.md` gets `claude_md_regen` events

### Step 10 — Documentation & rule updates

### Step 10 — Documentation & rule updates

Shipping Steps 1–8 without updating the three places that document the
memory model creates contradictions on day one.

Updates:

1. **`packages/runtime/rules/cursor/agent-memory.mdc`** — update the
   L1/L2/L3 model diagram (~line 32) to include `topics/*.md` as a
   peer of `areas/*.md` under L3. Clarify `topics/` is automated
   (wiki); `summaries/` remains documented-but-not-yet-automated.
2. **`packages/runtime/rules/cursor/pm-workspace.mdc`** — same L1/L2/L3
   diagram (~line 62) updated to match.
3. **`packages/runtime/GUIDE.md`** — "Memory System" section
   (~line 1241) gains a topics bullet.
4. **`DEVELOPER.md`** — L3 description at `:459` updated to reflect
   the three L3 surfaces: areas (operational index), topics (wiki),
   summaries (documented/deferred).

**AC**:
- Diff across all four files is reviewed; L1/L2/L3 model is consistent
- No remaining reference to L3 that omits topics

## Phased rollout

- **Phase 1** (Steps 1–3): schema, alias/merge, integrate-source.
  LLM-gated via `callLLM` presence (no new config flag). Ships
  without UI — meetings written post-ship get topic pages; prior
  meetings need Step 8 to backfill.
- **Phase 2** (Steps 4–5): area-memory shrink + `index.md` +
  `log.md`. Tightly coupled to Phase 1 (area files reference topic
  slugs that Phase 1 creates).
- **Phase 3** (Steps 6–7): CLI + skill context injection + deterministic
  lint (orphans, stale, empty, near-duplicate via Jaccard). User-facing
  surface area.
- **Phase 4** (Step 8): seed-topics backfill. Run once per workspace.
- **Phase 5** (separate follow-up plan): LLM-driven contradiction
  lint. Jaccard can't distinguish "shipping Friday" from "delayed to
  May." Needs its own prompt design and cost model.
- **Phase 6** (agent boot context): Step 9 — CLAUDE.md regeneration
  with Active Topics block. Ships alongside Phase 3 (user-facing
  surface) since boot context without CLI is invisible.
- **Phase 7** (documentation): Step 10 — cursor rules + GUIDE.md +
  DEVELOPER.md updates. Ships with Phase 3/6 release so the docs
  never contradict the shipped behavior.
- **Phase 8 (separate follow-up plan)**: AGENTS.md boot-block
  injection for Cursor/Codex users. Post-process step that consumes
  `dist/AGENTS.md` and appends the Active Topics section from
  workspace memory.

## Open questions

1. **Topic granularity**: "Cover Whale templates" and "LEAP templates"
   as separate topics, or one "email template rollout" topic? Leaning
   separate (cleaner AI context). Seeding on arete-reserv will expose
   whether this produces too-fine-grained sprawl.

2. **Topic lifecycle / state machine**: when does a topic close?
   (go-live → `status: stable`? → read-only? → archived?) Needs a
   state enum in frontmatter and transitions. Deferred to post-seed
   observation.

3. **Topic pages vs hand-curated `areas/<slug>.md`**: user-maintained
   area profiles (workspace root) carry strategic narrative. Topic
   pages (`.arete/memory/topics/`) carry tactical synthesis. Probably
   orthogonal; no integration needed in this plan.

4. **Update-on-ingest latency**: Step 3 writes are synchronous before
   `refreshQmdIndex`. For a morning batch of 5 meetings × up to 5
   topics, that's ≤25 Haiku calls. At ~400ms each = ~10s added to
   `arete meeting apply`. Acceptable default; `--skip-topics` escape
   exists. Revisit if production feel is sluggish.

5. **`intelligence: topic_retrieval` mode**: v2 folds topic retrieval
   into the generic `memory_retrieval` capability. A distinct mode
   with alias fallback is a cleaner but migration-heavy path
   (reviewer-recommended). Defer unless skill authoring ergonomics
   demand it.

6. **`agent-observations.md` orphan**: no writer-of-record today.
   Topic-page lint could flag "observation X unintegrated." Out of
   scope here; separate plan.

7. **`summaries/collaboration.md` + `summaries/sessions.md`**: cursor
   rules still document these as belonging in `summaries/`. Plan
   leaves the directory alone. Separate plan should either wire them
   or remove the rule references.

## Risks

- **Topic sprawl** — LLM proposes too many near-duplicates; Jaccard
  alias pass misses. **Mitigation**: LLM adjudication in the 0.4–0.6
  band (Step 2); Phase 3 lint reports high-Jaccard topic pairs as
  merge candidates.
- **Narrative drift** — incremental LLM updates degrade quality
  across many iterations (telephone-game). **Mitigation**: every 10th
  update runs a full rebuild from all `sources_integrated`;
  `arete topic refresh --full <slug>` forces rebuild on demand.
- **Cost surprise** — seed on large workspaces spends real money.
  **Mitigation**: `--dry-run` and `--confirm` on every LLM-spending
  command; `ARETE_NO_LLM=1` kill-switch.
- **Context-bundle budget blowout** — naive topic-page dumping
  exceeds the 1000-word memory budget in `context_bundle_assembly`.
  **Mitigation**: Step 7's explicit truncation order (frontmatter +
  Current state always; other sections until budget exhausted).
- **Dangling wikilinks** — a deleted topic leaves `[[slug]]` refs
  in area files. **Mitigation**: `arete topic lint --fix-orphans`
  rewrites orphan refs to plain text; area refresh skips missing
  topics.
- **Meeting-apply latency** — sync topic integration adds ~10s per
  5-meeting batch. **Mitigation**: `--skip-topics` escape; background
  queue migration if feel degrades.
- **`log.md` grammar drift** — hand-appended entries break the
  `grep "^## \[" log.md` replay idiom. **Mitigation**: parser in
  `memory-log.ts` validates every append; schema test in CI.
- **qmd indexing lag** — Step 3 writes after `refreshQmdIndex`
  means topic pages lag retrieval by one cycle. **Mitigation**:
  ordering invariant in Step 3 (writes complete before index refresh);
  documented and tested.
- **CLAUDE.md git-diff churn** — memory refresh now regenerates
  CLAUDE.md; if the workspace git-tracks CLAUDE.md, weekly refreshes
  generate diffs. **Mitigation**: idempotent write in Step 9 (no
  write when content byte-equal); stable content ordering so equal
  inputs produce equal output; separate `workspace_version` from
  `memory_content_hash` so footer is stable when memory unchanged.
- **Init-time / no-LLM regression on CLAUDE.md** — adding a memory
  param to the generator risks breaking workspace init for fresh
  installs. **Mitigation**: `memory` optional; init passes undefined;
  double-fallback safety (two generator throws leave existing
  CLAUDE.md untouched).
- **`arete update` stripping topics** — user runs `npm update -g arete`;
  `update()` regenerates CLAUDE.md. Earlier draft passed `memory =
  undefined` on this path, silently erasing Active Topics for days
  until next refresh. **Mitigation**: update path also loads memory
  with failure fallback (see 9.4 contract table).
- **Concurrent refresh + update race** — two processes regenerating
  CLAUDE.md simultaneously can last-writer-wins into a stale state.
  **Mitigation**: next refresh restores; optional `.arete/.refresh.lock`
  advisory lock if this surfaces in practice.
- **Partial memory state** — a corrupt topic file (crashed write, bad
  frontmatter) is silently dropped from the summary. **Mitigation**:
  `listAll()` returns `{ topics, errors }`; errors logged to stderr
  with count; surface in `arete status`.
- **Non-atomic CLAUDE.md write** — if `StorageAdapter.write` is not
  atomic, interruption can truncate the file agents are about to load.
  **Mitigation**: require adapter atomic-write contract (tmp + rename);
  add explicit test.
- **Cursor/Codex asymmetry** — Phase A only covers Claude Code
  users. Cursor users' AGENTS.md stays topic-less. **Mitigation**:
  signature-level enforcement via `supportsMemoryInjection()` method
  (CursorAdapter cannot silently accept-and-drop memory); Phase B
  designs injection for distributed `dist/AGENTS.md`.

## Deferrals (explicitly out of scope)

- Restructuring commitments storage (handled by
  `merge-commitments-into-tasks` worktree)
- LLM-driven contradiction lint (Phase 5, separate plan)
- `intelligence: topic_retrieval` distinct mode (Open Q #5)
- Fixing `agent-observations.md` writer-of-record
- Wiring `summaries/collaboration.md` + `summaries/sessions.md`
- Topic lifecycle state machine (Open Q #2)
- Auto-archive / auto-close behavior for stable topics
- Image / attachment handling in topic pages
- Marp slide / visual output per Karpathy gist
- Web-clipper ingest
- Background queue for topic integration (sync default; revisit based
  on production feel)
