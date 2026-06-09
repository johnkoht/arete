/**
 * Phase 10e CLI integration tests for `arete dedup`.
 *
 * Exercises the verb against a tmp workspace populated with synthetic
 * commitments.json + memory items. Verifies:
 *   - --scope validation
 *   - --dry-run is default + writes diff report + does NOT modify data
 *   - --apply mutates commitments.json + is idempotent on second pass
 *   - memory scopes (decisions / learnings) are surface-only even with
 *     --apply (per plan AC10a)
 *   - --since filter narrows the candidate set
 *
 * **Critical**: NO LLM CALLS. The verb runs with deterministic Jaccard-
 * only logic (no --llm flag passed in tests). NO production data writes
 * — all I/O is in a tmp directory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCliRaw } from '../helpers.js';

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function makeWorkspace(root: string): void {
  writeFile(
    root,
    'arete.yaml',
    `schema: 2
version: 0.10.1
ide: claude
`,
  );
  writeFile(
    root,
    '.arete/config.json',
    JSON.stringify({ schema: 2, version: '0.10.1' }),
  );

  // Minimal people/ directory.
  writeFile(
    root,
    'people/internal/dave-wiedenheft.md',
    `---\nname: Dave Wiedenheft\nslug: dave-wiedenheft\ncategory: internal\n---\n`,
  );
}

function syntheticCommitments(): string {
  const c = (overrides: Record<string, unknown>) => ({
    id: 'a'.repeat(64),
    text: 'placeholder',
    direction: 'i_owe_them',
    personSlug: 'dave-wiedenheft',
    personName: 'Dave Wiedenheft',
    source: 'meeting-x.md',
    date: '2026-05-01',
    createdAt: '2026-05-01T08:00:00Z',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  });
  // Three commitments:
  //   c1, c2: exact-text duplicates → should group on commitments scope
  //   c3: distinct (different text + different person)
  const file = {
    commitments: [
      c({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        source: 'meeting-a.md',
        date: '2026-05-01',
        createdAt: '2026-05-01T08:00:00Z',
      }),
      c({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk to Dave about staffing',
        source: 'meeting-b.md',
        date: '2026-05-02',
        createdAt: '2026-05-02T09:00:00Z',
      }),
      c({
        id: 'c3'.padEnd(64, '3'),
        text: 'Review the FY25 roadmap',
        source: 'meeting-c.md',
        date: '2026-05-03',
        createdAt: '2026-05-03T09:00:00Z',
        personSlug: 'lindsay-gray',
      }),
    ],
  };
  return JSON.stringify(file, null, 2);
}

describe('arete dedup --scope commitments (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arete-dedup-'));
    makeWorkspace(tmpDir);
    writeFile(tmpDir, '.arete/commitments.json', syntheticCommitments());
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--scope=commitments --dry-run writes diff and does NOT modify data', () => {
    const commitmentsPath = join(tmpDir, '.arete/commitments.json');
    const before = readFileSync(commitmentsPath, 'utf8');

    const { stdout, stderr, code } = runCliRaw(
      [
        'dedup',
        '--scope',
        'commitments',
        '--dry-run',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `unexpected exit: ${stderr}`);
    const result = JSON.parse(stdout) as {
      success: boolean;
      mode: string;
      scope: string;
      summary: { totalIn: number; groups: number; duplicates: number };
      diffPath: string;
      applied: boolean;
    };
    assert.equal(result.success, true);
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.applied, false);
    assert.equal(result.summary.groups, 1, 'one group of duplicates');
    assert.equal(result.summary.duplicates, 1);
    assert.ok(existsSync(result.diffPath));
    const diff = readFileSync(result.diffPath, 'utf8');
    assert.ok(diff.includes('# Background dedup diff — scope=commitments'));

    // commitments.json is untouched.
    const after = readFileSync(commitmentsPath, 'utf8');
    assert.equal(after, before, 'dry-run must NOT modify commitments.json');
  });

  it('--scope=commitments --apply absorbs duplicates and is idempotent', () => {
    const commitmentsPath = join(tmpDir, '.arete/commitments.json');

    // First apply: absorbs the c1/c2 pair.
    const first = runCliRaw(
      [
        'dedup',
        '--scope',
        'commitments',
        '--apply',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(first.code, 0, `first apply failed: ${first.stderr}`);
    const firstResult = JSON.parse(first.stdout) as {
      success: boolean;
      mode: string;
      applied: boolean;
      summary: { groups: number; duplicates: number };
    };
    assert.equal(firstResult.applied, true);
    assert.equal(firstResult.summary.groups, 1);
    assert.equal(firstResult.summary.duplicates, 1);

    // commitments.json now has 2 rows (one absorbed).
    const afterFirst = JSON.parse(
      readFileSync(commitmentsPath, 'utf8'),
    ) as { commitments: Array<{ id: string; source_meetings?: string[] }> };
    assert.equal(afterFirst.commitments.length, 2);
    // The surviving "Talk to Dave" row carries both source meetings.
    const survivor = afterFirst.commitments.find((c) =>
      c.id.startsWith('c1'),
    );
    assert.ok(survivor, 'c1 canonical preserved');
    assert.ok(
      (survivor.source_meetings ?? []).some((s) => s.includes('meeting-a')),
      'canonical source kept',
    );
    assert.ok(
      (survivor.source_meetings ?? []).some((s) => s.includes('meeting-b')),
      'duplicate source merged',
    );

    // Second apply: idempotent no-op.
    const second = runCliRaw(
      [
        'dedup',
        '--scope',
        'commitments',
        '--apply',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(second.code, 0, `second apply failed: ${second.stderr}`);
    const secondResult = JSON.parse(second.stdout) as {
      summary: { groups: number; duplicates: number };
    };
    assert.equal(secondResult.summary.groups, 0, 'no new groups on re-apply');
    assert.equal(secondResult.summary.duplicates, 0);

    // commitments.json byte-identical to the post-first state.
    const afterSecond = readFileSync(commitmentsPath, 'utf8');
    assert.equal(
      JSON.parse(afterSecond).commitments.length,
      2,
      'count unchanged on second apply',
    );
  });

  it('--since filter narrows scope', () => {
    const { stdout, code, stderr } = runCliRaw(
      [
        'dedup',
        '--scope',
        'commitments',
        '--dry-run',
        '--since',
        '2026-05-02',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `unexpected exit: ${stderr}`);
    const result = JSON.parse(stdout) as {
      summary: { totalIn: number; groups: number };
    };
    // c1 is at 2026-05-01 (before since) → dropped. c2 and c3 in scope.
    assert.equal(result.summary.totalIn, 2);
    // No dupes once c1 is dropped (c2 and c3 differ).
    assert.equal(result.summary.groups, 0);
  });

  it('invalid --scope rejected', () => {
    const { stdout, stderr, code } = runCliRaw(
      ['dedup', '--scope', 'bogus', '--dry-run', '--json'],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    assert.match(stdout + stderr, /Invalid --scope/);
  });

  it('invalid --since shape rejected', () => {
    const { stdout, stderr, code } = runCliRaw(
      [
        'dedup',
        '--scope',
        'commitments',
        '--since',
        'May 1',
        '--dry-run',
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    assert.match(stdout + stderr, /Invalid --since/);
  });
});

describe('arete dedup --scope decisions (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arete-dedup-'));
    makeWorkspace(tmpDir);
    // Two decisions sections with same title → exact-title group.
    writeFile(
      tmpDir,
      '.arete/memory/items/decisions.md',
      `# Decisions

## POP migration timing
- **Date**: 2026-05-01
- **Source**: meeting-a.md
- **Topics**: pop-migration

POP migration must complete by EOY. Anthony is the lead.

## POP migration timing
- **Date**: 2026-05-15
- **Source**: meeting-b.md
- **Topics**: pop-migration

POP MVP wraps by end of year. Anthony leads.

## Q3 budget direction
- **Date**: 2026-05-20
- **Source**: meeting-c.md
- **Topics**: budget

Hold the line on FY25 hiring; defer additional eng headcount to Q4.
`,
    );
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--scope=decisions --dry-run surfaces same-title group as candidates', () => {
    const { stdout, code, stderr } = runCliRaw(
      [
        'dedup',
        '--scope',
        'decisions',
        '--dry-run',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `unexpected exit: ${stderr}`);
    const result = JSON.parse(stdout) as {
      summary: { totalIn: number; groups: number; uncertain: number };
      diffPath: string;
    };
    assert.equal(result.summary.totalIn, 3, 'three decisions parsed');
    assert.equal(result.summary.groups, 1, 'same-title group');
    assert.ok(existsSync(result.diffPath));
    const diff = readFileSync(result.diffPath, 'utf8');
    assert.ok(diff.includes('POP migration timing'));
  });

  it('--scope=decisions --apply is surface-only (does not modify memory file)', () => {
    const filePath = join(tmpDir, '.arete/memory/items/decisions.md');
    const before = readFileSync(filePath, 'utf8');

    const { stdout, code, stderr } = runCliRaw(
      [
        'dedup',
        '--scope',
        'decisions',
        '--apply',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `unexpected exit: ${stderr}`);
    const result = JSON.parse(stdout) as {
      success: boolean;
      applied: boolean;
      summary: { groups: number };
    };
    assert.equal(result.success, true);
    assert.equal(result.applied, false, 'surface-only per AC10a');
    assert.equal(result.summary.groups, 1);

    // Memory file untouched.
    const after = readFileSync(filePath, 'utf8');
    assert.equal(after, before, 'decisions.md must not be modified');
  });
});

describe('arete dedup --explain (integration, AC7)', () => {
  let tmpDir: string;

  const CANON_ID = 'c8e3d2f1'.padEnd(64, '0');

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arete-dedup-explain-'));
    makeWorkspace(tmpDir);

    // One canonical with 3 source meetings + 3 textVariants + stakeholders.
    const file = {
      commitments: [
        {
          id: CANON_ID,
          text: 'Talk to Dave about staffing',
          direction: 'i_owe_them',
          personSlug: 'dave-wiedenheft',
          personName: 'Dave Wiedenheft',
          source: '2026-06-01-john-lindsay-11.md',
          date: '2026-06-01',
          createdAt: '2026-06-01T08:00:00Z',
          status: 'open',
          resolvedAt: null,
          stakeholders: [
            { slug: 'dave-wiedenheft', role: 'recipient' },
            { slug: 'lindsay-gray', role: 'mentioned' },
          ],
          source_meetings: [
            '2026-06-01-john-lindsay-11.md',
            '2026-06-02-glance-2-sync.md',
            '2026-06-03-pop-review.md',
          ],
          textVariants: [
            'Talk to Dave about staffing',
            'Going to chat with Dave on the staffing plan',
            'Need to discuss staffing with Dave',
          ],
        },
      ],
    };
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify(file, null, 2));

    // Decisions log with 2 merge entries pointing at the canonical.
    writeFile(
      tmpDir,
      'dev/diary/dedup-decisions.log',
      [
        `2026-06-02T15:42:01Z MERGE ai_0042 ${CANON_ID} 0.78 fast SAME same actor + Dave + staffing`,
        `2026-06-03T09:10:00Z MERGE ai_0050 ${CANON_ID} 1.00 - - text-hash exact match`,
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('prints provenance including all source meetings + log entries', () => {
    const { stdout, code, stderr } = runCliRaw(
      ['dedup', '--explain', 'c8e3d2f1'],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `unexpected exit: ${stderr}`);
    assert.match(stdout, /Canonical text: "Talk to Dave about staffing"/);
    assert.match(stdout, /@dave-wiedenheft \(recipient\)/);
    assert.match(stdout, /@lindsay-gray \(mentioned\)/);
    assert.match(stdout, /2026-06-02-glance-2-sync/);
    assert.match(stdout, /2026-06-03-pop-review/);
    assert.match(stdout, /Text variants observed \(3\/5 capacity\)/);
    assert.match(stdout, /Dedup decisions \(2 log entries\)/);
  });

  it('--json emits structured payload', () => {
    const { stdout, code } = runCliRaw(
      ['dedup', '--explain', 'c8e3d2f1', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 0);
    const result = JSON.parse(stdout) as {
      success: boolean;
      id: string;
      report: string;
    };
    assert.equal(result.success, true);
    assert.equal(result.id, CANON_ID);
    assert.match(result.report, /Talk to Dave about staffing/);
  });

  it('errors on unknown commitment id', () => {
    const { stdout, stderr, code } = runCliRaw(
      ['dedup', '--explain', 'deadbeef', '--json'],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0);
    assert.match(stdout + stderr, /No commitment matches/);
  });

  it('errors when --scope missing and --explain absent', () => {
    const { stdout, stderr, code } = runCliRaw(['dedup', '--json'], {
      cwd: tmpDir,
    });
    assert.notEqual(code, 0);
    assert.match(stdout + stderr, /Missing required option: --scope/);
  });
});
