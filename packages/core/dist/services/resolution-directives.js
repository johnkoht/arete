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
import { PERMANENT_SUPPRESS_SENTINEL, computeSuppressUntil, } from './commitment-resolution-pipeline.js';
// id = 64-hex full OR an 8+ alphanumeric prefix; permits hyphens for slugs.
// Order matters: match the bulk form FIRST so it isn't mis-parsed as confirm.
const BULK_PATTERN = /\[\[(confirm-all[a-z0-9-]*)\s*([^\]]*)\]\]/gi;
const DIRECTIVE_PATTERN = /\[\[(confirm|unconfirm|unresolve)\s+([a-fA-F0-9]{8,64}|[a-z0-9][a-z0-9-]{2,})(\s+--permanent)?\]\]/gi;
/**
 * Parse all Phase 11 resolution directives from winddown view content.
 *
 * - `[[confirm-all*]]` (any suffix) → rejectedBulk (F2 — no bulk confirm).
 * - `--permanent` only meaningful on `unresolve`; on confirm/unconfirm it is
 *   ignored (flag stripped, directive still parsed).
 */
export function parseResolutionDirectives(content) {
    const rejectedBulk = [];
    BULK_PATTERN.lastIndex = 0;
    let bm;
    while ((bm = BULK_PATTERN.exec(content)) !== null) {
        rejectedBulk.push({
            raw: bm[0],
            message: `[[${bm[1]}]] is not supported. Bulk confirm was removed (passive-vote ` +
                `foot-gun). Confirm each entry individually: \`[[confirm <id>]]\`.`,
        });
    }
    const directives = [];
    DIRECTIVE_PATTERN.lastIndex = 0;
    let m;
    while ((m = DIRECTIVE_PATTERN.exec(content)) !== null) {
        const kind = m[1].toLowerCase();
        const permanent = Boolean(m[3]) && kind === 'unresolve';
        directives.push({ kind, id: m[2], permanent, raw: m[0] });
    }
    return { directives, rejectedBulk };
}
/**
 * STAGE a HIGH-confidence resolve during week-1 (F2/AC2a).
 *
 * Sets `resolveStagedAt` + `resolvedEvidence` but leaves `status='open'` and
 * `resolvedAt=null`. The commitment surfaces under "Staged for confirm" with
 * full inline evidence; the user confirms via `[[confirm]]`. Records the
 * gmail source on `source_external[]` (audit trail) without resolving.
 */
export function stageResolve(commitment, evidence, now = new Date()) {
    return {
        ...commitment,
        status: 'open', // CRITICAL — staging never mutates status (AC2a)
        resolveStagedAt: now.toISOString(),
        resolvedEvidence: evidence.url,
        resolvedConfidence: 'HIGH',
        source_external: addGmailSource(commitment.source_external, evidence),
    };
}
/**
 * AUTO-RESOLVE a HIGH match (week-2+, promotion gate passed) (AC2).
 *
 * Sets status='resolved', resolvedBy='auto-gmail', resolvedConfidence='HIGH',
 * resolvedEvidence, resolvedAt = the send timestamp, and appends the gmail
 * source. Clears any prior staging marker.
 */
export function autoResolve(commitment, evidence) {
    const { resolveStagedAt: _staged, ...rest } = commitment;
    return {
        ...rest,
        status: 'resolved',
        resolvedBy: 'auto-gmail',
        resolvedConfidence: 'HIGH',
        resolvedEvidence: evidence.url,
        resolvedAt: evidence.sentAt,
        source_external: addGmailSource(commitment.source_external, evidence),
    };
}
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
export function applyConfirm(commitment, now = new Date()) {
    // Already user-resolved → no-op (idempotent).
    if (commitment.status === 'resolved' && commitment.resolvedBy === 'user') {
        return { ok: false, reason: 'already confirmed (user-resolved)' };
    }
    const iso = now.toISOString();
    const { resolveStagedAt: _staged, ...rest } = commitment;
    return {
        ok: true,
        commitment: {
            ...rest,
            status: 'resolved',
            resolvedBy: 'user',
            resolvedConfidence: 'HIGH',
            resolvedAt: iso,
            confirmedAt: iso,
        },
    };
}
/** Window (hours) within which [[unconfirm]] may flip a [[confirm]] back. */
export const UNCONFIRM_WINDOW_HOURS = 24;
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
export function applyUnconfirm(commitment, now = new Date()) {
    if (commitment.resolvedBy === 'auto-gmail') {
        return { ok: false, reason: 'auto-resolved — use [[unresolve <id>]] instead' };
    }
    if (commitment.resolvedBy !== 'user' || !commitment.confirmedAt) {
        return { ok: false, reason: 'not a user-confirmed resolution' };
    }
    const confirmedTime = new Date(commitment.confirmedAt).getTime();
    if (Number.isNaN(confirmedTime)) {
        return { ok: false, reason: 'unparseable confirmedAt' };
    }
    const windowMs = UNCONFIRM_WINDOW_HOURS * 60 * 60 * 1000;
    if (now.getTime() - confirmedTime > windowMs) {
        return {
            ok: false,
            reason: `outside ${UNCONFIRM_WINDOW_HOURS}h window — use [[unresolve <id>]] instead`,
        };
    }
    const { confirmedAt: _c, resolvedBy: _b, resolvedAt: _a, ...rest } = commitment;
    return {
        ok: true,
        commitment: {
            ...rest,
            status: 'open',
            resolvedAt: null,
            resolveStagedAt: now.toISOString(),
            // resolvedConfidence + resolvedEvidence + source_external preserved.
        },
    };
}
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
export function applyUnresolve(commitment, opts = {}) {
    const now = opts.now ?? new Date();
    const isAuto = commitment.resolvedBy === 'auto-gmail';
    const isStaged = Boolean(commitment.resolveStagedAt) && commitment.status === 'open';
    if (!isAuto && !isStaged) {
        if (commitment.resolvedBy === 'user') {
            return {
                ok: false,
                reason: 'user-resolved — use `arete commitments reopen <id>` or `[[unconfirm <id>]]` within 24h',
            };
        }
        return { ok: false, reason: 'not auto-resolved or staged — nothing to unresolve' };
    }
    const permanent = Boolean(opts.permanent || opts.promoteToPermanent);
    const suppressUntil = permanent ? PERMANENT_SUPPRESS_SENTINEL : computeSuppressUntil(now);
    const { resolvedBy: _b, resolvedConfidence: _c, resolvedAt: _a, resolveStagedAt: _s, ...rest } = commitment;
    return {
        ok: true,
        commitment: {
            ...rest,
            status: 'open',
            resolvedAt: null,
            // resolvedEvidence + source_external PRESERVED (audit trail, AC6).
            unresolveSuppressedUntil: suppressUntil,
        },
        note: permanent ? 'permanent suppress' : '14d suppress',
    };
}
/** Promotion window length (days). */
export const PROMOTION_WINDOW_DAYS = 7;
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
export function evaluatePromotionGate(input) {
    if (input.daysSinceShip < PROMOTION_WINDOW_DAYS) {
        return {
            promoted: false,
            mode: 'confirm-gated',
            reason: `within week-1 window (day ${input.daysSinceShip}/${PROMOTION_WINDOW_DAYS})`,
        };
    }
    if (input.unresolveCount > 0) {
        return {
            promoted: false,
            mode: 'confirm-gated',
            reason: `${input.unresolveCount} unresolve(s) during week 1 — extend confirm-gated mode`,
        };
    }
    if (input.confirmCount < 1 && !input.explicitPromote) {
        return {
            promoted: false,
            mode: 'confirm-gated',
            reason: 'zero explicit [[confirm]] engagement — user did not audit; extend confirm-gated mode',
        };
    }
    return {
        promoted: true,
        mode: 'auto-mutate',
        reason: input.explicitPromote
            ? 'explicit user promote'
            : `zero unresolves AND ${input.confirmCount} confirm(s) — gate passed`,
    };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Append a gmail `ExternalSource` to a commitment's `source_external[]`,
 * de-duplicating on thread ref. Returns a NEW array (immutable).
 */
function addGmailSource(existing, evidence) {
    const base = Array.isArray(existing) ? existing : [];
    if (base.some((s) => s.kind === 'gmail' && s.ref === evidence.threadId)) {
        return base;
    }
    return [...base, { kind: 'gmail', ref: evidence.threadId, url: evidence.url }];
}
//# sourceMappingURL=resolution-directives.js.map