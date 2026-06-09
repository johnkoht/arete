/**
 * Phase 10e — Background dedup hygiene engine.
 *
 * Pure orchestration layer for the manual `arete dedup` verb. Reuses the
 * shipped reactive hybrid pipeline (`commitment-dedup-pipeline.ts`) and
 * applies it RETROACTIVELY to existing data within an arbitrary time
 * window (`--since`), as opposed to reactive dedup which only sees the
 * current extract vs. same-day prior commitments.
 *
 * Scopes (per plan §"10e" + AC10 / AC10a):
 *   - `commitments`: pairwise dedup within commitments.json
 *   - `decisions`:   pairwise dedup within memory/items/decisions.md
 *   - `learnings`:   pairwise dedup within memory/items/learnings.md
 *   - `topics`:      flag topic pages with overlapping aliases / body
 *
 * The module is PURE — it does NOT write to disk. Callers (CLI) decide
 * whether to apply or surface for review based on the `--dry-run` /
 * `--apply` flag. Tests exercise this module against synthetic in-memory
 * fixtures; no LLM, no production writes.
 *
 * Reuse + idempotency contract:
 *   - For commitments scope: groups are computed via the hybrid pipeline's
 *     `findDedupCandidates` + (when an LLM is provided) `runLLMCrossCheck`.
 *     Re-running `--apply` on already-merged data produces ZERO new groups
 *     because the canonical commitments' text_hash + textVariants now cover
 *     the prior surface forms (the v2 normalizer + hash absorbs them).
 *   - For decisions / learnings: Jaccard token similarity over the section
 *     body, gated by title/topic overlap. Same idempotency story — once
 *     duplicates are merged into a single section, the Jaccard pass on
 *     subsequent runs finds no pairs at the threshold.
 *   - For topics: alias-overlap + body-Jaccard. Conservative — surfaces
 *     pairs that overlap, leaves merging to the user (no auto-merge of
 *     topic pages in v2; the human owns the wiki).
 *
 * Mutual exclusion with reactive dedup:
 *   The CLI wrapper acquires `services.commitments.withLock(...)` before
 *   invoking the apply path. This engine is lock-agnostic — it returns
 *   a result + a diff bundle, and the caller chooses whether to write
 *   inside or outside the lock. The contract is documented per-scope in
 *   the apply helpers below.
 */
import { type LLMCallConcurrentFn } from './commitment-dedup-pipeline.js';
import type { Commitment } from '../models/index.js';
import type { DedupDecisionLogPayload } from './dedup-decisions-log.js';
/** Scope of the background dedup pass. */
export type BackgroundDedupScope = 'commitments' | 'decisions' | 'learnings' | 'topics';
/**
 * One dedup group surfaced by the background pass. Members are the IDs
 * (or section titles, for memory scopes) of items the pipeline judged
 * to be duplicates of the same canonical. The first entry is the
 * canonical (oldest by `date`/`createdAt`); the remainder are the
 * duplicates that would collapse under `--apply`.
 */
export type BackgroundDedupGroup = {
    /** Canonical entry — id (commitments) or section title (decisions/learnings/topics). */
    canonicalKey: string;
    /** Canonical text / body summary (for diff rendering). */
    canonicalText: string;
    /** Duplicate keys with merge metadata. */
    duplicates: BackgroundDedupDuplicate[];
};
/** One member of a group (other than the canonical). */
export type BackgroundDedupDuplicate = {
    key: string;
    text: string;
    /** Jaccard similarity vs the canonical's normalized text. */
    jaccard: number;
    /** LLM verdict when one was available; absent when no LLM was provided. */
    llmDecision?: 'SAME' | 'DIFFERENT' | 'UNCERTAIN';
    /** Free-form one-sentence LLM reasoning, when available. */
    reasoning?: string;
};
/**
 * Candidate row that did not reach a confident merge but is surfaced
 * for human review (LLM returned UNCERTAIN, or Jaccard cleared a
 * surfacing-only floor but did not reach the merge floor).
 */
export type BackgroundDedupCandidatePair = {
    leftKey: string;
    leftText: string;
    rightKey: string;
    rightText: string;
    jaccard: number;
    reasoning?: string;
};
/** Per-scope counters for the dry-run / apply summary. */
export type BackgroundDedupSummary = {
    scope: BackgroundDedupScope;
    /** Total items considered after the `--since` filter. */
    totalIn: number;
    /** Number of groups (= sets of canonical + ≥1 duplicate). */
    groups: number;
    /** Number of duplicates across all groups (= sum of group.duplicates.length). */
    duplicates: number;
    /** Number of UNCERTAIN / surface-for-review pairs. */
    uncertain: number;
};
/** Top-level result returned by `runBackgroundDedup`. */
export type BackgroundDedupResult = {
    summary: BackgroundDedupSummary;
    /** Groups of confirmed duplicates (LLM SAME, OR text-hash exact match). */
    groups: BackgroundDedupGroup[];
    /** Pairs surfaced for review (LLM UNCERTAIN or pre-LLM Jaccard floor). */
    candidates: BackgroundDedupCandidatePair[];
    /** Markdown diff describing the proposed merges (suitable for writing to disk). */
    diff: string;
};
/** Inputs to the background dedup engine. */
export type RunBackgroundDedupInputs = {
    scope: BackgroundDedupScope;
    /**
     * YYYY-MM-DD inclusive lower bound. Entries with `date` < `since` are
     * filtered out. Omit / pass `undefined` to consider all entries.
     */
    since?: string;
    /** When `--apply` is being run, this is `true`; affects diff header text. */
    dryRun: boolean;
    /** Required when scope='commitments'. */
    commitments?: ReadonlyArray<Commitment>;
    /** Required when scope='decisions' or scope='learnings'. */
    sections?: ReadonlyArray<MemorySectionInput>;
    /** Required when scope='topics'. */
    topics?: ReadonlyArray<TopicPageInput>;
    /**
     * LLM cross-check primitive. When omitted, the engine falls back to
     * Jaccard-only classification (text-hash exact matches still flagged
     * as definite dupes). When provided, ambiguous candidates surface to
     * the LLM and the verdict refines the grouping.
     */
    callConcurrent?: LLMCallConcurrentFn;
    /** LLM tier override; defaults to 'fast' (same as reactive pipeline). */
    tier?: 'fast' | 'standard' | 'frontier';
};
/**
 * Minimal shape for a memory-file section (decisions.md / learnings.md).
 * Caller adapts from `parseMemorySections` output.
 */
export type MemorySectionInput = {
    /** Section title — used as canonicalKey. */
    title: string;
    /** Section body text — used for Jaccard. */
    body: string;
    /** ISO date (YYYY-MM-DD) — used for canonical-pick + `--since` filter. */
    date?: string;
    /** Source meeting / file ref — surfaced in diff for context. */
    source?: string;
    /** Optional topic tags for narrowing the candidate set. */
    topics?: string[];
};
/**
 * Minimal shape for a topic page. Caller adapts from `TopicPage` in
 * `models/topic-page.ts`.
 */
export type TopicPageInput = {
    /** Canonical slug — used as canonicalKey. */
    topicSlug: string;
    /** Declared aliases (frontmatter). */
    aliases: string[];
    /** Concatenated body of all sections — used for Jaccard. */
    body: string;
    /** ISO YYYY-MM-DD when the page was last refreshed; used for canonical-pick. */
    lastRefreshed?: string;
};
/**
 * Jaccard floor for surfacing pairs of memory-file sections (decisions /
 * learnings). Lower than the dedup-pipeline's 0.6 because memory sections
 * tend to have more boilerplate than commitment text, and we want the
 * background pass to surface for review rather than auto-merge. Pairs
 * above this floor but below the LLM-confirmed bar appear in
 * `candidates[]`.
 */
export declare const BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR = 0.55;
/**
 * Jaccard floor for grouping topic pages as overlapping. Topic pages
 * are wider in scope than memory sections (whole-area summaries), so
 * the floor is lower. Surface-only — topic pages are never auto-merged.
 */
export declare const BACKGROUND_DEDUP_TOPICS_JACCARD_FLOOR = 0.4;
/**
 * Run the background dedup pass for the given scope.
 *
 * Returns a `BackgroundDedupResult` describing the proposed groups +
 * candidates + a markdown diff. The caller decides whether to write
 * the diff and / or apply the merges based on the verb's CLI flags.
 *
 * Idempotency: when called twice in a row with the same inputs, the
 * result is identical (pure function). The CLI wrapper's `--apply`
 * step is what mutates state; this engine is read-only.
 */
export declare function runBackgroundDedup(inputs: RunBackgroundDedupInputs): Promise<BackgroundDedupResult>;
/**
 * Render a markdown diff describing the proposed dedup operation.
 * Stable output for stable inputs; suitable for committing as an audit
 * artifact under `dev/work/plans/.../dedup-diff-<scope>-<date>.md`.
 */
export declare function formatBackgroundDedupDiff(args: {
    summary: BackgroundDedupSummary;
    groups: ReadonlyArray<BackgroundDedupGroup>;
    candidates: ReadonlyArray<BackgroundDedupCandidatePair>;
    dryRun: boolean;
    since?: string;
}): string;
/**
 * Apply a commitments-scope dedup result to a commitments array,
 * returning the new array. PURE — does not write to disk. Caller is
 * responsible for wrapping the read/write cycle in
 * `services.commitments.withLock(...)` to prevent races with reactive
 * dedup running in `arete meeting extract`.
 *
 * Merge semantics (per AC2 / AC5):
 *   - Duplicates absorb into the canonical's `source_meetings[]` and
 *     `textVariants[]` (cap 5, oldest-first eviction).
 *   - Duplicates are removed from the output array.
 *   - Canonical's `status` stays unchanged. If any duplicate was
 *     `resolved` and the canonical is `open` (rare — we filter to open
 *     only), the canonical is left open; the resolution is treated as
 *     a duplicate-of-open and dropped (matches reactive semantics).
 *   - `id` of the canonical is preserved.
 *
 * Idempotency: re-running this with the same `result` produces the
 * same output array (duplicates are already absent on the second pass).
 */
export declare function applyCommitmentsDedup(commitments: ReadonlyArray<Commitment>, result: BackgroundDedupResult): Commitment[];
/**
 * I-6: collect the dupe→source provenance for each absorbed duplicate in a
 * commitments-scope dedup result, as MERGE log payloads ready to append to the
 * dedup-decisions log.
 *
 * `applyCommitmentsDedup` (above) is a pure transform that UNIONS each dupe's
 * `source_meetings` / `text` into the canonical and then discards the per-dupe
 * association — making "dupe X came from meeting Y with text Z" unrecoverable
 * from the resulting Commitment row. This helper captures that association from
 * the SAME inputs (the dupe's own commitment row, looked up by group key) at
 * merge time so it can be persisted durably.
 *
 * Each returned payload is a MERGE line whose `newId` is the dupe id, whose
 * `canonicalId` is the group canonical, and which carries `dupeSourceMeeting` +
 * `dupeText`. The unmerge wire-in (not yet built) rebuilds `DupeSourceMapping[]`
 * from these via `buildDupeSourceMapping` (dedup-explain.ts) so a 3+-source
 * `[[unmerge]]` peels the correct source instead of refusing with
 * `ambiguous-dupe`.
 *
 * A dupe's source meeting is `dupCommitment.source` if set, else the first of
 * its `source_meetings[]`. A dupe with no resolvable source is skipped (no
 * half-records — an incomplete mapping is useless to the resolver).
 *
 * Pure: no I/O. The CLI `--apply` path writes the returned payloads to the log.
 */
export declare function collectDupeProvenance(commitments: ReadonlyArray<Commitment>, result: BackgroundDedupResult): DedupDecisionLogPayload[];
//# sourceMappingURL=background-dedup.d.ts.map