/**
 * Ported tests for install command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('install command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-install');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('arete.yaml manifest', () => {
    it('creates valid YAML with schema and ide_target', () => {
      runCli(['install', tmpDir, '--json']);

      const manifestPath = join(tmpDir, 'arete.yaml');
      const content = readFileSync(manifestPath, 'utf8');
      const parsed = parseYaml(content);

      assert.equal(typeof parsed, 'object', 'Should parse as valid YAML object');
      assert.equal(parsed.schema, 1, 'Should have schema version');
      assert.ok(['cursor', 'claude'].includes(parsed.ide_target), 'Should have ide_target');
    });
  });

  describe('multi-IDE support', () => {
    describe('Cursor target', () => {
      it('creates Cursor workspace structure with --ide cursor', () => {
        runCli(['install', tmpDir, '--json', '--ide', 'cursor']);

        assert.ok(existsSync(join(tmpDir, '.cursor')), '.cursor directory should exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'rules')), '.cursor/rules directory should exist');
        const parsed = parseYaml(readFileSync(join(tmpDir, 'arete.yaml'), 'utf8'));
        assert.equal(parsed.ide_target, 'cursor', 'ide_target should be cursor');
      });

      it('creates rules directory with AGENTS.md', () => {
        runCli(['install', tmpDir, '--json', '--ide', 'cursor']);

        assert.ok(existsSync(join(tmpDir, '.cursor', 'rules')), 'Rules directory should exist');
        const agentsPath = join(tmpDir, 'AGENTS.md');
        assert.ok(existsSync(agentsPath), 'AGENTS.md should exist');
        const agentsContent = readFileSync(agentsPath, 'utf8');
        assert.ok(agentsContent.includes('Areté'), 'AGENTS.md should have Areté content');
      });
    });

    describe('Claude target', () => {
      it('creates Claude workspace structure with --ide claude', () => {
        runCli(['install', tmpDir, '--json', '--ide', 'claude']);

        assert.ok(existsSync(join(tmpDir, '.claude')), '.claude directory should exist');
        const parsed = parseYaml(readFileSync(join(tmpDir, 'arete.yaml'), 'utf8'));
        assert.equal(parsed.ide_target, 'claude', 'ide_target should be claude');
      });
    });
  });

  describe('workspace structure', () => {
    it('creates base directories (context, projects, people)', () => {
      runCli(['install', tmpDir, '--json']);

      assert.ok(existsSync(join(tmpDir, 'context')), 'context/ should exist');
      assert.ok(existsSync(join(tmpDir, 'projects')), 'projects/ should exist');
      assert.ok(existsSync(join(tmpDir, 'people')), 'people/ should exist');
    });
  });
});
