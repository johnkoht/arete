/**
 * Phase 10a v2 shape contract tests (Step 1).
 *
 * These tests are intentionally narrow: they assert that the **types** carry
 * the v2 fields and that a representative v1-shape value remains assignable
 * to the same `Commitment` type. Behavior of the migration / parser /
 * dedup pipeline lives in their own test files; here we just lock the
 * contract so a refactor that drops `stakeholders[]` or makes a v2 field
 * required (and thus break the v1 read path during the dry-run window)
 * fails loudly.
 *
 * Pure type-shape — no I/O. Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMITMENT_TEXT_VARIANTS_MAX,
  type Commitment,
  type Stakeholder,
  type ExternalSource,
  type CommitmentDirection,
} from '../../src/models/index.js';

describe('Commitment v2 shape — Step 1 (Phase 10a)', () => {
  it('Stakeholder has slug + role with all four roles', () => {
    const s1: Stakeholder = { slug: 'dave-wiedenheft', role: 'recipient' };
    const s2: Stakeholder = { slug: 'lindsay-gray', role: 'sender' };
    const s3: Stakeholder = { slug: 'anthony-avina', role: 'mentioned' };
    const s4: Stakeholder = { slug: 'john-koht', role: 'self' };
    // Exercise the values so the test is not just a compile-time assert.
    assert.equal(s1.role, 'recipient');
    assert.equal(s2.role, 'sender');
    assert.equal(s3.role, 'mentioned');
    assert.equal(s4.role, 'self');
  });

  it('CommitmentDirection includes the new "self" variant', () => {
    const d1: CommitmentDirection = 'i_owe_them';
    const d2: CommitmentDirection = 'they_owe_me';
    const d3: CommitmentDirection = 'self';
    assert.equal([d1, d2, d3].join(','), 'i_owe_them,they_owe_me,self');
  });

  it('v1-shape commitment (no v2 fields) is still assignable to Commitment', () => {
    // Mirrors the on-disk shape pre-migration: no stakeholders, no textVariants,
    // no source_meetings, no source_external. This is the dry-run window
    // tolerance that AC0a / AC1c rely on.
    const v1: Commitment = {
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
    assert.equal(v1.personSlug, 'lindsay-gray');
    assert.equal(v1.stakeholders, undefined);
    assert.equal(v1.source_meetings, undefined);
    assert.equal(v1.source_external, undefined);
    assert.equal(v1.textVariants, undefined);
  });

  it('v2-shape commitment carries all four new fields and remains assignable', () => {
    const external: ExternalSource = { kind: 'slack', ref: 'C123/p1234567890' };
    const v2: Commitment = {
      id: 'b'.repeat(64),
      text: 'Talk to Dave about staffing',
      direction: 'i_owe_them',
      personSlug: 'john-koht', // v1 field retained for backward compat
      personName: 'John Koht',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01T09:15:00.000Z',
      status: 'open',
      resolvedAt: null,
      stakeholders: [
        { slug: 'dave-wiedenheft', role: 'recipient' },
        { slug: 'lindsay-gray', role: 'mentioned' },
      ],
      source_meetings: [
        'meeting-2026-06-01.md',
        'meeting-2026-06-02.md',
      ],
      source_external: [external], // Phase 10a writes []; type allows non-empty for Phase 11.
      textVariants: [
        'Talk to Dave about staffing',
        'Going to chat with Dave on the staffing plan',
      ],
    };
    assert.equal(v2.stakeholders?.length, 2);
    assert.equal(v2.source_meetings?.length, 2);
    assert.equal(v2.source_external?.[0].kind, 'slack');
    assert.equal(v2.textVariants?.length, 2);
  });

  it('self-direction commitment carries owner-only stakeholders with role=self', () => {
    const note: Commitment = {
      id: 'c'.repeat(64),
      text: 'Note to self: prep for Dave review',
      direction: 'self',
      personSlug: 'john-koht',
      personName: 'John Koht',
      source: 'meeting-2026-06-01.md',
      date: '2026-06-01',
      createdAt: '2026-06-01',
      status: 'open',
      resolvedAt: null,
      stakeholders: [{ slug: 'john-koht', role: 'self' }],
      source_meetings: ['meeting-2026-06-01.md'],
      source_external: [],
      textVariants: ['Note to self: prep for Dave review'],
    };
    assert.equal(note.direction, 'self');
    assert.equal(note.stakeholders?.[0].role, 'self');
  });

  it('exports the textVariants cap constant matching the plan (5)', () => {
    assert.equal(COMMITMENT_TEXT_VARIANTS_MAX, 5);
  });
});
