/**
 * arete view — launch backend server and open workspace in browser
 */
import type { Command } from 'commander';
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
export type ViewCommandDeps = {
    spawnFn?: typeof spawn;
    spawnSyncFn?: typeof spawnSync;
    openBrowserFn?: (url: string) => Promise<void>;
    fetchFn?: typeof fetch;
    isPortAvailableFn?: (port: number) => Promise<boolean>;
    existsSyncFn?: typeof existsSync;
};
export declare function isPortAvailable(port: number): Promise<boolean>;
/**
 * Build the web app if dist doesn't exist.
 * Returns true if build succeeded or dist already exists, false on failure.
 */
export declare function ensureWebBuild(packageRoot: string, json: boolean | undefined, spawnSyncFn?: typeof spawnSync, existsSyncFn?: typeof existsSync): boolean;
export declare function runView(opts: {
    port?: string;
    json?: boolean;
}, deps?: ViewCommandDeps): Promise<void>;
export declare function registerViewCommand(program: Command, deps?: ViewCommandDeps): void;
//# sourceMappingURL=view.d.ts.map