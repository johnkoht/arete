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

    it('returns fallback provider when ARETE_SEARCH_FALLBACK=1', () => {
      const original = process.env.ARETE_SEARCH_FALLBACK;
      try {
        process.env.ARETE_SEARCH_FALLBACK = '1';
        const provider = getSearchProvider('/some/workspace');
        assert.strictEqual(provider.name, 'fallback');
      } finally {
        if (original === undefined) {
          delete process.env.ARETE_SEARCH_FALLBACK;
        } else {
          process.env.ARETE_SEARCH_FALLBACK = original;
        }
      }
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
    it('parses current QMD format (file, snippet)', () => {
      // Actual QMD CLI output format
      const json = JSON.stringify([
        {
          docid: '#abc123',
          score: 0.93,
          file: 'qmd://my-workspace-cc38/resources/meetings/2026-03-02-standup.md',
          title: 'Standup Meeting',
          snippet: '@@ -10,4 @@ (9 before, 15 after)\n\nDiscussed the new feature rollout...',
        },
        {
          docid: '#def456',
          score: 0.85,
          file: 'qmd://my-workspace-cc38/context/business-overview.md',
          title: 'Business Overview',
          snippet: '@@ -1,3 @@ (0 before, 50 after)\n\n# Business Overview\n\nOur company...',
        },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 2);
      // Verifies qmd:// prefix is stripped
      assert.strictEqual(results[0].path, 'resources/meetings/2026-03-02-standup.md');
      assert.strictEqual(results[0].content, '@@ -10,4 @@ (9 before, 15 after)\n\nDiscussed the new feature rollout...');
      assert.strictEqual(results[0].score, 0.93);
      assert.strictEqual(results[0].matchType, 'semantic');
      assert.strictEqual(results[1].path, 'context/business-overview.md');
    });

    it('strips qmd://collection-name/ prefix from paths', () => {
      const json = JSON.stringify([
        { file: 'qmd://reserv-121f/projects/active/glance-comms/readme.md', score: 0.5 },
        { file: 'qmd://test-workspace-fa4e/context/overview.md', score: 0.4 },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results[0].path, 'projects/active/glance-comms/readme.md');
      assert.strictEqual(results[1].path, 'context/overview.md');
    });

    it('handles paths without qmd:// prefix', () => {
      const json = JSON.stringify([
        { file: '/absolute/path/to/file.md', score: 0.5 },
        { file: 'relative/path.md', score: 0.4 },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results[0].path, '/absolute/path/to/file.md');
      assert.strictEqual(results[1].path, 'relative/path.md');
    });

    it('parses legacy format (path, content) for backward compat', () => {
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
      const json = JSON.stringify({ results: [{ file: 'qmd://test/x.md', snippet: 'x' }] });
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].path, 'x.md');
    });

    it('returns empty array for invalid json', () => {
      assert.deepEqual(parseQmdJson('not json'), []);
      assert.deepEqual(parseQmdJson(''), []);
    });

    it('clamps scores outside [0, 1] range', () => {
      const json = JSON.stringify([
        { file: 'qmd://test/a.md', score: 1.5 },
        { file: 'qmd://test/b.md', score: -0.5 },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results[0].score, 1);
      assert.strictEqual(results[1].score, 0);
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
