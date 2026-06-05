/**
 * Tests for Phase 10b-aux Step 3 — dedup decision surfacing in winddown.
 *
 * Covers (plan AC8a / AC4a):
 *  - filterLogByDate scopes to a single ISO day
 *  - formatDedupedTodaySection lists MERGE rows with inline [[unmerge]] hints
 *  - formatPossiblyMergeableSection lists UNCERTAIN rows
 *  - log with 3 MERGE + 1 UNCERTAIN → both sections correct
 *  - empty inputs → empty strings (sections omitted)
 *
 * Pure module — NO LLM, NO production data writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDedupLog } from '../../src/services/dedup-explain.js';
import {
  filterLogByDate,
  formatDedupedTodaySection,
  formatPossiblyMergeableSection,
  formatDedupWinddownSections,
} from '../../src/services/dedup-winddown-surface.js';

const CANON = 'c8e3d2f1abc';

// 3 MERGE + 1 UNCERTAIN, all on 2026-06-03, plus a stray prior-day NEW.
const LOG = parseDedupLog(
  [
    `2026-06-02T23:59:00Z NEW ai_0001 - - - - prior day`,
    `2026-06-03T15:42:01Z MERGE ai_0042 ${CANON} 0.78 fast SAME same actor + Dave`,
    `2026-06-03T15:42:05Z MERGE ai_0043 e94f1aaa 0.91 fast SAME deck to Lindsay`,
    `2026-06-03T15:42:09Z MERGE ai_0050 ${CANON} 1.00 - - text-hash exact match`,
    `2026-06-03T15:42:12Z UNCERTAIN ai_0044 b22f1ccc 0.62 fast UNCERTAIN ambiguous staffing ref`,
  ].join('\n'),
);

describe('filterLogByDate', () => {
  it('scopes to the requested ISO date', () => {
    const today = filterLogByDate(LOG, '2026-06-03');
    assert.equal(today.length, 4); // 3 MERGE + 1 UNCERTAIN
    assert.ok(today.every((e) => e.iso.startsWith('2026-06-03')));
  });
});

describe('formatDedupedTodaySection (AC8a)', () => {
  it('lists 3 merges with inline [[unmerge]] hints', () => {
    const today = filterLogByDate(LOG, '2026-06-03');
    const out = formatDedupedTodaySection(today);
    assert.match(out, /### Deduped today \(3 merges\)/);
    // Each merge row + its unmerge hint.
    assert.match(out, /merged ai_0042 → canonical c8e3d2f1/);
    assert.match(out, /\[\[unmerge: c8e3d2f1 ← ai_0042\]\]/);
    assert.match(out, /merged ai_0043 → canonical e94f1aaa/);
    assert.match(out, /\[\[unmerge: e94f1aaa ← ai_0043\]\]/);
    // text-hash merge renders the exact-match note.
    assert.match(out, /exact text-hash match/);
    // 3 unmerge hints total.
    assert.equal((out.match(/\[\[unmerge:/g) ?? []).length, 3);
  });

  it('returns empty string when no merges', () => {
    const onlyUncertain = parseDedupLog(
      '2026-06-03T00:00:00Z UNCERTAIN ai_1 c1 0.6 fast UNCERTAIN x',
    );
    assert.equal(formatDedupedTodaySection(onlyUncertain), '');
  });
});

describe('formatPossiblyMergeableSection (AC4a)', () => {
  it('lists the single UNCERTAIN pair', () => {
    const today = filterLogByDate(LOG, '2026-06-03');
    const out = formatPossiblyMergeableSection(today);
    assert.match(out, /### Possibly mergeable \(1 pair — your call\)/);
    assert.match(out, /ai_0044 may be the same as canonical b22f1ccc/);
    assert.match(out, /UNCERTAIN/);
  });

  it('returns empty string when no uncertain rows', () => {
    const onlyMerge = parseDedupLog(
      '2026-06-03T00:00:00Z MERGE ai_1 c1 0.9 fast SAME x',
    );
    assert.equal(formatPossiblyMergeableSection(onlyMerge), '');
  });
});

describe('formatDedupWinddownSections (combined, scoped to today)', () => {
  it('renders both sections for 3 MERGE + 1 UNCERTAIN', () => {
    const out = formatDedupWinddownSections(LOG, '2026-06-03');
    assert.match(out, /### Deduped today \(3 merges\)/);
    assert.match(out, /### Possibly mergeable \(1 pair — your call\)/);
    // prior-day NEW row is excluded.
    assert.ok(!out.includes('ai_0001'));
  });

  it('returns empty string when the day has no dedup activity', () => {
    assert.equal(formatDedupWinddownSections(LOG, '2026-06-10'), '');
  });
});
