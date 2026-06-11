/**
 * CHR-W0 — `arete meeting reconcile-day` (day-level cross-meeting reconcile).
 *
 * Covers:
 * - duplicate of a prior-day staged item → today's copy flips to visible
 *   skipped/reconciled with a skip_reason (NO silent merge)
 * - user decisions win: approved items untouched
 * - idempotency: re-run applies nothing new
 * - extract-side gating: reconcile_mode: day-level defers inline reconcile
 *
 * Runs with ARETE_NO_LLM=1 — the day-level batchLLMReview degrades
 * gracefully (mechanical reconcile only), which is also what we assert.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const DUP_DECISION = 'We decided to adopt PostgreSQL over MongoDB for the claims store';
const FRESH_LEARNING = 'Batch processing reduces error rates by forty percent in imports';
const APPROVED_ACTION = 'John to send the API documentation bundle to Sarah by Friday';

function meetingFile(opts: {
  title: string;
  date: string;
  status: string;
  actionItems?: Array<{ id: string; text: string; status?: string }>;
  decisions?: Array<{ id: string; text: string }>;
  learnings?: Array<{ id: string; text: string }>;
}): string {
  const statusEntries = [
    ...(opts.actionItems ?? []).map((i) => [i.id, i.status ?? 'pending'] as const),
    ...(opts.decisions ?? []).map((i) => [i.id, 'pending'] as const),
    ...(opts.learnings ?? []).map((i) => [i.id, 'pending'] as const),
  ];
  const lines = [
    '---',
    `title: "${opts.title}"`,
    `date: "${opts.date}"`,
    `status: ${opts.status}`,
    'staged_item_status:',
    ...statusEntries.map(([id, st]) => `  ${id}: ${st}`),
    '---',
    '',
    '## Summary',
    'Things happened.',
    '',
  ];
  if (opts.actionItems?.length) {
    lines.push('## Staged Action Items');
    for (const i of opts.actionItems) lines.push(`- ${i.id}: ${i.text}`);
    lines.push('');
  }
  if (opts.decisions?.length) {
    lines.push('## Staged Decisions');
    for (const i of opts.decisions) lines.push(`- ${i.id}: ${i.text}`);
    lines.push('');
  }
  if (opts.learnings?.length) {
    lines.push('## Staged Learnings');
    for (const i of opts.learnings) lines.push(`- ${i.id}: ${i.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

describe('meeting reconcile-day (CHR-W0)', () => {
  let tmpDir: string;
  let meetingsDir: string;
  const today = isoDay(0);
  const yesterday = isoDay(-1);
  const env = { ARETE_NO_LLM: '1' };

  before(() => {
    tmpDir = createTmpDir('arete-reconcile-day');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });

    // Yesterday: canonical occurrence of the duplicate decision.
    writeFileSync(
      join(meetingsDir, `${yesterday}-planning-sync.md`),
      meetingFile({
        title: 'Planning Sync',
        date: yesterday,
        status: 'processed',
        decisions: [{ id: 'de_001', text: DUP_DECISION }],
      }),
    );

    // Today: re-staged duplicate + a fresh learning + an APPROVED action.
    writeFileSync(
      join(meetingsDir, `${today}-weekly-review.md`),
      meetingFile({
        title: 'Weekly Review',
        date: today,
        status: 'processed',
        actionItems: [{ id: 'ai_001', text: APPROVED_ACTION, status: 'approved' }],
        decisions: [{ id: 'de_001', text: DUP_DECISION }],
        learnings: [{ id: 'le_001', text: FRESH_LEARNING }],
      }),
    );

    // day-level mode in workspace config.
    appendFileSync(join(tmpDir, 'arete.yaml'), '\nreconcile_mode: day-level\n');
  });

  after(() => cleanupTmpDir(tmpDir));

  it('flips today\'s duplicate to visible skipped/reconciled with skip_reason; fresh + approved untouched', () => {
    const raw = runCli(['meeting', 'reconcile-day', '--date', today, '--json'], { cwd: tmpDir, env });
    const out = JSON.parse(raw);
    assert.equal(out.success, true);
    assert.equal(out.dayMeetings, 1);
    assert.ok(out.stats.duplicatesRemoved >= 1, 'mechanical duplicate detected');
    assert.ok(out.applied.some((a: { id: string }) => a.id === 'de_001'), 'duplicate applied to today');

    const content = readFileSync(join(meetingsDir, `${today}-weekly-review.md`), 'utf8');
    assert.match(content, /de_001:\s*skipped/);
    assert.match(content, /ai_001:\s*approved/, 'user-approved item untouched');
    assert.match(content, /le_001:\s*pending/, 'fresh learning untouched');
    assert.match(content, /staged_item_skip_reason/, 'visible provenance written');
    assert.match(content, /day-level reconcile/);
    // The staged body line survives (visible skip, not deletion — no silent merge).
    assert.ok(content.includes(DUP_DECISION));

    // Yesterday's canonical untouched.
    const prior = readFileSync(join(meetingsDir, `${yesterday}-planning-sync.md`), 'utf8');
    assert.doesNotMatch(prior, /skipped/);
  });

  it('is idempotent: re-run applies nothing new (user/prior decisions win)', () => {
    const raw = runCli(['meeting', 'reconcile-day', '--date', today, '--json'], { cwd: tmpDir, env });
    const out = JSON.parse(raw);
    assert.equal(out.success, true);
    assert.equal(out.applied.length, 0, 're-run must not re-apply');
    assert.ok(
      out.preservedUserDecisions.some((p: { id: string }) => p.id === 'de_001'),
      'already-skipped item reported as preserved',
    );
  });

  it('reports cleanly when the date has no processed meetings', () => {
    const raw = runCli(['meeting', 'reconcile-day', '--date', '2020-01-01', '--json'], { cwd: tmpDir, env });
    const out = JSON.parse(raw);
    assert.equal(out.success, true);
    assert.equal(out.dayMeetings, 0);
  });
});

// ---------------------------------------------------------------------------
// Review fix (should-fix 3) — dry-run fidelity: a dry-run must run the same
// staged-line matching + user-decision checks as a real run (read-only) so a
// clean dry-run actually predicts a clean real run (the flip rule trusts it).
// ---------------------------------------------------------------------------

describe('meeting reconcile-day --dry-run fidelity (review should-fix 3)', () => {
  let tmpDir: string;
  let meetingsDir: string;
  const today = isoDay(0);
  const yesterday = isoDay(-1);
  const env = { ARETE_NO_LLM: '1' };

  const DUP_A = 'We decided to adopt PostgreSQL over MongoDB for the claims store';
  const DUP_B = 'We decided to standardize on TypeScript for all new services';
  const DUP_DRIFT = 'We decided to sunset the legacy reporting dashboard this quarter';

  before(() => {
    tmpDir = createTmpDir('arete-reconcile-day-dryrun');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });

    // Yesterday: canonical occurrences of all three decisions.
    writeFileSync(
      join(meetingsDir, `${yesterday}-planning-sync.md`),
      meetingFile({
        title: 'Planning Sync',
        date: yesterday,
        status: 'processed',
        decisions: [
          { id: 'de_001', text: DUP_A },
          { id: 'de_002', text: DUP_B },
          { id: 'de_003', text: DUP_DRIFT },
        ],
      }),
    );

    // Today, file 1: a pending duplicate (de_001) + a user-APPROVED duplicate
    // (de_002 — must surface as preservedUserDecisions, never applied).
    writeFileSync(
      join(meetingsDir, `${today}-weekly-review.md`),
      meetingFile({
        title: 'Weekly Review',
        date: today,
        status: 'processed',
        decisions: [
          { id: 'de_001', text: DUP_A },
          { id: 'de_002', text: DUP_B },
        ],
      }),
    );
    // Approve de_002 (meetingFile writes all staged ids as pending).
    const wr = join(meetingsDir, `${today}-weekly-review.md`);
    writeFileSync(wr, readFileSync(wr, 'utf8').replace('de_002: pending', 'de_002: approved'));

    // Today, file 2: the duplicate lives in an APPROVED body section (Format
    // B), so applyToFile's staged-line matching finds no `- de_NNN:` line —
    // the text-drift / `unmatched` case.
    writeFileSync(
      join(meetingsDir, `${today}-design-sync.md`),
      [
        '---',
        'title: "Design Sync"',
        `date: "${today}"`,
        'status: approved',
        '---',
        '',
        '## Approved Decisions',
        `- ${DUP_DRIFT}`,
        '',
      ].join('\n'),
    );

    appendFileSync(join(tmpDir, 'arete.yaml'), '\nreconcile_mode: day-level\n');
  });

  after(() => cleanupTmpDir(tmpDir));

  it('dry-run reports real ids, preserved user decisions, and the same unmatched set as a real run', () => {
    const file1 = join(meetingsDir, `${today}-weekly-review.md`);
    const file2 = join(meetingsDir, `${today}-design-sync.md`);
    const before1 = readFileSync(file1, 'utf8');
    const before2 = readFileSync(file2, 'utf8');

    // 1. Dry-run: full prediction, zero writes.
    const dry = JSON.parse(
      runCli(['meeting', 'reconcile-day', '--date', today, '--dry-run', '--json'], { cwd: tmpDir, env }),
    );
    assert.equal(dry.success, true);
    assert.equal(dry.dryRun, true);
    assert.equal(readFileSync(file1, 'utf8'), before1, 'dry-run must not modify files');
    assert.equal(readFileSync(file2, 'utf8'), before2, 'dry-run must not modify files');

    // Real staged-line matching ran: real id, no '(dry-run)' placeholders.
    assert.ok(
      dry.applied.some((a: { id: string; text: string }) => a.id === 'de_001' && a.text === DUP_A),
      `dry-run applied must carry the real staged id; got ${JSON.stringify(dry.applied)}`,
    );
    assert.ok(
      !dry.applied.some((a: { id: string }) => a.id === '(dry-run)'),
      'no (dry-run) placeholder ids',
    );
    // User-decision check ran: the approved duplicate is preserved, not applied.
    assert.ok(
      dry.preservedUserDecisions.some((p: { id: string; priorStatus: string }) => p.id === 'de_002' && p.priorStatus === 'approved'),
      `approved duplicate must be reported preserved; got ${JSON.stringify(dry.preservedUserDecisions)}`,
    );
    assert.ok(!dry.applied.some((a: { id: string }) => a.id === 'de_002'));
    // Text drift surfaced: the Format-B duplicate has no staged line.
    assert.ok(
      dry.unmatched.some((u: { text: string }) => u.text === DUP_DRIFT),
      `drifted item must be reported unmatched; got ${JSON.stringify(dry.unmatched)}`,
    );

    // 2. Real run on the same state: identical prediction.
    const real = JSON.parse(
      runCli(['meeting', 'reconcile-day', '--date', today, '--json'], { cwd: tmpDir, env }),
    );
    assert.equal(real.success, true);
    const key = (x: { file?: string; id?: string; text?: string }) => `${x.file ?? ''}|${x.id ?? ''}|${x.text ?? ''}`;
    assert.deepEqual(
      dry.unmatched.map(key).sort(),
      real.unmatched.map(key).sort(),
      'dry-run unmatched set must equal the real run\'s',
    );
    assert.deepEqual(
      dry.applied.map(key).sort(),
      real.applied.map(key).sort(),
      'dry-run applied set must equal the real run\'s',
    );
    assert.deepEqual(
      dry.preservedUserDecisions.map(key).sort(),
      real.preservedUserDecisions.map(key).sort(),
      'dry-run preserved set must equal the real run\'s',
    );
  });
});
