/**
 * arete view — launch backend server and open workspace in browser
 */
import type { Command } from 'commander';
import { spawn } from 'child_process';
export type ViewCommandDeps = {
    spawnFn?: typeof spawn;
    openBrowserFn?: (url: string) => Promise<void>;
    fetchFn?: typeof fetch;
    isPortAvailableFn?: (port: number) => Promise<boolean>;
};
export declare function isPortAvailable(port: number): Promise<boolean>;
export declare function runView(opts: {
    port?: string;
    json?: boolean;
}, deps?: ViewCommandDeps): Promise<void>;
export declare function registerViewCommand(program: Command, deps?: ViewCommandDeps): void;
//# sourceMappingURL=view.d.ts.map