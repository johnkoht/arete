/**
 * Golden pattern tests for arete status command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('golden: status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-golden-status');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('not in workspace produces error with hint', () => {
    const { stdout, stderr, code } = runCliRaw(['status'], { cwd: tmpDir });
    const out = stdout + stderr;
    assert.equal(code, 1);
    assert.ok(
      /Not in an Areté workspace|not.*arete workspace/i.test(out),
      'Should mention not in workspace',
    );
    assert.ok(
      /Run "arete install"|arete install/i.test(out),
      'Should hint at install',
    );
  });

  it('not in workspace JSON output has success false', () => {
    const { stdout, code } = runCliRaw(['status', '--json'], { cwd: tmpDir });
    assert.equal(code, 1);
    const json = JSON.parse(stdout);
    assert.equal(json.success, false);
    assert.ok(typeof json.error === 'string');
  });

  it('in workspace produces status structure with path, version, ide', () => {
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    const stdout = runCli(['status', '--json'], { cwd: tmpDir });
    const json = JSON.parse(stdout);
    assert.equal(json.success, true);
    assert.ok(typeof json.workspace === 'object');
    assert.ok(typeof json.workspace.path === 'string');
    assert.ok(typeof json.workspace.version === 'string');
    assert.ok(['cursor', 'claude'].includes(json.workspace.ide));
    assert.ok(Array.isArray(json.skills?.list));
    assert.ok(Array.isArray(json.integrations));
    assert.ok(typeof json.directories === 'object');
  });
});
