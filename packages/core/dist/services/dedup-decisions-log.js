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
 * I-6 extension (back-compat): a MERGE line MAY carry an optional dupe→source
 * provenance segment appended after the reasoning column, delimited by a TAB:
 *
 *   <…space-separated columns incl. reasoning…>\t${dupe-source-meeting}\t${b64(dupe-text)}
 *
 * The TAB delimiter is safe because reasoning is single-line, whitespace-
 * collapsed (no tabs), and the dupe text is base64-encoded (no tabs/newlines).
 * The first TAB on a line therefore cleanly separates the legacy space-format
 * prefix from the structured provenance. Old lines have no TAB and parse
 * exactly as before. This segment persists "dupe X (newId) came from meeting Y
 * with original text Z" at merge time so a future `[[unmerge]]` of a 3+-source
 * canonical can reconstruct the correct DupeSourceMapping[] instead of refusing
 * with `ambiguous-dupe`. (See unmerge-directives.ts:134-150.)
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
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * Sanitize reasoning to a single line. Strips newlines + carriage
 * returns; collapses whitespace runs.
 *
 * Exported for tests.
 */
export function sanitizeReasoning(s) {
    return s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}
/**
 * Render a `DedupDecisionLogPayload` to one log line (without trailing
 * newline). Caller appends `\n` at write time.
 *
 * Exported for tests + future parser tooling (e.g., `arete dedup
 * --explain` may grep this log for prior decisions on a canonical).
 */
export function renderDedupDecisionLine(iso, payload) {
    const j = payload.jaccard === '-' ? '-' : payload.jaccard.toFixed(2);
    const reasoning = sanitizeReasoning(payload.reasoning);
    const base = [
        iso,
        payload.decision,
        payload.newId,
        payload.canonicalId,
        j,
        payload.llmTier,
        payload.llmDecision,
        reasoning,
    ].join(' ');
    // I-6: append the optional dupe→source provenance segment after a TAB.
    // Only emitted when BOTH fields are present (a complete mapping is required
    // for an unmerge to use it; a half-record is useless). The source meeting
    // is written verbatim (slugs carry no tabs); the dupe text is base64-encoded
    // so it survives the space-separated prefix + tab delimiter unambiguously.
    if (payload.dupeSourceMeeting != null && payload.dupeText != null) {
        const encodedText = Buffer.from(payload.dupeText, 'utf8').toString('base64');
        return `${base}\t${payload.dupeSourceMeeting}\t${encodedText}`;
    }
    return base;
}
/**
 * Map an `ExtractDedupDecision` to the log payload. The caller (CLI)
 * uses this when batch-writing multiple decisions from a single
 * extract.
 *
 * Exported for tests.
 */
export function payloadFromExtractDecision(decision, llmTier = 'fast') {
    const outcome = decision.outcome;
    if (outcome.kind === 'definite-dupe') {
        return {
            decision: 'MERGE',
            newId: decision.itemId,
            canonicalId: outcome.canonical.id,
            jaccard: outcome.jaccard ?? outcome.canonical.jaccard ?? 1.0,
            llmTier: outcome.via === 'text-hash' ? '-' : llmTier,
            llmDecision: outcome.via === 'text-hash' ? '-' : 'SAME',
            reasoning: outcome.reasoning ?? (outcome.via === 'text-hash' ? 'text-hash exact match' : ''),
        };
    }
    if (outcome.kind === 'possibly-mergeable') {
        return {
            decision: 'UNCERTAIN',
            newId: decision.itemId,
            canonicalId: outcome.bestCandidate.id,
            jaccard: outcome.bestCandidate.jaccard,
            llmTier,
            llmDecision: 'UNCERTAIN',
            reasoning: outcome.reasoning ?? '',
        };
    }
    // new-canonical
    return {
        decision: 'NEW',
        newId: decision.itemId,
        canonicalId: '-',
        jaccard: '-',
        llmTier: outcome.candidatesEvaluated.length > 0 ? llmTier : '-',
        llmDecision: outcome.candidatesEvaluated.length > 0 ? 'DIFFERENT' : '-',
        reasoning: outcome.candidatesEvaluated.length > 0
            ? 'no SAME / no UNCERTAIN across candidates'
            : 'no hybrid candidates',
    };
}
/**
 * Append one dedup-decision log line.
 *
 * Best-effort: errors during mkdir/appendFile are swallowed silently.
 *
 * @param workspaceRoot Absolute path to the workspace root
 * @param payload       The decision payload
 */
export async function appendDedupDecisionLog(workspaceRoot, payload) {
    try {
        const dir = join(workspaceRoot, 'dev', 'diary');
        await mkdir(dir, { recursive: true });
        const logPath = join(dir, 'dedup-decisions.log');
        const iso = new Date().toISOString();
        const line = renderDedupDecisionLine(iso, payload) + '\n';
        await appendFile(logPath, line, 'utf8');
    }
    catch {
        // Best-effort — never block the command. Audit signal lost is a
        // soak-observability issue, not a correctness issue.
    }
}
/**
 * Convenience: append multiple decisions from a single extract pass.
 *
 * Iterates serially — preserves write ordering in the log so reading
 * the tail shows the extract's decisions in item-order.
 */
export async function appendDedupDecisionLogBatch(workspaceRoot, decisions, llmTier = 'fast') {
    for (const d of decisions) {
        const payload = payloadFromExtractDecision(d, llmTier);
        await appendDedupDecisionLog(workspaceRoot, payload);
    }
}
//# sourceMappingURL=dedup-decisions-log.js.map