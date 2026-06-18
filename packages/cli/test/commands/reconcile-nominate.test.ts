/**
 * CHR-W2 — `arete reconcile nominate` CLI smoke test.
 *
 * The mechanical logic is unit-tested in
 * packages/core/test/services/reconcile-nominate.test.ts (Layer 1); this
 * covers the CLI seam: ledger-file loading, lookback-batch merge with the
 * source_ref set-membership guard, JSON output shape, no writes.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

const DUP_TEXT = 'We decided to sunset Snapsheet by the end of the third quarter';

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('reconcile nominate (CHR-W2)', () => {
  let tmpDir: string;
  let meetingsDir: string;
  let ledgerPath: string;
  let priorPath: string;
  const yesterday = isoDay(-1);
  const today = isoDay(0);

  before(() => {
    tmpDir = createTmpDir('arete-reconcile-nominate');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    meetingsDir = join(tmpDir, 'resources', 'meetings');
    mkdirSync(meetingsDir, { recursive: true });

    priorPath = join(meetingsDir, `${yesterday}-planning.md`);
    writeFileSync(
      priorPath,
      [
        '---',
        'title: "Planning"',
        `date: "${yesterday}"`,
        'status: processed',
        '---',
        '',
        '## Staged Decisions',
        `- de_001: ${DUP_TEXT}`,
        '',
      ].join('\n'),
    );

    ledgerPath = join(tmpDir, 'ledger.json');
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        horizon: 'day',
        window: { target: today, lookback_days: 7 },
        entries: [
          {
            kind: 'extraction',
            source: 'meeting',
            source_ref: join(meetingsDir, `${today}-weekly.md`),
            item_id: 'de_001',
            item_type: 'decision',
            text: DUP_TEXT,
            tier: 'normal',
          },
          {
            kind: 'extraction',
            source: 'meeting',
            source_ref: join(meetingsDir, `${today}-weekly.md`),
            item_id: 'de_002',
            item_type: 'decision',
            text: 'Adopt the events gateway for all new vendor integrations',
            tier: 'high',
            supersedes: 'de_009',
          },
          {
            kind: 'open-thread',
            source: 'slack',
            source_ref: 'C01/p1716822720000',
            text: 'Anthony asked if the API spec is ready',
          },
        ],
      }),
    );
  });

  after(() => cleanupTmpDir(tmpDir));

  it('nominates the cross-day duplicate from the lookback batch + the supersedes claim', () => {
    const priorBefore = readFileSync(priorPath, 'utf8');
    const raw = runCli(['reconcile', 'nominate', '--ledger', ledgerPath, '--json'], { cwd: tmpDir });
    const out = JSON.parse(raw);
    assert.equal(out.success, true);
    assert.equal(out.batchEntries, 1, 'yesterday meeting loaded as batch context');
    assert.equal(out.ledgerEntries, 3);
    assert.equal(out.degraded, false);

    const dup = out.candidates.find((c: { kind: string }) => c.kind === 'duplicate');
    assert.ok(dup, 'cross-day duplicate nominated');
    assert.ok(dup.canonical.source_ref.endsWith(`${yesterday}-planning.md`), 'oldest is canonical');
    assert.equal(dup.duplicate.item_id, 'de_001');

    const claim = out.candidates.find((c: { kind: string }) => c.kind === 'claimed');
    assert.ok(claim, 'supersedes claim nominated for verification');
    assert.equal(claim.target, 'de_009');

    // Pure primitive: no writes.
    assert.equal(readFileSync(priorPath, 'utf8'), priorBefore, 'no file mutation');
  });

  it('AC-A4/N-4: a today-meeting whose on-disk file is also in the lookback window self-nominates ZERO duplicates', () => {
    // Pin the source_ref path-format footgun (LEARNINGS 2026-04-29, ledger
    // edition). The today meeting EXISTS on disk (so it's in the 7-day batch)
    // AND its extraction rows are in the ledger with source_ref == the exact
    // path storage.list emits. The set-membership guard (reconcile.ts:84-87)
    // must filter the on-disk copy out → NO self-duplicate against itself.
    const todayPath = join(meetingsDir, `${today}-selftest.md`);
    const SELF_TEXT = 'Migrate the billing service to the new events gateway this sprint';
    writeFileSync(
      todayPath,
      [
        '---',
        'title: "Self Test Weekly"',
        `date: "${today}"`,
        'status: processed',
        '---',
        '',
        '## Staged Decisions',
        `- de_050: ${SELF_TEXT}`,
        '',
      ].join('\n'),
    );

    // CRITICAL (the footgun this test pins): the ledger source_ref MUST be the
    // path EXACTLY as storage.list emits it. The FileStorageAdapter emits the
    // symlink-RESOLVED real path (on macOS /tmp → /private/tmp), so a raw
    // join(tmpDir, ...) would miss the strict-=== set-membership guard and the
    // on-disk copy WOULD self-nominate. realpathSync mirrors what the SKILL
    // prose must do (emit absolute, resolved paths).
    const listEmittedPath = realpathSync(todayPath);
    const selfLedger = join(tmpDir, 'self-ledger.json');
    writeFileSync(
      selfLedger,
      JSON.stringify({
        horizon: 'day',
        window: { target: today, lookback_days: 7 },
        entries: [
          {
            // source_ref EXACTLY as storage.list emits it (absolute, resolved).
            kind: 'extraction',
            source: 'meeting',
            source_ref: listEmittedPath,
            item_id: 'de_050',
            item_type: 'decision',
            text: SELF_TEXT,
            tier: 'normal',
          },
          {
            // Evidence row — must pass through UN-nominated (R3 judgment input).
            kind: 'commitment-outgoing',
            source: 'commitments',
            source_ref: 'commitment:abc123',
            text: SELF_TEXT, // same text, but evidence rows are never nominated
            evidence_pointer: 'Slack DM → Jamie, 2026-06-16',
          },
        ],
      }),
    );

    const out = JSON.parse(
      runCli(['reconcile', 'nominate', '--ledger', selfLedger, '--json'], { cwd: tmpDir }),
    );
    assert.equal(out.success, true);
    // The on-disk today meeting was FILTERED from the batch (its path is a
    // ledger extraction source_ref). batchEntries excludes it.
    const dupSelf = out.candidates.filter(
      (c: { kind: string; duplicate?: { item_id?: string } }) =>
        c.kind === 'duplicate' && c.duplicate?.item_id === 'de_050',
    );
    assert.equal(dupSelf.length, 0, 'today-meeting must NOT self-nominate against its on-disk copy');
    // No duplicate candidate at all between the extraction row and the evidence
    // row (evidence rows are never nominated even on identical text).
    assert.equal(
      out.candidates.filter((c: { kind: string }) => c.kind === 'duplicate').length,
      0,
      'evidence rows are pass-through; identical-text evidence does not nominate a duplicate',
    );
  });

  it('errors cleanly on a missing ledger file', () => {
    const { stdout, code } = runCliRaw(
      ['reconcile', 'nominate', '--ledger', join(tmpDir, 'nope.json'), '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const out = JSON.parse(stdout);
    assert.equal(out.success, false);
    assert.match(out.error, /not found/);
  });
});
