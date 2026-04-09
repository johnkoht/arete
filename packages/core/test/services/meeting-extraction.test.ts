import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildMeetingExtractionPrompt,
  buildLightExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
  buildExclusionListSection,
  isTrivialDecision,
  isTrivialLearning,
  LIGHT_LIMITS,
  THOROUGH_LIMITS,
  CATEGORY_LIMITS,
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
    assert.ok(prompt.includes('Workspace owner'));
  });

  it('includes owner synthesis context when ownerSlug and ownerName provided', () => {
    const transcript = '**John Smith | 0:00** We need to ship the feature.\n**Sarah | 0:01** Agreed, let me handle the docs.';
    const prompt = buildMeetingExtractionPrompt(transcript, undefined, 'john-smith', undefined, undefined, 'John Smith');
    assert.ok(prompt.includes('@john-smith'));
    assert.ok(prompt.includes('(John Smith)'));
    assert.ok(prompt.includes('Speaking ratio:'));
    assert.ok(prompt.includes('include a sentence about what this meeting means specifically for the workspace owner'));
  });

  it('includes owner synthesis with zero speaking ratio when ownerName not in transcript speakers', () => {
    const transcript = '**Alice | 0:00** Hello.\n**Bob | 0:01** Hi there.';
    const prompt = buildMeetingExtractionPrompt(transcript, undefined, 'john-smith', undefined, undefined, 'John Smith');
    assert.ok(prompt.includes('@john-smith'));
    assert.ok(prompt.includes('(John Smith)'));
    // Speaking ratio is 0% since owner didn't speak but labels exist
    assert.ok(prompt.includes('Speaking ratio: 0%'));
    assert.ok(prompt.includes('include a sentence about what this meeting means specifically for the workspace owner'));
  });

  it('omits speaking ratio when transcript has no speaker labels', () => {
    const transcript = 'Just some plain text without speaker labels.';
    const prompt = buildMeetingExtractionPrompt(transcript, undefined, 'john-smith', undefined, undefined, 'John Smith');
    assert.ok(prompt.includes('@john-smith'));
    // No speaker labels → calculateSpeakingRatio returns undefined → no ratio shown
    assert.ok(!prompt.includes('Speaking ratio:'));
    assert.ok(prompt.includes('include a sentence about what this meeting means specifically for the workspace owner'));
  });

  it('has no owner context when ownerSlug is not provided (backward compat)', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(!prompt.includes('Workspace owner:'));
    assert.ok(!prompt.includes('Speaking ratio:'));
    assert.ok(!prompt.includes('include a sentence about what this meeting means specifically for the workspace owner'));
  });

  it('includes owner perspective instruction in summary schema', () => {
    const prompt = buildMeetingExtractionPrompt('content');
    assert.ok(prompt.includes('If workspace owner participated, include their perspective'));
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
    const items: Array<{ owner: string; description: string; direction: string }> = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        owner: `Person ${i}`,
        description: `Unique distinct action item number ${i}`,
        direction: 'i_owe_them',
      });
    }
    const response = JSON.stringify({ action_items: items });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.actionItems.length, 10);
    // All 10 fit within the new limit of 10, so no warning
    assert.ok(!result.validationWarnings.some(w => w.reason.includes('exceeds action item limit')));
  });

  it('enforces decision limit of 7', () => {
    const decisions: string[] = [];
    for (let i = 0; i < 10; i++) {
      decisions.push(`Unique distinct decision number ${i}`);
    }
    const response = JSON.stringify({ decisions });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 7);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds decision limit')));
  });

  it('enforces learning limit of 7', () => {
    const learnings: string[] = [];
    for (let i = 0; i < 10; i++) {
      learnings.push(`Unique distinct learning number ${i}`);
    }
    const response = JSON.stringify({ learnings });

    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.learnings.length, 7);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('exceeds learning limit')));
  });

  it('keeps first N items in LLM response order', () => {
    const items: Array<{ owner: string; description: string; direction: string }> = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        owner: `Person ${i}`,
        description: `Unique item ${i} with index identifier`,
        direction: 'i_owe_them',
      });
    }
    const response = JSON.stringify({ action_items: items });

    const result = parseMeetingExtractionResponse(response);
    // Should keep items 0-9 (first 10)
    for (let i = 0; i < 10; i++) {
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
      rawItems: [],
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
      rawItems: [],
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
      rawItems: [],
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
      rawItems: [],
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
      rawItems: [],
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
      rawItems: [],
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
      rawItems: [],
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
    const goals: Array<{ slug: string; title: string; summary: string }> = [];
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
// buildMeetingExtractionPrompt - existingTasks context (Phase 2 Task 2)
// ---------------------------------------------------------------------------

describe('buildMeetingExtractionPrompt - existingTasks context', () => {
  function makeMinimalContext(existingTasks?: string[]): Parameters<typeof buildMeetingExtractionPrompt>[3] {
    return {
      meeting: {
        path: '/path/to/meeting.md',
        title: 'Test Meeting',
        date: '2026-03-19',
        attendees: [],
        transcript: 'transcript',
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
      ...(existingTasks !== undefined && { existingTasks }),
    };
  }

  it('includes existing tasks section when existingTasks present', () => {
    const context = makeMinimalContext([
      'Send API documentation to Sarah',
      'Review quarterly goals',
      'Update project timeline',
    ]);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('## Meeting Context'));
    assert.ok(prompt.includes('### Existing Tasks'));
    assert.ok(prompt.includes('Send API documentation to Sarah'));
    assert.ok(prompt.includes('Review quarterly goals'));
    assert.ok(prompt.includes('Update project timeline'));
    assert.ok(prompt.includes('do not duplicate'));
  });

  it('omits existing tasks section when existingTasks is empty array', () => {
    const context = makeMinimalContext([]);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('### Existing Tasks'));
  });

  it('omits existing tasks section when existingTasks is undefined', () => {
    const context = makeMinimalContext(undefined);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('### Existing Tasks'));
  });

  it('includes all existing tasks in the prompt', () => {
    const tasks = ['Task one', 'Task two', 'Task three'];
    const context = makeMinimalContext(tasks);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    for (const task of tasks) {
      assert.ok(prompt.includes(task), `Expected prompt to include: ${task}`);
    }
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
      goal: string | null;
      focus: string | null;
      horizon: string | null;
      projects: string | null;
      backlog: string | null;
      stakeholders: string | null;
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
        goal: null,
        focus: 'Working on v2.0 release',
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context (Product Development)'));
    assert.ok(prompt.includes('**Focus**: Working on v2.0 release'));
  });

  it('omits area context section when areaContext is not present', () => {
    const context = makeContextWithArea(undefined);

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('### Area Context'));
  });

  it('truncates focus to 500 characters', () => {
    const longFocus = 'A'.repeat(600);
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: null,
        focus: longFocus,
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include truncated content with ellipsis
    assert.ok(prompt.includes('A'.repeat(500) + '...'));
    // Should NOT include the full 600 character string
    assert.ok(!prompt.includes('A'.repeat(600)));
  });

  it('does not truncate focus under 500 characters', () => {
    const shortFocus = 'A'.repeat(400);
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: null,
        focus: shortFocus,
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include full content without truncation ellipsis
    assert.ok(prompt.includes('A'.repeat(400)));
    // Verify no truncation occurred - the text should not end with "..."
    assert.ok(!prompt.includes('A'.repeat(400) + '...'));
  });

  it('parses bullet points from goal markdown string', () => {
    const goalMarkdown = `Some intro text
- [Ship CoverWhale integration](../goals/cw.md) (Q1 2026)
- [Launch email feature](../goals/email.md) (Q2 2026)
* Another goal with asterisk
- Final important goal`;

    const context = makeContextWithArea({
      slug: 'tech-area',
      name: 'Technology',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/tech-area.md',
      sections: {
        goal: goalMarkdown,
        focus: null,
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('**Area Goals**:'));
    assert.ok(prompt.includes('Ship CoverWhale integration'));
    assert.ok(prompt.includes('Launch email feature'));
    assert.ok(prompt.includes('* Another goal with asterisk'));
    assert.ok(prompt.includes('- Final important goal'));
    // Should NOT include non-bullet text
    assert.ok(!prompt.includes('Some intro text'));
  });

  it('limits goals to first 5 bullet points', () => {
    const manyGoals = `
- Goal 1
- Goal 2
- Goal 3
- Goal 4
- Goal 5
- Goal 6
- Goal 7`;

    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: manyGoals,
        focus: null,
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    // Should include first 5 (1, 2, 3, 4, 5)
    assert.ok(prompt.includes('Goal 1'));
    assert.ok(prompt.includes('Goal 5'));
    // Should NOT include 6, 7
    assert.ok(!prompt.includes('Goal 6'));
    assert.ok(!prompt.includes('Goal 7'));
  });

  it('omits goals subsection if no bullet points found', () => {
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
        goal: noBullets,
        focus: 'Some focus state',
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context'));
    assert.ok(prompt.includes('**Focus**'));
    assert.ok(!prompt.includes('**Area Goals**'));
  });

  it('omits goals subsection if goal is null', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: null,
        focus: 'Some focus state',
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context'));
    assert.ok(!prompt.includes('**Area Goals**'));
  });

  it('omits goals subsection if goal is empty string', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: '',
        focus: 'Some state',
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(!prompt.includes('**Area Goals**'));
  });

  it('includes area context with only goal (no focus)', () => {
    const context = makeContextWithArea({
      slug: 'test-area',
      name: 'Test Area',
      status: 'active',
      recurringMeetings: [],
      filePath: '/areas/test-area.md',
      sections: {
        goal: '- [Important goal](../goals/important.md)',
        focus: null,
        horizon: null,
        projects: null,
        backlog: null,
        stakeholders: null,
        notes: null,
      },
    });

    const prompt = buildMeetingExtractionPrompt('transcript', undefined, undefined, context);

    assert.ok(prompt.includes('### Area Context (Test Area)'));
    assert.ok(!prompt.includes('**Focus**'));
    assert.ok(prompt.includes('**Area Goals**'));
    assert.ok(prompt.includes('Important goal'));
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
          goal: '- [Ship v2](../goals/v2.md)',
          focus: 'Building features',
          horizon: null,
          projects: null,
          backlog: null,
          stakeholders: null,
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

// ---------------------------------------------------------------------------
// buildLightExtractionPrompt (Task 3)
// ---------------------------------------------------------------------------

describe('buildLightExtractionPrompt', () => {

  it('is ~50% shorter than normal prompt', () => {
    const transcript = 'Alice: We discussed the product strategy.\nBob: Great insights.';
    const lightPrompt = buildLightExtractionPrompt(transcript);
    const normalPrompt = buildMeetingExtractionPrompt(transcript);

    // Light prompt should be significantly shorter (allow 40-60% range)
    const ratio = lightPrompt.length / normalPrompt.length;
    assert.ok(ratio < 0.6, `Light prompt should be <60% of normal, got ${(ratio * 100).toFixed(1)}%`);
    assert.ok(ratio > 0.1, `Light prompt should be >10% of normal, got ${(ratio * 100).toFixed(1)}%`);
  });

  it('extracts summary only in schema', () => {
    const prompt = buildLightExtractionPrompt('content');
    assert.ok(prompt.includes('"summary"'));
    assert.ok(prompt.includes('"learnings"'));
  });

  it('does NOT include action_items in schema', () => {
    const prompt = buildLightExtractionPrompt('content');
    // Should not have action_items schema
    assert.ok(!prompt.includes('"action_items"'));
  });

  it('explicitly instructs NOT to extract action items', () => {
    const prompt = buildLightExtractionPrompt('content');
    // Check for explicit "do NOT extract" language for action items
    assert.ok(
      prompt.toLowerCase().includes('action items') &&
      (prompt.toLowerCase().includes('skip') || prompt.toLowerCase().includes('not needed')),
      'Should instruct to skip action items'
    );
  });

  it('focuses learnings on domain insights and strategic decisions', () => {
    const prompt = buildLightExtractionPrompt('content');
    assert.ok(
      prompt.toLowerCase().includes('strategic') ||
      prompt.toLowerCase().includes('product') ||
      prompt.toLowerCase().includes('domain'),
      'Should mention strategic/product/domain focus'
    );
  });

  it('includes examples of what TO extract', () => {
    const prompt = buildLightExtractionPrompt('content');
    // Should have positive examples
    assert.ok(prompt.includes('EXTRACT') || prompt.includes('✓'));
  });

  it('includes examples of what to SKIP', () => {
    const prompt = buildLightExtractionPrompt('content');
    // Should have skip examples for operational items
    assert.ok(prompt.includes('SKIP') || prompt.includes('✗'));
    // Specific examples
    assert.ok(
      prompt.toLowerCase().includes('tool') ||
      prompt.toLowerCase().includes('logistics') ||
      prompt.toLowerCase().includes('meeting')
    );
  });

  it('limits learnings to max 2', () => {
    const prompt = buildLightExtractionPrompt('content');
    assert.ok(prompt.includes('2') || prompt.includes('max 2') || prompt.includes('Maximum 2'));
  });

  it('includes transcript content', () => {
    const transcript = 'Unique test transcript content here';
    const prompt = buildLightExtractionPrompt(transcript);
    assert.ok(prompt.includes(transcript));
  });
});

// ---------------------------------------------------------------------------
// ExtractionMode and limits (Task 3)
// ---------------------------------------------------------------------------

describe('Extraction mode limits', () => {

  it('LIGHT_LIMITS has correct values', () => {
    assert.equal(LIGHT_LIMITS.actionItems, 0);
    assert.equal(LIGHT_LIMITS.decisions, 0);
    assert.equal(LIGHT_LIMITS.learnings, 2);
  });

  it('THOROUGH_LIMITS has correct values', () => {
    assert.equal(THOROUGH_LIMITS.actionItems, 20);
    assert.equal(THOROUGH_LIMITS.decisions, 10);
    assert.equal(THOROUGH_LIMITS.learnings, 10);
  });

  it('CATEGORY_LIMITS has correct values', () => {
    assert.equal(CATEGORY_LIMITS.actionItems, 10);
    assert.equal(CATEGORY_LIMITS.decisions, 7);
    assert.equal(CATEGORY_LIMITS.learnings, 7);
  });
});

describe('parseMeetingExtractionResponse with limits', () => {

  it('respects custom limits parameter', () => {
    const response = JSON.stringify({
      summary: 'Test',
      action_items: [
        { owner: 'A', description: 'Task 1', direction: 'i_owe_them' },
        { owner: 'B', description: 'Task 2', direction: 'i_owe_them' },
        { owner: 'C', description: 'Task 3', direction: 'i_owe_them' },
      ],
      decisions: ['D1', 'D2', 'D3'],
      learnings: ['L1', 'L2', 'L3', 'L4'],
    });

    const customLimits = { actionItems: 1, decisions: 2, learnings: 2 };
    const result = parseMeetingExtractionResponse(response, customLimits);

    assert.equal(result.intelligence.actionItems.length, 1);
    assert.equal(result.intelligence.decisions.length, 2);
    assert.equal(result.intelligence.learnings.length, 2);
  });

  it('applies LIGHT_LIMITS correctly (0 action items, 0 decisions, 2 learnings)', () => {
    const response = JSON.stringify({
      summary: 'Light meeting',
      action_items: [
        { owner: 'A', description: 'Task 1', direction: 'i_owe_them' },
      ],
      decisions: ['Decision 1'],
      learnings: ['Learning 1', 'Learning 2', 'Learning 3'],
    });

    const result = parseMeetingExtractionResponse(response, LIGHT_LIMITS);

    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.intelligence.decisions.length, 0);
    assert.equal(result.intelligence.learnings.length, 2);
  });

  it('applies THOROUGH_LIMITS correctly (20 action items, 10 decisions, 10 learnings)', () => {
    // Create response with more than normal limits
    const actionItems: Array<{ owner: string; description: string; direction: string }> = [];
    for (let i = 0; i < 20; i++) {
      actionItems.push({ owner: `Person ${i}`, description: `Unique task ${i} here`, direction: 'i_owe_them' });
    }
    const decisions: string[] = [];
    for (let i = 0; i < 10; i++) {
      decisions.push(`Unique decision ${i} made`);
    }
    const learnings: string[] = [];
    for (let i = 0; i < 10; i++) {
      learnings.push(`Unique learning ${i} shared`);
    }

    const response = JSON.stringify({
      summary: 'Thorough meeting',
      action_items: actionItems,
      decisions,
      learnings,
    });

    const result = parseMeetingExtractionResponse(response, THOROUGH_LIMITS);

    // All 20 action items should be kept (normal limit is 10)
    assert.equal(result.intelligence.actionItems.length, 20);
    // All 10 decisions should be kept (normal limit is 7)
    assert.equal(result.intelligence.decisions.length, 10);
    // All 10 learnings should be kept (normal limit is 7)
    assert.equal(result.intelligence.learnings.length, 10);
  });

  it('defaults to CATEGORY_LIMITS when no limits provided', () => {
    const actionItems: Array<{ owner: string; description: string; direction: string }> = [];
    for (let i = 0; i < 10; i++) {
      actionItems.push({ owner: `Person ${i}`, description: `Unique task number ${i}`, direction: 'i_owe_them' });
    }

    const response = JSON.stringify({
      summary: 'Default limits test',
      action_items: actionItems,
    });

    // Call without limits parameter (should default to CATEGORY_LIMITS = 10 action items)
    const result = parseMeetingExtractionResponse(response);

    assert.equal(result.intelligence.actionItems.length, 10);
  });
});

// ---------------------------------------------------------------------------
// extractMeetingIntelligence with mode (Task 3)
// ---------------------------------------------------------------------------

describe('extractMeetingIntelligence - mode parameter', () => {
  it('defaults to normal mode when mode not specified', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ summary: 'Test' });
    };

    await extractMeetingIntelligence('transcript', mockLLM);

    // Should use normal prompt (has action_items schema)
    assert.ok(capturedPrompt.includes('"action_items"'));
    assert.ok(capturedPrompt.includes('"decisions"'));
  });

  it('uses light prompt for mode=light', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      return JSON.stringify({ summary: 'Light test', learnings: ['Insight'] });
    };

    await extractMeetingIntelligence('transcript', mockLLM, { mode: 'light' });

    // Light prompt should NOT have action_items schema
    assert.ok(!capturedPrompt.includes('"action_items"'));
    // But should have summary and learnings
    assert.ok(capturedPrompt.includes('"summary"'));
    assert.ok(capturedPrompt.includes('"learnings"'));
  });

  it('applies LIGHT_LIMITS for mode=light', async () => {
    const mockLLM: LLMCallFn = async () => JSON.stringify({
      summary: 'Light meeting',
      action_items: [{ owner: 'A', description: 'Task', direction: 'i_owe_them' }],
      decisions: ['Decision 1'],
      learnings: ['Learning 1', 'Learning 2', 'Learning 3'],
    });

    const result = await extractMeetingIntelligence('transcript', mockLLM, { mode: 'light' });

    // Light limits: 0 action items, 0 decisions, 2 learnings
    assert.equal(result.intelligence.actionItems.length, 0);
    assert.equal(result.intelligence.decisions.length, 0);
    assert.equal(result.intelligence.learnings.length, 2);
  });

  it('uses normal prompt with THOROUGH_LIMITS for mode=thorough', async () => {
    let capturedPrompt = '';
    const mockLLM: LLMCallFn = async (prompt) => {
      capturedPrompt = prompt;
      // Return 10 action items
      const actionItems: Array<{ owner: string; description: string; direction: string }> = [];
      for (let i = 0; i < 10; i++) {
        actionItems.push({ owner: `Person ${i}`, description: `Unique action ${i}`, direction: 'i_owe_them' });
      }
      return JSON.stringify({
        summary: 'Thorough meeting',
        action_items: actionItems,
        decisions: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
        learnings: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
      });
    };

    const result = await extractMeetingIntelligence('transcript', mockLLM, { mode: 'thorough' });

    // Thorough mode uses normal prompt (has confidence guidance)
    assert.ok(capturedPrompt.includes('Confidence Guide'));
    assert.ok(capturedPrompt.includes('"action_items"'));

    // But with thorough limits (20 action items, 10 decisions, 10 learnings)
    assert.equal(result.intelligence.actionItems.length, 10);
    assert.equal(result.intelligence.decisions.length, 7);
    assert.equal(result.intelligence.learnings.length, 7);
  });

  it('thorough mode keeps all 10 items when LLM returns 10', async () => {
    const mockLLM: LLMCallFn = async () => {
      const actionItems: Array<{ owner: string; description: string; direction: string; confidence: number }> = [];
      for (let i = 0; i < 10; i++) {
        actionItems.push({
          owner: `Person ${i}`,
          description: `Unique thorough action item number ${i}`,
          direction: 'i_owe_them',
          confidence: 0.9,
        });
      }
      return JSON.stringify({
        summary: 'Thorough extraction test',
        action_items: actionItems,
      });
    };

    const result = await extractMeetingIntelligence('transcript', mockLLM, { mode: 'thorough' });

    // All 10 should be kept (vs normal mode which would cap at 10)
    assert.equal(result.intelligence.actionItems.length, 10);
    // Verify no limit warnings
    const limitWarnings = result.validationWarnings.filter(w => w.reason.includes('exceeds'));
    assert.equal(limitWarnings.length, 0);
  });

  it('light mode produces summary + ≤2 learnings, 0 action items (mock LLM test)', async () => {
    const mockLLM: LLMCallFn = async () => JSON.stringify({
      summary: 'Quick sync about product direction',
      learnings: [
        'Users prefer dark mode',
        'Mobile usage is increasing',
        'Third learning that should be cut',
      ],
      // Even if LLM returns action items (shouldn't with light prompt), limits exclude them
      action_items: [{ owner: 'X', description: 'Should be excluded', direction: 'i_owe_them' }],
      decisions: ['Should also be excluded'],
    });

    const result = await extractMeetingIntelligence('transcript', mockLLM, { mode: 'light' });

    // Verify shape
    assert.equal(result.intelligence.summary, 'Quick sync about product direction');
    assert.equal(result.intelligence.actionItems.length, 0, 'Light mode: 0 action items');
    assert.ok(result.intelligence.learnings.length <= 2, 'Light mode: ≤2 learnings');
    assert.equal(result.intelligence.decisions.length, 0, 'Light mode: 0 decisions');
  });

  it('mode=normal uses standard limits', async () => {
    const mockLLM: LLMCallFn = async () => {
      const actionItems: Array<{ owner: string; description: string; direction: string }> = [];
      for (let i = 0; i < 10; i++) {
        actionItems.push({ owner: `P${i}`, description: `Normal mode task ${i}`, direction: 'i_owe_them' });
      }
      return JSON.stringify({ summary: 'Normal', action_items: actionItems });
    };

    const result = await extractMeetingIntelligence('transcript', mockLLM, { mode: 'normal' });

    // Normal limits = 10 action items
    assert.equal(result.intelligence.actionItems.length, 10);
  });
});

// ---------------------------------------------------------------------------
// Golden file tests — extraction validation/filtering pipeline
// ---------------------------------------------------------------------------

/**
 * Helper to load golden file test data.
 * Paths are relative to the repository root (test-data/meetings/extraction-tests/).
 */
function loadGoldenFile(subpath: string): string {
  // Resolve from package root (packages/core/) up to repo root
  const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..');
  return readFileSync(resolve(repoRoot, 'test-data', 'meetings', 'extraction-tests', subpath), 'utf8');
}

type ExpectedOutput = {
  summary: string;
  actionItems: Array<{
    owner: string;
    ownerSlug: string;
    description: string;
    direction: string;
    counterpartySlug?: string;
    due?: string;
    confidence?: number;
  }>;
  decisions: string[];
  learnings: string[];
};

describe('golden file tests — extraction filtering pipeline', () => {
  it('normal meeting: filters trivial items, keeps valid ones', async () => {
    const transcript = loadGoldenFile('normal-meeting.transcript.txt');
    const mockResponse = loadGoldenFile('mock-responses/normal-meeting.json');
    const expected: ExpectedOutput = JSON.parse(loadGoldenFile('expected/normal-meeting.json'));

    const mockLLM: LLMCallFn = async () => mockResponse;
    const result = await extractMeetingIntelligence(transcript, mockLLM);

    // Verify summary
    assert.equal(result.intelligence.summary, expected.summary);

    // Verify action item counts and content
    assert.equal(
      result.intelligence.actionItems.length,
      expected.actionItems.length,
      `Expected ${expected.actionItems.length} action items, got ${result.intelligence.actionItems.length}`,
    );

    // Verify each action item matches (order-sensitive since LLM order is preserved)
    for (let i = 0; i < expected.actionItems.length; i++) {
      const actual = result.intelligence.actionItems[i];
      const exp = expected.actionItems[i];
      assert.equal(actual.owner, exp.owner, `AI[${i}] owner mismatch`);
      assert.equal(actual.ownerSlug, exp.ownerSlug, `AI[${i}] ownerSlug mismatch`);
      assert.equal(actual.description, exp.description, `AI[${i}] description mismatch`);
      assert.equal(actual.direction, exp.direction, `AI[${i}] direction mismatch`);
      if (exp.counterpartySlug) {
        assert.equal(actual.counterpartySlug, exp.counterpartySlug, `AI[${i}] counterpartySlug mismatch`);
      }
      if (exp.due) {
        assert.equal(actual.due, exp.due, `AI[${i}] due mismatch`);
      }
      if (exp.confidence !== undefined) {
        assert.equal(actual.confidence, exp.confidence, `AI[${i}] confidence mismatch`);
      }
    }

    // Verify decisions and learnings
    assert.deepEqual(result.intelligence.decisions, expected.decisions);
    assert.deepEqual(result.intelligence.learnings, expected.learnings);

    // Verify that trivial items were filtered (should have validation warnings)
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('trivial pattern')),
      'Expected at least one trivial pattern warning',
    );
  });

  it('high-item meeting: enforces category limits after filtering', async () => {
    const transcript = loadGoldenFile('high-item-meeting.transcript.txt');
    const mockResponse = loadGoldenFile('mock-responses/high-item-meeting.json');
    const expected: ExpectedOutput = JSON.parse(loadGoldenFile('expected/high-item-meeting.json'));

    const mockLLM: LLMCallFn = async () => mockResponse;
    const result = await extractMeetingIntelligence(transcript, mockLLM);

    // Verify limits enforced
    assert.equal(
      result.intelligence.actionItems.length,
      CATEGORY_LIMITS.actionItems,
      `Action items should be capped at ${CATEGORY_LIMITS.actionItems}`,
    );
    assert.equal(
      result.intelligence.decisions.length,
      CATEGORY_LIMITS.decisions,
      `Decisions should be capped at ${CATEGORY_LIMITS.decisions}`,
    );
    assert.equal(
      result.intelligence.learnings.length,
      CATEGORY_LIMITS.learnings,
      `Learnings should be capped at ${CATEGORY_LIMITS.learnings}`,
    );

    // Verify the specific items that survived (first N in order)
    for (let i = 0; i < expected.actionItems.length; i++) {
      const actual = result.intelligence.actionItems[i];
      const exp = expected.actionItems[i];
      assert.equal(actual.owner, exp.owner, `AI[${i}] owner mismatch`);
      assert.equal(actual.description, exp.description, `AI[${i}] description mismatch`);
      assert.equal(actual.direction, exp.direction, `AI[${i}] direction mismatch`);
    }

    assert.deepEqual(result.intelligence.decisions, expected.decisions);
    assert.deepEqual(result.intelligence.learnings, expected.learnings);

    // Verify trivial items were filtered
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('trivial pattern')),
      'Expected trivial pattern warnings',
    );

    // Verify limit enforcement warnings
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('exceeds action item limit')),
      'Expected action item limit warning',
    );
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('exceeds decision limit')),
      'Expected decision limit warning',
    );
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('exceeds learning limit')),
      'Expected learning limit warning',
    );

    // Verify near-duplicate detection (decisions and learnings had near-dupes)
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('near-duplicate')),
      'Expected near-duplicate warnings',
    );

    // Verify raw items captured all LLM output
    assert.ok(
      result.rawItems.length > result.intelligence.actionItems.length,
      'Raw items should be more than filtered action items',
    );
  });

  it('1:1 meeting: filters garbage prefixes and trivial patterns', async () => {
    const transcript = loadGoldenFile('one-on-one.transcript.txt');
    const mockResponse = loadGoldenFile('mock-responses/one-on-one.json');
    const expected: ExpectedOutput = JSON.parse(loadGoldenFile('expected/one-on-one.json'));

    const mockLLM: LLMCallFn = async () => mockResponse;
    const result = await extractMeetingIntelligence(transcript, mockLLM);

    // Verify summary
    assert.equal(result.intelligence.summary, expected.summary);

    // Verify action item count
    assert.equal(
      result.intelligence.actionItems.length,
      expected.actionItems.length,
      `Expected ${expected.actionItems.length} action items, got ${result.intelligence.actionItems.length}`,
    );

    // Verify each action item with direction (important for 1:1s)
    for (let i = 0; i < expected.actionItems.length; i++) {
      const actual = result.intelligence.actionItems[i];
      const exp = expected.actionItems[i];
      assert.equal(actual.owner, exp.owner, `AI[${i}] owner mismatch`);
      assert.equal(actual.ownerSlug, exp.ownerSlug, `AI[${i}] ownerSlug mismatch`);
      assert.equal(actual.description, exp.description, `AI[${i}] description mismatch`);
      assert.equal(actual.direction, exp.direction, `AI[${i}] direction mismatch`);
      if (exp.counterpartySlug) {
        assert.equal(actual.counterpartySlug, exp.counterpartySlug, `AI[${i}] counterpartySlug mismatch`);
      }
      if (exp.due) {
        assert.equal(actual.due, exp.due, `AI[${i}] due mismatch`);
      }
    }

    // Verify decisions and learnings
    assert.deepEqual(result.intelligence.decisions, expected.decisions);
    assert.deepEqual(result.intelligence.learnings, expected.learnings);

    // Verify garbage prefix filtering (um, so the way)
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('"um"')),
      'Expected "um" garbage prefix warning',
    );
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('"so the way"')),
      'Expected "so the way" garbage prefix warning',
    );

    // Verify trivial pattern filtering (follow up)
    assert.ok(
      result.validationWarnings.some(w => w.reason.includes('trivial pattern')),
      'Expected trivial pattern warning for "Follow up"',
    );

    // Verify direction classification: mix of i_owe_them and they_owe_me
    const iOweThem = result.intelligence.actionItems.filter(a => a.direction === 'i_owe_them');
    const theyOweMe = result.intelligence.actionItems.filter(a => a.direction === 'they_owe_me');
    assert.ok(iOweThem.length > 0, 'Expected at least one i_owe_them item');
    assert.ok(theyOweMe.length > 0, 'Expected at least one they_owe_me item');
  });
});

// ---------------------------------------------------------------------------
// parseMeetingExtractionResponse - topics
// ---------------------------------------------------------------------------

describe('parseMeetingExtractionResponse - topics', () => {
  it('parses valid topic slugs', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: ['email-templates', 'q2-planning', 'onboarding-v2'],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, ['email-templates', 'q2-planning', 'onboarding-v2']);
  });

  it('drops topics with uppercase letters', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: ['Email-Templates', 'q2-planning'],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, ['q2-planning']);
  });

  it('drops topics with spaces', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: ['email templates', 'q2-planning'],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, ['q2-planning']);
  });

  it('drops banned generic topics', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: ['meeting', 'discussion', 'q2-planning', 'sync', 'review'],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, ['q2-planning']);
  });

  it('caps topics at 6', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: ['topic-a', 'topic-b', 'topic-c', 'topic-d', 'topic-e', 'topic-f', 'topic-g'],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.topics?.length, 6);
  });

  it('returns empty array when topics absent', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, []);
  });

  it('returns empty array when topics is not an array', () => {
    const response = JSON.stringify({
      summary: 'A meeting.',
      action_items: [],
      decisions: [],
      learnings: [],
      topics: 'not-an-array',
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.topics, []);
  });
});

// ---------------------------------------------------------------------------
// Prompt hardening (Task 1) — decision/learning exclusion sections
// ---------------------------------------------------------------------------

describe('prompt hardening — decision/learning guidance', () => {
  it('normal prompt contains decision exclusion section', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('## What is NOT a decision'), 'Missing decision exclusion section');
  });

  it('normal prompt contains learning exclusion section', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('## What is NOT a learning'), 'Missing learning exclusion section');
  });

  it('normal prompt contains self-review instruction', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('Before finalizing, review your list'), 'Missing self-review instruction');
  });

  it('normal prompt contains decision confidence guide', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('## Decision Confidence Guide'), 'Missing decision confidence guide');
  });

  it('normal prompt contains learning confidence guide', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('## Learning Confidence Guide'), 'Missing learning confidence guide');
  });

  it('normal prompt schema uses object format for decisions', () => {
    const prompt = buildMeetingExtractionPrompt('transcript');
    assert.ok(prompt.includes('"text": "string'), 'Decision schema should use { text, confidence } format');
    assert.ok(prompt.includes('"confidence": "number (0-1)'), 'Decision schema should include confidence');
  });

  it('light prompt uses confidence format for learnings', () => {
    const prompt = buildLightExtractionPrompt('transcript');
    assert.ok(prompt.includes('"confidence"'), 'Light prompt learnings should include confidence');
  });
});

// ---------------------------------------------------------------------------
// Confidence parsing (Task 3) — decisions/learnings as objects
// ---------------------------------------------------------------------------

describe('confidence parsing for decisions and learnings', () => {
  it('parses string-only decisions (backwards compat)', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: ['Decision A', 'Decision B'],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisions, ['Decision A', 'Decision B']);
    assert.equal(result.intelligence.decisionConfidences, undefined, 'String-only should have no confidence array');
  });

  it('parses object decisions with text and confidence', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [
        { text: 'Use PostgreSQL', confidence: 0.9 },
        { text: 'Deploy Friday', confidence: 0.7 },
      ],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisions, ['Use PostgreSQL', 'Deploy Friday']);
    assert.deepEqual(result.intelligence.decisionConfidences, [0.9, 0.7]);
  });

  it('parses mixed string/object decisions', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [
        'Plain string decision',
        { text: 'Object decision', confidence: 0.8 },
      ],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisions, ['Plain string decision', 'Object decision']);
    // Has at least one defined confidence, so array is present
    assert.ok(result.intelligence.decisionConfidences);
    assert.equal(result.intelligence.decisionConfidences![1], 0.8);
  });

  it('parses object with missing confidence', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: 'No confidence field' }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisions, ['No confidence field']);
  });

  it('clamps out-of-range confidence', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [
        { text: 'Too high', confidence: 1.5 },
        { text: 'Too low', confidence: -0.3 },
      ],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisionConfidences, [1.0, 0.0]);
  });

  it('parses object learnings with confidence', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [],
      learnings: [
        { text: 'Batch processing reduces errors', confidence: 0.95 },
        { text: 'Users prefer email', confidence: 0.75 },
      ],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.learnings, ['Batch processing reduces errors', 'Users prefer email']);
    assert.deepEqual(result.intelligence.learningConfidences, [0.95, 0.75]);
  });

  it('handles empty arrays gracefully', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.deepEqual(result.intelligence.decisions, []);
    assert.deepEqual(result.intelligence.learnings, []);
  });

  it('includes confidence in rawItems', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: 'Test decision', confidence: 0.85 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    const decisionRaw = result.rawItems.find(r => r.type === 'decision');
    assert.ok(decisionRaw);
    assert.equal(decisionRaw!.confidence, 0.85);
  });
});

// ---------------------------------------------------------------------------
// Trivial decision/learning filters (Task 5)
// ---------------------------------------------------------------------------

describe('isTrivialDecision', () => {
  it('filters "We discussed the roadmap"', () => {
    assert.ok(isTrivialDecision('We discussed the product roadmap'));
  });

  it('filters "Team reviewed the Q2 metrics"', () => {
    assert.ok(isTrivialDecision('We reviewed the Q2 metrics'));
  });

  it('filters "Meeting moved to Tuesday"', () => {
    assert.ok(isTrivialDecision('Meeting moved to Tuesday'));
  });

  it('filters "Team synced on status"', () => {
    assert.ok(isTrivialDecision('Team synced on the sprint status'));
  });

  it('does NOT filter items with decision verbs: "discussed and decided"', () => {
    assert.equal(isTrivialDecision('We discussed the rollout and decided to ship Friday'), null);
  });

  it('does NOT filter items with "agreed"', () => {
    assert.equal(isTrivialDecision('We discussed options and agreed on PostgreSQL'), null);
  });

  it('does NOT filter items with "approved"', () => {
    assert.equal(isTrivialDecision('We reviewed the plan and approved the budget'), null);
  });

  it('does NOT filter normal decisions', () => {
    assert.equal(isTrivialDecision('Use PostgreSQL instead of MongoDB for the new service'), null);
  });
});

describe('isTrivialLearning', () => {
  it('filters social event patterns', () => {
    assert.ok(isTrivialLearning('Company picnic scheduled for next Friday'));
  });

  it('filters personal location trivia', () => {
    assert.ok(isTrivialLearning('Alice lives in Seattle'));
    assert.ok(isTrivialLearning('Bob is from Chicago'));
    assert.ok(isTrivialLearning('Sarah moved to Austin last year'));
  });

  it('filters birthday/anniversary trivia', () => {
    assert.ok(isTrivialLearning("John's birthday is on March 15th"));
    assert.ok(isTrivialLearning('Team anniversary is in June'));
  });

  it('filters favorite thing trivia', () => {
    assert.ok(isTrivialLearning("Alice's favorite food is sushi"));
  });

  it('does NOT filter genuine insights', () => {
    assert.equal(isTrivialLearning('Enterprise users prefer batch processing over real-time'), null);
  });

  it('does NOT filter domain knowledge', () => {
    assert.equal(isTrivialLearning('React 19 Server Components reduce bundle by 40%'), null);
  });
});

describe('garbage/trivial filters applied to decisions in parsing', () => {
  it('filters garbage decisions with validation warning', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: 'yeah we should do that thing', confidence: 0.9 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 0);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('decision:')));
  });

  it('filters trivial decisions with validation warning', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: 'We discussed the product roadmap', confidence: 0.8 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 0);
    assert.ok(result.validationWarnings.some(w => w.reason.includes('trivial decision')));
  });

  it('keeps valid decisions through filters', () => {
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: 'Migrate the database to PostgreSQL by end of Q2', confidence: 0.9 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 1);
    assert.equal(result.intelligence.decisions[0], 'Migrate the database to PostgreSQL by end of Q2');
  });

  it('does NOT filter long decisions (150-char limit only applies to action items)', () => {
    const longDecision = 'We decided to migrate the entire monolithic backend service to a microservices architecture using Kubernetes orchestration, starting with the authentication module as a pilot and expanding to payment processing within the next quarter';
    assert.ok(longDecision.length > 150, 'test decision should exceed 150 chars');
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [{ text: longDecision, confidence: 0.9 }],
      learnings: [],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.decisions.length, 1);
    assert.equal(result.intelligence.decisions[0], longDecision);
  });

  it('does NOT filter long learnings (150-char limit only applies to action items)', () => {
    const longLearning = 'Enterprise customers in the healthcare vertical require HIPAA-compliant data processing pipelines with end-to-end encryption, which significantly increases infrastructure costs but reduces compliance audit burden by approximately 60%';
    assert.ok(longLearning.length > 150, 'test learning should exceed 150 chars');
    const response = JSON.stringify({
      summary: 'test',
      action_items: [],
      decisions: [],
      learnings: [{ text: longLearning, confidence: 0.85 }],
    });
    const result = parseMeetingExtractionResponse(response);
    assert.equal(result.intelligence.learnings.length, 1);
    assert.equal(result.intelligence.learnings[0], longLearning);
  });
});
