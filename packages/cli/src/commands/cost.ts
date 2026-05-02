/**
 * arete cost report — aggregate LLM costs already recorded in
 * `.arete/memory/log.md` (Phase 0 instrumentation).
 *
 * Reads events with an `llm_cost_usd=<n>` field (today written by
 * `arete topic seed`; future writers will add their own). Sums across a
 * rolling window and groups by day or by event-name (skill proxy).
 */

import type { Command } from 'commander';
import { join } from 'node:path';
import chalk from 'chalk';
import { createServices, parseMemoryLog } from '@arete/core';
import type { MemoryLogEvent, StorageAdapter } from '@arete/core';
import { header, error as printError, info } from '../formatters.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Pure aggregation
// ---------------------------------------------------------------------------

/**
 * Parse `--since` value into days. Accepts forms `7d`, `14d`, `30d`, or a
 * bare integer (interpreted as days). Returns `null` when unparseable.
 */
export function parseSince(input: string | undefined): number | null {
  if (input === undefined || input.length === 0) return 7;
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)d?$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Aggregate cost events from a parsed log. Pure — no I/O. Events without
 * an `llm_cost_usd` field are ignored.
 *
 * @param events - parsed events from `parseMemoryLog(content)`
 * @param windowDays - rolling window in days; events older than this are skipped
 * @param grouping - 'day' (YYYY-MM-DD bucket) or 'skill' (event kind)
 * @param now - reference clock (DI for tests)
 */
export function aggregateCostReport(
  events: MemoryLogEvent[],
  windowDays: number,
  grouping: CostReportGrouping,
  now: Date = new Date(),
): CostReportSummary {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();
  const nowIso = now.toISOString();

  const buckets = new Map<string, CostReportRow>();
  let totalCost = 0;
  let totalEvents = 0;

  for (const ev of events) {
    if (ev.timestamp < cutoffIso) continue;
    const raw = ev.fields.llm_cost_usd;
    if (raw === undefined) continue;
    const cost = Number(raw);
    if (!Number.isFinite(cost)) continue;

    const key = grouping === 'day' ? ev.timestamp.slice(0, 10) : ev.event;
    const row = buckets.get(key) ?? { group: key, costUsd: 0, events: 0 };
    row.costUsd += cost;
    row.events += 1;
    buckets.set(key, row);
    totalCost += cost;
    totalEvents += 1;
  }

  const rows = Array.from(buckets.values()).sort((a, b) =>
    grouping === 'day' ? a.group.localeCompare(b.group) : b.costUsd - a.costUsd,
  );

  return {
    windowDays,
    windowStart: cutoff.toISOString(),
    windowEnd: nowIso,
    grouping,
    totalCostUsd: totalCost,
    totalEvents,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Runner (DI for tests)
// ---------------------------------------------------------------------------

export interface CostReportDeps {
  /** Optional clock override for tests. */
  now?: Date;
  /**
   * Optional override for reading the log file; primarily useful so
   * fixture tests can exercise the runner without needing a workspace.
   */
  readLog?: (storage: StorageAdapter, memoryDir: string) => Promise<string | null>;
}

export async function runCostReport(
  opts: CostReportOptions,
  deps: CostReportDeps = {},
): Promise<void> {
  const services = await createServices(process.cwd());
  const root = await services.workspace.findRoot();
  if (!root) {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      printError('Not in an Areté workspace');
    }
    process.exit(1);
  }

  const windowDays = parseSince(opts.since);
  if (windowDays === null) {
    const message = `Invalid --since value: "${opts.since}" (expected e.g. 7d, 14d, 30d)`;
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: message }));
    } else {
      printError(message);
    }
    process.exit(1);
  }

  const grouping: CostReportGrouping = opts.by === 'skill' ? 'skill' : 'day';
  const paths = services.workspace.getPaths(root);
  const reader = deps.readLog ?? defaultReadLog;
  const content = await reader(services.storage, paths.memory);
  const events = content !== null ? parseMemoryLog(content) : [];
  const summary = aggregateCostReport(events, windowDays!, grouping, deps.now);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          ...summary,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Human-readable
  header(`Cost Report — last ${windowDays}d (by ${grouping})`);
  if (summary.rows.length === 0) {
    info('No LLM cost events recorded in this window.');
    info('Events with `llm_cost_usd=<n>` in `.arete/memory/log.md` populate this report.');
    return;
  }

  const colKey = grouping === 'day' ? 'Day' : 'Skill';
  console.log('');
  console.log(chalk.bold(`  ${colKey.padEnd(20)} ${'Cost (USD)'.padStart(12)} ${'Events'.padStart(8)}`));
  console.log(chalk.dim(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(8)}`));
  for (const row of summary.rows) {
    const cost = `$${row.costUsd.toFixed(4)}`;
    console.log(
      `  ${row.group.padEnd(20)} ${cost.padStart(12)} ${String(row.events).padStart(8)}`,
    );
  }
  console.log(chalk.dim(`  ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(8)}`));
  const totalLabel = 'TOTAL'.padEnd(20);
  const totalCost = `$${summary.totalCostUsd.toFixed(4)}`.padStart(12);
  const totalEvents = String(summary.totalEvents).padStart(8);
  console.log(chalk.bold(`  ${totalLabel} ${totalCost} ${totalEvents}`));
  console.log('');
}

async function defaultReadLog(
  storage: StorageAdapter,
  memoryDir: string,
): Promise<string | null> {
  return storage.read(join(memoryDir, 'log.md'));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerCostCommand(program: Command, deps: CostReportDeps = {}): void {
  const cost = program.command('cost').description('Cost telemetry from .arete/memory/log.md');

  cost
    .command('report')
    .description('Aggregate llm_cost_usd events over a rolling window')
    .option('--since <window>', 'Rolling window (e.g. 7d, 14d, 30d)', '7d')
    .option('--by <grouping>', 'Group by "day" (default) or "skill"', 'day')
    .option('--json', 'Output as JSON')
    .action(async (opts: CostReportOptions) => {
      await runCostReport(opts, deps);
    });
}
