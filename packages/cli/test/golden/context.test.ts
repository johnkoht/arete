/**
 * Golden pattern tests for arete context command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('golden: context command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-golden-context');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('missing --for produces error', () => {
    runCli(['install', tmpDir, '--json']);
    const { stdout, stderr, code } = runCliRaw(
      ['context', '--for', '', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    const json = JSON.parse((stdout || stderr).trim());
    assert.equal(json.success, false);
    assert.ok(/Missing|--for/i.test(json.error ?? ''));
  });

  it('not in workspace produces error', () => {
    const { stdout, code } = runCliRaw(['context', '--for', 'test', '--json'], {
      cwd: tmpDir,
    });
    assert.equal(code, 1);
    const json = JSON.parse(stdout);
    assert.equal(json.success, false);
    assert.ok(/Not in an Areté workspace/i.test(json.error ?? ''));
  });

  it.skip('in workspace produces context JSON structure', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(
      ['context', '--for', 'create PRD', '--json'],
      { cwd: tmpDir },
    );
    const json = JSON.parse(stdout.trim());
    assert.equal(json.success, true, `expected success; got: ${JSON.stringify(json).slice(0, 300)}`);
    assert.ok(typeof json.query === 'string');
    assert.ok(typeof json.confidence === 'number');
    assert.ok(Array.isArray(json.files));
    assert.ok(Array.isArray(json.gaps));
    assert.ok(Array.isArray(json.primitives));
  });

  it('human output has Context Injection header and query', () => {
    runCli(['install', tmpDir, '--json']);
    const stdout = runCli(['context', '--for', 'build a feature'], {
      cwd: tmpDir,
    });
    assert.ok(/Context Injection/i.test(stdout));
    assert.ok(/Query:|Confidence:|Primitives/i.test(stdout));
  });
});
