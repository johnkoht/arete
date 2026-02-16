/**
 * Golden pattern tests for arete resolve command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('golden: resolve command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-golden-resolve');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('missing reference produces error', () => {
    runCli(['install', tmpDir, '--json']);
    const { stdout, stderr, code } = runCliRaw(
      ['resolve', '', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const json = JSON.parse((stdout || stderr).trim());
    assert.equal(json.success, false);
    assert.ok(/Missing|reference/i.test(json.error ?? ''));
  });

  it('not in workspace produces error', () => {
    const { stdout, code } = runCliRaw(['resolve', 'Jane', '--json'], {
      cwd: tmpDir,
    });
    assert.equal(code, 1);
    const json = JSON.parse(stdout);
    assert.equal(json.success, false);
    assert.ok(/Not in an Areté workspace/i.test(json.error ?? ''));
  });

  it('in workspace produces resolve JSON structure (single or all)', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(['resolve', 'SomePerson', '--json'], {
      cwd: tmpDir,
    });
    const json = JSON.parse(stdout);
    assert.equal(json.success, true);
    assert.ok(typeof json.reference === 'string');
    assert.ok(typeof json.entityType === 'string');
    assert.ok(
      json.result !== undefined || Array.isArray(json.results),
      'Should have result or results',
    );
  });

  it('human output has Entity Resolution header', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(['resolve', 'Jane'], { cwd: tmpDir });
    assert.ok(/Entity Resolution|Reference:|Type:/i.test(stdout));
  });
});
