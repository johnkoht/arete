import { describe, it, expect } from 'vitest';
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

    expect(result.items).toEqual([]);
    expect(result.stats).toEqual({
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

    expect(result.items).toHaveLength(3);
    expect(result.items[0].type).toBe('action');
    expect(result.items[0].meetingPath).toBe('meetings/2026-04-01-standup.md');
    expect(result.items[1].type).toBe('decision');
    expect(result.items[1].original).toBe('Use React for frontend');
    expect(result.items[2].type).toBe('learning');
    expect(result.items[2].original).toBe('Users prefer dark mode');
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

    expect(result.items).toHaveLength(4);
    // Verify source meeting paths
    expect(result.items[0].meetingPath).toBe('meetings/m1.md');
    expect(result.items[1].meetingPath).toBe('meetings/m1.md');
    expect(result.items[2].meetingPath).toBe('meetings/m2.md');
    expect(result.items[3].meetingPath).toBe('meetings/m2.md');
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
      expect(item.status).toBe('keep');
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

    expect(result.items).toHaveLength(1);
    expect(result.items[0].relevanceScore).toBe(0.3);
    expect(result.items[0].annotations.areaSlug).toBe('frontend');
    expect(result.items[0].annotations.why).toContain('Area match');
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

    expect(result.items[0].relevanceScore).toBe(0.3);
    expect(result.items[0].annotations.areaSlug).toBe('backend');
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

    expect(result.items[0].relevanceScore).toBe(0.6);
    expect(result.items[0].relevanceTier).toBe('normal');
  });

  it('marks items with no area match as low relevance', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['Use PostgreSQL'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    expect(result.items[0].relevanceScore).toBe(0);
    expect(result.items[0].relevanceTier).toBe('low');
    expect(result.items[0].annotations.why).toContain('No area/person/keyword matches');
  });

  it('counts low relevance items in stats', () => {
    const batch = [
      makeBatch('meetings/m1.md', {
        decisions: ['D1', 'D2'],
        learnings: ['L1'],
      }),
    ];

    const result = reconcileMeetingBatch(batch, makeContext());

    expect(result.stats.lowRelevanceCount).toBe(3);
    expect(result.stats.duplicatesRemoved).toBe(0);
    expect(result.stats.completedMatched).toBe(0);
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
    expect(result.items[0].annotations.areaSlug).toBe('platform');
    expect(result.items[0].relevanceScore).toBe(0.6);
  });
});

describe('flattenExtractions', () => {
  it('returns empty array for empty batch', () => {
    expect(flattenExtractions([])).toEqual([]);
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

    expect(items[0].owner).toBe('bob');
    expect(items[0].text).toBe('Task');
  });
});

describe('scoreRelevance', () => {
  it('returns zero score with no area memories', () => {
    const result = scoreRelevance(
      { original: 'test', type: 'decision', meetingPath: 'm.md', text: 'test' },
      makeContext(),
    );

    expect(result.score).toBe(0);
    expect(result.tier).toBe('low');
    expect(result.matchedArea).toBeUndefined();
  });
});

describe('generateWhy', () => {
  it('includes area slug when present', () => {
    expect(generateWhy('high', { areaSlug: 'frontend' })).toBe(
      'HIGH: Area match (frontend)',
    );
  });

  it('includes person slug when present', () => {
    expect(generateWhy('normal', { personSlug: 'alice' })).toBe(
      'NORMAL: Person match (alice)',
    );
  });

  it('generates default message for no matches', () => {
    expect(generateWhy('low', {})).toBe(
      'LOW: No area/person/keyword matches',
    );
  });
});
