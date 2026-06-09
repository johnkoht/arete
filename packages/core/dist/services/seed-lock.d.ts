/**
 * Advisory lock for `arete topic seed` / concurrent topic refreshes.
 *
 * Mitigates pre-mortem Risk 15: running `arete meeting apply` while a
 * seed is in flight races on topic-page writes (both paths call
 * `integrateSource` → write), and last-writer-wins can lose integrations.
 *
 * Uses `fs.open(path, 'wx')` which maps to POSIX `O_CREAT | O_EXCL`:
 * creation is atomic and fails if the file already exists. The lock
 * records the PID and start time.
 *
 * Stale-lock takeover (wiki-repair W1, the 6/05–6/09 class): when the
 * recorded pid is provably dead (or the lock file is unparseable),
 * `acquireSeedLock` breaks the lock and retries ONCE instead of
 * refusing. A live pid still refuses with `SeedLockHeldError`. Every
 * takeover is logged to `<areteDir>/memory/log.md` as a
 * `seed-lock-takeover` event so silent integration-death is visible
 * in the replay log.
 */
export interface SeedLockInfo {
    pid: number;
    started: string;
    command: string;
}
export declare class SeedLockHeldError extends Error {
    readonly info: SeedLockInfo | null;
    readonly kind: "SeedLockHeldError";
    constructor(info: SeedLockInfo | null);
}
/**
 * Safe pid-liveness check. `process.kill(pid, 0)` performs permission +
 * existence checks without sending a signal:
 *  - no throw  → process exists (alive)
 *  - EPERM     → process exists but belongs to another user (alive —
 *                NOT ours to take over)
 *  - ESRCH     → no such process (dead)
 * Non-positive / non-integer pids are treated as dead (an unparseable
 * or corrupt lock never holds the system hostage).
 */
export declare function isPidAlive(pid: number): boolean;
export interface AcquireSeedLockOptions {
    /**
     * Invoked after a stale lock is broken (before the retry acquires).
     * `stale` is the prior lock's info, or null when the lock file was
     * unparseable. Errors thrown by the callback are swallowed — takeover
     * must never fail because a reporter failed.
     */
    onStaleTakeover?: (stale: SeedLockInfo | null) => void | Promise<void>;
    /**
     * TEST-ONLY injection point: invoked after a lock is classified stale,
     * immediately BEFORE the rename-based break. Lets tests interleave a
     * competitor's re-create between classification and capture. Errors
     * propagate — production code must not pass this.
     */
    onBeforeBreak?: () => void | Promise<void>;
}
/**
 * Acquire the seed lock. Returns a release function to call in a
 * `finally` block.
 *
 * If the lock is already held:
 *  - holder pid ALIVE  → throws `SeedLockHeldError` (unchanged behavior)
 *  - holder pid DEAD or lock unparseable → STALE: break the lock, log a
 *    `seed-lock-takeover` event to `<areteDir>/memory/log.md`, and retry
 *    the exclusive create once. If the retry also hits EEXIST (another
 *    process won the takeover race), throws `SeedLockHeldError`.
 *
 * The break is rename-guarded (MG-1.1): the breaker atomically renames
 * the lock aside before deleting, so exactly ONE breaker captures the
 * file, and a captured LIVE-pid lock (a competitor's fresh re-create)
 * is restored and refused — a lagging breaker can no longer delete a
 * competitor's fresh lock. Accepted residual: a three-party race during
 * the restore window (a third breaker classifying while the captured
 * live lock is being renamed back) is advisory-lock-grade residue; the
 * lock's purpose (don't run two long LLM refreshes concurrently by
 * accident) tolerates it.
 *
 * @param areteDir `.arete/` directory at workspace root
 * @param command  short label written into the lock file for user-facing diagnosis
 */
export declare function acquireSeedLock(areteDir: string, command: string, options?: AcquireSeedLockOptions): Promise<() => Promise<void>>;
/**
 * Read the current lock owner without acquiring. Returns null if no lock exists.
 */
export declare function readSeedLock(areteDir: string): Promise<SeedLockInfo | null>;
/**
 * Force-clear the lock. Use only when a prior process is known dead.
 */
export declare function breakSeedLock(areteDir: string): Promise<void>;
//# sourceMappingURL=seed-lock.d.ts.map