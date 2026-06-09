/**
 * Tests for the Phase 10e background dedup engine.
 *
 * Coverage:
 *  - commitments scope: exact text-hash group, fuzzy + LLM SAME group,
 *    UNCERTAIN surfaces as candidate (not group), DIFFERENT skipped.
 *  - --since filter drops earlier rows from consideration.
 *  - decisions / learnings scope: same-title grouping, body-Jaccard
 *    surface-for-review, topic-gate filter.
 *  - topics scope: alias-overlap and body-Jaccard surfaces.
 *  - applyCommitmentsDedup: pure transformer; idempotent on second pass.
 *  - Diff formatter shape (dry-run header).
 *
 * NO LLM calls against arete-reserv — mock is deterministic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runBackgroundDedup,
  applyCommitmentsDedup,
  formatBackgroundDedupDiff,
  BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR,
  type BackgroundDedupResult,
  type MemorySectionInput,
  type TopicPageInput,
} from '../../src/services/background-dedup.js';
import type {
  LLMCallConcurrentFn,
} from '../../src/services/commitment-dedup-pipeline.js';
import type { Commitment } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'a'.repeat(64),
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

function makeMockLLM(decision: 'SAME' | 'DIFFERENT' | 'UNCERTAIN'): LLMCallConcurrentFn {
  return async (prompts) =>
    prompts.map((p) => {
      const candidateMatches = Array.from(
        p.prompt.matchAll(/^\d+\. \(from meeting <[^>]+>\) (.+)$/gm),
      );
      return candidateMatches
        .map((_, i) => `${i + 1}. ${decision} | mock ${decision.toLowerCase()}`)
        .join('\n');
    });
}

// ---------------------------------------------------------------------------
// commitments scope
// ---------------------------------------------------------------------------

describe('runBackgroundDedup — commitments scope', () => {
  it('groups exact text-hash duplicates without LLM call', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T08:00:00Z',
        date: '2026-06-01',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T09:00:00Z',
        date: '2026-06-01',
        source: '2026-06-01-second-meeting.md',
      }),
    ];

    // No LLM provided — exact text-hash match still grouped.
    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
    });

    assert.equal(result.summary.groups, 1, 'one group');
    assert.equal(result.summary.duplicates, 1, 'one duplicate');
    assert.equal(result.summary.uncertain, 0, 'no candidates surfaced');
    assert.equal(result.groups[0].canonicalKey, 'c1'.padEnd(64, '1'));
    assert.equal(result.groups[0].duplicates[0].key, 'c2'.padEnd(64, '2'));
  });

  it('LLM SAME promotes fuzzy candidate to group', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T08:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk Dave about staffing plan',
        createdAt: '2026-06-02T09:00:00Z',
        date: '2026-06-02',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
      callConcurrent: makeMockLLM('SAME'),
    });

    assert.equal(result.summary.groups, 1);
    assert.equal(result.summary.duplicates, 1);
    assert.equal(result.groups[0].duplicates[0].llmDecision, 'SAME');
  });

  it('LLM UNCERTAIN surfaces as candidate, not group', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T08:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk Dave about staffing plan',
        createdAt: '2026-06-02T09:00:00Z',
        date: '2026-06-02',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
      callConcurrent: makeMockLLM('UNCERTAIN'),
    });

    assert.equal(result.summary.groups, 0);
    assert.equal(result.summary.uncertain, 1);
    assert.equal(result.candidates.length, 1);
  });

  it('LLM DIFFERENT keeps both as distinct canonicals', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T08:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk Dave about staffing plan',
        createdAt: '2026-06-02T09:00:00Z',
        date: '2026-06-02',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
      callConcurrent: makeMockLLM('DIFFERENT'),
    });

    assert.equal(result.summary.groups, 0);
    assert.equal(result.summary.uncertain, 0);
  });

  it('--since filter drops earlier rows', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        date: '2026-05-01', // before since
        createdAt: '2026-05-01T08:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk to Dave about staffing',
        date: '2026-06-01', // at since
        createdAt: '2026-06-01T08:00:00Z',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      since: '2026-06-01',
      commitments,
    });

    // Only one row in scope → no duplicate group possible.
    assert.equal(result.summary.totalIn, 1);
    assert.equal(result.summary.groups, 0);
  });

  it('drops resolved/dropped commitments from scope', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        status: 'resolved',
        resolvedAt: '2026-06-01T10:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk to Dave about staffing',
        status: 'open',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
    });

    assert.equal(result.summary.totalIn, 1);
    assert.equal(result.summary.groups, 0);
  });

  it('without LLM, surfaces fuzzy pair as candidate (never silent merge)', async () => {
    const commitments = [
      mkCommitment({
        id: 'c1'.padEnd(64, '1'),
        text: 'Talk to Dave about staffing',
        createdAt: '2026-06-01T08:00:00Z',
      }),
      mkCommitment({
        id: 'c2'.padEnd(64, '2'),
        text: 'Talk Dave about staffing plan',
        createdAt: '2026-06-02T09:00:00Z',
        date: '2026-06-02',
      }),
    ];

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: true,
      commitments,
      // no callConcurrent
    });

    assert.equal(result.summary.groups, 0);
    assert.ok(result.summary.uncertain >= 1, 'fuzzy pair surfaces');
  });
});

// ---------------------------------------------------------------------------
// applyCommitmentsDedup
// ---------------------------------------------------------------------------

describe('applyCommitmentsDedup', () => {
  it('removes duplicates and merges source_meetings + textVariants', async () => {
    const c1: Commitment = mkCommitment({
      id: 'c1'.padEnd(64, '1'),
      text: 'Talk to Dave about staffing',
      source: 'meeting-a.md',
      source_meetings: ['meeting-a'],
      textVariants: ['Talk to Dave about staffing'],
    });
    const c2: Commitment = mkCommitment({
      id: 'c2'.padEnd(64, '2'),
      text: 'Talk Dave about staffing plan',
      source: 'meeting-b.md',
      source_meetings: ['meeting-b'],
      textVariants: ['Talk Dave about staffing plan'],
      createdAt: '2026-06-02T09:00:00Z',
      date: '2026-06-02',
    });

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: false,
      commitments: [c1, c2],
      callConcurrent: makeMockLLM('SAME'),
    });

    const applied = applyCommitmentsDedup([c1, c2], result);
    assert.equal(applied.length, 1, 'duplicate removed');
    assert.equal(applied[0].id, c1.id, 'canonical preserved');
    assert.ok(
      (applied[0].source_meetings ?? []).includes('meeting-a'),
      'canonical source kept',
    );
    assert.ok(
      (applied[0].source_meetings ?? []).includes('meeting-b'),
      'duplicate source merged',
    );
    assert.ok(
      (applied[0].textVariants ?? []).includes(
        'Talk Dave about staffing plan',
      ),
      'duplicate text variant added',
    );
  });

  it('is idempotent — second apply on already-merged data is a no-op', async () => {
    const c1: Commitment = mkCommitment({
      id: 'c1'.padEnd(64, '1'),
      text: 'Talk to Dave about staffing',
      source: 'meeting-a.md',
    });
    const c2: Commitment = mkCommitment({
      id: 'c2'.padEnd(64, '2'),
      text: 'Talk to Dave about staffing',
      source: 'meeting-b.md',
      createdAt: '2026-06-02T09:00:00Z',
      date: '2026-06-02',
    });

    const firstResult = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: false,
      commitments: [c1, c2],
    });
    const firstApply = applyCommitmentsDedup([c1, c2], firstResult);

    // Run again against the already-deduped output.
    const secondResult = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: false,
      commitments: firstApply,
    });
    assert.equal(
      secondResult.summary.groups,
      0,
      'second pass finds no new groups',
    );
    const secondApply = applyCommitmentsDedup(firstApply, secondResult);
    assert.deepEqual(secondApply, firstApply, 'no-op on second apply');
  });

  it('caps textVariants at 5 entries', async () => {
    // Canonical already at the cap (5 variants), all distinct from the
    // canonical text. Duplicate's text is identical to the canonical
    // text (matches via text-hash, no fuzzy LLM call), and the duplicate
    // carries no new variants beyond its own text. Expectation: oldest-
    // first eviction trims the front when we add the canonical text +
    // duplicate's text to the variant list.
    const tv = ['v1', 'v2', 'v3', 'v4', 'v5'];
    const c1: Commitment = mkCommitment({
      id: 'c1'.padEnd(64, '1'),
      text: 'Talk to Dave about staffing',
      textVariants: tv,
    });
    const c2: Commitment = mkCommitment({
      id: 'c2'.padEnd(64, '2'),
      text: 'Talk to Dave about staffing',
      createdAt: '2026-06-02T09:00:00Z',
      date: '2026-06-02',
      // c2 carries no extra variants beyond its own text.
      textVariants: ['Talk to Dave about staffing'],
    });

    const result = await runBackgroundDedup({
      scope: 'commitments',
      dryRun: false,
      commitments: [c1, c2],
    });
    const applied = applyCommitmentsDedup([c1, c2], result);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].textVariants?.length, 5, 'cap at 5');
    // Oldest-first eviction → 'v1' dropped, canonical text appended.
    assert.deepEqual(applied[0].textVariants, [
      'v2',
      'v3',
      'v4',
      'v5',
      'Talk to Dave about staffing',
    ]);
  });
});

// ---------------------------------------------------------------------------
// decisions / learnings scope
// ---------------------------------------------------------------------------

describe('runBackgroundDedup — decisions/learnings scope', () => {
  it('groups sections with same normalized title', async () => {
    const sections: MemorySectionInput[] = [
      {
        title: 'POP migration timing',
        body: 'POP migration must complete by EOY. Anthony is the lead.',
        date: '2026-05-01',
      },
      {
        title: 'POP migration timing',
        body: 'POP MVP wraps by end of year. Anthony leads.',
        date: '2026-05-15',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'decisions',
      dryRun: true,
      sections,
    });
    assert.equal(result.summary.groups, 1);
    assert.equal(result.groups[0].canonicalKey, 'POP migration timing');
  });

  it('surfaces body-similar sections without auto-merging', async () => {
    const sections: MemorySectionInput[] = [
      {
        title: 'Q3 staffing direction',
        body: 'Hire two engineers for the platform team by end of Q3 to support the launch initiative properly.',
        date: '2026-05-01',
      },
      {
        title: 'Engineering hiring plan',
        body: 'Hire two engineers for the platform team by end of Q3 to support the launch initiative properly.',
        date: '2026-05-15',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'decisions',
      dryRun: true,
      sections,
    });
    // Different titles but identical bodies → candidate surface, no merge.
    assert.equal(result.summary.groups, 0);
    assert.equal(result.summary.uncertain, 1);
    assert.ok(
      result.candidates[0].jaccard >= BACKGROUND_DEDUP_MEMORY_JACCARD_FLOOR,
    );
  });

  it('topic-gate filters pairs with no topic overlap', async () => {
    const sections: MemorySectionInput[] = [
      {
        title: 'Q3 staffing direction',
        body: 'Hire two engineers for the platform team by end of Q3 to support the launch initiative.',
        date: '2026-05-01',
        topics: ['hiring'],
      },
      {
        title: 'Engineering hiring plan',
        body: 'Hire two engineers for the platform team by end of Q3 to support the launch initiative.',
        date: '2026-05-15',
        topics: ['budget'],
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'decisions',
      dryRun: true,
      sections,
    });
    // Topics don't overlap → pair filtered out.
    assert.equal(result.summary.uncertain, 0);
  });

  it('--since filter drops earlier sections', async () => {
    const sections: MemorySectionInput[] = [
      {
        title: 'Q3 staffing direction',
        body: 'Hire two engineers for the platform team.',
        date: '2026-04-01',
      },
      {
        title: 'Q3 staffing direction',
        body: 'Hire two engineers for the platform team.',
        date: '2026-06-01',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'decisions',
      dryRun: true,
      since: '2026-05-01',
      sections,
    });
    assert.equal(result.summary.totalIn, 1);
    assert.equal(result.summary.groups, 0);
  });
});

// ---------------------------------------------------------------------------
// topics scope
// ---------------------------------------------------------------------------

describe('runBackgroundDedup — topics scope', () => {
  it('surfaces alias-overlap as candidate', async () => {
    const topics: TopicPageInput[] = [
      {
        topicSlug: 'pop-migration',
        aliases: ['pop-mvp'],
        body: 'POP migration tracks Anthony and Lindsay leading the platform shift.',
      },
      {
        topicSlug: 'pop-mvp',
        aliases: ['pop-migration'],
        body: 'POP MVP launch coordination, Anthony Lindsay both involved.',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'topics',
      dryRun: true,
      topics,
    });
    assert.equal(result.summary.groups, 0, 'topics never auto-grouped');
    assert.equal(result.summary.uncertain, 1, 'alias overlap surfaces');
    assert.equal(result.candidates[0].reasoning, 'alias overlap');
  });

  it('surfaces body-similar pages even without alias overlap', async () => {
    const topics: TopicPageInput[] = [
      {
        topicSlug: 'budget-fy25',
        aliases: [],
        body: 'FY25 budget planning Anthony Lindsay engineering hiring platform team launch.',
      },
      {
        topicSlug: 'fy25-budget',
        aliases: [],
        body: 'FY25 budget planning Anthony Lindsay engineering hiring platform team launch.',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'topics',
      dryRun: true,
      topics,
    });
    assert.equal(result.summary.groups, 0);
    assert.equal(result.summary.uncertain, 1);
  });

  it('--since filters by last_refreshed', async () => {
    const topics: TopicPageInput[] = [
      {
        topicSlug: 'pop-migration',
        aliases: ['pop-mvp'],
        body: 'old body',
        lastRefreshed: '2026-04-01',
      },
      {
        topicSlug: 'pop-mvp',
        aliases: ['pop-migration'],
        body: 'new body',
        lastRefreshed: '2026-06-01',
      },
    ];
    const result = await runBackgroundDedup({
      scope: 'topics',
      dryRun: true,
      since: '2026-05-01',
      topics,
    });
    assert.equal(result.summary.totalIn, 1);
    assert.equal(result.summary.uncertain, 0);
  });
});

// ---------------------------------------------------------------------------
// Diff formatter
// ---------------------------------------------------------------------------

describe('formatBackgroundDedupDiff', () => {
  it('produces a stable dry-run markdown header', () => {
    const result: BackgroundDedupResult = {
      summary: {
        scope: 'commitments',
        totalIn: 2,
        groups: 1,
        duplicates: 1,
        uncertain: 0,
      },
      groups: [
        {
          canonicalKey: 'c1',
          canonicalText: 'Talk to Dave about staffing',
          duplicates: [
            {
              key: 'c2',
              text: 'Talk to Dave about staffing',
              jaccard: 1.0,
            },
          ],
        },
      ],
      candidates: [],
      diff: '',
    };
    const md = formatBackgroundDedupDiff({
      summary: result.summary,
      groups: result.groups,
      candidates: result.candidates,
      dryRun: true,
      since: '2026-06-01',
    });
    assert.ok(md.includes('# Background dedup diff — scope=commitments (dry-run)'));
    assert.ok(md.includes('Since: 2026-06-01'));
    assert.ok(md.includes('Canonical: c1'));
    assert.ok(md.includes('Duplicates (1):'));
  });
});
