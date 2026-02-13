/**
 * Tests for src/core/adapters/cursor-adapter.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import { CursorAdapter } from '../../../src/core/adapters/cursor-adapter.js';
import type { CanonicalRule, AreteConfig } from '../../../src/types.js';

// Helper
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-cursor-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('CursorAdapter', () => {
  let adapter: CursorAdapter;
  let tmpDir: string;
  let mockConfig: AreteConfig;

  beforeEach(() => {
    adapter = new CursorAdapter();
    tmpDir = createTmpDir();
    mockConfig = {
      schema: 1,
      version: '1.0.0',
    };
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('properties', () => {
    it('has correct target', () => {
      assert.equal(adapter.target, 'cursor');
    });

    it('has correct configDirName', () => {
      assert.equal(adapter.configDirName, '.cursor');
    });

    it('has correct ruleExtension', () => {
      assert.equal(adapter.ruleExtension, '.mdc');
    });
  });

  describe('getIDEDirs', () => {
    it('returns correct array of directories', () => {
      const dirs = adapter.getIDEDirs();
      assert.deepEqual(dirs, [
        '.cursor',
        '.cursor/rules',
        '.cursor/tools',
        '.cursor/integrations',
        '.cursor/integrations/configs',
      ]);
    });
  });

  describe('rulesDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.rulesDir(), '.cursor/rules');
    });
  });

  describe('toolsDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.toolsDir(), '.cursor/tools');
    });
  });

  describe('integrationsDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.integrationsDir(), '.cursor/integrations');
    });
  });

  describe('formatRule', () => {
    it('formats rule with alwaysApply', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Test rule description',
        content: 'Rule content here',
        alwaysApply: true,
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('---'));
      assert.ok(result.includes('description: Test rule description'));
      assert.ok(result.includes('alwaysApply: true'));
      assert.ok(result.includes('Rule content here'));
    });

    it('formats rule with globs', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Test rule with globs',
        content: 'Rule content here',
        globs: ['**/*.ts', '**/*.js'],
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('---'));
      assert.ok(result.includes('description: Test rule with globs'));
      assert.ok(result.includes('globs: ["**/*.ts","**/*.js"]'));
      assert.ok(result.includes('Rule content here'));
    });

    it('formats rule with neither alwaysApply nor globs', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Simple rule',
        content: 'Rule content here',
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('---'));
      assert.ok(result.includes('description: Simple rule'));
      assert.ok(!result.includes('alwaysApply'));
      assert.ok(!result.includes('globs'));
      assert.ok(result.includes('Rule content here'));
    });

    it('formats rule with both alwaysApply and globs', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Rule with both',
        content: 'Rule content here',
        alwaysApply: true,
        globs: ['**/*.md'],
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('description: Rule with both'));
      assert.ok(result.includes('globs: ["**/*.md"]'));
      assert.ok(result.includes('alwaysApply: true'));
    });
  });

  describe('transformRuleContent', () => {
    it('returns content unchanged', () => {
      const content = 'Some rule content with .cursor/ paths and other stuff';
      const result = adapter.transformRuleContent(content);
      assert.equal(result, content);
    });

    it('does not modify .cursor paths', () => {
      const content = 'Reference to .cursor/rules/ and .cursor/tools/';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.cursor/rules/'));
      assert.ok(result.includes('.cursor/tools/'));
    });
  });

  describe('generateRootFiles', () => {
    it('produces AGENTS.md with all required sections', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);

      assert.ok(result['AGENTS.md']);
      const agentsMd = result['AGENTS.md'];

      // Check required sections
      assert.ok(agentsMd.includes('# Areté - Product Builder\'s Operating System'));
      assert.ok(agentsMd.includes('⚠️ CRITICAL: Skill-Based Workflow'));
      assert.ok(agentsMd.includes('## Workspace Structure'));
      assert.ok(agentsMd.includes('## Key CLI Commands'));
      assert.ok(agentsMd.includes('## Full Rules'));
      assert.ok(agentsMd.includes('## Version Information'));
    });

    it('includes routing workflow content', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const agentsMd = result['AGENTS.md'];

      // Should include routing instructions (either from file or fallback)
      assert.ok(agentsMd.includes('ROUTE'));
      assert.ok(agentsMd.includes('arete skill route'));
    });

    it('includes version and timestamp', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const agentsMd = result['AGENTS.md'];

      assert.ok(agentsMd.includes('v1.0.0'));
      // Check timestamp format (ISO string)
      assert.ok(/Generated by Areté v\d+\.\d+\.\d+ on \d{4}-\d{2}-\d{2}T/.test(agentsMd));
    });

    it('includes workspace structure diagram', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const agentsMd = result['AGENTS.md'];

      assert.ok(agentsMd.includes('now/'));
      assert.ok(agentsMd.includes('goals/'));
      assert.ok(agentsMd.includes('context/'));
      assert.ok(agentsMd.includes('.cursor/'));
    });

    it('includes key CLI commands', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const agentsMd = result['AGENTS.md'];

      assert.ok(agentsMd.includes('arete route'));
      assert.ok(agentsMd.includes('arete brief'));
      assert.ok(agentsMd.includes('arete memory search'));
    });

    it('references .cursor/rules/ for full rules', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const agentsMd = result['AGENTS.md'];

      assert.ok(agentsMd.includes('.cursor/rules/'));
      assert.ok(agentsMd.includes('pm-workspace.mdc'));
    });
  });

  describe('detectInWorkspace', () => {
    it('returns true when .cursor directory exists', () => {
      const cursorDir = join(tmpDir, '.cursor');
      mkdirSync(cursorDir, { recursive: true });

      const result = adapter.detectInWorkspace(tmpDir);
      assert.equal(result, true);
    });

    it('returns false when .cursor directory does not exist', () => {
      const result = adapter.detectInWorkspace(tmpDir);
      assert.equal(result, false);
    });

    it('returns false for empty directory', () => {
      const emptyDir = createTmpDir();
      const result = adapter.detectInWorkspace(emptyDir);
      assert.equal(result, false);
      rmSync(emptyDir, { recursive: true, force: true });
    });
  });
});
