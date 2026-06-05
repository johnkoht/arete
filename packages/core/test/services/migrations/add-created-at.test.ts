/**
 * Tests for the createdAt backfill migration (phase-10a-pre AC0).
 *
 * Synthetic in-memory fixtures only — the module under test is pure, so
 * there is no filesystem coupling. The behaviors covered:
 *
 *  - Missing-field rows are backfilled with the `date` sentinel.
 *  - Rows that already carry `createdAt` are untouched (idempotency).
 *  - The serialize → migrate → migrate chain is a fixed point.
 *  - Empty / malformed JSON does not throw.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Commitment } from '../../../src/models/index.js';
import {
  applyAddCreatedAt,
  migrateAddCreatedAt,
  parseCommitmentsFile,
  serializeCommitmentsFile,
} from '../../../src/services/migrations/add-created-at.js';

/**
 * Build a "legacy" commitment — no `createdAt` field. Returned as a partial
 * cast so we can faithfully exercise the migration's job of healing
 * pre-existing rows; production code does NOT construct rows like this.
 */
function legacyCommitment(overrides: Partial<Commitment> = {}): Commitment {
  const base = {
    id: 'a'.repeat(64),
    text: 'Send the slides',
    direction: 'i_owe_them' as const,
    personSlug: 'alice',
    personName: 'Alice Smith',
    source: 'meeting-2026-01-15.md',
    date: '2026-01-15',
    status: 'open' as const,
    resolvedAt: null,
    ...overrides,
  };
  // Cast: pre-migration rows lack `createdAt` by definition. This is the
  // shape the migration is designed to repair.
  return base as Commitment;
}

describe('applyAddCreatedAt — backfill sentinel from `date`', () => {
  it('fills missing createdAt with the entry date (sentinel format)', () => {
    const input = [
      legacyCommitment({ id: 'aa'.repeat(32), date: '2026-01-15' }),
      legacyCommitment({ id: 'bb'.repeat(32), date: '2026-02-01' }),
    ];

    const { commitments, report } = applyAddCreatedAt(input);

    assert.equal(report.total, 2);
    assert.equal(report.backfilled, 2);
    assert.equal(report.alreadyPresent, 0);
    assert.equal(commitments[0].createdAt, '2026-01-15');
    assert.equal(commitments[1].createdAt, '2026-02-01');
  });

  it('does not mutate the input array (returns a new list)', () => {
    const input = [legacyCommitment({ id: 'cc'.repeat(32), date: '2026-03-01' })];
    const before = JSON.stringify(input);
    applyAddCreatedAt(input);
    assert.equal(JSON.stringify(input), before, 'input array was mutated');
  });

  it('leaves rows with an existing createdAt untouched', () => {
    const c: Commitment = {
      ...legacyCommitment({ id: 'dd'.repeat(32), date: '2026-03-01' }),
      createdAt: '2026-03-01T08:30:00.000Z',
    };

    const { commitments, report } = applyAddCreatedAt([c]);

    assert.equal(report.alreadyPresent, 1);
    assert.equal(report.backfilled, 0);
    assert.equal(commitments[0].createdAt, '2026-03-01T08:30:00.000Z');
  });

  it('treats empty-string createdAt as missing (defensive)', () => {
    const c = legacyCommitment({ id: 'ee'.repeat(32), date: '2026-04-04' });
    // Force-empty value through the cast — simulates a corrupt write.
    (c as Commitment & { createdAt?: string }).createdAt = '';

    const { commitments, report } = applyAddCreatedAt([c]);

    assert.equal(report.backfilled, 1);
    assert.equal(commitments[0].createdAt, '2026-04-04');
  });

  it('reports per-entry details in input order', () => {
    const a = legacyCommitment({ id: 'aa'.repeat(32), date: '2026-01-15' });
    const b: Commitment = {
      ...legacyCommitment({ id: 'bb'.repeat(32), date: '2026-02-01' }),
      createdAt: '2026-02-01T12:00:00.000Z',
    };

    const { report } = applyAddCreatedAt([a, b]);

    assert.equal(report.entries.length, 2);
    assert.equal(report.entries[0].id, a.id);
    assert.equal(report.entries[0].backfilled, true);
    assert.equal(report.entries[1].id, b.id);
    assert.equal(report.entries[1].backfilled, false);
  });
});

describe('migrateAddCreatedAt — JSON round-trip + idempotency', () => {
  it('round-trips JSON: legacy file → backfilled file', () => {
    const raw = serializeCommitmentsFile([
      legacyCommitment({ id: 'aa'.repeat(32), date: '2026-01-15' }),
      legacyCommitment({ id: 'bb'.repeat(32), date: '2026-02-01' }),
    ]);

    const { json, report } = migrateAddCreatedAt(raw);
    const parsed = parseCommitmentsFile(json);

    assert.equal(report.backfilled, 2);
    assert.equal(parsed[0].createdAt, '2026-01-15');
    assert.equal(parsed[1].createdAt, '2026-02-01');
  });

  it('is idempotent: second run is a no-op (zero backfills, identical JSON)', () => {
    const raw = serializeCommitmentsFile([
      legacyCommitment({ id: 'aa'.repeat(32), date: '2026-01-15' }),
    ]);

    const first = migrateAddCreatedAt(raw);
    const second = migrateAddCreatedAt(first.json);

    assert.equal(first.report.backfilled, 1);
    assert.equal(second.report.backfilled, 0);
    assert.equal(second.report.alreadyPresent, 1);
    assert.equal(first.json, second.json, 'serialized output should be byte-equal on re-run');
  });

  it('handles null/empty input gracefully (fresh workspace)', () => {
    const a = migrateAddCreatedAt(null);
    const b = migrateAddCreatedAt('');
    const c = migrateAddCreatedAt('{ this is not json }');

    for (const result of [a, b, c]) {
      assert.equal(result.report.total, 0);
      assert.equal(result.report.backfilled, 0);
      assert.equal(parseCommitmentsFile(result.json).length, 0);
    }
  });

  it('preserves all non-createdAt fields verbatim', () => {
    const original = legacyCommitment({
      id: 'ff'.repeat(32),
      text: 'Talk to Dave about staffing',
      direction: 'they_owe_me',
      personSlug: 'dave-wiedenheft',
      personName: 'Dave Wiedenheft',
      source: 'meeting-x.md',
      date: '2026-05-12',
      status: 'open',
      resolvedAt: null,
      area: 'platform',
    });

    const { commitments } = applyAddCreatedAt([original]);
    const out = commitments[0];

    assert.equal(out.id, original.id);
    assert.equal(out.text, original.text);
    assert.equal(out.direction, original.direction);
    assert.equal(out.personSlug, original.personSlug);
    assert.equal(out.personName, original.personName);
    assert.equal(out.source, original.source);
    assert.equal(out.date, original.date);
    assert.equal(out.status, original.status);
    assert.equal(out.resolvedAt, original.resolvedAt);
    assert.equal(out.area, original.area);
    assert.equal(out.createdAt, original.date, 'sentinel uses date value');
  });
});
