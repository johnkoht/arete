/**
 * arete pull [integration] — fetch data from integrations
 */
import type { QmdRefreshResult } from '@arete/core';
import type { Command } from 'commander';
export declare function registerPullCommand(program: Command): void;
export type PullNotionDeps = {
    loadConfigFn: (storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<{
        qmd_collection?: string;
    }>;
    refreshQmdIndexFn: (workspaceRoot: string, collectionName: string | undefined) => Promise<QmdRefreshResult>;
};
export declare function pullNotion(services: Awaited<ReturnType<typeof import('@arete/core').createServices>>, workspaceRoot: string, opts: {
    pages: string[];
    destination: string;
    dryRun: boolean;
    skipQmd: boolean;
    json: boolean;
}, deps?: PullNotionDeps): Promise<void>;
//# sourceMappingURL=pull.d.ts.map