/**
 * Tests for src/core/scripts.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import { getIntegrationStatus } from '../../src/core/scripts.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-scripts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('scripts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('getIntegrationStatus', () => {
    it('returns null when config directory does not exist', () => {
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'fathom');
      assert.equal(status, null);
    });

    it('returns null when config file does not exist', () => {
      const configsDir = join(tmpDir, '.cursor', 'integrations', 'configs');
      mkdirSync(configsDir, { recursive: true });
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'nonexistent');
      assert.equal(status, null);
    });

    it('returns active when config has active status', () => {
      const configsDir = join(tmpDir, '.cursor', 'integrations', 'configs');
      mkdirSync(configsDir, { recursive: true });
      writeFileSync(join(configsDir, 'fathom.yaml'), 'status: active\nname: fathom\n');
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'fathom');
      assert.equal(status, 'active');
    });

    it('returns inactive when config has inactive status', () => {
      const configsDir = join(tmpDir, '.cursor', 'integrations', 'configs');
      mkdirSync(configsDir, { recursive: true });
      writeFileSync(join(configsDir, 'fathom.yaml'), 'status: inactive\nname: fathom\n');
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'fathom');
      assert.equal(status, 'inactive');
    });

    it('returns null for malformed YAML', () => {
      const configsDir = join(tmpDir, '.cursor', 'integrations', 'configs');
      mkdirSync(configsDir, { recursive: true });
      writeFileSync(join(configsDir, 'bad.yaml'), ':\n  [[[bad');
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'bad');
      assert.equal(status, null);
    });

    it('returns null when status field is missing from config', () => {
      const configsDir = join(tmpDir, '.cursor', 'integrations', 'configs');
      mkdirSync(configsDir, { recursive: true });
      writeFileSync(join(configsDir, 'fathom.yaml'), 'name: fathom\n');
      const paths = { integrations: join(tmpDir, '.cursor', 'integrations') };
      const status = getIntegrationStatus(paths, 'fathom');
      assert.equal(status, null);
    });
  });
});
