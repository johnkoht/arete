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
import type { StorageAdapter } from '../storage/adapter.js';
export type ReverseStampRequest = {
    /**
     * Absolute path to the canonical's meeting file (meeting A). Caller
     * resolves the slug → path mapping (the slug → path mapping lives in
     * the CLI's workspace; this module stays storage-adapter-agnostic).
     */
    canonicalMeetingPath: string;
    /**
     * Item ID of the dupe in the canonical's meeting (the staged item line
     * the stamp gets attached to). May be undefined when only the slug is
     * known — in that case the stamp is appended at the END of the body.
     */
    canonicalItemId?: string;
    /** Meeting slug of the meeting that found the dupe (meeting B). */
    newMeetingSlug: string;
    /** ISO date (YYYY-MM-DD) of the new meeting that found the dupe. */
    newMeetingDate: string;
};
export type ReverseStampResult = {
    /** Path that was stamped (echoes the input). */
    canonicalMeetingPath: string;
    /** Whether the write succeeded. */
    written: boolean;
    /** When not written, the reason — for log surfaces. */
    abstainReason?: string;
};
/**
 * Compose the reverse-stamp HTML-comment marker.
 *
 * Format (per plan AC6a):
 *   `<!-- also surfaced in <meeting-B-slug> on YYYY-MM-DD -->`
 *
 * Exported for tests + future parser tooling (e.g., `arete dedup --explain`
 * walking the canonical's meeting body for prior stamps).
 */
export declare function buildReverseStampMarker(newMeetingSlug: string, newMeetingDate: string): string;
/**
 * Match an existing reverse-stamp marker (any slug + date). Used to
 * detect idempotent re-stamps from THE SAME meeting.
 *
 * Exported for tests.
 */
export declare function matchReverseStampMarker(text: string, newMeetingSlug: string): boolean;
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
export declare function insertReverseStampIntoBody(body: string, marker: string, newMeetingSlug: string, itemId?: string): {
    body: string;
    changed: boolean;
};
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
export declare function applyReverseStamp(storage: StorageAdapter, request: ReverseStampRequest): Promise<ReverseStampResult>;
//# sourceMappingURL=commitment-dedup-reverse-stamp.d.ts.map