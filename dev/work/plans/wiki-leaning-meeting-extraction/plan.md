---
title: Wiki-leaning meeting extraction
slug: wiki-leaning-meeting-extraction
status: complete
size: large
tags: [core, cli, backend, meeting-extraction, topic-wiki, delta-only]
created: 2026-04-27
updated: 2026-04-29
completed: 2026-04-29
---

# Wiki-leaning meeting extraction

## Goal

Make meeting extraction "lean on the topic-wiki": inject existing topic-page content + topic-tagged L2 items into the extraction prompt so the LLM only emits **deltas** (new decisions, changed plans, new risks, newly raised questions). Reshape the recap output into a principle-based `Core` section + a prioritized `Could include` menu of side-thread headlines. Net effect: less repetition of already-captured content, thinner recaps, sharper signal.

Ships as one PR covering all three threads (A: L2 schema, B: extraction context injection, C: recap shape).

## The gap today

- **Write side is wired.** Hook 2 (`refreshAllFromMeetings` in `topic-memory.ts:790`) updates topic pages on meeting approve. Works in both CLI and backend.
- **Read side is missing.** When extraction runs, the LLM sees neither the existing topic page nor prior L2 items for the meeting's topics. So it re-extracts known content; downstream dedup catches it; recaps end up verbose.
- **`MeetingIntelligence.topics` is produced *by* extraction**, not before it. So we need topic *detection* up front to enable wiki-context injection.
- **L2 items (`learnings.md`, `decisions.md`) have no topic linkage.** Today they're a flat date-keyed list with `(from: <source>)` attribution — no per-topic queryability.
- **Latent bugs** found while planning:
  - Parser/writer mismatch in L2 files: `staged-items.ts` writes `## Title`, `memory.ts` parses `### Title`. Newly written entries aren't searchable today.
  - Backend `agent.ts:220` doesn't pass `activeTopicSlugs` to extraction — slug-bias defense doesn't fire on the web path.

Both get fixed as side effects of this work.

## Decisions log

1. **Inject "Scope and behavior" section** into wiki context alongside Current state, Open questions, Known gaps, recent Change log. High signal for delta detection (a meeting that broadens scope is a clear delta). Truncate the section if it alone exceeds 1000 chars.
2. **No backfill of historical L2 items.** Tag forward only. Historical entries lack `**Topics**:` and stay topic-less; consumers fall back to existing fuzzy plumbing for those.
3. **`could_include` cap = 8, prioritized.** Prompt instructs the agent to order by importance and drop least-important when over budget. `core` has no hard cap (principle-based).
4. **Single PR, three commits along A/B/C boundaries.** Threads ship atomically but commits are bisectable: (i) Thread A schema + parser + writer; (ii) Thread B extraction context + delta directive + topic detection; (iii) Thread C recap shape + plumbing + STAGED_HEADERS.
5. **Topic detection: lexical pre-pass, no extra LLM call.** Token-overlap against existing slug+alias catalog with recency tiebreaker. LLM-based detection is the future escape hatch (one function swap), not the starting point.
6. **Initial topic-detection cap = 3 slugs at rollout.** Conservative; raise to 5 after the dry-run telemetry validates precision on real meetings.
7. **Both `summary` and `core` headers accepted permanently.** Don't replace `summary` in `STAGED_HEADERS`; add `core` alongside. Historical meeting files keep their `## Summary` blocks as-is — no auto-rewrite. An optional `scripts/normalize-summary-to-core.ts` can ship later as uncommitted dev tool if needed.
8. **5-meeting A/B is a merge gate.** Run extraction with vs. without `topicWikiContext` on 5 historical meetings; verify no real-delta suppression and no fabricated deltas. Block merge until reviewed.

## Implementation

### Thread A — L2 schema: `topics: [slug, ...]` on learnings/decisions

**File: `packages/core/src/integrations/staged-items.ts`**

- Lines 332–343: extend `MeetingMetadata` with `topics: string[]`; populate in `extractMeetingMetadata` from frontmatter (`data['topics']` is set by `meeting-apply.ts:259`).
- Lines 575–602: in `appendToMemoryFile`, write per-item entry as:
  ```
  ## <Title>
  - **Date**: YYYY-MM-DD
  - **Source**: Meeting Title (Attendees)
  - **Topics**: slug-a, slug-b
  - <body>
  ```
  Header stays `## Title` (matches existing writer convention).

**File: `packages/core/src/services/memory.ts`**

- Lines 52–87, `parseMemorySections`: extend to a **single-pass classifier with priority order** that matches all three header shapes — `## Title` (current writer), `### YYYY-MM-DD: Title` (legacy date-prefixed), `### Title` (legacy bare). Use anchored regex (line-start `^`, multiline flag) to avoid matching headers inside code fences. Each line classifies into exactly one shape; no fall-through. Add fixture tests covering: all three shapes in one file, header inside a fenced code block (must not match), trailing whitespace tolerance, empty title rejection. Sanity-check against the user's actual `.arete/memory/items/learnings.md` and `decisions.md` before merge. This fixes the latent parser/writer mismatch as a side effect.
- Inside the section body, parse the metadata bullets into structured fields: `topics?: string[]`, `source?: string`, `date?: string`.
- Lines 45–50: extend `MemorySection` with `topics?: string[]`, `source?: string`.
- Add public helper `getMemoryItemsForTopics(paths, topicSlugs[], { limit, sinceDays })` returning entries whose parsed `topics` intersects the requested slugs. Cap at 5 per slug, recency-filter at 90 days.

**File: `packages/core/src/models/memory.ts`**

- Add optional `topics?: string[]` to `MemoryEntry` (line 12) and `MemoryResult` (line 23).

**Tests**
- `packages/core/test/services/memory.test.ts` — `parseMemorySections` for all three header shapes + metadata-bullet parsing.
- Any factory under `packages/core/test/` building memory entries.
- Golden tests touching memory file shape — refresh fixtures.

### Thread B — Extraction-time wiki context injection

**File: new `packages/core/src/services/topic-detection.ts`**

```ts
export function detectTopicsLexical(
  transcript: string,
  identities: TopicIdentity[],
  options?: { maxResults?: number }
): string[]
```

- Tokenize transcript with `normalizeForJaccard` from `utils/similarity.ts`.
- For each identity (canonical slug + aliases), tokenize the slug (`tokenizeSlug`) and score against the transcript token set.
- **Stop-token list** for generic single-meaning words (e.g., `planning`, `review`, `sync`, `discussion`, `meeting`, `update`, `status`, `team`, `weekly`, `daily`). Stop-tokens don't contribute to score on their own — a slug must hit on at least one *non-stop* token to score. Maintain the list as a top-level const so it's easy to tune.
- Threshold: ≥2 distinct multi-char *non-stop* slug tokens present **and** topic-token-coverage ≥ 0.5. This avoids the single-token coincidence trap (e.g., `q2-planning` shouldn't match every transcript that says "planning"; `weekly-sync` shouldn't fire on every status meeting).
- **Cap at 3 candidate slugs at rollout** (Decision #6). Sort by score desc, ties broken by `last_refreshed` desc.
- Pure function, testable without storage.

**File: `packages/core/src/models/topic-page.ts`**

- New helper `renderForExtractionContext(page: TopicPage, opts?: { changeLogEntries?: number; scopeMaxChars?: number }): string` that concatenates Current state + Why/background omitted + Scope and behavior (truncated at 1000 chars) + Open questions + Known gaps + last 3 Change log entries. Pure, testable, mirrors `selectSectionsForBudget` style.

**File: `packages/core/src/services/meeting-context.ts`**

- After line 107, extend `MeetingContextBundle`:
  ```ts
  topicWikiContext?: {
    detectedTopics: Array<{
      slug: string;
      sections: string;       // pre-rendered via renderForExtractionContext
      l2Excerpts: string[];   // topic-tagged L2 items
    }>;
  };
  ```
- Line 122: add `topicMemory: TopicMemoryService` to `MeetingContextDeps`. **Sweep all callsites and mock factories**: grep for `MeetingContextDeps` and `buildMeetingContext` across `packages/core/`, `packages/cli/`, `packages/apps/backend/`, and `packages/core/test/`. Update test factories (under `packages/core/test/factories/` or wherever deps are constructed) to provide a `topicMemory` mock — tests that don't exercise wiki injection can use a stub returning empty identities.
- After line 902 in `buildMeetingContext`, add Step 7:
  1. `topicMemory.listAll(paths)` → existing identities.
  2. `detectTopicsLexical(transcript, identities)` → candidate slugs.
  3. For each slug: read topic page → `renderForExtractionContext(page)` → `getMemoryItemsForTopics(paths, [slug], { limit: 5, sinceDays: 90 })`.

**File: `packages/core/src/services/meeting-extraction.ts`**

- Add `buildTopicWikiContextSection(ctx: TopicWikiContext): string` near line 356, rendering:
  ```
  ## Topic Wiki (already known to the reader — DO NOT re-extract)

  ### [[<slug>]]
  <renderForExtractionContext output>

  Prior captured items for this topic:
  - <l2 excerpt 1>
  - <l2 excerpt 2>
  ```
- Wire into `buildMeetingExtractionPrompt` (lines 631–758) between `enhancedContext` and `exclusionList`.
- After the JSON schema and existing "Prefer these existing topic slugs" block, insert the **delta-only directive**:
  ```
  ## Delta-only extraction
  The "Topic Wiki" section below shows what is ALREADY captured for the topics
  this meeting touches. Treat all of it as known by the reader.

  Extract a learning, decision, action, or open question ONLY when it is a DELTA:
  - NEW decision: a choice made in this meeting that the wiki doesn't already record
  - CHANGED plan: this meeting reverses, narrows, or rescopes something the wiki shows
  - NEW risk or gap raised
  - NEW open question raised (not already in the wiki's Open questions)
  - CONFIRMATION ONLY when the wiki shows a prior plan as uncertain and this meeting
    pins it down (record as a new decision; cite what was uncertain)

  Do NOT emit:
  - Restatements of decisions or learnings already in the wiki
  - Confirmations of plans the wiki already shows as committed
  - Status updates on items the wiki already records
  - The same fact described differently than the wiki's existing phrasing

  When in doubt, INCLUDE. A duplicate gets caught downstream by dedup; a
  missed real delta is invisible and lost.

  ### Example: CONFIRMATION-of-uncertainty (the load-bearing escape hatch)

  Wiki shows under Open questions: "Pricing tier — $99 or $149?"
  Meeting transcript: "We're going with $149 — Sara confirmed the margin model works."
  → Emit as a NEW decision: "Pricing tier set to $149 (resolves prior open question
    on margin model)." Cite the wiki's uncertainty.

  Counter-example: Wiki shows under Current state: "Pricing tier locked at $149."
  Meeting transcript: "Yeah, pricing is $149." → Do NOT emit. Already committed.
  ```
- Add a budget guard: `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000`. **Truncation order when exceeded** (apply in sequence until under budget): (i) drop oldest L2 excerpts within each topic first; (ii) if still over, truncate the longest topic page section to half its length; (iii) if still over, drop the lowest-scored topic entirely. Never drop the highest-scored topic. Instrument prompt-char totals on the first few real meetings.
- Pass `activeTopicSlugs` derived from `topicWikiContext.detectedTopics[].slug` in addition to existing sources.

**File: `packages/cli/src/commands/meeting.ts` — dry-run flag for topic detection**

- Add a `--dry-run-topics` flag to `arete meeting extract`. When set, runs `detectTopicsLexical` against the transcript and prints detected topics with their scores + matching tokens; skips actual extraction. Used for tuning thresholds against real meetings before full rollout. Promoted to a real implementation task (was previously a Risks-section mention).

**Merge gate: 5-meeting A/B validation (Decision #8)**

Before merge, run extraction on 5 historical meetings with diverse topic coverage in two modes:
- **Control**: current main (no `topicWikiContext`).
- **Treatment**: this branch.

Compare item counts (action items, decisions, learnings, open questions) per meeting. Acceptance:
- Treatment ≤ Control on most meetings (deltas only → smaller output is expected and good).
- No meeting where Treatment loses an item that Control captured AND that the wiki didn't already record. Manually inspect 1–2 borderline cases.
- No fabricated items in Treatment that Control didn't surface.

Save the comparison as an uncommitted note in `dev/work/plans/wiki-leaning-meeting-extraction/ab-results.md`.

### Thread C — Recap output shape (folded into the same prompt)

**File: `packages/core/src/services/meeting-extraction.ts`**

- Extend the JSON schema in `buildMeetingExtractionPrompt` (around line 644) with two fields:
  ```
  "core": "string — Free-form prose. Lead with the most actionable, decided, or changed thing. Do not restate wiki content. No bullet caps; use whatever shape fits the substance.",
  "could_include": [
    "string — Up to 8 informative one-line headlines for side threads worth knowing about. Order by importance — most worth surfacing first; drop the least important when over budget. Each headline must be self-contained (e.g., 'Risks: Sara flagged churn assumption' — not just 'Risks')."
  ]
  ```
- Keep `summary` accepted for backward compat; when `core` is present, prefer it.
- Lines 817–1139, `parseMeetingExtractionResponse`: parse `core: string` and `could_include: string[]`. Validate `could_include` items: trim, non-empty, ≤200 chars, hard-cap at 8 entries.
- **Frontmatter-injection sanitizer.** Both `core` and each `could_include[]` item are LLM-generated strings written into staged sections of YAML-frontmattered meeting files. Reject any string containing a line-start `---` (YAML doc-separator pattern: `/^---\s*$/m`). On match: strip the offending line and log a warning; do not fail the whole extraction. Same sanitizer pattern lives in topic-page writes per the topic-wiki-memory learnings (2026-04-23).
- Add to `MeetingIntelligence` (line 62): `core?: string`, `could_include?: string[]`.
- Lines 1282–1321, `formatStagedSections`: replace `## Summary` with:
  ```
  ## Core
  <core or fallback to summary>

  ## Could include
  - <item1>
  - <item2>
  ```
  Omit `## Could include` block entirely if empty.

**File: `packages/core/src/services/meeting-apply.ts`**

- Lines 119–124, `STAGED_HEADERS`: **add** `'core'` and `'could include'` alongside the existing `'summary'`. Do NOT remove `'summary'` — keep both `core` and `summary` accepted permanently (Decision #7). Per the integrations LEARNINGS, `parseStagedSections` "stops at any `##` non-staged header" — removing `summary` would silently truncate historical meeting files on re-parse. Grep `## Summary` across `packages/apps/` and `packages/cli/test/golden/` before merging to confirm no caller assumes the old shape.

**File: `packages/core/src/services/meeting-processing.ts`**

- Lines 625–666, `formatFilteredStagedSections`: render `## Core` and `## Could include`. Accept new params `core` and `couldInclude`.

### Call-site plumbing

- `packages/cli/src/commands/meeting.ts:981`: pass `intelligence.core ?? intelligence.summary` and `intelligence.could_include` through.
- `packages/apps/backend/src/services/agent.ts:220`: same. Also pass `activeTopicSlugs` (currently missing — latent gap fixed here).

## Tests

- `packages/core/test/services/topic-detection.test.ts` (new) — threshold cases, recency tiebreaker, single-token coincidence rejection, stop-token rejection (slug like `weekly-sync` against generic-status transcript).
- `packages/core/test/services/meeting-extraction.test.ts` — `core`/`could_include` parsing, presence of delta directive in prompt, presence of "When in doubt, INCLUDE" tiebreaker, presence of one-shot CONFIRMATION-of-uncertainty example, wiki-context section rendering, char budget truncation order (oldest L2 → longest section halved → lowest-scored topic), **frontmatter-injection sanitizer** rejecting strings containing line-start `---`.
- `packages/core/test/services/meeting-context.test.ts` — `topicWikiContext` enrichment + `MeetingContextDeps.topicMemory` factory updates.
- `packages/core/test/services/memory.test.ts` — three header shapes + metadata bullet parsing + `getMemoryItemsForTopics` + code-fence negative case (literal `## Title` inside a fenced block must not match).
- CLI smoke test for `arete meeting extract --dry-run-topics`: prints detected topics + scores, exits without writing extraction artifacts.
- Factory updates wherever memory entries or `MeetingContextDeps` are constructed.
- Golden refresh: `packages/cli/test/golden/*` for any meeting fixtures asserting `## Summary`. (Existing fixtures keep `## Summary` since both headers are accepted; new fixtures use `## Core`.)

## Latent bugs fixed as side effects

1. **L2 parser/writer mismatch.** Writer uses `## Title`, parser keys on `### Title`. Newly written learnings/decisions are unsearchable today. Thread A's parser update fixes both directions.
2. **Backend missing `activeTopicSlugs`.** Slug-bias defense doesn't fire on web path. Fixed in the call-site plumbing above.

Worth calling out in the PR description.

## Risks and things to watch

1. **Topic-detection precision** *(addressed but watch)*. Mitigated by stop-token list, ≥2 non-stop slug tokens threshold, recency tiebreaker, cap=3 at rollout, and the dry-run flag (now a real implementation task). Still: tune thresholds on real meetings before relying on them. Failure mode lives in the long tail.
2. **LLM over-suppression of new learnings** *(highest-impact, invisible)*. The delta directive is strong; the failure mode (real new content silently dropped) leaves no signal. Mitigations: (i) "When in doubt, INCLUDE" tiebreaker baked into the prompt; (ii) one-shot CONFIRMATION-of-uncertainty example; (iii) the 5-meeting A/B as a merge gate. Backstop: a small uncommitted eval script that diffs item counts on 5–10 historical meetings before merge.
3. **Token cost.** ~1.5–3K extra chars for 3 detected topics. `MAX_TOPIC_WIKI_CONTEXT_CHARS = 6000` budget mirrors existing `MAX_EXCLUSION_CHARS = 4000` precedent. Instrument totals on first real meetings.
4. **`could_include` quality.** Risk: LLM uses it as an overflow bucket and dumps low-quality items. Prompt language calls out "informative one-line headlines"; revisit with a one-shot example in the prompt body if quality is shaky in practice.
5. **Section selection drift.** Currently injecting Current state + Scope and behavior + Open questions + Known gaps + last 3 Change log. If extraction quality drops because something important is missing, revisit before tweaking thresholds.
6. **Parser regex edge cases.** Three-shape header match could double-match or mis-classify on real data. Mitigation: anchored regex, single-pass classifier with priority, fixture tests including code-fence negative case (per Thread A spec). Sanity-check against actual `learnings.md` / `decisions.md` before merge.

## Out of scope

- **Slack-digest integration (Phase C item 8).** The `core` / `could_include` shape is forward-compatible — the digest renderer can read these from meeting frontmatter directly. No design change needed here.
- **L2 backfill script.** Tag-forward only. If retroactive precision becomes valuable later (e.g., for eval-script work on old meetings), a small `scripts/backfill-l2-topics.ts` reading source-meeting frontmatter is cheap and deterministic.
- **Two-phase extraction (LLM topic-detection pre-pass).** The lexical pre-pass is the starting point. If recall on novel-but-wiki-adjacent topics proves insufficient, swap `detectTopicsLexical` for `detectTopicsLLM` — `topicWikiContext` stays a clean abstraction.
- **Reconciliation pass changes.** `meeting-reconciliation.ts` is unchanged. Cross-meeting batch reconciliation is orthogonal.
- **Topic-page stub creation from extraction.** Stub creation stays at approve time (`createTopicStub`) — preserves the user gate before topic pages proliferate.

## Critical files

- `/Users/john/code/arete/packages/core/src/services/meeting-extraction.ts`
- `/Users/john/code/arete/packages/core/src/services/meeting-context.ts`
- `/Users/john/code/arete/packages/core/src/services/topic-memory.ts`
- `/Users/john/code/arete/packages/core/src/services/topic-detection.ts` *(new)*
- `/Users/john/code/arete/packages/core/src/integrations/staged-items.ts`
- `/Users/john/code/arete/packages/core/src/services/memory.ts`
- `/Users/john/code/arete/packages/core/src/models/memory.ts`
- `/Users/john/code/arete/packages/core/src/models/topic-page.ts`
- `/Users/john/code/arete/packages/core/src/services/meeting-processing.ts`
- `/Users/john/code/arete/packages/core/src/services/meeting-apply.ts`
- `/Users/john/code/arete/packages/cli/src/commands/meeting.ts`
- `/Users/john/code/arete/packages/apps/backend/src/services/agent.ts`
