import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMeetingExtractionPrompt,
  parseMeetingExtractionResponse,
  extractMeetingIntelligence,
} from '../../src/services/meeting-extraction.js';
import type { LLMCallFn } from '../../src/services/meeting-extraction.js';

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
