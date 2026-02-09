/**
 * Tests for src/core/search.ts — SearchProvider interface, factory, tokenize.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSearchProvider, tokenize } from '../../src/core/search.js';

describe('search', () => {
  describe('getSearchProvider', () => {
    it('returns a provider', () => {
      const provider = getSearchProvider('/some/workspace');
      assert.ok(provider);
      assert.strictEqual(typeof provider.name, 'string');
      assert.strictEqual(typeof provider.isAvailable, 'function');
      assert.strictEqual(typeof provider.search, 'function');
      assert.strictEqual(typeof provider.semanticSearch, 'function');
    });

    it('provider has correct interface shape', async () => {
      const provider = getSearchProvider('/workspace');
      assert.ok(provider.name.length > 0);
      const available = await provider.isAvailable();
      assert.strictEqual(available, true);
      const searchResults = await provider.search('test');
      assert.ok(Array.isArray(searchResults));
      const semanticResults = await provider.semanticSearch('test');
      assert.ok(Array.isArray(semanticResults));
    });
  });

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
});
