import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import type {
  ReconciliationResult,
  ReconciledItem,
  ReconciliationActionItem,
} from '@arete/core';
import {
  formatReconciledItemLine,
  formatReconciliationResult,
  displayReconciliationResult,
} from '../../src/lib/reconciliation-output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActionItem(overrides: Partial<ReconciliationActionItem> = {}): ReconciliationActionItem {
  return {
    owner: 'John',
    ownerSlug: 'john',
    description: 'Send API docs',
    direction: 'i_owe_them',
    counterpartySlug: 'sarah',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ReconciledItem> = {}): ReconciledItem {
  return {
    original: makeActionItem(),
    type: 'action',
    meetingPath: 'meetings/2026-04-01.md',
    status: 'keep',
    relevanceScore: 0.9,
    relevanceTier: 'high',
    annotations: { why: 'relevant' },
    ...overrides,
  };
}

function makeResult(
  items: ReconciledItem[],
  stats?: Partial<ReconciliationResult['stats']>,
): ReconciliationResult {
  return {
    items,
    stats: {
      duplicatesRemoved: 0,
      completedMatched: 0,
      lowRelevanceCount: 0,
      ...stats,
    },
  };
}

/** Strip ANSI color codes for easier assertion */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// ---------------------------------------------------------------------------
// formatReconciledItemLine
// ---------------------------------------------------------------------------

describe('formatReconciledItemLine', () => {
  it('formats a high-relevance action item with owner and counterparty', () => {
    const item = makeItem({
      relevanceTier: 'high',
      original: makeActionItem({ ownerSlug: 'john', counterpartySlug: 'sarah', description: 'Send API docs', direction: 'i_owe_them' }),
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\[HIGH\]/);
    assert.match(line, /@john → @sarah/);
    assert.match(line, /Send API docs/);
  });

  it('formats they_owe_me direction with ← arrow', () => {
    const item = makeItem({
      original: makeActionItem({ direction: 'they_owe_me', ownerSlug: 'sarah', counterpartySlug: 'john' }),
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /@sarah ← @john/);
  });

  it('omits counterparty when not present', () => {
    const item = makeItem({
      original: makeActionItem({ counterpartySlug: undefined }),
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\[@john\]/);
    assert.ok(!line.includes('→'));
  });

  it('includes area annotation when present', () => {
    const item = makeItem({
      annotations: { areaSlug: 'communications', why: 'relevant' },
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\(area: communications\)/);
  });

  it('includes project annotation when area is absent', () => {
    const item = makeItem({
      annotations: { projectSlug: 'alpha', why: 'relevant' },
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\(project: alpha\)/);
  });

  it('prefers area over project annotation', () => {
    const item = makeItem({
      annotations: { areaSlug: 'comms', projectSlug: 'alpha', why: 'both' },
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\(area: comms\)/);
    assert.ok(!line.includes('project:'));
  });

  it('formats a string original (decision/learning) without owner prefix', () => {
    const item = makeItem({
      original: 'Use Jaccard for deduplication',
      type: 'decision',
      relevanceTier: 'normal',
    });

    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\[NORMAL\]/);
    assert.match(line, /Use Jaccard for deduplication/);
    assert.ok(!line.includes('@'));
  });

  it('formats low-relevance tier', () => {
    const item = makeItem({ relevanceTier: 'low' });
    const line = stripAnsi(formatReconciledItemLine(item));
    assert.match(line, /\[LOW\]/);
  });
});

// ---------------------------------------------------------------------------
// formatReconciliationResult
// ---------------------------------------------------------------------------

describe('formatReconciliationResult', () => {
  it('groups items by tier in HIGH, NORMAL, LOW order', () => {
    const items = [
      makeItem({ relevanceTier: 'low', original: 'low item' }),
      makeItem({ relevanceTier: 'high', original: makeActionItem({ description: 'high item' }) }),
      makeItem({ relevanceTier: 'normal', original: 'normal item' }),
    ];

    const output = stripAnsi(formatReconciliationResult(makeResult(items)));
    const highIdx = output.indexOf('HIGH Relevance');
    const normalIdx = output.indexOf('NORMAL Relevance');
    const lowIdx = output.indexOf('LOW Relevance');

    assert.ok(highIdx < normalIdx, 'HIGH should come before NORMAL');
    assert.ok(normalIdx < lowIdx, 'NORMAL should come before LOW');
  });

  it('excludes non-keep items from main output', () => {
    const items = [
      makeItem({ status: 'keep', original: 'visible' }),
      makeItem({ status: 'duplicate', original: 'hidden-dup' }),
      makeItem({ status: 'completed', original: 'hidden-done' }),
    ];

    const output = stripAnsi(formatReconciliationResult(makeResult(items)));
    assert.match(output, /visible/);
    assert.ok(!output.includes('hidden-dup'));
    assert.ok(!output.includes('hidden-done'));
  });

  it('shows correct counts in header', () => {
    const items = [
      makeItem({ status: 'keep' }),
      makeItem({ status: 'duplicate' }),
      makeItem({ status: 'completed' }),
      makeItem({ status: 'duplicate' }),
    ];

    const output = stripAnsi(formatReconciliationResult(makeResult(items)));
    assert.match(output, /1 shown, 3 filtered/);
  });

  it('includes stats summary with all stat types', () => {
    const result = makeResult(
      [makeItem()],
      { duplicatesRemoved: 8, completedMatched: 5, lowRelevanceCount: 12 },
    );

    const output = stripAnsi(formatReconciliationResult(result));
    assert.match(output, /8 duplicates/);
    assert.match(output, /12 low-relevance/);
    assert.match(output, /5 completed/);
  });

  it('omits zero-count stats', () => {
    const result = makeResult(
      [makeItem()],
      { duplicatesRemoved: 3, completedMatched: 0, lowRelevanceCount: 0 },
    );

    const output = stripAnsi(formatReconciliationResult(result));
    assert.match(output, /3 duplicates/);
    assert.ok(!output.includes('completed'));
    assert.ok(!output.includes('low-relevance'));
  });

  it('shows fallback when all stats are zero', () => {
    const result = makeResult([makeItem()]);
    const output = stripAnsi(formatReconciliationResult(result));
    assert.match(output, /all items shown/);
  });

  it('handles empty kept items gracefully', () => {
    const result = makeResult(
      [makeItem({ status: 'duplicate' })],
      { duplicatesRemoved: 1 },
    );

    const output = stripAnsi(formatReconciliationResult(result));
    assert.match(output, /0 shown, 1 filtered/);
    assert.match(output, /No items to show/);
  });

  it('skips tiers with no items', () => {
    const items = [makeItem({ relevanceTier: 'high' })];
    const output = stripAnsi(formatReconciliationResult(makeResult(items)));
    assert.match(output, /HIGH Relevance/);
    assert.ok(!output.includes('NORMAL Relevance'));
    assert.ok(!output.includes('LOW Relevance'));
  });
});

// ---------------------------------------------------------------------------
// displayReconciliationResult
// ---------------------------------------------------------------------------

describe('displayReconciliationResult', () => {
  it('uses injected log function', () => {
    const messages: string[] = [];
    const log = (msg: string) => messages.push(msg);

    const result = makeResult([makeItem()]);
    displayReconciliationResult(result, { log });

    assert.ok(messages.length > 0, 'should have called log');
    assert.match(stripAnsi(messages[0]), /Staged Items/);
  });
});
