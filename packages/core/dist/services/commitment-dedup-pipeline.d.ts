/**
 * Phase 10b-min — Reactive cross-meeting commitment dedup pipeline.
 *
 * Hybrid pre-filter + batched LLM cross-check at extract time. Same-day
 * window only in the initial ship (Q4 deferred to soak per plan v2 third
 * pass). Eng C4: person-slug overlap is the deterministic gate, NOT NER
 * entity extraction.
 *
 * Pipeline (per plan §"Semantic dedup pipeline"):
 *
 *   1. Normalize text + compute v2 hash (delegated to commitments-hash-v2).
 *   2. Text-hash exact match → return immediately as definite SAME.
 *   3. Hybrid pre-filter:
 *        a. Jaccard token similarity ≥ 0.6
 *        b. Person-slug overlap ≥ 1 (extracted from text + stakeholders[])
 *        c. Direction match
 *      Cap at top 5 by Jaccard score.
 *   4. Batched LLM cross-check (fast tier; one prompt for ALL candidate
 *      pairs — uses AIService.callConcurrent OR single-prompt-multi-pair
 *      via callConcurrent of length 1).
 *   5. Apply decisions: SAME → dupe, DIFFERENT → new canonical,
 *      UNCERTAIN → new canonical + "Possibly mergeable" flag.
 *
 * Pure module — no I/O, no filesystem, no service coupling. The LLM call
 * is injected as a function parameter (callConcurrentFn) so tests can mock
 * it deterministically. The caller (meeting-extraction wire-in, Step 2)
 * owns the lock acquisition + commitments.json read.
 *
 * Critical invariants:
 *   - NO production data writes from this module.
 *   - NO LLM calls without the caller-injected function.
 *   - All inputs read-only; outputs are new objects/decisions.
 */
import type { Commitment, CommitmentDirection } from '../models/index.js';
/**
 * The shape of a freshly-extracted staged item passed into the pipeline.
 *
 * The extract flow constructs one of these from an `ActionItem` (or
 * similar) before consulting the pipeline. The pipeline NEVER reads from
 * disk — it only inspects fields on this struct + the candidate list.
 */
export type ExtractedItemForDedup = {
    /** Stable item ID (ai_001 / de_001 / le_001 etc.) used in decisions log. */
    id: string;
    /** Raw text (NOT pre-normalized — pipeline runs normalizer itself). */
    text: string;
    /** Direction relative to workspace owner; pipeline filters on this. */
    direction: CommitmentDirection;
    /**
     * Person slugs explicitly attached to the staged item (owner +
     * counterparty when present). Pipeline unions these with `@<slug>`
     * tokens extracted from `text` to build the person-slug overlap set.
     */
    personSlugs: string[];
    /**
     * Meeting slug for the meeting being extracted. Used purely for log /
     * badge rendering — pipeline logic doesn't filter on it.
     */
    meetingSlug: string;
};
/**
 * A candidate from the existing commitment set (or same-day staged items)
 * that passed the hybrid pre-filter.
 */
export type DedupCandidate = {
    /** Canonical ID of the existing commitment / staged item. */
    id: string;
    /** Canonical text. */
    text: string;
    /** Same direction as the new item (filtered before this point). */
    direction: CommitmentDirection;
    /** Person slugs for overlap measurement. */
    personSlugs: string[];
    /** Meeting slug where this candidate lives (for `↪ canonical in <slug>` badge). */
    meetingSlug: string;
    /** Jaccard similarity of normalized text vs the new item's normalized text. */
    jaccard: number;
};
/**
 * A decision rendered by `findDedupCandidates` when an exact text-hash
 * match exists. Short-circuits the LLM cross-check.
 */
export type ExactMatchDecision = {
    kind: 'exact-match';
    canonical: DedupCandidate;
};
/**
 * The output of `findDedupCandidates`: either a definitive exact match
 * (skip LLM) or a list of fuzzy candidates to send to the LLM.
 */
export type FindCandidatesResult = ExactMatchDecision | {
    kind: 'fuzzy';
    candidates: DedupCandidate[];
};
/** LLM cross-check decision for a single candidate pair. */
export type LLMPairDecision = {
    /** Candidate ID (matches DedupCandidate.id). */
    candidateId: string;
    /** Pair verdict. */
    decision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN';
    /** Free-form 1-sentence reasoning from the model. */
    reasoning: string;
};
/**
 * Final pipeline decision per AC2 / AC3 / AC4 / AC4a.
 *
 * - `definite-dupe`: text-hash exact match OR LLM SAME on the canonical.
 *   Caller marks the new item as a dupe, surfaces `↪ canonical in <slug>`.
 * - `new-canonical`: no candidates passed, or LLM DIFFERENT on all.
 *   Caller registers the new item as a fresh commitment.
 * - `possibly-mergeable`: LLM returned UNCERTAIN. Caller still registers
 *   as a NEW canonical (per AC4a) but flags for user review in next
 *   winddown.
 */
export type DedupOutcome = {
    kind: 'definite-dupe';
    canonical: DedupCandidate;
    via: 'text-hash' | 'llm-same';
    reasoning?: string;
    jaccard?: number;
} | {
    kind: 'new-canonical';
    candidatesEvaluated: DedupCandidate[];
    llmDecisions?: LLMPairDecision[];
} | {
    kind: 'possibly-mergeable';
    bestCandidate: DedupCandidate;
    llmDecisions: LLMPairDecision[];
    reasoning: string;
};
/**
 * Function signature for the LLM cross-check primitive. Matches
 * AIService.callConcurrent's surface shape so tests can inject a mock
 * without pulling in the full AIService class.
 *
 * The Step 2 wire-in calls this with a SINGLE prompt (length-1 array)
 * containing the full multi-pair batch — the prompt itself is the
 * batching boundary (one model call returns decisions for all candidate
 * pairs at once). callConcurrent is used for shape consistency with
 * other call sites, not for parallelism.
 */
export type LLMCallConcurrentFn = (prompts: {
    tier: 'fast' | 'standard' | 'frontier';
    prompt: string;
}[]) => Promise<string[]>;
/** Jaccard floor for fuzzy candidacy (plan §"Hybrid pre-filter"). */
export declare const DEDUP_JACCARD_THRESHOLD = 0.6;
/** Cap on candidates passed to the LLM (plan: "top 5 by Jaccard score"). */
export declare const DEDUP_CANDIDATE_CAP = 5;
/**
 * Tokenize text for Jaccard. Reuses the same shape as
 * `entity.normalizeStanceTokens` (Phase 9 followup-6) — lowercase, strip
 * non-alphanumeric, drop ≤2-char tokens. We don't import the entity
 * version directly because commitment text already runs through the v2
 * normalizer (which strips arrows, slug mentions, intent prefixes) — so
 * we want to tokenize the OUTPUT of the v2 normalizer, not raw text.
 *
 * Exported for test introspection.
 */
export declare function tokenizeForJaccard(normalizedText: string): Set<string>;
/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0–1 where 1 is identical. Same formula as
 * `entity.stanceJaccardSimilarity` — reproduced here so the dedup module
 * doesn't introduce a circular import on entity.ts.
 *
 * Exported for test introspection.
 */
export declare function jaccardSimilarity(a: Set<string>, b: Set<string>): number;
/**
 * Extract `@<slug>` tokens from raw text.
 *
 * The hash-v2 normalizer strips these on the way to hashing; the dedup
 * pipeline wants them BACK for the person-slug overlap gate. We run a
 * dedicated regex over the raw text rather than re-deriving from a
 * pre-normalized form.
 *
 * Exported for test introspection.
 */
export declare function extractSlugMentions(text: string): string[];
/**
 * Build the person-slug set for an item: union of `personSlugs` (from
 * the item's structural metadata) and `@<slug>` mentions parsed from
 * the raw text.
 *
 * Exported for test introspection.
 */
export declare function buildPersonSlugSet(text: string, personSlugs: ReadonlyArray<string>): Set<string>;
/**
 * Stable shape for "existing commitment" inputs. The Step 2 wire-in
 * adapts `Commitment` (from models/entities.ts) into this shape so the
 * pipeline doesn't pull `Commitment`'s full v1/v2 dual shape into its API.
 *
 * Same-day staged items from OTHER meetings adapt into this shape too
 * (the meeting slug carries the cross-meeting attribution).
 */
export type ExistingCommitmentForDedup = {
    id: string;
    text: string;
    direction: CommitmentDirection;
    personSlugs: string[];
    meetingSlug: string;
    /** ISO date (YYYY-MM-DD) — caller pre-filters by date when `sameDay=true`. */
    date: string;
};
/**
 * Find dedup candidates for `extractedItem` against `existingCommitments`.
 *
 * Steps (per plan §"Semantic dedup pipeline"):
 *
 *   1. Compute v2 hash of new item → scan existing for exact match.
 *      If found, return `{ kind: 'exact-match', canonical }` — the LLM
 *      cross-check is skipped (AC2).
 *
 *   2. Otherwise, build candidate set:
 *      - direction match (filter)
 *      - Jaccard ≥ DEDUP_JACCARD_THRESHOLD on normalized text
 *      - person-slug overlap ≥ 1 (intersection of slug sets)
 *      Cap to top DEDUP_CANDIDATE_CAP by Jaccard score (desc).
 *
 *   3. Return `{ kind: 'fuzzy', candidates }` — even if `candidates` is
 *      empty (caller treats empty as "new canonical, no LLM needed").
 *
 * @param extractedItem - New item from current meeting's extraction.
 * @param existingCommitments - Universe to dedup against. Caller is
 *   responsible for same-day filtering and for unioning commitments.json
 *   rows with same-day staged items from OTHER meetings.
 *
 * Note: `sameDay` parameter is documented but not enforced at this layer
 * — the caller pre-filters the input list. The parameter exists for API
 * stability (Q4 will widen to last-7d during soak; this signature won't
 * change when that happens).
 */
export declare function findDedupCandidates(extractedItem: ExtractedItemForDedup, existingCommitments: ReadonlyArray<ExistingCommitmentForDedup>, sameDay?: boolean): FindCandidatesResult;
/**
 * Build the prompt for the batched cross-check.
 *
 * Single prompt for ALL candidate pairs. The model's job: for each
 * numbered pair, return one line in the format:
 *
 *   <N>. <SAME|DIFFERENT|UNCERTAIN> | <one-sentence reasoning>
 *
 * Exported for test introspection (golden-set tests assert prompt
 * stability across LLM upgrades).
 */
export declare function buildCrossCheckPrompt(newItem: ExtractedItemForDedup, candidates: ReadonlyArray<DedupCandidate>): string;
/**
 * Parse the LLM's response into per-candidate decisions.
 *
 * Tolerant parser:
 *   - Skips blank lines, header lines, prose preamble.
 *   - Accepts `<N>. <VERDICT>` OR `<N>) <VERDICT>` OR plain `<N>: <VERDICT>`.
 *   - Verdict matching is case-insensitive (`same` / `Same` / `SAME` accepted).
 *   - Reasoning after `|` is optional; defaults to empty string.
 *   - If a candidate has no parseable line, defaults to UNCERTAIN with
 *     reasoning "no parseable LLM response" — fails safe (the new item
 *     becomes a fresh canonical + gets flagged for review).
 *
 * Exported for test introspection.
 */
export declare function parseCrossCheckResponse(response: string, candidates: ReadonlyArray<DedupCandidate>): LLMPairDecision[];
/**
 * Run the batched LLM cross-check.
 *
 * Single prompt for all candidate pairs at the `fast` tier (per plan
 * §"LLM cross-check" + eng Q1 — promote to `standard` only if golden-set
 * precision drops below 0.85 per AC3a).
 *
 * - Empty candidate list → returns empty decision list (no LLM call).
 * - LLM throw → returns UNCERTAIN for every candidate (fail-safe; caller
 *   registers as new canonical + flags for review).
 *
 * @param newItem - Freshly extracted item.
 * @param candidates - Output of `findDedupCandidates` (fuzzy branch).
 * @param callConcurrent - LLM injection point; in production wired to
 *   `AIService.callConcurrent`.
 * @param tier - LLM tier; defaults to 'fast' per AC3a / eng Q1.
 */
export declare function runLLMCrossCheck(newItem: ExtractedItemForDedup, candidates: ReadonlyArray<DedupCandidate>, callConcurrent: LLMCallConcurrentFn, tier?: 'fast' | 'standard' | 'frontier'): Promise<LLMPairDecision[]>;
/**
 * Combine `findDedupCandidates` + `runLLMCrossCheck` outputs into a
 * single `DedupOutcome` (per plan §"LLM cross-check" parse table).
 *
 * Precedence (when multiple candidates are evaluated):
 *   - First SAME wins → definite-dupe (caller dedupes to that canonical).
 *   - If no SAME but any UNCERTAIN → possibly-mergeable (with best Jaccard
 *     candidate as the suggested merge target).
 *   - Else → new-canonical (all DIFFERENT, or no candidates at all).
 *
 * @param newItem - The freshly extracted item.
 * @param candidates - Candidates evaluated by the LLM (may be empty).
 * @param decisions - LLM decisions per candidate (may be empty when
 *   candidates is empty).
 */
export declare function applyDedupDecisions(newItem: ExtractedItemForDedup, candidates: ReadonlyArray<DedupCandidate>, decisions: ReadonlyArray<LLMPairDecision>): DedupOutcome;
/**
 * Run the full pipeline against `existingCommitments` for a single item.
 *
 * Convenience wrapper around the three primitives above. Returns the
 * final DedupOutcome plus the candidates list (for telemetry / log
 * rendering by the caller).
 *
 * Step 2 wire-in semantics:
 *   - Caller (meeting-extraction) acquires `commitments.withLock(...)`
 *     BEFORE calling this function.
 *   - Caller reads commitments.json + same-day staged items inside the
 *     lock.
 *   - Caller invokes this once per extracted item.
 *   - Caller emits the dedup-decisions.log line + sets the badge in the
 *     staged section after each outcome.
 */
export declare function runDedupPipeline(extractedItem: ExtractedItemForDedup, existingCommitments: ReadonlyArray<ExistingCommitmentForDedup>, callConcurrent: LLMCallConcurrentFn, options?: {
    tier?: 'fast' | 'standard' | 'frontier';
    sameDay?: boolean;
}): Promise<{
    outcome: DedupOutcome;
    candidates: DedupCandidate[];
    decisions: LLMPairDecision[];
}>;
/**
 * Adapter from the on-disk `Commitment` shape to the pipeline's stable
 * input shape. Hides the v1/v2 dual-shape detail from the pipeline.
 *
 * - personSlugs: prefer `stakeholders[]` when present (v2); else
 *   `[personSlug]` (v1). Self-roles excluded (downstream gate would
 *   otherwise match owner-only against itself).
 * - meetingSlug: prefer first entry of `source_meetings[]` (v2);
 *   else `source` (v1) parsed to a basename.
 *
 * Exported for tests + the Step 2 wire-in to share one adapter.
 */
export declare function commitmentToDedupInput(c: Commitment): ExistingCommitmentForDedup;
//# sourceMappingURL=commitment-dedup-pipeline.d.ts.map