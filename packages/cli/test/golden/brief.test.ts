/**
 * Golden pattern tests for arete brief command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('golden: brief command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-golden-brief');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('missing --for produces error', () => {
    runCli(['install', tmpDir, '--json']);
    const { stdout, stderr, code } = runCliRaw(
      ['brief', '--for', '', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const output = (stdout || stderr).trim();
    const json = JSON.parse(output);
    assert.equal(json.success, false);
    assert.ok(/Missing|--for/i.test(json.error ?? ''));
  });

  it('not in workspace produces error', () => {
    const { stdout, code } = runCliRaw(['brief', '--for', 'create PRD', '--json'], {
      cwd: tmpDir,  // tmpDir is empty, not a workspace
    });
    assert.equal(code, 1);
    const json = JSON.parse(stdout);
    assert.equal(json.success, false);
    assert.ok(/Not in an Areté workspace/i.test(json.error ?? ''));
  });

  it.skip('in workspace produces brief JSON structure', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(
      ['brief', '--for', 'create PRD', '--json'],
      { cwd: tmpDir },
    );
    const json = JSON.parse(stdout.trim());
    assert.equal(json.success, true, `expected success; got: ${JSON.stringify(json).slice(0, 300)}`);
    assert.ok(typeof json.task === 'string');
    assert.ok(typeof json.markdown === 'string');
    assert.ok(typeof json.confidence === 'number');
    assert.ok(Array.isArray(json.contextFiles) || typeof json.contextFiles === 'number');
  });

  it('human output contains markdown content', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(['brief', '--for', 'create PRD'], { cwd: tmpDir });
    assert.ok(stdout.length > 50);
    assert.ok(/^#|^##|context|memory|entities/i.test(stdout));
  });
});
