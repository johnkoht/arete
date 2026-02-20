/**
 * Tests for conversation insight extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInsights,
  parseExtractionResponse,
  buildExtractionPrompt,
} from '../../../src/integrations/conversations/extract.js';
import type { LLMCallFn } from '../../../src/integrations/conversations/extract.js';

// ---------------------------------------------------------------------------
// parseExtractionResponse
// ---------------------------------------------------------------------------

describe('parseExtractionResponse', () => {
  it('parses valid JSON with all sections', () => {
    const response = JSON.stringify({
      summary: 'Team discussed sprint priorities.',
      decisions: ['Focus on API work'],
      action_items: ['Alice writes PRD'],
      open_questions: ['When is the deadline?'],
      stakeholders: ['VP Engineering'],
      risks: ['Timeline is tight'],
    });

    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'Team discussed sprint priorities.');
    assert.deepEqual(result.decisions, ['Focus on API work']);
    assert.deepEqual(result.actionItems, ['Alice writes PRD']);
    assert.deepEqual(result.openQuestions, ['When is the deadline?']);
    assert.deepEqual(result.stakeholders, ['VP Engineering']);
    assert.deepEqual(result.risks, ['Timeline is tight']);
  });

  it('handles partial response (only summary)', () => {
    const response = JSON.stringify({
      summary: 'Quick sync about the launch.',
    });

    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'Quick sync about the launch.');
    assert.equal(result.decisions, undefined);
    assert.equal(result.actionItems, undefined);
    assert.equal(result.openQuestions, undefined);
    assert.equal(result.stakeholders, undefined);
    assert.equal(result.risks, undefined);
  });

  it('handles empty JSON object', () => {
    const result = parseExtractionResponse('{}');
    assert.deepEqual(result, {});
  });

  it('strips markdown code fences', () => {
    const response = '```json\n{"summary": "A productive meeting."}\n```';
    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'A productive meeting.');
  });

  it('strips code fences without json label', () => {
    const response = '```\n{"summary": "Test."}\n```';
    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'Test.');
  });

  it('extracts JSON from surrounding text', () => {
    const response = 'Here is the result:\n{"summary": "Found it."}\nDone.';
    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'Found it.');
  });

  it('returns empty insights on invalid JSON', () => {
    const result = parseExtractionResponse('This is not JSON at all.');
    assert.deepEqual(result, {});
  });

  it('returns empty insights on empty string', () => {
    const result = parseExtractionResponse('');
    assert.deepEqual(result, {});
  });

  it('filters out empty strings in arrays', () => {
    const response = JSON.stringify({
      decisions: ['Keep this', '', '  '],
      action_items: ['Do this'],
    });

    const result = parseExtractionResponse(response);
    assert.deepEqual(result.decisions, ['Keep this']);
    assert.deepEqual(result.actionItems, ['Do this']);
  });

  it('omits arrays that become empty after filtering', () => {
    const response = JSON.stringify({
      decisions: ['', '  '],
      summary: 'Valid summary.',
    });

    const result = parseExtractionResponse(response);
    assert.equal(result.decisions, undefined);
    assert.equal(result.summary, 'Valid summary.');
  });

  it('trims whitespace from summary', () => {
    const response = JSON.stringify({ summary: '  Needs trimming.  ' });
    const result = parseExtractionResponse(response);
    assert.equal(result.summary, 'Needs trimming.');
  });

  it('omits empty summary string', () => {
    const response = JSON.stringify({ summary: '  ' });
    const result = parseExtractionResponse(response);
    assert.equal(result.summary, undefined);
  });
});

// ---------------------------------------------------------------------------
// buildExtractionPrompt
// ---------------------------------------------------------------------------

describe('buildExtractionPrompt', () => {
  it('includes the conversation text', () => {
    const prompt = buildExtractionPrompt('Alice: Hello\nBob: Hi');
    assert.ok(prompt.includes('Alice: Hello'));
    assert.ok(prompt.includes('Bob: Hi'));
  });

  it('is source-agnostic (mentions multiple sources)', () => {
    const prompt = buildExtractionPrompt('test');
    assert.ok(prompt.includes('Slack'));
    assert.ok(prompt.includes('Teams'));
    assert.ok(prompt.includes('email'));
  });

  it('requests JSON output', () => {
    const prompt = buildExtractionPrompt('test');
    assert.ok(prompt.includes('JSON'));
  });
});

// ---------------------------------------------------------------------------
// extractInsights (integration with mock LLM)
// ---------------------------------------------------------------------------

describe('extractInsights', () => {
  it('calls LLM and returns parsed insights', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({
        summary: 'Sprint planning discussion.',
        decisions: ['Prioritize API work'],
        action_items: ['Alice writes PRD by Friday'],
      });

    const result = await extractInsights('Alice: Let us plan the sprint.\nBob: OK.', mockLLM);
    assert.equal(result.summary, 'Sprint planning discussion.');
    assert.deepEqual(result.decisions, ['Prioritize API work']);
    assert.deepEqual(result.actionItems, ['Alice writes PRD by Friday']);
  });

  it('returns empty insights for empty input', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Should not be called');
    };

    const result = await extractInsights('', mockLLM);
    assert.deepEqual(result, {});
  });

  it('returns empty insights for whitespace-only input', async () => {
    const mockLLM: LLMCallFn = async () => {
      throw new Error('Should not be called');
    };

    const result = await extractInsights('   \n  ', mockLLM);
    assert.deepEqual(result, {});
  });

  it('handles LLM returning invalid JSON gracefully', async () => {
    const mockLLM: LLMCallFn = async () => 'Sorry, I cannot process this.';

    const result = await extractInsights('Some conversation text.', mockLLM);
    assert.deepEqual(result, {});
  });

  it('handles LLM returning fenced JSON', async () => {
    const mockLLM: LLMCallFn = async () =>
      '```json\n{"summary": "Fenced response."}\n```';

    const result = await extractInsights('Some conversation.', mockLLM);
    assert.equal(result.summary, 'Fenced response.');
  });

  it('returns only populated sections from LLM response', async () => {
    const mockLLM: LLMCallFn = async () =>
      JSON.stringify({ summary: 'Just a summary, nothing else.' });

    const result = await extractInsights('Brief chat.', mockLLM);
    assert.equal(result.summary, 'Just a summary, nothing else.');
    assert.equal(result.decisions, undefined);
    assert.equal(result.actionItems, undefined);
  });
});
