/**
 * Tests for ContextService via compat getRelevantContext.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRelevantContext } from '../../src/compat/context.js';
import type { WorkspacePaths, ProductPrimitive } from '../../src/models/index.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

describe('ContextService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctx-svc-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty files and Low confidence for empty workspace', async () => {
    const result = await getRelevantContext('create a PRD for search', paths);
    assert.equal(result.query, 'create a PRD for search');
    assert.equal(result.files.length, 0);
    assert.equal(result.confidence, 'Low');
    assert.ok(result.gaps.length > 0);
  });

  it('includes goals/strategy.md when present', async () => {
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur strategic pillars.');
    const result = await getRelevantContext('plan the quarter', paths);
    const f = result.files.find(x => x.relativePath === 'goals/strategy.md');
    assert.ok(f);
    assert.equal(f!.category, 'goals');
    assert.equal(f!.relevanceScore, 0.5);
  });

  it('maps Problem primitive to business-overview.md', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve onboarding friction.');
    const result = await getRelevantContext('discovery on onboarding', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    const f = result.files.find(x => x.relativePath === 'context/business-overview.md');
    assert.ok(f);
    assert.equal(f!.primitive, 'Problem');
  });

  it('identifies placeholder files as gaps', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '[Add your business overview here]');
    const result = await getRelevantContext('discovery', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    assert.ok(result.gaps.some(g => g.primitive === 'Problem'));
  });

  it('includes active projects matching the query', async () => {
    writeFile(tmpDir, 'projects/active/search-discovery/README.md', '# Search Discovery\n\nDiscover user needs.');
    const result = await getRelevantContext('search feature', paths);
    const f = result.files.find(x => x.relativePath?.includes('search-discovery'));
    assert.ok(f);
    assert.equal(f!.category, 'projects');
  });
});
