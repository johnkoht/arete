/**
 * Tests for the Phase 8 Rule 4 counterparty set-overlap helper (phase-10a-pre).
 *
 * Covers:
 *  - AC0a dual-shape read: works on v1 (personSlug) AND v2 (stakeholders[])
 *  - AC12 set-overlap behavior: zero, partial, full, multi-counterparty
 *  - M2 (pre-mortem) self-exclusion: role='self' is filtered before overlap
 *  - Edge cases: empty inputs, deduplication, attendee set membership
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCounterpartyOverlap,
  getCommitmentCounterpartySlugs,
  type CommitmentLike,
} from '../../src/services/commitments.js';

describe('getCommitmentCounterpartySlugs — dual-shape read (AC0a)', () => {
  it('reads stakeholders[] when present (v2 shape)', () => {
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'dave' }, { slug: 'lindsay', role: 'mentioned' }],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave', 'lindsay']);
  });

  it('falls back to personSlug when stakeholders is undefined (v1 shape)', () => {
    const c: CommitmentLike = { personSlug: 'dave' };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave']);
  });

  it('prefers stakeholders[] over personSlug when both present', () => {
    // Owner-as-personSlug case: legacy personSlug='john-koht', but the
    // post-migration stakeholders[] field is the authoritative source.
    const c: CommitmentLike = {
      personSlug: 'john-koht',
      stakeholders: [{ slug: 'dave', role: 'recipient' }],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave']);
  });

  it('returns empty set when neither stakeholders nor personSlug present', () => {
    const c: CommitmentLike = {};
    assert.deepEqual(getCommitmentCounterpartySlugs(c), []);
  });

  it('falls back to personSlug when stakeholders is an empty array', () => {
    // The code treats `stakeholders[].length === 0` the same as
    // `stakeholders == null` and falls through to the personSlug branch.
    // This documents the actual behavior (an earlier name claimed
    // "no fallback to personSlug" which contradicted the assertion).
    // If the intended semantics ever change to "empty array = explicit
    // no-counterparties signal," update BOTH the code (in
    // `getCommitmentCounterpartySlugs`) and this test.
    const c: CommitmentLike = { stakeholders: [], personSlug: 'dave' };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave']);
  });

  it('deduplicates repeated slugs in stakeholders[]', () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'dave', role: 'recipient' },
        { slug: 'dave', role: 'mentioned' },
      ],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave']);
  });

  it('preserves source order for stable snapshots', () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'zeta' },
        { slug: 'alpha' },
        { slug: 'mike' },
      ],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['zeta', 'alpha', 'mike']);
  });
});

describe('getCommitmentCounterpartySlugs — M2 self-exclusion', () => {
  it("filters out role='self' entries", () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'john-koht', role: 'self' },
        { slug: 'dave', role: 'recipient' },
      ],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), ['dave']);
  });

  it("returns empty when stakeholders[] is all role='self' (self-reminder)", () => {
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'john-koht', role: 'self' }],
    };
    assert.deepEqual(getCommitmentCounterpartySlugs(c), []);
  });

  it("does NOT filter when role is omitted or non-'self'", () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'dave' }, // no role
        { slug: 'lindsay', role: 'recipient' },
        { slug: 'anthony', role: 'mentioned' },
      ],
    };
    assert.deepEqual(
      getCommitmentCounterpartySlugs(c),
      ['dave', 'lindsay', 'anthony'],
    );
  });
});

describe('computeCounterpartyOverlap — AC12 set-overlap behaviors', () => {
  it('returns 0 when overlap is empty', () => {
    const c: CommitmentLike = { stakeholders: [{ slug: 'dave' }] };
    assert.equal(computeCounterpartyOverlap(c, ['jamie', 'greg']), 0);
  });

  it('returns 1 for single-attendee overlap', () => {
    // AC12 plan example: stakeholders [lindsay, anthony] vs attendees [lindsay, jamie]
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'lindsay' }, { slug: 'anthony' }],
    };
    assert.equal(computeCounterpartyOverlap(c, ['lindsay', 'jamie']), 1);
  });

  it('returns count = N for N-way overlap', () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'dave' },
        { slug: 'lindsay' },
        { slug: 'anthony' },
      ],
    };
    assert.equal(
      computeCounterpartyOverlap(c, ['dave', 'lindsay', 'jamie', 'anthony']),
      3,
    );
  });

  it('returns 0 when attendees list is empty', () => {
    const c: CommitmentLike = { stakeholders: [{ slug: 'dave' }] };
    assert.equal(computeCounterpartyOverlap(c, []), 0);
  });

  it('returns 0 when commitment has no counterparties', () => {
    const c: CommitmentLike = {};
    assert.equal(computeCounterpartyOverlap(c, ['dave']), 0);
  });

  it('v1-shape: personSlug match against attendees', () => {
    // Pre-migration commitment — only personSlug is set.
    const c: CommitmentLike = { personSlug: 'dave' };
    assert.equal(computeCounterpartyOverlap(c, ['dave', 'jamie']), 1);
    assert.equal(computeCounterpartyOverlap(c, ['lindsay', 'jamie']), 0);
  });

  it("v2-shape: self-reminder does NOT overlap with attendees containing owner (M2)", () => {
    // Pre-mortem M2: a self-reminder commitment must not match a recurring
    // meeting just because the owner is on the attendee list.
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'john-koht', role: 'self' }],
    };
    assert.equal(
      computeCounterpartyOverlap(c, ['john-koht', 'lindsay']),
      0,
      'self-stakeholder must be excluded from overlap calc',
    );
  });

  it("v2-shape: mixed self + non-self stakeholders only count non-self overlap", () => {
    const c: CommitmentLike = {
      stakeholders: [
        { slug: 'john-koht', role: 'self' },
        { slug: 'dave', role: 'recipient' },
      ],
    };
    // Attendees include both owner AND dave → only dave counts.
    assert.equal(computeCounterpartyOverlap(c, ['john-koht', 'dave']), 1);
  });

  it('attendee duplicates do not inflate overlap (set semantics)', () => {
    const c: CommitmentLike = { stakeholders: [{ slug: 'dave' }] };
    // Attendees list with duplicate slugs (shouldn't happen in practice
    // but the helper must be defensive — set semantics).
    assert.equal(computeCounterpartyOverlap(c, ['dave', 'dave']), 1);
  });
});

describe('computeCounterpartyOverlap — Phase 10 plan AC12 fixtures', () => {
  // Direct port of the plan's AC12 unit-test specification:
  //   commitment stakeholders [lindsay, anthony]  +  attendees [lindsay, jamie] → overlap = 1
  //   commitment stakeholders [lindsay, anthony]  +  attendees [jamie, greg]    → overlap = 0
  it('plan example 1: positive overlap fires R4 gate', () => {
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'lindsay' }, { slug: 'anthony' }],
    };
    const overlap = computeCounterpartyOverlap(c, ['lindsay', 'jamie']);
    assert.equal(overlap, 1, 'R4 should fire — lindsay overlaps');
  });

  it('plan example 2: zero overlap, R4 does NOT fire', () => {
    const c: CommitmentLike = {
      stakeholders: [{ slug: 'lindsay' }, { slug: 'anthony' }],
    };
    const overlap = computeCounterpartyOverlap(c, ['jamie', 'greg']);
    assert.equal(overlap, 0, 'R4 should NOT fire — no overlap');
  });
});
