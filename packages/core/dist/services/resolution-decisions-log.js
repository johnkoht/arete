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
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
/** Phase attribution token (F1). Constant for this build step. */
export const RESOLUTION_LOG_PHASE = 'p11-11a';
/**
 * Sanitize free text to a single line (strip newlines, collapse whitespace).
 * Exported for tests + parity with dedup-decisions-log.sanitizeReasoning.
 */
export function sanitizeReasoning(s) {
    return s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}
/**
 * Render one log line (no trailing newline). Phase column is fixed to
 * RESOLUTION_LOG_PHASE (F1).
 *
 * Exported for tests + `arete resolve --explain` (11-audit) which greps
 * this log by id.
 */
export function renderResolutionDecisionLine(iso, payload) {
    return [
        iso,
        payload.action,
        `phase=${RESOLUTION_LOG_PHASE}`,
        payload.id,
        payload.confidence,
        payload.evidenceRef || '-',
        sanitizeReasoning(payload.reasoning),
    ].join(' ');
}
/**
 * Append one resolution-decision log line. Best-effort.
 */
export async function appendResolutionDecisionLog(workspaceRoot, payload) {
    try {
        const dir = join(workspaceRoot, 'dev', 'diary');
        await mkdir(dir, { recursive: true });
        const logPath = join(dir, 'resolution-decisions.log');
        const iso = new Date().toISOString();
        const line = renderResolutionDecisionLine(iso, payload) + '\n';
        await appendFile(logPath, line, 'utf8');
    }
    catch {
        // Best-effort — never block the command (soak-observability, not correctness).
    }
}
/**
 * Parse the resolution-decisions log content into structured entries.
 * Tolerant — skips lines that don't match the column shape.
 *
 * Exported for M4 repeat-detection (a prior UNRESOLVE for the same
 * `(id, evidence)` within 30d auto-promotes to permanent suppress) and for
 * `arete resolve --explain`.
 */
export function parseResolutionLog(content) {
    const out = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        // <ISO> <ACTION> phase=<p> <id> <conf> <evidence> <reasoning...>
        const m = line.match(/^(\S+)\s+([A-Z0-9-]+)\s+phase=(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
        if (!m)
            continue;
        out.push({
            iso: m[1],
            action: m[2],
            phase: m[3],
            id: m[4],
            confidence: m[5],
            evidenceRef: m[6],
            reasoning: m[7] ?? '',
        });
    }
    return out;
}
/**
 * M4 repeat-detection: true when the log shows a prior UNRESOLVE (or
 * UNRESOLVE-PERMANENT) for the SAME `(id, evidenceRef)` pair within
 * `windowDays` (default 30) of `now`.
 *
 * The wire-in uses this so a second `[[unresolve]]` on the same evidence
 * auto-promotes to permanent suppress (chef surfaces a notice).
 */
export function hasPriorUnresolveForEvidence(entries, id, evidenceRef, now = new Date(), windowDays = 30) {
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const idPrefix = id.slice(0, 8);
    for (const e of entries) {
        if (e.action !== 'UNRESOLVE' && e.action !== 'UNRESOLVE-PERMANENT')
            continue;
        // Match on id (prefix-tolerant) AND evidence.
        if (e.id !== id && e.id.slice(0, 8) !== idPrefix)
            continue;
        if (e.evidenceRef !== evidenceRef)
            continue;
        const t = new Date(e.iso).getTime();
        if (Number.isNaN(t))
            continue;
        if (now.getTime() - t <= windowMs && now.getTime() - t >= 0)
            return true;
    }
    return false;
}
//# sourceMappingURL=resolution-decisions-log.js.map