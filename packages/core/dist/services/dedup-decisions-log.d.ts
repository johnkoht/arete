/**
 * Phase 10b-min Step 6 — Dedup decisions audit log writer.
 *
 * Appends one line per cross-meeting dedup decision to
 * `dev/diary/dedup-decisions.log`. Format mirrors Phase 9's
 * `brief-invocations.log` + Phase 10 followup-2's `chef-skip-log.md`
 * conventions, but with a fixed-column shape (per plan AC9):
 *
 *   ${ISO} ${decision} ${new-id} ${canonical-id} ${jaccard} ${llm-tier} ${llm-decision} ${reasoning}
 *
 * Decisions:
 *   - MERGE     — text-hash exact match OR LLM SAME
 *   - NEW       — no hybrid candidates OR all LLM DIFFERENT
 *   - UNCERTAIN — LLM UNCERTAIN (registered as new canonical AND flagged)
 *   - UNMERGE   — user-initiated split via [[unmerge]] (Phase 10b-aux)
 *
 * Best-effort writer: failures (disk full, permission, etc.) do NOT
 * block extract or winddown. Caller never needs try/catch around this.
 *
 * Log file is gitignored — same convention as Phase 9
 * `brief-invocations.log` + Phase 10 followup-2 `chef-skip-log.md`.
 */
import type { ExtractDedupDecision } from './commitment-dedup-extract.js';
/**
 * Decision token written as the second column of the log line.
 */
export type DedupDecisionKind = 'MERGE' | 'NEW' | 'UNCERTAIN' | 'UNMERGE';
/**
 * LLM tier token written as the sixth column. Mirrors the AITier shape
 * but as a string literal so callers don't pull in the workspace
 * config type.
 */
export type DedupLLMTier = 'fast' | 'standard' | 'frontier' | '-';
/**
 * Payload for one dedup-decision log entry.
 *
 * `reasoning` is the human-readable trailing column. Spaces are
 * preserved; newlines are stripped (the log is one-line-per-event).
 */
export type DedupDecisionLogPayload = {
    decision: DedupDecisionKind;
    /** Staged-item ID from the meeting being extracted. */
    newId: string;
    /** Canonical's commitment ID OR '-' when decision=NEW. */
    canonicalId: string;
    /** Jaccard score (0-1) of the chosen candidate; '-' when N/A. */
    jaccard: number | '-';
    /** LLM tier used for the cross-check; '-' when text-hash match (no LLM). */
    llmTier: DedupLLMTier;
    /** LLM verdict ('SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-' for hash hits). */
    llmDecision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN' | '-';
    /** Free-form reasoning string — preserved on one line. */
    reasoning: string;
};
/**
 * Sanitize reasoning to a single line. Strips newlines + carriage
 * returns; collapses whitespace runs.
 *
 * Exported for tests.
 */
export declare function sanitizeReasoning(s: string): string;
/**
 * Render a `DedupDecisionLogPayload` to one log line (without trailing
 * newline). Caller appends `\n` at write time.
 *
 * Exported for tests + future parser tooling (e.g., `arete dedup
 * --explain` may grep this log for prior decisions on a canonical).
 */
export declare function renderDedupDecisionLine(iso: string, payload: DedupDecisionLogPayload): string;
/**
 * Map an `ExtractDedupDecision` to the log payload. The caller (CLI)
 * uses this when batch-writing multiple decisions from a single
 * extract.
 *
 * Exported for tests.
 */
export declare function payloadFromExtractDecision(decision: ExtractDedupDecision, llmTier?: DedupLLMTier): DedupDecisionLogPayload;
/**
 * Append one dedup-decision log line.
 *
 * Best-effort: errors during mkdir/appendFile are swallowed silently.
 *
 * @param workspaceRoot Absolute path to the workspace root
 * @param payload       The decision payload
 */
export declare function appendDedupDecisionLog(workspaceRoot: string, payload: DedupDecisionLogPayload): Promise<void>;
/**
 * Convenience: append multiple decisions from a single extract pass.
 *
 * Iterates serially — preserves write ordering in the log so reading
 * the tail shows the extract's decisions in item-order.
 */
export declare function appendDedupDecisionLogBatch(workspaceRoot: string, decisions: ReadonlyArray<ExtractDedupDecision>, llmTier?: DedupLLMTier): Promise<void>;
//# sourceMappingURL=dedup-decisions-log.d.ts.map