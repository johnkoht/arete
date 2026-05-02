/**
 * Phase 0 instrumentation — integration tests for the item-fate writer
 * triggered at `arete meeting approve` (the most reliable end-to-end path
 * that writes fate=approved events without needing live LLM extraction).
 *
 * Skipped/dismissed fates ride along the `arete meeting extract --stage`
 * path, which requires AI configuration. AC0.3 verification for those
 * fates relies on the unit-tested pure helpers
 * (`buildSkippedItemFateEvents`, `buildDismissedItemFateEvents`); the
 * end-to-end smoke for the approved path lives here.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

const PROCESSED_MEETING = `---
title: "Sprint Review"
date: "2026-03-15"
status: processed
processed_at: "2026-03-15T10:00:00.000Z"
importance: normal
staged_item_status:
  ai_001: pending
  ai_002: pending
  de_001: pending
  le_001: pending
staged_item_source:
  ai_001: ai
  ai_002: ai
  de_001: ai
  le_001: ai
staged_item_confidence:
  ai_001: 0.91
  ai_002: 0.78
  de_001: 0.95
  le_001: 0.7
---

# Sprint Review

## Summary
Sprint review covering Q1 progress and next steps.

## Staged Action Items
- ai_001: [@john-doe →] Follow up with design team
- ai_002: [@jane-smith ← @john-doe] Review PR by end of week

## Staged Decisions
- de_001: Adopt TypeScript for all new services

## Staged Learnings
- le_001: Integration tests catch more bugs than unit tests

## Transcript
John: Let's review the sprint...
`;

interface FateRecord {
  type: string;
  ts: string;
  item_text: string;
  item_kind: 'action_item' | 'decision' | 'learning';
  source_path: string;
  fate: 'approved' | 'dismissed' | 'skipped' | 'deferred';
  reason: string | null;
  confidence: number | null;
  importance_at_extraction: string | null;
}

function readFates(workspaceRoot: string): FateRecord[] {
  const path = join(workspaceRoot, '.arete', 'memory', 'item-fates.jsonl');
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  return content
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as FateRecord);
}

describe('item-fate instrumentation — meeting approve', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-item-fate');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    mkdirSync(join(tmpDir, 'resources', 'meetings'), { recursive: true });
    mkdirSync(join(tmpDir, '.arete', 'memory', 'items'), { recursive: true });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('writes one fate=approved event per committed item (AC0.3 approved path)', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    runCli(
      [
        'meeting',
        'approve',
        '2026-03-15-sprint-review',
        '--all',
        '--skip-qmd',
        '--skip-topics',
        '--json',
      ],
      { cwd: tmpDir },
    );

    const fates = readFates(tmpDir);
    assert.strictEqual(fates.length, 4, 'one fate per approved item (2 actions + 1 decision + 1 learning)');

    for (const fate of fates) {
      assert.strictEqual(fate.type, 'item_fate');
      assert.strictEqual(fate.fate, 'approved');
      assert.strictEqual(fate.reason, null);
      assert.strictEqual(fate.importance_at_extraction, 'normal');
      assert.match(fate.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.ok(fate.source_path.endsWith('2026-03-15-sprint-review.md'));
    }

    const kinds = fates.map((f) => f.item_kind).sort();
    assert.deepStrictEqual(kinds, ['action_item', 'action_item', 'decision', 'learning']);

    const decision = fates.find((f) => f.item_kind === 'decision');
    assert.ok(decision);
    assert.strictEqual(decision.confidence, 0.95);
    assert.match(decision.item_text, /Adopt TypeScript/);

    const learning = fates.find((f) => f.item_kind === 'learning');
    assert.ok(learning);
    assert.strictEqual(learning.confidence, 0.7);
  });

  it('emits no fates for items that were not approved', () => {
    writeFileSync(
      join(tmpDir, 'resources', 'meetings', '2026-03-15-sprint-review.md'),
      PROCESSED_MEETING,
      'utf8',
    );

    runCli(
      [
        'meeting',
        'approve',
        '2026-03-15-sprint-review',
        '--items',
        'de_001',
        '--skip-qmd',
        '--skip-topics',
        '--json',
      ],
      { cwd: tmpDir },
    );

    const fates = readFates(tmpDir);
    assert.strictEqual(fates.length, 1);
    assert.strictEqual(fates[0].item_kind, 'decision');
    assert.strictEqual(fates[0].fate, 'approved');
  });
});
