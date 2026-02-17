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

  it('returns useful context inventory and briefing data for seeded onboarding query', () => {
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
      contextResult.files.some((file) => file.relativePath.includes('projects/active')) ||
        contextResult.files.some((file) => file.relativePath.includes('context/')),
      'context should include project or context files',
    );

    const inventoryOutput = runCli(['context', '--inventory', '--json'], { cwd: workspace });
    const inventoryResult = JSON.parse(inventoryOutput) as {
      success: boolean;
      totalFiles: number;
      staleCount: number;
      freshness: Array<{ relativePath: string }>;
    };

    assert.equal(inventoryResult.success, true);
    assert.ok(inventoryResult.totalFiles > 0, 'inventory should scan seeded workspace files');
    assert.ok(inventoryResult.staleCount >= 0);
    assert.ok(inventoryResult.freshness.length > 0, 'inventory should include freshness entries');

    const briefOutput = runCli(
      ['brief', '--for', 'prep for my onboarding meeting with Jane Doe', '--json'],
      { cwd: workspace },
    );
    const briefResult = JSON.parse(briefOutput) as {
      success: boolean;
      contextFiles: number;
      memoryResults: number;
      markdown: string;
      confidence: string;
    };

    assert.equal(briefResult.success, true);
    assert.ok(briefResult.contextFiles > 0, 'brief should include context files');
    assert.ok(briefResult.memoryResults >= 0);
    assert.ok(briefResult.markdown.includes('Primitive Briefing'));
    assert.ok(['High', 'Medium', 'Low'].includes(briefResult.confidence));
  });
});
