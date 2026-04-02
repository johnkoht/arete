/**
 * Golden file tests for meeting reconciliation.
 *
 * These tests load fixture data from test-data/reconciliation/ and verify
 * that reconcileMeetingBatch produces the expected output. This catches
 * regressions in deduplication, completion matching, relevance scoring,
 * and annotation generation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  reconcileMeetingBatch,
  type MeetingExtractionBatch,
} from '../../src/services/meeting-reconciliation.js';
import type {
  ReconciliationContext,
  ReconciliationResult,
  ReconciledItem,
  AreaMemory,
} from '../../src/models/entities.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..');

function loadGoldenFile(scenario: string, filename: string): string {
  return readFileSync(
    resolve(repoRoot, 'test-data', 'reconciliation', scenario, filename),
    'utf8',
  );
}

/**
 * Load reconciliation context from JSON, converting areaMemories object to Map.
 */
function loadContext(scenario: string): ReconciliationContext {
  const raw = JSON.parse(loadGoldenFile(scenario, 'context.json'));
  const areaMemories = new Map<string, AreaMemory>();
  for (const [slug, memory] of Object.entries(raw.areaMemories)) {
    areaMemories.set(slug, memory as AreaMemory);
  }
  return {
    areaMemories,
    recentCommittedItems: raw.recentCommittedItems ?? [],
    completedTasks: raw.completedTasks ?? [],
  };
}

function loadInput(scenario: string): MeetingExtractionBatch[] {
  return JSON.parse(loadGoldenFile(scenario, 'input.json'));
}

type ExpectedResult = {
  items: Array<{
    type: string;
    meetingPath: string;
    status: string;
    relevanceScore: number;
    relevanceTier: string;
    annotations: {
      areaSlug?: string;
      personSlug?: string;
      duplicateOf?: string;
      completedOn?: string;
      why: string;
    };
  }>;
  stats: {
    duplicatesRemoved: number;
    completedMatched: number;
    lowRelevanceCount: number;
  };
};

function loadExpected(scenario: string): ExpectedResult {
  return JSON.parse(loadGoldenFile(scenario, 'expected.json'));
}

/**
 * Assert a reconciled item matches the expected golden output.
 * Checks structural fields and annotations without requiring original match.
 */
function assertItemMatches(
  actual: ReconciledItem,
  expected: ExpectedResult['items'][number],
  index: number,
): void {
  const prefix = `Item[${index}]`;

  assert.equal(actual.type, expected.type, `${prefix} type`);
  assert.equal(actual.meetingPath, expected.meetingPath, `${prefix} meetingPath`);
  assert.equal(actual.status, expected.status, `${prefix} status`);
  assert.equal(actual.relevanceScore, expected.relevanceScore, `${prefix} relevanceScore`);
  assert.equal(actual.relevanceTier, expected.relevanceTier, `${prefix} relevanceTier`);
  assert.equal(actual.annotations.why, expected.annotations.why, `${prefix} annotations.why`);

  if (expected.annotations.areaSlug !== undefined) {
    assert.equal(actual.annotations.areaSlug, expected.annotations.areaSlug, `${prefix} annotations.areaSlug`);
  }
  if (expected.annotations.personSlug !== undefined) {
    assert.equal(actual.annotations.personSlug, expected.annotations.personSlug, `${prefix} annotations.personSlug`);
  }
  if (expected.annotations.duplicateOf !== undefined) {
    assert.equal(actual.annotations.duplicateOf, expected.annotations.duplicateOf, `${prefix} annotations.duplicateOf`);
  }
  if (expected.annotations.completedOn !== undefined) {
    assert.equal(actual.annotations.completedOn, expected.annotations.completedOn, `${prefix} annotations.completedOn`);
  }
}

// ---------------------------------------------------------------------------
// Golden file tests
// ---------------------------------------------------------------------------

describe('reconciliation golden file tests', () => {
  describe('multi-meeting-batch: cross-meeting dedup and relevance scoring', () => {
    it('produces correct reconciliation for 3 meetings with duplicates', () => {
      const input = loadInput('multi-meeting-batch');
      const context = loadContext('multi-meeting-batch');
      const expected = loadExpected('multi-meeting-batch');

      const result = reconcileMeetingBatch(input, context);

      // Verify item count
      assert.equal(
        result.items.length,
        expected.items.length,
        `Expected ${expected.items.length} items, got ${result.items.length}`,
      );

      // Verify each item
      for (let i = 0; i < expected.items.length; i++) {
        assertItemMatches(result.items[i], expected.items[i], i);
      }
    });

    it('correctly identifies cross-meeting duplicates', () => {
      const input = loadInput('multi-meeting-batch');
      const context = loadContext('multi-meeting-batch');

      const result = reconcileMeetingBatch(input, context);

      const duplicates = result.items.filter((item) => item.status === 'duplicate');
      assert.equal(duplicates.length, 2, 'Should find 2 duplicates');

      // Both duplicates should reference the first meeting as canonical
      for (const dup of duplicates) {
        assert.ok(
          dup.annotations.duplicateOf?.startsWith('meetings/2026-03-25-product-sync.md'),
          `Duplicate should reference first meeting, got: ${dup.annotations.duplicateOf}`,
        );
      }
    });

    it('assigns correct relevance tiers based on area matching', () => {
      const input = loadInput('multi-meeting-batch');
      const context = loadContext('multi-meeting-batch');

      const result = reconcileMeetingBatch(input, context);

      // Carol's action item in platform-review should be high (area + keyword + person = 1.0)
      const carolItem = result.items.find(
        (item) => item.type === 'action' && item.meetingPath.includes('platform-review'),
      );
      assert.ok(carolItem, 'Should find Carol action item');
      assert.equal(carolItem.relevanceTier, 'high');
      assert.equal(carolItem.relevanceScore, 1.0);

      // Platform learning should also be high (area + keyword = 0.7)
      const platformLearning = result.items.find(
        (item) => item.type === 'learning' && item.meetingPath.includes('platform-review'),
      );
      assert.ok(platformLearning, 'Should find platform learning');
      assert.equal(platformLearning.relevanceTier, 'high');
      assert.equal(platformLearning.relevanceScore, 0.7);
    });

    it('produces correct stats', () => {
      const input = loadInput('multi-meeting-batch');
      const context = loadContext('multi-meeting-batch');
      const expected = loadExpected('multi-meeting-batch');

      const result = reconcileMeetingBatch(input, context);

      assert.deepStrictEqual(result.stats, expected.stats);
    });
  });

  describe('completion-match: completed tasks and memory dedup', () => {
    it('produces correct reconciliation for completion and memory matching', () => {
      const input = loadInput('completion-match');
      const context = loadContext('completion-match');
      const expected = loadExpected('completion-match');

      const result = reconcileMeetingBatch(input, context);

      // Verify item count
      assert.equal(
        result.items.length,
        expected.items.length,
        `Expected ${expected.items.length} items, got ${result.items.length}`,
      );

      // Verify each item
      for (let i = 0; i < expected.items.length; i++) {
        assertItemMatches(result.items[i], expected.items[i], i);
      }
    });

    it('marks item matching completed task with correct status and annotation', () => {
      const input = loadInput('completion-match');
      const context = loadContext('completion-match');

      const result = reconcileMeetingBatch(input, context);

      const completedItem = result.items.find((item) => item.status === 'completed');
      assert.ok(completedItem, 'Should find a completed item');
      assert.equal(completedItem.type, 'action');
      assert.equal(completedItem.annotations.completedOn, '2026-03-27');
    });

    it('marks item matching recent memory as duplicate with source reference', () => {
      const input = loadInput('completion-match');
      const context = loadContext('completion-match');

      const result = reconcileMeetingBatch(input, context);

      const memoryDup = result.items.find(
        (item) => item.status === 'duplicate' && item.type === 'decision',
      );
      assert.ok(memoryDup, 'Should find a memory-matched duplicate');
      assert.equal(memoryDup.annotations.duplicateOf, '.arete/memory/items/decisions.md');
      assert.ok(
        memoryDup.annotations.why.includes('Similar to:'),
        'Why annotation should reference the matched memory text',
      );
    });

    it('produces correct stats', () => {
      const input = loadInput('completion-match');
      const context = loadContext('completion-match');
      const expected = loadExpected('completion-match');

      const result = reconcileMeetingBatch(input, context);

      assert.deepStrictEqual(result.stats, expected.stats);
    });
  });
});
