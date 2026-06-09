/**
 * Phase 11 11a Step 6 — ordering guard tests (G1/AC8/M2).
 *
 * Pure — no I/O. Runs under `tsx --test`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideResolutionOrdering } from '../../src/services/resolution-ordering.js';

describe('decideResolutionOrdering — AC8', () => {
  it('already-committed id (not staged) → auto-resolve path', () => {
    const d = decideResolutionOrdering('abcd1234', new Set(), 't1');
    assert.equal(d.path, 'auto-resolve');
  });

  it('still-staged id → defer-to-followup-2 with gmail evidence (M2)', () => {
    const d = decideResolutionOrdering('ai_0042', new Set(['ai_0042']), 't1');
    assert.equal(d.path, 'defer-to-followup-2');
    if (d.path !== 'defer-to-followup-2') return;
    assert.equal(d.multiSourceEvidence, 'gmail:t1');
  });

  it('M2 multi-source: appends +gmail:<id> to existing evidence', () => {
    const d = decideResolutionOrdering('ai_0042', new Set(['ai_0042']), 't1', 'slack-dm');
    assert.equal(d.path, 'defer-to-followup-2');
    if (d.path !== 'defer-to-followup-2') return;
    assert.equal(d.multiSourceEvidence, 'slack-dm+gmail:t1');
  });

  it('prefix-tolerant: 8-char staged id matches 64-char commitment id', () => {
    const d = decideResolutionOrdering('abcd1234' + 'f'.repeat(56), new Set(['abcd1234']), 't1');
    assert.equal(d.path, 'defer-to-followup-2');
  });

  it('NEVER both: a staged item never gets the auto-resolve path', () => {
    const staged = new Set(['ai_0042']);
    const d = decideResolutionOrdering('ai_0042', staged, 't1');
    assert.notEqual(d.path, 'auto-resolve');
  });
});
