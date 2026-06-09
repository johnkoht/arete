/**
 * Phase 10b-min Step 5 — Reverse-stamp on the canonical's meeting file.
 *
 * When a later meeting B finds an existing canonical in earlier meeting A
 * via the cross-meeting dedup pipeline, this module appends:
 *
 *   <!-- also surfaced in <meeting-B-slug> on YYYY-MM-DD -->
 *
 * into meeting A's staged section (right after the line for the dupe
 * item). Best-effort — uses `MeetingService.writeWithLock` (from
 * Phase 10 followup-2) with an mtime guard that abstains when meeting A
 * was modified in the last 60s (user might be editing).
 *
 * Per plan AC6a — reverse-stamp:
 *   - Idempotent: an existing `also surfaced in <same-slug>` line is a
 *     no-op; a stamp for a different meeting is appended below the
 *     existing.
 *   - Atomic via writeWithLock + tmp+rename inside the lock.
 *   - mtime-guarded: skip if the canonical's file was touched in the
 *     last 60s.
 *   - Best-effort: a failure to acquire the lock OR a file-vanished
 *     abstain is logged and absorbed (the extract that triggered the
 *     stamp does NOT block on it).
 *
 * Critical invariants:
 *   - NO LLM calls.
 *   - NO writes to the calling meeting's file from this module — only
 *     the canonical's meeting file gets touched.
 *   - Reverse-stamp is OBSERVABILITY for the user, not a data
 *     dependency for any downstream gate.
 */
import { writeWithLock } from './meeting-lock.js';
// ---------------------------------------------------------------------------
// Helpers — stamp comment composition
// ---------------------------------------------------------------------------
/**
 * Compose the reverse-stamp HTML-comment marker.
 *
 * Format (per plan AC6a):
 *   `<!-- also surfaced in <meeting-B-slug> on YYYY-MM-DD -->`
 *
 * Exported for tests + future parser tooling (e.g., `arete dedup --explain`
 * walking the canonical's meeting body for prior stamps).
 */
export function buildReverseStampMarker(newMeetingSlug, newMeetingDate) {
    const date = newMeetingDate.slice(0, 10); // ISO prefix only
    return `<!-- also surfaced in ${newMeetingSlug} on ${date} -->`;
}
/**
 * Match an existing reverse-stamp marker (any slug + date). Used to
 * detect idempotent re-stamps from THE SAME meeting.
 *
 * Exported for tests.
 */
export function matchReverseStampMarker(text, newMeetingSlug) {
    const slugRe = newMeetingSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<!--\\s*also surfaced in ${slugRe} on \\d{4}-\\d{2}-\\d{2}\\s*-->`);
    return re.test(text);
}
// ---------------------------------------------------------------------------
// Helpers — insertion point selection
// ---------------------------------------------------------------------------
/**
 * Insert the marker AFTER the staged-section line whose ID matches
 * `itemId`. If `itemId` is undefined OR the line isn't found, append
 * the marker at the end of the body (before any trailing whitespace).
 *
 * Idempotent: if a marker for the same slug already exists ANYWHERE
 * in the body, returns the body unchanged.
 *
 * Exported for tests.
 */
export function insertReverseStampIntoBody(body, marker, newMeetingSlug, itemId) {
    // Idempotency check: if a stamp for this slug already exists, no-op.
    if (matchReverseStampMarker(body, newMeetingSlug)) {
        return { body, changed: false };
    }
    if (itemId) {
        const lines = body.split('\n');
        const out = [];
        let inserted = false;
        // Item ID lines look like: `- ai_001: text` or `- [ ] ai_001: text`.
        // Match the ID followed by ':' or ']' boundary — use a literal colon
        // (no \b, since `\b` between an alphanumeric and a colon evaluates
        // to NO word boundary in JS regex).
        const idRe = new RegExp(`^\\s*-\\s+(?:\\[\\s*[xX ]?\\s*\\]\\s+)?${itemId}\\b`);
        for (const line of lines) {
            out.push(line);
            if (!inserted && idRe.test(line)) {
                out.push(marker);
                inserted = true;
            }
        }
        if (inserted) {
            return { body: out.join('\n'), changed: true };
        }
        // Fall through to body-end append if the id wasn't found.
    }
    // Append at end (preserving any trailing newline).
    const trimmed = body.replace(/\s+$/, '');
    const trailing = body.slice(trimmed.length);
    return {
        body: `${trimmed}\n${marker}${trailing.length > 0 ? trailing : '\n'}`,
        changed: true,
    };
}
// ---------------------------------------------------------------------------
// Public API: applyReverseStamp
// ---------------------------------------------------------------------------
/**
 * Apply a reverse stamp to the canonical's meeting file.
 *
 * Uses `writeWithLock` from `services/meeting-lock.ts`:
 *   - Acquires per-meeting proper-lockfile lock.
 *   - mtime-guarded: abstains if the canonical file was modified in
 *     the last 60s.
 *   - Mutator inserts the marker via `insertReverseStampIntoBody`.
 *   - If the body is unchanged (idempotent case), mutator abstains
 *     with reason 'already-stamped'.
 *
 * Failures (lock contention, bootstrap error, mutator abstain) are
 * NOT propagated — the function returns a result object describing
 * what happened. Caller (CLI) decides whether to log to the
 * dedup-decisions log or stderr.
 */
export async function applyReverseStamp(storage, request) {
    const marker = buildReverseStampMarker(request.newMeetingSlug, request.newMeetingDate);
    let result;
    try {
        result = await writeWithLock(storage, request.canonicalMeetingPath, async ({ body }) => {
            const { body: nextBody, changed } = insertReverseStampIntoBody(body, marker, request.newMeetingSlug, request.canonicalItemId);
            if (!changed) {
                return { abstain: 'already-stamped' };
            }
            return { frontmatter: {}, body: nextBody };
        }, { mtimeGuardSeconds: 60 });
    }
    catch (err) {
        // Bootstrap errors (file vanished) and any other write-through
        // failures absorb here per the best-effort contract.
        const msg = err instanceof Error ? err.message : String(err);
        return {
            canonicalMeetingPath: request.canonicalMeetingPath,
            written: false,
            abstainReason: `error: ${msg}`,
        };
    }
    return {
        canonicalMeetingPath: request.canonicalMeetingPath,
        written: result.written,
        abstainReason: result.abstainReason,
    };
}
//# sourceMappingURL=commitment-dedup-reverse-stamp.js.map