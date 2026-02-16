/**
 * Tests for tokenize utility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../../src/search/tokenize.js';

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    assert.deepEqual(tokenize('Hello World'), ['hello', 'world']);
  });

  it('filters stop words', () => {
    assert.deepEqual(tokenize('a the and to'), []);
    assert.deepEqual(tokenize('create a feature'), ['feature']);
  });

  it('filters single-character tokens', () => {
    assert.deepEqual(tokenize('x y z'), []);
    assert.deepEqual(tokenize('a b product'), ['product']);
  });

  it('strips punctuation and keeps alphanumeric and hyphen', () => {
    assert.deepEqual(tokenize('hello-world'), ['hello-world']);
    assert.deepEqual(tokenize('hello, world!'), ['hello', 'world']);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(tokenize(''), []);
  });
});
