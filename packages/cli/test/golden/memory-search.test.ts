/**
 * Golden pattern tests for arete memory search command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('golden: memory search command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-golden-memory');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('missing query produces error', () => {
    runCli(['install', tmpDir, '--skip-qmd', '--json']);
    const { stdout, stderr, code } = runCliRaw(
      ['memory', 'search', '', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const json = JSON.parse((stdout || stderr).trim());
    assert.equal(json.success, false);
    assert.ok(/Missing|query/i.test(json.error ?? ''));
  });

  it('not in workspace produces error', () => {
    const { stdout, code } = runCliRaw(
      ['memory', 'search', 'onboarding', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const json = JSON.parse(stdout);
    assert.equal(json.success, false);
    assert.ok(/Not in an Areté workspace/i.test(json.error ?? ''));
  });

  it('in workspace produces memory search JSON structure', () => {
    runCli(['install', tmpDir, '--skip-qmd', '--json']);
    const stdout = runCli(
      ['memory', 'search', 'test query', '--json'],
      { cwd: tmpDir },
    );
    const json = JSON.parse(stdout);
    assert.equal(json.success, true);
    assert.ok(typeof json.query === 'string');
    assert.ok(typeof json.total === 'number');
    assert.ok(Array.isArray(json.results));
  });

  it('human output has Memory Search header and Found line', () => {
    runCli(['install', tmpDir, '--skip-qmd', '--json']);
    const stdout = runCli(['memory', 'search', 'onboarding'], { cwd: tmpDir });
    assert.ok(/Memory Search/i.test(stdout));
    assert.ok(/Query:|Found:/i.test(stdout));
  });
});
