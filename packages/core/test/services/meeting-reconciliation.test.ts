import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileMeetingBatch,
  flattenExtractions,
  scoreRelevance,
  generateWhy,
  findDuplicates,
  matchPriorWorkspace,
  WORKSPACE_MATCH_THRESHOLD,
  type MeetingExtractionBatch,
  type DuplicateGroup,
  type WorkspaceMatch,
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
    assert.ok(result.items[0].annotations.why.includes('Area match'));
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

describe('generateWhy', () => {
  it('includes area slug when present', () => {
    assert.equal(
      generateWhy('high', { areaSlug: 'frontend' }),
      'HIGH: Area match (frontend)',
    );
  });

  it('includes person slug when present', () => {
    assert.equal(
      generateWhy('normal', { personSlug: 'alice' }),
      'NORMAL: Person match (alice)',
    );
  });

  it('generates default message for no matches', () => {
    assert.equal(
      generateWhy('low', {}),
      'LOW: No area/person/keyword matches',
    );
  });
});
