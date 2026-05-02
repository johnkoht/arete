/**
 * arete cost report — aggregate LLM costs already recorded in
 * `.arete/memory/log.md` (Phase 0 instrumentation).
 *
 * Reads events with an `llm_cost_usd=<n>` field (today written by
 * `arete topic seed`; future writers will add their own). Sums across a
 * rolling window and groups by day or by event-name (skill proxy).
 */
import type { Command } from 'commander';
import type { MemoryLogEvent, StorageAdapter } from '@arete/core';
export type CostReportGrouping = 'day' | 'skill';
export interface CostReportOptions {
    since?: string;
    by?: CostReportGrouping;
    json?: boolean;
}
export interface CostReportRow {
    group: string;
    costUsd: number;
    events: number;
}
export interface CostReportSummary {
    windowDays: number;
    windowStart: string;
    windowEnd: string;
    grouping: CostReportGrouping;
    totalCostUsd: number;
    totalEvents: number;
    rows: CostReportRow[];
}
/**
 * Parse `--since` value into days. Accepts forms `7d`, `14d`, `30d`, or a
 * bare integer (interpreted as days). Returns `null` when unparseable.
 */
export declare function parseSince(input: string | undefined): number | null;
/**
 * Aggregate cost events from a parsed log. Pure — no I/O. Events without
 * an `llm_cost_usd` field are ignored.
 *
 * @param events - parsed events from `parseMemoryLog(content)`
 * @param windowDays - rolling window in days; events older than this are skipped
 * @param grouping - 'day' (YYYY-MM-DD bucket) or 'skill' (event kind)
 * @param now - reference clock (DI for tests)
 */
export declare function aggregateCostReport(events: MemoryLogEvent[], windowDays: number, grouping: CostReportGrouping, now?: Date): CostReportSummary;
export interface CostReportDeps {
    /** Optional clock override for tests. */
    now?: Date;
    /**
     * Optional override for reading the log file; primarily useful so
     * fixture tests can exercise the runner without needing a workspace.
     */
    readLog?: (storage: StorageAdapter, memoryDir: string) => Promise<string | null>;
}
export declare function runCostReport(opts: CostReportOptions, deps?: CostReportDeps): Promise<void>;
export declare function registerCostCommand(program: Command, deps?: CostReportDeps): void;
//# sourceMappingURL=cost.d.ts.map