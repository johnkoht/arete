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
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
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
 * Acquire the seed lock. Throws `SeedLockHeldError` if already held.
 * Returns a release function to call in a `finally` block.
 *
 * @param areteDir `.arete/` directory at workspace root
 * @param command  short label written into the lock file for user-facing diagnosis
 */
export async function acquireSeedLock(areteDir, command) {
    const path = lockPath(areteDir);
    let handle;
    try {
        handle = await open(path, 'wx');
    }
    catch (err) {
        if (err.code === 'EEXIST') {
            let info = null;
            try {
                const content = await readFile(path, 'utf8');
                info = JSON.parse(content);
            }
            catch {
                // stale / malformed lock; report without info
            }
            throw new SeedLockHeldError(info);
        }
        throw err;
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