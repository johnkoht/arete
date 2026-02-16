/**
 * Tests for slugify utility.
 * Ported from scripts/integrations/test_utils.py TestSlugify
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../../src/utils/slugify.js';

describe('slugify', () => {
  it('basic text', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  it('special characters', () => {
    assert.equal(slugify('Product Review: Q4 2025!'), 'product-review-q4-2025');
  });

  it('underscores to hyphens', () => {
    assert.equal(slugify('some_file_name'), 'some-file-name');
  });

  it('multiple spaces', () => {
    assert.equal(slugify('hello   world'), 'hello-world');
  });

  it('leading trailing special chars', () => {
    assert.equal(slugify('--hello world--'), 'hello-world');
  });

  it('empty string', () => {
    assert.equal(slugify(''), 'untitled');
  });

  it('null input', () => {
    assert.equal(slugify(null), 'untitled');
  });

  it('undefined input', () => {
    assert.equal(slugify(undefined), 'untitled');
  });

  it('max length', () => {
    const longText = 'this is a very long title that should be truncated';
    const result = slugify(longText, 20);
    assert.ok(result.length <= 20);
  });

  it('max length breaks at hyphen', () => {
    const result = slugify('word-another-more-extra', 15);
    assert.notEqual(result.slice(-1), '-');
  });

  it('unicode stripped', () => {
    const result = slugify('café meeting');
    assert.equal(result, 'caf-meeting');
  });

  it('all special chars', () => {
    const result = slugify('@#$%^&*()');
    assert.equal(result, 'untitled');
  });
});
