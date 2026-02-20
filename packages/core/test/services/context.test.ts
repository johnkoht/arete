/**
 * Tests for ContextService via compat getRelevantContext.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getRelevantContext } from '../../src/compat/context.js';
import type { WorkspacePaths, ProductPrimitive } from '../../src/models/index.js';
import { createTestWorkspace } from '../fixtures/index.js';

describe('ContextService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let writeFixtureFile: (relativePath: string, content: string) => void;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctx-svc-'));
    const fixture = createTestWorkspace(tmpDir);
    paths = fixture.paths;
    writeFixtureFile = fixture.writeFile;
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
    writeFixtureFile('goals/strategy.md', '# Strategy\n\nOur strategic pillars.');
    const result = await getRelevantContext('plan the quarter', paths);
    const fileResult = result.files.find((file) => file.relativePath === 'goals/strategy.md');
    assert.ok(fileResult);
    assert.equal(fileResult?.category, 'goals');
    assert.equal(fileResult?.relevanceScore, 0.5);
  });

  it('maps Problem primitive to business-overview.md', async () => {
    writeFixtureFile('context/business-overview.md', '# Business\n\nWe solve onboarding friction.');
    const result = await getRelevantContext('discovery on onboarding', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    const fileResult = result.files.find(
      (file) => file.relativePath === 'context/business-overview.md',
    );
    assert.ok(fileResult);
    assert.equal(fileResult?.primitive, 'Problem');
  });

  it('identifies placeholder files as gaps', async () => {
    writeFixtureFile('context/business-overview.md', '[Add your business overview here]');
    const result = await getRelevantContext('discovery', paths, {
      primitives: ['Problem'] as ProductPrimitive[],
    });
    assert.ok(result.gaps.some((gap) => gap.primitive === 'Problem'));
  });

  it('includes active projects matching the query', async () => {
    writeFixtureFile(
      'projects/active/search-discovery/README.md',
      '# Search Discovery\n\nDiscover user needs.',
    );
    const result = await getRelevantContext('search feature', paths);
    const fileResult = result.files.find((file) => file.relativePath?.includes('search-discovery'));
    assert.ok(fileResult);
    assert.equal(fileResult?.category, 'projects');
  });

  it('includes conversations matching the query', async () => {
    writeFixtureFile(
      'resources/conversations/2026-02-20-api-approach.md',
      '---\ntitle: "API Approach Discussion"\ndate: "2026-02-20"\nsource: "manual"\n---\n\n# API Approach Discussion\n\n## Summary\nTeam decided on REST API approach for the new integration.\n',
    );
    const result = await getRelevantContext('API approach', paths);
    const fileResult = result.files.find((file) =>
      file.relativePath?.includes('resources/conversations/'),
    );
    assert.ok(fileResult, 'conversation file should be found by context query');
  });
});
