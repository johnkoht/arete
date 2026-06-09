/**
 * Tests for Phase 10b-aux Step 1 — `arete dedup --explain <id>` provenance.
 *
 * Covers (plan AC7):
 *  - parseDedupLog: tolerant column parse, skips malformed lines
 *  - filterLogForCommitment: prefix matching against canonical id
 *  - lookupCommitmentById: full hash, prefix, ambiguous, not-found
 *  - formatExplainReport: canonical text + stakeholders + roles +
 *    source_meetings w/ provenance + textVariants w/ eviction state +
 *    dedup-decisions log entries
 *
 * Pure module — NO LLM, NO production data writes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDedupLog,
  filterLogForCommitment,
  buildDupeSourceMapping,
  lookupCommitmentById,
  formatExplainReport,
} from '../../src/services/dedup-explain.js';
import { renderDedupDecisionLine } from '../../src/services/dedup-decisions-log.js';
import type { Commitment } from '../../src/models/index.js';

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'c8e3d2f1'.padEnd(64, '0'),
    text: 'Talk to Dave about staffing',
    direction: 'i_owe_them',
    personSlug: 'dave-wiedenheft',
    personName: 'Dave Wiedenheft',
    source: '2026-06-01-john-lindsay-11.md',
    date: '2026-06-01',
    createdAt: '2026-06-01T08:00:00Z',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

describe('parseDedupLog', () => {
  it('parses well-formed lines into structured entries', () => {
    const raw = [
      '2026-06-02T15:42:01Z MERGE ai_0042 c8e3d2f1abc 0.78 fast SAME same actor + Dave + staffing context',
      '2026-06-02T15:42:03Z NEW ai_0043 - - - - no hybrid match',
    ].join('\n');
    const entries = parseDedupLog(raw);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].decision, 'MERGE');
    assert.equal(entries[0].newId, 'ai_0042');
    assert.equal(entries[0].canonicalId, 'c8e3d2f1abc');
    assert.equal(entries[0].jaccard, '0.78');
    assert.equal(entries[0].llmTier, 'fast');
    assert.equal(entries[0].llmDecision, 'SAME');
    assert.equal(entries[0].reasoning, 'same actor + Dave + staffing context');
    assert.equal(entries[1].decision, 'NEW');
    assert.equal(entries[1].reasoning, 'no hybrid match');
  });

  it('skips blank lines and malformed lines', () => {
    const raw = [
      '',
      'garbage line with too few cols',
      '2026-06-02T00:00:00Z BOGUS ai_1 c1 0.5 fast SAME x', // unknown decision
      '2026-06-02T15:42:01Z UNMERGE ai_0042 c8e3d2f1 - - - user-initiated',
    ].join('\n');
    const entries = parseDedupLog(raw);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].decision, 'UNMERGE');
  });
});

// I-6: dupe→source provenance round-trip + rebuild
describe('parseDedupLog — I-6 dupe→source provenance', () => {
  it('decodes the TAB-delimited provenance segment on a MERGE line', () => {
    const line = renderDedupDecisionLine('2026-06-02T15:42:01Z', {
      decision: 'MERGE',
      newId: 'dupe_a',
      canonicalId: 'canon_x',
      jaccard: 0.9,
      llmTier: 'fast',
      llmDecision: 'SAME',
      reasoning: 'same action with spaces',
      dupeSourceMeeting: '2026-05-30-staffing-sync',
      dupeText: 'follow up\twith Dave', // text with a tab survives base64
    });
    const [entry] = parseDedupLog(line);
    assert.equal(entry.decision, 'MERGE');
    assert.equal(entry.reasoning, 'same action with spaces');
    assert.equal(entry.dupeSourceMeeting, '2026-05-30-staffing-sync');
    assert.equal(entry.dupeText, 'follow up\twith Dave');
  });

  it('leaves provenance fields undefined on legacy (no-tab) lines', () => {
    const [entry] = parseDedupLog(
      '2026-06-02T15:42:01Z MERGE ai_0042 c8e3d2f1 0.78 fast SAME legacy line',
    );
    assert.equal(entry.dupeSourceMeeting, undefined);
    assert.equal(entry.dupeText, undefined);
  });

  it('drops a half / malformed provenance segment but still parses the prefix', () => {
    // Only a source meeting, no base64 text token after the second tab.
    const [entry] = parseDedupLog(
      '2026-06-02T15:42:01Z MERGE ai_0042 c8e3d2f1 0.78 fast SAME r\t2026-05-30-x',
    );
    assert.equal(entry.decision, 'MERGE');
    assert.equal(entry.dupeSourceMeeting, undefined);
    assert.equal(entry.dupeText, undefined);
  });

  it('buildDupeSourceMapping rebuilds {dupeId, sourceMeeting, text} for a canonical', () => {
    const raw = [
      renderDedupDecisionLine('2026-06-02T15:42:01Z', {
        decision: 'MERGE',
        newId: 'dupe_a',
        canonicalId: 'c8e3d2f1abc',
        jaccard: 0.9,
        llmTier: 'fast',
        llmDecision: 'SAME',
        reasoning: 'r1',
        dupeSourceMeeting: 'm-alpha',
        dupeText: 'text alpha',
      }),
      renderDedupDecisionLine('2026-06-02T15:42:02Z', {
        decision: 'MERGE',
        newId: 'dupe_b',
        canonicalId: 'c8e3d2f1abc',
        jaccard: 0.88,
        llmTier: 'fast',
        llmDecision: 'SAME',
        reasoning: 'r2',
        dupeSourceMeeting: 'm-beta',
        dupeText: 'text beta',
      }),
      // legacy MERGE on same canonical with no provenance → skipped
      '2026-06-02T15:42:03Z MERGE dupe_c c8e3d2f1abc 0.8 fast SAME r3',
      // MERGE on a DIFFERENT canonical → excluded
      renderDedupDecisionLine('2026-06-02T15:42:04Z', {
        decision: 'MERGE',
        newId: 'dupe_d',
        canonicalId: 'e94f1aaa',
        jaccard: 0.9,
        llmTier: 'fast',
        llmDecision: 'SAME',
        reasoning: 'r4',
        dupeSourceMeeting: 'm-gamma',
        dupeText: 'text gamma',
      }),
    ].join('\n');
    const mapping = buildDupeSourceMapping(parseDedupLog(raw), 'c8e3d2f1');
    assert.deepEqual(mapping, [
      { dupeId: 'dupe_a', sourceMeeting: 'm-alpha', text: 'text alpha' },
      { dupeId: 'dupe_b', sourceMeeting: 'm-beta', text: 'text beta' },
    ]);
  });
});

describe('filterLogForCommitment', () => {
  it('matches log entries by canonical id prefix in either direction', () => {
    const entries = parseDedupLog(
      [
        '2026-06-02T15:42:01Z MERGE ai_0042 c8e3d2f1abc123 0.78 fast SAME r1',
        '2026-06-03T10:00:00Z MERGE ai_0099 e94f1aaa 0.62 fast SAME r2',
        '2026-06-03T11:00:00Z MERGE ai_0100 canon_c8e3d2f1 0.9 fast SAME r3',
      ].join('\n'),
    );
    // 8-char CLI prefix should hit both the full-hash and canon_ forms.
    const relevant = filterLogForCommitment(entries, 'c8e3d2f1');
    assert.equal(relevant.length, 2);
    assert.deepEqual(
      relevant.map((e) => e.newId).sort(),
      ['ai_0042', 'ai_0100'],
    );
  });
});

describe('lookupCommitmentById', () => {
  const all = [
    commitment({ id: 'c8e3d2f1'.padEnd(64, '0') }),
    commitment({ id: 'c8e3d2ff'.padEnd(64, '0'), text: 'other' }),
    commitment({ id: 'a1b2c3d4'.padEnd(64, '0'), text: 'distinct' }),
  ];

  it('resolves a unique 8-char prefix', () => {
    const r = lookupCommitmentById(all, 'a1b2c3d4');
    assert.equal(r.kind, 'found');
    if (r.kind === 'found') assert.equal(r.commitment.text, 'distinct');
  });

  it('resolves a full hash exactly', () => {
    const r = lookupCommitmentById(all, 'c8e3d2f1'.padEnd(64, '0'));
    assert.equal(r.kind, 'found');
  });

  it('flags ambiguous short prefix', () => {
    const r = lookupCommitmentById(all, 'c8e3d2f');
    assert.equal(r.kind, 'ambiguous');
    if (r.kind === 'ambiguous') assert.equal(r.matches.length, 2);
  });

  it('returns not-found for an unknown prefix', () => {
    const r = lookupCommitmentById(all, 'deadbeef');
    assert.equal(r.kind, 'not-found');
  });
});

describe('formatExplainReport (AC7 — fixture with 3 source meetings + log)', () => {
  const canonicalId = 'c8e3d2f1'.padEnd(64, '0');
  const c = commitment({
    id: canonicalId,
    stakeholders: [
      { slug: 'dave-wiedenheft', role: 'recipient' },
      { slug: 'lindsay-gray', role: 'mentioned' },
      { slug: 'anthony-avina', role: 'mentioned' },
    ],
    source_meetings: [
      '2026-06-01-john-lindsay-11.md',
      '2026-06-02-glance-2-sync.md',
      '2026-06-03-pop-review.md',
    ],
    textVariants: [
      'Talk to Dave about staffing',
      'Going to chat with Dave on the staffing plan',
      'Need to discuss staffing with Dave',
    ],
  });
  const log = parseDedupLog(
    [
      `2026-06-02T15:42:01Z MERGE ai_0042 ${canonicalId} 0.78 fast SAME same actor + Dave + staffing`,
      `2026-06-03T09:10:00Z MERGE ai_0050 ${canonicalId} 1.00 - - text-hash exact match`,
    ].join('\n'),
  );

  it('includes canonical text, stakeholders with roles, sources, variants, log', () => {
    const out = formatExplainReport(c, log);
    // Canonical text + id
    assert.match(out, /Commitment: c8e3d2f1/);
    assert.match(out, /Canonical text: "Talk to Dave about staffing"/);
    // Stakeholders with roles
    assert.match(out, /@dave-wiedenheft \(recipient\)/);
    assert.match(out, /@lindsay-gray \(mentioned\)/);
    assert.match(out, /@anthony-avina \(mentioned\)/);
    // All 3 source meetings present
    assert.match(out, /2026-06-01-john-lindsay-11/);
    assert.match(out, /2026-06-02-glance-2-sync/);
    assert.match(out, /2026-06-03-pop-review/);
    // First source labelled original
    assert.match(out, /2026-06-01-john-lindsay-11\s+\(original; LLM-extracted\)/);
    // textVariants w/ capacity + canonical marker
    assert.match(out, /Text variants observed \(3\/5 capacity\)/);
    assert.match(out, /"Talk to Dave about staffing"\s+← canonical/);
    // Dedup decisions log overlay
    assert.match(out, /Dedup decisions \(2 log entries\)/);
    assert.match(out, /MERGE ai_0042/);
  });

  it('falls back to v1 personSlug when stakeholders absent', () => {
    const v1 = commitment({ stakeholders: undefined });
    const out = formatExplainReport(v1, []);
    assert.match(out, /@dave-wiedenheft \(recipient\)/);
    assert.match(out, /no log entries reference this commitment/);
  });

  it('notes capacity when textVariants is full (5/5)', () => {
    const full = commitment({
      textVariants: ['a', 'b', 'c', 'd', 'e'],
      text: 'a',
    });
    const out = formatExplainReport(full, []);
    assert.match(out, /Text variants observed \(5\/5 capacity\)/);
    assert.match(out, /at capacity — oldest variant evicted/);
  });
});
