/**
 * Phase 11 11a commitment-shape contract tests (Step 1).
 *
 * Narrow type-shape assertions for the Gmail-auto-resolve fields added to
 * `Commitment`:
 *   resolvedBy / resolvedEvidence / resolvedConfidence /
 *   unresolveSuppressedUntil / resolveStagedAt / confirmedAt
 *
 * These lock the contract so a refactor that drops a field (or makes one
 * required, breaking the open-commitment read path) fails loudly. Behavior
 * lives in commitment-resolution-pipeline tests.
 *
 * Pure type-shape — no I/O. Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { type Commitment } from '../../src/models/index.js';

// Mirror of PERMANENT_SUPPRESS_SENTINEL in commitment-resolution-pipeline.ts.
// Kept local so the Step-1 type-shape test has no Step-2 dependency; the
// pipeline test asserts the exported constant equals this literal.
const PERMANENT_SUPPRESS_SENTINEL = '2100-01-01T00:00:00.000Z';

describe('Commitment Phase 11 shape — Step 1 (11a)', () => {
  it('all Phase 11 fields are OPTIONAL (open commitment without them is assignable)', () => {
    const open: Commitment = {
      id: 'a'.repeat(64),
      text: 'Send Lindsay the deck',
      direction: 'i_owe_them',
      personSlug: 'lindsay-gray',
      personName: 'Lindsay Gray',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01',
      status: 'open',
      resolvedAt: null,
    };
    assert.equal(open.resolvedBy, undefined);
    assert.equal(open.resolvedEvidence, undefined);
    assert.equal(open.resolvedConfidence, undefined);
    assert.equal(open.unresolveSuppressedUntil, undefined);
    assert.equal(open.resolveStagedAt, undefined);
    assert.equal(open.confirmedAt, undefined);
  });

  it('auto-gmail HIGH resolution carries the full audit field set', () => {
    const resolved: Commitment = {
      id: 'b'.repeat(64),
      text: 'Send Lindsay the deck',
      direction: 'i_owe_them',
      personSlug: 'lindsay-gray',
      personName: 'Lindsay Gray',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01T09:00:00.000Z',
      status: 'resolved',
      resolvedAt: '2026-06-02T14:30:00.000Z',
      resolvedBy: 'auto-gmail',
      resolvedEvidence: 'https://mail.google.com/mail/u/0/#sent/thread-abc',
      resolvedConfidence: 'HIGH',
      source_external: [
        { kind: 'gmail', ref: 'thread-abc', url: 'https://mail.google.com/mail/u/0/#sent/thread-abc' },
      ],
    };
    assert.equal(resolved.resolvedBy, 'auto-gmail');
    assert.equal(resolved.resolvedConfidence, 'HIGH');
    assert.equal(resolved.source_external?.[0].kind, 'gmail');
  });

  it('week-1 staged commitment stays open with resolveStagedAt set, status untouched', () => {
    const staged: Commitment = {
      id: 'c'.repeat(64),
      text: 'Send Lindsay the deck',
      direction: 'i_owe_them',
      personSlug: 'lindsay-gray',
      personName: 'Lindsay Gray',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01',
      status: 'open', // CRITICAL: staging does NOT mutate status
      resolvedAt: null,
      resolveStagedAt: '2026-06-02T14:30:00.000Z',
      resolvedEvidence: 'https://mail.google.com/mail/u/0/#sent/thread-abc',
    };
    assert.equal(staged.status, 'open');
    assert.equal(staged.resolvedAt, null);
    assert.ok(staged.resolveStagedAt);
  });

  it('user-confirmed resolution carries confirmedAt for the 24h [[unconfirm]] window', () => {
    const confirmed: Commitment = {
      id: 'd'.repeat(64),
      text: 'Send Lindsay the deck',
      direction: 'i_owe_them',
      personSlug: 'lindsay-gray',
      personName: 'Lindsay Gray',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01',
      status: 'resolved',
      resolvedAt: '2026-06-03T10:00:00.000Z',
      resolvedBy: 'user',
      resolvedConfidence: 'HIGH',
      confirmedAt: '2026-06-03T10:00:00.000Z',
      resolvedEvidence: 'https://mail.google.com/mail/u/0/#sent/thread-abc',
    };
    assert.equal(confirmed.resolvedBy, 'user');
    assert.ok(confirmed.confirmedAt);
  });

  it('permanent-suppress sentinel is the far-future ISO date (AC6c)', () => {
    const suppressed: Commitment = {
      id: 'e'.repeat(64),
      text: 'Send Lindsay the deck',
      direction: 'i_owe_them',
      personSlug: 'lindsay-gray',
      personName: 'Lindsay Gray',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01',
      status: 'open',
      resolvedAt: null,
      unresolveSuppressedUntil: PERMANENT_SUPPRESS_SENTINEL,
      source_external: [{ kind: 'gmail', ref: 'thread-abc' }], // preserved across unresolve
    };
    assert.equal(suppressed.unresolveSuppressedUntil, PERMANENT_SUPPRESS_SENTINEL);
    assert.equal(suppressed.unresolveSuppressedUntil, '2100-01-01T00:00:00.000Z');
    // source_external preserved as audit trail even after unresolve.
    assert.equal(suppressed.source_external?.length, 1);
  });

  it('resolvedConfidence type permits HIGH and MEDIUM only', () => {
    const high: Commitment['resolvedConfidence'] = 'HIGH';
    const medium: Commitment['resolvedConfidence'] = 'MEDIUM';
    assert.equal(high, 'HIGH');
    assert.equal(medium, 'MEDIUM');
  });
});
