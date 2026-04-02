import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileMeetingBatch,
  flattenExtractions,
  scoreRelevance,
  generateWhy,
  type MeetingExtractionBatch,
} from '../../src/services/meeting-reconciliation.js';
import type {
  ReconciliationContext,
  AreaMemory,
} from '../../src/models/entities.js';
import type { MeetingIntelligence } from '../../src/services/meeting-extraction.js';

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
