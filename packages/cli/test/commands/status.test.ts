/**
 * Ported tests for status command — ide_target path resolution
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import {
  runCli,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-status');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('ide_target path resolution', () => {
    it('uses adapter from config so ide_target is respected when both .cursor and .claude exist', async () => {
      runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);

      const claudeConfigsDir = join(
        tmpDir,
        '.claude',
        'integrations',
        'configs',
      );
      mkdirSync(claudeConfigsDir, { recursive: true });
      writeFileSync(
        join(claudeConfigsDir, 'fathom.yaml'),
        'name: Fathom\nstatus: active\ntype: meetings\n',
        'utf8',
      );

      const configPath = join(tmpDir, 'arete.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<
        string,
        unknown
      >;
      config.ide_target = 'claude';
      writeFileSync(configPath, stringifyYaml(config), 'utf8');

      const stdout = runCli(['status', '--json'], { cwd: tmpDir });
      const result = JSON.parse(stdout);
      assert.equal(result.success, true);
      assert.equal(result.workspace.ide, 'claude');
      assert.ok(
        Array.isArray(result.integrations),
        'integrations should be an array',
      );
      assert.equal(
        result.integrations.length,
        1,
        'should find the integration in .claude/integrations/configs/',
      );
      assert.equal(result.integrations[0].name, 'Fathom');
      assert.equal(result.integrations[0].status, 'active');
    });
  });
});
