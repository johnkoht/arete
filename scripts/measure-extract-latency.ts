#!/usr/bin/env tsx
/**
 * Phase 10a-pre baseline-latency measurement script (AC0b).
 *
 * Runs `arete meeting extract <fixture>` against three fixture meetings
 * (small / medium / large) three times each, capturing wall-clock latency
 * per run. Reports per-fixture median + mean + min + max. The medians
 * become the regression baseline for AC13 (≤5s extra/extract after
 * Phase 10b dedup ships).
 *
 * Usage:
 *   tsx scripts/measure-extract-latency.ts \
 *     --workspace /path/to/installed/arete/workspace \
 *     [--runs 3] [--json]
 *
 * The script:
 *   1. Copies each fixture from packages/core/test/fixtures/meetings/ into
 *      <workspace>/resources/meetings/ (idempotent — overwrites existing).
 *   2. Invokes the local CLI (packages/cli/src/index.ts via tsx) for each
 *      fixture, timing the wall-clock duration of `arete meeting extract`.
 *   3. Repeats N times per fixture (default 3).
 *   4. Prints a per-fixture table to stdout AND writes a markdown summary
 *      to the path specified by --report (default: prints only).
 *
 * What this script does NOT do:
 *   - It does NOT touch .arete/commitments.json — extract only writes
 *     staged sections into the meeting file itself.
 *   - It does NOT call any LLM directly. The CLI's extract flow does;
 *     workspace must have AI credentials configured (see
 *     `arete credentials login`).
 *
 * Intended invocation: John runs this once against a non-production
 * workspace (e.g. a fresh `arete install`) after Phase 10a-pre lands.
 * The captured medians get pasted into baseline-latencies.md so the
 * AC13 gate has a real anchor.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE_DIR = join(REPO_ROOT, 'packages/core/test/fixtures/meetings');
const CLI_ENTRY = join(REPO_ROOT, 'packages/cli/src/index.ts');
const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');

const FIXTURES = [
  { slug: 'small',  filename: '2026-06-01-small-1on1.md' },
  { slug: 'medium', filename: '2026-06-02-medium-product-review.md' },
  { slug: 'large',  filename: '2026-06-03-large-quarterly-review.md' },
] as const;

type RunResult = {
  fixture: string;
  size: 'small' | 'medium' | 'large';
  latencies: number[];
  median: number;
  mean: number;
  min: number;
  max: number;
};

function parseArgs(argv: string[]): {
  workspace: string | null;
  runs: number;
  report: string | null;
  json: boolean;
} {
  let workspace: string | null = null;
  let runs = 3;
  let report: string | null = null;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--workspace' || arg === '-w') {
      workspace = argv[++i];
    } else if (arg === '--runs' || arg === '-r') {
      runs = Number.parseInt(argv[++i], 10);
    } else if (arg === '--report') {
      report = argv[++i];
    } else if (arg === '--json') {
      json = true;
    }
  }
  return { workspace, runs, report, json };
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function runExtract(workspace: string, slug: string): number {
  const t0 = Date.now();
  const result = spawnSync(TSX, [CLI_ENTRY, 'meeting', 'extract', slug, '--json'], {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const elapsed = Date.now() - t0;
  if (result.status !== 0) {
    throw new Error(
      `extract failed for ${slug} (exit ${result.status}):\n${result.stderr || result.stdout}`,
    );
  }
  return elapsed;
}

function main(): void {
  const { workspace, runs, report, json } = parseArgs(process.argv.slice(2));
  if (!workspace) {
    console.error(
      'usage: measure-extract-latency.ts --workspace <path> [--runs N] [--report path]',
    );
    process.exit(2);
  }
  if (!existsSync(workspace)) {
    console.error(`workspace does not exist: ${workspace}`);
    process.exit(2);
  }

  const meetingsDir = join(workspace, 'resources/meetings');
  mkdirSync(meetingsDir, { recursive: true });

  // Copy fixtures into the workspace (idempotent — overwrites every run).
  for (const { filename } of FIXTURES) {
    const src = join(FIXTURE_DIR, filename);
    const dst = join(meetingsDir, filename);
    copyFileSync(src, dst);
  }

  const results: RunResult[] = [];
  for (const { slug: size, filename } of FIXTURES) {
    const fixtureSlug = basename(filename, '.md');
    const latencies: number[] = [];
    for (let i = 0; i < runs; i++) {
      const ms = runExtract(workspace, fixtureSlug);
      latencies.push(ms);
      if (!json) {
        process.stderr.write(`  [${size}] run ${i + 1}/${runs}: ${ms}ms\n`);
      }
    }
    results.push({
      fixture: fixtureSlug,
      size,
      latencies,
      median: median(latencies),
      mean: mean(latencies),
      min: Math.min(...latencies),
      max: Math.max(...latencies),
    });
  }

  if (json) {
    console.log(JSON.stringify({ runs, results }, null, 2));
  } else {
    console.log('');
    console.log('| fixture                                  | size   | median | mean   | min    | max    |');
    console.log('|------------------------------------------|--------|--------|--------|--------|--------|');
    for (const r of results) {
      const fixturePad = r.fixture.padEnd(40);
      const sizePad = r.size.padEnd(6);
      console.log(
        `| ${fixturePad} | ${sizePad} | ${String(r.median).padStart(4)}ms | ${String(Math.round(r.mean)).padStart(4)}ms | ${String(r.min).padStart(4)}ms | ${String(r.max).padStart(4)}ms |`,
      );
    }
    console.log('');
  }

  if (report) {
    const lines: string[] = [];
    lines.push('# Extract latency baseline');
    lines.push('');
    lines.push(`Captured: ${new Date().toISOString()}`);
    lines.push(`Workspace: ${workspace}`);
    lines.push(`Runs per fixture: ${runs}`);
    lines.push('');
    lines.push('| fixture | size | median | mean | min | max |');
    lines.push('|---------|------|--------|------|-----|-----|');
    for (const r of results) {
      lines.push(
        `| ${r.fixture} | ${r.size} | ${r.median}ms | ${Math.round(r.mean)}ms | ${r.min}ms | ${r.max}ms |`,
      );
    }
    writeFileSync(report, lines.join('\n') + '\n', 'utf8');
    if (!json) process.stderr.write(`Wrote report to ${report}\n`);
  }
}

main();
