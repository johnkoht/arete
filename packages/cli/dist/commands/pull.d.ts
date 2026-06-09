/**
 * arete pull [integration] — fetch data from integrations
 */
import type { QmdRefreshResult, CalendarProvider, AreteConfig, EmailProvider } from '@arete/core';
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
    /**
     * Forward-window in days for non-`--today` invocations. Default 7.
     * Phase 7a AC6 — Phase 8's reconciler uses 30 to match future-intent
     * commitments against scheduled events.
     */
    days?: number;
}, deps?: PullCalendarDeps): Promise<void>;
/**
 * Phase 11-pre — DI for `pullGmailHelper` so tests can inject a mock
 * EmailProvider WITHOUT a real `gws` CLI dependency.
 */
export type PullGmailDeps = {
    loadConfigFn: (storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<AreteConfig>;
    getEmailProviderFn: (config: AreteConfig, storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'], workspaceRoot: string) => Promise<EmailProvider | null>;
};
export declare function pullGmailHelper(services: Awaited<ReturnType<typeof import('@arete/core').createServices>>, workspaceRoot: string, opts: {
    days: number;
    json: boolean;
    query?: string;
    /**
     * Phase 11-pre (F4) — when true, ALSO pulls the Sent folder via
     * provider.fetchSent and writes `.arete/cache/gmail-sent-YYYY-MM-DD.json`
     * with `cacheVersion: 2` envelope. Backward compat: default false.
     */
    sent?: boolean;
    /**
     * Phase 11-pre (F4) — when true (and `sent` is true), decodes body
     * and extracts attachment metadata. Default false (faster, smaller
     * cache).
     */
    fetchBody?: boolean;
}, deps?: PullGmailDeps): Promise<void>;
export declare function pullDriveHelper(services: Awaited<ReturnType<typeof import('@arete/core').createServices>>, workspaceRoot: string, opts: {
    days: number;
    json: boolean;
    query?: string;
}): Promise<void>;
//# sourceMappingURL=pull.d.ts.map