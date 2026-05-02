/**
 * Tests for `arete cost report` command.
 *
 * Pure aggregation is unit-tested directly. End-to-end CLI smoke goes
 * through a fixture workspace (install + log.md fixture + assert).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';
import {
  aggregateCostReport,
  parseSince,
} from '../../src/commands/cost.js';
import type { MemoryLogEvent } from '@arete/core';

// ---------------------------------------------------------------------------
// parseSince
// ---------------------------------------------------------------------------

describe('parseSince', () => {
  it('returns 7 by default for undefined input', () => {
    assert.strictEqual(parseSince(undefined), 7);
  });

  it('parses 14d into 14 days', () => {
    assert.strictEqual(parseSince('14d'), 14);
  });

  it('parses bare integers as days', () => {
    assert.strictEqual(parseSince('30'), 30);
  });

  it('returns null for malformed input', () => {
    assert.strictEqual(parseSince('one week'), null);
    assert.strictEqual(parseSince('-3d'), null);
    assert.strictEqual(parseSince('0d'), null);
  });
});

// ---------------------------------------------------------------------------
// aggregateCostReport — pure
// ---------------------------------------------------------------------------

describe('aggregateCostReport', () => {
  const now = new Date('2026-05-15T12:00:00Z');

  function event(ts: string, kind: string, cost: string | null, extra: Record<string, string> = {}): MemoryLogEvent {
    const fields: Record<string, string> = { ...extra };
    if (cost !== null) fields.llm_cost_usd = cost;
    return { timestamp: ts, event: kind, fields };
  }

  it('returns empty rows when no events have llm_cost_usd', () => {
    const events = [
      event('2026-05-14T08:00:00Z', 'refresh', null),
      event('2026-05-14T09:00:00Z', 'lint', null),
    ];
    const summary = aggregateCostReport(events, 7, 'day', now);
    assert.deepStrictEqual(summary.rows, []);
    assert.strictEqual(summary.totalCostUsd, 0);
    assert.strictEqual(summary.totalEvents, 0);
    assert.strictEqual(summary.windowDays, 7);
  });

  it('sums llm_cost_usd by day in ascending order', () => {
    const events = [
      event('2026-05-13T01:00:00Z', 'seed', '0.5000'),
      event('2026-05-14T08:00:00Z', 'seed', '1.2500'),
      event('2026-05-14T20:00:00Z', 'refresh', '0.7500'),
      event('2026-05-15T11:00:00Z', 'refresh', '0.1000'),
    ];
    const summary = aggregateCostReport(events, 7, 'day', now);
    assert.strictEqual(summary.totalEvents, 4);
    assert.ok(Math.abs(summary.totalCostUsd - 2.6) < 1e-9);
    assert.deepStrictEqual(
      summary.rows.map((r) => r.group),
      ['2026-05-13', '2026-05-14', '2026-05-15'],
    );
    assert.ok(Math.abs(summary.rows[1].costUsd - 2.0) < 1e-9);
    assert.strictEqual(summary.rows[1].events, 2);
  });

  it('groups by skill when grouping=skill (descending by cost)', () => {
    const events = [
      event('2026-05-14T08:00:00Z', 'seed', '1.2500'),
      event('2026-05-14T09:00:00Z', 'seed', '0.7500'),
      event('2026-05-14T10:00:00Z', 'refresh', '0.5000'),
    ];
    const summary = aggregateCostReport(events, 7, 'skill', now);
    assert.deepStrictEqual(
      summary.rows.map((r) => r.group),
      ['seed', 'refresh'],
    );
    assert.ok(Math.abs(summary.rows[0].costUsd - 2.0) < 1e-9);
    assert.strictEqual(summary.rows[0].events, 2);
  });

  it('drops events outside the rolling window', () => {
    const events = [
      event('2026-05-01T08:00:00Z', 'seed', '5.0000'), // 14 days ago — outside 7d
      event('2026-05-12T08:00:00Z', 'seed', '0.2500'), // 3 days ago — inside
    ];
    const summary = aggregateCostReport(events, 7, 'day', now);
    assert.strictEqual(summary.totalEvents, 1);
    assert.ok(Math.abs(summary.totalCostUsd - 0.25) < 1e-9);
  });

  it('includes events inside a wider window', () => {
    // 14d before now (2026-05-15T12:00:00Z) lands at 2026-05-01T12:00:00Z;
    // an event at 2026-05-02T00:00:00Z is inside the window.
    const events = [
      event('2026-04-25T08:00:00Z', 'seed', '5.0000'), // ~20 days ago — outside 14d
      event('2026-05-02T00:00:00Z', 'seed', '1.5000'), // 13.5 days ago — inside 14d
      event('2026-05-12T08:00:00Z', 'seed', '0.2500'),
    ];
    const summary = aggregateCostReport(events, 14, 'day', now);
    assert.strictEqual(summary.totalEvents, 2);
    assert.ok(Math.abs(summary.totalCostUsd - 1.75) < 1e-9);
  });

  it('skips events whose llm_cost_usd is non-numeric', () => {
    const events = [
      event('2026-05-14T08:00:00Z', 'seed', 'bogus'),
      event('2026-05-14T09:00:00Z', 'seed', '0.5000'),
    ];
    const summary = aggregateCostReport(events, 7, 'day', now);
    assert.strictEqual(summary.totalEvents, 1);
    assert.ok(Math.abs(summary.totalCostUsd - 0.5) < 1e-9);
  });
});

// ---------------------------------------------------------------------------
// CLI smoke
// ---------------------------------------------------------------------------

describe('arete cost report CLI', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-cost');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns success: true with empty rows when no log.md exists', () => {
    const raw = runCli(['cost', 'report', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      rows: unknown[];
      totalCostUsd: number;
    };
    assert.strictEqual(parsed.success, true);
    assert.deepStrictEqual(parsed.rows, []);
    assert.strictEqual(parsed.totalCostUsd, 0);
  });

  it('aggregates llm_cost_usd from a real log.md fixture', () => {
    const memoryDir = join(tmpDir, '.arete', 'memory');
    mkdirSync(memoryDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 19) + 'Z';
    const log = `# Memory Log

## [${today}] seed | llm_cost_usd=1.5000 meetings=4
## [${today}] refresh | llm_cost_usd=0.2500 scope=topic_one
## [${today}] lint | scope=all
`;
    writeFileSync(join(memoryDir, 'log.md'), log, 'utf8');

    const raw = runCli(['cost', 'report', '--json', '--by', 'skill'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as {
      success: boolean;
      totalCostUsd: number;
      totalEvents: number;
      rows: Array<{ group: string; costUsd: number }>;
    };
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.totalEvents, 2);
    assert.ok(Math.abs(parsed.totalCostUsd - 1.75) < 1e-9);
    assert.strictEqual(parsed.rows.length, 2);
    const seed = parsed.rows.find((r) => r.group === 'seed');
    assert.ok(seed);
    assert.ok(Math.abs(seed.costUsd - 1.5) < 1e-9);
  });

});
