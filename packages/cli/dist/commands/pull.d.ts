/**
 * arete pull [integration] — fetch data from integrations
 */
import type { QmdRefreshResult, CalendarProvider, AreteConfig } from '@arete/core';
import type { Command } from 'commander';
export declare function registerPullCommand(program: Command): void;
export type PullNotionDeps = {
    loadConfigFn: (storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<{
        qmd_collection?: string;
    }>;
    refreshQmdIndexFn: (workspaceRoot: string, collectionName: string | undefined) => Promise<QmdRefreshResult>;
};
export type PullCalendarDeps = {
    loadConfigFn: (storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<AreteConfig>;
    getCalendarProviderFn: (config: AreteConfig, storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<CalendarProvider | null>;
};
export declare function pullNotion(services: Awaited<ReturnType<typeof import('@arete/core').createServices>>, workspaceRoot: string, opts: {
    pages: string[];
    destination: string;
    dryRun: boolean;
    skipQmd: boolean;
    json: boolean;
}, deps?: PullNotionDeps): Promise<void>;
export declare function pullCalendarHelper(services: Awaited<ReturnType<typeof import('@arete/core').createServices>>, workspaceRoot: string, opts: {
    today: boolean;
    json: boolean;
}, deps?: PullCalendarDeps): Promise<void>;
//# sourceMappingURL=pull.d.ts.map