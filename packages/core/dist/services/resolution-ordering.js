/**
 * Phase 11 11a Step 6 — auto-resolve vs followup-2 ordering guard (PM G1/AC8).
 *
 * The invariant: a single item is owned by EXACTLY ONE phase in a given
 * winddown.
 *   - An ALREADY-COMMITTED commitment (lives in commitments.json) → 11a
 *     Gmail auto-resolve path.
 *   - A STILL-STAGED item (pending in a meeting's staged_item_status, not yet
 *     committed) → Phase 10 followup-2 chef-mutates-staged path.
 *   - NEVER both for the same id in the same winddown.
 *
 * When 11a finds Gmail evidence for an id that is still staged, it MUST NOT
 * auto-resolve (the item isn't a commitment yet). It defers: emits a
 * `RESOLVE-DEFERRED-TO-FOLLOWUP-2` log line carrying the evidence URL (M2),
 * and the followup-2 path picks it up with multi-source provenance.
 *
 * Pure module — no I/O. The wire-in supplies the set of still-staged ids
 * (gathered from today's meeting frontmatter via parseStagedItemStatus).
 */
/**
 * Decide which phase owns a candidate match (AC8).
 *
 * @param commitmentId  the id 11a found Gmail evidence for
 * @param stillStagedIds set of item ids still pending in today's meetings
 * @param gmailThreadId  the Gmail thread id (for the M2 multi-source string)
 * @param existingEvidence optional prior evidence string already on the
 *   followup-2 skip-reason (e.g. "slack-dm") — 11a appends "+gmail:<id>"
 */
export function decideResolutionOrdering(commitmentId, stillStagedIds, gmailThreadId, existingEvidence) {
    const staged = stillStagedIds.has(commitmentId) || stillStagedIds.has(commitmentId.slice(0, 8));
    if (!staged) {
        return { path: 'auto-resolve', reason: 'already-committed' };
    }
    const gmailRef = `gmail:${gmailThreadId}`;
    const multiSourceEvidence = existingEvidence
        ? `${existingEvidence}+${gmailRef}`
        : gmailRef;
    return { path: 'defer-to-followup-2', reason: 'still-staged', multiSourceEvidence };
}
//# sourceMappingURL=resolution-ordering.js.map