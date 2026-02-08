/**
 * Tests for src/core/context-injection.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getRelevantContext } from '../../src/core/context-injection.js';
import type { WorkspacePaths, ProductPrimitive } from '../../src/types.js';

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
    it('returns empty files and Low confidence for empty workspace', () => {
      const result = getRelevantContext('create a PRD for search', paths);
      assert.equal(result.query, 'create a PRD for search');
      assert.equal(result.files.length, 0);
      assert.equal(result.confidence, 'Low');
      assert.ok(result.gaps.length > 0, 'Should identify gaps');
      assert.ok(result.assembledAt.length > 0);
    });

    it('includes goals/strategy.md when present (always-include)', () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur strategic pillars are growth and retention.');
      const result = getRelevantContext('plan the quarter', paths);
      const strategyFile = result.files.find(f => f.relativePath === 'goals/strategy.md');
      assert.ok(strategyFile, 'Should include goals/strategy.md');
      assert.equal(strategyFile!.category, 'goals');
    });

    it('includes goals/quarter.md when present (always-include)', () => {
      writeFile(tmpDir, 'goals/quarter.md', '# Q1 Goals\n\nShip onboarding flow and reduce churn.');
      const result = getRelevantContext('week plan', paths);
      const quarterFile = result.files.find(f => f.relativePath === 'goals/quarter.md');
      assert.ok(quarterFile, 'Should include goals/quarter.md');
    });

    it('maps Problem primitive to business-overview.md', () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business Overview\n\nWe solve onboarding friction for SaaS companies.');
      const result = getRelevantContext('discovery on onboarding', paths, {
        primitives: ['Problem'],
      });
      const biz = result.files.find(f => f.relativePath === 'context/business-overview.md');
      assert.ok(biz, 'Should include business-overview.md for Problem primitive');
      assert.equal(biz!.primitive, 'Problem');
    });

    it('maps User primitive to users-personas.md and people files', () => {
      writeFile(tmpDir, 'context/users-personas.md', '# User Personas\n\nEnterprise admins who manage onboarding for their teams.');
      writeFile(tmpDir, 'people/internal/jane-doe.md', '---\nname: "Jane Doe"\nemail: "jane@acme.com"\nrole: "PM"\ncategory: "internal"\n---\n\n# Jane Doe\nWorks on onboarding.');
      const result = getRelevantContext('onboarding user research', paths, {
        primitives: ['User'],
      });
      const personas = result.files.find(f => f.relativePath === 'context/users-personas.md');
      assert.ok(personas, 'Should include users-personas.md');
      assert.equal(personas!.primitive, 'User');
      // People file with matching content should also be included
      const jane = result.files.find(f => f.relativePath.includes('jane-doe'));
      assert.ok(jane, 'Should include jane-doe.md (matches "onboarding")');
    });

    it('maps Solution primitive to products-services.md', () => {
      writeFile(tmpDir, 'context/products-services.md', '# Products\n\nOur main product is a search platform for enterprise customers.');
      const result = getRelevantContext('PRD for search feature', paths, {
        primitives: ['Solution'],
      });
      const prod = result.files.find(f => f.relativePath === 'context/products-services.md');
      assert.ok(prod, 'Should include products-services.md');
      assert.equal(prod!.primitive, 'Solution');
    });

    it('maps Market primitive to competitive-landscape.md', () => {
      writeFile(tmpDir, 'context/competitive-landscape.md', '# Competitive Landscape\n\nAlgolia and Elasticsearch are primary competitors in the search space.');
      const result = getRelevantContext('competitive analysis', paths, {
        primitives: ['Market'],
      });
      const market = result.files.find(f => f.relativePath === 'context/competitive-landscape.md');
      assert.ok(market, 'Should include competitive-landscape.md');
      assert.equal(market!.primitive, 'Market');
    });

    it('identifies gaps when context files are missing', () => {
      const result = getRelevantContext('create a PRD', paths, {
        primitives: ['Problem', 'User', 'Market'],
      });
      assert.ok(result.gaps.length >= 3, 'Should have gaps for each missing primitive');
      const gapPrimitives = result.gaps.map(g => g.primitive);
      assert.ok(gapPrimitives.includes('Problem'));
      assert.ok(gapPrimitives.includes('User'));
      assert.ok(gapPrimitives.includes('Market'));
    });

    it('identifies placeholder files as gaps', () => {
      writeFile(tmpDir, 'context/business-overview.md', '---\ntitle: Business Overview\n---\n\n[Add your business overview here]');
      const result = getRelevantContext('discovery', paths, {
        primitives: ['Problem'],
      });
      const gap = result.gaps.find(g => g.primitive === 'Problem');
      assert.ok(gap, 'Placeholder files should produce a gap');
    });

    it('includes active projects matching the query', () => {
      writeFile(tmpDir, 'projects/active/search-discovery/README.md', '# Search Discovery\n\nDiscover user needs around search functionality.');
      const result = getRelevantContext('search feature', paths);
      const proj = result.files.find(f => f.relativePath.includes('search-discovery'));
      assert.ok(proj, 'Should include matching project');
      assert.equal(proj!.category, 'projects');
    });

    it('includes memory items matching the query', () => {
      writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-15: Use Elasticsearch for search\n\n**Decision**: We chose Elasticsearch over Algolia.\n');
      const result = getRelevantContext('search technology decision', paths);
      const mem = result.files.find(f => f.category === 'memory');
      assert.ok(mem, 'Should include memory file with matching content');
    });

    it('uses all primitives when none specified', () => {
      const result = getRelevantContext('general task', paths);
      assert.deepEqual(result.primitives, ['Problem', 'User', 'Solution', 'Market', 'Risk']);
    });

    it('uses specified primitives when provided', () => {
      const prims: ProductPrimitive[] = ['Problem', 'User'];
      const result = getRelevantContext('user research', paths, { primitives: prims });
      assert.deepEqual(result.primitives, prims);
    });

    it('rates confidence High when context is rich', () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe help companies with their onboarding flow and retention challenges.');
      writeFile(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise admins managing team onboarding.');
      writeFile(tmpDir, 'context/products-services.md', '# Products\n\nOnboarding SaaS platform.');
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrow enterprise segment.');
      const result = getRelevantContext('onboarding', paths, {
        primitives: ['Problem', 'User', 'Solution'],
      });
      assert.equal(result.confidence, 'High');
    });

    it('rates confidence Medium when partial context exists', () => {
      writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve onboarding problems.');
      const result = getRelevantContext('onboarding', paths, {
        primitives: ['Problem', 'User'],
      });
      assert.equal(result.confidence, 'Medium');
    });

    it('does not duplicate files in the bundle', () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nGrowth and search improvements.');
      const result = getRelevantContext('strategy', paths);
      const strategyFiles = result.files.filter(f => f.relativePath === 'goals/strategy.md');
      assert.equal(strategyFiles.length, 1, 'Should not have duplicates');
    });

    it('extracts summary from file content', () => {
      writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur three strategic pillars are growth, retention, and expansion into new markets.');
      const result = getRelevantContext('strategy', paths);
      const file = result.files.find(f => f.relativePath === 'goals/strategy.md');
      assert.ok(file);
      assert.ok(file!.summary!.includes('strategic pillars'));
    });
  });
});
