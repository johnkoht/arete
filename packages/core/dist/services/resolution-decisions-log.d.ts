/**
 * Phase 11 11a Step 5 — Resolution-decisions audit log writer.
 *
 * Appends one line per Gmail-auto-resolve decision to
 * `dev/diary/resolution-decisions.log`. Mirrors Phase 10b-min's
 * `dedup-decisions.log` fixed-column format, but adds a `phase=p11-11a`
 * attribution column (F1) so cross-phase soak forensics is a `grep`, not
 * detective work:
 *
 *   ${ISO} ${action} phase=${phase} ${id} ${confidence} ${evidence-ref} ${reasoning}
 *
 * Actions (plan §"Architecture" + AC10):
 *   - RESOLVE-HIGH-STAGED            week-1: HIGH staged for [[confirm]]
 *   - RESOLVE-HIGH-AUTO             week-2+: HIGH auto-mutated to resolved
 *   - RESOLVE-MEDIUM-FLAGGED        MEDIUM surfaced (no mutation)
 *   - RESOLVE-USER-CONFIRMED        [[confirm]] → user-resolve
 *   - RESOLVE-DEFERRED-TO-FOLLOWUP-2 still-staged → followup-2 owns (M2/AC8)
 *   - UNRESOLVE                     [[unresolve]] → reopen + 14d suppress
 *   - UNRESOLVE-PERMANENT           [[unresolve --permanent]] → 2100 sentinel
 *   - UNCONFIRM                     [[unconfirm]] within 24h → re-stage
 *   - SUPPRESS-HIT                  pipeline pre-check skipped a suppressed id
 *
 * Best-effort writer — failures (disk full, permission) do NOT block
 * winddown. Caller never needs try/catch. Log is gitignored (`*.log`).
 */
/** Phase attribution token (F1). Constant for this build step. */
export declare const RESOLUTION_LOG_PHASE = "p11-11a";
/** Action discriminator written as the second column. */
export type ResolutionDecisionAction = 'RESOLVE-HIGH-STAGED' | 'RESOLVE-HIGH-AUTO' | 'RESOLVE-MEDIUM-FLAGGED' | 'RESOLVE-USER-CONFIRMED' | 'RESOLVE-DEFERRED-TO-FOLLOWUP-2' | 'UNRESOLVE' | 'UNRESOLVE-PERMANENT' | 'UNCONFIRM' | 'SUPPRESS-HIT';
/** Confidence column value; '-' when N/A (e.g. UNRESOLVE / SUPPRESS-HIT). */
export type ResolutionLogConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | '-';
export type ResolutionDecisionLogPayload = {
    action: ResolutionDecisionAction;
    /** Commitment id (full or 8-char prefix). */
    id: string;
    /** Confidence; '-' when N/A. */
    confidence: ResolutionLogConfidence;
    /**
     * Evidence reference — Gmail thread URL or thread-id. For M2 cross-source
     * defers, the wire-in may pass a multi-source string
     * (`"slack-dm+gmail:<thread-id>"`); '-' when N/A.
     */
    evidenceRef: string;
    /** Free-form LLM reasoning / note. Single-lined at write time. */
    reasoning: string;
};
/**
 * Sanitize free text to a single line (strip newlines, collapse whitespace).
 * Exported for tests + parity with dedup-decisions-log.sanitizeReasoning.
 */
export declare function sanitizeReasoning(s: string): string;
/**
 * Render one log line (no trailing newline). Phase column is fixed to
 * RESOLUTION_LOG_PHASE (F1).
 *
 * Exported for tests + `arete resolve --explain` (11-audit) which greps
 * this log by id.
 */
export declare function renderResolutionDecisionLine(iso: string, payload: ResolutionDecisionLogPayload): string;
/**
 * Append one resolution-decision log line. Best-effort.
 */
export declare function appendResolutionDecisionLog(workspaceRoot: string, payload: ResolutionDecisionLogPayload): Promise<void>;
export type ResolutionLogEntry = {
    iso: string;
    action: ResolutionDecisionAction;
    phase: string;
    id: string;
    confidence: string;
    evidenceRef: string;
    reasoning: string;
};
/**
 * Parse the resolution-decisions log content into structured entries.
 * Tolerant — skips lines that don't match the column shape.
 *
 * Exported for M4 repeat-detection (a prior UNRESOLVE for the same
 * `(id, evidence)` within 30d auto-promotes to permanent suppress) and for
 * `arete resolve --explain`.
 */
export declare function parseResolutionLog(content: string): ResolutionLogEntry[];
/**
 * M4 repeat-detection: true when the log shows a prior UNRESOLVE (or
 * UNRESOLVE-PERMANENT) for the SAME `(id, evidenceRef)` pair within
 * `windowDays` (default 30) of `now`.
 *
 * The wire-in uses this so a second `[[unresolve]]` on the same evidence
 * auto-promotes to permanent suppress (chef surfaces a notice).
 */
export declare function hasPriorUnresolveForEvidence(entries: ReadonlyArray<ResolutionLogEntry>, id: string, evidenceRef: string, now?: Date, windowDays?: number): boolean;
//# sourceMappingURL=resolution-decisions-log.d.ts.map