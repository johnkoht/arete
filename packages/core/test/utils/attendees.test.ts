/**
 * Tests for extractAttendeeSlugs utility.
 *
 * Uses node:test + node:assert/strict.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAttendeeSlugs } from '../../src/utils/attendees.js';

describe('extractAttendeeSlugs', () => {
  // ── attendee_ids format ──────────────────────────────────────────────────

  it('returns slugs from attendee_ids array', () => {
    const data = { attendee_ids: ['slug-a', 'slug-b'] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['slug-a', 'slug-b']);
  });

  it('trims whitespace from attendee_ids entries', () => {
    const data = { attendee_ids: ['  slug-a  ', 'slug-b'] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['slug-a', 'slug-b']);
  });

  it('skips empty attendee_ids entries', () => {
    const data = { attendee_ids: ['slug-a', '', '  '] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['slug-a']);
  });

  it('prefers attendee_ids over attendees when both present', () => {
    const data = {
      attendee_ids: ['explicit-slug'],
      attendees: [{ name: 'John Doe' }],
    };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['explicit-slug']);
  });

  // ── attendees object format ──────────────────────────────────────────────

  it('slugifies attendee name objects: "John Doe" → "john-doe"', () => {
    const data = { attendees: [{ name: 'John Doe' }] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['john-doe']);
  });

  it('handles multiple attendee name objects', () => {
    const data = {
      attendees: [
        { name: 'Sarah Chen' },
        { name: 'Bob Smith' },
      ],
    };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['sarah-chen', 'bob-smith']);
  });

  it('skips attendee objects without name', () => {
    const data = {
      attendees: [
        { name: 'Sarah Chen' },
        { email: 'no-name@example.com' },
        { name: '' },
      ],
    };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['sarah-chen']);
  });

  // ── attendees plain string format ────────────────────────────────────────

  it('slugifies plain string attendees: "Jane Doe" → "jane-doe"', () => {
    const data = { attendees: ['Jane Doe', 'Alice Smith'] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['jane-doe', 'alice-smith']);
  });

  it('skips empty string attendees', () => {
    const data = { attendees: ['Jane Doe', '', '  '] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['jane-doe']);
  });

  // ── empty / null inputs ──────────────────────────────────────────────────

  it('returns empty array for empty object', () => {
    const data = {};
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, []);
  });

  it('returns empty array when attendee_ids is empty array', () => {
    const data = { attendee_ids: [] };
    const result = extractAttendeeSlugs(data);
    // empty attendee_ids → fall through to attendees → also empty
    assert.deepEqual(result, []);
  });

  it('returns empty array when attendees is empty array', () => {
    const data = { attendees: [] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, []);
  });

  it('returns empty array when attendee_ids contains only non-strings', () => {
    const data = { attendee_ids: [123, null, true] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, []);
  });

  // ── slugification edge cases ─────────────────────────────────────────────

  it('removes special characters from names', () => {
    // Apostrophe and comma → separator → collapsed to single hyphen
    const data = { attendees: [{ name: "O'Brien, James" }] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['o-brien-james']);
  });

  it('handles single-word name', () => {
    const data = { attendees: [{ name: 'Admin' }] };
    const result = extractAttendeeSlugs(data);
    assert.deepEqual(result, ['admin']);
  });
});
