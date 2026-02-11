/**
 * Tests for src/commands/status.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { installCommand } from '../../src/commands/install.js';
import { statusCommand } from '../../src/commands/status.js';

function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('ide_target path resolution', () => {
    it('uses adapter from config so ide_target is respected when both .cursor and .claude exist', async () => {
      // Install Cursor workspace so .cursor/ exists (detectAdapter would pick it first)
      await installCommand(tmpDir, { json: true, ide: 'cursor' });

      // Create .claude/ and put an integration config only there
      const claudeConfigsDir = join(tmpDir, '.claude', 'integrations', 'configs');
      mkdirSync(claudeConfigsDir, { recursive: true });
      writeFileSync(
        join(claudeConfigsDir, 'fathom.yaml'),
        'name: Fathom\nstatus: active\ntype: meetings\n',
        'utf8'
      );

      // Set ide_target to claude so status must use .claude paths
      const configPath = join(tmpDir, 'arete.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      config.ide_target = 'claude';
      writeFileSync(configPath, stringifyYaml(config), 'utf8');

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured = String(args[0]);
      };

      const originalCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        await statusCommand({ json: true });
      } finally {
        process.chdir(originalCwd);
        console.log = originalLog;
      }

      const result = JSON.parse(captured);
      assert.equal(result.success, true);
      assert.equal(result.workspace.ide, 'claude');
      // Paths must come from Claude adapter: integration configs read from .claude/integrations/configs/
      assert.ok(Array.isArray(result.integrations), 'integrations should be an array');
      assert.equal(result.integrations.length, 1, 'should find the integration in .claude/integrations/configs/');
      assert.equal(result.integrations[0].name, 'Fathom');
      assert.equal(result.integrations[0].status, 'active');
    });
  });
});
