/**
 * Tests for date and duration utilities.
 * Ported from scripts/integrations/test_utils.py TestParseDate, TestFormatDuration
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, formatDuration } from '../../src/utils/dates.js';

describe('parseDate', () => {
  it('iso format', () => {
    assert.equal(parseDate('2026-02-05'), '2026-02-05');
  });

  it('iso with time', () => {
    assert.equal(parseDate('2026-02-05T14:30:00Z'), '2026-02-05');
  });

  it('slash format', () => {
    assert.equal(parseDate('2026/02/05'), '2026-02-05');
  });

  it('us slash format', () => {
    assert.equal(parseDate('02/05/2026'), '2026-02-05');
  });

  it('long month format', () => {
    assert.equal(parseDate('February 05, 2026'), '2026-02-05');
  });

  it('short month format', () => {
    assert.equal(parseDate('Feb 05, 2026'), '2026-02-05');
  });

  it('empty string', () => {
    assert.equal(parseDate(''), null);
  });

  it('null input', () => {
    assert.equal(parseDate(null), null);
  });

  it('undefined input', () => {
    assert.equal(parseDate(undefined), null);
  });

  it('invalid date', () => {
    assert.equal(parseDate('not-a-date'), null);
  });

  it('us dash format', () => {
    assert.equal(parseDate('02-05-2026'), '2026-02-05');
  });
});

describe('formatDuration', () => {
  it('minutes only', () => {
    assert.equal(formatDuration(30), '30 minutes');
  });

  it('one hour', () => {
    assert.equal(formatDuration(60), '1 hour');
  });

  it('multiple hours', () => {
    assert.equal(formatDuration(120), '2 hours');
  });

  it('hours and minutes', () => {
    assert.equal(formatDuration(90), '1h 30m');
  });

  it('zero', () => {
    assert.equal(formatDuration(0), '0 minutes');
  });

  it('large duration', () => {
    assert.equal(formatDuration(180), '3 hours');
  });
});
