/**
 * Tests for src/core/adapters/claude-adapter.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import { ClaudeAdapter } from '../../../src/core/adapters/claude-adapter.js';
import type { CanonicalRule, AreteConfig } from '../../../src/types.js';

// Helper
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-claude-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;
  let tmpDir: string;
  let mockConfig: AreteConfig;

  beforeEach(() => {
    adapter = new ClaudeAdapter();
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
      assert.equal(adapter.target, 'claude');
    });

    it('has correct configDirName', () => {
      assert.equal(adapter.configDirName, '.claude');
    });

    it('has correct ruleExtension', () => {
      assert.equal(adapter.ruleExtension, '.md');
    });
  });

  describe('getIDEDirs', () => {
    it('returns correct array of directories', () => {
      const dirs = adapter.getIDEDirs();
      assert.deepEqual(dirs, [
        '.claude',
        '.claude/rules',
        '.claude/tools',
        '.claude/integrations',
        '.claude/integrations/configs',
      ]);
    });
  });

  describe('rulesDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.rulesDir(), '.claude/rules');
    });
  });

  describe('toolsDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.toolsDir(), '.claude/tools');
    });
  });

  describe('integrationsDir', () => {
    it('returns correct path', () => {
      assert.equal(adapter.integrationsDir(), '.claude/integrations');
    });
  });

  describe('formatRule', () => {
    it('formats rule with alwaysApply and omits globs key', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Test rule description',
        content: 'Rule content here',
        alwaysApply: true,
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('---'));
      assert.ok(result.includes('description: Test rule description'));
      assert.ok(!result.includes('globs'));
      assert.ok(!result.includes('alwaysApply'));
      assert.ok(result.includes('Rule content here'));
    });

    it('formats rule with globs but no alwaysApply', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Test rule with globs',
        content: 'Rule content here',
        globs: ['**/*.ts', '**/*.js'],
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('---'));
      assert.ok(result.includes('description: Test rule with globs'));
      assert.ok(result.includes('globs:'));
      assert.ok(result.includes('- "**/*.ts"'));
      assert.ok(result.includes('- "**/*.js"'));
      assert.ok(result.includes('Rule content here'));
    });

    it('formats globs as multiline YAML array', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Test multiline globs',
        content: 'Content',
        globs: ['**/*.md', '**/*.txt', '**/*.json'],
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('globs:'));
      assert.ok(result.includes('  - "**/*.md"'));
      assert.ok(result.includes('  - "**/*.txt"'));
      assert.ok(result.includes('  - "**/*.json"'));
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
      assert.ok(!result.includes('globs'));
      assert.ok(!result.includes('alwaysApply'));
      assert.ok(result.includes('Rule content here'));
    });

    it('omits globs when alwaysApply is true even if globs are present', () => {
      const rule: CanonicalRule = {
        name: 'test-rule',
        description: 'Rule with both',
        content: 'Rule content here',
        alwaysApply: true,
        globs: ['**/*.md'],
      };

      const result = adapter.formatRule(rule, mockConfig);

      assert.ok(result.includes('description: Rule with both'));
      assert.ok(!result.includes('globs'));
      assert.ok(!result.includes('alwaysApply'));
    });
  });

  describe('transformRuleContent', () => {
    it('replaces .cursor/tools/ with .claude/tools/', () => {
      const content = 'Reference to .cursor/tools/ directory';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.claude/tools/'));
      assert.ok(!result.includes('.cursor/tools/'));
    });

    it('replaces .cursor/integrations/ with .claude/integrations/', () => {
      const content = 'Reference to .cursor/integrations/ directory';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.claude/integrations/'));
      assert.ok(!result.includes('.cursor/integrations/'));
    });

    it('replaces .cursor/rules/ with .claude/rules/', () => {
      const content = 'Reference to .cursor/rules/ directory';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.claude/rules/'));
      assert.ok(!result.includes('.cursor/rules/'));
    });

    it('replaces .cursor/skills/ with .agents/skills/', () => {
      const content = 'Reference to .cursor/skills/ directory';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.agents/skills/'));
      assert.ok(!result.includes('.cursor/skills/'));
    });

    it('replaces multiple paths in same content', () => {
      const content = 'See .cursor/tools/ and .cursor/rules/ and .cursor/integrations/';
      const result = adapter.transformRuleContent(content);
      assert.ok(result.includes('.claude/tools/'));
      assert.ok(result.includes('.claude/rules/'));
      assert.ok(result.includes('.claude/integrations/'));
      assert.ok(!result.includes('.cursor/'));
    });

    it('does not modify other content', () => {
      const content = 'Some other content without cursor paths';
      const result = adapter.transformRuleContent(content);
      assert.equal(result, content);
    });
  });

  describe('generateRootFiles', () => {
    it('produces CLAUDE.md with all required sections', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);

      assert.ok(result['CLAUDE.md']);
      const claudeMd = result['CLAUDE.md'];

      // Check for all 7 sections mentioned in the docstring
      assert.ok(claudeMd.includes('# Areté - Product Builder\'s Operating System'));
      assert.ok(claudeMd.includes('⚠️ CRITICAL: Skill-Based Workflow (Mandatory)'));
      assert.ok(claudeMd.includes('## Workspace Structure'));
      assert.ok(claudeMd.includes('## Agent Mode: BUILDER vs GUIDE'));
      assert.ok(claudeMd.includes('## Memory Management'));
      assert.ok(claudeMd.includes('## Key CLI Commands'));
      assert.ok(claudeMd.includes('## Version Information'));
    });

    it('includes routing workflow in section 2', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      // Key phrases from routing workflow
      assert.ok(claudeMd.includes('🛑 STOP'));
      assert.ok(claudeMd.includes('Is this a PM action'));
      assert.ok(claudeMd.includes('arete skill route'));
      assert.ok(claudeMd.includes('ROUTE (MANDATORY)'));
      assert.ok(claudeMd.includes('LOAD (MANDATORY)'));
      assert.ok(claudeMd.includes('EXECUTE (MANDATORY)'));
    });

    it('includes workspace structure with .claude references', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      // In the workspace structure tree, .claude/ appears as a directory
      // and its subdirectories (rules, tools, integrations) appear below it
      assert.ok(claudeMd.includes('.claude/'));
      assert.ok(claudeMd.includes('├── .claude/'));
      assert.ok(claudeMd.includes('rules/') && claudeMd.includes('.claude/'));
      assert.ok(claudeMd.includes('tools/') && claudeMd.includes('.claude/'));
      assert.ok(claudeMd.includes('integrations/') && claudeMd.includes('.claude/'));
    });

    it('includes version and timestamp', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      assert.ok(claudeMd.includes('Generated by Areté v1.0.0'));
      assert.ok(claudeMd.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)); // ISO timestamp
    });

    it('includes BUILDER vs GUIDE mode detection', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      assert.ok(claudeMd.includes('BUILDER'));
      assert.ok(claudeMd.includes('GUIDE'));
      assert.ok(claudeMd.includes('agent_mode'));
    });

    it('includes memory management section', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      assert.ok(claudeMd.includes('L1 Resources'));
      assert.ok(claudeMd.includes('L2 Items'));
      assert.ok(claudeMd.includes('L3 Summaries'));
      assert.ok(claudeMd.includes('decisions.md'));
      assert.ok(claudeMd.includes('learnings.md'));
    });

    it('includes key CLI commands', () => {
      const result = adapter.generateRootFiles(mockConfig, tmpDir);
      const claudeMd = result['CLAUDE.md'];

      assert.ok(claudeMd.includes('arete route'));
      assert.ok(claudeMd.includes('arete skill route'));
      assert.ok(claudeMd.includes('arete brief'));
      assert.ok(claudeMd.includes('arete context'));
      assert.ok(claudeMd.includes('arete memory search'));
      assert.ok(claudeMd.includes('arete resolve'));
    });
  });

  describe('detectInWorkspace', () => {
    it('returns true when .claude directory exists', () => {
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });

      const result = adapter.detectInWorkspace(tmpDir);
      assert.equal(result, true);
    });

    it('returns false when .claude directory does not exist', () => {
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
