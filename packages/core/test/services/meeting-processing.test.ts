import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processMeetingExtraction,
  extractUserNotes,
} from '../../src/services/meeting-processing.js';
import { normalizeForJaccard, jaccardSimilarity } from '../../src/services/meeting-extraction.js';
import type { MeetingExtractionResult, ActionItem, MeetingIntelligence } from '../../src/services/meeting-extraction.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockResult(
  overrides: Partial<MeetingIntelligence> = {},
): MeetingExtractionResult {
  return {
    intelligence: {
      summary: 'Test meeting summary',
      actionItems: [],
      nextSteps: [],
      decisions: [],
      learnings: [],
      ...overrides,
    },
    validationWarnings: [],
    rawItems: [],
  };
}

function createActionItem(
  description: string,
  confidence: number,
  overrides: Partial<ActionItem> = {},
): ActionItem {
  return {
    owner: 'John Smith',
    ownerSlug: 'john-smith',
    description,
    direction: 'i_owe_them',
    confidence,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractUserNotes
// ---------------------------------------------------------------------------

describe('extractUserNotes', () => {
  it('returns content without excluded sections', () => {
    const body = `## Notes
Some user notes here.

## Transcript
Speaker 1: Hello world.

## More Notes
More content.`;

    const result = extractUserNotes(body);
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('Some user notes here.'));
    assert.ok(result.includes('## More Notes'));
    assert.ok(result.includes('More content.'));
    assert.ok(!result.includes('## Transcript'));
    assert.ok(!result.includes('Speaker 1: Hello world.'));
  });

  it('excludes Staged Action Items section', () => {
    const body = `## Notes
User notes.

## Staged Action Items
- ai_001: Do something

## Summary
Meeting summary.`;

    const result = extractUserNotes(body);
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('## Summary'));
    assert.ok(!result.includes('## Staged Action Items'));
    assert.ok(!result.includes('ai_001'));
  });

  it('excludes Staged Decisions section', () => {
    const body = `## Notes
User notes.

## Staged Decisions
- de_001: A decision

## Summary
Meeting summary.`;

    const result = extractUserNotes(body);
    assert.ok(result.includes('## Notes'));
    assert.ok(!result.includes('## Staged Decisions'));
    assert.ok(!result.includes('de_001'));
  });

  it('excludes Staged Learnings section', () => {
    const body = `## Notes
User notes.

## Staged Learnings
- le_001: A learning

## Summary
Meeting summary.`;

    const result = extractUserNotes(body);
    assert.ok(result.includes('## Notes'));
    assert.ok(!result.includes('## Staged Learnings'));
    assert.ok(!result.includes('le_001'));
  });

  it('handles body with no excluded sections', () => {
    const body = `## Notes
Just some notes.

## Action Items
- Do this
- Do that`;

    const result = extractUserNotes(body);
    assert.equal(result, body);
  });

  it('handles empty body', () => {
    const result = extractUserNotes('');
    assert.equal(result, '');
  });

  it('is case-insensitive for header matching', () => {
    const body = `## TRANSCRIPT
Content to exclude.

## Notes
Content to keep.`;

    // The implementation lowercases headers before matching
    const result = extractUserNotes(body);
    // TRANSCRIPT (uppercase) should match 'transcript' (lowercase) in excludedHeaders
    assert.ok(!result.includes('## TRANSCRIPT'));
    assert.ok(!result.includes('Content to exclude.'));
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('Content to keep.'));
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - confidence filtering
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - confidence filtering', () => {
  it('excludes action items with confidence below 0.5', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Low confidence task', 0.4),
        createActionItem('High confidence task', 0.9),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.filteredItems[0].text, 'High confidence task');
    assert.equal(processed.filteredItems[0].id, 'ai_001');
  });

  it('includes action items with confidence exactly 0.5', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Borderline task', 0.5)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.filteredItems[0].text, 'Borderline task');
  });

  it('excludes all items below threshold', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task 1', 0.3),
        createActionItem('Task 2', 0.4),
        createActionItem('Task 3', 0.49),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 0);
  });

  it('uses custom confidenceInclude threshold when provided', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task 1', 0.6),
        createActionItem('Task 2', 0.7),
        createActionItem('Task 3', 0.8),
      ],
    });

    // Set threshold to 0.75 - only Task 3 should pass
    const processed = processMeetingExtraction(result, '', { confidenceInclude: 0.75 });
    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.filteredItems[0].text, 'Task 3');
  });

  it('handles action items without confidence (defaults to 0.9)', () => {
    const result = createMockResult({
      actionItems: [
        {
          owner: 'John',
          ownerSlug: 'john',
          description: 'No confidence field',
          direction: 'i_owe_them',
          // confidence is undefined
        } as ActionItem,
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.stagedItemConfidence['ai_001'], 0.9);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - dedup matching (Jaccard > 0.7)
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - dedup matching', () => {
  // Verify Jaccard math before testing
  it('verifies Jaccard calculation for test strings', () => {
    // Text A: "review the api documentation" (4 tokens)
    // Text B: "review the api documentation today" (5 tokens)
    // Intersection: 4, Union: 5, Jaccard: 0.8
    const tokensA = normalizeForJaccard('review the api documentation');
    const tokensB = normalizeForJaccard('review the api documentation today');

    assert.deepEqual(tokensA, ['review', 'the', 'api', 'documentation']);
    assert.deepEqual(tokensB, ['review', 'the', 'api', 'documentation', 'today']);

    const similarity = jaccardSimilarity(tokensA, tokensB);
    assert.equal(similarity, 0.8);
  });

  it('marks items as dedup when matching user notes (Jaccard > 0.7)', () => {
    const userNotes = 'review the api documentation today';
    const result = createMockResult({
      actionItems: [createActionItem('review the api documentation', 0.9)],
    });

    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['ai_001'], 'dedup');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
  });

  it('marks items as ai when not matching user notes (Jaccard < 0.7)', () => {
    const userNotes = 'send the email response';
    const result = createMockResult({
      actionItems: [createActionItem('review the api documentation', 0.9)],
    });

    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('uses custom dedupJaccard threshold when provided', () => {
    const userNotes = 'review the api documentation today';
    const result = createMockResult({
      actionItems: [createActionItem('review the api documentation', 0.9)],
    });

    // Jaccard is 0.8, so threshold 0.85 should NOT match
    const processed = processMeetingExtraction(result, userNotes, { dedupJaccard: 0.85 });
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('handles empty user notes (no dedup matches)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('review the api documentation', 0.9)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('applies dedup to decisions', () => {
    const userNotes = 'decided to use react for frontend';
    const result = createMockResult({
      decisions: ['decided to use react for frontend framework'],
    });

    // "decided to use react for frontend" (6 tokens)
    // "decided to use react for frontend framework" (7 tokens)
    // Intersection: 6, Union: 7, Jaccard: 6/7 ≈ 0.857 > 0.7
    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
    assert.equal(processed.stagedItemStatus['de_001'], 'approved');
  });

  it('applies dedup to learnings', () => {
    const userNotes = 'learned that caching improves performance';
    const result = createMockResult({
      learnings: ['learned that caching improves performance significantly'],
    });

    // "learned that caching improves performance" (5 tokens)
    // "learned that caching improves performance significantly" (6 tokens)
    // Intersection: 5, Union: 6, Jaccard: 5/6 ≈ 0.833 > 0.7
    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['le_001'], 'dedup');
    assert.equal(processed.stagedItemStatus['le_001'], 'approved');
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - auto-approval thresholds
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - auto-approval thresholds', () => {
  it('approves items with confidence > 0.8', () => {
    const result = createMockResult({
      actionItems: [createActionItem('High confidence task', 0.85)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('marks items with confidence 0.5-0.8 as pending', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task at 0.5', 0.5),
        createActionItem('Task at 0.6', 0.6),
        createActionItem('Task at 0.7', 0.7),
        createActionItem('Task at 0.8', 0.8),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending'); // 0.5
    assert.equal(processed.stagedItemStatus['ai_002'], 'pending'); // 0.6
    assert.equal(processed.stagedItemStatus['ai_003'], 'pending'); // 0.7
    assert.equal(processed.stagedItemStatus['ai_004'], 'pending'); // 0.8 (not > 0.8)
  });

  it('approves items with confidence exactly at boundary (0.81)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Just over boundary', 0.81)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
  });

  it('always approves dedup items regardless of confidence', () => {
    const userNotes = 'complete the task by friday';
    const result = createMockResult({
      actionItems: [createActionItem('complete the task by friday', 0.6)],
    });

    // Item has low confidence (0.6) but matches user notes exactly
    // Jaccard of identical strings = 1.0 > 0.7
    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['ai_001'], 'dedup');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
  });

  it('uses custom confidenceApproved threshold when provided', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task at 0.85', 0.85),
        createActionItem('Task at 0.95', 0.95),
      ],
    });

    // Set threshold to 0.9 - only 0.95 should be auto-approved
    const processed = processMeetingExtraction(result, '', { confidenceApproved: 0.9 });
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending'); // 0.85
    assert.equal(processed.stagedItemStatus['ai_002'], 'approved'); // 0.95
  });

  it('applies approval logic to decisions (default 0.9 confidence)', () => {
    const result = createMockResult({
      decisions: ['We will use TypeScript'],
    });

    // Decisions default to 0.9 confidence, which is > 0.8
    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['de_001'], 'approved');
    assert.equal(processed.stagedItemConfidence['de_001'], 0.9);
  });

  it('applies approval logic to learnings (default 0.9 confidence)', () => {
    const result = createMockResult({
      learnings: ['Caching helps performance'],
    });

    // Learnings default to 0.9 confidence, which is > 0.8
    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['le_001'], 'approved');
    assert.equal(processed.stagedItemConfidence['le_001'], 0.9);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - ID generation
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - ID generation', () => {
  it('generates IDs with correct prefix and padding', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Action 1', 0.9)],
      decisions: ['Decision 1'],
      learnings: ['Learning 1'],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems[0].id, 'ai_001');
    assert.equal(processed.filteredItems[1].id, 'de_001');
    assert.equal(processed.filteredItems[2].id, 'le_001');
  });

  it('increments IDs correctly for multiple items', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Action 1', 0.9),
        createActionItem('Action 2', 0.9),
        createActionItem('Action 3', 0.9),
      ],
      decisions: ['Decision 1', 'Decision 2'],
    });

    const processed = processMeetingExtraction(result, '');
    const actionItems = processed.filteredItems.filter((i) => i.type === 'action');
    const decisions = processed.filteredItems.filter((i) => i.type === 'decision');

    assert.equal(actionItems[0].id, 'ai_001');
    assert.equal(actionItems[1].id, 'ai_002');
    assert.equal(actionItems[2].id, 'ai_003');
    assert.equal(decisions[0].id, 'de_001');
    assert.equal(decisions[1].id, 'de_002');
  });

  it('maintains separate counters for each item type', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Action 1', 0.9)],
      decisions: ['Decision 1'],
      learnings: ['Learning 1'],
    });

    const processed = processMeetingExtraction(result, '');

    // All should start at 001
    assert.ok(processed.stagedItemStatus['ai_001']);
    assert.ok(processed.stagedItemStatus['de_001']);
    assert.ok(processed.stagedItemStatus['le_001']);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - metadata maps
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - metadata maps', () => {
  it('builds stagedItemConfidence map correctly', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task 1', 0.7),
        createActionItem('Task 2', 0.85),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemConfidence['ai_001'], 0.7);
    assert.equal(processed.stagedItemConfidence['ai_002'], 0.85);
  });

  it('builds stagedItemSource map correctly', () => {
    const userNotes = 'complete the task by friday';
    const result = createMockResult({
      actionItems: [
        createActionItem('complete the task by friday', 0.9), // will match
        createActionItem('something completely different', 0.9), // won't match
      ],
    });

    const processed = processMeetingExtraction(result, userNotes);
    assert.equal(processed.stagedItemSource['ai_001'], 'dedup');
    assert.equal(processed.stagedItemSource['ai_002'], 'ai');
  });

  it('builds stagedItemOwner map for action items with owner metadata', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task with owner', 0.9, {
          ownerSlug: 'john-smith',
          direction: 'i_owe_them',
          counterpartySlug: 'jane-doe',
        }),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.deepEqual(processed.stagedItemOwner['ai_001'], {
      ownerSlug: 'john-smith',
      direction: 'i_owe_them',
      counterpartySlug: 'jane-doe',
    });
  });

  it('omits owner metadata for items without owner fields', () => {
    const result = createMockResult({
      actionItems: [
        {
          owner: 'John',
          ownerSlug: '',
          description: 'Task without slugs',
          direction: 'i_owe_them',
          confidence: 0.9,
          // No counterpartySlug, empty ownerSlug
        } as ActionItem,
      ],
    });

    const processed = processMeetingExtraction(result, '');
    // Only direction should be in the map since ownerSlug is empty string (falsy)
    assert.deepEqual(processed.stagedItemOwner['ai_001'], { direction: 'i_owe_them' });
  });

  it('includes owner metadata in filteredItems', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task', 0.9, {
          ownerSlug: 'alice',
          direction: 'they_owe_me',
        }),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.deepEqual(processed.filteredItems[0].ownerMeta, {
      ownerSlug: 'alice',
      direction: 'they_owe_me',
    });
  });

  it('omits ownerMeta from filteredItems when no owner fields present', () => {
    const result = createMockResult({
      decisions: ['A decision'],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems[0].ownerMeta, undefined);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - edge cases
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - edge cases', () => {
  it('handles empty extraction result', () => {
    const result = createMockResult({
      actionItems: [],
      decisions: [],
      learnings: [],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 0);
    assert.deepEqual(processed.stagedItemStatus, {});
    assert.deepEqual(processed.stagedItemConfidence, {});
    assert.deepEqual(processed.stagedItemSource, {});
    assert.deepEqual(processed.stagedItemOwner, {});
  });

  it('handles mixed item types with filtering', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Valid action', 0.9),
        createActionItem('Invalid action', 0.3), // filtered
      ],
      decisions: ['Valid decision'],
      learnings: ['Valid learning'],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 3);
    assert.equal(
      processed.filteredItems.filter((i) => i.type === 'action').length,
      1,
    );
    assert.equal(
      processed.filteredItems.filter((i) => i.type === 'decision').length,
      1,
    );
    assert.equal(
      processed.filteredItems.filter((i) => i.type === 'learning').length,
      1,
    );
  });

  it('preserves item order within each type', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('First', 0.9),
        createActionItem('Second', 0.8),
        createActionItem('Third', 0.7),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems[0].text, 'First');
    assert.equal(processed.filteredItems[1].text, 'Second');
    assert.equal(processed.filteredItems[2].text, 'Third');
  });

  it('correctly assigns item types', () => {
    const result = createMockResult({
      actionItems: [createActionItem('An action', 0.9)],
      decisions: ['A decision'],
      learnings: ['A learning'],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems[0].type, 'action');
    assert.equal(processed.filteredItems[1].type, 'decision');
    assert.equal(processed.filteredItems[2].type, 'learning');
  });
});
