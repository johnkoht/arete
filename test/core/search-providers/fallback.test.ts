/**
 * Tests for src/core/search-providers/fallback.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getSearchProvider } from '../../../src/core/search-providers/fallback.js';

describe('fallback search provider', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-fallback-test-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function writeMd(path: string, content: string): void {
    const full = join(workspaceRoot, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  it('returns empty for empty query', async () => {
    writeMd('doc.md', '# Hello\n\nWorld.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('');
    assert.deepEqual(results, []);
  });

  it('filters stop words so only meaningful tokens match', async () => {
    writeMd('about.md', '# About\n\nWe need to create a feature for the user.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('create feature');
    assert.ok(results.length >= 1);
    assert.ok(results.some(r => r.path.includes('about.md')));
  });

  it('ranks title matches higher than body-only matches', async () => {
    writeMd('onboarding.md', '# Onboarding\n\nUser onboarding flow.');
    writeMd('other.md', 'Some text. Onboarding is mentioned here in the body.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('onboarding');
    assert.ok(results.length >= 1);
    const first = results[0];
    assert.ok(first.path.includes('onboarding.md'), 'file with title match should rank first');
    assert.ok(first.score >= (results[1]?.score ?? 0));
  });

  it('gives multi-token bonus when multiple query tokens match', async () => {
    writeMd('ab.md', '# Alpha Beta\n\nAlpha and beta together.');
    writeMd('a.md', '# Alpha\n\nOnly alpha.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('alpha beta');
    assert.ok(results.length >= 1);
    assert.ok(results[0].path.includes('ab.md'), 'file matching both tokens should rank higher');
  });

  it('keyword matching finds files containing query tokens', async () => {
    writeMd('goals/strategy.md', '# Strategy\n\nProduct strategy and roadmap.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('strategy roadmap');
    assert.ok(results.length >= 1);
    assert.ok(results.some(r => r.path.includes('strategy.md')));
    assert.strictEqual(results[0].matchType, 'keyword');
  });

  it('semanticSearch delegates to search (same results)', async () => {
    writeMd('doc.md', '# Discovery\n\nDiscovery phase notes.');
    const provider = getSearchProvider(workspaceRoot);
    const searchResults = await provider.search('discovery');
    const semanticResults = await provider.semanticSearch('discovery');
    assert.strictEqual(semanticResults.length, searchResults.length);
    assert.deepEqual(
      semanticResults.map(r => ({ path: r.path, score: r.score })),
      searchResults.map(r => ({ path: r.path, score: r.score }))
    );
  });

  it('scores are normalized to 0-1 range', async () => {
    writeMd('one.md', '# One\n\nOne.');
    writeMd('two.md', '# Two\n\nTwo.');
    const provider = getSearchProvider(workspaceRoot);
    const results = await provider.search('one');
    assert.ok(results.length >= 1);
    for (const r of results) {
      assert.ok(r.score >= 0 && r.score <= 1, `score ${r.score} should be in [0,1]`);
    }
    assert.ok(results[0].score === 1, 'top result should have normalized score 1');
  });

  it('isAvailable returns true', async () => {
    const provider = getSearchProvider(workspaceRoot);
    const available = await provider.isAvailable();
    assert.strictEqual(available, true);
  });
});
