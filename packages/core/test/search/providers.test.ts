/**
 * Tests for search providers — getSearchProvider factory, QMD, fallback.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getSearchProvider,
  getFallbackSearchProvider,
  getQmdSearchProvider,
  parseQmdJson,
} from '../../src/search/index.js';
import { FileStorageAdapter } from '../../src/storage/file.js';

describe('search providers', () => {
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

  describe('parseQmdJson', () => {
    it('parses array output', () => {
      const json = JSON.stringify([
        { path: '/a.md', content: 'hello', score: 0.9 },
        { path: '/b.md', content: 'world', score: 0.7 },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].path, '/a.md');
      assert.strictEqual(results[0].content, 'hello');
      assert.strictEqual(results[0].score, 0.9);
      assert.strictEqual(results[0].matchType, 'semantic');
    });

    it('parses results wrapper', () => {
      const json = JSON.stringify({ results: [{ path: '/x.md', content: 'x' }] });
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].path, '/x.md');
    });

    it('returns empty array for invalid json', () => {
      assert.deepEqual(parseQmdJson('not json'), []);
      assert.deepEqual(parseQmdJson(''), []);
    });
  });

  describe('fallback provider', () => {
    it('finds matching .md files by token overlap', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'arete-search-'));
      try {
        await writeFile(join(tmp, 'product.md'), '# Product\n\nThis is about the product feature.', 'utf8');
        await writeFile(join(tmp, 'other.md'), '# Other\n\nUnrelated content.', 'utf8');

        const storage = new FileStorageAdapter();
        const provider = getFallbackSearchProvider(tmp, storage);

        const results = await provider.search('product feature');
        assert.ok(results.length >= 1);
        const productResult = results.find(r => r.path.endsWith('product.md'));
        assert.ok(productResult);
        assert.ok(productResult.score > 0);
        assert.strictEqual(productResult.matchType, 'keyword');
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });

    it('respects limit option', async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'arete-search-'));
      try {
        await writeFile(join(tmp, 'a.md'), '# A\n\ntest content', 'utf8');
        await writeFile(join(tmp, 'b.md'), '# B\n\ntest content', 'utf8');
        await writeFile(join(tmp, 'c.md'), '# C\n\ntest content', 'utf8');

        const storage = new FileStorageAdapter();
        const provider = getFallbackSearchProvider(tmp, storage);

        const results = await provider.search('test', { limit: 2 });
        assert.ok(results.length <= 2);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('qmd provider', () => {
    it('getQmdSearchProvider returns provider with correct shape', () => {
      const provider = getQmdSearchProvider('/workspace');
      assert.strictEqual(provider.name, 'qmd');
      assert.strictEqual(typeof provider.isAvailable, 'function');
      assert.strictEqual(typeof provider.search, 'function');
      assert.strictEqual(typeof provider.semanticSearch, 'function');
    });

    it('search returns empty when qmd fails (mocked)', async () => {
      const provider = getQmdSearchProvider('/workspace', {
        whichSync: () => ({ status: 0, stdout: '/usr/bin/qmd' }),
        execFileAsync: async () => {
          throw new Error('qmd not found');
        },
      });
      const results = await provider.search('query');
      assert.deepEqual(results, []);
    });
  });
});
