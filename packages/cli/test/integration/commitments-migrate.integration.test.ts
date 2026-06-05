/**
 * Phase 10a v2 CLI integration tests for `arete commitments migrate`
 * (Step 4 + Step 6).
 *
 * Exercises the CLI verb against a tmp workspace populated with a
 * synthetic v1 commitments.json + a minimal people/ directory.
 *
 * Tests:
 *   - --dry-run (default) produces migration-diff-YYYY-MM-DD.md and
 *     does NOT touch commitments.json.
 *   - --apply blocks within the 24h quiet-window (AC1h).
 *   - --apply with --force-after-triage proceeds even within 24h.
 *   - --apply blocks on ambiguous rows even with --force-after-triage.
 *   - --apply writes commitments.json + pre-migration snapshot on
 *     the happy path.
 *
 * **Critical**: this test uses a SYNTHETIC fixture in a tmp dir. It
 * does NOT touch arete-reserv data, and it does NOT make any LLM
 * calls.
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
  utimesSync,
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

function makeWorkspace(root: string, commitmentsJson: string): void {
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
  writeFile(root, '.arete/commitments.json', commitmentsJson);

  // Minimal people/ directory — only the slugs we reference.
  writeFile(
    root,
    'people/internal/john-koht.md',
    `---\nname: John Koht\nslug: john-koht\ncategory: internal\n---\nbody\n`,
  );
  writeFile(
    root,
    'people/internal/dave-wiedenheft.md',
    `---\nname: Dave Wiedenheft\nslug: dave-wiedenheft\ncategory: internal\n---\nbody\n`,
  );
  writeFile(
    root,
    'people/internal/lindsay-calar.md',
    `---\nname: Lindsay Calar\nslug: lindsay-calar\ncategory: internal\n---\nbody\n`,
  );
  writeFile(
    root,
    'people/internal/lindsay-gray.md',
    `---\nname: Lindsay Gray\nslug: lindsay-gray\ncategory: internal\n---\nbody\n`,
  );
}

function syntheticCommitments(): string {
  // Mini-fixture: one owner-twin pair, one ambiguous, one clean
  // arrow-notation row. Total = 4 rows; one collapses, one is
  // ambiguous (blocks apply), two pass through.
  const c = (overrides: Record<string, unknown>) => ({
    id: 'a'.repeat(64),
    text: 'placeholder',
    direction: 'i_owe_them',
    personSlug: 'someone',
    personName: 'Someone',
    source: 'meeting-x.md',
    date: '2026-05-01',
    createdAt: '2026-05-01',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  });
  const file = {
    commitments: [
      c({
        id: '01'.repeat(32),
        text: 'Talk to Dave about staffing',
        personSlug: 'john-koht',
        personName: 'John Koht',
        source: 'meeting-2026-05-01.md',
        date: '2026-05-01',
        createdAt: '2026-05-01',
      }),
      c({
        id: '02'.repeat(32),
        text: 'Talked to Dave about staffing',
        personSlug: 'john-koht',
        personName: 'John Koht',
        source: 'meeting-2026-05-05.md',
        date: '2026-05-05',
        createdAt: '2026-05-05',
      }),
      c({
        id: '03'.repeat(32),
        text: 'Deliver POP MVP plan to Lindsay',
        personSlug: 'john-koht',
        personName: 'John Koht',
        source: 'meeting-2026-05-10.md',
        date: '2026-05-10',
        createdAt: '2026-05-10',
      }),
      c({
        id: '04'.repeat(32),
        text: '[@john-koht → @dave-wiedenheft] Send FY25 deck',
        personSlug: 'dave-wiedenheft',
        personName: 'Dave Wiedenheft',
        source: 'slack-2026-05-12.md',
        date: '2026-05-12',
        createdAt: '2026-05-12',
      }),
    ],
  };
  return JSON.stringify(file, null, 2);
}

describe('arete commitments migrate --to-v2 (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'arete-migrate-'));
    makeWorkspace(tmpDir, syntheticCommitments());
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--dry-run produces a diff report and does NOT modify commitments.json', () => {
    const commitmentsPath = join(tmpDir, '.arete/commitments.json');
    const before = readFileSync(commitmentsPath, 'utf8');

    const { stdout, stderr, code } = runCliRaw(
      [
        'commitments',
        'migrate',
        '--to-v2',
        '--dry-run',
        '--owner-slug',
        'john-koht',
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
      summary: Record<string, number>;
      diffPath: string;
    };
    assert.equal(result.success, true);
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.summary.ambiguous, 1, 'lindsay row is ambiguous');
    assert.equal(result.summary.collapsed, 1, 'owner-twin pair collapses');
    assert.ok(existsSync(result.diffPath), 'diff report file exists');
    const diffContent = readFileSync(result.diffPath, 'utf8');
    assert.ok(diffContent.includes('Phase 10a migration diff — dry-run'));
    assert.ok(diffContent.includes('lindsay-calar'));
    assert.ok(diffContent.includes('lindsay-gray'));

    // commitments.json is untouched.
    const after = readFileSync(commitmentsPath, 'utf8');
    assert.equal(after, before, 'dry-run must NOT modify commitments.json');
  });

  it('--apply BLOCKS within the 24h quiet-window (AC1h)', () => {
    // The fresh workspace has commitments.json mtime = now; the gate
    // refuses --apply.
    const { stdout, stderr, code } = runCliRaw(
      [
        'commitments',
        'migrate',
        '--to-v2',
        '--apply',
        '--owner-slug',
        'john-koht',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0, 'apply must fail within 24h quiet window');
    const out = stdout + stderr;
    assert.match(out, /modified .* hours ago/);
  });

  it('--apply blocks on ambiguous rows even with --force-after-triage', () => {
    // Backdate commitments.json so the 24h gate passes.
    const commitmentsPath = join(tmpDir, '.arete/commitments.json');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(commitmentsPath, old, old);

    const { stdout, stderr, code } = runCliRaw(
      [
        'commitments',
        'migrate',
        '--to-v2',
        '--apply',
        '--force-after-triage',
        '--owner-slug',
        'john-koht',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.notEqual(code, 0, 'apply must fail when ambiguous rows present');
    const out = stdout + stderr;
    assert.match(out, /ambiguous row.* block/i);
  });

  it('--apply succeeds on the happy path (ambiguities sidecar-resolved + mtime > 24h)', () => {
    // Backdate commitments.json so the 24h gate passes.
    const commitmentsPath = join(tmpDir, '.arete/commitments.json');
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(commitmentsPath, old, old);

    // Resolve the Lindsay ambiguity via sidecar.
    writeFile(
      tmpDir,
      '.arete/commitments.pre-phase-10-ambiguities.json',
      JSON.stringify(
        {
          disambiguations: [
            {
              commitmentId: '03'.repeat(32),
              name: 'Lindsay',
              slug: 'lindsay-gray',
            },
          ],
        },
        null,
        2,
      ),
    );

    const { stdout, stderr, code } = runCliRaw(
      [
        'commitments',
        'migrate',
        '--to-v2',
        '--apply',
        '--owner-slug',
        'john-koht',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0, `apply must succeed: ${stderr}`);
    const result = JSON.parse(stdout) as {
      success: boolean;
      mode: string;
      summary: Record<string, number>;
      snapshotPath: string;
    };
    assert.equal(result.success, true);
    assert.equal(result.mode, 'apply');
    assert.equal(result.summary.ambiguous, 0);
    // Snapshot exists.
    assert.ok(existsSync(result.snapshotPath));
    // commitments.json now carries v2 fields.
    const after = JSON.parse(
      readFileSync(commitmentsPath, 'utf8'),
    ) as { commitments: Array<Record<string, unknown>> };
    assert.ok(after.commitments.length > 0);
    for (const c of after.commitments) {
      assert.ok(Array.isArray(c.stakeholders));
      assert.ok(Array.isArray(c.source_meetings));
      assert.deepEqual(c.source_external, []);
      assert.ok(Array.isArray(c.textVariants));
    }
  });

  it('empty commitments.json → no-op success', () => {
    writeFile(
      tmpDir,
      '.arete/commitments.json',
      JSON.stringify({ commitments: [] }),
    );
    const { code, stdout } = runCliRaw(
      [
        'commitments',
        'migrate',
        '--to-v2',
        '--dry-run',
        '--owner-slug',
        'john-koht',
        '--diff-dir',
        join(tmpDir, 'diffs'),
        '--json',
      ],
      { cwd: tmpDir },
    );
    assert.equal(code, 0);
    const result = JSON.parse(stdout) as { success: boolean; migrated?: number };
    assert.equal(result.success, true);
  });
});
