/**
 * Tests for conversation text parser.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConversation } from '../../../src/integrations/conversations/parser.js';

// ---------------------------------------------------------------------------
// Format: Timestamped
// ---------------------------------------------------------------------------

describe('parseConversation — timestamped format', () => {
  it('parses [timestamp] Name: message lines', () => {
    const text = `[10:30 AM] Alice: Let's discuss the sprint.
[10:31 AM] Bob: Sounds good. What's the priority?
[10:32 AM] Alice: We need to finish the API work.`;

    const result = parseConversation(text);
    assert.equal(result.format, 'timestamped');
    assert.equal(result.messages.length, 3);
    assert.deepEqual(result.participants, ['Alice', 'Bob']);
    assert.equal(result.messages[0].speaker, 'Alice');
    assert.equal(result.messages[0].timestamp, '10:30 AM');
    assert.equal(result.messages[0].text, "Let's discuss the sprint.");
  });

  it('parses ISO-style timestamps', () => {
    const text = `[2026-02-20 10:30] Alice: Hello
[2026-02-20 10:31] Bob: Hi there`;

    const result = parseConversation(text);
    assert.equal(result.format, 'timestamped');
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].timestamp, '2026-02-20 10:30');
  });

  it('handles multi-line messages (continuation lines)', () => {
    const text = `[10:30] Alice: This is a long message
that continues on the next line.
[10:31] Bob: Got it.`;

    const result = parseConversation(text);
    assert.equal(result.messages.length, 2);
    assert.ok(result.messages[0].text.includes('continues on the next line'));
  });
});

// ---------------------------------------------------------------------------
// Format: Structured (Name: message)
// ---------------------------------------------------------------------------

describe('parseConversation — structured format', () => {
  it('parses Name: message lines', () => {
    const text = `Alice: Let's discuss the sprint.
Bob: Sounds good. What's the priority?
Alice: We need to finish the API work.`;

    const result = parseConversation(text);
    assert.equal(result.format, 'structured');
    assert.equal(result.messages.length, 3);
    assert.deepEqual(result.participants, ['Alice', 'Bob']);
    assert.equal(result.messages[1].speaker, 'Bob');
    assert.equal(result.messages[1].text, "Sounds good. What's the priority?");
  });

  it('handles multi-word names', () => {
    const text = `Alice Smith: Hello everyone
Bob Jones Jr: Thanks for joining
Alice Smith: Let's start.`;

    const result = parseConversation(text);
    assert.equal(result.format, 'structured');
    assert.deepEqual(result.participants, ['Alice Smith', 'Bob Jones Jr']);
  });

  it('handles continuation lines in structured format', () => {
    const text = `Alice: This is a longer message
that spans multiple lines.
Bob: Short reply.`;

    const result = parseConversation(text);
    assert.equal(result.messages.length, 2);
    assert.ok(result.messages[0].text.includes('spans multiple lines'));
  });

  it('does not match lowercase-starting names', () => {
    const text = `some random text: not a speaker
another line: also not a speaker`;

    const result = parseConversation(text);
    assert.equal(result.format, 'raw');
  });
});

// ---------------------------------------------------------------------------
// Format: Raw / Unstructured
// ---------------------------------------------------------------------------

describe('parseConversation — raw format', () => {
  it('splits unstructured text into paragraphs', () => {
    const text = `This is the first paragraph about the project discussion.

This is the second paragraph with more details about the timeline.

And a third paragraph about next steps.`;

    const result = parseConversation(text);
    assert.equal(result.format, 'raw');
    assert.equal(result.messages.length, 3);
    assert.deepEqual(result.participants, []);
    assert.ok(result.normalizedContent.includes('first paragraph'));
    assert.ok(result.normalizedContent.includes('second paragraph'));
  });

  it('treats single block of text as one message', () => {
    const text = `A single paragraph discussion about something important that happened today.`;

    const result = parseConversation(text);
    assert.equal(result.format, 'raw');
    assert.equal(result.messages.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: Empty / Minimal
// ---------------------------------------------------------------------------

describe('parseConversation — edge cases', () => {
  it('handles empty string', () => {
    const result = parseConversation('');
    assert.equal(result.format, 'raw');
    assert.equal(result.messages.length, 0);
    assert.deepEqual(result.participants, []);
    assert.equal(result.normalizedContent, '');
  });

  it('handles whitespace-only input', () => {
    const result = parseConversation('   \n  \n   ');
    assert.equal(result.format, 'raw');
    assert.equal(result.messages.length, 0);
    assert.deepEqual(result.participants, []);
  });

  it('handles null-ish input', () => {
    // TypeScript would prevent this but runtime safety matters
    const result = parseConversation(undefined as unknown as string);
    assert.equal(result.format, 'raw');
    assert.equal(result.messages.length, 0);
  });

  it('handles single line (not enough for structured)', () => {
    const text = `Alice: Just one message`;
    const result = parseConversation(text);
    // Needs 2+ messages for structured, falls through to raw
    assert.equal(result.format, 'raw');
  });

  it('preserves participant order (first appearance)', () => {
    const text = `Carol: First
Alice: Second
Bob: Third
Alice: Fourth`;

    const result = parseConversation(text);
    assert.equal(result.format, 'structured');
    assert.deepEqual(result.participants, ['Carol', 'Alice', 'Bob']);
  });

  it('never throws on any input', () => {
    const inputs = ['', '   ', '\n\n\n', 'a', '::::', '[] [] []', '{"json": true}'];
    for (const input of inputs) {
      assert.doesNotThrow(() => parseConversation(input));
    }
  });
});

// ---------------------------------------------------------------------------
// No Slack-specific code
// ---------------------------------------------------------------------------

describe('parseConversation — source-agnostic', () => {
  it('does not treat emoji reactions specially', () => {
    const text = `Alice: Great idea! :thumbsup:
Bob: Thanks :smile:`;

    const result = parseConversation(text);
    // Emoji kept as-is in text, not stripped or parsed
    assert.ok(result.messages[0].text.includes(':thumbsup:'));
  });

  it('does not parse <@mention> patterns', () => {
    const text = `Alice: Hey <@U123> can you check this?
Bob: Sure, I'll look at it.`;

    const result = parseConversation(text);
    // Mention kept as-is, not resolved
    assert.ok(result.messages[0].text.includes('<@U123>'));
  });
});
