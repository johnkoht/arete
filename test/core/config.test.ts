/**
 * Tests for src/core/config.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import {
  loadConfig,
  getDefaultConfig,
  getGlobalConfigPath,
  getWorkspaceConfigPath,
} from '../../src/core/config.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('getDefaultConfig', () => {
    it('returns a config object with expected shape', () => {
      const config = getDefaultConfig();
      assert.equal(config.schema, 1);
      assert.equal(config.version, null);
      assert.equal(config.source, 'npm');
      assert.deepEqual(config.skills, { core: [], overrides: [] });
      assert.deepEqual(config.tools, []);
      assert.deepEqual(config.integrations, {});
      assert.ok(config.settings);
      assert.ok(config.settings.memory);
    });

    it('returns a new object each time (not a reference)', () => {
      const a = getDefaultConfig();
      const b = getDefaultConfig();
      assert.notEqual(a, b);
      (a as any).source = 'modified';
      assert.equal(b.source, 'npm');
    });
  });

  describe('getGlobalConfigPath', () => {
    it('returns path in home directory', () => {
      const globalPath = getGlobalConfigPath();
      assert.ok(globalPath.endsWith(join('.arete', 'config.yaml')));
    });
  });

  describe('getWorkspaceConfigPath', () => {
    it('returns arete.yaml in the workspace root', () => {
      const wsPath = getWorkspaceConfigPath('/some/workspace');
      assert.equal(wsPath, join('/some/workspace', 'arete.yaml'));
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when no config files exist', () => {
      const config = loadConfig(tmpDir);
      const defaults = getDefaultConfig();
      assert.equal(config.schema, defaults.schema);
      assert.equal(config.source, defaults.source);
    });

    it('merges workspace config over defaults', () => {
      const yamlContent = `schema: 2\nsource: symlink\n`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);

      const config = loadConfig(tmpDir);
      assert.equal(config.schema, 2);
      assert.equal(config.source, 'symlink');
      // Non-overridden defaults still present
      assert.ok(config.settings);
    });

    it('deep merges nested config', () => {
      const yamlContent = `settings:\n  memory:\n    decisions:\n      prompt_before_save: false\n`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);

      const config = loadConfig(tmpDir);
      assert.equal(config.settings.memory.decisions.prompt_before_save, false);
      // Other nested defaults preserved
      assert.equal(config.settings.memory.learnings.prompt_before_save, true);
    });

    it('returns internal_email_domain when present in arete.yaml', () => {
      const yamlContent = `internal_email_domain: acme.com\n`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);

      const config = loadConfig(tmpDir);
      assert.equal(config.internal_email_domain, 'acme.com');
    });

    it('handles malformed YAML gracefully', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), ':\n  bad yaml: [[[');
      // Should not throw, falls back to defaults
      const config = loadConfig(tmpDir);
      assert.ok(config.schema);
    });

    it('handles null workspacePath', () => {
      const config = loadConfig(null);
      assert.equal(config.source, 'npm');
    });
  });
});
