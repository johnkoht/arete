/**
 * Tests for `arete events log winddown` command.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('arete events log winddown', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-events');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('writes a winddown start event in well-formed grammar (AC0.1)', () => {
    const raw = runCli(['events', 'log', 'winddown', '--event', 'start', '--json'], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.kind, 'start');

    const log = readFileSync(join(tmpDir, '.arete', 'memory', 'log.md'), 'utf8');
    assert.match(
      log,
      /^## \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] winddown \| event=start$/m,
      `expected one winddown start line; got:\n${log}`,
    );
  });

  it('writes start then end events in order', () => {
    runCli(['events', 'log', 'winddown', '--event', 'start', '--json'], { cwd: tmpDir });
    runCli(['events', 'log', 'winddown', '--event', 'end', '--json'], { cwd: tmpDir });

    const log = readFileSync(join(tmpDir, '.arete', 'memory', 'log.md'), 'utf8');
    const lines = log
      .split('\n')
      .filter((l) => l.startsWith('## ['));
    assert.strictEqual(lines.length, 2);
    assert.match(lines[0], /winddown \| event=start$/);
    assert.match(lines[1], /winddown \| event=end$/);
  });

  it('rejects events other than start | end', () => {
    const { code, stdout } = runCliRaw(
      ['events', 'log', 'winddown', '--event', 'middle', '--json'],
      { cwd: tmpDir },
    );
    assert.notStrictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.success, false);
    assert.match(parsed.error, /must be "start" or "end"/);
  });
});

// Phase 1 §a.3 / MC3 — slack-thread substantial heuristic logging
describe('arete events log slack-thread', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-slack-eval');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('logs would_summarize=true when message threshold met', () => {
    const raw = runCli(
      [
        'events', 'log', 'slack-thread',
        '--thread', 'C123-abc',
        '--messages', '12',
        '--participants', '2',
        '--json',
      ],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.wouldSummarize, true);
    assert.strictEqual(parsed.trigger, 'messages');

    const log = readFileSync(join(tmpDir, '.arete', 'memory', 'log.md'), 'utf8');
    // Field keys are sorted alphabetically by MemoryLogService grammar.
    assert.match(log, /slack-thread-eval/);
    assert.match(log, /thread=C123-abc/);
    assert.match(log, /would_summarize=true/);
    assert.match(log, /trigger=messages/);
    assert.match(log, /messages=12/);
    assert.match(log, /participants=2/);
  });

  it('logs would_summarize=false for chatter under all thresholds', () => {
    const raw = runCli(
      [
        'events', 'log', 'slack-thread',
        '--thread', 't2',
        '--messages', '3',
        '--participants', '2',
        '--json',
      ],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.wouldSummarize, false);
    assert.strictEqual(parsed.trigger, 'none');
  });

  it('rejects negative messages count', () => {
    const { code, stdout } = runCliRaw(
      [
        'events', 'log', 'slack-thread',
        '--thread', 't1',
        '--messages', '-1',
        '--participants', '0',
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.notStrictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.success, false);
  });
});
