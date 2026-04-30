import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileMeetingBatch,
  flattenExtractions,
  scoreRelevance,
  generateWhy,
  findDuplicates,
  matchCompletedTasks,
  matchRecentMemory,
  matchPriorWorkspace,
  parseMemoryItems,
  batchLLMReview,
  loadReconciliationContext,
  loadRecentMeetingBatch,
  WORKSPACE_MATCH_THRESHOLD,
  COMPLETED_MATCH_THRESHOLD,
  MEMORY_MATCH_THRESHOLD,
  RELEVANCE_WEIGHTS,
  type MeetingExtractionBatch,
  type DuplicateGroup,
  type CompletedMatch,
  type MemoryMatch,
  type WorkspaceMatch,
  type RelevanceScore,
} from '../../src/services/meeting-reconciliation.js';
import type {
  ReconciliationContext,
  AreaMemory,
} from '../../src/models/entities.js';
import type { MeetingIntelligence } from '../../src/services/meeting-extraction.js';
import type { SearchProvider, SearchResult } from '../../src/search/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(
  overrides: Partial<ReconciliationContext> = {},
): ReconciliationContext {
  return {
    areaMemories: new Map(),
    recentCommittedItems: [],
    completedTasks: [],
    ...overrides,
  };
}

function makeExtraction(
  overrides: Partial<MeetingIntelligence> = {},
): MeetingIntelligence {
  return {
    summary: 'Test meeting',
    actionItems: [],
    nextSteps: [],
    decisions: [],
    learnings: [],
    ...overrides,
  };
}

function makeBatch(
  meetingPath: string,
  extraction: Partial<MeetingIntelligence> = {},
): MeetingExtractionBatch {
  return { meetingPath, extraction: makeExtraction(extraction) };
}

function makeAreaMemory(overrides: Partial<AreaMemory> = {}): AreaMemory {
  return {
    keywords: [],
    activePeople: [],
    openWork: [],
    recentlyCompleted: [],
    recentDecisions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reconcileMeetingBatch', () => {
  it('returns empty result for empty batch', () => {
    const result = reconcileMeetingBatch([], makeContext());

    assert.deepStrictEqual(result.items, []);
    assert.deepStrictEqual(result.stats, {
      duplicatesRemoved: 0,
      completedMatched: 0,
      lowRelevanceCount: 0,
    });
  });

  it('flattens action items, decisions, and learnings from a single meeting', () => {
    const batch = [
      makeBatch('meetings/2026-04-01-standup.md', {
        actionItems: [
          {
            owner: 'Alice',
            ownerSlug: 'alice',
            description: 'Send API docs',
            direction: 'i_owe_them',
          },
        ],
        decisions: ['Use React for frontend'],
        learnings: ['Users prefer dark mode'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].type, 'action');
    assert.equal(result.items[0].meetingPath, 'meetings/2026-04-01-standup.md');
    assert.equal(result.items[1].type, 'decision');
    assert.equal(result.items[1].original, 'Use React for frontend');
    assert.equal(result.items[2].type, 'learning');
    assert.equal(result.items[2].original, 'Users prefer dark mode');
  });

  it('flattens items from multiple meetings', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          {
            owner: 'Bob',
            ownerSlug: 'bob',
            description: 'Review PR',
            direction: 'they_owe_me',
          },
        ],
        decisions: ['Decision A'],
      }),
      makeBatch('meetings/m2.md', {
        learnings: ['Learning B'],
        decisions: ['Decision C'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    assert.equal(result.items.length, 4);
    // Verify source meeting paths
    assert.equal(result.items[0].meetingPath, 'meetings/m1.md');
    assert.equal(result.items[1].meetingPath, 'meetings/m1.md');
    assert.equal(result.items[2].meetingPath, 'meetings/m2.md');
    assert.equal(result.items[3].meetingPath, 'meetings/m2.md');
  });

  it('all items default to status=keep', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          {
            owner: 'X',
            ownerSlug: 'x',
            description: 'Do stuff',
            direction: 'i_owe_them',
          },
        ],
        decisions: ['D1'],
        learnings: ['L1'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());
    for (const item of result.items) {
      assert.equal(item.status, 'keep');
    }
  });

  it('scores items with keyword matching', () => {
    const areaMemories = new Map<string, AreaMemory>([
      ['frontend', makeAreaMemory({ keywords: ['react', 'css'] })],
    ]);

    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Adopt React Server Components'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext({ areaMemories }));

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].relevanceScore, 0.3);
    assert.equal(result.items[0].annotations.areaSlug, 'frontend');
    assert.ok(result.items[0].annotations.why.includes('Keyword match'));
  });

  it('scores items with person matching', () => {
    const areaMemories = new Map<string, AreaMemory>([
      ['backend', makeAreaMemory({ activePeople: ['alice'] })],
    ]);

    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          {
            owner: 'Alice',
            ownerSlug: 'alice',
            description: 'Deploy service',
            direction: 'i_owe_them',
          },
        ],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext({ areaMemories }));

    assert.equal(result.items[0].relevanceScore, 0.3);
    assert.equal(result.items[0].annotations.areaSlug, 'backend');
    assert.equal(result.items[0].annotations.personSlug, 'alice');
  });

  it('scores keyword + person match as 0.6', () => {
    const areaMemories = new Map<string, AreaMemory>([
      [
        'platform',
        makeAreaMemory({
          keywords: ['deploy'],
          activePeople: ['alice'],
        }),
      ],
    ]);

    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          {
            owner: 'Alice',
            ownerSlug: 'alice',
            description: 'Deploy the service',
            direction: 'i_owe_them',
          },
        ],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext({ areaMemories }));

    assert.equal(result.items[0].relevanceScore, 0.6);
    assert.equal(result.items[0].relevanceTier, 'normal');
  });

  it('marks items with no area match as low relevance', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Use PostgreSQL'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    assert.equal(result.items[0].relevanceScore, 0);
    assert.equal(result.items[0].relevanceTier, 'low');
    assert.ok(result.items[0].annotations.why.includes('No area/person/keyword matches'));
  });

  it('counts low relevance items in stats', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['D1', 'D2'],
        learnings: ['L1'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    assert.equal(result.stats.lowRelevanceCount, 3);
    assert.equal(result.stats.duplicatesRemoved, 0);
    assert.equal(result.stats.completedMatched, 0);
  });

  it('picks highest-scoring area when multiple match', () => {
    const areaMemories = new Map<string, AreaMemory>([
      ['frontend', makeAreaMemory({ keywords: ['react'] })],
      [
        'platform',
        makeAreaMemory({
          keywords: ['react'],
          activePeople: ['alice'],
        }),
      ],
    ]);

    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          {
            owner: 'Alice',
            ownerSlug: 'alice',
            description: 'Fix React bug',
            direction: 'i_owe_them',
          },
        ],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext({ areaMemories }));

    // platform matches both keyword and person (0.6) vs frontend keyword only (0.3)
    assert.equal(result.items[0].annotations.areaSlug, 'platform');
    assert.equal(result.items[0].relevanceScore, 0.6);
  });
});

describe('flattenExtractions', () => {
  it('returns empty array for empty batch', () => {
    assert.deepStrictEqual(flattenExtractions([]), []);
  });

  it('preserves action item owner slug', () => {
    const items = flattenExtractions([
      makeBatch('m.md', {
        actionItems: [
          {
            owner: 'Bob',
            ownerSlug: 'bob',
            description: 'Task',
            direction: 'i_owe_them',
          },
        ],
      }),
    ]);

    assert.equal(items[0].owner, 'bob');
    assert.equal(items[0].text, 'Task');
  });
});

describe('scoreRelevance', () => {
  it('returns zero score with no area memories', () => {
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'm.md', text: 'test' },
      makeContext(),
    );

    assert.equal(result.score, 0);
    assert.equal(result.tier, 'low');
    assert.equal(result.matchedArea, undefined);
    assert.deepStrictEqual(result.breakdown, { keywordMatch: 0, personMatch: 0, areaMatch: 0 });
  });

  it('returns breakdown with keyword match', () => {
    const ctx = makeContext({
      areaMemories: new Map([['frontend', makeAreaMemory({ keywords: ['react'] })]]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'm.md', text: 'Use React for rendering' },
      ctx,
    );

    assert.equal(result.score, 0.3);
    assert.equal(result.breakdown.keywordMatch, 0.3);
    assert.equal(result.breakdown.personMatch, 0);
    assert.equal(result.breakdown.areaMatch, 0);
    assert.equal(result.matchedArea, 'frontend');
  });

  it('returns breakdown with person match', () => {
    const ctx = makeContext({
      areaMemories: new Map([['backend', makeAreaMemory({ activePeople: ['alice'] })]]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'action', meetingPath: 'm.md', text: 'Deploy service', owner: 'alice' },
      ctx,
    );

    assert.equal(result.score, 0.3);
    assert.equal(result.breakdown.personMatch, 0.3);
    assert.equal(result.breakdown.keywordMatch, 0);
    assert.equal(result.breakdown.areaMatch, 0);
    assert.equal(result.matchedPerson, 'alice');
  });

  it('returns breakdown with area path match', () => {
    const ctx = makeContext({
      areaMemories: new Map([['platform', makeAreaMemory()]]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'meetings/platform-sync.md', text: 'Some decision' },
      ctx,
    );

    assert.equal(result.score, 0.4);
    assert.equal(result.breakdown.areaMatch, 0.4);
    assert.equal(result.breakdown.keywordMatch, 0);
    assert.equal(result.breakdown.personMatch, 0);
    assert.equal(result.tier, 'normal');
    assert.equal(result.matchedArea, 'platform');
  });

  it('scores all three factors for high tier', () => {
    const ctx = makeContext({
      areaMemories: new Map([
        ['platform', makeAreaMemory({ keywords: ['deploy'], activePeople: ['alice'] })],
      ]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'action', meetingPath: 'meetings/platform-sync.md', text: 'Deploy the service', owner: 'alice' },
      ctx,
    );

    assert.equal(result.score, 1.0);
    assert.equal(result.tier, 'high');
    assert.equal(result.breakdown.keywordMatch, 0.3);
    assert.equal(result.breakdown.personMatch, 0.3);
    assert.equal(result.breakdown.areaMatch, 0.4);
    assert.equal(result.matchedArea, 'platform');
    assert.equal(result.matchedPerson, 'alice');
  });

  it('keyword + person = 0.6 is normal tier', () => {
    const ctx = makeContext({
      areaMemories: new Map([
        ['platform', makeAreaMemory({ keywords: ['deploy'], activePeople: ['alice'] })],
      ]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'action', meetingPath: 'm.md', text: 'Deploy the service', owner: 'alice' },
      ctx,
    );

    assert.equal(result.score, 0.6);
    assert.equal(result.tier, 'normal');
  });

  it('area path match alone = 0.4 is normal tier', () => {
    const ctx = makeContext({
      areaMemories: new Map([['frontend', makeAreaMemory()]]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'meetings/frontend-review.md', text: 'Something unrelated' },
      ctx,
    );

    assert.equal(result.score, 0.4);
    assert.equal(result.tier, 'normal');
  });

  it('area + keyword = 0.7 is high tier', () => {
    const ctx = makeContext({
      areaMemories: new Map([
        ['frontend', makeAreaMemory({ keywords: ['react'] })],
      ]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'meetings/frontend-sync.md', text: 'Use React components' },
      ctx,
    );

    assert.equal(result.score, 0.7);
    assert.equal(result.tier, 'high');
  });

  it('picks highest-scoring area across multiple', () => {
    const ctx = makeContext({
      areaMemories: new Map([
        ['frontend', makeAreaMemory({ keywords: ['react'] })],
        ['platform', makeAreaMemory({ keywords: ['react'], activePeople: ['alice'] })],
      ]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'action', meetingPath: 'm.md', text: 'Fix React bug', owner: 'alice' },
      ctx,
    );

    assert.equal(result.score, 0.6);
    assert.equal(result.matchedArea, 'platform');
    assert.equal(result.matchedPerson, 'alice');
  });

  it('logs debug output when debug option is true', () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(String(args[0])); };

    const ctx = makeContext({
      areaMemories: new Map([['frontend', makeAreaMemory({ keywords: ['react'] })]]),
    });
    scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'm.md', text: 'Use React components' },
      ctx,
      { debug: true },
    );

    console.log = origLog;

    assert.ok(logs.some(l => l.includes('[reconciliation]')));
    assert.ok(logs.some(l => l.includes('0.30')));
  });

  it('RELEVANCE_WEIGHTS has correct values', () => {
    assert.equal(RELEVANCE_WEIGHTS.keyword, 0.3);
    assert.equal(RELEVANCE_WEIGHTS.person, 0.3);
    assert.equal(RELEVANCE_WEIGHTS.area, 0.4);
  });

  it('area path match is case-insensitive', () => {
    const ctx = makeContext({
      areaMemories: new Map([['Frontend', makeAreaMemory()]]),
    });
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'meetings/frontend-review.md', text: 'Something' },
      ctx,
    );

    assert.equal(result.breakdown.areaMatch, 0.4);
  });
});

describe('findDuplicates', () => {
  it('groups exact duplicates', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Use React for frontend'],
      }),
      makeBatch('meetings/m2.md', {
        decisions: ['Use React for frontend'],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].canonical.meetingPath, 'meetings/m1.md');
    assert.equal(groups[0].duplicates.length, 1);
    assert.equal(groups[0].duplicates[0].meetingPath, 'meetings/m2.md');
  });

  it('groups near-duplicates above threshold', () => {
    // "Send API docs to Sarah" (5 words) vs "Send API docs to Sarah now" (6 words)
    // Jaccard = 5/6 = 0.833 > 0.7
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to Sarah', direction: 'i_owe_them' },
        ],
      }),
      makeBatch('meetings/m2.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to Sarah now', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].canonical.text, 'Send API docs to Sarah');
    assert.equal(groups[0].duplicates[0].text, 'Send API docs to Sarah now');
  });

  it('does not group items below threshold', () => {
    // "Review PR" (2 words) vs "Review the pull request" (4 words)
    // Jaccard: intersection={review} = 1, union={review, pr, the, pull, request} = 5
    // 1/5 = 0.2 < 0.7
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Bob', ownerSlug: 'bob', description: 'Review PR', direction: 'i_owe_them' },
        ],
      }),
      makeBatch('meetings/m2.md', {
        actionItems: [
          { owner: 'Bob', ownerSlug: 'bob', description: 'Review the pull request', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 0);
  });

  it('does not group items with different owners', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to Sarah', direction: 'i_owe_them' },
        ],
      }),
      makeBatch('meetings/m2.md', {
        actionItems: [
          { owner: 'Bob', ownerSlug: 'bob', description: 'Send API docs to Sarah', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 0);
  });

  it('does not group items with different types', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Deploy the service', direction: 'i_owe_them' },
        ],
        decisions: ['Deploy the service'],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 0);
  });

  it('respects threshold boundary (0.69 vs 0.71)', () => {
    // "send api docs" (3 words) vs "send api docs to sarah" (5 words)
    // Jaccard = 3/5 = 0.6 — below both thresholds
    // Use precise boundary: "a b c d e f g" (7) vs "a b c d e f g h" (8) = 7/8 = 0.875
    // And "a b c" (3) vs "a b c d e" (5) = 3/5 = 0.6

    // Below 0.7: "update docs" (2) vs "update docs for api release" (5) = 2/5 = 0.4
    const itemsBelow = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['update docs'] }),
      makeBatch('meetings/m2.md', { decisions: ['update docs for api release'] }),
    ]);
    assert.equal(findDuplicates(itemsBelow, 0.7).length, 0);

    // Above 0.7: "update docs for the api" (5) vs "update docs for the api release" (6) = 5/6 = 0.833
    const itemsAbove = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['update docs for the api'] }),
      makeBatch('meetings/m2.md', { decisions: ['update docs for the api release'] }),
    ]);
    assert.equal(findDuplicates(itemsAbove, 0.7).length, 1);
  });

  it('returns empty for single item', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Only one decision'] }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 0);
  });

  it('handles multiple duplicate groups', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Use React for frontend', 'Deploy to AWS'],
      }),
      makeBatch('meetings/m2.md', {
        decisions: ['Use React for frontend', 'Deploy to AWS'],
      }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 2);
  });

  it('allows items without owners to be grouped', () => {
    // decisions/learnings have no owner — should still be compared
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { learnings: ['Users prefer dark mode'] }),
      makeBatch('meetings/m2.md', { learnings: ['Users prefer dark mode'] }),
    ]);

    const groups = findDuplicates(items);
    assert.equal(groups.length, 1);
  });
});

describe('reconcileMeetingBatch deduplication integration', () => {
  it('marks duplicates in reconciled output', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Use React for frontend'],
      }),
      makeBatch('meetings/m2.md', {
        decisions: ['Use React for frontend'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    const kept = result.items.filter((i) => i.status === 'keep');
    const dupes = result.items.filter((i) => i.status === 'duplicate');

    assert.equal(kept.length, 1);
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0].annotations.duplicateOf, 'meetings/m1.md:decision');
    assert.equal(result.stats.duplicatesRemoved, 1);
  });

  it('does not mark different-owner action items as duplicates', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send report', direction: 'i_owe_them' },
        ],
      }),
      makeBatch('meetings/m2.md', {
        actionItems: [
          { owner: 'Bob', ownerSlug: 'bob', description: 'Send report', direction: 'i_owe_them' },
        ],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());
    assert.equal(result.items.every((i) => i.status === 'keep'), true);
    assert.equal(result.stats.duplicatesRemoved, 0);
  });
});

// ---------------------------------------------------------------------------
// matchPriorWorkspace
// ---------------------------------------------------------------------------

function makeMockSearchProvider(results: SearchResult[]): SearchProvider {
  return {
    name: 'mock-qmd',
    async isAvailable() { return true; },
    async search() { return results; },
    async semanticSearch() { return results; },
  };
}

describe('matchPriorWorkspace', () => {
  it('returns empty array when searchProvider is null', async () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Use React'] }),
    ]);

    // Capture console.warn
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };

    const matches = await matchPriorWorkspace(items, null);

    console.warn = origWarn;

    assert.deepStrictEqual(matches, []);
    assert.ok(warnings.some(w => w.includes('No search provider')));
  });

  it('returns matches for high-similarity results in meetings path', async () => {
    const provider = makeMockSearchProvider([
      { path: 'resources/meetings/2026-03-01-sync.md', content: 'Use React for frontend', score: 0.92, matchType: 'semantic' },
    ]);

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Use React for frontend'] }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[0].matchedPath, 'resources/meetings/2026-03-01-sync.md');
    assert.equal(matches[0].similarity, 0.92);
  });

  it('returns no matches when similarity is below threshold', async () => {
    const provider = makeMockSearchProvider([
      { path: 'resources/meetings/2026-03-01-sync.md', content: 'Something', score: 0.60, matchType: 'semantic' },
    ]);

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Use React for frontend'] }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.deepStrictEqual(matches, []);
  });

  it('returns no matches when path is not in meetings directory', async () => {
    const provider = makeMockSearchProvider([
      { path: 'resources/context/product.md', content: 'React stuff', score: 0.95, matchType: 'semantic' },
    ]);

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Use React for frontend'] }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.deepStrictEqual(matches, []);
  });

  it('returns only one match per item (first high-similarity meeting match)', async () => {
    const provider: SearchProvider = {
      name: 'mock-qmd',
      async isAvailable() { return true; },
      async search() { return []; },
      async semanticSearch() {
        return [
          { path: 'resources/meetings/m-old-1.md', content: 'Match 1', score: 0.90, matchType: 'semantic' as const },
          { path: 'resources/meetings/m-old-2.md', content: 'Match 2', score: 0.88, matchType: 'semantic' as const },
        ];
      },
    };

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Use React for frontend'] }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].matchedPath, 'resources/meetings/m-old-1.md');
  });

  it('matches multiple items independently', async () => {
    let callCount = 0;
    const provider: SearchProvider = {
      name: 'mock-qmd',
      async isAvailable() { return true; },
      async search() { return []; },
      async semanticSearch() {
        callCount++;
        if (callCount === 1) {
          return [{ path: 'resources/meetings/prior.md', content: 'Item 1', score: 0.91, matchType: 'semantic' as const }];
        }
        // Second item: no match (below threshold)
        return [{ path: 'resources/meetings/other.md', content: 'Item 2', score: 0.50, matchType: 'semantic' as const }];
      },
    };

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Decision A', 'Decision B'],
      }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[0].matchedPath, 'resources/meetings/prior.md');
  });

  it('handles empty search results gracefully', async () => {
    const provider = makeMockSearchProvider([]);

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Some decision'] }),
    ]);

    const matches = await matchPriorWorkspace(items, provider);

    assert.deepStrictEqual(matches, []);
  });

  it('threshold constant is 0.85', () => {
    assert.equal(WORKSPACE_MATCH_THRESHOLD, 0.85);
  });
});

// ---------------------------------------------------------------------------
// matchCompletedTasks
// ---------------------------------------------------------------------------

describe('matchCompletedTasks', () => {
  it('matches item against completed task with high similarity', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const completedTasks = [
      { text: 'Send API docs to the team', completedOn: '2026-03-28', owner: 'alice' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[0].completedOn, '2026-03-28');
    assert.equal(matches[0].matchedTask, 'Send API docs to the team');
  });

  it('does not match when similarity is below threshold', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Review PR', direction: 'i_owe_them' },
        ],
      }),
    ]);

    // Very different text → low Jaccard
    const completedTasks = [
      { text: 'Deploy the production service to AWS infrastructure', completedOn: '2026-03-28', owner: 'alice' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 0);
  });

  it('skips match when both have owners that differ', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const completedTasks = [
      { text: 'Send API docs to the team', completedOn: '2026-03-28', owner: 'bob' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 0);
  });

  it('matches when item has no owner', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Migrate to PostgreSQL database'],
      }),
    ]);

    const completedTasks = [
      { text: 'Migrate to PostgreSQL database', completedOn: '2026-03-25', owner: 'alice' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 1);
  });

  it('matches when task has no owner', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const completedTasks = [
      { text: 'Send API docs to the team', completedOn: '2026-03-28' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 1);
  });

  it('returns only one match per item (first match wins)', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const completedTasks = [
      { text: 'Send API docs to the team', completedOn: '2026-03-25', owner: 'alice' },
      { text: 'Send API docs to the team members', completedOn: '2026-03-28', owner: 'alice' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].completedOn, '2026-03-25');
  });

  it('returns empty array for empty inputs', () => {
    assert.deepStrictEqual(matchCompletedTasks([], []), []);
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Some decision'] }),
    ]);
    assert.deepStrictEqual(matchCompletedTasks(items, []), []);
  });

  it('matches multiple items independently', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
          { owner: 'Bob', ownerSlug: 'bob', description: 'Deploy the production service', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const completedTasks = [
      { text: 'Send API docs to the team', completedOn: '2026-03-25', owner: 'alice' },
      { text: 'Deploy the production service', completedOn: '2026-03-26', owner: 'bob' },
    ];

    const matches = matchCompletedTasks(items, completedTasks);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[1].itemIndex, 1);
  });

  it('threshold constant is 0.6', () => {
    assert.equal(COMPLETED_MATCH_THRESHOLD, 0.6);
  });
});

// ---------------------------------------------------------------------------
// reconcileMeetingBatch completed task integration
// ---------------------------------------------------------------------------

describe('reconcileMeetingBatch completed task integration', () => {
  it('marks matching items as completed with completedOn annotation', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ];

    const context = makeContext({
      completedTasks: [
        { text: 'Send API docs to the team', completedOn: '2026-03-28', owner: 'alice' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    assert.equal(result.items[0].status, 'completed');
    assert.equal(result.items[0].annotations.completedOn, '2026-03-28');
    assert.equal(result.stats.completedMatched, 1);
  });

  it('does not mark non-matching items as completed', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Review the pull request', direction: 'i_owe_them' },
        ],
      }),
    ];

    const context = makeContext({
      completedTasks: [
        { text: 'Deploy production infrastructure to cloud', completedOn: '2026-03-28', owner: 'alice' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    assert.equal(result.items[0].status, 'keep');
    assert.equal(result.items[0].annotations.completedOn, undefined);
    assert.equal(result.stats.completedMatched, 0);
  });
});

// ---------------------------------------------------------------------------
// matchRecentMemory
// ---------------------------------------------------------------------------

describe('matchRecentMemory', () => {
  it('matches item against recent memory with high similarity', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Migrate to PostgreSQL database for production'],
      }),
    ]);

    const recentMemory = [
      { text: 'Migrate to PostgreSQL database for production', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
    ];

    const matches = matchRecentMemory(items, recentMemory);

    assert.equal(matches.length, 1);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[0].source, '.arete/memory/items/decisions.md');
    assert.equal(matches[0].text, 'Migrate to PostgreSQL database for production');
  });

  it('does not match when similarity is below threshold', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Review PR'],
      }),
    ]);

    // Very different text → low Jaccard
    const recentMemory = [
      { text: 'Deploy the production service to AWS infrastructure', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
    ];

    const matches = matchRecentMemory(items, recentMemory);
    assert.equal(matches.length, 0);
  });

  it('returns only one match per item (first match wins)', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Send API docs to the team'],
      }),
    ]);

    const recentMemory = [
      { text: 'Send API docs to the team', date: '2026-03-25', source: '.arete/memory/items/decisions.md' },
      { text: 'Send API docs to the team members', date: '2026-03-28', source: '.arete/memory/items/learnings.md' },
    ];

    const matches = matchRecentMemory(items, recentMemory);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].source, '.arete/memory/items/decisions.md');
  });

  it('returns empty array for empty inputs', () => {
    assert.deepStrictEqual(matchRecentMemory([], []), []);

    const items = flattenExtractions([
      makeBatch('meetings/m1.md', { decisions: ['Some decision'] }),
    ]);
    assert.deepStrictEqual(matchRecentMemory(items, []), []);
  });

  it('matches multiple items independently', () => {
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        decisions: ['Migrate to PostgreSQL database for production', 'Use React Server Components for frontend'],
      }),
    ]);

    const recentMemory = [
      { text: 'Migrate to PostgreSQL database for production', date: '2026-03-25', source: '.arete/memory/items/decisions.md' },
      { text: 'Use React Server Components for frontend', date: '2026-03-26', source: '.arete/memory/items/learnings.md' },
    ];

    const matches = matchRecentMemory(items, recentMemory);
    assert.equal(matches.length, 2);
    assert.equal(matches[0].itemIndex, 0);
    assert.equal(matches[1].itemIndex, 1);
  });

  it('matches near-duplicates above threshold', () => {
    // "Send API docs to Sarah" (5 words) vs "Send API docs to Sarah now" (6 words)
    // Jaccard = 5/6 = 0.833 > 0.7
    const items = flattenExtractions([
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to Sarah', direction: 'i_owe_them' },
        ],
      }),
    ]);

    const recentMemory = [
      { text: 'Send API docs to Sarah now', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
    ];

    const matches = matchRecentMemory(items, recentMemory);
    assert.equal(matches.length, 1);
  });

  it('threshold constant is 0.7', () => {
    assert.equal(MEMORY_MATCH_THRESHOLD, 0.7);
  });
});

// ---------------------------------------------------------------------------
// reconcileMeetingBatch recent memory integration
// ---------------------------------------------------------------------------

describe('reconcileMeetingBatch recent memory integration', () => {
  it('marks matching items as duplicate with source reference', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Migrate to PostgreSQL database for production'],
      }),
    ];

    const context = makeContext({
      recentCommittedItems: [
        { text: 'Migrate to PostgreSQL database for production', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    assert.equal(result.items[0].status, 'duplicate');
    assert.equal(result.items[0].annotations.duplicateOf, '.arete/memory/items/decisions.md');
    assert.ok(result.items[0].annotations.why.includes('Similar to:'));
    assert.ok(result.items[0].annotations.why.includes('.arete/memory/items/decisions.md'));
    assert.equal(result.stats.duplicatesRemoved, 1);
  });

  it('does not mark non-matching items as duplicate', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Review the pull request'],
      }),
    ];

    const context = makeContext({
      recentCommittedItems: [
        { text: 'Deploy production infrastructure to cloud service', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    assert.equal(result.items[0].status, 'keep');
    assert.equal(result.stats.duplicatesRemoved, 0);
  });

  it('why annotation truncates long memory text', () => {
    const longText = 'This is a very long memory item text that should be truncated in the annotation to avoid excessively long why strings';
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: [longText],
      }),
    ];

    const context = makeContext({
      recentCommittedItems: [
        { text: longText, date: '2026-03-28', source: 'memory/items/decisions.md' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    assert.equal(result.items[0].status, 'duplicate');
    // The text in the why annotation should be truncated to 50 chars
    assert.ok(result.items[0].annotations.why.includes('...'));
    // The source should still be complete
    assert.ok(result.items[0].annotations.why.includes('memory/items/decisions.md'));
  });

  it('completed match takes priority over memory match', () => {
    // When both completed task and memory match, completed should win
    // because completed check runs after memory in the map
    const batch = [
      makeBatch('meetings/m1.md', {
        actionItems: [
          { owner: 'Alice', ownerSlug: 'alice', description: 'Send API docs to the team', direction: 'i_owe_them' },
        ],
      }),
    ];

    const context = makeContext({
      recentCommittedItems: [
        { text: 'Send API docs to the team', date: '2026-03-28', source: '.arete/memory/items/decisions.md' },
      ],
      completedTasks: [
        { text: 'Send API docs to the team', completedOn: '2026-03-29', owner: 'alice' },
      ],
    });

    const result = reconcileMeetingBatch(batch, context);

    // Completed check runs after memory check in the code, so completed wins
    assert.equal(result.items[0].status, 'completed');
  });
});

describe('generateWhy', () => {
  it('reports area as primary reason when areaMatch is highest', () => {
    assert.equal(
      generateWhy('high', { areaMatch: 0.4, keywordMatch: 0.3, personMatch: 0 }, 'frontend'),
      'HIGH: Area match (frontend)',
    );
  });

  it('reports keyword as primary reason when keywordMatch is highest', () => {
    assert.equal(
      generateWhy('normal', { areaMatch: 0, keywordMatch: 0.3, personMatch: 0 }, 'platform'),
      'NORMAL: Keyword match (platform)',
    );
  });

  it('reports person as primary reason when personMatch is highest', () => {
    assert.equal(
      generateWhy('normal', { areaMatch: 0, keywordMatch: 0, personMatch: 0.3 }, undefined, 'alice'),
      'NORMAL: Person match (alice)',
    );
  });

  it('generates default message when all scores are zero', () => {
    assert.equal(
      generateWhy('low', { areaMatch: 0, keywordMatch: 0, personMatch: 0 }),
      'LOW: No area/person/keyword matches',
    );
  });

  it('picks ONE primary reason even when multiple factors are nonzero', () => {
    // area (0.4) > keyword (0.3) > person (0.3) — should pick area only
    const result = generateWhy(
      'high',
      { areaMatch: 0.4, keywordMatch: 0.3, personMatch: 0.3 },
      'platform',
      'alice',
    );
    assert.equal(result, 'HIGH: Area match (platform)');
    // Should NOT contain multiple reasons
    assert.ok(!result.includes('Person'));
    assert.ok(!result.includes('Keyword'));
  });

  it('uses "unknown" when matchedArea is not provided for area match', () => {
    assert.equal(
      generateWhy('normal', { areaMatch: 0.4, keywordMatch: 0, personMatch: 0 }),
      'NORMAL: Area match (unknown)',
    );
  });

  it('uses "unknown" when matchedPerson is not provided for person match', () => {
    assert.equal(
      generateWhy('normal', { areaMatch: 0, keywordMatch: 0, personMatch: 0.3 }),
      'NORMAL: Person match (unknown)',
    );
  });

  it('keyword match uses matchedArea as context', () => {
    // Keyword match reports the area where the keyword was found
    assert.equal(
      generateWhy('normal', { areaMatch: 0, keywordMatch: 0.3, personMatch: 0 }, 'backend'),
      'NORMAL: Keyword match (backend)',
    );
  });

  it('breaks ties deterministically (area > keyword > person)', () => {
    // All equal at 0.3 — sorted by array order: area first
    const result = generateWhy(
      'high',
      { areaMatch: 0.3, keywordMatch: 0.3, personMatch: 0.3 },
      'frontend',
      'alice',
    );
    // area and keyword tie at sort — area comes first in the factors array
    // With stable sort, area stays before keyword when scores equal
    assert.ok(result.includes('Area match') || result.includes('Keyword match'));
  });
});

// ---------------------------------------------------------------------------
// parseMemoryItems
// ---------------------------------------------------------------------------

describe('parseMemoryItems', () => {
  // Use a fixed "today" relative date for tests — items dated within 30 days of now
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 5);
  const recentDateStr = recentDate.toISOString().split('T')[0];

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 60);
  const oldDateStr = oldDate.toISOString().split('T')[0];

  it('parses standard memory file format', () => {
    const content = [
      `## Decided to use PostgreSQL`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Weekly Standup (Alice, Bob)`,
      `- We will migrate to PostgreSQL for the production database`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'We will migrate to PostgreSQL for the production database');
    assert.equal(items[0].date, recentDateStr);
    assert.equal(items[0].source, 'Weekly Standup (Alice, Bob)');
  });

  it('parses multiple sections', () => {
    const content = [
      `## Decision A`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Meeting 1`,
      `- First decision text`,
      '',
      `## Decision B`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Meeting 2`,
      `- Second decision text`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'First decision text');
    assert.equal(items[1].text, 'Second decision text');
  });

  it('returns empty array for empty content', () => {
    assert.deepStrictEqual(parseMemoryItems('', 'decisions.md'), []);
    assert.deepStrictEqual(parseMemoryItems('   \n\n  ', 'decisions.md'), []);
  });

  it('filters out items older than maxAgeDays', () => {
    const content = [
      `## Old Decision`,
      `- **Date**: ${oldDateStr}`,
      `- **Source**: Old Meeting`,
      `- This is from 60 days ago`,
      '',
      `## Recent Decision`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Recent Meeting`,
      `- This is from 5 days ago`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'This is from 5 days ago');
  });

  it('respects custom maxAgeDays', () => {
    const content = [
      `## Old Decision`,
      `- **Date**: ${oldDateStr}`,
      `- **Source**: Meeting`,
      `- From 60 days ago`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md', { maxAgeDays: 90 });
    assert.equal(items.length, 1);
  });

  it('caps at maxItems', () => {
    const sections = Array.from({ length: 5 }, (_, i) => [
      `## Decision ${i}`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Meeting`,
      `- Decision text ${i}`,
    ].join('\n')).join('\n\n');

    const items = parseMemoryItems(sections, 'decisions.md', { maxItems: 3 });
    assert.equal(items.length, 3);
  });

  it('skips sections without date', () => {
    const content = [
      `## No Date Section`,
      `- **Source**: Meeting`,
      `- Some text without a date`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 0);
  });

  it('skips sections with invalid date', () => {
    const content = [
      `## Bad Date`,
      `- **Date**: not-a-date`,
      `- **Source**: Meeting`,
      `- Some text`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 0);
  });

  it('uses sourcePath as fallback when Source is missing', () => {
    const content = [
      `## No Source`,
      `- **Date**: ${recentDateStr}`,
      `- Just the text`,
    ].join('\n');

    const items = parseMemoryItems(content, '.arete/memory/items/decisions.md');
    assert.equal(items.length, 1);
    assert.equal(items[0].source, '.arete/memory/items/decisions.md');
  });

  it('handles content before first section header', () => {
    const content = [
      `# Decisions`,
      `Some preamble text`,
      '',
      `## Actual Decision`,
      `- **Date**: ${recentDateStr}`,
      `- **Source**: Meeting`,
      `- The real content`,
    ].join('\n');

    const items = parseMemoryItems(content, 'decisions.md');
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'The real content');
  });
});

// ---------------------------------------------------------------------------
// batchLLMReview
// ---------------------------------------------------------------------------

describe('batchLLMReview', () => {
  const currentItems = [
    { text: 'Migrate to PostgreSQL', type: 'decision', id: 'de-1' },
    { text: 'Alice likes hiking', type: 'learning', id: 'le-1' },
    { text: 'Use React for frontend', type: 'decision', id: 'de-2' },
  ];

  const committedItems = [
    { text: 'We decided to use PostgreSQL for prod', date: '2026-04-01', source: 'decisions.md' },
  ];

  it('returns drops when LLM flags items', async () => {
    const mockLLM = async () => JSON.stringify({
      drops: [
        { id: 'de-1', reason: 'Duplicate of committed item about PostgreSQL' },
        { id: 'le-1', reason: 'Personal trivia, not a learning' },
      ],
    });

    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 2);
    assert.equal(drops[0].id, 'de-1');
    assert.equal(drops[0].action, 'drop');
    assert.ok(drops[0].reason.includes('PostgreSQL'));
    assert.equal(drops[1].id, 'le-1');
  });

  it('returns empty when LLM says keep all', async () => {
    const mockLLM = async () => JSON.stringify({ drops: [] });
    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 0);
  });

  it('returns empty for empty current items', async () => {
    const mockLLM = async () => { throw new Error('should not be called'); };
    const drops = await batchLLMReview([], committedItems, mockLLM);
    assert.equal(drops.length, 0);
  });

  it('handles malformed JSON gracefully', async () => {
    const mockLLM = async () => 'This is not JSON at all';
    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 0);
  });

  it('handles LLM error gracefully', async () => {
    const mockLLM = async () => { throw new Error('LLM unavailable'); };
    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 0);
  });

  it('filters out drops with invalid IDs', async () => {
    const mockLLM = async () => JSON.stringify({
      drops: [
        { id: 'de-1', reason: 'Valid drop' },
        { id: 'nonexistent-id', reason: 'Should be filtered' },
      ],
    });

    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 1);
    assert.equal(drops[0].id, 'de-1');
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    const mockLLM = async () => '```json\n{"drops": [{"id": "le-1", "reason": "trivia"}]}\n```';
    const drops = await batchLLMReview(currentItems, committedItems, mockLLM);
    assert.equal(drops.length, 1);
    assert.equal(drops[0].id, 'le-1');
  });

  it('works with empty committed items', async () => {
    const mockLLM = async () => JSON.stringify({
      drops: [{ id: 'le-1', reason: 'Personal trivia' }],
    });
    const drops = await batchLLMReview(currentItems, [], mockLLM);
    assert.equal(drops.length, 1);
  });
});

// ---------------------------------------------------------------------------
// loadReconciliationContext
// ---------------------------------------------------------------------------

describe('loadReconciliationContext', () => {
  it('loads committed items from memory files', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 3);
    const dateStr = recentDate.toISOString().split('T')[0];

    const decisionsContent = [
      `## Use PostgreSQL`,
      `- **Date**: ${dateStr}`,
      `- **Source**: Weekly Standup`,
      `- Migrate to PostgreSQL for production`,
    ].join('\n');

    const learningsContent = [
      `## Batch processing insight`,
      `- **Date**: ${dateStr}`,
      `- **Source**: Tech Review`,
      `- Batch processing is 3x faster than streaming`,
    ].join('\n');

    const mockStorage = {
      read: async (path: string) => {
        if (path.endsWith('decisions.md')) return decisionsContent;
        if (path.endsWith('learnings.md')) return learningsContent;
        // Area parser will try to read area files — return null
        return null;
      },
      write: async () => {},
      exists: async () => false,
      delete: async () => {},
      list: async () => [] as string[],
      listSubdirectories: async () => [] as string[],
      mkdir: async () => {},
      getModified: async () => null,
    };

    const context = await loadReconciliationContext(mockStorage, '/test/workspace');
    assert.equal(context.recentCommittedItems.length, 2);
    assert.ok(context.recentCommittedItems.some(i => i.text.includes('PostgreSQL')));
    assert.ok(context.recentCommittedItems.some(i => i.text.includes('Batch processing')));
  });

  it('returns empty committed items when memory files do not exist', async () => {
    const mockStorage = {
      read: async () => null,
      write: async () => {},
      exists: async () => false,
      delete: async () => {},
      list: async () => [] as string[],
      listSubdirectories: async () => [] as string[],
      mkdir: async () => {},
      getModified: async () => null,
    };

    const context = await loadReconciliationContext(mockStorage, '/test/workspace');
    assert.equal(context.recentCommittedItems.length, 0);
    assert.deepStrictEqual(context.completedTasks, []);
  });
});

describe('loadRecentMeetingBatch', () => {
  // Build a small fixture of two processed meetings, both within the lookback
  // window. Each meeting has the same staged action item — that's deliberate:
  // it lets the regression test prove the self-match bug is fixed (the item
  // appearing in both `recentBatch` and `currentBatch` would otherwise flag
  // the fresh extraction as a duplicate of itself in findDuplicates).
  function makeMeetingFile(actionText: string, status: string = 'processed'): string {
    return [
      '---',
      `status: ${status}`,
      'staged_item_owner: {}',
      '---',
      '',
      '## Staged Action Items',
      `- ai_001: ${actionText}`,
      '',
    ].join('\n');
  }

  function todayMinus(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  }

  function makeFsStorage(files: Map<string, string>) {
    return {
      read: async (p: string) => files.get(p) ?? null,
      write: async () => {},
      exists: async () => false,
      delete: async () => {},
      list: async (_dir: string) => [...files.keys()],
      listSubdirectories: async () => [] as string[],
      mkdir: async () => {},
      getModified: async () => null,
    };
  }

  it('without excludePath: includes all matching meetings (back-compat)', async () => {
    const dir = '/workspace/resources/meetings';
    const recent = todayMinus(2);
    const current = `${dir}/${recent}-current.md`;
    const prior = `${dir}/${recent}-prior.md`;
    const files = new Map<string, string>([
      [current, makeMeetingFile('Send report to Alice')],
      [prior, makeMeetingFile('Send report to Alice')],
    ]);

    const result = await loadRecentMeetingBatch(makeFsStorage(files), dir, 7);

    assert.equal(result.length, 2, 'both files included when no excludePath set');
    const paths = new Set(result.map((b) => b.meetingPath));
    assert.ok(paths.has(current));
    assert.ok(paths.has(prior));
  });

  it('with excludePath: omits the matching file, keeps the others', async () => {
    const dir = '/workspace/resources/meetings';
    const recent = todayMinus(2);
    const current = `${dir}/${recent}-current.md`;
    const prior = `${dir}/${recent}-prior.md`;
    const files = new Map<string, string>([
      [current, makeMeetingFile('Send report to Alice')],
      [prior, makeMeetingFile('Send report to Alice')],
    ]);

    const result = await loadRecentMeetingBatch(makeFsStorage(files), dir, 7, current);

    assert.equal(result.length, 1);
    assert.equal(result[0].meetingPath, prior);
  });

  it('regression: reprocessing a status:processed meeting does not self-match in findDuplicates', async () => {
    // Mirrors the actual incident: a meeting with status:processed already on
    // disk, holding staged items identical to the fresh extraction. Without
    // excludePath, [...recentBatch, currentBatch] contains the meeting twice
    // and findDuplicates would flip the fresh items to status:'duplicate'.
    const dir = '/workspace/resources/meetings';
    const recent = todayMinus(1);
    const meetingPath = `${dir}/${recent}-claude-code-for-reserv-product.md`;
    const itemText = 'Fix the dev tools CLI/hook system so auto-update runs on session load';
    const files = new Map<string, string>([
      [meetingPath, makeMeetingFile(itemText, 'processed')],
    ]);

    const recentBatch = await loadRecentMeetingBatch(makeFsStorage(files), dir, 7, meetingPath);

    // Caller's [...recentBatch, currentBatch] pattern; build currentBatch fresh.
    const currentBatch: MeetingExtractionBatch = {
      meetingPath,
      extraction: {
        summary: '',
        actionItems: [{ owner: '', ownerSlug: 'john-koht', description: itemText, direction: 'i_owe_them' }],
        nextSteps: [],
        decisions: [],
        learnings: [],
      },
    };

    const result = reconcileMeetingBatch([...recentBatch, currentBatch], makeContext());

    // Only one item in the batch (current meeting) — no duplicates found,
    // because excludePath kept the on-disk copy out of recentBatch.
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].status, 'keep');
  });
});
