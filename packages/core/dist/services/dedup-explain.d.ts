/**
 * Phase 10b-aux Step 1 — `arete dedup --explain <commitment-id>` provenance.
 *
 * Pure module: parses `dev/diary/dedup-decisions.log` lines + a `Commitment`
 * into a human-readable provenance report (plan AC7). No filesystem, no
 * service coupling — the CLI reads the log + commitments.json and passes
 * strings in.
 *
 * Per plan §"Week-1 audit + recovery controls" AC7, the report surfaces:
 *   - Canonical text + stakeholders with roles
 *   - All source_meetings with dedup-event provenance (when merged, jaccard,
 *     LLM decision, reasoning) — pulled from the decisions log
 *   - textVariants list with eviction state (N/5 capacity)
 *
 * R10 note: `--explain` reads CURRENT state from the commitment for the
 * stakeholders / source_meetings / textVariants; the log is the
 * provenance overlay (observability, not source of truth). When the log
 * and the commitment disagree (e.g. an entry was later [[unmerge]]'d), the
 * commitment wins — we only annotate source_meetings that the log explains.
 */
import type { Commitment } from '../models/index.js';
import type { DedupDecisionKind, DedupLLMTier } from './dedup-decisions-log.js';
/**
 * One parsed line of `dedup-decisions.log`.
 *
 * Column layout shipped by 10b-min (`renderDedupDecisionLine`):
 *   <ISO> <decision> <new-id> <canonical-id> <jaccard> <llm-tier> <llm-decision> <reasoning...>
 *
 * `reasoning` is the free-form trailing remainder (may contain spaces).
 */
export type DedupLogEntry = {
    iso: string;
    decision: DedupDecisionKind;
    newId: string;
    canonicalId: string;
    /** Jaccard column verbatim ('-' when N/A). */
    jaccard: string;
    llmTier: DedupLLMTier;
    llmDecision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-';
    reasoning: string;
    /** Raw line for fallthrough display. */
    raw: string;
};
/**
 * Parse the raw text of `dedup-decisions.log` into structured entries.
 *
 * Tolerant: malformed lines (wrong column count, unknown decision token)
 * are skipped silently — the log is best-effort observability, not a
 * strict schema. Blank lines are skipped.
 *
 * Exported for tests.
 */
export declare function parseDedupLog(raw: string): DedupLogEntry[];
/**
 * Filter log entries relevant to a canonical commitment.
 *
 * A line is relevant when its `canonicalId` matches `commitmentId` (full
 * hash OR shared prefix in either direction), OR — for UNMERGE lines —
 * when the canonical is referenced as the split source. We match on prefix
 * so an 8-char CLI argument lines up with full hashes in the log and the
 * `canon_<prefix>` short forms the plan example uses.
 *
 * Exported for tests.
 */
export declare function filterLogForCommitment(entries: ReadonlyArray<DedupLogEntry>, commitmentId: string): DedupLogEntry[];
/**
 * Resolve a commitment from a list by full hash or short prefix (≥ 4 chars).
 *
 * Returns the single match, or:
 *   - `{ kind: 'not-found' }` when no commitment matches.
 *   - `{ kind: 'ambiguous', matches }` when a short prefix hits 2+ rows.
 *
 * Exported for tests + the CLI.
 */
export type CommitmentLookupResult = {
    kind: 'found';
    commitment: Commitment;
} | {
    kind: 'not-found';
} | {
    kind: 'ambiguous';
    matches: Commitment[];
};
export declare function lookupCommitmentById(commitments: ReadonlyArray<Commitment>, idOrPrefix: string): CommitmentLookupResult;
/**
 * Render the human-readable `--explain` provenance report (plan AC7 shape).
 *
 * @param commitment  The resolved canonical commitment.
 * @param logEntries  ALL parsed log entries (pre-filter); this function
 *                    filters to the ones explaining THIS commitment.
 *
 * Exported for tests.
 */
export declare function formatExplainReport(commitment: Commitment, logEntries: ReadonlyArray<DedupLogEntry>): string;
//# sourceMappingURL=dedup-explain.d.ts.map