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

describe('integration: context + brief seeded journey', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = createIntegrationSandbox('arete-e2e-context-brief');
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('returns semantic context, stale inventory signals, and relevant customer briefing', () => {
    const workspace = join(sandboxRoot, 'cursor');
    installWorkspace(workspace, 'cursor');
    seedWorkspaceFromFixtures(workspace);

    const contextOutput = runCli(['context', '--for', 'onboarding discovery', '--json'], {
      cwd: workspace,
    });
    const contextResult = JSON.parse(contextOutput) as {
      success: boolean;
      filesCount: number;
      confidence: string;
      files: Array<{ relativePath: string }>;
    };

    assert.equal(contextResult.success, true);
    assert.ok(contextResult.filesCount > 0, 'context should include relevant files');
    assert.ok(['High', 'Medium', 'Low'].includes(contextResult.confidence));
    assert.ok(
      contextResult.files.some((file) => file.relativePath.includes('projects/active/onboarding-discovery')),
      'context should include onboarding project context',
    );

    const inventoryOutput = runCli(
      ['context', '--inventory', '--stale-days', '-1', '--json'],
      { cwd: workspace },
    );
    const inventoryResult = JSON.parse(inventoryOutput) as {
      success: boolean;
      totalFiles: number;
      staleCount: number;
      freshness: Array<{ relativePath: string; isStale: boolean }>;
    };

    assert.equal(inventoryResult.success, true);
    assert.ok(inventoryResult.totalFiles > 0, 'inventory should scan seeded workspace files');
    assert.ok(inventoryResult.staleCount > 0, 'inventory should surface stale seeded files');
    assert.ok(
      inventoryResult.freshness.some((entry) => entry.isStale),
      'freshness entries should include at least one stale file',
    );

    const briefOutput = runCli(['brief', '--for', 'prep for call with Bob Buyer', '--json'], {
      cwd: workspace,
    });
    const briefResult = JSON.parse(briefOutput) as {
      success: boolean;
      contextFiles: number;
      markdown: string;
      confidence: string;
    };

    assert.equal(briefResult.success, true);
    assert.ok(briefResult.contextFiles > 0, 'brief should include context files');
    assert.ok(briefResult.markdown.includes('Bob Buyer'), 'brief should include Bob Buyer context');
    assert.ok(briefResult.markdown.includes('Acme'), 'brief should include Acme thread context');
    assert.ok(['High', 'Medium', 'Low'].includes(briefResult.confidence));
  });
});
