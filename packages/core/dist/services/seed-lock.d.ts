/**
 * Advisory lock for `arete topic seed` / concurrent topic refreshes.
 *
 * Mitigates pre-mortem Risk 15: running `arete meeting apply` while a
 * seed is in flight races on topic-page writes (both paths call
 * `integrateSource` → write), and last-writer-wins can lose integrations.
 *
 * Uses `fs.open(path, 'wx')` which maps to POSIX `O_CREAT | O_EXCL`:
 * creation is atomic and fails if the file already exists. The lock
 * records the PID and start time so stale locks (crashed processes)
 * can be identified by the user without automatic takeover.
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
 * Acquire the seed lock. Throws `SeedLockHeldError` if already held.
 * Returns a release function to call in a `finally` block.
 *
 * @param areteDir `.arete/` directory at workspace root
 * @param command  short label written into the lock file for user-facing diagnosis
 */
export declare function acquireSeedLock(areteDir: string, command: string): Promise<() => Promise<void>>;
/**
 * Read the current lock owner without acquiring. Returns null if no lock exists.
 */
export declare function readSeedLock(areteDir: string): Promise<SeedLockInfo | null>;
/**
 * Force-clear the lock. Use only when a prior process is known dead.
 */
export declare function breakSeedLock(areteDir: string): Promise<void>;
//# sourceMappingURL=seed-lock.d.ts.map