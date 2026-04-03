import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { ReconciliationResult, ReconciledItem } from '@arete/core';
import {
  formatTierBadge,
  getReconciledItemText,
  displayReconciliationDetails,
  displayReconciledCompletedItems,
} from '../../src/lib/reconciliation-output.js';

// Strip ANSI codes for assertion comparisons
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[\d+m/g, '');
}

describe('formatTierBadge', () => {
  it('returns [HIGH] for high tier', () => {
    const badge = stripAnsi(formatTierBadge('high'));
    assert.equal(badge, '[HIGH]');
  });

  it('returns [NORMAL] for normal tier', () => {
    const badge = stripAnsi(formatTierBadge('normal'));
    assert.equal(badge, '[NORMAL]');
  });

  it('returns [LOW] for low tier', () => {
    const badge = stripAnsi(formatTierBadge('low'));
    assert.equal(badge, '[LOW]');
  });
});

describe('getReconciledItemText', () => {
  it('returns string directly for string items', () => {
    const item: ReconciledItem = {
      original: 'We decided to use TypeScript',
      type: 'decision',
      meetingPath: '/meetings/test.md',
      status: 'keep',
      relevanceScore: 0.8,
      relevanceTier: 'high',
      annotations: { why: 'keyword match' },
    };
    assert.equal(getReconciledItemText(item), 'We decided to use TypeScript');
  });

  it('returns description for action item objects', () => {
    const item: ReconciledItem = {
      original: {
        description: 'Send the proposal to client',
        ownerSlug: 'john',
        direction: 'i_owe_them',
      },
      type: 'action',
      meetingPath: '/meetings/test.md',
      status: 'keep',
      relevanceScore: 0.9,
      relevanceTier: 'high',
      annotations: { why: 'area match' },
    };
    assert.equal(getReconciledItemText(item), 'Send the proposal to client');
  });
});

describe('displayReconciliationDetails', () => {
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('displays tier badges on items', () => {
    const result: ReconciliationResult = {
      items: [
        {
          original: 'High priority task',
          type: 'decision',
          meetingPath: '/meetings/test.md',
          status: 'keep',
          relevanceScore: 0.9,
          relevanceTier: 'high',
          annotations: { why: 'area match' },
        },
        {
          original: 'Low priority item',
          type: 'learning',
          meetingPath: '/meetings/test.md',
          status: 'keep',
          relevanceScore: 0.2,
          relevanceTier: 'low',
          annotations: { why: 'no match' },
        },
      ],
      stats: { duplicatesRemoved: 0, completedMatched: 0, lowRelevanceCount: 1 },
    };

    displayReconciliationDetails(result, []);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('[HIGH]'), 'Should include HIGH badge');
    assert.ok(allOutput.includes('[LOW]'), 'Should include LOW badge');
    assert.ok(allOutput.includes('High priority task'), 'Should include item text');
    assert.ok(allOutput.includes('Low priority item'), 'Should include item text');
  });

  it('displays duplicate annotations', () => {
    const result: ReconciliationResult = {
      items: [
        {
          original: 'Some duplicated decision',
          type: 'decision',
          meetingPath: '/meetings/test.md',
          status: 'duplicate',
          relevanceScore: 0.5,
          relevanceTier: 'normal',
          annotations: { duplicateOf: 'meetings/other.md:decision', why: 'duplicate' },
        },
      ],
      stats: { duplicatesRemoved: 1, completedMatched: 0, lowRelevanceCount: 0 },
    };

    displayReconciliationDetails(result, []);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('Duplicate of: meetings/other.md:decision'), 'Should show duplicate source');
  });

  it('displays stats summary line', () => {
    const result: ReconciliationResult = {
      items: [
        {
          original: 'item',
          type: 'decision',
          meetingPath: '/meetings/test.md',
          status: 'duplicate',
          relevanceScore: 0.5,
          relevanceTier: 'normal',
          annotations: { duplicateOf: 'source', why: 'dup' },
        },
      ],
      stats: { duplicatesRemoved: 3, completedMatched: 2, lowRelevanceCount: 1 },
    };

    displayReconciliationDetails(result, []);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('Reconciliation: 3 duplicates, 2 completed, 1 low-relevance'), 'Should show stats summary');
  });

  it('displays completed annotation', () => {
    const result: ReconciliationResult = {
      items: [
        {
          original: { description: 'Finished task', ownerSlug: 'john', direction: 'i_owe_them' },
          type: 'action',
          meetingPath: '/meetings/test.md',
          status: 'completed',
          relevanceScore: 0.7,
          relevanceTier: 'normal',
          annotations: { completedOn: '2026-04-01', why: 'already done' },
        },
      ],
      stats: { duplicatesRemoved: 0, completedMatched: 1, lowRelevanceCount: 0 },
    };

    displayReconciliationDetails(result, []);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('Completed: 2026-04-01'), 'Should show completed annotation');
  });

  it('displays reconciled completed items section when provided', () => {
    const result: ReconciliationResult = {
      items: [{
        original: 'item',
        type: 'decision',
        meetingPath: '/m.md',
        status: 'duplicate',
        relevanceScore: 0.5,
        relevanceTier: 'normal',
        annotations: { duplicateOf: 'x', why: 'dup' },
      }],
      stats: { duplicatesRemoved: 1, completedMatched: 0, lowRelevanceCount: 0 },
    };

    displayReconciliationDetails(result, [
      { id: 'ai_001', matchedText: 'Send proposal' },
    ]);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('Reconciled Action Items'), 'Should show completed items header');
    assert.ok(allOutput.includes('ai_001: Already done'), 'Should show completed item');
  });

  it('truncates long item text at 60 chars', () => {
    const longText = 'A'.repeat(80);
    const result: ReconciliationResult = {
      items: [{
        original: longText,
        type: 'decision',
        meetingPath: '/m.md',
        status: 'keep',
        relevanceScore: 0.9,
        relevanceTier: 'high',
        annotations: { why: 'match' },
      }],
      stats: { duplicatesRemoved: 0, completedMatched: 0, lowRelevanceCount: 0 },
    };

    displayReconciliationDetails(result, []);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('...'), 'Should truncate with ellipsis');
    assert.ok(!allOutput.includes(longText), 'Should not include full 80-char text');
  });
});

describe('displayReconciledCompletedItems', () => {
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('displays each completed item with id and matched text', () => {
    displayReconciledCompletedItems([
      { id: 'ai_001', matchedText: 'Send proposal to client' },
      { id: 'ai_002', matchedText: 'Review PR #42' },
    ]);

    const allOutput = logs.map(stripAnsi).join('\n');
    assert.ok(allOutput.includes('Reconciled Action Items'), 'Should show header');
    assert.ok(allOutput.includes('ai_001: Already done (matched: "Send proposal to client")'));
    assert.ok(allOutput.includes('ai_002: Already done (matched: "Review PR #42")'));
  });
});
