import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
  formatStagedSections,
  updateMeetingContent,
} from '../../src/services/meeting-extraction.js';
import type { LLMCallFn, MeetingExtractionResult, ActionItem } from '../../src/services/meeting-extraction.js';

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
