/**
 * Tests for Phase 10b-aux Step 2 — `[[unmerge]]` directive parser + resolver.
 *
 * Covers (plan AC8):
 *  - parseUnmergeDirectives: format, unicode + ASCII arrow, whitespace
 *  - resolveUnmerge: dupe split out, canonical's source_meetings updated,
 *    original text restored from textVariants (Q7), UNMERGE log payload,
 *    no-canonical + nothing-to-split branches
 *
 * Pure module — NO LLM, NO production data writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseUnmergeDirectives,
  resolveUnmerge,
} from '../../src/services/unmerge-directives.js';
import type { Commitment } from '../../src/models/index.js';

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c8e3d2f1'.padEnd(64, '0'),
    text: 'Talk to Dave about staffing',
    direction: 'i_owe_them',
    personSlug: 'dave-wiedenheft',
    personName: 'Dave Wiedenheft',
    source: '2026-06-01-john-lindsay.md',
    date: '2026-06-01',
    createdAt: '2026-06-01T08:00:00Z',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

describe('parseUnmergeDirectives', () => {
  it('parses the canonical ← dupe format with unicode arrow', () => {
    const out = parseUnmergeDirectives(
      'wrong call? add [[unmerge: 0b3609e9 ← 09e356d0]] below.',
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].canonicalId, '0b3609e9');
    assert.equal(out[0].dupeId, '09e356d0');
  });

  it('accepts ASCII <- arrow and tolerant whitespace', () => {
    const out = parseUnmergeDirectives('[[unmerge:0b3609e9<-09e356d0]]');
    assert.equal(out.length, 1);
    assert.equal(out[0].canonicalId, '0b3609e9');
    assert.equal(out[0].dupeId, '09e356d0');
  });

  it('parses multiple directives in one view', () => {
    const out = parseUnmergeDirectives(
      `- [[unmerge: aaaa ← bbbb]]\n- [[unmerge: cccc <- dddd]]`,
    );
    assert.equal(out.length, 2);
  });

  it('ignores unrelated text', () => {
    assert.equal(parseUnmergeDirectives('no directives here').length, 0);
  });
});

describe('resolveUnmerge (AC8 — split dupe back out)', () => {
  const CANON = 'c8e3d2f1'.padEnd(64, '0');

  function mergedCanonical(): Commitment {
    return commitment({
      id: CANON,
      text: 'Talk to Dave about staffing',
      source: '2026-06-01-john-lindsay.md',
      source_meetings: [
        '2026-06-01-john-lindsay.md',
        '2026-06-02-glance-2-sync.md',
      ],
      textVariants: [
        'Talk to Dave about staffing',
        'Going to chat with Dave on the staffing plan',
      ],
    });
  }

  it('splits the dupe out with original text and updates the canonical', () => {
    const commitments = [mergedCanonical()];
    const res = resolveUnmerge(
      commitments,
      { canonicalId: 'c8e3d2f1', dupeId: '09e356d0', raw: '' },
      { newId: 'newdupe1'.padEnd(64, '0') },
    );
    assert.equal(res.status, 'resolved');
    if (res.status !== 'resolved') return;

    // New independent commitment with the ORIGINAL extracted wording (Q7).
    assert.equal(res.splitOut.text, 'Going to chat with Dave on the staffing plan');
    assert.deepEqual(res.splitOut.source_meetings, ['2026-06-02-glance-2-sync.md']);
    assert.equal(res.splitOut.status, 'open');
    assert.deepEqual(res.splitOut.textVariants, [
      'Going to chat with Dave on the staffing plan',
    ]);

    // Canonical no longer references the split source / variant.
    assert.deepEqual(res.canonical.source_meetings, ['2026-06-01-john-lindsay.md']);
    assert.deepEqual(res.canonical.textVariants, ['Talk to Dave about staffing']);

    // Commitment count grew by one.
    assert.equal(res.commitments.length, 2);

    // Log payload is an UNMERGE.
    assert.equal(res.logPayload.decision, 'UNMERGE');
    assert.equal(res.logPayload.canonicalId, 'c8e3d2f1');
  });

  it('honors an explicit dupeMeetingSlug', () => {
    const c = mergedCanonical();
    c.source_meetings = [
      '2026-06-01-john-lindsay.md',
      '2026-06-02-glance-2-sync.md',
      '2026-06-03-pop-review.md',
    ];
    const res = resolveUnmerge(
      [c],
      { canonicalId: 'c8e3d2f1', dupeId: 'x', raw: '' },
      { dupeMeetingSlug: '2026-06-02-glance-2-sync.md', newId: 'n'.repeat(64) },
    );
    assert.equal(res.status, 'resolved');
    if (res.status !== 'resolved') return;
    assert.deepEqual(res.splitOut.source_meetings, ['2026-06-02-glance-2-sync.md']);
    assert.ok(
      !(res.canonical.source_meetings ?? []).includes('2026-06-02-glance-2-sync.md'),
    );
  });

  it('returns no-canonical when the canonical id does not match', () => {
    const res = resolveUnmerge([mergedCanonical()], {
      canonicalId: 'deadbeef',
      dupeId: 'x',
      raw: '',
    });
    assert.equal(res.status, 'no-canonical');
  });

  it('returns nothing-to-split when canonical has a single source', () => {
    const lone = commitment({
      id: CANON,
      source_meetings: ['2026-06-01-john-lindsay.md'],
      textVariants: ['Talk to Dave about staffing'],
    });
    const res = resolveUnmerge([lone], {
      canonicalId: 'c8e3d2f1',
      dupeId: 'x',
      raw: '',
    });
    assert.equal(res.status, 'nothing-to-split');
  });

  it('does not mutate the input commitment list', () => {
    const commitments = [mergedCanonical()];
    const before = JSON.stringify(commitments);
    resolveUnmerge(
      commitments,
      { canonicalId: 'c8e3d2f1', dupeId: 'x', raw: '' },
      { newId: 'z'.repeat(64) },
    );
    assert.equal(JSON.stringify(commitments), before, 'input untouched');
  });
});
