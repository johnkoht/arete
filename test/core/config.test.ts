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
  getAgentMode,
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
      assert.deepEqual(config.skills.core, []);
      assert.deepEqual(config.skills.overrides, []);
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

    it('loads skills.defaults from arete.yaml', () => {
      const yamlContent = `skills:
  defaults:
    create-prd: netflix-prd
    discovery: null
`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);
      const config = loadConfig(tmpDir);
      assert.ok(config.skills.defaults);
      assert.equal(config.skills.defaults!['create-prd'], 'netflix-prd');
      assert.equal(config.skills.defaults!['discovery'], null);
    });

    it('loads integrations.calendar config when present', () => {
      const yamlContent = `integrations:
  calendar:
    provider: macos
    calendars:
      - Work
      - Personal
`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);
      const config = loadConfig(tmpDir);
      assert.ok(config.integrations.calendar);
      assert.equal(config.integrations.calendar.provider, 'macos');
      assert.ok(Array.isArray(config.integrations.calendar.calendars));
      assert.equal(config.integrations.calendar.calendars!.length, 2);
      assert.equal(config.integrations.calendar.calendars![0], 'Work');
      assert.equal(config.integrations.calendar.calendars![1], 'Personal');
    });

    it('handles missing integrations.calendar section', () => {
      const yamlContent = `schema: 1\nsource: npm\n`;
      writeFileSync(join(tmpDir, 'arete.yaml'), yamlContent);
      const config = loadConfig(tmpDir);
      assert.equal(config.integrations.calendar, undefined);
    });
  });

  describe('getAgentMode', () => {
    const origAgentMode = process.env.AGENT_MODE;

    afterEach(() => {
      if (origAgentMode !== undefined) process.env.AGENT_MODE = origAgentMode;
      else delete process.env.AGENT_MODE;
    });

    it('returns builder when AGENT_MODE=BUILDER', () => {
      process.env.AGENT_MODE = 'BUILDER';
      assert.equal(getAgentMode(tmpDir), 'builder');
    });

    it('returns guide when AGENT_MODE=GUIDE', () => {
      process.env.AGENT_MODE = 'GUIDE';
      assert.equal(getAgentMode(tmpDir), 'guide');
    });

    it('returns builder when arete.yaml has agent_mode: builder', () => {
      delete process.env.AGENT_MODE;
      writeFileSync(join(tmpDir, 'arete.yaml'), 'agent_mode: builder\n');
      assert.equal(getAgentMode(tmpDir), 'builder');
    });

    it('returns guide when arete.yaml has agent_mode: guide', () => {
      delete process.env.AGENT_MODE;
      writeFileSync(join(tmpDir, 'arete.yaml'), 'agent_mode: guide\n');
      assert.equal(getAgentMode(tmpDir), 'guide');
    });

    it('returns builder when workspace has memory/MEMORY.md and src/cli.ts', () => {
      delete process.env.AGENT_MODE;
      mkdirSync(join(tmpDir, 'memory'), { recursive: true });
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'memory', 'MEMORY.md'), '');
      writeFileSync(join(tmpDir, 'src', 'cli.ts'), '');
      assert.equal(getAgentMode(tmpDir), 'builder');
    });

    it('returns guide when no env, no agent_mode in config, and not build repo', () => {
      delete process.env.AGENT_MODE;
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      assert.equal(getAgentMode(tmpDir), 'guide');
    });

    it('returns guide when workspacePath is null', () => {
      delete process.env.AGENT_MODE;
      assert.equal(getAgentMode(null), 'guide');
    });
  });
});
