/**
 * arete inbox — Manage inbox items for triage.
 *
 * Lightweight helper for adding content to the workspace inbox.
 * Items can also arrive via web clippers, manual file drops, or agent chat.
 */
import { createServices, loadConfig, refreshQmdIndex, type QmdRefreshResult } from '@arete/core';
import type { Command } from 'commander';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
export interface InboxAddResult {
    success: boolean;
    path: string;
    title: string;
    source: string;
    qmd?: QmdRefreshResult | {
        indexed: false;
        skipped: true;
    };
    /**
     * Path to the per-doc summary file (Phase 1 §a.2) when written or
     * already-fresh; null when no LLM available / writer skipped.
     */
    summaryPath?: string | null;
    summaryWritten?: boolean;
}
export interface InboxAddDeps {
    createServices: typeof createServices;
    loadConfig: typeof loadConfig;
    refreshQmdIndex: typeof refreshQmdIndex;
    fetchFn?: typeof fetch;
    readFileSync?: typeof readFileSync;
    copyFileSync?: typeof copyFileSync;
    existsSync?: typeof existsSync;
}
/** Core logic for inbox add, exported for testing. */
export declare function runInboxAdd(opts: {
    title?: string;
    body?: string;
    source?: string;
    url?: string;
    file?: string;
    skipQmd?: boolean;
    json?: boolean;
}, deps?: InboxAddDeps): Promise<void>;
export declare function registerInboxCommand(program: Command): void;
//# sourceMappingURL=inbox.d.ts.map