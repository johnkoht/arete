/**
 * Phase 11 11a Steps 3+4 — resolution directive parser + commitment mutators.
 *
 * Extends the project directive surface (precedent: chef-skip-directives.ts,
 * unmerge-directives.ts) with the Phase 11 directives:
 *
 *   [[confirm <id>]]               week-1 staged OR MEDIUM-flagged → user-resolve
 *   [[unconfirm <id>]]             24h flip-back of a [[confirm]] (F2/AC2b)
 *   [[unresolve <id>]]             reopen auto/staged + 14d suppress (G5/AC6)
 *   [[unresolve <id> --permanent]] reopen + 2100 sentinel (M4/AC6c)
 *
 * The `[[confirm-all-week-1]]` bulk directive is INTENTIONALLY UNSUPPORTED
 * (F2 — passive-vote foot-gun). The parser detects it and surfaces a
 * rejection so the user sees why nothing happened.
 *
 * This module is PURE: parsing + commitment-object mutators (Commitment →
 * Commitment). NO I/O. The wire-in (chef-orchestrator) reads commitments.json
 * under withLock, applies these mutators, writes back, and emits the
 * resolution-decisions.log line. Mutators NEVER touch disk.
 *
 * Also home to the first-week confirm-gate primitives (F2/AC2a):
 *   - stageResolve()       sets resolveStagedAt, leaves status='open'
 *   - autoResolve()        week-2+ HIGH auto-mutate to status='resolved'
 *   - evaluatePromotionGate() decides week-1 → auto-mutate promotion (F2)
 */
import type { Commitment } from '../models/index.js';
export type ResolutionDirectiveKind = 'confirm' | 'unconfirm' | 'unresolve';
export interface ResolutionDirective {
    kind: ResolutionDirectiveKind;
    /** Commitment id (full 64-char or 8-char prefix). */
    id: string;
    /** True only for `[[unresolve <id> --permanent]]` (M4). */
    permanent: boolean;
    /** Raw matched text for audit. */
    raw: string;
}
/** A `[[confirm-all-week-1]]` (or similar bulk) directive — rejected (F2). */
export interface RejectedBulkDirective {
    raw: string;
    message: string;
}
export interface ParseDirectivesResult {
    directives: ResolutionDirective[];
    /** Bulk `[[confirm-all*]]` occurrences — surfaced as rejections (F2). */
    rejectedBulk: RejectedBulkDirective[];
}
/**
 * Parse all Phase 11 resolution directives from winddown view content.
 *
 * - `[[confirm-all*]]` (any suffix) → rejectedBulk (F2 — no bulk confirm).
 * - `--permanent` only meaningful on `unresolve`; on confirm/unconfirm it is
 *   ignored (flag stripped, directive still parsed).
 */
export declare function parseResolutionDirectives(content: string): ParseDirectivesResult;
export type MutatorResult = {
    ok: true;
    commitment: Commitment;
    note?: string;
} | {
    ok: false;
    reason: string;
};
/**
 * STAGE a HIGH-confidence resolve during week-1 (F2/AC2a).
 *
 * Sets `resolveStagedAt` + `resolvedEvidence` but leaves `status='open'` and
 * `resolvedAt=null`. The commitment surfaces under "Staged for confirm" with
 * full inline evidence; the user confirms via `[[confirm]]`. Records the
 * gmail source on `source_external[]` (audit trail) without resolving.
 */
export declare function stageResolve(commitment: Commitment, evidence: {
    url: string;
    threadId: string;
}, now?: Date): Commitment;
/**
 * AUTO-RESOLVE a HIGH match (week-2+, promotion gate passed) (AC2).
 *
 * Sets status='resolved', resolvedBy='auto-gmail', resolvedConfidence='HIGH',
 * resolvedEvidence, resolvedAt = the send timestamp, and appends the gmail
 * source. Clears any prior staging marker.
 */
export declare function autoResolve(commitment: Commitment, evidence: {
    url: string;
    threadId: string;
    sentAt: string;
}): Commitment;
/**
 * `[[confirm <id>]]` (AC7) — convert a week-1 staged OR MEDIUM-flagged
 * commitment to a USER-resolve.
 *
 * Writes resolvedBy='user' (preserves audit semantics per Q3),
 * resolvedConfidence='HIGH', confirmedAt=now (enables 24h [[unconfirm]]),
 * status='resolved', resolvedAt=now, clears resolveStagedAt. Evidence +
 * source_external preserved.
 *
 * No-op (already resolved by user) or invalid states return `{ ok: false }`.
 */
export declare function applyConfirm(commitment: Commitment, now?: Date): MutatorResult;
/** Window (hours) within which [[unconfirm]] may flip a [[confirm]] back. */
export declare const UNCONFIRM_WINDOW_HOURS = 24;
/**
 * `[[unconfirm <id>]]` (F2/AC2b) — flip a recent user-confirm back to staged.
 *
 * Eligible ONLY when resolvedBy='user' AND confirmedAt > now - 24h. Re-stages
 * (status='open', resolveStagedAt=now), clears confirmedAt/resolvedBy/
 * resolvedAt, PRESERVES resolvedEvidence + source_external for re-evaluation.
 *
 * Ineligible cases (outside 24h, or resolvedBy='auto-gmail', or not resolved)
 * return `{ ok: false }` with a guidance message.
 */
export declare function applyUnconfirm(commitment: Commitment, now?: Date): MutatorResult;
/**
 * `[[unresolve <id>]]` / `[[unresolve <id> --permanent]]` (AC6/AC6a/AC6c).
 *
 * Eligible for:
 *   - auto-resolved entries (resolvedBy='auto-gmail'),
 *   - week-1-staged entries (resolveStagedAt set, status='open').
 *
 * Behavior: status='open', clears resolvedBy/resolvedConfidence/resolvedAt/
 * resolveStagedAt. PRESERVES resolvedEvidence + source_external as the audit
 * trail. Sets unresolveSuppressedUntil:
 *   - now + 14d (default), OR
 *   - '2100-...' sentinel when `permanent` OR `promoteToPermanent` (M4
 *     repeat-detection — caller computes the latter from the log).
 *
 * Ineligible: resolvedBy='user' (without auto/staged) → no-op + guidance.
 */
export declare function applyUnresolve(commitment: Commitment, opts?: {
    permanent?: boolean;
    promoteToPermanent?: boolean;
    now?: Date;
}): MutatorResult;
export type PromotionGateInput = {
    /** Days since 11a shipped. */
    daysSinceShip: number;
    /** Count of [[unresolve]] actions during the week-1 window. */
    unresolveCount: number;
    /** Count of explicit [[confirm <id>]] actions during the week-1 window. */
    confirmCount: number;
    /** Explicit user "promote" statement recorded (overrides confirm-count req). */
    explicitPromote?: boolean;
};
export type PromotionGateResult = {
    /** True → week-2+ auto-mutate path is live. */
    promoted: boolean;
    /** Stay in confirm-gated (week-1) mode. */
    mode: 'confirm-gated' | 'auto-mutate';
    reason: string;
};
/** Promotion window length (days). */
export declare const PROMOTION_WINDOW_DAYS = 7;
/**
 * Decide whether 11a may promote from confirm-gated (week-1) to auto-mutate
 * (week-2+). Both conditions required (F2 — NOT just zero rollbacks):
 *   1. zero [[unresolve]] during the window, AND
 *   2. ≥1 explicit [[confirm]] (engagement signal) OR explicit user promote.
 *
 * Before day 7 → never promoted (still in week-1). Zero confirms after day 7
 * (with zero unresolves) → NOT promoted; extend confirm-gated mode (caller
 * re-evaluates at day 14). ≥1 unresolve → NOT promoted (extend).
 */
export declare function evaluatePromotionGate(input: PromotionGateInput): PromotionGateResult;
//# sourceMappingURL=resolution-directives.d.ts.map