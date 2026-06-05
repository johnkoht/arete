/**
 * Phase 10b-min — Step 2: Extract-time orchestration of the dedup pipeline.
 *
 * `runExtractDedup(...)` is the bridge between `arete meeting extract` and
 * the pure `commitment-dedup-pipeline` module. It owns:
 *
 *   - Lock acquisition on commitments.json (Phase 10a-pre withLock).
 *   - Loading existing commitments + same-day staged items from OTHER
 *     meetings (NOT last-7d in initial ship — Q4 deferred to soak).
 *   - Adapting each extracted ActionItem into the pipeline's input shape.
 *   - Invoking the pipeline once per item.
 *   - Returning a per-item decision map so the caller (CLI) can:
 *       - decorate staged sections with `↪ canonical in <slug>` badges,
 *       - emit `staged_item_skip_reason[id]` entries with setBy=`chef`,
 *         reason=`dupe_of_<canonical-id>`,
 *       - append dedup-decisions.log lines (Step 6),
 *       - reverse-stamp the canonical's meeting (Step 5).
 *
 * NO production data writes happen here directly — the caller writes
 * frontmatter / dist files / decisions log. This module purely
 * orchestrates the read + decision phase.
 *
 * Critical invariants:
 *   - LLM invocation goes through the caller-injected callConcurrent.
 *   - commitments.json read happens inside `withLock(...)` so a
 *     concurrent extract can't decide "no canonical exists" while we're
 *     about to write one. F5 mitigation.
 *   - Same-day window enforcement is done HERE (filter on `date`).
 */
import { type DedupCandidate, type DedupOutcome, type ExistingCommitmentForDedup, type LLMCallConcurrentFn, type LLMPairDecision } from './commitment-dedup-pipeline.js';
import type { Commitment, CommitmentDirection } from '../models/index.js';
/**
 * Per-item dedup decision produced by `runExtractDedup`. One entry per
 * staged ActionItem from the current meeting's extraction.
 *
 * - `outcome`: the pipeline's final verdict (see DedupOutcome).
 * - `candidates`: candidates evaluated (for telemetry / log).
 * - `llmDecisions`: per-candidate LLM verdicts (for log).
 */
export type ExtractDedupDecision = {
    /** Item ID (e.g. ai_001). */
    itemId: string;
    /** Raw text of the new item. */
    itemText: string;
    /** Direction of the new item. */
    direction: CommitmentDirection;
    /** Outcome from the pipeline. */
    outcome: DedupOutcome;
    /** Candidates evaluated (may be empty). */
    candidates: DedupCandidate[];
    /** Per-candidate LLM verdicts (may be empty). */
    llmDecisions: LLMPairDecision[];
};
/**
 * Loadable abstraction over commitments.json + same-day staged items.
 * Caller (CLI) provides closures so this module stays pure-ish.
 */
export type ExtractDedupInputs = {
    /**
     * Currently-open commitments (read inside the lock). Caller passes the
     * full list; this module filters to same-day.
     */
    existingCommitments: ReadonlyArray<Commitment>;
    /**
     * Same-day staged items extracted from OTHER meetings. Caller is
     * responsible for excluding the current meeting being extracted. Each
     * entry already adapted to the pipeline input shape.
     */
    sameDayStagedItems: ReadonlyArray<ExistingCommitmentForDedup>;
    /** YYYY-MM-DD for the CURRENT extraction (the meeting being extracted). */
    meetingDate: string;
    /** Slug of the meeting being extracted (carried into decisions). */
    meetingSlug: string;
};
/**
 * Extracted items from the current meeting that the pipeline should
 * evaluate. The caller adapts ActionItems → this shape (carrying owner
 * slug + counterparty slug + direction).
 */
export type ExtractedItemForExtractDedup = {
    itemId: string;
    text: string;
    direction: CommitmentDirection;
    /** Owner + counterparty slugs (lowercased) for the person-slug overlap gate. */
    personSlugs: string[];
};
/**
 * Filter `Commitment[]` to same-day rows + adapt into pipeline input
 * shape. Filter is on the `date` field (meeting date when the commitment
 * was first surfaced) — matches the "same-day window" semantics in plan
 * v2 third pass (Q4 deferred to soak).
 *
 * Open-only filter: a `resolved` or `dropped` commitment shouldn't
 * collide with a fresh extract (the user already closed it; let the new
 * one stand and surface as a re-open in winddown).
 *
 * Exported for the wire-in to share one filter.
 */
export declare function filterSameDayOpenCommitments(commitments: ReadonlyArray<Commitment>, meetingDate: string): ExistingCommitmentForDedup[];
/**
 * Orchestrate the dedup pipeline for a batch of extracted items.
 *
 * For each input item, runs the full pipeline and accumulates a
 * decision record. Caller invokes this exactly ONCE per `arete meeting
 * extract`. Inside, the LLM is invoked per-item (so K items × 1 LLM
 * call each). Per-pair batching is already baked into runDedupPipeline
 * — the LLM gets one prompt covering all candidates for a given item.
 *
 * F5 mitigation: the CALLER must wrap this invocation in
 * `commitments.withLock(async () => { ... })` so the
 * read-commitments-then-decide window is atomic against concurrent
 * extracts. This module does NOT call withLock itself because:
 *   1. It doesn't have a CommitmentsService handle.
 *   2. The CLI's lock scope is wider (includes the subsequent
 *      commitments.sync write).
 *
 * F1 mitigation: callConcurrent is invoked once per item, NOT once per
 * candidate pair (the pipeline batches candidates into a single prompt).
 * Serial K items × ~600ms (fast tier) ≈ K × 600ms total — for K=10
 * staged items, ≈6s. AC13 budget is ≤5s extra. If the caller wants
 * tighter, it can use Promise.all on multiple `runExtractDedup` calls
 * — but that's a CLI-layer concern, not this module's.
 *
 * @param extractedItems - Adapted ActionItems from the current meeting.
 * @param inputs - Commitments + same-day staged items + meeting metadata.
 * @param callConcurrent - LLM injection point.
 * @param options - Tier override (default 'fast'); abort-on-first-error
 *   (default false — collect all results even on partial failure).
 */
export declare function runExtractDedup(extractedItems: ReadonlyArray<ExtractedItemForExtractDedup>, inputs: ExtractDedupInputs, callConcurrent: LLMCallConcurrentFn, options?: {
    tier?: 'fast' | 'standard' | 'frontier';
}): Promise<ExtractDedupDecision[]>;
/**
 * Inject `↪ canonical in <slug>` badges into a rendered staged section
 * for items that the pipeline marked as `definite-dupe`. Also surfaces
 * `↪ possibly merges with <slug>` for `possibly-mergeable` (AC4a UI
 * surface).
 *
 * The current staged section format (from formatFilteredStagedSections):
 *   `- ai_001: Talk to Dave about staffing`
 *
 * After decoration:
 *   `- ai_001: Talk to Dave about staffing  ↪ canonical in <slug>`
 *
 * Idempotent against re-extraction: if a line already carries `↪`, it's
 * stripped + re-applied based on the current decision (so the badge
 * stays in sync with the latest pipeline verdict).
 *
 * @param stagedSections - The rendered markdown from
 *   `formatFilteredStagedSections`.
 * @param decisions - All per-item decisions from `runExtractDedup`.
 */
export declare function decorateStagedSectionsWithDupeBadges(stagedSections: string, decisions: ReadonlyArray<ExtractDedupDecision>): string;
/**
 * Build the `staged_item_skip_reason` entries for items marked as
 * `definite-dupe`. Caller merges these into the existing skip_reason
 * map written to frontmatter.
 *
 * Per plan §"Apply flow honors dupe status":
 *   - dupe items skip commitment write (canonical already wrote)
 *   - `staged_item_skip_reason[id]` carries `reason = "dupe_of_<canonical-id>"`
 *   - setBy = 'chef' (this is a definitive cross-meeting dedup decision)
 *
 * `possibly-mergeable` items do NOT get a skip_reason — they register as
 * new canonicals per AC4a. The "Possibly mergeable" surface is the
 * winddown's job, not the extract's.
 *
 * @param decisions - All per-item decisions.
 * @param nowIso - ISO timestamp (caller provides for testability).
 */
export declare function buildDupeSkipReasonEntries(decisions: ReadonlyArray<ExtractDedupDecision>, nowIso: string): Record<string, {
    reason: string;
    evidence: string;
    setBy: 'chef';
    setAt: string;
}>;
/**
 * Build the `staged_item_status` entries for items marked as `definite-dupe`.
 *
 * Sets them to `'skipped'` so `commitApprovedItems` filter drops them
 * (which renders into the "## Skipped on Apply" audit section thanks to
 * Phase 10 followup-2). Phase 10b-min stays consistent with that
 * contract — no new status value, no new sibling field. Just
 * `staged_item_status[id] = 'skipped'` + `skip_reason[id] = dupe_of_...`.
 */
export declare function buildDupeStatusEntries(decisions: ReadonlyArray<ExtractDedupDecision>): Record<string, 'skipped'>;
//# sourceMappingURL=commitment-dedup-extract.d.ts.map