import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTmpDir, cleanupTmpDir, runCli } from '../helpers.js';

describe('setup command', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = createTmpDir('arete-test-setup');
  });

  afterEach(() => {
    cleanupTmpDir(workspaceDir);
  });

  it('shows direct setup guidance without legacy-cli wording', () => {
    runCli(['install', workspaceDir, '--skip-qmd', '--json', '--ide', 'cursor']);

    const output = runCli(['setup'], { cwd: workspaceDir });

    assert.ok(output.includes('Areté Setup'));
    assert.ok(output.includes('arete integration configure calendar'));
    assert.ok(output.includes('arete integration configure fathom'));
    assert.equal(output.includes('legacy CLI'), false);
  });
});
