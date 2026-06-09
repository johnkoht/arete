/**
 * Tests for Phase 10b-min Step 6 — dedup-decisions audit log writer.
 *
 * Covers:
 *  - sanitizeReasoning
 *  - renderDedupDecisionLine column layout
 *  - payloadFromExtractDecision mapping (MERGE/NEW/UNCERTAIN)
 *  - appendDedupDecisionLog filesystem round-trip (temp dir)
 *  - appendDedupDecisionLogBatch ordering preserves item order
 *  - best-effort: bad dir does not throw
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  sanitizeReasoning,
  renderDedupDecisionLine,
  payloadFromExtractDecision,
  appendDedupDecisionLog,
  appendDedupDecisionLogBatch,
} from '../../src/services/dedup-decisions-log.js';
import type { ExtractDedupDecision } from '../../src/services/commitment-dedup-extract.js';

// ---------------------------------------------------------------------------
// sanitizeReasoning
// ---------------------------------------------------------------------------

describe('sanitizeReasoning', () => {
  it('collapses newlines', () => {
    assert.equal(sanitizeReasoning('foo\nbar\nbaz'), 'foo bar baz');
  });
  it('collapses runs of whitespace', () => {
    assert.equal(sanitizeReasoning('foo   bar'), 'foo bar');
  });
  it('trims surrounding whitespace', () => {
    assert.equal(sanitizeReasoning('  foo  '), 'foo');
  });
});

// ---------------------------------------------------------------------------
// renderDedupDecisionLine
// ---------------------------------------------------------------------------

describe('renderDedupDecisionLine', () => {
  it('renders MERGE shape with 2-decimal Jaccard', () => {
    const line = renderDedupDecisionLine('2026-06-01T10:00:00Z', {
      decision: 'MERGE',
      newId: 'ai_001',
      canonicalId: 'canon_42',
      jaccard: 0.7833,
      llmTier: 'fast',
      llmDecision: 'SAME',
      reasoning: 'same actor + Dave + staffing context',
    });
    assert.equal(
      line,
      '2026-06-01T10:00:00Z MERGE ai_001 canon_42 0.78 fast SAME same actor + Dave + staffing context',
    );
  });

  it('renders NEW shape with dashes for unused columns', () => {
    const line = renderDedupDecisionLine('2026-06-01T10:00:00Z', {
      decision: 'NEW',
      newId: 'ai_002',
      canonicalId: '-',
      jaccard: '-',
      llmTier: '-',
      llmDecision: '-',
      reasoning: 'no hybrid candidates',
    });
    assert.equal(
      line,
      '2026-06-01T10:00:00Z NEW ai_002 - - - - no hybrid candidates',
    );
  });

  it('strips newlines from multi-line reasoning', () => {
    const line = renderDedupDecisionLine('2026-06-01T10:00:00Z', {
      decision: 'UNCERTAIN',
      newId: 'ai_003',
      canonicalId: 'canon_5',
      jaccard: 0.62,
      llmTier: 'fast',
      llmDecision: 'UNCERTAIN',
      reasoning: 'timing window\nambiguous\non both',
    });
    assert.ok(!line.includes('\n'));
    assert.match(line, /timing window ambiguous on both$/);
  });

  // I-6: dupe→source provenance segment (TAB-delimited, base64 text)
  it('appends a TAB-delimited provenance segment when dupeSourceMeeting + dupeText present', () => {
    const line = renderDedupDecisionLine('2026-06-01T10:00:00Z', {
      decision: 'MERGE',
      newId: 'ai_007',
      canonicalId: 'canon_9',
      jaccard: 0.91,
      llmTier: 'fast',
      llmDecision: 'SAME',
      reasoning: 'same action',
      dupeSourceMeeting: '2026-05-30-staffing-sync',
      dupeText: 'follow up with Dave on headcount',
    });
    const tabIdx = line.indexOf('\t');
    assert.notEqual(tabIdx, -1, 'should contain a TAB');
    const prefix = line.slice(0, tabIdx);
    assert.equal(
      prefix,
      '2026-06-01T10:00:00Z MERGE ai_007 canon_9 0.91 fast SAME same action',
    );
    const [src, b64] = line.slice(tabIdx + 1).split('\t');
    assert.equal(src, '2026-05-30-staffing-sync');
    assert.equal(
      Buffer.from(b64, 'base64').toString('utf8'),
      'follow up with Dave on headcount',
    );
  });

  it('omits the provenance segment when only one of the two fields is present', () => {
    const line = renderDedupDecisionLine('2026-06-01T10:00:00Z', {
      decision: 'MERGE',
      newId: 'ai_008',
      canonicalId: 'canon_9',
      jaccard: 0.5,
      llmTier: '-',
      llmDecision: '-',
      reasoning: 'text-hash exact match',
      dupeSourceMeeting: '2026-05-30-staffing-sync',
      // dupeText omitted
    });
    assert.ok(!line.includes('\t'), 'half-record must not emit a TAB segment');
  });
});

// ---------------------------------------------------------------------------
// payloadFromExtractDecision
// ---------------------------------------------------------------------------

describe('payloadFromExtractDecision', () => {
  function mk(outcome: ExtractDedupDecision['outcome']): ExtractDedupDecision {
    return {
      itemId: 'ai_001',
      itemText: 't',
      direction: 'i_owe_them',
      outcome,
      candidates: [],
      llmDecisions: [],
    };
  }

  it('maps definite-dupe via text-hash to MERGE with `-` LLM columns', () => {
    const d = mk({
      kind: 'definite-dupe',
      via: 'text-hash',
      canonical: {
        id: 'canon_1',
        text: 't',
        direction: 'i_owe_them',
        personSlugs: [],
        meetingSlug: 'm',
        jaccard: 1,
      },
      jaccard: 1,
    });
    const p = payloadFromExtractDecision(d, 'fast');
    assert.equal(p.decision, 'MERGE');
    assert.equal(p.canonicalId, 'canon_1');
    assert.equal(p.llmTier, '-');
    assert.equal(p.llmDecision, '-');
    assert.equal(p.reasoning, 'text-hash exact match');
  });

  it('maps definite-dupe via llm-same to MERGE with fast tier', () => {
    const d = mk({
      kind: 'definite-dupe',
      via: 'llm-same',
      canonical: {
        id: 'canon_2',
        text: 't',
        direction: 'i_owe_them',
        personSlugs: [],
        meetingSlug: 'm',
        jaccard: 0.78,
      },
      jaccard: 0.78,
      reasoning: 'same context',
    });
    const p = payloadFromExtractDecision(d, 'fast');
    assert.equal(p.decision, 'MERGE');
    assert.equal(p.llmTier, 'fast');
    assert.equal(p.llmDecision, 'SAME');
    assert.equal(p.reasoning, 'same context');
  });

  it('maps possibly-mergeable to UNCERTAIN', () => {
    const d = mk({
      kind: 'possibly-mergeable',
      bestCandidate: {
        id: 'cand_3',
        text: 't',
        direction: 'i_owe_them',
        personSlugs: [],
        meetingSlug: 'm',
        jaccard: 0.62,
      },
      llmDecisions: [],
      reasoning: 'maybe',
    });
    const p = payloadFromExtractDecision(d, 'fast');
    assert.equal(p.decision, 'UNCERTAIN');
    assert.equal(p.canonicalId, 'cand_3');
    assert.equal(p.jaccard, 0.62);
    assert.equal(p.llmDecision, 'UNCERTAIN');
  });

  it('maps new-canonical with no candidates to NEW with all-dash LLM cols', () => {
    const d = mk({ kind: 'new-canonical', candidatesEvaluated: [] });
    const p = payloadFromExtractDecision(d, 'fast');
    assert.equal(p.decision, 'NEW');
    assert.equal(p.llmTier, '-');
    assert.equal(p.llmDecision, '-');
    assert.equal(p.canonicalId, '-');
    assert.equal(p.reasoning, 'no hybrid candidates');
  });

  it('maps new-canonical with all-DIFFERENT candidates to NEW with llm-tier set', () => {
    const d = mk({
      kind: 'new-canonical',
      candidatesEvaluated: [
        { id: 'c1', text: 't', direction: 'i_owe_them', personSlugs: [], meetingSlug: 'm', jaccard: 0.7 },
      ],
      llmDecisions: [{ candidateId: 'c1', decision: 'DIFFERENT', reasoning: 'no' }],
    });
    const p = payloadFromExtractDecision(d, 'fast');
    assert.equal(p.decision, 'NEW');
    assert.equal(p.llmTier, 'fast');
    assert.equal(p.llmDecision, 'DIFFERENT');
  });
});

// ---------------------------------------------------------------------------
// appendDedupDecisionLog (filesystem)
// ---------------------------------------------------------------------------

describe('appendDedupDecisionLog — filesystem', () => {
  it('appends a log line to dev/diary/dedup-decisions.log', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arete-dedup-log-'));
    try {
      await appendDedupDecisionLog(root, {
        decision: 'MERGE',
        newId: 'ai_001',
        canonicalId: 'canon_42',
        jaccard: 0.78,
        llmTier: 'fast',
        llmDecision: 'SAME',
        reasoning: 'same context',
      });
      const logPath = join(root, 'dev', 'diary', 'dedup-decisions.log');
      const content = readFileSync(logPath, 'utf8');
      assert.match(
        content,
        /^[0-9T:.Z-]+ MERGE ai_001 canon_42 0\.78 fast SAME same context\n$/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('best-effort: bad root does not throw', async () => {
    // /dev/null is not a directory — mkdir under it will fail.
    // The function should swallow the error silently.
    await appendDedupDecisionLog('/dev/null/should-not-exist', {
      decision: 'NEW',
      newId: 'ai_001',
      canonicalId: '-',
      jaccard: '-',
      llmTier: '-',
      llmDecision: '-',
      reasoning: 'no candidates',
    });
    // If we get here, no throw — pass.
    assert.ok(true);
  });
});

describe('appendDedupDecisionLogBatch — preserves item order', () => {
  function mkDecision(itemId: string, kind: 'definite-dupe' | 'new-canonical'): ExtractDedupDecision {
    if (kind === 'definite-dupe') {
      return {
        itemId,
        itemText: 't',
        direction: 'i_owe_them',
        outcome: {
          kind: 'definite-dupe',
          via: 'text-hash',
          canonical: {
            id: 'canon_' + itemId,
            text: 't',
            direction: 'i_owe_them',
            personSlugs: [],
            meetingSlug: 'm',
            jaccard: 1,
          },
          jaccard: 1,
        },
        candidates: [],
        llmDecisions: [],
      };
    }
    return {
      itemId,
      itemText: 't',
      direction: 'i_owe_them',
      outcome: { kind: 'new-canonical', candidatesEvaluated: [] },
      candidates: [],
      llmDecisions: [],
    };
  }

  it('writes lines in input order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arete-dedup-batch-'));
    try {
      const decisions = [
        mkDecision('ai_001', 'definite-dupe'),
        mkDecision('ai_002', 'new-canonical'),
        mkDecision('ai_003', 'definite-dupe'),
      ];
      await appendDedupDecisionLogBatch(root, decisions, 'fast');
      const logPath = join(root, 'dev', 'diary', 'dedup-decisions.log');
      const lines = readFileSync(logPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 3);
      // Each line has the item ID as the third column.
      assert.match(lines[0], / MERGE ai_001 /);
      assert.match(lines[1], / NEW ai_002 /);
      assert.match(lines[2], / MERGE ai_003 /);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
