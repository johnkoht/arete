# Computed Topic Memory — Design Investigation

**Date**: 2026-04-22
**Status**: Design, not yet scoped to PRD
**Investigation method**: parallel subagent exploration (recon + three solution shapes: event-log / materialized summaries / semantic primitive)

## 1. The problem, restated

When new information lands in Areté — a meeting extracts an action item, Slack marks a commitment resolved, a task gets checked off — the system too often **creates duplicates instead of advancing the user's existing process**. The mechanical symptom is that a meeting can re-extract an action item that Slack already resolved an hour earlier, because the extraction pipeline doesn't see Slack's resolution. The deeper symptom is that there is no single queryable view of "what's happening on topic X across all surfaces."

The goal of this investigation is a design for a **computed topic/area memory layer** that answers the dedup question *and* the "state of the topic" question from one shared substrate.

## 2. Current state

### Write paths

| Store | Writer (code path) | Format | Trigger | Read by |
|---|---|---|---|---|
| `.arete/memory/items/decisions.md` | `appendToMemoryFile` in `integrations/staged-items.ts` | `## Title` + YAML fields + bullets | Meeting item approved | `parseMemoryItems` via `loadReconciliationContext` (`meeting-reconciliation.ts:776`) |
| `.arete/memory/items/learnings.md` | same as above | same | same | same |
| `.arete/memory/items/agent-observations.md` | unclear — no code write path found | markdown | manual / agent | no reader in current code |
| `.arete/commitments.json` | `CommitmentsService.create/resolve/merge` (not `.arete/memory/commitments/` as the prompt assumed) | JSON array | Meeting extraction → commitments derivation, or `TaskService.completeTask` auto-resolve | `CommitmentsService.query`, person-memory. **Not read by meeting-context extraction prompt assembly.** |
| `now/week.md`, `now/tasks.md` | `TaskService.addTask/completeTask` or user edit | `- [ ]`/`- [x]` + `@tag(value)` metadata | meeting-apply, user, auto-resolve | `extractTaskTexts` passes up to 20 open items into extraction context (`meeting-context.ts:925`); reconciliation does not read them |
| `resources/meetings/*.md` frontmatter | `meeting-apply.ts` stage/approve | YAML `staged_items`, `approved_items` | Extraction approval workflow | `loadRecentMeetingBatch` for reconciliation |
| `resources/notes/YYYY-MM-DD-slack-digest.md` — `## Reconciliation Summary` | Slack digest skill | YAML frontmatter with `areas: [...]` + sections (`### Week Tasks Updated`, `### Commitments Resolved`, `### Waiting On Added`) | Daily digest run | **Nothing.** Grep confirms no read path. |
| `areas/<slug>.md` `## Notes` | User append, meeting-apply on decision approval | Bulleted, append-only, no date stamps | Both | `area-parser.ts` reads for area resolution; `loadReconciliationContext` uses area memory for relevance scoring only |
| `.arete/memory/areas/<slug>.md` | **`AreaMemoryService.refreshAreaMemory`** (`services/area-memory.ts`) | Frontmatter + sections: Keywords, Topics, Active People, Open Work, Recently Completed, Recent Decisions | `arete memory refresh` CLI only | `AreaParserService` for relevance scoring in reconciliation |
| `.arete/memory/summaries/` | nobody | n/a | n/a | nobody |

### Existing dedup & similarity patterns

Five Jaccard-based sites, same normalization (`normalizeForJaccard` → lowercase + punct-strip + tokenize), different thresholds:

- `meeting-processing.ts` completed-task reconciliation: **0.6** (task text in `week.md` is abbreviated)
- `meeting-reconciliation.ts` cross-meeting dedup, recent-memory match: **0.7**
- `meeting-reconciliation.ts` `matchPriorWorkspace` via **qmd semanticSearch at 0.85** (the only semantic path; qmd already indexes workspace markdown with embeddings)
- `tasks.ts` add-time near-dup: **0.8**
- `commitments.ts` exact hash over (text + person + direction) — different primitive (identity, not similarity)

`batchLLMReview` in `meeting-reconciliation.ts:670` is a Tier-C-style Haiku pass that adjudicates a short candidate list — the pattern exists, and proves out the cascade approach below.

Soft dedup pre-LLM: `extractTaskTexts` passes up to 20 open tasks into the extraction prompt as context — the LLM sees them and is expected not to re-propose.

### Concrete gaps (load-bearing)

1. **`loadReconciliationContext` hardcodes `completedTasks: []`** (`meeting-reconciliation.ts:793`). The `matchCompletedTasks` machinery exists but is fed an empty list. **This is a bug, not just a design gap.**
2. **Slack digest `## Reconciliation Summary` never read.** The digest knows a commitment resolved an hour before a meeting; extraction can't see it.
3. **Commitment resolutions never flow into extraction context.** `commitments.json` has status; `buildMeetingContext` doesn't consult it.
4. **Reconciliation tier is computed but not gating.** `scoreRelevance` produces `high/normal/low`, but dedup decisions don't use it.
5. **`areas/<slug>.md` `## Notes` are append-only with no timestamps.** Not queryable for "what happened on area X in last N days."
6. **`.arete/memory/areas/<slug>.md` exists but lacks the digest/commitment-recency signal.** Refreshed only by explicit `arete memory refresh`.

## 3. Proposed design — three layers

The three solution agents produced complementary, not competing, proposals. The synthesis has three layers, each small on its own:

### Layer 1 — `ActivityStore`: a read-view over existing stores

A typed view (not a new persistence layer) that projects every state-change surface into a uniform `ActivityRecord`:

```ts
export type ActivityKind =
  | 'meeting_action_approved' | 'meeting_action_staged' | 'meeting_action_skipped'
  | 'task_open' | 'task_completed'
  | 'commitment_open' | 'commitment_resolved'
  | 'waiting_on'
  | 'slack_resolution' | 'slack_commitment_added'     // from digest sections
  | 'decision' | 'learning';                          // reference-only, not dedup target

export interface ActivityRecord {
  id: string;                        // stable: hash(kind + source.path + anchor)
  kind: ActivityKind;
  text: string;                      // dedup-salient, metadata-stripped
  status: 'open' | 'resolved' | 'skipped' | 'reference';
  area?: string;
  owner?: string;
  counterparty?: string;
  direction?: 'i_owe_them' | 'they_owe_me';
  createdAt: string;
  resolvedAt?: string;
  source: { service: string; path: string; anchor?: string };
}
```

The `ActivityStore` reads from existing files (tasks, commitments.json, staged meeting frontmatter, memory items, and — new — parsed slack-digest sections). **No new persistence, no new write log in v1.** Every writer already writes somewhere; the store is a normalized read projection.

Query primitive:

```ts
queryActivity(args: {
  topic?: string | string[];   // area slug(s); missing = all
  since?: Date;
  kinds?: ActivityKind[];
  owner?: string;
  includeResolved?: boolean;   // default true for dedup, false for "what's open"
  limit?: number;
}): Promise<ActivityRecord[]>
```

This primitive is what `loadReconciliationContext`, weekly review, area briefing, and person-memory refresh should all call. It collapses five near-identical readers.

### Layer 2 — extend `.arete/memory/areas/<slug>.md` (do NOT create `.arete/memory/summaries/`)

`AreaMemoryService` already materializes per-area summaries with sections Open Work / Recently Completed / Recent Decisions. **Extend it**, don't parallel it. Two new sections:

- `## Recent Digest Activity` — last 7 days of slack-digest bullets filtered by digest frontmatter `areas: [slug]`
- `## Unresolved Threads` — digest bullets mentioning pending responses / "waiting on"

Refresh triggers:
- **Synchronous** on `meeting-apply` (approval) for the meeting's area — the one hot path where stale state corrupts extraction
- **Synchronous** on slack-digest writer for each area in the digest's `areas:` frontmatter
- **Lazy** (mtime / sources_hash check on read) for everything else
- **Full rebuild** on `arete index`

This is deterministic aggregation, not LLM synthesis — cheap enough to run per-write. LLM narrative sits in the already-existing `_synthesis.md` cross-area file and stays orthogonal.

Rejecting `.arete/memory/summaries/` as a third directory: `areas/<slug>.md` (hand-curated strategy) + `.arete/memory/areas/<slug>.md` (computed state) are already two documents about one topic. A third is user-hostile. The empty `summaries/` directory can be repurposed for **free-form topic summaries** (user-triggered `arete memory refresh --topic "span-tag-bug"`) or deleted.

### Layer 3 — `findSimilar` cascade for dedup

Collapse the five Jaccard sites into one primitive with a relationship classifier:

```ts
findSimilar(
  candidate: { text: string; kind: ActivityKind; owner?: string; area?: string },
  opts?: {
    scope?: { area?: string; kinds?: ActivityKind[]; since?: Date };
    useLLM?: boolean;      // default true for meeting-extraction; false for bulk
    topK?: number;         // default 5
  },
): Promise<{
  matches: Array<{
    record: ActivityRecord;
    jaccardScore: number;
    relationship?: 'duplicate' | 'resolution' | 'restatement' | 'related' | 'new';
    reasoning?: string;
  }>;
  decision: 'duplicate' | 'resolution' | 'restatement' | 'related' | 'new';
}>
```

**Tier A (free)** — Jaccard over `queryActivity({ area, since, kinds })`. Produces shortlist of ≤20 candidates.

**Tier C (Haiku, ~$0.006/call)** — pass the shortlist + candidate to an existing `AIService` task that classifies the single best relationship. Reuses the `batchLLMReview` pattern already in the codebase.

Skip **Tier B (embeddings)**: qmd's unit of retrieval is a markdown file, not a record; materializing records as 1-line .md files pollutes the workspace; adding a new embedding SDK + vector store is weeks of work for marginal accuracy over Tier A→C. At ~35 candidates/day per heavy user, Tier C is ~$6/month. qmd stays where it already works (`matchPriorWorkspace` file-level search).

**The product-critical distinction — duplicate vs resolution — must be LLM-decided.** Scoring can't tell you "the new meeting item 'sent the pricing deck' is a *resolution* of open commitment 'send the pricing deck'" vs a duplicate action item. Jaccard will score both high. The LLM needs to label relationship, and consumers must handle `resolution` specially: *propose* closing the open item, never auto-close in v1.

## 4. Consumer map

| Consumer | Uses | Slice |
|---|---|---|
| Meeting extraction dedup (the immediate need) | `findSimilar` + `queryActivity` | Per-candidate: kinds = [task, commitment, slack_resolution, meeting_action_approved]; area = meeting area; since = 30d |
| Meeting extraction prompt context | `.arete/memory/areas/<slug>.md` (rendered) | Whole area summary pasted as prior-state block |
| Reconciliation (`loadReconciliationContext`) | `queryActivity` | Replaces the current split reads of decisions.md + learnings.md; adds completedTasks (fixes hardcoded `[]` bug) |
| Area briefing / weekly review | `queryActivity` + Layer 2 summary | Open items, resolved-in-week, decisions, digest activity |
| Person memory refresh | `queryActivity({ owner: slug })` | All activity involving the person |
| Future: Slack reconciliation consumer | `findSimilar` | When digest writes `### Commitments Resolved`, confirm each against the ActivityStore before emitting |

## 5. Computed vs cached

- **Layer 1 (ActivityStore)**: computed on demand, no cache in v1. At <10k records this is milliseconds. Add an in-process memoization when a hot consumer appears.
- **Layer 2 (extended area memory)**: materialized to disk. Hybrid refresh (synchronous on meeting-apply and digest-write, lazy otherwise). `sources_hash` in frontmatter over (commitments.json mtime, digests-in-area-since-last-write mtime, meetings-in-area-since-last-write mtime, area file mtime, decisions/learnings mtime).
- **Layer 3 (findSimilar)**: no persistent cache. Each call recomputes via Layer 1 + optional LLM. Idempotent.

Staleness tolerance: for meeting extraction (hot path) the Layer 2 summary must be fresh — synchronous regen before extraction runs for the target area. Everywhere else, lazy-with-hash is fine.

## 6. Relationship to `areas/<slug>.md`

**Recommendation: `areas/<slug>.md` stays fully hand-curated. `.arete/memory/areas/<slug>.md` becomes the single computed projection.** No auto-appends to `## Notes` in the hand-curated file.

Rationale: Auto-updating a hand-curated file creates a provenance mess (did the user write this line, or did meeting-apply?). The clean split is: user owns `areas/*`, system owns `.arete/memory/areas/*`. The system's file is labeled auto-generated, lives under `.arete/memory/`, and can be blown away and rebuilt. Meeting-apply's current behavior of appending approved decisions under `## Notes` of the hand-curated file is **a design wart that should be reconsidered** (file a separate issue — out of scope here).

## 7. Migration path — the smallest shippable v1

v1 in the order it should be built:

1. **Fix the `completedTasks: []` bug** in `loadReconciliationContext` (`meeting-reconciliation.ts:793`). Read from `TaskService` filtered by meeting area + last 30d. **This is the single highest-leverage change** — one line of real work, unblocks the machinery that already exists.
2. **Parse slack-digest `## Reconciliation Summary` sections.** Add a small parser in `packages/core/src/services/slack-digest-parser.ts` returning `SlackDigestActivity[]` (resolved commitments, added waiting-ons, completed tasks). Cache parsed results keyed by file mtime.
3. **Introduce `ActivityStore`** as a read view (Layer 1). Initial kinds: tasks, commitments, slack-digest-parsed entries, staged/approved meeting items, decisions/learnings. No new persistence.
4. **Extend `AreaMemoryService.computeAreaData`** (Layer 2) to include `recentDigestActivity` (last 7d) and `unresolvedThreads`. Render two new sections. Add synchronous refresh calls in `meeting-apply` and the slack-digest writer.
5. **Build `findSimilar`** (Layer 3) as cascade Jaccard → `AIService` reconciliation task. Migrate `meeting-processing.ts` completed-items path first. Leave other Jaccard sites untouched in v1; migrate them as trust grows.
6. **Do not build** a new event log, new embedding pipeline, new `summaries/` directory, or auto-append to `areas/<slug>.md` notes.

First consumer wired: **meeting extraction dedup** — the immediate user-visible win is that a commitment resolved in the morning's slack digest won't be re-extracted from an afternoon meeting.

What immediately benefits without any new code by just doing step 1+2: reconciliation stops missing completed-task matches, and a digest-parsed `slack_resolution` feed makes `matchRecentMemory` useful for slack-resolved commitments.

## 8. Risks

- **Circular read/write loop.** If Layer 2 is auto-updated from meetings and then fed back into meeting extraction as "prior state," new items can double-count. Mitigation: `findSimilar` timestamp-gates to `since < current-extraction-run-start`; `source.path` filter excludes the current meeting; area-memory refresh happens *after* the meeting is fully applied, not during extraction.
- **Schema drift across sources.** Tasks, commitments, meetings, digests all have subtly different metadata conventions. `ActivityStore`'s normalizer is load-bearing — if it's buggy, Layer 3 dedup is garbage. Mitigation: treat the normalizer as a tested unit; golden-file tests per source kind.
- **False positives in `findSimilar`.** Auto-resolving an open commitment because a meeting said something similar is data loss. Mitigation: v1 never auto-resolves — relationship `resolution` surfaces a proposal to the user through the existing approval flow.
- **Agent-observations orphan.** `.arete/memory/items/agent-observations.md` has no writer-of-record and no reader. Out of scope to fix here; flag for triage.
- **qmd divergence.** qmd's index is file-based and already used for `matchPriorWorkspace`; `findSimilar` operates on records. The two can disagree. For v1, leave qmd where it is — it catches workspace-duplicate *files*, which is a different question.
- **Hand-curated `## Notes` appends from meeting-apply.** Pre-existing behavior; this design leaves it alone but the tension (system writing to a user-curated file) is real and should be revisited separately.

## 9. Open questions for the builder

1. **Is there a second real consumer for the `ActivityStore` primitive on the horizon** (weekly review, area briefing, dashboard)? If not, v1 might be better scoped as "just fix the completedTasks bug + read slack-digest parser into existing reconciliation" — no new primitive. The `ActivityStore` layer earns its keep once two or three consumers need it; before that it's speculative infrastructure.
2. **Accept Haiku cost + latency in the extraction path?** Tier C adds ~400ms per candidate plus ~$0.006. For a 5-item meeting that's 2s + $0.03 — probably fine, but worth naming.
3. **Auto-close behavior for `resolution`.** Should the v1 experience ever auto-close an open task/commitment when `findSimilar` returns `relationship: resolution` with high confidence? My default is no — surface as a proposal. Confirm.
4. **Slack-digest parsing scope.** The `## Reconciliation Summary` section is the structured part, but the rest of the digest has valuable context too. v1 parses only the structured subsections. OK?
5. **Agent-observations memory file** — who writes it, who should read it? Needs a decision before this design touches it.
6. **The `## Notes` auto-append behavior in meeting-apply** — leave as-is, or split out as a follow-up cleanup? This design assumes leave-as-is, but it conflicts with "hand-curated files stay hand-curated."

---

### Appendix — why not the alternatives

- **Full event log** (JSONL append, replayable projections): attractive and clean, but builds infrastructure before two consumers ask for it. The `ActivityStore` read-view gets 80% of the benefit with 20% of the code and can grow into an event log later if needed.
- **Parallel `summaries/<topic>.md` directory**: creates a third document on the same topic next to `areas/<slug>.md` and `.arete/memory/areas/<slug>.md`. Extending the existing area-memory file is the cleaner move.
- **Embedding-based dedup (Tier B)**: qmd already does file-level semantic search. Record-level embeddings would require materializing records as files (ugly) or a new SDK + vector store (heavy). Tier A → Tier C cascade captures the paraphrase-dedup win cheaper.
- **Just extend the extraction prompt's context**: tempting — pass completed tasks + open commitments + slack-resolved items into the extraction context and let the LLM handle dedup as a side effect. This is genuinely the smallest possible fix and is mostly what step 1+2 above get you. The primitive earns its keep only if you want the same view from multiple consumers.
