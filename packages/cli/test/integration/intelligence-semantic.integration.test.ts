import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { runCli } from '../helpers.js';
import {
  createIntegrationSandbox,
  installWorkspace,
  seedWorkspaceFromFixtures,
} from './helpers.js';

describe('integration: intelligence semantic coverage on seeded corpus', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-intelligence-semantic');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('supports semantic memory search, timeline, resolve, and people memory refresh', () => {
    const workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');
    seedWorkspaceFromFixtures(workspace);

    const searchOutput = runCli(['memory', 'search', 'onboarding', '--json'], { cwd: workspace });
    const searchResult = JSON.parse(searchOutput) as {
      success: boolean;
      total: number;
      results: Array<{ type: string; source: string; content: string }>;
    };
    assert.equal(searchResult.success, true);
    assert.ok(searchResult.total > 0, 'memory search should return onboarding matches');
    assert.ok(
      searchResult.results.some((item) => item.type === 'decisions' || item.type === 'learnings'),
      'memory search should include decisions/learnings items',
    );

    const timelineOutput = runCli(['memory', 'timeline', 'auth', '--json'], { cwd: workspace });
    const timelineResult = JSON.parse(timelineOutput) as {
      success: boolean;
      itemCount: number;
      items: Array<{ title: string }>;
    };
    assert.equal(timelineResult.success, true);
    assert.ok(timelineResult.itemCount > 0, 'timeline should include auth-related arc items');
    assert.ok(
      timelineResult.items.some((item) => item.title.toLowerCase().includes('auth')),
      'timeline should include auth-theme titles',
    );

    const resolveOutput = runCli(['resolve', 'Alex', '--json'], { cwd: workspace });
    const resolveResult = JSON.parse(resolveOutput) as {
      success: boolean;
      result: { slug: string } | null;
    };
    assert.equal(resolveResult.success, true);
    assert.ok(resolveResult.result !== null, 'resolve should find Alex match');
    assert.equal(resolveResult.result?.slug, 'alex-eng');

    const refreshOutput = runCli(['people', 'memory', 'refresh', '--json'], { cwd: workspace });
    const refreshResult = JSON.parse(refreshOutput) as {
      success: boolean;
      scannedPeople: number;
      scannedMeetings: number;
      updated: number;
    };
    assert.equal(refreshResult.success, true);
    assert.ok(refreshResult.scannedPeople >= 6, 'memory refresh should scan expanded people set');
    assert.ok(refreshResult.scannedMeetings >= 12, 'memory refresh should scan expanded meeting set');
    assert.ok(refreshResult.updated >= 0, 'memory refresh should return updated count');
  });
});
