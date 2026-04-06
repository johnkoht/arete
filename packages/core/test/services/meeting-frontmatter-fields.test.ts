/**
 * Tests for new agent-facing frontmatter fields in parseMeetingFile().
 *
 * Verifies that topics, open_action_items, my_commitments, their_commitments,
 * decisions_count, and learnings_count are correctly parsed when present and
 * return undefined when absent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeetingFile } from '../../src/services/meeting-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMeetingContent(frontmatter: string, body = ''): string {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseMeetingFile — agent-facing frontmatter fields', () => {
  it('returns all six new fields when present in frontmatter', () => {
    const content = makeMeetingContent(
      [
        'title: "Test Meeting"',
        'date: "2026-04-05"',
        'attendees: []',
        'topics:',
        '  - email-templates',
        '  - sms',
        'open_action_items: 3',
        'my_commitments: 2',
        'their_commitments: 1',
        'decisions_count: 2',
        'learnings_count: 1',
      ].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result, 'parseMeetingFile should return a result');

    const fm = result.frontmatter;
    assert.deepEqual(fm.topics, ['email-templates', 'sms']);
    assert.equal(fm.open_action_items, 3);
    assert.equal(fm.my_commitments, 2);
    assert.equal(fm.their_commitments, 1);
    assert.equal(fm.decisions_count, 2);
    assert.equal(fm.learnings_count, 1);
  });

  it('returns undefined for all six new fields when absent', () => {
    const content = makeMeetingContent(
      ['title: "Old Meeting"', 'date: "2026-01-01"', 'attendees: []'].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result, 'parseMeetingFile should return a result');

    const fm = result.frontmatter;
    assert.equal(fm.topics, undefined);
    assert.equal(fm.open_action_items, undefined);
    assert.equal(fm.my_commitments, undefined);
    assert.equal(fm.their_commitments, undefined);
    assert.equal(fm.decisions_count, undefined);
    assert.equal(fm.learnings_count, undefined);
  });

  it('returns undefined for topics when frontmatter has non-array value', () => {
    const content = makeMeetingContent(
      ['title: "Test"', 'date: "2026-04-05"', 'attendees: []', 'topics: "not-an-array"'].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result);
    assert.equal(result.frontmatter.topics, undefined);
  });

  it('returns undefined for count fields when frontmatter has string values', () => {
    const content = makeMeetingContent(
      [
        'title: "Test"',
        'date: "2026-04-05"',
        'attendees: []',
        'open_action_items: "3"',
        'my_commitments: "2"',
      ].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result);
    // yaml.parse converts quoted numbers to strings — should return undefined (strict number check)
    assert.equal(result.frontmatter.open_action_items, undefined);
    assert.equal(result.frontmatter.my_commitments, undefined);
  });

  it('returns zero count fields correctly (not treated as absent)', () => {
    const content = makeMeetingContent(
      [
        'title: "Test"',
        'date: "2026-04-05"',
        'attendees: []',
        'open_action_items: 0',
        'decisions_count: 0',
      ].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result);
    assert.equal(result.frontmatter.open_action_items, 0);
    assert.equal(result.frontmatter.decisions_count, 0);
  });

  it('preserves existing fields alongside new fields', () => {
    const content = makeMeetingContent(
      [
        'title: "Test Meeting"',
        'date: "2026-04-05"',
        'attendees: []',
        'area: "communications"',
        'topics:',
        '  - glance-2',
        'open_action_items: 1',
      ].join('\n'),
    );

    const result = parseMeetingFile(content);
    assert.ok(result);
    assert.equal(result.frontmatter.area, 'communications');
    assert.deepEqual(result.frontmatter.topics, ['glance-2']);
    assert.equal(result.frontmatter.open_action_items, 1);
  });
});
