/**
 * arete view — launch backend server and open workspace in browser
 */
import type { Command } from 'commander';
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { createServices, type StorageAdapter } from '@arete/core';
export type ViewCommandDeps = {
    spawnFn?: typeof spawn;
    spawnSyncFn?: typeof spawnSync;
    openBrowserFn?: (url: string) => Promise<void>;
    fetchFn?: typeof fetch;
    isPortAvailableFn?: (port: number) => Promise<boolean>;
    existsSyncFn?: typeof existsSync;
    randomUUIDFn?: typeof randomUUID;
    /**
     * Inject service construction (workspace root resolution + storage).
     * Defaults to the real `createServices`. Surfaced so tests can resolve the
     * workspace deterministically without waiting on real filesystem/index I/O
     * (which otherwise made the non-wait path's timing non-deterministic).
     */
    createServicesFn?: typeof createServices;
};
export type ViewCommandOpts = {
    port?: string;
    json?: boolean;
    path?: string;
    wait?: boolean;
    timeout?: string;
};
export type WaitResult = {
    approved?: Array<{
        id: string;
        type: string;
    }>;
    skipped?: Array<{
        id: string;
        type: string;
    }>;
    timedOut?: boolean;
};
export type SessionFile = {
    sessionId: string;
    createdAt: string;
    status: 'pending' | 'complete';
};
export declare function isPortAvailable(port: number): Promise<boolean>;
/**
 * Build the web app if dist doesn't exist.
 * Returns true if build succeeded or dist already exists, false on failure.
 */
export declare function ensureWebBuild(packageRoot: string, json: boolean | undefined, spawnSyncFn?: typeof spawnSync, existsSyncFn?: typeof existsSync): boolean;
export declare function getSessionPath(root: string, sessionId: string): string;
export declare function getCompletePath(root: string, sessionId: string): string;
export declare function createSession(storage: StorageAdapter, root: string, sessionId: string): Promise<SessionFile>;
export declare function pollForCompletion(storage: StorageAdapter, root: string, sessionId: string, timeoutMs: number, pollIntervalMs?: number): Promise<WaitResult>;
export declare function runView(opts: ViewCommandOpts, deps?: ViewCommandDeps): Promise<WaitResult | void>;
export declare function registerViewCommand(program: Command, deps?: ViewCommandDeps): void;
//# sourceMappingURL=view.d.ts.map