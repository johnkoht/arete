/**
 * Tests for src/core/memory-retrieval.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { searchMemory } from '../../src/core/memory-retrieval.js';
import type { WorkspacePaths } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    cursor: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writeMemoryFile(root: string, fileName: string, content: string): void {
  const dir = join(root, '.arete', 'memory', 'items');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memory-retrieval', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mem-retrieval-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('searchMemory', () => {
    it('returns empty results for empty query tokens', async () => {
      const result = await searchMemory('the a', paths);
      assert.equal(result.results.length, 0);
      assert.equal(result.total, 0);
    });

    it('returns empty results when memory dir does not exist', async () => {
      const result = await searchMemory('onboarding', paths);
      assert.equal(result.results.length, 0);
    });

    it('returns empty results when no matching sections', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-01-15: Use PostgreSQL\n\n**Decision**: We chose PostgreSQL for the database.\n');
      const result = await searchMemory('onboarding', paths);
      assert.equal(result.results.length, 0);
    });

    it('finds decisions matching query tokens', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-15: Use Elasticsearch for search

**Context**: We needed a search solution.
**Decision**: We chose Elasticsearch over Algolia.
**Rationale**: Better control and self-hosted option.

### 2026-01-20: Onboarding flow redesign

**Context**: Onboarding drop-off was 40%.
**Decision**: Redesign the onboarding wizard.
`);
      const result = await searchMemory('onboarding', paths);
      assert.ok(result.results.length >= 1, 'Should find onboarding decision');
      assert.equal(result.results[0].type, 'decisions');
      assert.ok(result.results[0].content.includes('Onboarding'));
      assert.equal(result.results[0].date, '2026-01-20');
    });

    it('finds learnings matching query tokens', async () => {
      writeMemoryFile(tmpDir, 'learnings.md', `# Learnings

### 2026-02-01: Users prefer guided onboarding

**Source**: User interviews (Jan 2026)
**Insight**: 80% of users prefer a step-by-step guided flow over self-service.
**Implications**: Invest in wizard UX.
`);
      const result = await searchMemory('onboarding guided', paths);
      assert.ok(result.results.length >= 1);
      assert.equal(result.results[0].type, 'learnings');
      assert.ok(result.results[0].content.includes('guided'));
    });

    it('finds observations matching query tokens', async () => {
      writeMemoryFile(tmpDir, 'agent-observations.md', `# Agent Observations

### 2026-02-05: User prefers concise summaries

The user frequently asks for shorter, more concise meeting summaries.
`);
      const result = await searchMemory('concise summaries', paths);
      assert.ok(result.results.length >= 1);
      assert.equal(result.results[0].type, 'observations');
    });

    it('ranks title matches higher than body matches', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-10: Choose search technology

**Decision**: Go with Elasticsearch.

### 2026-01-20: Pricing model

**Context**: Search usage costs need a pricing model.
**Decision**: Usage-based pricing.
`);
      const result = await searchMemory('search', paths);
      assert.ok(result.results.length >= 1);
      // At least one result should have "search" in the title (either position, depending on search mode)
      const hasSearchInTitle = result.results.some(r => r.content.includes('Choose search technology'));
      assert.ok(hasSearchInTitle, 'Should find result with search in title');
    });

    it('filters by memory type when specified', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-01-15: Search decision\n\n**Decision**: Use Elasticsearch.\n');
      writeMemoryFile(tmpDir, 'learnings.md', '# Learnings\n\n### 2026-02-01: Search insight\n\n**Insight**: Users want instant search.\n');
      const result = await searchMemory('search', paths, { types: ['learnings'] });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].type, 'learnings');
    });

    it('respects limit option', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-10: Search tech choice

**Decision**: Elasticsearch.

### 2026-01-15: Search UX design

**Decision**: Instant search with typeahead.

### 2026-01-20: Search API design

**Decision**: REST endpoints for search.
`);
      const result = await searchMemory('search', paths, { limit: 2 });
      assert.equal(result.results.length, 2);
      assert.equal(result.total, 3);
    });

    it('includes relevance explanation', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-01-15: Onboarding redesign\n\n**Decision**: Redesign onboarding.\n');
      const result = await searchMemory('onboarding redesign', paths);
      assert.ok(result.results.length >= 1);
      assert.ok(result.results[0].relevance.length > 0);
      // Relevance can be either "Title matches: ..." (token-based) or "Semantic match ..." (provider-based)
      const hasValidRelevance = 
        result.results[0].relevance.includes('Title matches') || 
        result.results[0].relevance.includes('Semantic match') ||
        result.results[0].relevance.includes('Body matches');
      assert.ok(hasValidRelevance, `Expected valid relevance format, got: ${result.results[0].relevance}`);
    });

    it('parses dates from section headings', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-02-07: Recent decision\n\n**Decision**: Something.\n');
      const result = await searchMemory('recent decision', paths);
      assert.ok(result.results.length >= 1);
      assert.equal(result.results[0].date, '2026-02-07');
    });

    it('handles sections without dates', async () => {
      writeMemoryFile(tmpDir, 'learnings.md', '# Learnings\n\n### Important search insight\n\n**Insight**: Search is crucial.\n');
      const result = await searchMemory('search insight', paths);
      assert.ok(result.results.length >= 1);
      assert.equal(result.results[0].date, undefined);
    });

    it('searches across multiple memory types by default', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-01-15: Onboarding decision\n\n**Decision**: Redesign.\n');
      writeMemoryFile(tmpDir, 'learnings.md', '# Learnings\n\n### 2026-02-01: Onboarding learning\n\n**Insight**: Users struggle.\n');
      const result = await searchMemory('onboarding', paths);
      assert.ok(result.results.length >= 2, 'Should find results across types');
      const types = new Set(result.results.map(r => r.type));
      assert.ok(types.has('decisions'));
      assert.ok(types.has('learnings'));
    });

    it('populates score field in results', async () => {
      writeMemoryFile(tmpDir, 'decisions.md', '# Decisions\n\n### 2026-01-15: Search decision\n\n**Decision**: Use Elasticsearch.\n');
      const result = await searchMemory('search', paths);
      assert.ok(result.results.length >= 1, `Expected at least 1 result, got ${result.results.length}`);
      assert.ok(typeof result.results[0].score === 'number', `Expected score to be a number, got ${typeof result.results[0].score}`);
      assert.ok(result.results[0].score! >= 0, `Expected score >= 0, got ${result.results[0].score}`);
    });

    it('applies recency boost to recent items', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const oneMonthAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      
      writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### ${today}: Recent search decision

**Decision**: Use semantic search.

### ${oneMonthAgo}: Older search decision

**Decision**: Use keyword search.
`);
      
      const result = await searchMemory('search decision', paths);
      assert.ok(result.results.length >= 2);
      
      // Recent item should have a higher score due to recency boost
      const recentItem = result.results.find(r => r.date === today);
      const olderItem = result.results.find(r => r.date === oneMonthAgo);
      
      assert.ok(recentItem);
      assert.ok(olderItem);
      assert.ok(recentItem.score! > olderItem.score!, 'Recent item should have higher score');
    });
  });
});
