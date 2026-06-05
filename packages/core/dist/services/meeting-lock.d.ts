/**
 * Meeting-file lockfile (phase-10-followup-2 Step 2).
 *
 * Provides `writeWithLock(storage, meetingPath, mutator)` — the canonical
 * read-modify-write primitive for meeting `.md` files. Wraps `proper-lockfile`
 * (shipped from Phase 10 10a-pre for commitments) and applies the same
 * 30s-stale + PID-check semantics to per-meeting locks.
 *
 * Why per-meeting: chef writes `staged_item_skip_reason` during winddown
 * while `arete meeting extract` may re-run in parallel (async Fathom
 * transcripts arrive 3 days late). The 10a-pre `CommitmentsService.withLock`
 * protects `.arete/commitments.json` only — meeting files need their own
 * lock surface. eng C2 required this; v3 F2 added the partial-merge
 * mutator contract that closes the SEMANTIC race the lock cannot.
 *
 * Mutator contract (v3 F2):
 *
 *   const result = await mutator({ frontmatter, body, mtime });
 *
 * The mutator returns either:
 *   - `{ frontmatter: Partial<...>, body?: string }` — shallow-merge the
 *     returned frontmatter keys into the current frontmatter. Keys NOT
 *     present in the returned object survive unchanged. To explicitly
 *     DELETE a key, return `{ [key]: undefined }`. To leave the body
 *     unchanged, omit it; to replace, return the new body string.
 *   - `{ abstain: '<reason>' }` — abort the write without touching the
 *     file; the caller receives `{ written: false, abstainReason }`.
 *
 * The partial-merge contract makes per-field ownership type-system-clean:
 * the extract path returns ONLY its 5 owned keys (status / edits / source
 * / confidence / owner), and `staged_item_skip_reason` survives BY DEFAULT
 * because the mutator never mentions it. Writers cannot accidentally
 * clobber sibling fields they don't own.
 */
import type { StorageAdapter } from '../storage/adapter.js';
export interface MeetingFrontmatterRead {
    /** Parsed frontmatter — read-only view; mutator should return a Partial patch. */
    frontmatter: Readonly<Record<string, unknown>>;
    /** Body content (everything after the trailing `---`). */
    body: string;
    /** File mtime as of the read inside the lock. Used for mtime-guard checks. */
    mtime: Date;
}
/**
 * Mutator return value.
 *
 * `frontmatter` is shallow-merged into the current frontmatter; keys not
 * returned survive. Use `{ key: undefined }` to delete.
 *
 * `abstain` causes the helper to return without writing.
 */
export type MeetingMutationResult = {
    frontmatter: Partial<Record<string, unknown>>;
    body?: string;
} | {
    abstain: string;
};
export type MeetingMutator = (current: MeetingFrontmatterRead) => Promise<MeetingMutationResult>;
export interface WriteWithLockOptions {
    /**
     * mtime-guard threshold (seconds). If the file's mtime is newer than
     * `now - this` AND the mutator did not explicitly opt out, the helper
     * aborts with `{ written: false, abstainReason: 'recent-user-edit' }`
     * BEFORE invoking the mutator. Default: 60s.
     *
     * Set to 0 to skip the guard (e.g., extract path that owns its 5 keys
     * and tolerates user-in-editor races by design).
     */
    mtimeGuardSeconds?: number;
}
export interface WriteWithLockResult {
    written: boolean;
    abstainReason?: string;
}
/**
 * Run `mutator` against the meeting file at `meetingPath` under an
 * exclusive `proper-lockfile` lock.
 *
 * Flow:
 *   1. Bootstrap lock target (throws LockBootstrapError if file missing).
 *   2. Acquire proper-lockfile lock on `<meetingPath>.lock` (30s TTL, PID check).
 *   3. Read file inside lock + parse frontmatter + capture mtime.
 *   4. mtime-guard: if file is newer than `now - mtimeGuardSeconds`,
 *      abstain (release lock, return `{ written: false, abstainReason }`).
 *   5. Invoke mutator. If it returns `{ abstain: ... }`, release + return.
 *   6. Shallow-merge `result.frontmatter` into current frontmatter
 *      (explicit `undefined` deletes the key).
 *   7. Use `result.body` if provided; else preserve current body.
 *   8. Serialize + atomic tmp+rename write through `storage`.
 *   9. Release lock (best-effort; compromised-lock release errors swallowed).
 */
export declare function writeWithLock(storage: StorageAdapter, meetingPath: string, mutator: MeetingMutator, options?: WriteWithLockOptions): Promise<WriteWithLockResult>;
//# sourceMappingURL=meeting-lock.d.ts.map