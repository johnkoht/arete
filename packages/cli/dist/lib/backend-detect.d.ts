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
export interface BackendDetectResult {
    running: boolean;
    /** Source of the detection: 'pid' | 'port' | 'none'. */
    source: 'pid' | 'port' | 'none';
    /** PID detected via `<root>/.arete/runtime/backend.pid` (when source='pid'). */
    pid?: number;
    /** Port that responded (when source='port'). */
    port?: number;
}
export interface BackendDetectOptions {
    /** Override the default port list (tests). */
    ports?: number[];
    /** Probe timeout in ms per port (default 250). */
    timeoutMs?: number;
}
/**
 * Probe whether an Areté backend appears to be running. Returns the
 * earliest signal observed (PID file beats port probe).
 */
export declare function detectRunningBackend(workspaceRoot: string, options?: BackendDetectOptions): Promise<BackendDetectResult>;
/**
 * Format the warning message printed by install/update when a
 * backend is detected. Pure for testability.
 */
export declare function formatBackendWarning(result: BackendDetectResult): string;
//# sourceMappingURL=backend-detect.d.ts.map