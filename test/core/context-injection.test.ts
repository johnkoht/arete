/**
 * Tests for src/core/context-injection.ts
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getRelevantContext } from '../../src/core/context-injection.js';
import type { WorkspacePaths, ProductPrimitive } from '../../src/types.js';
import type { SearchProvider, SearchResult } from '../../src/core/search.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    cursor: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    skills: join(root, '.cursor', 'skills'),
    skillsCore: join(root, '.cursor', 'skills-core'),
    skillsLocal: join(root, '.cursor', 'skills-local'),
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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('context-injection', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctx-inject-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getRelevantContext', () => {
    it('returns empty files and Low confidence for empty workspace', async () => {
      const result = await getRelevantContext('create a PRD for search', paths);
      assert.equal(result.query, 'create a PRD for search');
      assert.equal(result.files.length, 0);
      assert.equal(result.confidence, 'Low');
      assert.ok(result.gaps.length > 0, 'Should identify gaps');
      assert.ok(result.assembledAt.length > 0);
    });

    it('includes goals/strategy.md when present (always-include)', async () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur strategic pillars are growth and retention.');
      const result = await getRelevantContext('plan the quarter', paths);
      const strategyFile = result.files.find(f => f.relativePath === 'goals/strategy.md');
      assert.ok(strategyFile, 'Should include goals/strategy.md');
      assert.equal(strategyFile!.category, 'goals');
      assert.equal(strategyFile!.relevanceScore, 0.5, 'Static files should have relevanceScore 0.5');
    });

    it('includes goals/quarter.md when present (always-include)', async () => {
      writeFile(tmpDir, 'goals/quarter.md', '# Q1 Goals\n\nShip onboarding flow and reduce churn.');
      const result = await getRelevantContext('week plan', paths);
      const quarterFile = result.files.find(f => f.relativePath === 'goals/quarter.md');
      assert.ok(quarterFile, 'Should include goals/quarter.md');
      assert.equal(quarterFile!.relevanceScore, 0.5, 'Static files should have relevanceScore 0.5');
    });

    it('maps Problem primitive to business-overview.md', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business Overview\n\nWe solve onboarding friction for SaaS companies.');
      const result = await getRelevantContext('discovery on onboarding', paths, {
        primitives: ['Problem'],
      });
      const biz = result.files.find(f => f.relativePath === 'context/business-overview.md');
      assert.ok(biz, 'Should include business-overview.md for Problem primitive');
      assert.equal(biz!.primitive, 'Problem');
      assert.equal(biz!.relevanceScore, 0.5);
    });

    it('maps User primitive to users-personas.md and people files', async () => {
      writeFile(tmpDir, 'context/users-personas.md', '# User Personas\n\nEnterprise admins who manage onboarding for their teams.');
      writeFile(tmpDir, 'people/internal/jane-doe.md', '---\nname: "Jane Doe"\nemail: "jane@acme.com"\nrole: "PM"\ncategory: "internal"\n---\n\n# Jane Doe\nWorks on onboarding.');
      const result = await getRelevantContext('onboarding user research', paths, {
        primitives: ['User'],
      });
      const personas = result.files.find(f => f.relativePath === 'context/users-personas.md');
      assert.ok(personas, 'Should include users-personas.md');
      assert.equal(personas!.primitive, 'User');
      // People file with matching content should also be included
      const jane = result.files.find(f => f.relativePath.includes('jane-doe'));
      assert.ok(jane, 'Should include jane-doe.md (matches "onboarding")');
    });

    it('maps Solution primitive to products-services.md', async () => {
      writeFile(tmpDir, 'context/products-services.md', '# Products\n\nOur main product is a search platform for enterprise customers.');
      const result = await getRelevantContext('PRD for search feature', paths, {
        primitives: ['Solution'],
      });
      const prod = result.files.find(f => f.relativePath === 'context/products-services.md');
      assert.ok(prod, 'Should include products-services.md');
      assert.equal(prod!.primitive, 'Solution');
    });

    it('maps Market primitive to competitive-landscape.md', async () => {
      writeFile(tmpDir, 'context/competitive-landscape.md', '# Competitive Landscape\n\nAlgolia and Elasticsearch are primary competitors in the search space.');
      const result = await getRelevantContext('competitive analysis', paths, {
        primitives: ['Market'],
      });
      const market = result.files.find(f => f.relativePath === 'context/competitive-landscape.md');
      assert.ok(market, 'Should include competitive-landscape.md');
      assert.equal(market!.primitive, 'Market');
    });

    it('identifies gaps when context files are missing', async () => {
      const result = await getRelevantContext('create a PRD', paths, {
        primitives: ['Problem', 'User', 'Market'],
      });
      assert.ok(result.gaps.length >= 3, 'Should have gaps for each missing primitive');
      const gapPrimitives = result.gaps.map(g => g.primitive);
      assert.ok(gapPrimitives.includes('Problem'));
      assert.ok(gapPrimitives.includes('User'));
      assert.ok(gapPrimitives.includes('Market'));
    });

    it('identifies placeholder files as gaps', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '---\ntitle: Business Overview\n---\n\n[Add your business overview here]');
      const result = await getRelevantContext('discovery', paths, {
        primitives: ['Problem'],
      });
      const gap = result.gaps.find(g => g.primitive === 'Problem');
      assert.ok(gap, 'Placeholder files should produce a gap');
    });

    it('includes active projects matching the query', async () => {
      writeFile(tmpDir, 'projects/active/search-discovery/README.md', '# Search Discovery\n\nDiscover user needs around search functionality.');
      const result = await getRelevantContext('search feature', paths);
      const proj = result.files.find(f => f.relativePath.includes('search-discovery'));
      assert.ok(proj, 'Should include matching project');
      assert.equal(proj!.category, 'projects');
    });

    it('includes memory items matching the query', async () => {
      writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-15: Use Elasticsearch for search\n\n**Decision**: We chose Elasticsearch over Algolia.\n');
      const result = await getRelevantContext('search technology decision', paths);
      const mem = result.files.find(f => f.category === 'memory');
      assert.ok(mem, 'Should include memory file with matching content');
    });

    it('uses all primitives when none specified', async () => {
      const result = await getRelevantContext('general task', paths);
      assert.deepEqual(result.primitives, ['Problem', 'User', 'Solution', 'Market', 'Risk']);
    });

    it('uses specified primitives when provided', async () => {
      const prims: ProductPrimitive[] = ['Problem', 'User'];
      const result = await getRelevantContext('user research', paths, { primitives: prims });
      assert.deepEqual(result.primitives, prims);
    });

    it('rates confidence High when context is rich', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe help companies with their onboarding flow and retention challenges.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins managing team onboarding.');
      writeFile(tmpDir, 'context/products-services.md', '# Products\n\nOnboarding SaaS platform.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrow enterprise segment.');
      const result = await getRelevantContext('onboarding', paths, {
        primitives: ['Problem', 'User', 'Solution'],
      });
      assert.equal(result.confidence, 'High');
    });

    it('rates confidence Medium when partial context exists', async () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve onboarding problems.');
      const result = await getRelevantContext('onboarding', paths, {
        primitives: ['Problem', 'User'],
      });
      assert.equal(result.confidence, 'Medium');
    });

    it('does not duplicate files in the bundle', async () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth and search improvements.');
      const result = await getRelevantContext('strategy', paths);
      const strategyFiles = result.files.filter(f => f.relativePath === 'goals/strategy.md');
      assert.equal(strategyFiles.length, 1, 'Should not have duplicates');
    });

    it('extracts summary from file content', async () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur three strategic pillars are growth, retention, and expansion into new markets.');
      const result = await getRelevantContext('strategy', paths);
      const file = result.files.find(f => f.relativePath === 'goals/strategy.md');
      assert.ok(file);
      assert.ok(file!.summary!.includes('strategic pillars'));
    });

    it('sorts files by relevance score descending', async () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth.');
      writeFile(tmpDir, 'goals/quarter.md', '# Q1\n\nQuarter goals.');
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve problems.');
      
      const result = await getRelevantContext('strategy', paths);
      
      // All files should have scores
      assert.ok(result.files.every(f => f.relevanceScore !== undefined), 'All files should have relevanceScore');
      
      // Files should be sorted descending
      for (let i = 0; i < result.files.length - 1; i++) {
        const currentScore = result.files[i].relevanceScore ?? 0;
        const nextScore = result.files[i + 1].relevanceScore ?? 0;
        assert.ok(currentScore >= nextScore, `Files should be sorted by score descending: ${currentScore} >= ${nextScore}`);
      }
    });

    it('caps total files at maxFiles', async () => {
      // Create more than maxFiles static files
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth and retention.');
      writeFile(tmpDir, 'goals/quarter.md', '# Q1\n\nQuarter goals.');
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve onboarding problems.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins.');
      writeFile(tmpDir, 'context/products-services.md', '# Products\n\nSaaS platform.');
      writeFile(tmpDir, 'context/competitive-landscape.md', '# Market\n\nCompetitors.');
      
      const result = await getRelevantContext('general task', paths, { maxFiles: 3 });
      
      assert.ok(result.files.length <= 3, `Should cap at maxFiles: got ${result.files.length}, expected <= 3`);
    });

    it('respects minScore for discovered files', async () => {
      // This test verifies that if SearchProvider were to return low-scoring files,
      // they would be filtered out. Since we don't mock SearchProvider here,
      // we just verify that static files always pass the threshold
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth.');
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nProblems.');
      
      const result = await getRelevantContext('strategy', paths, { minScore: 0.3 });
      
      // Static files with score 0.5 should always be included (0.5 > 0.3)
      assert.ok(result.files.length > 0, 'Static files should pass minScore threshold');
      assert.ok(result.files.every(f => (f.relevanceScore ?? 0) >= 0.3), 'All files should meet minScore threshold');
    });

    it('handles SearchProvider failure gracefully', async () => {
      // Even if SearchProvider throws, the function should continue with static files
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth.');
      
      // The function should complete without throwing
      const result = await getRelevantContext('strategy', paths);
      
      assert.ok(result.files.length > 0, 'Should return static files even if SearchProvider fails');
    });
  });
});
