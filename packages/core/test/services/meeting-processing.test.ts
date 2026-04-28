import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processMeetingExtraction,
  extractUserNotes,
  clearApprovedSections,
  formatFilteredStagedSections,
  hasNegationMarkers,
  calculateSpeakingRatio,
  inferUrgency,
} from '../../src/services/meeting-processing.js';
import type { FilteredItem } from '../../src/services/meeting-processing.js';
import { normalizeForJaccard, jaccardSimilarity } from '../../src/services/meeting-extraction.js';
import type { MeetingExtractionResult, ActionItem, MeetingIntelligence, PriorItem } from '../../src/services/meeting-extraction.js';

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
  it('excludes action items with confidence below 0.65', () => {
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

  it('excludes action items with confidence exactly 0.5 (below 0.65 threshold)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Borderline task', 0.5)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.filteredItems.length, 0);
  });

  it('includes action items with confidence exactly 0.65', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Borderline task', 0.65)],
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
// processMeetingExtraction - priorItems dedup
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - priorItems dedup', () => {
  // Verify Jaccard math before testing (per LEARNINGS.md)
  it('verifies Jaccard calculation for priorItems test strings', () => {
    // Prior: "use typescript for all new code" (6 tokens)
    // New:   "use typescript for all new code today" (7 tokens)
    // Intersection: 6, Union: 7, Jaccard: 6/7 ≈ 0.857 > 0.7
    const tokensPrior = normalizeForJaccard('use typescript for all new code');
    const tokensNew = normalizeForJaccard('use typescript for all new code today');

    assert.deepEqual(tokensPrior, ['use', 'typescript', 'for', 'all', 'new', 'code']);
    assert.deepEqual(tokensNew, ['use', 'typescript', 'for', 'all', 'new', 'code', 'today']);

    const similarity = jaccardSimilarity(tokensPrior, tokensNew);
    assert.ok(similarity > 0.7, `Expected similarity > 0.7, got ${similarity}`);
    assert.equal(similarity.toFixed(3), '0.857');
  });

  it('verifies Jaccard calculation for low similarity (no dedup)', () => {
    // Prior: "use typescript for new code" (5 tokens)
    // New:   "implement caching for database queries" (5 tokens)
    // Intersection: 1 ("for"), Union: 9, Jaccard: 1/9 ≈ 0.111 < 0.7
    const tokensPrior = normalizeForJaccard('use typescript for new code');
    const tokensNew = normalizeForJaccard('implement caching for database queries');

    const similarity = jaccardSimilarity(tokensPrior, tokensNew);
    assert.ok(similarity < 0.7, `Expected similarity < 0.7, got ${similarity}`);
  });

  it('marks items as dedup when matching priorItems (Jaccard > 0.7)', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for all new code' },
    ];
    const result = createMockResult({
      // Nearly identical to prior, Jaccard ≈ 0.857
      decisions: ['use typescript for all new code today'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
    assert.equal(processed.stagedItemStatus['de_001'], 'approved');
  });

  it('marks items as ai when priorItems have low Jaccard (< 0.7)', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for new code' },
    ];
    const result = createMockResult({
      // Completely different topic, low Jaccard
      decisions: ['implement caching for database queries'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('applies priorItems dedup to action items', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'send api docs to sarah' },
    ];
    const result = createMockResult({
      // Very similar: 5/6 = 0.833 Jaccard
      actionItems: [createActionItem('send api docs to sarah today', 0.9)],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['ai_001'], 'dedup');
  });

  it('applies priorItems dedup to learnings', () => {
    const priorItems: PriorItem[] = [
      { type: 'learning', text: 'caching improves performance significantly' },
    ];
    const result = createMockResult({
      // 5/6 = 0.833 Jaccard
      learnings: ['caching improves performance significantly more'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['le_001'], 'dedup');
  });

  it('short-circuits: userNotes match takes precedence over priorItems', () => {
    const userNotes = 'use typescript for all new code';
    const priorItems: PriorItem[] = []; // No prior items
    const result = createMockResult({
      decisions: ['use typescript for all new code today'],
    });

    const processed = processMeetingExtraction(result, userNotes, { priorItems });
    // Should be dedup from userNotes match
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
  });

  it('either userNotes OR priorItems match results in dedup', () => {
    const userNotes = 'completely different user notes';
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for all new code' },
    ];
    const result = createMockResult({
      decisions: ['use typescript for all new code today'],
    });

    const processed = processMeetingExtraction(result, userNotes, { priorItems });
    // Should be dedup from priorItems match (userNotes don't match)
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
  });

  it('handles empty priorItems array (no dedup from prior)', () => {
    const result = createMockResult({
      decisions: ['use typescript for all new code'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems: [] });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('handles undefined priorItems (no dedup from prior)', () => {
    const result = createMockResult({
      decisions: ['use typescript for all new code'],
    });

    const processed = processMeetingExtraction(result, '', {});
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('truncates priorItems to last 50 entries (cap verification)', () => {
    // Create 60 prior items, only last 50 should be used
    const priorItems: PriorItem[] = [];
    for (let i = 0; i < 60; i++) {
      // Items 0-9: unique text that won't match our test item
      // Items 10-59: also unique
      // Only item at index 55 (which is item 6 in the capped array of last 50) matches
      if (i === 55) {
        // This will be in the last 50 (indices 10-59), at position 45 in capped array
        priorItems.push({ type: 'decision', text: 'approve the marketing budget' });
      } else if (i === 5) {
        // This will be truncated (indices 0-9 are dropped)
        priorItems.push({ type: 'decision', text: 'approve the marketing budget' });
      } else {
        priorItems.push({ type: 'decision', text: `unique prior item number ${i}` });
      }
    }

    const result = createMockResult({
      // Match: "approve the marketing budget" vs "approve the marketing budget now"
      // Tokens: 4 vs 5, Jaccard: 4/5 = 0.8 > 0.7
      decisions: ['approve the marketing budget now'],
    });

    // Item at index 55 (in capped array) should match
    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
  });

  it('truncation removes early items (cap at most recent 50)', () => {
    // Create 60 prior items, match is only in first 10 (which get truncated)
    const priorItems: PriorItem[] = [];
    for (let i = 0; i < 60; i++) {
      if (i === 5) {
        // This will be truncated (indices 0-9 are dropped when taking last 50)
        priorItems.push({ type: 'decision', text: 'approve the marketing budget' });
      } else {
        priorItems.push({ type: 'decision', text: `unique prior item number ${i}` });
      }
    }

    const result = createMockResult({
      decisions: ['approve the marketing budget now'],
    });

    // Match was in truncated portion, so no dedup
    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - negation markers
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - negation markers', () => {
  it('skips priorItems dedup when item contains "not"', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for all new code' },
    ];
    const result = createMockResult({
      // Contains "not" → skip dedup even though base text is similar
      decisions: ['do not use typescript for all new code'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('skips priorItems dedup when item contains "won\'t"', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'deploy the feature this week' },
    ];
    const result = createMockResult({
      decisions: ["we won't deploy the feature this week"],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('skips priorItems dedup when item contains "no longer"', () => {
    const priorItems: PriorItem[] = [
      { type: 'learning', text: 'caching helps with performance' },
    ];
    const result = createMockResult({
      learnings: ['caching no longer helps with performance'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['le_001'], 'ai');
  });

  it('skips priorItems dedup when item contains "instead of"', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use react for the frontend' },
    ];
    const result = createMockResult({
      decisions: ['use vue instead of react for the frontend'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('skips priorItems dedup when item contains "changed from"', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'target launch date is march' },
    ];
    const result = createMockResult({
      decisions: ['target launch date changed from march to april'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('negation check is case-insensitive', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for all code' },
    ];
    const result = createMockResult({
      decisions: ['NOT using typescript for all code'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
  });

  it('still applies userNotes dedup even with negation markers', () => {
    // Negation markers only skip priorItems check, not userNotes
    const userNotes = 'do not use typescript for all new code';
    const result = createMockResult({
      decisions: ['do not use typescript for all new code'],
    });

    const processed = processMeetingExtraction(result, userNotes, { priorItems: [] });
    // Exact match with userNotes → dedup
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
  });

  it('dedupes normally when no negation markers present', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'use typescript for all new code' },
    ];
    const result = createMockResult({
      decisions: ['use typescript for all new code today'],
    });

    const processed = processMeetingExtraction(result, '', { priorItems });
    // No negation markers, high Jaccard → dedup
    assert.equal(processed.stagedItemSource['de_001'], 'dedup');
  });
});

// ---------------------------------------------------------------------------
// hasNegationMarkers unit tests
// ---------------------------------------------------------------------------

describe('hasNegationMarkers', () => {
  it('returns true for "not"', () => {
    assert.equal(hasNegationMarkers('We will not proceed with the plan'), true);
  });

  it('returns true for "won\'t"', () => {
    assert.equal(hasNegationMarkers("We won't deploy this week"), true);
  });

  it('returns true for "no longer"', () => {
    assert.equal(hasNegationMarkers('This is no longer relevant'), true);
  });

  it('returns true for "instead of"', () => {
    assert.equal(hasNegationMarkers('Use Vue instead of React'), true);
  });

  it('returns true for "changed from"', () => {
    assert.equal(hasNegationMarkers('Priority changed from high to low'), true);
  });

  it('returns false when no negation markers', () => {
    assert.equal(hasNegationMarkers('Use typescript for all new code'), false);
  });

  it('is case-insensitive', () => {
    assert.equal(hasNegationMarkers('We will NOT proceed'), true);
    assert.equal(hasNegationMarkers('INSTEAD OF using react'), true);
  });

  it('returns false for empty string', () => {
    assert.equal(hasNegationMarkers(''), false);
  });

  it('does not false-positive on "notification"', () => {
    assert.equal(hasNegationMarkers('Send notification to the team about the deploy'), false);
  });

  it('does not false-positive on "another"', () => {
    assert.equal(hasNegationMarkers('Schedule another meeting for next week'), false);
  });

  it('does not false-positive on "note"', () => {
    assert.equal(hasNegationMarkers('Take note of the deployment schedule'), false);
  });

  it('does not false-positive on "annotate"', () => {
    assert.equal(hasNegationMarkers('Annotate the PR with review comments'), false);
  });

  it('still matches "not" as a standalone word', () => {
    assert.equal(hasNegationMarkers('Do not deploy until Friday'), true);
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

  it('marks items with confidence 0.65-0.8 as pending', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task at 0.65', 0.65),
        createActionItem('Task at 0.7', 0.7),
        createActionItem('Task at 0.8', 0.8),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending'); // 0.65
    assert.equal(processed.stagedItemStatus['ai_002'], 'pending'); // 0.7
    assert.equal(processed.stagedItemStatus['ai_003'], 'pending'); // 0.8 (not > 0.8)
  });

  it('excludes items with confidence 0.5 and 0.6 (below 0.65 threshold)', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task at 0.5', 0.5),
        createActionItem('Task at 0.6', 0.6),
        createActionItem('Task at 0.7', 0.7),
      ],
    });

    const processed = processMeetingExtraction(result, '');
    // 0.5 and 0.6 are excluded; 0.7 passes
    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.filteredItems[0].text, 'Task at 0.7');
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending'); // 0.7
  });

  it('approves items with confidence exactly at boundary (0.81)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Just over boundary', 0.81)],
    });

    const processed = processMeetingExtraction(result, '');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
  });

  it('always approves dedup items when confidence meets include threshold', () => {
    const userNotes = 'complete the task by friday';
    const result = createMockResult({
      actionItems: [createActionItem('complete the task by friday', 0.7)],
    });

    // Item matches user notes exactly (Jaccard = 1.0 > 0.7 dedup threshold)
    // → source: dedup, status: approved
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

// ---------------------------------------------------------------------------
// clearApprovedSections
// ---------------------------------------------------------------------------

describe('clearApprovedSections', () => {
  it('removes Approved Action Items section', () => {
    const content = `# Meeting

## Notes
Some notes here.

## Approved Action Items
- ai_001: Do something
- ai_002: Do another thing

## Summary
A summary.`;

    const result = clearApprovedSections(content);
    assert.ok(!result.includes('## Approved Action Items'));
    assert.ok(!result.includes('ai_001:'));
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('## Summary'));
  });

  it('removes Approved Decisions section', () => {
    const content = `## Content

## Approved Decisions
- de_001: We decided X

## Next`;

    const result = clearApprovedSections(content);
    assert.ok(!result.includes('## Approved Decisions'));
    assert.ok(!result.includes('de_001:'));
    assert.ok(result.includes('## Content'));
    assert.ok(result.includes('## Next'));
  });

  it('removes Approved Learnings section', () => {
    const content = `## Intro

## Approved Learnings
- le_001: We learned Y

## Outro`;

    const result = clearApprovedSections(content);
    assert.ok(!result.includes('## Approved Learnings'));
    assert.ok(!result.includes('le_001:'));
    assert.ok(result.includes('## Intro'));
    assert.ok(result.includes('## Outro'));
  });

  it('removes all three approved sections', () => {
    const content = `# Meeting

## Approved Action Items
- ai_001: Action

## Approved Decisions
- de_001: Decision

## Approved Learnings
- le_001: Learning

## Footer`;

    const result = clearApprovedSections(content);
    assert.ok(!result.includes('## Approved Action Items'));
    assert.ok(!result.includes('## Approved Decisions'));
    assert.ok(!result.includes('## Approved Learnings'));
    assert.ok(result.includes('# Meeting'));
    assert.ok(result.includes('## Footer'));
  });

  it('preserves content with no approved sections', () => {
    const content = `# Meeting

## Notes
Some notes.

## Summary
A summary.`;

    const result = clearApprovedSections(content);
    assert.equal(result, content);
  });

  it('handles empty content', () => {
    const result = clearApprovedSections('');
    assert.equal(result, '');
  });
});

// ---------------------------------------------------------------------------
// formatFilteredStagedSections
// ---------------------------------------------------------------------------

describe('formatFilteredStagedSections', () => {
  it('formats action items section', () => {
    const items: FilteredItem[] = [
      { id: 'ai_001', text: 'Do task A', type: 'action', confidence: 0.9 },
      { id: 'ai_002', text: 'Do task B', type: 'action', confidence: 0.8 },
    ];

    const result = formatFilteredStagedSections(items, 'Meeting summary');

    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('Meeting summary'));
    assert.ok(result.includes('## Staged Action Items'));
    assert.ok(result.includes('- ai_001: Do task A'));
    assert.ok(result.includes('- ai_002: Do task B'));
  });

  it('formats decisions section', () => {
    const items: FilteredItem[] = [
      { id: 'de_001', text: 'Decision one', type: 'decision', confidence: 0.9 },
    ];

    const result = formatFilteredStagedSections(items, 'Summary');

    assert.ok(result.includes('## Staged Decisions'));
    assert.ok(result.includes('- de_001: Decision one'));
  });

  it('formats learnings section', () => {
    const items: FilteredItem[] = [
      { id: 'le_001', text: 'Learning one', type: 'learning', confidence: 0.9 },
    ];

    const result = formatFilteredStagedSections(items, 'Summary');

    assert.ok(result.includes('## Staged Learnings'));
    assert.ok(result.includes('- le_001: Learning one'));
  });

  it('formats all sections together', () => {
    const items: FilteredItem[] = [
      { id: 'ai_001', text: 'Action', type: 'action', confidence: 0.9 },
      { id: 'de_001', text: 'Decision', type: 'decision', confidence: 0.9 },
      { id: 'le_001', text: 'Learning', type: 'learning', confidence: 0.9 },
    ];

    const result = formatFilteredStagedSections(items, 'Test summary');

    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('Test summary'));
    assert.ok(result.includes('## Staged Action Items'));
    assert.ok(result.includes('- ai_001: Action'));
    assert.ok(result.includes('## Staged Decisions'));
    assert.ok(result.includes('- de_001: Decision'));
    assert.ok(result.includes('## Staged Learnings'));
    assert.ok(result.includes('- le_001: Learning'));
  });

  it('omits empty sections', () => {
    const items: FilteredItem[] = [
      { id: 'ai_001', text: 'Just action', type: 'action', confidence: 0.9 },
    ];

    const result = formatFilteredStagedSections(items, 'Summary');

    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('## Staged Action Items'));
    assert.ok(!result.includes('## Staged Decisions'));
    assert.ok(!result.includes('## Staged Learnings'));
  });

  it('handles empty items array', () => {
    const result = formatFilteredStagedSections([], 'No items summary');

    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('No items summary'));
    assert.ok(!result.includes('## Staged Action Items'));
    assert.ok(!result.includes('## Staged Decisions'));
    assert.ok(!result.includes('## Staged Learnings'));
  });

  // -------------------------------------------------------------------------
  // Task 8: core / could_include rendering
  // -------------------------------------------------------------------------

  it('emits ## Core when core provided and drops ## Summary', () => {
    const items: FilteredItem[] = [
      { id: 'ai_001', text: 'Action', type: 'action', confidence: 0.9 },
    ];

    const result = formatFilteredStagedSections(items, 'Legacy summary', 'Wiki-aware lead.');

    assert.ok(result.includes('## Core'));
    assert.ok(result.includes('Wiki-aware lead.'));
    assert.ok(!result.includes('## Summary'));
    assert.ok(!result.includes('Legacy summary'));
  });

  it('falls back to ## Summary when core is empty/whitespace (backward compat)', () => {
    const items: FilteredItem[] = [];

    const result = formatFilteredStagedSections(items, 'Backward summary', '   ');

    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('Backward summary'));
    assert.ok(!result.includes('## Core'));
  });

  it('falls back to ## Summary when core is undefined (backward compat)', () => {
    const items: FilteredItem[] = [];

    const result = formatFilteredStagedSections(items, 'Backward summary');

    assert.ok(result.includes('## Summary'));
    assert.ok(!result.includes('## Core'));
  });

  it('emits ## Could include with bullets when list non-empty', () => {
    const items: FilteredItem[] = [];

    const result = formatFilteredStagedSections(
      items,
      'unused',
      'Lead',
      ['Risks: Sara flagged churn', 'Pricing: tier may shift'],
    );

    assert.ok(result.includes('## Could include'));
    assert.ok(result.includes('- Risks: Sara flagged churn'));
    assert.ok(result.includes('- Pricing: tier may shift'));
  });

  it('omits ## Could include block when list is empty', () => {
    const items: FilteredItem[] = [];

    const result = formatFilteredStagedSections(items, 'unused', 'Lead', []);

    assert.ok(result.includes('## Core'));
    assert.ok(!result.includes('## Could include'));
  });

  it('omits ## Could include block when list is undefined', () => {
    const items: FilteredItem[] = [];

    const result = formatFilteredStagedSections(items, 'unused', 'Lead');

    assert.ok(!result.includes('## Could include'));
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - completedItems reconciliation
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - completedItems reconciliation', () => {
  // CRITICAL: Verify Jaccard math per LEARNINGS.md
  // For 0.6 threshold: 5 words vs 6 words = 5/6 = 0.833 ✓ (matches)
  // For 0.6 threshold: 3 words vs 6 words = 3/6 = 0.5 ✗ (no match)
  it('verifies Jaccard calculation for test strings (0.6 threshold)', () => {
    // Completed: "Send auth doc to Alex" (5 words)
    // Action:    "Send auth doc to Alex soon" (6 words)
    // Intersection: 5, Union: 6, Jaccard: 5/6 = 0.833 ≥ 0.6 ✓
    const tokensCompleted = normalizeForJaccard('Send auth doc to Alex');
    const tokensAction = normalizeForJaccard('Send auth doc to Alex soon');

    assert.deepEqual(tokensCompleted, ['send', 'auth', 'doc', 'to', 'alex']);
    assert.deepEqual(tokensAction, ['send', 'auth', 'doc', 'to', 'alex', 'soon']);

    const similarity = jaccardSimilarity(tokensCompleted, tokensAction);
    assert.ok(similarity >= 0.6, `Expected >= 0.6, got ${similarity}`);
    assert.equal(similarity.toFixed(3), '0.833');
  });

  it('marks action item as skipped when matching completedItems (Jaccard ≥ 0.6)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex soon', 0.9)],
    });

    // 5/6 = 0.833 ≥ 0.6 threshold
    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
    });

    assert.equal(processed.stagedItemStatus['ai_001'], 'skipped');
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
    assert.equal(processed.stagedItemMatchedText?.['ai_001'], 'Send auth doc to Alex');
  });

  it('does NOT mark action item when no match (Jaccard < 0.6)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Review the quarterly budget report', 0.9)],
    });

    // Completely different task
    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
    });

    assert.equal(processed.stagedItemStatus['ai_001'], 'approved'); // high confidence auto-approve
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('truncates matched text to 60 chars with "..." suffix', () => {
    // Create a completed item > 60 chars
    const longCompletedText =
      'Send the comprehensive quarterly financial report to Alex for review';
    // 10 words: "Send the comprehensive quarterly financial report to Alex for review"
    // Action:   "Send the comprehensive quarterly financial report to Alex for review soon"
    // 10/11 = 0.909 ≥ 0.6 ✓
    const result = createMockResult({
      actionItems: [
        createActionItem(
          'Send the comprehensive quarterly financial report to Alex for review soon',
          0.9,
        ),
      ],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: [longCompletedText],
    });

    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
    // 68 chars > 60, so truncated to 57 + "..."
    const matchedText = processed.stagedItemMatchedText?.['ai_001'];
    assert.ok(matchedText, 'Expected matchedText to be defined');
    assert.equal(matchedText.length, 60);
    assert.ok(matchedText.endsWith('...'), 'Expected truncation suffix');
    assert.equal(matchedText, 'Send the comprehensive quarterly financial report to Alex...');
  });

  it('does NOT apply reconciliation to decisions (only action items)', () => {
    const result = createMockResult({
      decisions: ['Send auth doc to Alex soon'],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
    });

    // Decisions should NOT be skipped — reconciliation is action items only
    assert.equal(processed.stagedItemStatus['de_001'], 'approved'); // 0.9 default > 0.8
    assert.equal(processed.stagedItemSource['de_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('does NOT apply reconciliation to learnings (only action items)', () => {
    const result = createMockResult({
      learnings: ['Send auth doc to Alex soon'],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
    });

    // Learnings should NOT be skipped — reconciliation is action items only
    assert.equal(processed.stagedItemStatus['le_001'], 'approved'); // 0.9 default > 0.8
    assert.equal(processed.stagedItemSource['le_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('reconciliation takes precedence over dedup', () => {
    const userNotes = 'Send auth doc to Alex soon'; // Would match via dedup
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex soon', 0.9)],
    });

    // Both completedItems and userNotes could match, but reconciliation comes first
    const processed = processMeetingExtraction(result, userNotes, {
      completedItems: ['Send auth doc to Alex'],
    });

    // Should be reconciled (skipped), not deduped (approved)
    assert.equal(processed.stagedItemStatus['ai_001'], 'skipped');
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
  });

  it('handles empty completedItems array (no reconciliation)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex', 0.9)],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: [],
    });

    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('handles undefined completedItems (no reconciliation)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex', 0.9)],
    });

    const processed = processMeetingExtraction(result, '', {});

    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('uses custom reconcileJaccard threshold when provided', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex soon', 0.9)],
    });

    // 5/6 = 0.833, so threshold 0.9 should NOT match
    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
      reconcileJaccard: 0.9,
    });

    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.equal(processed.stagedItemMatchedText, undefined);
  });

  it('matches multiple action items against same completed item', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Send auth doc to Alex soon', 0.9),
        createActionItem('Send auth doc to Alex today', 0.9),
      ],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex'],
    });

    // Both should be reconciled
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
    assert.equal(processed.stagedItemSource['ai_002'], 'reconciled');
    assert.equal(processed.stagedItemMatchedText?.['ai_001'], 'Send auth doc to Alex');
    assert.equal(processed.stagedItemMatchedText?.['ai_002'], 'Send auth doc to Alex');
  });

  it('matches action items against multiple completed items', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Send auth doc to Alex soon', 0.9),
        createActionItem('Review the quarterly budget report', 0.9),
      ],
    });

    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex', 'Review the quarterly budget'],
    });

    // First matches first completed item
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
    // Second matches second completed item (5/6 = 0.833)
    assert.equal(processed.stagedItemSource['ai_002'], 'reconciled');
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - openTasks dedup (source: 'existing-task')
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - openTasks dedup', () => {
  function createMockResult(intelligence: Partial<MeetingIntelligence>): MeetingExtractionResult {
    return {
      intelligence: {
        summary: 'Test summary',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
        ...intelligence,
      },
      validationWarnings: [],
    };
  }

  function createActionItem(description: string, confidence = 0.9): ActionItem {
    return {
      owner: 'Alice',
      ownerSlug: 'alice',
      description,
      direction: 'i_owe_them',
      confidence,
    };
  }

  it("marks action item as skipped with source 'existing-task' when matching an open task (Jaccard ≥ 0.7)", () => {
    // Realistic near-paraphrase: the LLM extraction added minor words on top of the
    // tracked task text. Jaccard should be ~0.8+ on token-set, well above 0.7.
    const result = createMockResult({
      actionItems: [
        createActionItem('Promote LEAP templates to production this week'),
      ],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['Promote LEAP templates to production'],
    });
    assert.equal(processed.stagedItemStatus['ai_001'], 'skipped');
    assert.equal(processed.stagedItemSource['ai_001'], 'existing-task');
    assert.ok(
      processed.stagedItemMatchedText?.['ai_001']?.toLowerCase().includes('leap'),
      `expected matched text to reference LEAP, got: ${processed.stagedItemMatchedText?.['ai_001']}`,
    );
  });

  // Known limitation (documented, not asserted): when the meeting extraction
  // and the tracked task describe the same work with different verbs + synonyms
  // (e.g. "Create testing spreadsheet for LEAP templates" vs "Update LEAP
  // testing assignment sheet"), Jaccard similarity drops well below 0.7 and
  // this rule-based post-filter does NOT catch the duplicate. Semantic-equivalence
  // matching would require embedding similarity or an LLM judge — out of scope
  // for this plan; see slack-evidence-dedup / computed-topic-memory follow-ons.
  it('DOES NOT catch synonym-level semantic duplicates (documented limitation)', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Create testing spreadsheet for LEAP templates and assign to manager'),
      ],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['Update LEAP testing assignment sheet with tester list'],
    });
    // Intentional: rule-based Jaccard does not catch this. If embedding-based
    // matching is added later, this test should flip to assert 'existing-task'.
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('does NOT mark item as existing-task when no matching open task', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Review quarterly revenue forecast report')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['Send welcome email to new hires'],
    });
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.notEqual(processed.stagedItemStatus['ai_001'], 'skipped');
  });

  it("does NOT match when stopwords dominate (min-token guard rejects short matches)", () => {
    // "send the report" and "review the report" share {the, report} → 2/4 = 0.5
    // Jaccard alone at 0.5 < 0.7, but also both sides are only 3 meaningful tokens —
    // the min-token guard would have caught it anyway. This test documents both layers.
    const result = createMockResult({
      actionItems: [createActionItem('send the report')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['review the report'],
    });
    assert.notEqual(processed.stagedItemSource['ai_001'], 'existing-task');
  });

  it("min-token guard rejects ≤3-token matches even at perfect Jaccard", () => {
    // Two identical 3-token strings → Jaccard 1.0 — but min-token guard blocks.
    // This protects against bogus matches on truncated task text.
    const result = createMockResult({
      actionItems: [createActionItem('ship the thing')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['ship the thing'],
    });
    assert.notEqual(processed.stagedItemSource['ai_001'], 'existing-task');
  });

  it('completed-item match wins over open-task match when both hit (ordering)', () => {
    // Same item matches BOTH a completed task and an open task.
    // Ordering: completed checked first → source should be 'reconciled', not 'existing-task'.
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex Johnson tomorrow morning')],
    });
    const processed = processMeetingExtraction(result, '', {
      completedItems: ['Send auth doc to Alex Johnson tomorrow morning already done'],
      openTasks: ['Send auth doc to Alex Johnson tomorrow morning still to do'],
    });
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
    assert.ok(
      processed.stagedItemMatchedText?.['ai_001']?.includes('already done'),
      `expected matched text to come from completedItems, got: ${processed.stagedItemMatchedText?.['ai_001']}`,
    );
  });

  it('handles empty openTasks array (no dedup applied)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Any action item here with enough tokens')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: [],
    });
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('handles undefined openTasks (no dedup applied)', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Any action item here with enough tokens')],
    });
    const processed = processMeetingExtraction(result, '', {});
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('ignores openTasks candidates that themselves have fewer than 4 tokens', () => {
    // Short open task "do laundry" (2 tokens) should NEVER participate in matches,
    // even if the extracted item is long — protects against short task entries
    // in the list dragging down specificity.
    const result = createMockResult({
      actionItems: [createActionItem('Make sure to do laundry this weekend')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['do laundry'],
    });
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  it('respects custom reconcileJaccard threshold', () => {
    // With a high threshold (0.95), even a ~0.83 match is rejected.
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex soon')],
    });
    const processed = processMeetingExtraction(result, '', {
      openTasks: ['Send auth doc to Alex'],
      reconcileJaccard: 0.95,
    });
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
  });

  // Plan step 8d: benchmark against the reported 145-open-task workspace scale.
  // Non-CI-enforced but logs actual duration via t.diagnostic — if consistently
  // over ~250ms, consider caching tokenized open tasks across meetings in the
  // parallel winddown path. Hard ceiling 500ms to catch pathological regressions.
  it('benchmark: 145 open tasks × 20 action items completes under 500ms', (t) => {
    const actionItems = Array.from({ length: 20 }, (_, i) =>
      createActionItem(`Action item number ${i} with enough tokens to pass the guard`),
    );
    const openTasks = Array.from({ length: 145 }, (_, i) =>
      `Open task ${i} with distinct identifying content token ${i}`,
    );
    const result = createMockResult({ actionItems });

    const start = process.hrtime.bigint();
    const processed = processMeetingExtraction(result, '', { openTasks });
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    t.diagnostic(`processMeetingExtraction(145 openTasks × 20 items) took ${elapsedMs.toFixed(1)}ms`);
    assert.ok(
      elapsedMs < 500,
      `expected < 500ms at 145-task scale; saw ${elapsedMs.toFixed(1)}ms (regression — consider tokenization cache)`,
    );
    // Sanity: 20 items remain (none matched the distinct-content open tasks).
    assert.equal(processed.filteredItems.length, 20);
  });
});

// ---------------------------------------------------------------------------
// calculateSpeakingRatio
// ---------------------------------------------------------------------------

describe('calculateSpeakingRatio', () => {
  it('calculates 100% ratio for single speaker matching owner', () => {
    const transcript = `
**John Koht | 01:18**
Hello, this is a test. I am speaking now and this is my content.
`;
    // 13 words, all from owner
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 1);
  });

  it('calculates 50/50 split between two speakers', () => {
    const transcript = `
**John | 01:00**
One two three four

**Dave | 02:00**
Five six seven eight
`;
    // John: 4 words, Dave: 4 words, total: 8
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.5);
  });

  it('handles partial name match (John matches John Koht)', () => {
    const transcript = `
**John Koht | 01:18**
Hello this is John speaking.

**Dave Wiedenheft | 02:30**
Hello this is Dave responding.
`;
    // John Koht: 5 words, Dave: 5 words
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.5);
  });

  it('is case insensitive (john matches John Koht)', () => {
    const transcript = `
**John Koht | 01:18**
Hello this is John speaking.

**Dave | 02:30**
Hello this is Dave responding.
`;
    const ratio = calculateSpeakingRatio(transcript, 'john');
    assert.equal(ratio, 0.5);
  });

  it('returns undefined for no speaker labels', () => {
    const transcript = `
This is just regular text without any speaker labels.
It should return undefined.
`;
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, undefined);
  });

  it('returns undefined for empty transcript', () => {
    const ratio = calculateSpeakingRatio('', 'John');
    assert.equal(ratio, undefined);
  });

  it('returns undefined for empty owner name', () => {
    const transcript = `
**John | 01:00**
Some words here.
`;
    const ratio = calculateSpeakingRatio(transcript, '');
    assert.equal(ratio, undefined);
  });

  it('counts anonymous speakers in total but does not match owner', () => {
    const transcript = `
**John | 01:00**
Hello from John.

**Speaker 4 | 02:00**
Anonymous speaker content here.

**Speaker 1 | 03:00**
Another anonymous speaker.
`;
    // John: 3 words
    // Speaker 4: 4 words
    // Speaker 1: 3 words
    // Total: 10 words, John: 3 words → 0.3
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.3);
  });

  it('anonymous speaker never matches owner even with partial match', () => {
    const transcript = `
**Speaker 4 | 01:00**
Hello from anonymous.

**John | 02:00**
Hello from John.
`;
    // Even if "Speaker" is part of owner name, anonymous should not match
    const ratio = calculateSpeakingRatio(transcript, 'Speaker');
    assert.equal(ratio, 0);
  });

  it('handles HH:MM:SS timestamp format', () => {
    const transcript = `
**John Koht | 1:23:45**
Long meeting content here.

**Sarah Smith | 2:34:56**
More content from Sarah.
`;
    // John: 4 words, Sarah: 4 words
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.5);
  });

  it('handles mixed MM:SS and HH:MM:SS formats', () => {
    const transcript = `
**John | 01:18**
Short segment.

**Dave | 1:02:30**
Longer segment here.
`;
    // John: 2 words, Dave: 3 words, total: 5
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.4);
  });

  it('returns 0 when owner not found among speakers', () => {
    const transcript = `
**Alice | 01:00**
Hello from Alice.

**Bob | 02:00**
Hello from Bob.
`;
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0);
  });

  it('returns 0 when transcript has labels but no content', () => {
    const transcript = `
**John | 01:00**

**Dave | 02:00**

`;
    // No words spoken
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0);
  });

  it('handles whitespace and newlines between speaker labels', () => {
    const transcript = `


**John Koht | 01:18**

   Hello world this is a test.   


**Dave | 02:30**

Hello back to you.

`;
    // John: 6 words, Dave: 4 words, total: 10
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.equal(ratio, 0.6);
  });

  it('handles multiple segments from same speaker', () => {
    const transcript = `
**John | 01:00**
First segment.

**Dave | 02:00**
Dave speaks.

**John | 03:00**
John again speaks.
`;
    // John segments: 2 + 3 = 5 words
    // Dave: 2 words
    // Total: 7 words
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.ok(Math.abs(ratio! - 5 / 7) < 0.001, `Expected ~0.714, got ${ratio}`);
  });

  it('never crashes on malformed transcripts (Pre-Mortem R4)', () => {
    // Various malformed inputs that should not crash
    const malformed = [
      '**|**',
      '** | **',
      '**John|01:00**', // missing space
      '**John | **', // missing timestamp
      '** | 01:00**', // missing name
      '****',
      '*John | 01:00*', // single asterisks
      '**John | 01:00** **Dave | 02:00**', // inline labels
    ];

    for (const input of malformed) {
      // Should not throw
      const result = calculateSpeakingRatio(input, 'John');
      // Result is either undefined or a number
      assert.ok(
        result === undefined || typeof result === 'number',
        `Unexpected result type for input: ${input}`,
      );
    }
  });

  it('handles real-world transcript format', () => {
    // Based on example from notes.md
    const transcript = `## Transcript

**John Koht | 01:18**
So weird.

**Dave Wiedenheft | 09:29**
Hey, John, how are you doing today? I wanted to check in about the project.

**John Koht | 10:45**
I'm doing great, thanks for asking. The project is progressing well.

**Dave Wiedenheft | 11:30**
That's good to hear.
`;
    // John: 2 + 11 = 13 words ("So weird." + "I'm doing great, thanks for asking. The project is progressing well.")
    // Dave: 15 + 4 = 19 words
    // Total: 32 words
    const ratio = calculateSpeakingRatio(transcript, 'John');
    assert.ok(ratio !== undefined);
    assert.ok(
      Math.abs(ratio - 13 / 32) < 0.001,
      `Expected ~0.406, got ${ratio}`,
    );
  });

  it('handles owner name matching full name in transcript', () => {
    const transcript = `
**John Koht | 01:00**
Hello world.

**Dave | 02:00**
Hi there.
`;
    // Using full name as owner should still match
    const ratio = calculateSpeakingRatio(transcript, 'John Koht');
    assert.equal(ratio, 0.5);
  });
});

// ---------------------------------------------------------------------------
// processMeetingExtraction - importance-based processing
// ---------------------------------------------------------------------------

describe('processMeetingExtraction - importance: skip', () => {
  it('returns empty result immediately for importance: skip', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task 1', 0.9),
        createActionItem('Task 2', 0.85),
      ],
      decisions: ['Decision 1'],
      learnings: ['Learning 1'],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'skip' });

    // Should return empty result
    assert.equal(processed.filteredItems.length, 0);
    assert.deepEqual(processed.stagedItemStatus, {});
    assert.deepEqual(processed.stagedItemConfidence, {});
    assert.deepEqual(processed.stagedItemSource, {});
    assert.deepEqual(processed.stagedItemOwner, {});
  });

  it('does not process any items for importance: skip', () => {
    // Even with high-confidence items and user notes matches, skip should return empty
    const userNotes = 'Review the api documentation today';
    const result = createMockResult({
      actionItems: [
        createActionItem('review the api documentation', 0.99),
      ],
      decisions: ['Important decision'],
      learnings: ['Critical learning'],
    });

    const processed = processMeetingExtraction(result, userNotes, { importance: 'skip' });

    assert.equal(processed.filteredItems.length, 0);
  });
});

describe('processMeetingExtraction - importance: light', () => {
  it('auto-approves all action items for importance: light', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Medium-low confidence task', 0.70), // Would be 'pending' normally
        createActionItem('Medium confidence task', 0.75), // Would be 'pending' normally
        createActionItem('High confidence task', 0.95), // Would be 'approved' anyway
      ],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'light' });

    assert.equal(processed.filteredItems.length, 3);
    // All should be approved regardless of confidence
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
    assert.equal(processed.stagedItemStatus['ai_002'], 'approved');
    assert.equal(processed.stagedItemStatus['ai_003'], 'approved');
    // Source should still be 'ai' (not dedup)
    assert.equal(processed.stagedItemSource['ai_001'], 'ai');
    assert.equal(processed.stagedItemSource['ai_002'], 'ai');
    assert.equal(processed.stagedItemSource['ai_003'], 'ai');
  });

  it('auto-approves all decisions for importance: light', () => {
    const result = createMockResult({
      decisions: ['Decision 1', 'Decision 2'],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'light' });

    assert.equal(processed.filteredItems.length, 2);
    assert.equal(processed.stagedItemStatus['de_001'], 'approved');
    assert.equal(processed.stagedItemStatus['de_002'], 'approved');
  });

  it('auto-approves all learnings for importance: light', () => {
    const result = createMockResult({
      learnings: ['Learning 1', 'Learning 2'],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'light' });

    assert.equal(processed.filteredItems.length, 2);
    assert.equal(processed.stagedItemStatus['le_001'], 'approved');
    assert.equal(processed.stagedItemStatus['le_002'], 'approved');
  });

  it('still respects confidence filtering for importance: light', () => {
    // Items below 0.65 should still be excluded
    const result = createMockResult({
      actionItems: [
        createActionItem('Very low confidence', 0.3), // Should be excluded
        createActionItem('Below threshold', 0.6), // Should be excluded (< 0.65)
        createActionItem('Valid item', 0.7), // Should be included and approved
      ],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'light' });

    assert.equal(processed.filteredItems.length, 1);
    assert.equal(processed.filteredItems[0].text, 'Valid item');
    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
  });

  it('still applies reconciliation for importance: light', () => {
    const result = createMockResult({
      actionItems: [createActionItem('Send auth doc to Alex soon', 0.9)],
    });

    // Reconciled items should still be marked as 'skipped'
    const processed = processMeetingExtraction(result, '', {
      importance: 'light',
      completedItems: ['Send auth doc to Alex'],
    });

    assert.equal(processed.stagedItemStatus['ai_001'], 'skipped');
    assert.equal(processed.stagedItemSource['ai_001'], 'reconciled');
  });

  it('preserves owner metadata for importance: light', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Task with owner', 0.7, {
          ownerSlug: 'john-smith',
          direction: 'i_owe_them',
          counterpartySlug: 'jane-doe',
        }),
      ],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'light' });

    assert.equal(processed.stagedItemStatus['ai_001'], 'approved');
    assert.deepEqual(processed.stagedItemOwner['ai_001'], {
      ownerSlug: 'john-smith',
      direction: 'i_owe_them',
      counterpartySlug: 'jane-doe',
    });
  });
});

describe('processMeetingExtraction - importance: normal/important', () => {
  it('processes normally for importance: normal', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Medium confidence task', 0.7), // Should be 'pending'
        createActionItem('High confidence task', 0.9), // Should be 'approved'
      ],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'normal' });

    assert.equal(processed.filteredItems.length, 2);
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending');
    assert.equal(processed.stagedItemStatus['ai_002'], 'approved');
  });

  it('processes normally for importance: important', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Medium confidence task', 0.7), // Should be 'pending'
        createActionItem('High confidence task', 0.9), // Should be 'approved'
      ],
    });

    const processed = processMeetingExtraction(result, '', { importance: 'important' });

    assert.equal(processed.filteredItems.length, 2);
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending');
    assert.equal(processed.stagedItemStatus['ai_002'], 'approved');
  });

  it('processes normally when importance is undefined', () => {
    const result = createMockResult({
      actionItems: [
        createActionItem('Medium confidence task', 0.7),
        createActionItem('High confidence task', 0.9),
      ],
    });

    // No importance option at all
    const processed = processMeetingExtraction(result, '');

    assert.equal(processed.filteredItems.length, 2);
    assert.equal(processed.stagedItemStatus['ai_001'], 'pending');
    assert.equal(processed.stagedItemStatus['ai_002'], 'approved');
  });
});

// ---------------------------------------------------------------------------
// inferUrgency tests
// ---------------------------------------------------------------------------

describe('inferUrgency', () => {
  describe('must bucket (urgent keywords)', () => {
    it('returns must for "urgent"', () => {
      assert.equal(inferUrgency('Send the proposal urgent'), 'must');
    });

    it('returns must for "ASAP"', () => {
      assert.equal(inferUrgency('Review docs ASAP'), 'must');
    });

    it('returns must for "immediately"', () => {
      assert.equal(inferUrgency('Call client immediately'), 'must');
    });

    it('returns must for "today"', () => {
      assert.equal(inferUrgency('Submit report today'), 'must');
    });

    it('returns must for "this week"', () => {
      assert.equal(inferUrgency('Finish the slides this week'), 'must');
    });

    it('is case insensitive', () => {
      assert.equal(inferUrgency('Send URGENT email'), 'must');
      assert.equal(inferUrgency('Do this TODAY'), 'must');
    });
  });

  describe('should bucket (important keywords)', () => {
    it('returns should for "important"', () => {
      assert.equal(inferUrgency('This is important to discuss'), 'should');
    });

    it('returns should for "priority"', () => {
      assert.equal(inferUrgency('Review priority items'), 'should');
    });

    it('returns should for "soon"', () => {
      assert.equal(inferUrgency('Get back to them soon'), 'should');
    });
  });

  describe('anytime bucket (flexible keywords)', () => {
    it('returns anytime for "when you can"', () => {
      assert.equal(inferUrgency('Review when you can'), 'anytime');
    });

    it('returns anytime for "sometime"', () => {
      assert.equal(inferUrgency('Do this sometime'), 'anytime');
    });

    it('returns anytime for "eventually"', () => {
      assert.equal(inferUrgency('We should eventually migrate'), 'anytime');
    });

    it('returns anytime for "anytime"', () => {
      assert.equal(inferUrgency('Call me anytime'), 'anytime');
    });
  });

  describe('default bucket', () => {
    it('returns should for text with no urgency keywords', () => {
      assert.equal(inferUrgency('Send API documentation'), 'should');
    });

    it('returns should for empty string', () => {
      assert.equal(inferUrgency(''), 'should');
    });

    it('returns should for generic action items', () => {
      assert.equal(inferUrgency('Follow up with Sarah about the proposal'), 'should');
      assert.equal(inferUrgency('Review the contract details'), 'should');
      assert.equal(inferUrgency('Schedule a meeting with the team'), 'should');
    });
  });

  describe('keyword boundary matching', () => {
    it('does not match partial words', () => {
      // "priority" should match, but not "deprioritize"
      assert.equal(inferUrgency('deprioritize the task'), 'should'); // no match on partial "priority"
    });

    it('matches keywords at word boundaries', () => {
      assert.equal(inferUrgency('urgent: send slides'), 'must');
      assert.equal(inferUrgency('send slides (urgent)'), 'must');
    });
  });

  describe('precedence', () => {
    it('must keywords take precedence over should', () => {
      // Both "urgent" (must) and "important" (should) present
      assert.equal(inferUrgency('This is urgent and important'), 'must');
    });

    it('should keywords take precedence over anytime', () => {
      // Both "soon" (should) and "sometime" (anytime) present
      assert.equal(inferUrgency('Do this soon, or sometime'), 'should');
    });

    it('must keywords take precedence over anytime', () => {
      // Both "today" (must) and "anytime" (anytime) present
      assert.equal(inferUrgency('Reply today or anytime'), 'must');
    });
  });
});

// ---------------------------------------------------------------------------
// Real confidence for decisions/learnings (Task 4)
// ---------------------------------------------------------------------------

describe('decision/learning confidence from extraction', () => {
  it('decision with confidence 0.4 is filtered out (below 0.65 threshold)', () => {
    const result = createMockResult({
      decisions: ['Low confidence decision'],
      decisionConfidences: [0.4],
    });
    const processed = processMeetingExtraction(result, '');
    const decisions = processed.filteredItems.filter(i => i.type === 'decision');
    assert.equal(decisions.length, 0, 'Decision below threshold should be filtered');
  });

  it('decision with confidence 0.7 gets status pending', () => {
    const result = createMockResult({
      decisions: ['Medium confidence decision'],
      decisionConfidences: [0.7],
    });
    const processed = processMeetingExtraction(result, '');
    const decisions = processed.filteredItems.filter(i => i.type === 'decision');
    assert.equal(decisions.length, 1);
    assert.equal(processed.stagedItemStatus[decisions[0].id], 'pending');
  });

  it('decision with confidence 0.9 gets status approved', () => {
    const result = createMockResult({
      decisions: ['High confidence decision'],
      decisionConfidences: [0.9],
    });
    const processed = processMeetingExtraction(result, '');
    const decisions = processed.filteredItems.filter(i => i.type === 'decision');
    assert.equal(decisions.length, 1);
    assert.equal(processed.stagedItemStatus[decisions[0].id], 'approved');
  });

  it('learning with confidence 0.4 is filtered out', () => {
    const result = createMockResult({
      learnings: ['Low confidence learning'],
      learningConfidences: [0.4],
    });
    const processed = processMeetingExtraction(result, '');
    const learnings = processed.filteredItems.filter(i => i.type === 'learning');
    assert.equal(learnings.length, 0);
  });

  it('learning with confidence 0.7 gets status pending', () => {
    const result = createMockResult({
      learnings: ['Medium confidence learning'],
      learningConfidences: [0.7],
    });
    const processed = processMeetingExtraction(result, '');
    const learnings = processed.filteredItems.filter(i => i.type === 'learning');
    assert.equal(learnings.length, 1);
    assert.equal(processed.stagedItemStatus[learnings[0].id], 'pending');
  });

  it('learning with confidence 0.9 gets status approved', () => {
    const result = createMockResult({
      learnings: ['High confidence learning'],
      learningConfidences: [0.9],
    });
    const processed = processMeetingExtraction(result, '');
    const learnings = processed.filteredItems.filter(i => i.type === 'learning');
    assert.equal(learnings.length, 1);
    assert.equal(processed.stagedItemStatus[learnings[0].id], 'approved');
  });

  it('backwards compat: undefined confidences default to 0.9 (auto-approved)', () => {
    const result = createMockResult({
      decisions: ['Decision without confidence'],
      learnings: ['Learning without confidence'],
    });
    const processed = processMeetingExtraction(result, '');
    const decisions = processed.filteredItems.filter(i => i.type === 'decision');
    const learnings = processed.filteredItems.filter(i => i.type === 'learning');
    assert.equal(decisions.length, 1);
    assert.equal(learnings.length, 1);
    assert.equal(processed.stagedItemStatus[decisions[0].id], 'approved');
    assert.equal(processed.stagedItemStatus[learnings[0].id], 'approved');
  });
});
