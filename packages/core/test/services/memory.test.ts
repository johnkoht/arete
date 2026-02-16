/**
 * Tests for MemoryService via compat searchMemory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchMemory } from '../../src/compat/memory.js';
import type { WorkspacePaths } from '../../src/models/index.js';

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

function writeMemoryFile(root: string, fileName: string, content: string): void {
  const dir = join(root, '.arete', 'memory', 'items');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), content, 'utf8');
}

describe('MemoryService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mem-svc-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for empty query tokens', async () => {
    const result = await searchMemory('the a', paths);
    assert.equal(result.results.length, 0);
    assert.equal(result.total, 0);
  });

  it('finds decisions matching query tokens', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-15: Use Elasticsearch for search
**Decision**: We chose Elasticsearch over Algolia.

### 2026-01-20: Onboarding flow redesign
**Context**: Onboarding drop-off was 40%.
**Decision**: Redesign the onboarding wizard.
`);
    const result = await searchMemory('onboarding', paths);
    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].type, 'decisions');
    assert.ok(result.results[0].content.includes('Onboarding'));
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
### 2026-01-10: Search tech\n**Decision**: Elasticsearch.
### 2026-01-15: Search UX\n**Decision**: Instant search.
### 2026-01-20: Search API\n**Decision**: REST endpoints.
`);
    const result = await searchMemory('search', paths, { limit: 2 });
    assert.equal(result.results.length, 2);
    assert.equal(result.total, 3);
  });
});
