import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  buildExclusionListSection,
} from '../../src/services/meeting-extraction.js';
import type { LLMCallFn, MeetingExtractionResult, ActionItem, PriorItem } from '../../src/services/meeting-extraction.js';
import type { MeetingContextBundle } from '../../src/services/meeting-context.js';

// ---------------------------------------------------------------------------
// buildMeetingExtractionPrompt
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt', () => {
  it('includes the transcript content', () => {
    const transcript = 'John: We should use React. Sarah: I agree.';
    const prompt = buildMeetingExtractionPrompt(transcript);
    assert.ok(prompt.includes(transcript));
  });

  it('includes JSON schema with required fields', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('"summary"'));
    assert.ok(prompt.includes('"action_items"'));
    assert.ok(prompt.includes('"next_steps"'));
    assert.ok(prompt.includes('"decisions"'));
    assert.ok(prompt.includes('"learnings"'));
  });

  it('includes action item schema fields', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('"owner"'));
    assert.ok(prompt.includes('"owner_slug"'));
    assert.ok(prompt.includes('"description"'));
    assert.ok(prompt.includes('"direction"'));
    assert.ok(prompt.includes('"counterparty_slug"'));
    assert.ok(prompt.includes('"due"'));
  });

  it('includes direction enum values', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('i_owe_them'));
    assert.ok(prompt.includes('they_owe_me'));
  });

  it('includes few-shot good examples', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('John to send API docs to Sarah by Friday'));
  });

  it('includes few-shot bad examples', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('Me: Yeah'));
    assert.ok(prompt.includes("I'll look into that"));
    assert.ok(prompt.includes('So the way the system works'));
  });

  it('includes attendees when provided', () => {
    const prompt = buildMeetingExtractionPrompt('content', ['Alice', 'Bob']);
    assert.ok(prompt.includes('Alice'));
    assert.ok(prompt.includes('Bob'));
    assert.ok(prompt.includes('Meeting attendees'));
  });

  it('omits attendees section when not provided', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(!prompt.includes('Meeting attendees:'));
  });

  it('includes owner slug when provided', () => {
    const prompt = buildMeetingExtractionPrompt('content', undefined, 'john-smith');
    assert.ok(prompt.includes('john-smith'));
    assert.ok(prompt.includes('Workspace owner slug'));
  });

  it('instructs to return only JSON', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('ONLY valid JSON'));
    assert.ok(prompt.includes('no code fences'));
  });

  it('mentions 150 character limit for action items', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('150'));
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - valid responses
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - valid responses', () => {
  it('parses complete valid response', () => {
    const response = JSON.stringify({
      summary: 'A productive meeting about the API redesign.',
      action_items: [
        {
          owner: 'John Smith',
          owner_slug: 'john-smith',
          description: 'Send API docs to Sarah',
          direction: 'i_owe_them',
          counterparty_slug: 'sarah-chen',
          due: 'Friday',
        },
      ],
      next_steps: ['Schedule follow-up meeting'],
      decisions: ['Use REST over GraphQL'],
      learnings: ['Team prefers simple solutions'],
    });

    const result = parseMeetingExtractionResponse(response);

    assert.equal(result.intelligence.summary, 'A productive meeting about the API redesign.');
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].owner, 'John Smith');
    assert.equal(result.intelligence.actionItems[0].ownerSlug, 'john-smith');
    assert.equal(result.intelligence.actionItems[0].description, 'Send API docs to Sarah');
    assert.equal(result.intelligence.actionItems[0].direction, 'i_owe_them');
    assert.equal(result.intelligence.actionItems[0].counterpartySlug, 'sarah-chen');
    assert.equal(result.intelligence.actionItems[0].due, 'Friday');
    assert.deepEqual(result.intelligence.nextSteps, ['Schedule follow-up meeting']);
    assert.deepEqual(result.intelligence.decisions, ['Use REST over GraphQL']);
    assert.deepEqual(result.intelligence.learnings, ['Team prefers simple solutions']);
    assert.equal(result.validationWarnings.length, 0);
  });

  it('parses response with code fences', () => {
    const response = '```json\n{"summary": "Test meeting"}\n```';
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.summary, 'Test meeting');
  });

  it('parses response with extra text around JSON', () => {
    const response = 'Here is the result:\n{"summary": "Test meeting"}\nDone.';
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.summary, 'Test meeting');
  });

  it('auto-generates owner_slug from owner name if missing', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John Smith',
          description: 'Review PR',
          direction: 'they_owe_me',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems[0].ownerSlug, 'john-smith');
  });

  it('handles empty arrays gracefully', () => {
    const response = JSON.stringify({
      summary: 'Short meeting',
      action_items: [],
      next_steps: [],
      decisions: [],
      learnings: [],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.summary, 'Short meeting');
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.intelligence.nextSteps.length, 0);
    assert.equal(result.intelligence.decisions.length, 0);
    assert.equal(result.intelligence.learnings.length, 0);
  });

  it('handles missing optional fields', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Alice',
          description: 'Do something',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems[0].counterpartySlug, undefined);
    assert.equal(result.intelligence.actionItems[0].due, undefined);
  });

  it('filters out invalid items in arrays', () => {
    const response = JSON.stringify({
      next_steps: ['Valid step', '', null, 123, 'Another valid step'],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.nextSteps, ['Valid step', 'Another valid step']);
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - malformed JSON
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - malformed JSON', () => {
  it('returns empty result for empty string', () => {
    const result = parseMeetingExtractionResponse('');
    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.validationWarnings.length, 0);
  });

  it('returns empty result for whitespace only', () => {
    const result = parseMeetingExtractionResponse('   \n\t  ');
    assert.equal(result.intelligence.summary, '');
  });

  it('returns empty result for invalid JSON', () => {
    const result = parseMeetingExtractionResponse('not json at all');
    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
  });

  it('returns empty result for incomplete JSON', () => {
    const result = parseMeetingExtractionResponse('{"summary": "test"');
    assert.equal(result.intelligence.summary, '');
  });

  it('handles null values gracefully', () => {
    const response = JSON.stringify({
      summary: null,
      action_items: null,
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
  });

  it('handles wrong types gracefully', () => {
    const response = JSON.stringify({
      summary: 123,
      action_items: 'not an array',
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - validation rejections
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - validation rejections', () => {
  it('rejects action items over 150 characters', () => {
    const longDescription = 'A'.repeat(160);
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: longDescription,
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.validationWarnings.length, 1);
    assert.ok(result.validationWarnings[0].reason.includes('150 characters'));
  });

  it('rejects items starting with "Me:"', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: "Me: Yeah, I'll look into that",
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.validationWarnings.length, 1);
    assert.ok(result.validationWarnings[0].reason.includes('me:'));
  });

  it('rejects items starting with "Them:"', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Alice',
          description: 'Them: We should probably check that',
          direction: 'they_owe_me',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes('them:'));
  });

  it('rejects items starting with "Yeah"', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Bob',
          description: 'Yeah, that sounds good',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes('yeah'));
  });

  it('rejects items starting with "I\'m not sure"', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Carol',
          description: "I'm not sure, but maybe we could try that",
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes("i'm not sure"));
  });

  it('rejects items starting with "So the way"', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Dan',
          description: 'So the way the system works is we send a request',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes('so the way'));
  });

  it('rejects items with multiple sentences', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Eve',
          description: 'Send the report. Then review it. Finally submit.',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes('multiple sentences'));
  });

  it('accepts items with exactly one period at the end', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Frank',
          description: 'Send the report by Friday.',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.validationWarnings.length, 0);
  });

  it('rejects items with invalid direction', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Grace',
          description: 'Send the docs',
          direction: 'invalid_direction',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings[0].reason.includes('invalid direction'));
  });

  it('skips items missing required fields without warning', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Henry',
          // missing description
          direction: 'i_owe_them',
        },
        {
          // missing owner
          description: 'Do something',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    // No warnings for missing required fields - just skipped
    assert.equal(result.validationWarnings.length, 0);
  });

  it('keeps valid items while rejecting invalid ones', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Ivy',
          description: 'Send the report',
          direction: 'i_owe_them',
        },
        {
          owner: 'Jack',
          description: "Me: Yeah, I'll check that",
          direction: 'they_owe_me',
        },
        {
          owner: 'Kate',
          description: 'Review the PR',
          direction: 'they_owe_me',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 2);
    assert.equal(result.intelligence.actionItems[0].owner, 'Ivy');
    assert.equal(result.intelligence.actionItems[1].owner, 'Kate');
    assert.equal(result.validationWarnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - rawItems (pre-filter capture)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - rawItems', () => {
  it('rawItems includes action items that get filtered by validation', () => {
    const response = JSON.stringify({
      summary: 'Test meeting',
      action_items: [
        { owner: 'John', description: 'Valid action item', direction: 'i_owe_them' },
        { owner: 'Jane', description: 'Me: Yeah, I will look into that definitely later on', direction: 'i_owe_them' }, // garbage prefix
      ],
      decisions: [],
      learnings: [],
    });

    const result = parseMeetingExtractionResponse(response);

    // rawItems should have BOTH items (pre-filter)
    assert.equal(result.rawItems.length, 2);
    // But actionItems should only have the valid one (post-filter)
    assert.equal(result.intelligence.actionItems.length, 1);
  });

  it('rawItems captures action items, decisions, and learnings', () => {
    const response = JSON.stringify({
      summary: 'Test',
      action_items: [{ owner: 'A', description: 'Action', direction: 'i_owe_them' }],
      decisions: ['Decision one'],
      learnings: ['Learning one'],
    });

    const result = parseMeetingExtractionResponse(response);

    assert.equal(result.rawItems.length, 3);
  });

  it('rawItems preserves items filtered due to length', () => {
    const longDescription = 'A'.repeat(160); // exceeds 150 char limit
    const response = JSON.stringify({
      action_items: [
        { owner: 'Alice', description: longDescription, direction: 'i_owe_them' },
        { owner: 'Bob', description: 'Short valid item', direction: 'i_owe_them' },
      ],
    });

    const result = parseMeetingExtractionResponse(response);

    // rawItems should have both
    assert.equal(result.rawItems.length, 2);
    // actionItems should only have the valid short one
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].owner, 'Bob');
    // validation warning should exist for the long one
    assert.equal(result.validationWarnings.length, 1);
  });

  it('rawItems preserves items filtered due to invalid direction', () => {
    const response = JSON.stringify({
      action_items: [
        { owner: 'Carol', description: 'Valid with good direction', direction: 'i_owe_them' },
        { owner: 'Dan', description: 'Invalid direction item', direction: 'invalid_direction' },
      ],
    });

    const result = parseMeetingExtractionResponse(response);

    // rawItems should have both
    assert.equal(result.rawItems.length, 2);
    // actionItems should only have the one with valid direction
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].owner, 'Carol');
  });

  it('rawItems includes type information for each item', () => {
    const response = JSON.stringify({
      action_items: [{ owner: 'A', description: 'Action item', direction: 'i_owe_them' }],
      decisions: ['Decision made'],
      learnings: ['Something learned'],
    });

    const result = parseMeetingExtractionResponse(response);

    const actionRaw = result.rawItems.find(r => r.type === 'action');
    const decisionRaw = result.rawItems.find(r => r.type === 'decision');
    const learningRaw = result.rawItems.find(r => r.type === 'learning');

    assert.ok(actionRaw);
    assert.equal(actionRaw.text, 'Action item');
    assert.equal(actionRaw.owner, 'A');
    assert.equal(actionRaw.direction, 'i_owe_them');

    assert.ok(decisionRaw);
    assert.equal(decisionRaw.text, 'Decision made');

    assert.ok(learningRaw);
    assert.equal(learningRaw.text, 'Something learned');
  });

  it('rawItems is empty array for empty response', () => {
    const result = parseMeetingExtractionResponse('');
    assert.deepEqual(result.rawItems, []);
  });

  it('rawItems is empty array for malformed JSON', () => {
    const result = parseMeetingExtractionResponse('not valid json');
    assert.deepEqual(result.rawItems, []);
  });
});

// ---------------------------------------------------------------------------
// buildMeetingExtractionPrompt - selectivity & confidence (INT-1)
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt - selectivity & confidence', () => {
  it('includes selectivity instructions', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('ONLY high-confidence'));
    assert.ok(prompt.includes('Quality over quantity'));
    assert.ok(prompt.includes('HIGHLY selective'));
  });

  it('includes negative examples for trivial items', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    // Check for specific trivial patterns mentioned as exclusions
    assert.ok(prompt.includes('schedule a meeting'));
    assert.ok(prompt.includes('touch base'));
    assert.ok(prompt.includes('follow up'));
    assert.ok(prompt.includes('discuss this later'));
  });

  it('requests confidence (0-1) per action item in schema', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('"confidence"'));
    assert.ok(prompt.includes('0-1'));
    assert.ok(prompt.includes('your confidence'));
  });

  it('includes confidence guide with score ranges', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('0.9-1.0'));
    assert.ok(prompt.includes('0.7-0.8'));
    assert.ok(prompt.includes('0.5-0.6'));
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - confidence parsing (INT-1)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - confidence parsing', () => {
  it('parses confidence from action items', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: 'Send API docs by Friday',
          direction: 'i_owe_them',
          confidence: 0.95,
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].confidence, 0.95);
  });

  it('stores confidence in rawItems', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: 'Send docs',
          direction: 'i_owe_them',
          confidence: 0.8,
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    const rawAction = result.rawItems.find(r => r.type === 'action');
    assert.ok(rawAction);
    assert.equal(rawAction.confidence, 0.8);
  });

  it('handles missing confidence gracefully', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: 'Send docs',
          direction: 'i_owe_them',
          // no confidence field
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].confidence, undefined);
  });

  it('rejects confidence values outside 0-1 range', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: 'Send docs',
          direction: 'i_owe_them',
          confidence: 1.5, // out of range
        },
        {
          owner: 'Jane',
          description: 'Review PR',
          direction: 'they_owe_me',
          confidence: -0.1, // negative
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    // Both should have undefined confidence
    assert.equal(result.intelligence.actionItems[0].confidence, undefined);
    assert.equal(result.intelligence.actionItems[1].confidence, undefined);
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - trivial pattern filtering (INT-1)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - trivial pattern filtering', () => {
  it('filters "schedule a meeting" pattern', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John',
          description: 'Schedule a meeting with the team',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('trivial pattern')));
  });

  it('filters "follow up" pattern', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Jane',
          description: 'Follow up on the project status',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('trivial pattern')));
  });

  it('filters "touch base" pattern', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'Bob',
          description: 'Touch base with Alice next week',
          direction: 'i_owe_them',
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('trivial pattern')));
  });

  it('filters "we should/will/can meet/discuss/talk" patterns', () => {
    const patterns = [
      'We should discuss this tomorrow',
      'We will meet next week',
      'We can just talk about it later',
      'We should probably discuss the details',
    ];

    for (const desc of patterns) {
      const response = JSON.stringify({
        action_items: [{ owner: 'John', description: desc, direction: 'i_owe_them' }],
      });
      const result = parseMeetingExtractionResponse(response);
      assert.equal(
        result.intelligence.actionItems.length,
        0,
        `Expected "${desc}" to be filtered`,
      );
    }
  });

  it('does NOT filter items with explicit owner + deadline (false negative test)', () => {
    const response = JSON.stringify({
      action_items: [
        {
          owner: 'John Smith',
          description: 'Send API documentation to Sarah by Friday',
          direction: 'i_owe_them',
          due: 'Friday',
          confidence: 0.95,
        },
        {
          owner: 'Alice Chen',
          description: 'Review the PR and approve by EOD Monday',
          direction: 'they_owe_me',
          due: 'Monday',
          confidence: 0.9,
        },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    // Both should pass through — explicit owner + deadline = high value
    assert.equal(result.intelligence.actionItems.length, 2);
    assert.equal(result.intelligence.actionItems[0].owner, 'John Smith');
    assert.equal(result.intelligence.actionItems[1].owner, 'Alice Chen');
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - near-duplicate deduplication (INT-1)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - near-duplicate deduplication', () => {
  it('filters near-duplicate action items (Jaccard > 0.8)', () => {
    const response = JSON.stringify({
      action_items: [
        { owner: 'John', description: 'Send the API docs to Sarah', direction: 'i_owe_them' },
        { owner: 'John', description: 'Send the API docs to Sarah today', direction: 'i_owe_them' },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('near-duplicate')));
    assert.ok(result.validationWarnings.some(w => w.reason.includes('Jaccard')));
  });

  it('keeps distinct action items (Jaccard ≤ 0.8)', () => {
    const response = JSON.stringify({
      action_items: [
        { owner: 'John', description: 'Send the API docs', direction: 'i_owe_them' },
        { owner: 'Jane', description: 'Review the PR', direction: 'they_owe_me' },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 2);
  });

  it('filters near-duplicate decisions', () => {
    // Jaccard similarity: 8/9 = 0.889 (> 0.8 threshold)
    // Only one word different at the end
    const response = JSON.stringify({
      decisions: [
        'We decided to use REST API for integration',
        'We decided to use REST API for integration today',
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 1);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('near-duplicate')));
  });

  it('filters near-duplicate learnings', () => {
    // Jaccard similarity: 6/7 = 0.857 (> 0.8 threshold)
    // Only one word different at the end
    const response = JSON.stringify({
      learnings: [
        'Team prefers simple and clean interfaces',
        'Team prefers simple and clean interfaces always',
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.learnings.length, 1);
  });

  it('preserves first occurrence when deduplicating', () => {
    const response = JSON.stringify({
      action_items: [
        { owner: 'John', description: 'First version of the task', direction: 'i_owe_them' },
        { owner: 'John', description: 'First version of the task here', direction: 'i_owe_them' },
      ],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].description, 'First version of the task');
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - category limits (INT-1)
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - category limits', () => {
  it('enforces action item limit of 7', () => {
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        owner: `Person ${i}`,
        description: `Unique distinct action item number ${i}`,
        direction: 'i_owe_them',
      });
    }
    const response = JSON.stringify({ action_items: items });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 7);
    // Warnings for exceeded items
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds action item limit')));
  });

  it('enforces decision limit of 5', () => {
    const decisions = [];
    for (let i = 0; i < 8; i++) {
      decisions.push(`Unique distinct decision number ${i}`);
    }
    const response = JSON.stringify({ decisions });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 5);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds decision limit')));
  });

  it('enforces learning limit of 5', () => {
    const learnings = [];
    for (let i = 0; i < 8; i++) {
      learnings.push(`Unique distinct learning number ${i}`);
    }
    const response = JSON.stringify({ learnings });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.learnings.length, 5);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds learning limit')));
  });

  it('keeps first N items in LLM response order', () => {
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        owner: `Person ${i}`,
        description: `Unique item ${i} with index identifier`,
        direction: 'i_owe_them',
      });
    }
    const response = JSON.stringify({ action_items: items });

    const result = parseMeetingExtractionResponse(response);
    // Should keep items 0-6 (first 7)
    for (let i = 0; i < 7; i++) {
      assert.ok(
        result.intelligence.actionItems[i].description.includes(`Unique item ${i}`),
        `Item ${i} should be preserved`,
      );
    }
  });

  it('allows fewer items than limit without warnings', () => {
    const response = JSON.stringify({
      action_items: [
        { owner: 'John', description: 'Task one', direction: 'i_owe_them' },
        { owner: 'Jane', description: 'Task two', direction: 'they_owe_me' },
      ],
      decisions: ['Decision one'],
      learnings: ['Learning one'],
    });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 2);
    assert.equal(result.intelligence.decisions.length, 1);
    assert.equal(result.intelligence.learnings.length, 1);
    // No limit warnings
    const limitWarnings = result.validationWarnings.filter(
      w => w.reason.includes('exceeds'),
    );
    assert.equal(limitWarnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// extractMeetingIntelligence - quality tuning integration (INT-1)
// ---------------------------------------------------------------------------

describe('extractMeetingIntelligence - quality tuning integration', () => {
  it('produces fewer items with filters than raw extraction', async () => {
    // Simulate an LLM returning noisy output with duplicates and trivial items
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        summary: 'Product planning meeting',
        action_items: [
          { owner: 'John', description: 'Send API docs to Sarah', direction: 'i_owe_them', confidence: 0.9 },
          { owner: 'John', description: 'Send API docs to Sarah now', direction: 'i_owe_them', confidence: 0.85 }, // near-duplicate (Jaccard 5/6=0.833)
          { owner: 'Jane', description: 'Schedule a meeting with team', direction: 'i_owe_them' }, // trivial
          { owner: 'Bob', description: 'Follow up on the status', direction: 'i_owe_them' }, // trivial
          { owner: 'Alice', description: 'Review the PR by Monday', direction: 'they_owe_me', confidence: 0.92 }, // valid
        ],
        // Jaccard 8/9 = 0.889 - only one word different
        decisions: ['We decided to use REST API for integration', 'We decided to use REST API for integration today'],
        // Jaccard 6/7 = 0.857 - only one word different
        learnings: ['Team prefers simple and clean interfaces', 'Team prefers simple and clean interfaces always'],
      });

    const result = await extractMeetingIntelligence('transcript', mockLLM);

    // Raw items should have all 5 action items
    assert.equal(result.rawItems.filter(r => r.type === 'action').length, 5);
    // Filtered action items should be fewer (2: one valid + one after dedup, minus trivials)
    assert.ok(
      result.intelligence.actionItems.length < 5,
      `Expected fewer than 5 action items, got ${result.intelligence.actionItems.length}`,
    );
    // Decisions and learnings should also be deduplicated
    assert.equal(result.intelligence.decisions.length, 1);
    assert.equal(result.intelligence.learnings.length, 1);
  });
});

// ---------------------------------------------------------------------------
// extractMeetingIntelligence
// ---------------------------------------------------------------------------

describe('extractMeetingIntelligence', () => {
  it('returns empty result for empty transcript', async () => {
    const mockLLM: LLMCallFn = async () => '{}';
    const result = await extractMeetingIntelligence('', mockLLM);
    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
  });

  it('returns empty result for whitespace transcript', async () => {
    const mockLLM: LLMCallFn = async () => '{}';
    const result = await extractMeetingIntelligence('   \n  ', mockLLM);
    assert.equal(result.intelligence.summary, '');
  });

  it('calls LLM with built prompt', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return '{"summary": "Test"}';
    };

    await extractMeetingIntelligence('Alice: Hello\nBob: Hi', mockLLM);

    assert.ok(capturedPrompt.includes('Alice: Hello'));
    assert.ok(capturedPrompt.includes('Bob: Hi'));
  });

  it('passes attendees to prompt builder', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return '{}';
    };

    await extractMeetingIntelligence('content', mockLLM, {
      attendees: ['Alice', 'Bob'],
    });

    assert.ok(capturedPrompt.includes('Alice'));
    assert.ok(capturedPrompt.includes('Bob'));
  });

  it('passes ownerSlug to prompt builder', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return '{}';
    };

    await extractMeetingIntelligence('content', mockLLM, {
      ownerSlug: 'john-smith',
    });

    assert.ok(capturedPrompt.includes('john-smith'));
  });

  it('returns parsed result from LLM response', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        summary: 'Great meeting',
        action_items: [
          {
            owner: 'Alice',
            description: 'Send report',
            direction: 'i_owe_them',
          },
        ],
      });

    const result = await extractMeetingIntelligence('transcript', mockLLM);

    assert.equal(result.intelligence.summary, 'Great meeting');
    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.actionItems[0].owner, 'Alice');
  });

  it('returns empty result on LLM error', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('API rate limit');
    };

    const result = await extractMeetingIntelligence('transcript', mockLLM);

    assert.equal(result.intelligence.summary, '');
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.validationWarnings.length, 0);
  });

  it('includes validation warnings from parser', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        action_items: [
          {
            owner: 'Bob',
            description: "Me: Yeah, I'll look into that",
            direction: 'i_owe_them',
          },
        ],
      });

    const result = await extractMeetingIntelligence('transcript', mockLLM);

    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.validationWarnings.length, 1);
  });

  it('accepts priorItems option without error', async () => {
    // Task 4: priorItems is plumbing only — this test confirms the option is accepted.
    // Task 6 will add actual prompt rendering tests for priorItems content.
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        summary: 'Meeting',
        action_items: [],
      });

    const priorItems = [
      { type: 'action' as const, text: 'Send API docs to Sarah', source: 'standup-2026-03-24' },
      { type: 'decision' as const, text: 'Use REST over GraphQL' },
    ];

    const result = await extractMeetingIntelligence('transcript', mockLLM, {
      priorItems,
    });

    // Should return a valid result (no type errors, no runtime errors)
    assert.equal(result.intelligence.summary, 'Meeting');
  });
});

// ---------------------------------------------------------------------------
// formatStagedSections - Action Item Formatting
// ---------------------------------------------------------------------------

describe('formatStagedSections - action item formatting', () => {
  function makeResult(
    actionItems: ActionItem[],
    decisions: string[] = [],
    learnings: string[] = [],
    summary = 'Test summary',
  ): MeetingExtractionResult {
    return {
      intelligence: {
        summary,
        actionItems,
        nextSteps: [],
        decisions,
        learnings,
      },
      validationWarnings: [],
    };
  }

  it('formats i_owe_them with counterparty using → arrow', () => {
    const result = makeResult([
      {
        owner: 'John Smith',
        ownerSlug: 'john-smith',
        description: 'Send API docs',
        direction: 'i_owe_them',
        counterpartySlug: 'sarah-chen',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('- ai_001: [@john-smith → @sarah-chen] Send API docs'));
  });

  it('formats they_owe_me with counterparty using ← arrow', () => {
    const result = makeResult([
      {
        owner: 'Sarah Chen',
        ownerSlug: 'sarah-chen',
        description: 'Review the PR',
        direction: 'they_owe_me',
        counterpartySlug: 'john-smith',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('- ai_001: [@sarah-chen ← @john-smith] Review the PR'));
  });

  it('formats i_owe_them without counterparty', () => {
    const result = makeResult([
      {
        owner: 'John Smith',
        ownerSlug: 'john-smith',
        description: 'Submit proposal',
        direction: 'i_owe_them',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('- ai_001: [@john-smith →] Submit proposal'));
  });

  it('formats they_owe_me without counterparty', () => {
    const result = makeResult([
      {
        owner: 'Sarah Chen',
        ownerSlug: 'sarah-chen',
        description: 'Send meeting notes',
        direction: 'they_owe_me',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('- ai_001: [@sarah-chen ←] Send meeting notes'));
  });

  it('includes due date in parentheses when present', () => {
    const result = makeResult([
      {
        owner: 'John Smith',
        ownerSlug: 'john-smith',
        description: 'Send API docs',
        direction: 'i_owe_them',
        counterpartySlug: 'sarah-chen',
        due: 'Friday',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('- ai_001: [@john-smith → @sarah-chen] Send API docs (Friday)'));
  });

  it('omits due date when not present', () => {
    const result = makeResult([
      {
        owner: 'John Smith',
        ownerSlug: 'john-smith',
        description: 'Send API docs',
        direction: 'i_owe_them',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('[@john-smith →] Send API docs'));
    assert.ok(!output.includes('('));
  });
});

// ---------------------------------------------------------------------------
// formatStagedSections - ID Formatting
// ---------------------------------------------------------------------------

describe('formatStagedSections - ID zero-padding', () => {
  function makeResult(
    actionItems: ActionItem[],
    decisions: string[] = [],
    learnings: string[] = [],
  ): MeetingExtractionResult {
    return {
      intelligence: {
        summary: 'Test summary',
        actionItems,
        nextSteps: [],
        decisions,
        learnings,
      },
      validationWarnings: [],
    };
  }

  it('zero-pads single digit IDs (001)', () => {
    const result = makeResult([
      {
        owner: 'Alice',
        ownerSlug: 'alice',
        description: 'Task one',
        direction: 'i_owe_them',
      },
    ]);

    const output = formatStagedSections(result);
    assert.ok(output.includes('ai_001'));
  });

  it('zero-pads double digit IDs (010)', () => {
    const items: ActionItem[] = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        owner: `Person ${i}`,
        ownerSlug: `person-${i}`,
        description: `Task ${i}`,
        direction: 'i_owe_them',
      });
    }

    const result = makeResult(items);
    const output = formatStagedSections(result);

    assert.ok(output.includes('ai_001'));
    assert.ok(output.includes('ai_009'));
    assert.ok(output.includes('ai_010'));
  });

  it('handles triple digit IDs (100)', () => {
    const items: ActionItem[] = [];
    for (let i = 0; i < 100; i++) {
      items.push({
        owner: `Person ${i}`,
        ownerSlug: `person-${i}`,
        description: `Task ${i}`,
        direction: 'i_owe_them',
      });
    }

    const result = makeResult(items);
    const output = formatStagedSections(result);

    assert.ok(output.includes('ai_099'));
    assert.ok(output.includes('ai_100'));
  });

  it('applies zero-padding to all section types', () => {
    const result = makeResult(
      [
        { owner: 'A', ownerSlug: 'a', description: 'AI 1', direction: 'i_owe_them' },
      ],
      ['Decision 1'],
      ['Learning 1'],
    );

    const output = formatStagedSections(result);

    assert.ok(output.includes('ai_001'));
    assert.ok(output.includes('de_001'));
    assert.ok(output.includes('le_001'));
  });
});

// ---------------------------------------------------------------------------
// formatStagedSections - Section Inclusion
// ---------------------------------------------------------------------------

describe('formatStagedSections - section inclusion', () => {
  it('includes all sections when populated', () => {
    const result: MeetingExtractionResult = {
      intelligence: {
        summary: 'A productive meeting',
        actionItems: [
          {
            owner: 'Alice',
            ownerSlug: 'alice',
            description: 'Do something',
            direction: 'i_owe_them',
          },
        ],
        nextSteps: ['Step 1'],
        decisions: ['Decision 1'],
        learnings: ['Learning 1'],
      },
      validationWarnings: [],
    };

    const output = formatStagedSections(result);

    assert.ok(output.includes('## Summary'));
    assert.ok(output.includes('A productive meeting'));
    assert.ok(output.includes('## Staged Action Items'));
    assert.ok(output.includes('## Staged Decisions'));
    assert.ok(output.includes('## Staged Learnings'));
  });

  it('omits empty Staged Action Items section', () => {
    const result: MeetingExtractionResult = {
      intelligence: {
        summary: 'Meeting',
        actionItems: [],
        nextSteps: [],
        decisions: ['Decision 1'],
        learnings: [],
      },
      validationWarnings: [],
    };

    const output = formatStagedSections(result);

    assert.ok(!output.includes('## Staged Action Items'));
    assert.ok(output.includes('## Staged Decisions'));
  });

  it('omits empty Staged Decisions section', () => {
    const result: MeetingExtractionResult = {
      intelligence: {
        summary: 'Meeting',
        actionItems: [
          { owner: 'A', ownerSlug: 'a', description: 'Task', direction: 'i_owe_them' },
        ],
        nextSteps: [],
        decisions: [],
        learnings: ['Learning 1'],
      },
      validationWarnings: [],
    };

    const output = formatStagedSections(result);

    assert.ok(output.includes('## Staged Action Items'));
    assert.ok(!output.includes('## Staged Decisions'));
    assert.ok(output.includes('## Staged Learnings'));
  });

  it('omits empty Staged Learnings section', () => {
    const result: MeetingExtractionResult = {
      intelligence: {
        summary: 'Meeting',
        actionItems: [],
        nextSteps: [],
        decisions: ['Decision 1'],
        learnings: [],
      },
      validationWarnings: [],
    };

    const output = formatStagedSections(result);

    assert.ok(!output.includes('## Staged Learnings'));
    assert.ok(output.includes('## Staged Decisions'));
  });

  it('always includes Summary even when empty', () => {
    const result: MeetingExtractionResult = {
      intelligence: {
        summary: '',
        actionItems: [],
        nextSteps: [],
        decisions: [],
        learnings: [],
      },
      validationWarnings: [],
    };

    const output = formatStagedSections(result);

    assert.ok(output.includes('## Summary'));
  });
});

// ---------------------------------------------------------------------------
// updateMeetingContent - basic operations
// ---------------------------------------------------------------------------

describe('updateMeetingContent - basic operations', () => {
  it('appends staged sections at end when no existing summary', () => {
    const original = `---
title: Team Meeting
date: 2026-03-01
---

## Transcript
Alice: Hello
Bob: Hi there`;

    const staged = `## Summary
A brief meeting.

## Staged Action Items
- ai_001: [@alice →] Send docs
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('## Transcript'));
    assert.ok(result.endsWith(staged));
    assert.ok(result.includes('\n\n## Summary'));
  });

  it('replaces existing summary and staged sections in place', () => {
    const original = `---
title: Team Meeting
---

## Transcript
Alice: Hello

## Summary
Old summary

## Staged Action Items
- ai_001: [@bob →] Old task
`;

    const staged = `## Summary
New summary

## Staged Decisions
- de_001: New decision
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('## Transcript'));
    assert.ok(result.includes('New summary'));
    assert.ok(!result.includes('Old summary'));
    assert.ok(!result.includes('Old task'));
    assert.ok(result.includes('de_001: New decision'));
  });

  it('preserves content after staged sections', () => {
    const original = `---
title: Meeting
---

## Summary
Old summary

## Staged Action Items
- ai_001: Old task

## Notes
These are my notes.

## Follow-up
Need to check on X.`;

    const staged = `## Summary
New summary

## Staged Decisions
- de_001: Decision
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('New summary'));
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('These are my notes.'));
    assert.ok(result.includes('## Follow-up'));
    assert.ok(result.includes('Need to check on X.'));
  });

  it('preserves frontmatter and transcript before Summary', () => {
    const original = `---
title: Planning Meeting
date: 2026-03-01
attendees:
  - alice
  - bob
---

## Transcript
Alice: Let's discuss the roadmap.
Bob: Sounds good.

## Summary
Old summary`;

    const staged = `## Summary
New summary
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('title: Planning Meeting'));
    assert.ok(result.includes('## Transcript'));
    assert.ok(result.includes("Let's discuss the roadmap"));
    assert.ok(result.includes('New summary'));
    assert.ok(!result.includes('Old summary'));
  });
});

// ---------------------------------------------------------------------------
// updateMeetingContent - idempotency
// ---------------------------------------------------------------------------

describe('updateMeetingContent - idempotency', () => {
  it('produces same result when run twice', () => {
    const original = `---
title: Meeting
---

## Transcript
Some transcript`;

    const staged = `## Summary
Meeting summary

## Staged Action Items
- ai_001: [@alice → @bob] Send docs (Friday)

## Staged Decisions
- de_001: Use REST API
`;

    const firstRun = updateMeetingContent(original, staged);
    const secondRun = updateMeetingContent(firstRun, staged);

    assert.equal(firstRun, secondRun);
  });

  it('produces same result with different initial staged content', () => {
    const withOldStaged = `---
title: Meeting
---

## Transcript
Some transcript

## Summary
Old summary

## Staged Action Items
- ai_001: [@carol →] Old task

## Staged Learnings
- le_001: Old learning`;

    const staged = `## Summary
New summary

## Staged Decisions
- de_001: New decision
`;

    const firstRun = updateMeetingContent(withOldStaged, staged);
    const secondRun = updateMeetingContent(firstRun, staged);

    assert.equal(firstRun, secondRun);
  });

  it('is idempotent with content after staged sections', () => {
    const original = `---
title: Meeting
---

## Transcript
Content

## Summary
Old

## Notes
Important notes`;

    const staged = `## Summary
New summary

## Staged Action Items
- ai_001: [@alice →] Task
`;

    const firstRun = updateMeetingContent(original, staged);
    const secondRun = updateMeetingContent(firstRun, staged);

    assert.equal(firstRun, secondRun);
    assert.ok(secondRun.includes('## Notes'));
    assert.ok(secondRun.includes('Important notes'));
  });
});

// ---------------------------------------------------------------------------
// updateMeetingContent - edge cases
// ---------------------------------------------------------------------------

describe('updateMeetingContent - edge cases', () => {
  it('handles content with no headers at all', () => {
    const original = 'Just some plain text content.';
    const staged = `## Summary
Meeting summary
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('Just some plain text content.'));
    assert.ok(result.includes('## Summary'));
    assert.ok(result.includes('Meeting summary'));
  });

  it('handles empty original content', () => {
    const original = '';
    const staged = `## Summary
Summary
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('## Summary'));
  });

  it('handles whitespace-only original content', () => {
    const original = '   \n\n   ';
    const staged = `## Summary
Summary
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('## Summary'));
  });

  it('does not confuse ## Summary-like text with actual header', () => {
    const original = `## Transcript
Bob: The ## Summary section is important.

## Notes
More notes`;

    const staged = `## Summary
Real summary
`;

    const result = updateMeetingContent(original, staged);

    // Should append since there's no real ## Summary header (at line start with nothing after)
    assert.ok(result.includes('## Transcript'));
    assert.ok(result.includes('## Notes'));
    assert.ok(result.includes('Real summary'));
  });

  it('handles multiple ## Summary headers (uses first one)', () => {
    const original = `## Transcript
Content

## Summary
First summary

## Notes
Some notes

## Summary
Duplicate summary`;

    const staged = `## Summary
New summary
`;

    const result = updateMeetingContent(original, staged);

    assert.ok(result.includes('New summary'));
    assert.ok(result.includes('## Notes'));
    // The second Summary should be treated as non-staged content
  });
});

// ---------------------------------------------------------------------------
// buildMeetingExtractionPrompt - context enhancement (T2)
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt - context enhancement', () => {
  // Helper to create a minimal MeetingContextBundle
  function makeContext(overrides: Partial<{
    attendees: Array<{
      slug: string;
      email: string;
      name: string;
      category: string;
      profile: string;
      stances: string[];
      openItems: string[];
      recentMeetings: string[];
    }>;
    goals: Array<{ slug: string; title: string; summary: string }>;
    unchecked: string[];
  }> = {}): Parameters<typeof buildMeetingExtractionPrompt>[3] {
    return {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-19',
        attendees: ['alice@example.com', 'bob@example.com'],
        transcript: 'Alice: Hello\nBob: Hi',
      },
      agenda: overrides.unchecked ? {
        path: '/path/to/agenda.md',
        items: [],
        unchecked: overrides.unchecked,
      } : null,
      attendees: overrides.attendees ?? [],
      unknownAttendees: [],
      relatedContext: {
        goals: overrides.goals ?? [],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
    };
  }

  it('without context: behaves exactly as before (backward compatibility)', () => {
    const transcript = 'Alice: We should use React.\nBob: Agreed.';
    
    // Call without context
    const promptWithoutContext = buildMeetingExtractionPrompt(transcript, ['Alice', 'Bob'], 'john-smith');
    
    // Call with undefined context (explicit)
    const promptWithUndefined = buildMeetingExtractionPrompt(transcript, ['Alice', 'Bob'], 'john-smith', undefined);
    
    // Both should be identical
    assert.equal(promptWithoutContext, promptWithUndefined);
    
    // Should NOT contain context section
    assert.ok(!promptWithoutContext.includes('## Meeting Context'));
    assert.ok(!promptWithoutContext.includes('### Attendee Context'));
  });

  it('includes attendee context with stances', () => {
    const context = makeContext({
      attendees: [{
        slug: 'alice-smith',
        email: 'alice@example.com',
        name: 'Alice Smith',
        category: 'internal',
        profile: 'Senior PM',
        stances: ['Prefers async communication', 'Favors TypeScript over JavaScript'],
        openItems: [],
        recentMeetings: [],
      }],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('## Meeting Context'));
    assert.ok(prompt.includes('### Attendee Context'));
    assert.ok(prompt.includes('Alice Smith'));
    assert.ok(prompt.includes('@alice-smith'));
    assert.ok(prompt.includes('internal'));
    assert.ok(prompt.includes('Prefers async communication'));
  });

  it('includes attendee open items', () => {
    const context = makeContext({
      attendees: [{
        slug: 'bob-jones',
        email: 'bob@example.com',
        name: 'Bob Jones',
        category: 'customers',
        profile: 'Enterprise client',
        stances: [],
        openItems: ['Review Q1 proposal', 'Follow up on pricing'],
        recentMeetings: [],
      }],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('Open items:'));
    assert.ok(prompt.includes('Review Q1 proposal'));
  });

  it('includes related goals', () => {
    const context = makeContext({
      goals: [
        { slug: 'q1-revenue', title: 'Increase Q1 revenue by 20%', summary: 'Revenue target' },
        { slug: 'ship-v2', title: 'Ship v2.0 by March', summary: 'Product launch' },
      ],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Related Goals'));
    assert.ok(prompt.includes('Increase Q1 revenue by 20%'));
    assert.ok(prompt.includes('Ship v2.0 by March'));
  });

  it('includes unchecked agenda items with instruction', () => {
    const context = makeContext({
      unchecked: [
        'Discuss API redesign timeline',
        'Review Q1 metrics',
        'Assign ownership for mobile app',
      ],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Unchecked Agenda Items'));
    assert.ok(prompt.includes('should become action items'));
    assert.ok(prompt.includes('Discuss API redesign timeline'));
    assert.ok(prompt.includes('Review Q1 metrics'));
    assert.ok(prompt.includes('Assign ownership for mobile app'));
  });

  it('combines multiple context sections', () => {
    const context = makeContext({
      attendees: [{
        slug: 'alice-smith',
        email: 'alice@example.com',
        name: 'Alice Smith',
        category: 'internal',
        profile: '',
        stances: ['Prefers detailed specs'],
        openItems: ['Draft PRD'],
        recentMeetings: [],
      }],
      goals: [{ slug: 'ship-v2', title: 'Ship v2.0', summary: '' }],
      unchecked: ['Review timeline'],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Attendee Context'));
    assert.ok(prompt.includes('### Related Goals'));
    assert.ok(prompt.includes('### Unchecked Agenda Items'));
  });

  it('limits stances and open items to first 3', () => {
    const context = makeContext({
      attendees: [{
        slug: 'verbose-person',
        email: 'verbose@example.com',
        name: 'Verbose Person',
        category: 'internal',
        profile: '',
        stances: ['Stance 1', 'Stance 2', 'Stance 3', 'Stance 4', 'Stance 5'],
        openItems: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
        recentMeetings: [],
      }],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include first 3, not all 5
    assert.ok(prompt.includes('Stance 1'));
    assert.ok(prompt.includes('Stance 3'));
    assert.ok(!prompt.includes('Stance 4'));
    assert.ok(!prompt.includes('Stance 5'));
    
    assert.ok(prompt.includes('Item 1'));
    assert.ok(prompt.includes('Item 3'));
    assert.ok(!prompt.includes('Item 4'));
  });

  it('limits goals to first 5', () => {
    const goals = [];
    for (let i = 1; i <= 8; i++) {
      goals.push({ slug: `goal-${i}`, title: `Goal Number ${i}`, summary: '' });
    }

    const context = makeContext({ goals });
    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include first 5
    assert.ok(prompt.includes('Goal Number 1'));
    assert.ok(prompt.includes('Goal Number 5'));
    // Should NOT include 6+
    assert.ok(!prompt.includes('Goal Number 6'));
    assert.ok(!prompt.includes('Goal Number 8'));
  });

  it('omits empty context sections', () => {
    // Context with no attendees, goals, or agenda
    const context = makeContext({
      attendees: [],
      goals: [],
      unchecked: undefined,
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should NOT include context section at all (empty)
    assert.ok(!prompt.includes('## Meeting Context'));
    assert.ok(!prompt.includes('### Attendee Context'));
    assert.ok(!prompt.includes('### Related Goals'));
  });

  it('omits category when unknown', () => {
    const context = makeContext({
      attendees: [{
        slug: 'mystery-person',
        email: 'mystery@example.com',
        name: 'Mystery Person',
        category: 'unknown',
        profile: '',
        stances: [],
        openItems: [],
        recentMeetings: [],
      }],
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include name but not "unknown" category
    assert.ok(prompt.includes('Mystery Person'));
    assert.ok(!prompt.includes('— unknown'));
  });
});

// ---------------------------------------------------------------------------
// extractMeetingIntelligence - context option (T2)
// ---------------------------------------------------------------------------

describe('extractMeetingIntelligence - context option', () => {
  it('passes context to prompt builder', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return '{"summary": "Test"}';
    };

    const context = {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-19',
        attendees: ['alice@example.com'],
        transcript: 'content',
      },
      agenda: {
        path: '/path/to/agenda.md',
        items: [],
        unchecked: ['Review API design'],
      },
      attendees: [{
        slug: 'alice-smith',
        email: 'alice@example.com',
        name: 'Alice Smith',
        category: 'internal',
        profile: '',
        stances: ['Detail-oriented'],
        openItems: [],
        recentMeetings: [],
      }],
      unknownAttendees: [],
      relatedContext: {
        goals: [{ slug: 'ship-v2', title: 'Ship v2.0', summary: '' }],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
    };

    await extractMeetingIntelligence('transcript', mockLLM, { context });

    // Verify context appears in prompt
    assert.ok(capturedPrompt.includes('Alice Smith'));
    assert.ok(capturedPrompt.includes('Detail-oriented'));
    assert.ok(capturedPrompt.includes('Ship v2.0'));
    assert.ok(capturedPrompt.includes('Review API design'));
  });

  it('without context: prompt matches non-context version (backward compat)', async () => {
    let promptWithContext = '';
    let promptWithoutContext = '';

    const mockLLM1: LLMCallFn = async (prompt) => {
      promptWithContext = prompt;
      return '{}';
    };
    const mockLLM2: LLMCallFn = async (prompt) => {
      promptWithoutContext = prompt;
      return '{}';
    };

    await extractMeetingIntelligence('same transcript', mockLLM1, {
      attendees: ['Alice'],
      ownerSlug: 'bob',
      context: undefined,
    });

    await extractMeetingIntelligence('same transcript', mockLLM2, {
      attendees: ['Alice'],
      ownerSlug: 'bob',
    });

    // Both prompts should be identical when context is undefined vs omitted
    assert.equal(promptWithContext, promptWithoutContext);
  });

  it('context produces richer extraction output', async () => {
    // Simulate LLM that uses context to produce better results
    const mockLLM: LLMCallFn = async (prompt) => {
      // If context is present (check for marker text), return richer output
      if (prompt.includes('### Unchecked Agenda Items')) {
        return JSON.stringify({
          summary: 'Meeting about API design with unchecked items converted to actions',
          action_items: [
            {
              owner: 'Alice Smith',
              owner_slug: 'alice-smith',
              description: 'Review API design (from agenda)',
              direction: 'i_owe_them',
              confidence: 0.9,
            },
          ],
          decisions: ['Use REST API'],
          learnings: [],
        });
      }
      // Without context, minimal output
      return JSON.stringify({
        summary: 'Meeting about API design',
        action_items: [],
        decisions: [],
        learnings: [],
      });
    };

    const context = {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-19',
        attendees: [],
        transcript: '',
      },
      agenda: {
        path: '/path/to/agenda.md',
        items: [],
        unchecked: ['Review API design'],
      },
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
    };

    // With context
    const withContext = await extractMeetingIntelligence('Meeting about API', mockLLM, { context });
    
    // Without context
    const withoutContext = await extractMeetingIntelligence('Meeting about API', mockLLM);

    // Context version should have action items derived from unchecked agenda
    assert.equal(withContext.intelligence.actionItems.length, 1);
    assert.ok(withContext.intelligence.actionItems[0].description.includes('from agenda'));
    
    // Non-context version should have no action items
    assert.equal(withoutContext.intelligence.actionItems.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildExclusionListSection - unit tests (Task 6)
// ---------------------------------------------------------------------------

describe('buildExclusionListSection', () => {
  // Helper to create a minimal MeetingContextBundle
  function makeContext(overrides: Partial<{
    recentDecisions: string[];
    recentLearnings: string[];
  }> = {}): MeetingContextBundle {
    return {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-25',
        attendees: [],
        transcript: '',
      },
      agenda: null,
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [],
        projects: [],
        recentDecisions: overrides.recentDecisions ?? [],
        recentLearnings: overrides.recentLearnings ?? [],
      },
      warnings: [],
    };
  }

  it('returns empty string when no items', () => {
    const result = buildExclusionListSection();
    assert.equal(result, '');
  });

  it('returns empty string when priorItems is empty array', () => {
    const result = buildExclusionListSection(undefined, []);
    assert.equal(result, '');
  });

  it('returns empty string when context has empty arrays', () => {
    const context = makeContext({ recentDecisions: [], recentLearnings: [] });
    const result = buildExclusionListSection(context);
    assert.equal(result, '');
  });

  it('includes prior action items with source', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Send API docs to Sarah', source: 'standup-2026-03-24' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('## Exclusion List (SKIP these — already captured)'));
    assert.ok(result.includes('**Staged Action Items:**'));
    assert.ok(result.includes('Send API docs to Sarah'));
    assert.ok(result.includes('standup-2026-03-24'));
  });

  it('uses "Prior Meeting" when source is not provided', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Review the PR' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('Review the PR'));
    assert.ok(result.includes('Prior Meeting'));
  });

  it('includes prior decisions with source', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'Use React for frontend', source: 'planning-meeting' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('**Staged Decisions:**'));
    assert.ok(result.includes('Use React for frontend'));
    assert.ok(result.includes('planning-meeting'));
  });

  it('includes prior learnings with source', () => {
    const priorItems: PriorItem[] = [
      { type: 'learning', text: 'Team prefers async communication' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('**Staged Learnings:**'));
    assert.ok(result.includes('Team prefers async communication'));
  });

  it('includes recentDecisions from context', () => {
    const context = makeContext({
      recentDecisions: ['Cover Whale is next priority'],
    });

    const result = buildExclusionListSection(context);

    assert.ok(result.includes('**Staged Decisions:**'));
    assert.ok(result.includes('Cover Whale is next priority'));
    assert.ok(result.includes('Recent Decision'));
  });

  it('includes recentLearnings from context', () => {
    const context = makeContext({
      recentLearnings: ['Key insight about the system'],
    });

    const result = buildExclusionListSection(context);

    assert.ok(result.includes('**Staged Learnings:**'));
    assert.ok(result.includes('Key insight about the system'));
    assert.ok(result.includes('Recent Learning'));
  });

  it('groups items by type', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Action item 1', source: 'meeting-1' },
      { type: 'decision', text: 'Decision 1', source: 'meeting-1' },
      { type: 'learning', text: 'Learning 1', source: 'meeting-1' },
      { type: 'action', text: 'Action item 2', source: 'meeting-2' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    // All action items should be grouped together
    const actionSection = result.match(/\*\*Staged Action Items:\*\*([\s\S]*?)\*\*Staged/);
    assert.ok(actionSection);
    assert.ok(actionSection[1].includes('Action item 1'));
    assert.ok(actionSection[1].includes('Action item 2'));
  });

  it('combines priorItems and context items', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'Use REST API', source: 'prior-meeting' },
    ];
    const context = makeContext({
      recentDecisions: ['Adopt TypeScript'],
      recentLearnings: ['Testing improves quality'],
    });

    const result = buildExclusionListSection(context, priorItems);

    // Should have decisions from both sources
    assert.ok(result.includes('Use REST API'));
    assert.ok(result.includes('Adopt TypeScript'));
    // Should have learnings
    assert.ok(result.includes('Testing improves quality'));
  });

  it('uses positive "SKIP" framing', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Test item' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('SKIP these'));
    assert.ok(result.includes('SKIP IT'));
    // Should NOT use negative framing
    assert.ok(!result.includes('do not extract'));
    assert.ok(!result.includes("don't extract"));
  });

  it('includes "semantic equivalent" language', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Test item' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('semantic'));
    assert.ok(result.includes('semantically equivalent'));
  });

  it('documents UPDATE exception', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Test item' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('Exception'));
    assert.ok(result.includes('UPDATE'));
    // Should mention specific update scenarios
    assert.ok(result.includes('status change') || result.includes('deadline moved') || result.includes('decision reversed'));
  });

  it('limits items per category to 10', () => {
    const priorItems: PriorItem[] = [];
    for (let i = 0; i < 15; i++) {
      priorItems.push({ type: 'action', text: `Action item ${i + 1}`, source: 'meeting' });
    }

    const result = buildExclusionListSection(undefined, priorItems);

    // Should only include 10 items (most recent = last 10, which is items 6-15)
    // Use quotes to match exact items (avoid "Action item 1" matching "Action item 15")
    assert.ok(result.includes('"Action item 15"')); // most recent
    assert.ok(result.includes('"Action item 6"')); // first of last 10
    assert.ok(!result.includes('"Action item 1"')); // dropped - too old
    assert.ok(!result.includes('"Action item 5"')); // dropped - too old
  });

  it('numbers items within each category', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'First decision' },
      { type: 'decision', text: 'Second decision' },
    ];

    const result = buildExclusionListSection(undefined, priorItems);

    assert.ok(result.includes('1. "First decision"'));
    assert.ok(result.includes('2. "Second decision"'));
  });
});

// ---------------------------------------------------------------------------
// buildMeetingExtractionPrompt - exclusion list integration (Task 6)
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt - exclusion list', () => {
  it('includes exclusion list when priorItems provided', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Send docs to Sarah', source: 'standup' },
    ];

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, undefined, priorItems);

    assert.ok(prompt.includes('## Exclusion List'));
    assert.ok(prompt.includes('Send docs to Sarah'));
    assert.ok(prompt.includes('standup'));
  });

  it('includes exclusion list when context has recent items', () => {
    const context: MeetingContextBundle = {
      meeting: { path: '', title: '', date: '', attendees: [], transcript: '' },
      agenda: null,
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [],
        projects: [],
        recentDecisions: ['Use microservices architecture'],
        recentLearnings: [],
      },
      warnings: [],
    };

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('## Exclusion List'));
    assert.ok(prompt.includes('Use microservices architecture'));
    assert.ok(prompt.includes('Recent Decision'));
  });

  it('omits exclusion list when no prior items or recent context', () => {
    const context: MeetingContextBundle = {
      meeting: { path: '', title: '', date: '', attendees: [], transcript: '' },
      agenda: null,
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [{ slug: 'goal-1', title: 'Ship v2', summary: '' }], // goals don't go in exclusion list
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
    };

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('## Exclusion List'));
  });

  it('places exclusion list before transcript', () => {
    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'Use React' },
    ];

    const prompt = buildMeetingExtractionPrompt('Meeting transcript content here', undefined, undefined, undefined, priorItems);

    const exclusionIndex = prompt.indexOf('## Exclusion List');
    const transcriptIndex = prompt.indexOf('Transcript:');

    assert.ok(exclusionIndex > 0);
    assert.ok(transcriptIndex > 0);
    assert.ok(exclusionIndex < transcriptIndex, 'Exclusion list should come before transcript');
  });

  it('combines context and priorItems exclusions', () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Review the PR', source: 'standup' },
    ];
    const context: MeetingContextBundle = {
      meeting: { path: '', title: '', date: '', attendees: [], transcript: '' },
      agenda: null,
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [],
        projects: [],
        recentDecisions: ['Adopt GraphQL'],
        recentLearnings: ['Performance matters'],
      },
      warnings: [],
    };

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context, priorItems);

    assert.ok(prompt.includes('Review the PR'));
    assert.ok(prompt.includes('Adopt GraphQL'));
    assert.ok(prompt.includes('Performance matters'));
  });
});

// ---------------------------------------------------------------------------
// extractMeetingIntelligence - UPDATE exception behavior (Task 6)
// ---------------------------------------------------------------------------

describe('extractMeetingIntelligence - UPDATE exception', () => {
  it('extracts new item when transcript updates prior decision', async () => {
    // This test validates the UPDATE exception: even though "Use React" is in
    // priorItems, if the transcript says "Switched to Vue", the LLM should
    // extract the NEW decision because it's an UPDATE, not a duplicate.

    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'Use React for frontend', source: 'planning-meeting' },
    ];

    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      // Simulate LLM correctly identifying the UPDATE scenario
      return JSON.stringify({
        summary: 'Team decided to switch frameworks',
        decisions: ['Switched to Vue (reverses prior React decision)'],
        action_items: [],
        learnings: [],
      });
    };

    const result = await extractMeetingIntelligence(
      'Alice: We reviewed React but decided Vue is better for our use case. Bob: Agreed, lets switch to Vue.',
      mockLLM,
      { priorItems },
    );

    // Verify the prompt includes the UPDATE exception language
    assert.ok(capturedPrompt.includes('Exception'));
    assert.ok(capturedPrompt.includes('decision reversed') || capturedPrompt.includes('UPDATE'));

    // The LLM extracted the new decision (simulated behavior)
    assert.equal(result.intelligence.decisions.length, 1);
    assert.ok(result.intelligence.decisions[0].includes('Vue'));
  });

  it('prompt includes UPDATE exception when prior items present', async () => {
    const priorItems: PriorItem[] = [
      { type: 'action', text: 'Send proposal by Friday' },
    ];

    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return '{}';
    };

    await extractMeetingIntelligence('transcript', mockLLM, { priorItems });

    // Verify UPDATE exception is documented
    assert.ok(capturedPrompt.includes('Exception'));
    assert.ok(
      capturedPrompt.includes('status change') ||
      capturedPrompt.includes('deadline moved') ||
      capturedPrompt.includes('decision reversed'),
    );
  });

  it('semantic equivalent skipping does not prevent genuine updates', async () => {
    // Prior item: "Launch scheduled for March"
    // Transcript: "We need to push the launch to April"
    // This is an UPDATE (deadline moved), not a duplicate

    const priorItems: PriorItem[] = [
      { type: 'decision', text: 'Launch scheduled for March', source: 'planning' },
    ];

    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({
        summary: 'Launch date updated',
        decisions: ['Launch pushed to April (deadline moved)'],
        action_items: [],
        learnings: [],
      });
    };

    const result = await extractMeetingIntelligence(
      'John: We need to push the launch to April due to testing delays.',
      mockLLM,
      { priorItems },
    );

    // The prompt should include both the prior decision AND the UPDATE exception
    assert.ok(capturedPrompt.includes('Launch scheduled for March'));
    assert.ok(capturedPrompt.includes('Exception'));

    // LLM should extract the update
    assert.equal(result.intelligence.decisions.length, 1);
    assert.ok(result.intelligence.decisions[0].includes('April'));
  });
});

// ---------------------------------------------------------------------------
// buildMeetingExtractionPrompt - area context (Task 9)
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt - area context', () => {
  // Helper to create a MeetingContextBundle with areaContext
  function makeContextWithArea(areaContext: {
    slug: string;
    name: string;
    status: string;
    recurringMeetings: Array<{ title: string; attendees: string[]; frequency?: string }>;
    filePath: string;
    sections: {
      currentState: string | null;
      keyDecisions: string | null;
      backlog: string | null;
      activeGoals: string | null;
      activeWork: string | null;
      openCommitments: string | null;
      notes: string | null;
    };
  } | undefined): MeetingContextBundle {
    return {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-25',
        attendees: [],
        transcript: '',
      },
      agenda: null,
      attendees: [],
      unknownAttendees: [],
      relatedContext: {
        goals: [],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
      areaContext,
    };
  }

  it('includes area context section when areaContext is present', () => {
    const context = makeContextWithArea({
      slug: 'product-development',
      name: 'Product Development',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/product-development.md',
      sections: {
        currentState: 'Working on v2.0 release',
        keyDecisions: null,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context (Product Development)'));
    assert.ok(prompt.includes('**Current State**: Working on v2.0 release'));
  });

  it('omits area context section when areaContext is not present', () => {
    const context = makeContextWithArea(undefined);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('### Area Context'));
  });

  it('truncates current state to 500 characters', () => {
    const longCurrentState = 'A'.repeat(600);
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: longCurrentState,
        keyDecisions: null,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include truncated content with ellipsis
    assert.ok(prompt.includes('A'.repeat(500) + '...'));
    // Should NOT include the full 600 character string
    assert.ok(!prompt.includes('A'.repeat(600)));
  });

  it('does not truncate current state under 500 characters', () => {
    const shortCurrentState = 'A'.repeat(400);
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: shortCurrentState,
        keyDecisions: null,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include full content without truncation ellipsis
    assert.ok(prompt.includes('A'.repeat(400)));
    // Verify no truncation occurred - the text should not end with "..."
    assert.ok(!prompt.includes('A'.repeat(400) + '...'));
  });

  it('parses bullet points from keyDecisions markdown string', () => {
    const keyDecisionsMarkdown = `Some intro text
- Decision to use TypeScript
- Decision to adopt GraphQL
* Another decision with asterisk
- Final important decision`;

    const context = makeContextWithArea({
      slug: 'tech-area',
      name: 'Technology',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/tech-area.md',
      sections: {
        currentState: null,
        keyDecisions: keyDecisionsMarkdown,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('**Recent Area Decisions**:'));
    assert.ok(prompt.includes('- Decision to use TypeScript'));
    assert.ok(prompt.includes('- Decision to adopt GraphQL'));
    assert.ok(prompt.includes('* Another decision with asterisk'));
    assert.ok(prompt.includes('- Final important decision'));
    // Should NOT include non-bullet text
    assert.ok(!prompt.includes('Some intro text'));
  });

  it('limits key decisions to last 5 bullet points', () => {
    const manyDecisions = `
- Decision 1
- Decision 2
- Decision 3
- Decision 4
- Decision 5
- Decision 6
- Decision 7`;

    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: null,
        keyDecisions: manyDecisions,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include last 5 (3, 4, 5, 6, 7)
    assert.ok(prompt.includes('Decision 3'));
    assert.ok(prompt.includes('Decision 7'));
    // Should NOT include first 2 (1, 2)
    assert.ok(!prompt.includes('Decision 1'));
    assert.ok(!prompt.includes('Decision 2'));
  });

  it('omits key decisions subsection if no bullet points found', () => {
    const noBullets = `This is just some text
without any bullet points
just regular paragraphs.`;

    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: 'Some current state',
        keyDecisions: noBullets,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context'));
    assert.ok(prompt.includes('**Current State**'));
    assert.ok(!prompt.includes('**Recent Area Decisions**'));
  });

  it('omits key decisions subsection if keyDecisions is null', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: 'Some current state',
        keyDecisions: null,
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context'));
    assert.ok(!prompt.includes('**Recent Area Decisions**'));
  });

  it('omits key decisions subsection if keyDecisions is empty string', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: 'Some state',
        keyDecisions: '',
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('**Recent Area Decisions**'));
  });

  it('includes area context with only keyDecisions (no currentState)', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        currentState: null,
        keyDecisions: '- Important decision',
        backlog: null,
        activeGoals: null,
        activeWork: null,
        openCommitments: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context (Test Area)'));
    assert.ok(!prompt.includes('**Current State**'));
    assert.ok(prompt.includes('**Recent Area Decisions**'));
    assert.ok(prompt.includes('- Important decision'));
  });

  it('combines area context with other context sections', () => {
    const context: MeetingContextBundle = {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-25',
        attendees: [],
        transcript: '',
      },
      agenda: {
        path: '/path/to/agenda.md',
        items: [],
        unchecked: ['Review timeline'],
      },
      attendees: [{
        slug: 'alice-smith',
        email: 'alice@example.com',
        name: 'Alice Smith',
        category: 'internal',
        profile: '',
        stances: [],
        openItems: [],
        recentMeetings: [],
      }],
      unknownAttendees: [],
      relatedContext: {
        goals: [{ slug: 'goal-1', title: 'Ship v2', summary: '' }],
        projects: [],
        recentDecisions: [],
        recentLearnings: [],
      },
      warnings: [],
      areaContext: {
        slug: 'product-area',
        name: 'Product Area',
        status: 'active',
        recurringMeetings: [],
        filePath: '/areas/product-area.md',
        sections: {
          currentState: 'Building features',
          keyDecisions: '- Decided on approach',
          backlog: null,
          activeGoals: null,
          activeWork: null,
          openCommitments: null,
          notes: null,
        },
      },
    };

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // All context sections should be present
    assert.ok(prompt.includes('### Attendee Context'));
    assert.ok(prompt.includes('### Related Goals'));
    assert.ok(prompt.includes('### Unchecked Agenda Items'));
    assert.ok(prompt.includes('### Area Context (Product Area)'));
  });
});
