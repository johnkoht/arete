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
import { appendFile, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { formatEvent, nowIsoSeconds } from '../utils/memory-log.js';
const LOCK_RELATIVE_PATH = '.seed.lock';
export class SeedLockHeldError extends Error {
    info;
    kind = 'SeedLockHeldError';
    constructor(info) {
        super(info === null
            ? 'Seed lock is held by another process'
            : `Seed lock held by pid ${info.pid} (started ${info.started}, command: ${info.command})`);
        this.info = info;
        // Set `name` so `err.name === 'SeedLockHeldError'` checks work
        // alongside `instanceof SeedLockHeldError`. Several callers
        // (meeting.ts approve, etc.) rely on the name-based check; without
        // this set, a custom Error subclass keeps `name = 'Error'`.
        this.name = 'SeedLockHeldError';
    }
}
function lockPath(areteDir) {
    return join(areteDir, LOCK_RELATIVE_PATH);
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
export function isPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        return err.code === 'EPERM';
    }
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
 * Residual TOCTOU note: between re-verifying staleness and `unlink`,
 * another taking-over process may have already re-created the lock.
 * The window is microseconds and requires two simultaneous starts
 * against the same dead lock; the advisory lock's purpose (don't run
 * two long LLM refreshes concurrently by accident) tolerates it.
 *
 * @param areteDir `.arete/` directory at workspace root
 * @param command  short label written into the lock file for user-facing diagnosis
 */
export async function acquireSeedLock(areteDir, command, options = {}) {
    const path = lockPath(areteDir);
    for (let attempt = 0; attempt < 2; attempt++) {
        let handle;
        try {
            handle = await open(path, 'wx');
        }
        catch (err) {
            if (err.code !== 'EEXIST')
                throw err;
            // Lock exists — classify it.
            let info = null;
            let parseable = false;
            try {
                const content = await readFile(path, 'utf8');
                const parsed = JSON.parse(content);
                if (typeof parsed?.pid === 'number') {
                    info = parsed;
                    parseable = true;
                }
            }
            catch {
                // Unreadable or malformed lock file → treated as stale below.
                // (ENOENT here means the holder released between open and read —
                // also safe to retry.)
            }
            const stale = !parseable || !isPidAlive(info.pid);
            if (!stale || attempt > 0) {
                // Live holder, or we already broke a stale lock once and STILL
                // hit EEXIST (someone else won the takeover race) — refuse.
                throw new SeedLockHeldError(info);
            }
            // Stale lock: take over. Log first (so even a crash mid-takeover
            // leaves a trace), then break and retry the exclusive create.
            await logStaleTakeover(areteDir, command, info);
            await breakSeedLock(areteDir);
            try {
                await options.onStaleTakeover?.(info);
            }
            catch {
                // Reporter failures never block the takeover.
            }
            continue;
        }
        const info = {
            pid: process.pid,
            started: new Date().toISOString(),
            command,
        };
        await handle.writeFile(JSON.stringify(info, null, 2));
        await handle.close();
        let released = false;
        return async () => {
            if (released)
                return;
            released = true;
            try {
                await unlink(path);
            }
            catch {
                // already gone
            }
        };
    }
    // Unreachable (loop either returns or throws), but TypeScript needs it.
    throw new SeedLockHeldError(null);
}
/**
 * Best-effort append of a `seed-lock-takeover` event to
 * `<areteDir>/memory/log.md` using the strict log grammar. Uses raw
 * `fs.appendFile` (O_APPEND — atomic for a single line) because this
 * module has no StorageAdapter. Failures WARN to stderr — never vanish
 * (wiki-repair W5 lossy-logger rule) — and never block the takeover.
 */
async function logStaleTakeover(areteDir, command, stale) {
    const line = formatEvent({
        timestamp: nowIsoSeconds(),
        event: 'seed-lock-takeover',
        fields: {
            command,
            stale_pid: stale !== null ? String(stale.pid) : 'unknown',
            stale_started: stale?.started ?? 'unknown',
            stale_command: stale?.command ?? 'unknown',
        },
    });
    try {
        const memoryDir = join(areteDir, 'memory');
        await mkdir(memoryDir, { recursive: true });
        await appendFile(join(memoryDir, 'log.md'), `${line}\n`, 'utf8');
    }
    catch (err) {
        console.warn(`[seed-lock] stale lock taken over (pid ${stale?.pid ?? 'unknown'} dead) but log append failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * Read the current lock owner without acquiring. Returns null if no lock exists.
 */
export async function readSeedLock(areteDir) {
    try {
        const content = await readFile(lockPath(areteDir), 'utf8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Force-clear the lock. Use only when a prior process is known dead.
 */
export async function breakSeedLock(areteDir) {
    try {
        await unlink(lockPath(areteDir));
    }
    catch {
        // ignore
    }
}
//# sourceMappingURL=seed-lock.js.map