/**
 * Tests for `arete events log winddown` command.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

describe('arete events log deferral-disagreement (Phase 3.5 D3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-deferral-disagreement');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });
  afterEach(() => cleanupTmpDir(tmpDir));

  it('writes a deferral_disagreement event to item-fates.jsonl (AC3.5.10)', () => {
    const raw = runCli(
      [
        'events', 'log', 'deferral-disagreement',
        '--item', 'Pay Choice demo tomorrow',
        '--source', 'deferred-2026-05-05.md',
        '--reason', 'covered elsewhere',
        '--json',
      ],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.fate, 'deferral_disagreement');

    const file = join(tmpDir, '.arete', 'memory', 'item-fates.jsonl');
    assert.ok(existsSync(file));
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.strictEqual(record.fate, 'deferral_disagreement');
    assert.strictEqual(record.item_text, 'Pay Choice demo tomorrow');
    assert.strictEqual(record.reason, 'covered elsewhere');
    assert.strictEqual(record.source_path, 'deferred-2026-05-05.md');
    assert.strictEqual(record.original_fate, 'deferred');
    assert.strictEqual(record.item_kind, 'action_item');
  });

  it('accepts --kind override and --pulled-back-at', () => {
    runCli(
      [
        'events', 'log', 'deferral-disagreement',
        '--item', 'JPM eChecks pricing changed',
        '--source', 'deferred-2026-05-05.md',
        '--reason', 'needs verification',
        '--kind', 'learning',
        '--pulled-back-at', '2026-05-06T08:30:00Z',
        '--json',
      ],
      { cwd: tmpDir },
    );
    const file = join(tmpDir, '.arete', 'memory', 'item-fates.jsonl');
    const record = JSON.parse(
      readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0)[0],
    );
    assert.strictEqual(record.item_kind, 'learning');
    assert.strictEqual(record.pulled_back_at, '2026-05-06T08:30:00Z');
  });

  it('rejects missing required flags', () => {
    const { code, stdout } = runCliRaw(
      [
        'events', 'log', 'deferral-disagreement',
        '--item', 'foo',
        // missing --source and --reason
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.notStrictEqual(code, 0);
    // commander prints an error for missing required option BEFORE
    // our action body runs — exit non-zero is the assertion.
    void stdout;
  });
});

// Phase 3.5 D4 — `arete events backfill item-fates`
describe('arete events backfill item-fates (Phase 3.5 D4)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-backfill-fates');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    // Lay down a fixture meeting with approved sections.
    const meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const meetingPath = join(meetingsDir, `${todayPrefix}-fixture.md`);
    writeFileSync(
      meetingPath,
      `---\ntitle: "Fixture meeting"\ndate: ${todayPrefix}\nimportance: normal\n---\n\n` +
        '## Approved Action Items\n\n' +
        '- Send API spec to Anthony\n' +
        '- Push churn pushback to Lauren\n\n' +
        '## Approved Decisions\n\n' +
        '- Adopt Sonnet for reconciliation\n\n' +
        '## Approved Learnings\n\n' +
        '- Customers building unofficial API guides\n',
      'utf8',
    );
  });
  afterEach(() => cleanupTmpDir(tmpDir));

  it('emits one fate=approved event per approved item (AC3.5.11)', () => {
    const raw = runCli(
      ['events', 'backfill', 'item-fates', '--since', '7d', '--json'],
      { cwd: tmpDir },
    );
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.scanned, 1);
    assert.strictEqual(parsed.emitted, 4); // 2 actions + 1 decision + 1 learning

    const file = join(tmpDir, '.arete', 'memory', 'item-fates.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);
    assert.strictEqual(lines.length, 4);
    const records = lines.map((l) => JSON.parse(l));
    assert(records.every((r) => r.fate === 'approved'));
    assert(records.every((r) => r.reason === 'backfilled'));
    const kinds = records.map((r) => r.item_kind).sort();
    assert.deepEqual(kinds, ['action_item', 'action_item', 'decision', 'learning']);
  });

  it('is idempotent — second run emits zero', () => {
    runCli(['events', 'backfill', 'item-fates', '--since', '7d', '--json'], {
      cwd: tmpDir,
    });
    const second = JSON.parse(
      runCli(['events', 'backfill', 'item-fates', '--since', '7d', '--json'], {
        cwd: tmpDir,
      }),
    );
    assert.strictEqual(second.emitted, 0);
    assert.strictEqual(second.alreadyRecorded, 4);
  });

  it('rejects malformed --since', () => {
    const { code, stdout } = runCliRaw(
      ['events', 'backfill', 'item-fates', '--since', 'next-tuesday', '--json'],
      { cwd: tmpDir },
    );
    assert.notStrictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(parsed.success, false);
    assert.match(parsed.error, /YYYY-MM-DD|Nd|Nw/);
  });
});
