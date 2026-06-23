/**
 * Tests for the Phase 10b-min extract-time orchestrator
 * (commitment-dedup-extract.ts).
 *
 * Covers:
 *  - Same-day open filter (status=open, date match)
 *  - End-to-end runExtractDedup with mocked LLM
 *  - Badge decoration of staged sections (definite-dupe + possibly-mergeable)
 *  - skip_reason entries for definite-dupe items (dupe_of_<canonical-id>)
 *  - status entries set to 'skipped' for definite-dupe items
 *  - No badge/skip_reason for new-canonical items
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runExtractDedup,
  filterSameDayOpenCommitments,
  decorateStagedSectionsWithDupeBadges,
  buildDupeSkipReasonEntries,
  buildDupeStatusEntries,
  type ExtractedItemForExtractDedup,
  type ExtractDedupDecision,
} from '../../src/services/commitment-dedup-extract.js';
import type { Commitment } from '../../src/models/index.js';
import type {
  LLMCallConcurrentFn,
  ExistingCommitmentForDedup,
  DedupCandidate,
  DedupOutcome,
} from '../../src/services/commitment-dedup-pipeline.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'canon_001',
    text: 'Talk to Dave about staffing',
    direction: 'i_owe_them',
    personSlug: 'dave-wiedenheft',
    personName: 'Dave Wiedenheft',
    source: '2026-06-01-pop-glance.md',
    date: '2026-06-01',
    createdAt: '2026-06-01T08:00:00Z',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

function makeMockLLM(responseTable: Map<string, string>): LLMCallConcurrentFn {
  return async (prompts) =>
    prompts.map((p) => {
      const newMatch = p.prompt.match(/^NEW \(from meeting <[^>]+>\): (.+)$/m);
      const candidateMatches = Array.from(
        p.prompt.matchAll(/^\d+\. \(from meeting <[^>]+>\) (.+)$/gm),
      );
      const newText = newMatch?.[1] ?? '';
      const candTexts = candidateMatches.map((m) => m[1]);
      const key = [newText, ...candTexts].join('::');
      return (
        responseTable.get(key) ??
        candTexts.map((_, i) => `${i + 1}. UNCERTAIN | mock-default`).join('\n')
      );
    });
}

// ---------------------------------------------------------------------------
// filterSameDayOpenCommitments
// ---------------------------------------------------------------------------

describe('filterSameDayOpenCommitments', () => {
  it('keeps open same-day rows', () => {
    const commitments = [
      mkCommitment({ id: 'a', date: '2026-06-01', status: 'open' }),
      mkCommitment({ id: 'b', date: '2026-06-01', status: 'open' }),
    ];
    const out = filterSameDayOpenCommitments(commitments, '2026-06-01');
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((x) => x.id).sort(),
      ['a', 'b'],
    );
  });

  it('drops resolved or dropped rows even on same day', () => {
    const commitments = [
      mkCommitment({ id: 'a', date: '2026-06-01', status: 'open' }),
      mkCommitment({
        id: 'b',
        date: '2026-06-01',
        status: 'resolved',
        resolvedAt: '2026-06-01T10:00:00Z',
      }),
      mkCommitment({
        id: 'c',
        date: '2026-06-01',
        status: 'dropped',
        resolvedAt: '2026-06-01T10:00:00Z',
      }),
    ];
    const out = filterSameDayOpenCommitments(commitments, '2026-06-01');
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
  });

  it('drops off-day rows', () => {
    const commitments = [
      mkCommitment({ id: 'a', date: '2026-06-01' }),
      mkCommitment({ id: 'b', date: '2026-05-31' }),
      mkCommitment({ id: 'c', date: '2026-06-02' }),
    ];
    const out = filterSameDayOpenCommitments(commitments, '2026-06-01');
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
  });

  it('handles ISO-prefix date strings', () => {
    const commitments = [
      mkCommitment({ id: 'a', date: '2026-06-01T08:00:00Z' }),
    ];
    const out = filterSameDayOpenCommitments(commitments, '2026-06-01');
    assert.equal(out.length, 1);
  });
});

// ---------------------------------------------------------------------------
// runExtractDedup end-to-end
// ---------------------------------------------------------------------------

describe('runExtractDedup', () => {
  it('produces one decision per extracted item', async () => {
    const items: ExtractedItemForExtractDedup[] = [
      {
        itemId: 'ai_001',
        text: 'Talk to Dave about staffing',
        direction: 'i_owe_them',
        personSlugs: ['dave-wiedenheft'],
      },
      {
        itemId: 'ai_002',
        text: 'Send Lindsay the deck',
        direction: 'i_owe_them',
        personSlugs: ['lindsay-gray'],
      },
    ];
    const commitments: Commitment[] = [
      mkCommitment({
        id: 'canon_a',
        text: 'Talk to Dave about staffing',
        date: '2026-06-01',
      }),
    ];
    const llm = makeMockLLM(new Map());
    const decisions = await runExtractDedup(
      items,
      {
        existingCommitments: commitments,
        sameDayStagedItems: [],
        meetingDate: '2026-06-01',
        meetingSlug: '2026-06-01-john-lindsay-11',
      },
      llm,
    );
    assert.equal(decisions.length, 2);
    // Item 1 → exact text-hash match → definite-dupe via=text-hash
    assert.equal(decisions[0].itemId, 'ai_001');
    assert.equal(decisions[0].outcome.kind, 'definite-dupe');
    if (decisions[0].outcome.kind === 'definite-dupe') {
      assert.equal(decisions[0].outcome.via, 'text-hash');
    }
    // Item 2 → no candidate → new-canonical
    assert.equal(decisions[1].itemId, 'ai_002');
    assert.equal(decisions[1].outcome.kind, 'new-canonical');
  });

  it('honors same-day window — off-day commitments do not dedup', async () => {
    const items: ExtractedItemForExtractDedup[] = [
      {
        itemId: 'ai_001',
        text: 'Talk to Dave about staffing',
        direction: 'i_owe_them',
        personSlugs: ['dave-wiedenheft'],
      },
    ];
    const commitments: Commitment[] = [
      mkCommitment({
        id: 'canon_a',
        text: 'Talk to Dave about staffing',
        date: '2026-05-31', // yesterday
      }),
    ];
    const llm = makeMockLLM(new Map());
    const decisions = await runExtractDedup(
      items,
      {
        existingCommitments: commitments,
        sameDayStagedItems: [],
        meetingDate: '2026-06-01',
        meetingSlug: 'today',
      },
      llm,
    );
    assert.equal(decisions[0].outcome.kind, 'new-canonical');
  });

  it('unions sameDayStagedItems (from OTHER meetings) into the candidate pool', async () => {
    const items: ExtractedItemForExtractDedup[] = [
      {
        itemId: 'ai_001',
        text: 'Talk to Dave about staffing',
        direction: 'i_owe_them',
        personSlugs: ['dave-wiedenheft'],
      },
    ];
    const stagedFromOther: ExistingCommitmentForDedup[] = [
      {
        id: 'other_ai_005',
        text: 'Talk to Dave about staffing',
        direction: 'i_owe_them',
        personSlugs: ['dave-wiedenheft'],
        meetingSlug: '2026-06-01-other-meeting',
        date: '2026-06-01',
      },
    ];
    const llm = makeMockLLM(new Map());
    const decisions = await runExtractDedup(
      items,
      {
        existingCommitments: [],
        sameDayStagedItems: stagedFromOther,
        meetingDate: '2026-06-01',
        meetingSlug: 'today',
      },
      llm,
    );
    assert.equal(decisions[0].outcome.kind, 'definite-dupe');
    if (decisions[0].outcome.kind === 'definite-dupe') {
      assert.equal(decisions[0].outcome.canonical.id, 'other_ai_005');
    }
  });
});

// ---------------------------------------------------------------------------
// decorateStagedSectionsWithDupeBadges
// ---------------------------------------------------------------------------

describe('decorateStagedSectionsWithDupeBadges', () => {
  function mkDefiniteDupeDecision(
    itemId: string,
    canonicalSlug: string,
  ): ExtractDedupDecision {
    return {
      itemId,
      itemText: 't',
      direction: 'i_owe_them',
      outcome: {
        kind: 'definite-dupe',
        via: 'text-hash',
        canonical: {
          id: 'canon_1',
          text: 't',
          direction: 'i_owe_them',
          personSlugs: [],
          meetingSlug: canonicalSlug,
          jaccard: 1,
        },
        jaccard: 1,
      },
      candidates: [],
      llmDecisions: [],
    };
  }

  function mkPossiblyMergeableDecision(
    itemId: string,
    bestSlug: string,
  ): ExtractDedupDecision {
    return {
      itemId,
      itemText: 't',
      direction: 'i_owe_them',
      outcome: {
        kind: 'possibly-mergeable',
        bestCandidate: {
          id: 'cand_1',
          text: 't',
          direction: 'i_owe_them',
          personSlugs: [],
          meetingSlug: bestSlug,
          jaccard: 0.7,
        },
        llmDecisions: [],
        reasoning: 'timing ambiguous',
      },
      candidates: [],
      llmDecisions: [],
    };
  }

  it('adds canonical badge to definite-dupe items', () => {
    const sections = [
      '## Staged Action Items',
      '- ai_001: Talk to Dave about staffing',
      '- ai_002: Send Lindsay the deck',
    ].join('\n');
    const decisions = [
      mkDefiniteDupeDecision('ai_001', '2026-06-01-pop-glance'),
    ];
    const out = decorateStagedSectionsWithDupeBadges(sections, decisions);
    assert.match(out, /ai_001: Talk to Dave about staffing\s+↪ canonical in 2026-06-01-pop-glance/);
    assert.match(out, /ai_002: Send Lindsay the deck$/m);
  });

  it('adds possibly-merges badge to possibly-mergeable items', () => {
    const sections = '- ai_005: Follow up with Dave about staffing plan';
    const decisions = [mkPossiblyMergeableDecision('ai_005', '2026-06-01-other')];
    const out = decorateStagedSectionsWithDupeBadges(sections, decisions);
    assert.match(out, /↪ possibly merges with 2026-06-01-other/);
  });

  it('returns input unchanged when no decisions need a badge', () => {
    const sections = '- ai_001: New thing';
    const out = decorateStagedSectionsWithDupeBadges(sections, []);
    assert.equal(out, sections);
  });

  it('idempotent: re-decorating strips stale badge before re-applying', () => {
    const sections = '- ai_001: Talk to Dave about staffing  ↪ canonical in stale-slug';
    const decisions = [
      mkDefiniteDupeDecision('ai_001', '2026-06-01-fresh-slug'),
    ];
    const out = decorateStagedSectionsWithDupeBadges(sections, decisions);
    assert.match(out, /↪ canonical in 2026-06-01-fresh-slug/);
    assert.ok(!out.includes('stale-slug'));
  });

  it('strips stale badge when current decision is new-canonical', () => {
    const sections = '- ai_001: Talk to Dave about staffing  ↪ canonical in stale-slug';
    const out = decorateStagedSectionsWithDupeBadges(sections, []);
    assert.ok(!out.includes('↪'));
  });
});

// ---------------------------------------------------------------------------
// buildDupeSkipReasonEntries
// ---------------------------------------------------------------------------

describe('buildDupeSkipReasonEntries', () => {
  it('emits dupe_of_<canonical-id> for definite-dupe items', () => {
    const decisions: ExtractDedupDecision[] = [
      {
        itemId: 'ai_001',
        itemText: 't',
        direction: 'i_owe_them',
        outcome: {
          kind: 'definite-dupe',
          via: 'text-hash',
          canonical: {
            id: 'canon_42',
            text: 't',
            direction: 'i_owe_them',
            personSlugs: [],
            meetingSlug: 'meeting-x',
            jaccard: 1,
          },
          jaccard: 1,
        },
        candidates: [],
        llmDecisions: [],
      },
    ];
    const out = buildDupeSkipReasonEntries(decisions, '2026-06-01T10:00:00Z');
    assert.deepEqual(out, {
      ai_001: {
        reason: 'dupe_of_canon_42',
        evidence: 'cross-meeting dedup text-hash (canonical in meeting-x)',
        setBy: 'chef',
        setAt: '2026-06-01T10:00:00Z',
        // Issue C: the canonical's text is the linkable [[…]] target.
        matchedRef: 't',
      },
    });
  });

  it('Issue C — matchedRef carries the canonical item TEXT for the [[link]] render', () => {
    const decisions: ExtractDedupDecision[] = [
      {
        itemId: 'ai_009',
        itemText: 'Set up the roadmap meeting with Dave',
        direction: 'i_owe_them',
        outcome: {
          kind: 'definite-dupe',
          via: 'llm-same',
          canonical: {
            id: 'canon_7',
            text: 'Set up meeting with Philip, Dave, Lindsay on team structure',
            direction: 'i_owe_them',
            personSlugs: [],
            meetingSlug: 'phil-john',
            jaccard: 0.8,
          },
          jaccard: 0.8,
        },
        candidates: [],
        llmDecisions: [],
      },
    ];
    const out = buildDupeSkipReasonEntries(decisions, '2026-06-01T10:00:00Z');
    assert.equal(
      out['ai_009'].matchedRef,
      'Set up meeting with Philip, Dave, Lindsay on team structure',
    );
  });

  it('does NOT emit skip_reason for possibly-mergeable items', () => {
    const decisions: ExtractDedupDecision[] = [
      {
        itemId: 'ai_002',
        itemText: 't',
        direction: 'i_owe_them',
        outcome: {
          kind: 'possibly-mergeable',
          bestCandidate: {
            id: 'cand_1',
            text: 't',
            direction: 'i_owe_them',
            personSlugs: [],
            meetingSlug: 'meeting-y',
            jaccard: 0.7,
          },
          llmDecisions: [],
          reasoning: 'maybe',
        },
        candidates: [],
        llmDecisions: [],
      },
    ];
    const out = buildDupeSkipReasonEntries(decisions, '2026-06-01T10:00:00Z');
    assert.deepEqual(out, {});
  });

  it('does NOT emit skip_reason for new-canonical items', () => {
    const decisions: ExtractDedupDecision[] = [
      {
        itemId: 'ai_003',
        itemText: 't',
        direction: 'i_owe_them',
        outcome: { kind: 'new-canonical', candidatesEvaluated: [] },
        candidates: [],
        llmDecisions: [],
      },
    ];
    const out = buildDupeSkipReasonEntries(decisions, '2026-06-01T10:00:00Z');
    assert.deepEqual(out, {});
  });
});

// ---------------------------------------------------------------------------
// buildDupeStatusEntries
// ---------------------------------------------------------------------------

describe('buildDupeStatusEntries', () => {
  it("sets status to 'skipped' for definite-dupe items", () => {
    const decisions: ExtractDedupDecision[] = [
      {
        itemId: 'ai_001',
        itemText: 't',
        direction: 'i_owe_them',
        outcome: {
          kind: 'definite-dupe',
          via: 'text-hash',
          canonical: {
            id: 'c1',
            text: 't',
            direction: 'i_owe_them',
            personSlugs: [],
            meetingSlug: 's',
            jaccard: 1,
          },
          jaccard: 1,
        },
        candidates: [],
        llmDecisions: [],
      },
      {
        itemId: 'ai_002',
        itemText: 't',
        direction: 'i_owe_them',
        outcome: { kind: 'new-canonical', candidatesEvaluated: [] },
        candidates: [],
        llmDecisions: [],
      },
    ];
    const out = buildDupeStatusEntries(decisions);
    assert.deepEqual(out, { ai_001: 'skipped' });
  });
});

// ---------------------------------------------------------------------------
// AC2: assert no commitments.json write happens at this layer
// ---------------------------------------------------------------------------
// Per Step 2 contract: this module is read-only — it produces decisions
// and metadata maps. The CLI / caller writes commitments.json via
// `services.commitments.withLock(...)` and the existing apply flow.
// We assert by structural type-narrowing (the module exports no write
// functions) and by the fact that runExtractDedup takes commitments as
// an immutable input array.
//
// This is a "negative test" with no runtime assertion needed — the
// public API surface is the test.

describe('AC2 — module exports no production writers', () => {
  it('exports only read/decide functions', async () => {
    // The module must not export functions whose names suggest direct
    // file-writes. "Commitment" / "filterSameDayOpenCommitments" are
    // type-/filter-shaped names, not writers — so we test against an
    // exact deny-list of action verbs.
    const mod = await import('../../src/services/commitment-dedup-extract.js');
    const writeishKeys = Object.keys(mod).filter((k) =>
      /^(write|save|sync|persist|flush)|^commit(?!ment)/i.test(k),
    );
    assert.deepEqual(writeishKeys, [], `unexpected write-shaped exports: ${writeishKeys.join(', ')}`);
  });
});
