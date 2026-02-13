/**
 * Tests for src/core/rule-transpiler.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync, cpSync } from 'fs';
import { tmpdir } from 'os';

import {
  parseRule,
  transpileRule,
  transpileRules,
} from '../../src/core/rule-transpiler.js';
import { CursorAdapter, ClaudeAdapter } from '../../src/core/adapters/index.js';
import { PRODUCT_RULES_ALLOW_LIST } from '../../src/core/workspace-structure.js';
import type { AreteConfig } from '../../src/types.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-transpiler-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getWorkspaceRoot(): string {
  // Navigate up from test/core/ to workspace root
  return join(import.meta.dirname, '..', '..');
}

function getRuntimeRulesPath(): string {
  return join(getWorkspaceRoot(), 'runtime', 'rules');
}

const mockConfig: AreteConfig = {
  schema: 1,
  version: '1.0.0',
  source: 'npm',
};

describe('rule-transpiler', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('parseRule', () => {
    it('parses routing-mandatory.mdc with alwaysApply and globs', () => {
      const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
      const parsed = parseRule(rulePath);

      assert.equal(parsed.name, 'routing-mandatory');
      assert.equal(parsed.frontmatter.alwaysApply, true);
      assert.ok(Array.isArray(parsed.frontmatter.globs));
      assert.equal(parsed.frontmatter.globs?.length, 1);
      assert.equal(parsed.frontmatter.globs?.[0], '**/*');
      assert.ok(parsed.frontmatter.description);
      assert.ok(parsed.content.includes('🛑 STOP - READ THIS FIRST'));
    });

    it('parses pm-workspace.mdc with description', () => {
      const rulePath = join(getRuntimeRulesPath(), 'pm-workspace.mdc');
      const parsed = parseRule(rulePath);

      assert.equal(parsed.name, 'pm-workspace');
      assert.ok(parsed.frontmatter.description);
      // Description should be present
      assert.ok(parsed.frontmatter.description.length > 10);
      assert.equal(parsed.frontmatter.alwaysApply, true);
      // Content should include the main heading
      assert.ok(parsed.content.includes('Product Management Workspace') || parsed.content.includes('# Areté'));
    });

    it('parses qmd-search.mdc with globs but no alwaysApply', () => {
      const rulePath = join(getRuntimeRulesPath(), 'qmd-search.mdc');
      const parsed = parseRule(rulePath);

      assert.equal(parsed.name, 'qmd-search');
      assert.ok(parsed.frontmatter.description);
      assert.ok(Array.isArray(parsed.frontmatter.globs));
      assert.equal(parsed.frontmatter.globs?.length, 1);
      // alwaysApply should be undefined or false (not explicitly true)
      assert.notEqual(parsed.frontmatter.alwaysApply, true);
    });

    it('parses agent-memory.mdc without frontmatter', () => {
      const rulePath = join(getRuntimeRulesPath(), 'agent-memory.mdc');
      
      // agent-memory.mdc has no frontmatter, so we test that parseRule handles it
      // by checking if content is present
      const parsed = parseRule(rulePath);

      assert.equal(parsed.name, 'agent-memory');
      assert.ok(parsed.content.includes('Agent Memory Management') || parsed.content.includes('Memory'));
      // Without frontmatter, these should be undefined or empty
      assert.equal(parsed.frontmatter.description, undefined);
    });

    it('parses all 8 rules in PRODUCT_RULES_ALLOW_LIST without errors', () => {
      const runtimeRulesPath = getRuntimeRulesPath();
      
      for (const ruleFile of PRODUCT_RULES_ALLOW_LIST) {
        const rulePath = join(runtimeRulesPath, ruleFile);
        
        // Verify file exists
        assert.ok(existsSync(rulePath), `Rule file ${ruleFile} should exist`);
        
        // Parse should not throw
        const parsed = parseRule(rulePath);
        
        // Basic structure checks
        assert.ok(parsed.name, `Rule ${ruleFile} should have a name`);
        assert.ok(parsed.content, `Rule ${ruleFile} should have content`);
        assert.ok(typeof parsed.frontmatter === 'object', `Rule ${ruleFile} should have frontmatter object`);
      }
    });

    it('extracts frontmatter fields correctly', () => {
      const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
      const parsed = parseRule(rulePath);

      // Verify frontmatter has expected structure
      assert.ok(typeof parsed.frontmatter === 'object');
      assert.ok(parsed.frontmatter.description);
      assert.ok(Array.isArray(parsed.frontmatter.globs));
      assert.equal(parsed.frontmatter.alwaysApply, true);
    });

    it('extracts content without frontmatter metadata', () => {
      const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
      const parsed = parseRule(rulePath);

      // Content should not include frontmatter metadata keys
      assert.ok(!parsed.content.includes('description:'));
      assert.ok(!parsed.content.includes('globs:'));
      assert.ok(!parsed.content.includes('alwaysApply:'));
      
      // Content should start with the actual rule content
      assert.ok(parsed.content.startsWith('#'));
      
      // Note: Content may still include --- as horizontal rules in markdown
    });

    it('handles rule without frontmatter', () => {
      // Create a temporary rule file without frontmatter
      const testRulePath = join(tmpDir, 'no-frontmatter.mdc');
      writeFileSync(testRulePath, '# Test Rule\n\nThis is a test rule without frontmatter.');

      const parsed = parseRule(testRulePath);

      assert.equal(parsed.name, 'no-frontmatter');
      assert.deepEqual(parsed.frontmatter, {});
      assert.ok(parsed.content.includes('# Test Rule'));
    });
  });

  describe('transpileRule', () => {
    describe('CursorAdapter', () => {
      const adapter = new CursorAdapter();

      it('produces valid .mdc frontmatter format', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Should produce .mdc extension
        assert.ok(result.filename.endsWith('.mdc'));
        assert.equal(result.filename, 'routing-mandatory.mdc');

        // Should have YAML frontmatter
        assert.ok(result.content.includes('---'));
        assert.ok(result.content.includes('description:'));
      });

      it('includes description in frontmatter', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Description should be in frontmatter section
        const frontmatterMatch = result.content.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        assert.ok(frontmatterMatch[1].includes('description:'));
      });

      it('includes globs when present', () => {
        const rulePath = join(getRuntimeRulesPath(), 'qmd-search.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Globs should be in frontmatter
        const frontmatterMatch = result.content.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        assert.ok(frontmatterMatch[1].includes('globs:'));
      });

      it('includes alwaysApply when true', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // alwaysApply should be in frontmatter
        const frontmatterMatch = result.content.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        assert.ok(frontmatterMatch[1].includes('alwaysApply: true'));
      });

      it('starts with frontmatter', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Should start directly with YAML frontmatter (no auto-generated header)
        assert.ok(result.content.startsWith('---\n'));
      });

      it('preserves rule content after frontmatter', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Content should be present after frontmatter
        assert.ok(result.content.includes('🛑 STOP - READ THIS FIRST'));
      });
    });

    describe('ClaudeAdapter', () => {
      const adapter = new ClaudeAdapter();

      it('produces valid .md frontmatter format', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Should produce .md extension
        assert.ok(result.filename.endsWith('.md'));
        assert.equal(result.filename, 'routing-mandatory.md');

        // Should have YAML frontmatter
        assert.ok(result.content.includes('---'));
        assert.ok(result.content.includes('description:'));
      });

      it('omits globs key when alwaysApply is true', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Frontmatter should not include globs when alwaysApply is true
        const frontmatterMatch = result.content.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        assert.ok(!frontmatterMatch[1].includes('globs:'));
      });

      it('includes globs when alwaysApply is not true', () => {
        const rulePath = join(getRuntimeRulesPath(), 'qmd-search.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Globs should be included when alwaysApply is not true
        const frontmatterMatch = result.content.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        assert.ok(frontmatterMatch[1].includes('globs:'));
      });

      it('starts with frontmatter', () => {
        const rulePath = join(getRuntimeRulesPath(), 'routing-mandatory.mdc');
        const parsed = parseRule(rulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Should start directly with YAML frontmatter (no auto-generated header)
        assert.ok(result.content.startsWith('---\n'));
      });

      it('transforms .cursor/ paths to .claude/', () => {
        // Create a test rule with .cursor/ references
        const testRulePath = join(tmpDir, 'test-paths.mdc');
        writeFileSync(testRulePath, `---
description: Test path transformations
---

# Test Rule

References to .cursor/tools/ and .cursor/integrations/ and .cursor/rules/ and .cursor/skills/`);

        const parsed = parseRule(testRulePath);
        const result = transpileRule(parsed, adapter, mockConfig);

        // Verify path transformations
        assert.ok(result.content.includes('.claude/tools/'));
        assert.ok(result.content.includes('.claude/integrations/'));
        assert.ok(result.content.includes('.claude/rules/'));
        assert.ok(result.content.includes('.agents/skills/'));
        
        // Original .cursor/ paths should be gone
        assert.ok(!result.content.includes('.cursor/tools/'));
        assert.ok(!result.content.includes('.cursor/integrations/'));
        assert.ok(!result.content.includes('.cursor/rules/'));
        assert.ok(!result.content.includes('.cursor/skills/'));
      });
    });
  });

  describe('transpileRules', () => {
    let srcDir: string;
    let destDir: string;

    beforeEach(() => {
      srcDir = join(tmpDir, 'src');
      destDir = join(tmpDir, 'dest');
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(destDir, { recursive: true });

      // Copy PRODUCT_RULES_ALLOW_LIST files to temp src directory
      const runtimeRulesPath = getRuntimeRulesPath();
      for (const ruleFile of PRODUCT_RULES_ALLOW_LIST) {
        const srcPath = join(runtimeRulesPath, ruleFile);
        const destPath = join(srcDir, ruleFile);
        cpSync(srcPath, destPath);
      }
    });

    describe('with CursorAdapter', () => {
      const adapter = new CursorAdapter();

      it('creates 8 .mdc files in destination', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Verify 8 files were added
        assert.equal(results.added.length, 8);

        // Verify all files exist and have .mdc extension
        const destFiles = readdirSync(destDir);
        assert.equal(destFiles.length, 8);
        
        for (const file of destFiles) {
          assert.ok(file.endsWith('.mdc'), `File ${file} should have .mdc extension`);
        }
      });

      it('transpiles all rules in allowList', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Verify each rule in allowList was transpiled
        for (const ruleFile of PRODUCT_RULES_ALLOW_LIST) {
          const expectedName = ruleFile.replace('.mdc', '');
          const expectedFile = `${expectedName}.mdc`;
          const expectedPath = join(destDir, expectedFile);
          
          assert.ok(existsSync(expectedPath), `Transpiled file ${expectedFile} should exist`);
          
          // Verify content starts with frontmatter (no auto-generated header)
          const content = readFileSync(expectedPath, 'utf-8');
          assert.ok(content.startsWith('---\n'), `${expectedFile} should start with YAML frontmatter`);
        }
      });

      it('returns correct SyncResults', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Initial run: 8 added, 0 removed
        assert.equal(results.added.length, 8);
        assert.equal(results.updated.length, 0);
        assert.equal(results.removed.length, 0);
        assert.equal(results.preserved.length, 0);
      });

      it('removes existing files on re-run', () => {
        // First run
        const results1 = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);
        assert.equal(results1.added.length, 8);
        assert.equal(results1.removed.length, 0);

        // Second run - should remove 8 old files and add 8 new ones
        const results2 = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);
        assert.equal(results2.removed.length, 8);
        assert.equal(results2.added.length, 8);
      });

      it('only processes files in allowList', () => {
        // Add a file not in allowList
        const extraRulePath = join(srcDir, 'extra-rule.mdc');
        writeFileSync(extraRulePath, `---
description: Extra rule not in allowList
---

# Extra Rule

This should not be transpiled.`);

        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Should still only transpile 8 files (not 9)
        assert.equal(results.added.length, 8);
        
        // Extra rule should not exist in destination
        const extraDestPath = join(destDir, 'extra-rule.mdc');
        assert.ok(!existsSync(extraDestPath), 'Extra rule should not be transpiled');
      });

      it('handles missing source directory', () => {
        const nonExistentSrc = join(tmpDir, 'nonexistent');
        const results = transpileRules(nonExistentSrc, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Should return empty results without throwing
        assert.equal(results.added.length, 0);
        assert.equal(results.removed.length, 0);
      });

      it('does not delete destination rules when source directory is missing', () => {
        // Pre-populate dest with a rule file
        const existingRulePath = join(destDir, 'routing-mandatory.mdc');
        writeFileSync(existingRulePath, '<!-- existing -->\n# Existing rule content');

        const nonExistentSrc = join(tmpDir, 'nonexistent');
        const results = transpileRules(nonExistentSrc, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Should not delete or add anything
        assert.equal(results.added.length, 0);
        assert.equal(results.removed.length, 0);
        // Pre-existing file must remain
        assert.ok(existsSync(existingRulePath), 'Existing rules must not be deleted when source is missing');
      });
    });

    describe('with ClaudeAdapter', () => {
      const adapter = new ClaudeAdapter();

      it('creates 8 .md files in destination', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Verify 8 files were added
        assert.equal(results.added.length, 8);

        // Verify all files exist and have .md extension
        const destFiles = readdirSync(destDir);
        assert.equal(destFiles.length, 8);
        
        for (const file of destFiles) {
          assert.ok(file.endsWith('.md'), `File ${file} should have .md extension`);
        }
      });

      it('transpiles with Claude-specific formatting', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Check routing-mandatory.md (alwaysApply: true)
        const routingPath = join(destDir, 'routing-mandatory.md');
        assert.ok(existsSync(routingPath));
        
        const routingContent = readFileSync(routingPath, 'utf-8');
        
        // Should have frontmatter
        const frontmatterMatch = routingContent.match(/---\n([\s\S]*?)\n---/);
        assert.ok(frontmatterMatch);
        
        // Should NOT have globs key (alwaysApply is true)
        assert.ok(!frontmatterMatch[1].includes('globs:'));
      });

      it('returns correct SyncResults', () => {
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Initial run: 8 added, 0 removed
        assert.equal(results.added.length, 8);
        assert.equal(results.updated.length, 0);
        assert.equal(results.removed.length, 0);
        assert.equal(results.preserved.length, 0);
      });
    });

    describe('allowList filtering', () => {
      it('only transpiles files in allowList', () => {
        const adapter = new CursorAdapter();
        
        // Create extra files not in allowList
        writeFileSync(join(srcDir, 'extra-1.mdc'), '# Extra 1');
        writeFileSync(join(srcDir, 'extra-2.mdc'), '# Extra 2');
        
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Should only transpile the 8 files in allowList
        assert.equal(results.added.length, 8);
        
        const destFiles = readdirSync(destDir);
        assert.equal(destFiles.length, 8);
        
        // Verify extra files were not transpiled
        assert.ok(!existsSync(join(destDir, 'extra-1.mdc')));
        assert.ok(!existsSync(join(destDir, 'extra-2.mdc')));
      });

      it('skips non-.mdc files', () => {
        const adapter = new CursorAdapter();
        
        // Create a non-.mdc file
        writeFileSync(join(srcDir, 'README.md'), '# README');
        
        const results = transpileRules(srcDir, destDir, adapter, mockConfig, PRODUCT_RULES_ALLOW_LIST);

        // Should only transpile .mdc files
        assert.equal(results.added.length, 8);
        
        // README should not be in destination
        assert.ok(!existsSync(join(destDir, 'README.md')));
      });
    });
  });
});
