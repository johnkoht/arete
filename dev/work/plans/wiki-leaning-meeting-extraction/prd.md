# PRD: Wiki-Leaning Meeting Extraction

**Version**: 1.0
**Status**: Planned
**Date**: 2026-04-28
**Branch**: `worktree-wiki-leaning-extraction`
**Size**: Large (11 tasks across 5 phases)

---

## 1. Problem & Goals

### Problem

When a meeting is processed today, the extraction LLM does not see the existing topic-wiki page or prior L2 items for the meeting's topics. It re-extracts already-captured content; downstream dedup catches it; recaps end up verbose because they restate wiki-resident context.

Two latent bugs compound this:

- **L2 parser/writer mismatch**: `staged-items.ts` writes `## Title`, `memory.ts` parses `### Title`. Newly written learnings/decisions are unsearchable today.
- **Backend missing `activeTopicSlugs`**: the slug-bias defense never fires on the web path.

### Goals

1. **Extraction sees the wiki**: inject existing topic-page sections + topic-tagged L2 items so the LLM can extract only deltas.
2. **L2 items get topic tags**: precise per-topic queryability replaces fuzzy date-window heuristics.
3. **Recap output reshaped**: `Core` (principle-based, what's actionable/decided/changed) + `Could include` (prioritized one-line headlines for side threads, capped at 8).
4. **Latent bugs fixed as side effects**.

### Success Criteria

- Re-running extraction on a meeting whose topics already have wiki pages produces noticeably fewer staged items (deltas only).
- 5-meeting A/B (Treatment with `topicWikiContext` vs Control without) shows item-count drop with no real-delta suppression.
- Newly written L2 entries are discoverable by `MemoryService.search`.
- Backend `agent.ts` extraction call passes `activeTopicSlugs` like the CLI does.
- `## Core` + `## Could include` blocks render in new meetings; existing `## Summary` blocks parse cleanly.

### Out of Scope

- L2 backfill of historical entries (tag-forward only; optional script is uncommitted dev tool).
- Slack-digest integration (Phase C item 8 — separate plan).
- Two-phase extraction with LLM-based topic detection pre-pass (lexical is the starting point; swap is one function call later).
- Reconciliation pass changes.
- Topic-page stub creation moved out of approve time.

---

## 2. Pre-Mortem Risks (Reference)

The full pre-mortem is at `dev/work/plans/wiki-leaning-meeting-extraction/pre-mortem.md`. Plan-level mitigations are baked into Decisions log entries 6–8 and the Risks section.

| # | Risk | Severity | Tasks |
|---|------|----------|-------|
| R1 | Parser regex over/double-matches mixed L2 headers | High | 2 |
| R2 | Lexical detection precision (false positives suppress real deltas) | High | 3, 9, 11 |
| R3 | LLM over-suppression of new learnings (invisible failure) | Highest | 6, 11 |
| R4 | Token budget overflow with rich wiki context | Medium | 6 |
| R5 | `MeetingContextDeps.topicMemory` callsite/factory drift | Medium | 5 |
| R6 | `## Summary` → `## Core` rename truncates historical files | High | 8 |
| R7 | Frontmatter-injection via LLM-generated `core` / `could_include` | Medium | 7 |
| R8 | Single-PR scope risks bisectability if a thread regresses | Medium | (commit discipline, all tasks) |
| R9 | Backend `activeTopicSlugs` behavior change in fixtures | Low | 10 |

---

## 3. Expertise Profiles

When reviewing or implementing tasks in this PRD, include:

- **Core**: `.pi/expertise/core/PROFILE.md` — DI patterns, StorageAdapter, factory wiring, services patterns
- **CLI**: `.pi/expertise/cli/PROFILE.md` — Command patterns, --json flag, qmd refresh
- **Backend**: `.pi/expertise/backend/PROFILE.md` (fallback first 150-200 lines if missing structured sections)

Key invariants:
- Services never import `fs` directly — use `StorageAdapter`
- `createServices()` is the only wiring point; new deps added there
- CLI commands follow: `createServices() → findRoot() → guard → service → format`
- LLM-generated strings written into YAML-frontmattered files MUST reject raw `---` (topic-wiki-memory pattern, 2026-04-23)
- Parser regex over markdown content must be anchored (`^...$/m`) to avoid matching headers inside code fences

---

## 4. Tasks

### Phase 1: L2 Schema (Thread A — foundation)

#### Task 1: Add `topics` to L2 writer + MeetingMetadata

**Files**: `packages/core/src/integrations/staged-items.ts`, `packages/core/src/models/memory.ts`

Extend `MeetingMetadata` with `topics: string[]`, populate in `extractMeetingMetadata` from frontmatter (`data['topics']` set by `meeting-apply.ts:259`). In `appendToMemoryFile`, write `**Topics**: slug-a, slug-b` bullet alongside Date/Source. Add optional `topics?: string[]` to `MemoryEntry` and `MemoryResult`.

**Acceptance Criteria**:
- `MeetingMetadata` includes `topics: string[]` (defaults to empty array)
- `appendToMemoryFile` emits `**Topics**: ...` line when topics non-empty; omits it cleanly when empty
- Per-item entry header stays `## <Title>` (existing writer convention)
- `MemoryEntry` and `MemoryResult` extended with `topics?: string[]`
- Unit test: writer produces correct entry shape with topics
- Unit test: writer produces correct entry shape without topics (omits `**Topics**:` line)

**Warnings**: None — additive change to producer side.

---

#### Task 2: Memory parser update + `getMemoryItemsForTopics` helper

**File**: `packages/core/src/services/memory.ts`

Extend `parseMemorySections` to a single-pass classifier with priority order matching all three header shapes: `## Title` (current writer), `### YYYY-MM-DD: Title` (legacy date-prefixed), `### Title` (legacy bare). Use anchored regex (line-start `^`, multiline flag) to avoid matching headers inside code fences. Parse metadata bullets (`**Date**:`, `**Source**:`, `**Topics**:`) into structured fields. Add public helper `getMemoryItemsForTopics(paths, topicSlugs[], { limit, sinceDays })` returning entries whose parsed `topics` intersect requested slugs (cap 5/slug, 90-day recency).

**⚠️ Pre-Mortem Warning (R1)**: Three-shape header match could double-match or mis-classify on real data. Use single-pass classifier with priority — each line classifies into exactly one shape; no fall-through. Sanity-check against actual `.arete/memory/items/learnings.md` and `decisions.md` before merge.

**Acceptance Criteria**:
- All three header shapes parse correctly in mixed file
- Header inside fenced code block (`​`​`​`​ ... `## Title` ... `​`​`​`) does NOT match (anchored regex, code-fence aware)
- Trailing whitespace tolerance on header line
- Empty title rejected
- Metadata bullets parsed: `topics?: string[]`, `source?: string`, `date?: string`
- `MemorySection` extended with `topics?: string[]`, `source?: string`
- `getMemoryItemsForTopics` returns entries matching any requested slug, capped per-slug, recency-filtered
- Unit tests cover: three header shapes, code-fence negative case, empty topics filtering, recency window
- Sanity check: parser run against the worktree's actual `.arete/memory/items/learnings.md` and `decisions.md` produces sensible output (manual verification pre-merge)

---

### Phase 2: Thread B foundations

#### Task 3: New `topic-detection.ts` service (lexical pre-pass)

**File**: `packages/core/src/services/topic-detection.ts` (new)

```ts
export function detectTopicsLexical(
  transcript: string,
  identities: TopicIdentity[],
  options?: { maxResults?: number }
): string[]
```

Tokenize transcript with `normalizeForJaccard` from `utils/similarity.ts`. For each identity (canonical slug + aliases), tokenize the slug (`tokenizeSlug`) and score against the transcript token set. Maintain a top-level **stop-token list** for generic words (`planning`, `review`, `sync`, `discussion`, `meeting`, `update`, `status`, `team`, `weekly`, `daily`).

**⚠️ Pre-Mortem Warning (R2)**: False positives silently suppress real deltas. Stop-tokens + ≥2 non-stop slug tokens threshold + ≥0.5 coverage are the precision levers.

**Acceptance Criteria**:
- Stop-token list as top-level `const STOP_TOKENS = new Set([...])`
- Threshold: ≥2 distinct multi-char *non-stop* slug tokens present AND topic-token-coverage ≥ 0.5
- A slug must hit on at least one *non-stop* token to score
- **Cap at 3 candidate slugs at rollout** (Decision #6 in plan); raise to 5 later when telemetry validates
- Sort by score desc; ties broken by `last_refreshed` desc
- Pure function (no I/O); fully unit-testable
- Unit tests: threshold cases (≥2 non-stop hits passes, single hit rejected), recency tiebreaker, stop-token rejection (`weekly-sync` slug should NOT match a generic-status transcript), coincidence rejection (`q2-planning` should NOT match every transcript that says "planning")

---

#### Task 4: `renderForExtractionContext` helper

**File**: `packages/core/src/models/topic-page.ts`

New helper `renderForExtractionContext(page: TopicPage, opts?: { changeLogEntries?: number; scopeMaxChars?: number }): string`. Concatenates Current state + Scope and behavior (truncated at 1000 chars per Decision #1) + Open questions + Known gaps + last 3 Change log entries. Pure, testable, mirrors `selectSectionsForBudget` style.

**Acceptance Criteria**:
- Renders the four sections in stable order with clear separators
- Scope truncated at 1000 chars when over
- Last 3 Change log entries appended (configurable via `changeLogEntries`)
- Pure function; no I/O
- Unit tests: full page rendering, missing-section handling, scope truncation, change-log limit

---

#### Task 5: `meeting-context.ts` — `topicWikiContext` enrichment + callsite sweep

**File**: `packages/core/src/services/meeting-context.ts`

Add `topicWikiContext?: { detectedTopics: Array<{ slug: string; sections: string; l2Excerpts: string[] }> }` to `MeetingContextBundle`. Add `topicMemory: TopicMemoryService` to `MeetingContextDeps`. After existing related-context step (~line 902) add Step 7: `topicMemory.listAll(paths)` → `detectTopicsLexical(transcript, identities)` → for each slug: `renderForExtractionContext(page)` + `getMemoryItemsForTopics(paths, [slug], { limit: 5, sinceDays: 90 })`.

**⚠️ Pre-Mortem Warning (R5)**: Sweep all callsites and mock factories. `grep` for `MeetingContextDeps` and `buildMeetingContext` across `packages/core/`, `packages/cli/`, `packages/apps/backend/`, `packages/core/test/`. Update test factories to provide a `topicMemory` mock. Tests that don't exercise wiki injection use a stub returning empty identities.

**Acceptance Criteria**:
- `MeetingContextBundle.topicWikiContext` populated when topics detected; undefined when none
- `MeetingContextDeps.topicMemory` required
- `createServices()` factory wires `topicMemory` (if not already present)
- All callsite + factory mock updates committed (grep is clean)
- Backward compat: existing tests pass with stub
- Unit test: bundle has `topicWikiContext.detectedTopics` populated for a meeting with known topic
- Unit test: bundle has no `topicWikiContext` when transcript matches no topics

---

### Phase 3: Thread B prompt + Thread C output (in `meeting-extraction.ts`)

#### Task 6: `buildTopicWikiContextSection` + delta directive prompt + char budget guard

**File**: `packages/core/src/services/meeting-extraction.ts`

Add `buildTopicWikiContextSection(ctx: TopicWikiContext): string` near line 356 rendering the wiki context block. Wire into `buildMeetingExtractionPrompt` between `enhancedContext` and `exclusionList`. Insert delta-only directive (full text in plan §Thread B) after JSON schema and existing "Prefer these existing topic slugs" block. Includes "When in doubt, INCLUDE" tiebreaker and one-shot CONFIRMATION-of-uncertainty example.

Add `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`. Truncation order when exceeded: (i) drop oldest L2 excerpts within each topic; (ii) truncate longest topic page section to half; (iii) drop lowest-scored topic. Never drop highest-scored topic.

**⚠️ Pre-Mortem Warnings**:
- (R3) LLM over-suppression is the highest-impact, invisible failure mode. The "When in doubt, INCLUDE" tiebreaker + one-shot CONFIRMATION-of-uncertainty example are load-bearing — verify both appear verbatim in the assembled prompt.
- (R4) Token budget overflow. Implement truncation order exactly; instrument prompt-char totals.

**Acceptance Criteria**:
- `buildTopicWikiContextSection` renders wiki context exactly as specified in plan §Thread B
- Delta-only directive appears in prompt with all 5 DELTA rules + 4 do-NOT-emit rules
- "When in doubt, INCLUDE" tiebreaker present verbatim
- One-shot CONFIRMATION example (pricing $99/$149) present verbatim
- `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` enforced
- Truncation order: oldest L2 first, then halve longest section, then drop lowest-scored topic
- Highest-scored topic never dropped
- Pass `activeTopicSlugs` derived from `topicWikiContext.detectedTopics[].slug` to existing slug-bias system
- Unit tests: prompt rendering with wiki context, prompt-char measurement, truncation behavior at each tier, "when in doubt INCLUDE" string presence, CONFIRMATION example presence

---

#### Task 7: `core` / `could_include` schema + parser + frontmatter sanitizer

**File**: `packages/core/src/services/meeting-extraction.ts`

Extend the JSON schema in `buildMeetingExtractionPrompt` (~line 644) with `core: string` and `could_include: string[]`. Keep `summary` accepted for backward compat; prefer `core` when present. Update `parseMeetingExtractionResponse` (lines 817–1139) to parse both new fields, validate `could_include` items (trim, non-empty, ≤200 chars, hard-cap 8), and apply **frontmatter-injection sanitizer**: reject any string containing line-start `---` (`/^---\s*$/m`). On match: strip the offending line, log warning; do not fail the whole extraction.

Add to `MeetingIntelligence` (line 62): `core?: string`, `could_include?: string[]`.

**⚠️ Pre-Mortem Warning (R7)**: LLM-generated strings flowing into staged sections of YAML-frontmattered meeting files must reject raw `---`. Same sanitizer pattern lives in topic-page writes per topic-wiki-memory learnings (2026-04-23).

**Acceptance Criteria**:
- JSON schema includes `core` (string description per plan) and `could_include` (array description with priority + 8-cap + headline-format guidance)
- `core` description includes "no bullet caps", "lead with most actionable/decided/changed", "do not restate wiki content"
- `could_include` description includes "informative one-line headlines", "order by importance", "drop least-important when over budget", "max 8"
- Parser hard-caps `could_include` at 8 entries (drops excess)
- Parser trims items, rejects empty, rejects >200 char items
- **Sanitizer rejects raw `---`** in `core` and any `could_include[]` item — strips line, logs warning, does NOT fail extraction
- `summary` parsing preserved (backward compat)
- `MeetingIntelligence` extended with `core?: string`, `could_include?: string[]`
- Unit tests: sanitizer (raw `---` rejected), 8-cap enforcement, trim/length validation, summary fallback when core absent

---

#### Task 8: STAGED_HEADERS + formatter changes

**Files**: `packages/core/src/services/meeting-apply.ts`, `packages/core/src/services/meeting-processing.ts`, `packages/core/src/services/meeting-extraction.ts` (formatStagedSections)

Add `'core'` and `'could include'` to `STAGED_HEADERS` (lines 119–124) **alongside** existing `'summary'` — DO NOT remove `summary`. Update `formatStagedSections` (lines 1282–1321) and `formatFilteredStagedSections` (lines 625–666) to render `## Core` block (with fallback to `summary` if `core` absent) and `## Could include` block (omitted entirely if list empty).

**⚠️ Pre-Mortem Warning (R6)**: Per the integrations LEARNINGS, `parseStagedSections` "stops at any `##` non-staged header" — removing `summary` would silently truncate historical meeting files on re-parse. Grep `## Summary` across `packages/apps/` and `packages/cli/test/golden/` before merging to confirm no caller assumes the old shape.

**Acceptance Criteria**:
- `STAGED_HEADERS` contains `summary`, `core`, `could include` (case as existing convention)
- `formatStagedSections` emits `## Core` (using `core ?? summary`) followed by `## Could include` (only if list non-empty)
- `formatFilteredStagedSections` accepts new params `core` and `couldInclude`; renders identically
- `## Could include` block fully omitted when list empty (no empty header)
- Existing `## Summary` blocks still parse without truncation when present in historical files
- Unit tests: render with both fields populated, render with only `core`, render with summary fallback, render with empty `could_include` (block omitted)
- Manual grep: `grep -r "## Summary" packages/apps/ packages/cli/test/golden/` reviewed for downstream assumptions

---

### Phase 4: Plumbing

#### Task 9: CLI `--dry-run-topics` flag

**File**: `packages/cli/src/commands/meeting.ts`

Add `--dry-run-topics` flag to `arete meeting extract`. When set, runs `detectTopicsLexical` against the transcript and prints detected topics with scores + matching tokens; skips actual extraction. Used for tuning thresholds against real meetings before full rollout.

**⚠️ Pre-Mortem Warning (R2)**: This flag is the empirical-tuning lever for topic detection. Output must include enough detail to debug false positives.

**Acceptance Criteria**:
- `--dry-run-topics` flag accepted on `arete meeting extract`
- When set: runs topic detection only, prints results, exits without writing extraction artifacts
- Output includes per-detected-slug: score, matching tokens (separated into stop and non-stop), `last_refreshed` date
- Works with `--json` for machine-readable output
- CLI smoke test: invocation with sample transcript prints expected structure, exits cleanly

---

#### Task 10: Call-site plumbing — CLI + backend (incl. `activeTopicSlugs` fix)

**Files**: `packages/cli/src/commands/meeting.ts:981`, `packages/apps/backend/src/services/agent.ts:220`

CLI: pass `intelligence.core ?? intelligence.summary` and `intelligence.could_include` to `formatFilteredStagedSections`.
Backend: same. **Also pass `activeTopicSlugs`** (currently missing — latent gap).

**⚠️ Pre-Mortem Warning (R9)**: Backend `activeTopicSlugs` addition is a behavior change for the web path. Check fixtures that assume current (slug-bias-disabled) extraction output; update or note as expected drift.

**Acceptance Criteria**:
- CLI extract command threads `core` + `could_include` through to formatter
- Backend agent.ts threads same fields through to formatter
- Backend agent.ts passes `activeTopicSlugs` to extraction (matches CLI behavior)
- Existing CLI golden tests pass or are deliberately updated with rationale
- Backend integration tests pass or are updated with rationale

---

### Phase 5: Validation gate

#### Task 11: 5-meeting A/B validation (merge gate)

**Output**: `dev/work/plans/wiki-leaning-meeting-extraction/ab-results.md` (uncommitted)

Run extraction on 5 historical meetings with diverse topic coverage in two modes:
- **Control**: current main (no `topicWikiContext`)
- **Treatment**: this branch

Compare item counts (action items, decisions, learnings, open questions) per meeting.

**⚠️ Pre-Mortem Warning (R3)**: LLM over-suppression is invisible. This A/B is the only signal we have before merge.

**Acceptance Criteria**:
- 5 historical meetings selected with diverse topic coverage (mix of fresh-topic and wiki-resident-topic meetings)
- Both runs executed; results saved to `ab-results.md`
- Acceptance: Treatment ≤ Control in item counts on most meetings (deltas only is the goal)
- No meeting where Treatment loses an item that Control captured AND that the wiki didn't already record (manual inspection of any borderline cases — at most 1–2 expected)
- No fabricated items in Treatment that Control didn't surface
- File `ab-results.md` documents the comparison and verdict
- This task is the final pre-merge sign-off

---

## 5. Task Dependencies

```
Phase 1: 1 → 2 (writer → parser)

Phase 2: 1 || 3 || 4 (independent foundations)
         2 + 3 + 4 → 5 (meeting-context needs all)

Phase 3: 5 → 6 (extraction needs topicWikiContext)
         6 → 7 (same file, sequential)
         7 → 8 (formatter needs new fields)

Phase 4: 3 → 9 (dry-run uses topic-detection)
         8 → 10 (plumbing needs formatter)

Phase 5: ALL → 11 (A/B gates merge)
```

**Execution Order**:
- Tasks 1, 3, 4 can start immediately and in parallel
- Task 2 follows Task 1
- Task 5 follows 2/3/4
- Tasks 6→7→8 are sequential (same file)
- Task 9 can start after 3
- Task 10 follows 8
- Task 11 is the merge gate; runs last

---

## 6. Testing Strategy

- Unit tests for all pure functions (topic-detection, renderForExtractionContext, parsers, formatters, sanitizers)
- Mock `StorageAdapter` and `TopicMemoryService` in `meeting-context` tests
- Code-fence negative test for parser regex (literal `## Title` inside fenced block must not match)
- Sanitizer test for `core` / `could_include` (raw `---` rejected; line stripped; warning logged)
- CLI smoke test for `--dry-run-topics`
- Golden refresh: existing `## Summary` fixtures kept; new fixtures use `## Core`
- `npm run typecheck` and `npm test` after every task
- Pre-merge: 5-meeting A/B validation (Task 11)

---

## 7. Definition of Done

- [ ] All 11 tasks complete with passing tests
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Three commits along A/B/C boundaries (Decision #4): (i) Thread A schema+parser+writer; (ii) Thread B context+detection+prompt; (iii) Thread C recap shape + plumbing
- [ ] 5-meeting A/B validation reviewed; `ab-results.md` documents outcome
- [ ] Sanity-check parser run against actual `.arete/memory/items/{learnings,decisions}.md`
- [ ] Manual grep `## Summary` across `packages/apps/` and `packages/cli/test/golden/` confirms no breakage
- [ ] Pre-mortem retrospective: which risks materialized, mitigation effectiveness
- [ ] Builder memory entry created at `memory/entries/2026-04-XX_wiki-leaning-meeting-extraction-learnings.md`
