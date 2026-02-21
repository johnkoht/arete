/**
 * Tests for configuration resolution (getDefaultConfig, loadConfig).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../src/storage/file.js';
import { getDefaultConfig, loadConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'arete-config-test-'));
}

// ---------------------------------------------------------------------------
// getDefaultConfig
// ---------------------------------------------------------------------------

describe('getDefaultConfig', () => {
  it('returns conversations.peopleProcessing as off', () => {
    const config = getDefaultConfig();
    assert.equal(config.settings.conversations.peopleProcessing, 'off');
  });

  it('includes memory settings', () => {
    const config = getDefaultConfig();
    assert.equal(config.settings.memory.decisions.prompt_before_save, true);
    assert.equal(config.settings.memory.learnings.prompt_before_save, true);
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  let tmpDir: string;
  let storage: FileStorageAdapter;

  it('defaults conversations.peopleProcessing to off when no workspace file', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    const config = await loadConfig(storage, tmpDir);
    assert.equal(config.settings.conversations.peopleProcessing, 'off');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('conversations.peopleProcessing is never undefined', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    const config = await loadConfig(storage, tmpDir);
    assert.notEqual(config.settings.conversations.peopleProcessing, undefined);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves conversations.peopleProcessing from workspace arete.yaml', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    writeFileSync(
      join(tmpDir, 'arete.yaml'),
      'settings:\n  conversations:\n    peopleProcessing: "on"\n',
      'utf8'
    );
    const config = await loadConfig(storage, tmpDir);
    assert.equal(config.settings.conversations.peopleProcessing, 'on');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves ask mode from workspace arete.yaml', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    writeFileSync(
      join(tmpDir, 'arete.yaml'),
      'settings:\n  conversations:\n    peopleProcessing: "ask"\n',
      'utf8'
    );
    const config = await loadConfig(storage, tmpDir);
    assert.equal(config.settings.conversations.peopleProcessing, 'ask');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('setting conversations does not clobber memory settings', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    writeFileSync(
      join(tmpDir, 'arete.yaml'),
      'settings:\n  conversations:\n    peopleProcessing: "on"\n',
      'utf8'
    );
    const config = await loadConfig(storage, tmpDir);
    // Memory settings from DEFAULT_CONFIG should be preserved
    assert.equal(config.settings.memory.decisions.prompt_before_save, true);
    assert.equal(config.settings.memory.learnings.prompt_before_save, true);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles null workspacePath gracefully', async () => {
    storage = new FileStorageAdapter();
    const config = await loadConfig(storage, null);
    assert.equal(config.settings.conversations.peopleProcessing, 'off');
  });

  it('handles malformed arete.yaml gracefully (falls back to default)', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    writeFileSync(join(tmpDir, 'arete.yaml'), ':: invalid yaml ::', 'utf8');
    const config = await loadConfig(storage, tmpDir);
    assert.equal(config.settings.conversations.peopleProcessing, 'off');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('clamps invalid peopleProcessing value to off', async () => {
    tmpDir = createTmpDir();
    storage = new FileStorageAdapter();
    writeFileSync(
      join(tmpDir, 'arete.yaml'),
      'settings:\n  conversations:\n    peopleProcessing: "sometimes"\n',
      'utf8'
    );
    const config = await loadConfig(storage, tmpDir);
    assert.equal(config.settings.conversations.peopleProcessing, 'off');
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
