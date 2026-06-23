/**
 * reconcile-nominate — CHR W2: the mechanical R2 candidate-nomination
 * primitive for the reconcile-engine
 * (dev/work/plans/chef-holistic-reconcile/engine-spec.md § R2).
 *
 * Pure function over a ledger: emits CANDIDATE pairs only. Nomination is
 * NEVER a decision — the R3 judgment pass (agent, in-context) confirms or
 * rejects every candidate. The agent never does mechanical similarity
 * itself; this primitive never makes judgment calls.
 *
 * Reuses (repoints, does NOT replace) the mechanical core of
 * `meeting-reconciliation.ts`: `findDuplicates`, `matchRecentMemory`,
 * `matchCompletedTasks`, `scoreRelevance`, and the shared
 * normalize-then-Jaccard tokenizer. The legacy inline path
 * (`reconcileMeetingBatch`) stays fully intact until CHR W6.
 *
 * Threshold-unity scope (DELIBERATE — review F2): the 0.7 constant below
 * unifies CANDIDATE NOMINATION only. Judgment-band thresholds (Rule 4's
 * concrete ≥0.7 with its 0.5–0.7 Uncertain band; CommitmentsService.
 * reconcile()'s 0.6) are engine-spec parameters and are NOT this constant.
 * The 0.5 floor below exists precisely to FEED Rule 4's Uncertain band:
 * sub-band pairs are surfaced as `uncertain-band` candidates so judgment
 * can route them, never as collapse candidates.
 */
import type { ReconciliationContext } from '../models/entities.js';
/** Unified candidate-nomination Jaccard threshold (strict `>`, matching
 * `findDuplicates` / `matchRecentMemory` semantics). NOMINATION SCOPE ONLY. */
export declare const NOMINATION_JACCARD_THRESHOLD = 0.7;
/** Floor of the uncertain band (0.5 ≤ J ≤ 0.7). Pairs in the band are
 * nominated as `uncertain-band` — Uncertain-surface input for Rule 4's
 * fuzzy routing, never collapse candidates. */
export declare const UNCERTAIN_BAND_FLOOR = 0.5;
/** One entry of the merged day/week ledger. Extraction entries carry the
 * single-pass fields; gather-loop entries carry the PATTERNS.md loop shape.
 * All fields beyond `kind`/`source_ref`/`text` are optional so
 * legacy-shaped input (degraded-mode contract, engine-spec § 6) parses. */
export type ReconcileLedgerEntry = {
    kind: string;
    source?: string;
    /** Meeting path for extraction entries; channel/thread ref otherwise. */
    source_ref: string;
    item_id?: string;
    item_type?: 'action' | 'decision' | 'learning';
    timestamp?: string;
    text: string;
    /** Owner slug for action items (different owners never co-nominate). */
    owner?: string;
    counterparty?: string;
    tier?: 'blocker' | 'high' | 'normal';
    uncertain?: boolean;
    uncertainty_reason?: string;
    direction?: string;
    continuation_of?: string;
    supersedes?: string;
    status?: string;
    evidence_pointer?: string;
};
export type ReconcileLedger = {
    horizon?: 'day' | 'week';
    window?: {
        target?: string;
        lookback_days?: number;
    };
    entries: ReconcileLedgerEntry[];
};
/** Pointer back into the ledger for a nominated entry. */
export type NominationRef = {
    source_ref: string;
    item_id?: string;
    item_type?: string;
    text: string;
};
export type NominationCandidate = {
    kind: 'duplicate';
    /** First occurrence in ledger order (oldest-first input ⇒ oldest). */
    canonical: NominationRef;
    duplicate: NominationRef;
    similarity: number;
} | {
    kind: 'uncertain-band';
    a: NominationRef;
    b: NominationRef;
    similarity: number;
} | {
    kind: 'claimed';
    claim: 'continuation_of' | 'supersedes';
    entry: NominationRef;
    /** The raw model claim (item id or text) — a claim to VERIFY (D3). */
    target: string;
} | {
    kind: 'memory';
    entry: NominationRef;
    memorySource: string;
    matchedText: string;
} | {
    kind: 'completed';
    entry: NominationRef;
    completedOn: string;
    matchedTask: string;
};
export type NominationResult = {
    candidates: NominationCandidate[];
    /** Relevance annotation per extraction entry (sidecar-tier input). */
    relevance: Array<{
        entry: NominationRef;
        score: number;
        tier: 'high' | 'normal' | 'low';
    }>;
    /** True when extraction entries are legacy-shaped (no tier field) —
     * degraded-mode contract: judgment treats tier as 'normal'. */
    degraded: boolean;
    stats: {
        entries: number;
        extractionEntries: number;
        duplicatePairs: number;
        uncertainBandPairs: number;
        claims: number;
        memoryMatches: number;
        completedMatches: number;
    };
};
/** Convert lookback `MeetingExtractionBatch[]` (the W2 loader output —
 * `loadRecentMeetingBatch`, with its processed/approved status filter and
 * strict-=== excludePath guard) into ledger extraction entries so the
 * window-coverage invariant ("nomination sees ≥ what inline saw") holds. */
export declare function ledgerEntriesFromBatch(batch: Array<{
    meetingPath: string;
    extraction: {
        actionItems: Array<{
            description: string;
            ownerSlug?: string;
        }>;
        decisions: string[];
        learnings: string[];
    };
}>): ReconcileLedgerEntry[];
/**
 * Nominate reconciliation candidates over a merged ledger.
 *
 * Inputs are data only (no I/O): callers (the CLI command, tests, the
 * engine harness) load the ledger file, the lookback batch, and the
 * reconciliation context themselves.
 *
 * Entry order is significant: first occurrence wins canonical placement
 * in duplicate pairs, so callers MUST pass entries oldest-first (the CLI
 * sorts lookback batch entries by filename date prefix before merging).
 */
export declare function nominateCandidates(entries: ReconcileLedgerEntry[], context: ReconciliationContext): NominationResult;
//# sourceMappingURL=reconcile-nominate.d.ts.map