/**
 * Tests for `arete week-memory` commands.
 *
 * Uses a real temp workspace created by `arete install`. The store is seeded
 * through the CLI itself (`week-memory add`) so the backing file stays in the
 * canonical core format — these tests never hand-write the frontmatter.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

interface WeekMemoryEntryJson {
  id: string;
  idShort: string;
  type: string;
  statement: string;
  why: string;
  suppresses?: string;
  status: string;
  created: string;
  week: string;
}

function addEntry(
  tmpDir: string,
  opts: { type: string; statement: string; why: string; suppresses?: string },
): { success: boolean; deduped: boolean; entry: WeekMemoryEntryJson } {
  const args = [
    'week-memory',
    'add',
    '--type',
    opts.type,
    '--statement',
    opts.statement,
    '--why',
    opts.why,
    ...(opts.suppresses ? ['--suppresses', opts.suppresses] : []),
    '--json',
  ];
  return JSON.parse(runCli(args, { cwd: tmpDir }));
}

function listEntries(tmpDir: string, active = false): WeekMemoryEntryJson[] {
  const args = ['week-memory', 'list', ...(active ? ['--active'] : []), '--json'];
  return JSON.parse(runCli(args, { cwd: tmpDir }));
}

describe('week-memory add command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-week-memory-add');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('adds an entry and list --json returns it', () => {
    const added = addEntry(tmpDir, {
      type: 'framing-override',
      statement: 'Glance 2 is the only priority this week',
      why: 'John said deprioritize everything else',
      suppresses: 'deadbeef',
    });
    assert.equal(added.success, true);
    assert.equal(added.deduped, false);
    assert.equal(added.entry.type, 'framing-override');
    assert.equal(added.entry.statement, 'Glance 2 is the only priority this week');
    assert.equal(added.entry.status, 'active');
    assert.equal(added.entry.suppresses, 'deadbeef');
    assert.equal(added.entry.idShort.length, 8);

    const list = listEntries(tmpDir);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, added.entry.id);
    assert.equal(list[0].statement, 'Glance 2 is the only priority this week');
  });

  it('dedupes an identical active entry', () => {
    const first = addEntry(tmpDir, {
      type: 'deprioritization',
      statement: 'Do not surface the budget review',
      why: 'pushed to next week',
    });
    assert.equal(first.deduped, false);

    const second = addEntry(tmpDir, {
      type: 'deprioritization',
      statement: 'Do not surface the budget review',
      why: 'pushed to next week',
    });
    assert.equal(second.deduped, true);
    assert.equal(second.entry.id, first.entry.id);

    const list = listEntries(tmpDir);
    assert.equal(list.length, 1, 'dedup should not add a second entry');
  });

  it('errors clearly for invalid --type', () => {
    const { stdout, code } = runCliRaw(
      [
        'week-memory',
        'add',
        '--type',
        'not-a-type',
        '--statement',
        'x',
        '--why',
        'y',
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(
      parsed.error.includes('not-a-type') &&
        parsed.error.includes('framing-override'),
      `Expected error to name the bad type and the allowed values: ${parsed.error}`,
    );
  });

  it('errors when not in a workspace', () => {
    const { stdout, code } = runCliRaw(
      [
        'week-memory',
        'add',
        '--type',
        'week-constraint',
        '--statement',
        'x',
        '--why',
        'y',
        '--json',
      ],
      { cwd: '/tmp' },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('workspace'), `Expected workspace error: ${parsed.error}`);
  });
});

describe('week-memory list command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-week-memory-list');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('returns [] on an empty/absent store with --json (no error)', () => {
    const raw = runCli(['week-memory', 'list', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as unknown[];
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, 0);
  });

  it('--active excludes resolved entries', () => {
    const a = addEntry(tmpDir, {
      type: 'framing-override',
      statement: 'Keep this one active',
      why: 'still true',
    });
    const b = addEntry(tmpDir, {
      type: 'deprioritization',
      statement: 'This one will be resolved',
      why: 'temporary',
    });

    runCli(['week-memory', 'resolve', b.entry.id.slice(0, 8), '--json'], { cwd: tmpDir });

    const all = listEntries(tmpDir, false);
    assert.equal(all.length, 2, 'resolve must not delete the entry');

    const active = listEntries(tmpDir, true);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, a.entry.id);
    assert.equal(active[0].status, 'active');
  });
});

describe('week-memory resolve command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-week-memory-resolve');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('flips status to resolved without deleting', () => {
    const added = addEntry(tmpDir, {
      type: 'week-constraint',
      statement: 'No meetings on Friday',
      why: 'focus day',
    });

    const raw = runCli(
      ['week-memory', 'resolve', added.entry.id.slice(0, 8), '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as {
      success: boolean;
      outcome: string;
      entry: WeekMemoryEntryJson;
    };
    assert.equal(parsed.success, true);
    assert.equal(parsed.outcome, 'resolved');
    assert.equal(parsed.entry.status, 'resolved');

    // Entry still present (retired, not erased).
    const all = listEntries(tmpDir, false);
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'resolved');
  });

  it('reports "already" when resolving twice', () => {
    const added = addEntry(tmpDir, {
      type: 'week-constraint',
      statement: 'Resolve me twice',
      why: 'test',
    });
    runCli(['week-memory', 'resolve', added.entry.id.slice(0, 8), '--json'], { cwd: tmpDir });

    const raw = runCli(
      ['week-memory', 'resolve', added.entry.id.slice(0, 8), '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw) as { success: boolean; outcome: string };
    assert.equal(parsed.success, true);
    assert.equal(parsed.outcome, 'already');
  });

  it('errors with non-zero exit on an unknown id', () => {
    addEntry(tmpDir, { type: 'week-constraint', statement: 'present', why: 'x' });

    const { stdout, code } = runCliRaw(
      ['week-memory', 'resolve', 'deadbeef', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout) as { success: boolean; error: string };
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.includes('deadbeef'), `Expected error to mention the id: ${parsed.error}`);
  });
});

describe('week-memory archive command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-week-memory-archive');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('reports skipped (current-week) on a same-week store', () => {
    // An add through the CLI stamps the store with the current ISO week.
    addEntry(tmpDir, {
      type: 'framing-override',
      statement: 'Current-week entry',
      why: 'still this week',
    });

    const raw = runCli(['week-memory', 'archive', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as { success: boolean; skipped: boolean; reason?: string };
    assert.equal(parsed.success, true);
    assert.equal(parsed.skipped, true);
    assert.equal(parsed.reason, 'current-week');
  });

  it('reports skipped (empty) on an absent store', async () => {
    // `arete install` seeds an empty now/week-memory.md (week: "") — a truly
    // absent store is the one the archive treats as "empty", so remove the
    // seeded file first.
    const { rmSync } = await import('node:fs');
    rmSync(join(tmpDir, 'now', 'week-memory.md'), { force: true });

    const raw = runCli(['week-memory', 'archive', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(raw) as { success: boolean; skipped: boolean; reason?: string };
    assert.equal(parsed.success, true);
    assert.equal(parsed.skipped, true);
    assert.equal(parsed.reason, 'empty');
  });
});
