/**
 * Phase 11 11a Steps 3+4 — directive parser + mutator tests.
 *
 * Pure — no I/O. First-week confirm-gate flow, [[unconfirm]] 24h window,
 * [[unresolve]] suppress (14d + --permanent), promotion gate, bulk-reject.
 *
 * Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Commitment } from '../../src/models/index.js';
import {
  parseResolutionDirectives,
  stageResolve,
  autoResolve,
  applyConfirm,
  applyUnconfirm,
  applyUnresolve,
  evaluatePromotionGate,
  UNCONFIRM_WINDOW_HOURS,
  PROMOTION_WINDOW_DAYS,
} from '../../src/services/resolution-directives.js';
import { PERMANENT_SUPPRESS_SENTINEL } from '../../src/services/commitment-resolution-pipeline.js';

function commit(over: Partial<Commitment> = {}): Commitment {
  return {
    id: 'a'.repeat(64),
    text: 'Send Lindsay the deck',
    direction: 'i_owe_them',
    personSlug: 'lindsay-gray',
    personName: 'Lindsay Gray',
    source: 'm.md',
    date: '2026-06-01',
    createdAt: '2026-06-01',
    status: 'open',
    resolvedAt: null,
    ...over,
  };
}

const EV = { url: 'https://mail.google.com/mail/u/0/#sent/t1', threadId: 't1' };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('parseResolutionDirectives', () => {
  it('parses confirm / unconfirm / unresolve with id', () => {
    const { directives } = parseResolutionDirectives(
      'foo [[confirm abcd1234]] bar [[unconfirm abcd1234]] [[unresolve abcd1234]]',
    );
    assert.equal(directives.length, 3);
    assert.deepEqual(directives.map((d) => d.kind), ['confirm', 'unconfirm', 'unresolve']);
    assert.equal(directives.every((d) => d.id === 'abcd1234'), true);
  });

  it('parses --permanent only on unresolve', () => {
    const { directives } = parseResolutionDirectives('[[unresolve abcd1234 --permanent]]');
    assert.equal(directives[0].permanent, true);
  });

  it('--permanent on confirm is ignored (flag stripped, not permanent)', () => {
    const { directives } = parseResolutionDirectives('[[confirm abcd1234]]');
    assert.equal(directives[0].permanent, false);
  });

  it('rejects [[confirm-all-week-1]] bulk directive (F2)', () => {
    const { directives, rejectedBulk } = parseResolutionDirectives('[[confirm-all-week-1]]');
    assert.equal(directives.length, 0);
    assert.equal(rejectedBulk.length, 1);
    assert.match(rejectedBulk[0].message, /not supported/);
  });

  it('rejects bare [[confirm-all]] too', () => {
    const { rejectedBulk } = parseResolutionDirectives('[[confirm-all]]');
    assert.equal(rejectedBulk.length, 1);
  });
});

// ---------------------------------------------------------------------------
// stageResolve / autoResolve
// ---------------------------------------------------------------------------

describe('stageResolve (week-1) — AC2a', () => {
  it('sets resolveStagedAt + evidence but leaves status open', () => {
    const now = new Date('2026-06-03T15:00:00.000Z');
    const out = stageResolve(commit(), EV, now);
    assert.equal(out.status, 'open');
    assert.equal(out.resolvedAt, null);
    assert.equal(out.resolveStagedAt, now.toISOString());
    assert.equal(out.resolvedConfidence, 'HIGH');
    assert.equal(out.resolvedEvidence, EV.url);
    assert.equal(out.source_external?.[0].ref, 't1');
  });
});

describe('autoResolve (week-2+) — AC2', () => {
  it('mutates to resolved with auto-gmail audit trail', () => {
    const out = autoResolve(commit({ resolveStagedAt: '2026-06-02T00:00:00.000Z' }), {
      ...EV,
      sentAt: '2026-06-03T15:00:00.000Z',
    });
    assert.equal(out.status, 'resolved');
    assert.equal(out.resolvedBy, 'auto-gmail');
    assert.equal(out.resolvedConfidence, 'HIGH');
    assert.equal(out.resolvedAt, '2026-06-03T15:00:00.000Z');
    assert.equal(out.resolveStagedAt, undefined); // cleared
    assert.equal(out.source_external?.[0].kind, 'gmail');
  });
});

// ---------------------------------------------------------------------------
// confirm → user-resolve (AC7)
// ---------------------------------------------------------------------------

describe('applyConfirm — AC7', () => {
  it('staged → user-resolve with confirmedAt set', () => {
    const now = new Date('2026-06-04T10:00:00.000Z');
    const staged = stageResolve(commit(), EV, new Date('2026-06-03T00:00:00.000Z'));
    const res = applyConfirm(staged, now);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.status, 'resolved');
    assert.equal(res.commitment.resolvedBy, 'user');
    assert.equal(res.commitment.resolvedConfidence, 'HIGH');
    assert.equal(res.commitment.confirmedAt, now.toISOString());
    assert.equal(res.commitment.resolveStagedAt, undefined);
    assert.equal(res.commitment.resolvedEvidence, EV.url); // preserved
  });

  it('already user-resolved → no-op', () => {
    const res = applyConfirm(commit({ status: 'resolved', resolvedBy: 'user', confirmedAt: '2026-06-04T10:00:00.000Z' }));
    assert.equal(res.ok, false);
  });
});

// ---------------------------------------------------------------------------
// [[unconfirm]] 24h window (F2/AC2b)
// ---------------------------------------------------------------------------

describe('applyUnconfirm — 24h window (AC2b)', () => {
  it('within 24h → re-stages, clears confirm fields, preserves evidence', () => {
    const confirmedAt = '2026-06-04T10:00:00.000Z';
    const now = new Date('2026-06-04T20:00:00.000Z'); // +10h
    const c = commit({
      status: 'resolved', resolvedBy: 'user', resolvedConfidence: 'HIGH',
      resolvedAt: confirmedAt, confirmedAt, resolvedEvidence: EV.url,
      source_external: [{ kind: 'gmail', ref: 't1', url: EV.url }],
    });
    const res = applyUnconfirm(c, now);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.status, 'open');
    assert.equal(res.commitment.resolvedAt, null);
    assert.equal(res.commitment.confirmedAt, undefined);
    assert.equal(res.commitment.resolvedBy, undefined);
    assert.ok(res.commitment.resolveStagedAt); // re-staged
    assert.equal(res.commitment.resolvedEvidence, EV.url); // preserved
    assert.equal(res.commitment.source_external?.length, 1); // preserved
  });

  it('outside 24h → no-op + guidance', () => {
    const confirmedAt = '2026-06-04T10:00:00.000Z';
    const now = new Date('2026-06-05T11:00:00.000Z'); // +25h
    const c = commit({ status: 'resolved', resolvedBy: 'user', confirmedAt, resolvedAt: confirmedAt });
    const res = applyUnconfirm(c, now);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.reason, /unresolve/);
  });

  it('auto-gmail resolution → no-op (use unresolve)', () => {
    const c = commit({ status: 'resolved', resolvedBy: 'auto-gmail', resolvedAt: '2026-06-04T10:00:00.000Z' });
    const res = applyUnconfirm(c);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.reason, /unresolve/);
  });

  it('UNCONFIRM_WINDOW_HOURS is 24', () => {
    assert.equal(UNCONFIRM_WINDOW_HOURS, 24);
  });
});

// ---------------------------------------------------------------------------
// [[unresolve]] suppress (AC6 / AC6a / AC6c)
// ---------------------------------------------------------------------------

describe('applyUnresolve — suppress (AC6)', () => {
  it('auto-resolved → reopen + 14d suppress, evidence preserved', () => {
    const now = new Date('2026-06-05T00:00:00.000Z');
    const c = commit({
      status: 'resolved', resolvedBy: 'auto-gmail', resolvedConfidence: 'HIGH',
      resolvedAt: '2026-06-03T15:00:00.000Z', resolvedEvidence: EV.url,
      source_external: [{ kind: 'gmail', ref: 't1', url: EV.url }],
    });
    const res = applyUnresolve(c, { now });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.status, 'open');
    assert.equal(res.commitment.resolvedBy, undefined);
    assert.equal(res.commitment.resolvedAt, null);
    assert.equal(res.commitment.resolvedEvidence, EV.url); // PRESERVED (audit)
    assert.equal(res.commitment.source_external?.length, 1); // PRESERVED
    const until = new Date(res.commitment.unresolveSuppressedUntil!).getTime();
    assert.equal(until, now.getTime() + 14 * 86400000);
  });

  it('--permanent → 2100 sentinel (AC6c)', () => {
    const c = commit({ status: 'resolved', resolvedBy: 'auto-gmail', resolvedAt: '2026-06-03T00:00:00.000Z' });
    const res = applyUnresolve(c, { permanent: true });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.unresolveSuppressedUntil, PERMANENT_SUPPRESS_SENTINEL);
  });

  it('promoteToPermanent (M4 repeat) → 2100 sentinel even without --permanent', () => {
    const c = commit({ status: 'resolved', resolvedBy: 'auto-gmail', resolvedAt: '2026-06-03T00:00:00.000Z' });
    const res = applyUnresolve(c, { promoteToPermanent: true });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.unresolveSuppressedUntil, PERMANENT_SUPPRESS_SENTINEL);
  });

  it('week-1 staged → reopen + suppress (clears staging)', () => {
    const staged = stageResolve(commit(), EV, new Date('2026-06-03T00:00:00.000Z'));
    const res = applyUnresolve(staged, { now: new Date('2026-06-04T00:00:00.000Z') });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.commitment.resolveStagedAt, undefined);
    assert.ok(res.commitment.unresolveSuppressedUntil);
  });

  it('user-resolved → no-op + guidance (AC6a)', () => {
    const c = commit({ status: 'resolved', resolvedBy: 'user', resolvedAt: '2026-06-03T00:00:00.000Z' });
    const res = applyUnresolve(c);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.reason, /reopen|unconfirm/);
  });

  it('open un-staged commitment → no-op', () => {
    const res = applyUnresolve(commit());
    assert.equal(res.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Promotion gate (F2/AC2a)
// ---------------------------------------------------------------------------

describe('evaluatePromotionGate — F2 (BOTH conditions)', () => {
  it('before day 7 → confirm-gated', () => {
    const r = evaluatePromotionGate({ daysSinceShip: 5, unresolveCount: 0, confirmCount: 2 });
    assert.equal(r.promoted, false);
  });

  it('day 7, zero unresolve + zero confirm → NOT promoted (extend)', () => {
    const r = evaluatePromotionGate({ daysSinceShip: 7, unresolveCount: 0, confirmCount: 0 });
    assert.equal(r.promoted, false);
    assert.match(r.reason, /zero explicit/);
  });

  it('day 7, zero unresolve + >=1 confirm → PROMOTED', () => {
    const r = evaluatePromotionGate({ daysSinceShip: 7, unresolveCount: 0, confirmCount: 1 });
    assert.equal(r.promoted, true);
    assert.equal(r.mode, 'auto-mutate');
  });

  it('day 7, >=1 unresolve → NOT promoted even with confirms', () => {
    const r = evaluatePromotionGate({ daysSinceShip: 9, unresolveCount: 1, confirmCount: 3 });
    assert.equal(r.promoted, false);
  });

  it('explicit promote statement substitutes for confirm engagement', () => {
    const r = evaluatePromotionGate({ daysSinceShip: 8, unresolveCount: 0, confirmCount: 0, explicitPromote: true });
    assert.equal(r.promoted, true);
  });

  it('PROMOTION_WINDOW_DAYS is 7', () => {
    assert.equal(PROMOTION_WINDOW_DAYS, 7);
  });
});
