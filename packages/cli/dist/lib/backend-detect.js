/**
 * Phase 3.5 E1 — detect a running Areté backend before `arete install`
 * or `arete update` so the user can be warned that a stale backend
 * may silently bypass new event writers / migration paths until
 * restart.
 *
 * Two detection paths:
 *
 * 1. PID file at `<workspaceRoot>/.arete/runtime/backend.pid` — when
 *    present and the recorded PID is alive, treat as running.
 * 2. TCP listen probe on the canonical backend ports (3847, 3848,
 *    3849). When any of these accepts a connection, treat as running.
 *
 * The PID file path is an explicit convention; it doesn't yet
 * exist in the runtime, but exposing the helper here gives backend
 * authors a stable target for future wiring. Today the lsof-style
 * port probe is the primary signal.
 *
 * Best-effort. Detection failures (no `lsof`, port probe race) must
 * never block install/update.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
const DEFAULT_BACKEND_PORTS = [3847, 3848, 3849];
const PID_FILE_REL_PATH = '.arete/runtime/backend.pid';
/**
 * Probe whether an Areté backend appears to be running. Returns the
 * earliest signal observed (PID file beats port probe).
 */
export async function detectRunningBackend(workspaceRoot, options = {}) {
    // 1. PID file.
    const pidResult = readPidFile(workspaceRoot);
    if (pidResult !== null && isPidAlive(pidResult)) {
        return { running: true, source: 'pid', pid: pidResult };
    }
    // 2. TCP port probe.
    const ports = options.ports ?? DEFAULT_BACKEND_PORTS;
    const timeoutMs = options.timeoutMs ?? 250;
    for (const port of ports) {
        const responded = await probePort(port, timeoutMs);
        if (responded) {
            return { running: true, source: 'port', port };
        }
    }
    return { running: false, source: 'none' };
}
function readPidFile(workspaceRoot) {
    const path = join(workspaceRoot, PID_FILE_REL_PATH);
    if (!existsSync(path))
        return null;
    try {
        const raw = readFileSync(path, 'utf8').trim();
        const n = Number(raw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0)
            return null;
        return n;
    }
    catch {
        return null;
    }
}
function isPidAlive(pid) {
    try {
        // `kill 0 <pid>` returns true if the process exists; throws ESRCH
        // otherwise. Doesn't actually deliver a signal.
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Single-port TCP probe. Returns true on a successful connect within
 * `timeoutMs`. False on connect-refused, timeout, or any other error.
 */
function probePort(port, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (v) => {
            if (settled)
                return;
            settled = true;
            resolve(v);
        };
        const sock = createConnection({ host: '127.0.0.1', port });
        const t = setTimeout(() => {
            try {
                sock.destroy();
            }
            catch { /* ignore */ }
            settle(false);
        }, timeoutMs);
        sock.once('connect', () => {
            clearTimeout(t);
            try {
                sock.destroy();
            }
            catch { /* ignore */ }
            settle(true);
        });
        sock.once('error', () => {
            clearTimeout(t);
            settle(false);
        });
    });
}
/**
 * Format the warning message printed by install/update when a
 * backend is detected. Pure for testability.
 */
export function formatBackendWarning(result) {
    if (!result.running)
        return '';
    const where = result.source === 'pid' ? `pid ${result.pid}` :
        result.source === 'port' ? `port ${result.port}` :
            'unknown';
    return [
        `Backend appears running (${where}); restart it to pick up these changes`,
        `(your web UI approvals will silently bypass new event writers until restart).`,
    ].join(' ');
}
//# sourceMappingURL=backend-detect.js.map