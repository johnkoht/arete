/**
 * Tests for src/core/search-providers/qmd.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSearchProvider,
  parseQmdJson,
  QMD_PROVIDER_NAME,
  type QmdTestDeps,
} from '../../../src/core/search-providers/qmd.js';

describe('qmd search provider', () => {
  describe('parseQmdJson', () => {
    it('parses JSON array to SearchResult[]', () => {
      const json = JSON.stringify([
        { path: '/a.md', content: 'hello', score: 0.9 },
        { path: '/b.md', content: 'world', score: 0.5 },
      ]);
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].path, '/a.md');
      assert.strictEqual(results[0].content, 'hello');
      assert.strictEqual(results[0].score, 0.9);
      assert.strictEqual(results[0].matchType, 'semantic');
      assert.strictEqual(results[1].path, '/b.md');
      assert.strictEqual(results[1].score, 0.5);
    });

    it('returns empty for invalid JSON', () => {
      assert.deepEqual(parseQmdJson('not json'), []);
      assert.deepEqual(parseQmdJson(''), []);
    });

    it('normalizes score to 0-1 when out of range', () => {
      const json = JSON.stringify([{ path: '/x.md', content: 'x', score: 1.5 }]);
      const results = parseQmdJson(json);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].score, 1);
    });
  });

  describe('getSearchProvider with mocks', () => {
    it('isAvailable returns false when which fails', async () => {
      const deps: QmdTestDeps = {
        whichSync: () => ({ status: 1 }),
        execFileAsync: async () => ({ stdout: '[]' }),
      };
      const provider = getSearchProvider('/ws', deps);
      const available = await provider.isAvailable();
      assert.strictEqual(available, false);
    });

    it('isAvailable returns true when which succeeds', async () => {
      const deps: QmdTestDeps = {
        whichSync: () => ({ status: 0, stdout: '/usr/bin/qmd' }),
        execFileAsync: async () => ({ stdout: '[]' }),
      };
      const provider = getSearchProvider('/ws', deps);
      const available = await provider.isAvailable();
      assert.strictEqual(available, true);
    });

    it('search returns parsed results from execFileAsync stdout', async () => {
      const json = JSON.stringify([
        { path: '/goals/strategy.md', content: 'Strategy doc', score: 0.85 },
      ]);
      const deps: QmdTestDeps = {
        whichSync: () => ({ status: 0, stdout: '/usr/bin/qmd' }),
        execFileAsync: async () => ({ stdout: json }),
      };
      const provider = getSearchProvider('/ws', deps);
      const results = await provider.search('strategy');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].path, '/goals/strategy.md');
      assert.strictEqual(results[0].score, 0.85);
    });

    it('search returns empty on execFileAsync error', async () => {
      const deps: QmdTestDeps = {
        whichSync: () => ({ status: 0, stdout: '/usr/bin/qmd' }),
        execFileAsync: async () => {
          throw new Error('qmd not found');
        },
      };
      const provider = getSearchProvider('/ws', deps);
      const results = await provider.search('query');
      assert.deepEqual(results, []);
    });

    it('semanticSearch returns parsed results', async () => {
      const json = JSON.stringify([{ path: '/x.md', content: 'content', score: 1 }]);
      const deps: QmdTestDeps = {
        whichSync: () => ({ status: 0, stdout: '/usr/bin/qmd' }),
        execFileAsync: async () => ({ stdout: json }),
      };
      const provider = getSearchProvider('/ws', deps);
      const results = await provider.semanticSearch('query');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].matchType, 'semantic');
    });

    it('provider has correct name', () => {
      const provider = getSearchProvider('/ws', {
        whichSync: () => ({ status: 0 }),
        execFileAsync: async () => ({ stdout: '[]' }),
      });
      assert.strictEqual(provider.name, QMD_PROVIDER_NAME);
    });
  });
});
