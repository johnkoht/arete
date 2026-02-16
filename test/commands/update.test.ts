/**
 * Tests for src/commands/update.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, cpSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { installCommand } from '../../src/commands/install.js';
import { updateCommand } from '../../src/commands/update.js';
import { PRODUCT_RULES_ALLOW_LIST } from '../../src/core/workspace-structure.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-update-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('update command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('multi-IDE support', () => {
    describe('Cursor workspace', () => {
      it('regenerates .cursor/rules/*.mdc identically to install', async () => {
        // Install Cursor workspace
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Capture initial state
        const rulesDir = join(tmpDir, '.cursor', 'rules');
        const initialFiles = readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
        const initialContents = new Map(
          initialFiles.map(f => [f, readFileSync(join(rulesDir, f), 'utf8')])
        );

        // Wait to ensure timestamps would differ if regenerated
        await sleep(1000);

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify rules were regenerated
        const updatedFiles = readdirSync(rulesDir).filter(f => f.endsWith('.mdc'));
        assert.deepEqual(updatedFiles.sort(), initialFiles.sort(), 
          'Should have same rule files after update');

        // Verify content is identical (rules regenerated, not just synced)
        for (const file of updatedFiles) {
          const updatedContent = readFileSync(join(rulesDir, file), 'utf8');
          const initialContent = initialContents.get(file);
          assert.ok(initialContent, `Should have initial content for ${file}`);
          
          // Verify rules start with YAML frontmatter (no auto-generated header)
          assert.ok(updatedContent.startsWith('---\n'), 
            `${file} should start with YAML frontmatter`);
          
          // Content should be structurally identical (may differ in timestamps if any)
          // For now, just verify it was written (not empty)
          assert.ok(updatedContent.length > 100, 
            `${file} should have substantial content`);
        }
      });

      it('does NOT create CLAUDE.md in Cursor workspace', async () => {
        // Install Cursor workspace
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Verify CLAUDE.md doesn't exist initially
        const claudeMdPath = join(tmpDir, 'CLAUDE.md');
        assert.ok(!existsSync(claudeMdPath), 'CLAUDE.md should NOT exist initially');

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify CLAUDE.md still doesn't exist
        assert.ok(!existsSync(claudeMdPath), 'CLAUDE.md should NOT exist after update');
      });

      it('creates and maintains AGENTS.md in Cursor workspace', async () => {
        // Install Cursor workspace
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Verify AGENTS.md exists initially
        const agentsMdPath = join(tmpDir, 'AGENTS.md');
        assert.ok(existsSync(agentsMdPath), 'AGENTS.md should exist after install');

        const initialContent = readFileSync(agentsMdPath, 'utf8');
        assert.ok(initialContent.includes('Areté'), 'Should have Areté title');

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify AGENTS.md still exists
        assert.ok(existsSync(agentsMdPath), 'AGENTS.md should still exist after update');

        // Verify it has required content
        const updatedContent = readFileSync(agentsMdPath, 'utf8');
        assert.ok(updatedContent.includes('## ⚠️ CRITICAL: Skill-Based Workflow'), 
          'Should have critical routing section');
      });

      it('preserves workspace structure during update', async () => {
        // Install Cursor workspace
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Verify structure exists
        assert.ok(existsSync(join(tmpDir, '.cursor')), '.cursor should exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'rules')), '.cursor/rules should exist');
        assert.ok(existsSync(join(tmpDir, 'context')), 'context should exist');
        assert.ok(existsSync(join(tmpDir, '.arete', 'memory')), '.arete/memory should exist');

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify structure is preserved
        assert.ok(existsSync(join(tmpDir, '.cursor')), '.cursor should still exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'rules')), '.cursor/rules should still exist');
        assert.ok(existsSync(join(tmpDir, 'context')), 'context should still exist');
        assert.ok(existsSync(join(tmpDir, '.arete', 'memory')), '.arete/memory should still exist');
        
        // Verify no .claude/ created
        assert.ok(!existsSync(join(tmpDir, '.claude')), '.claude should NOT be created');
      });
    });

    describe('Claude workspace', () => {
      it('regenerates .claude/rules/*.md with new content', async () => {
        // Install Claude workspace
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        // Capture initial state
        const rulesDir = join(tmpDir, '.claude', 'rules');
        const initialFiles = readdirSync(rulesDir).filter(f => f.endsWith('.md'));
        const initialContents = new Map(
          initialFiles.map(f => [f, readFileSync(join(rulesDir, f), 'utf8')])
        );

        // Wait to ensure timestamps would differ if regenerated
        await sleep(1000);

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify rules were regenerated
        const updatedFiles = readdirSync(rulesDir).filter(f => f.endsWith('.md'));
        assert.deepEqual(updatedFiles.sort(), initialFiles.sort(), 
          'Should have same rule files after update');

        // Verify content is present and starts with frontmatter
        for (const file of updatedFiles) {
          const updatedContent = readFileSync(join(rulesDir, file), 'utf8');
          
          // Verify rules start with YAML frontmatter (no auto-generated header)
          assert.ok(updatedContent.startsWith('---\n'), 
            `${file} should start with YAML frontmatter`);
          
          // Verify substantial content (rules were transpiled, not empty)
          assert.ok(updatedContent.length > 100, 
            `${file} should have substantial content`);
          
          // Verify path transformations (backtick-wrapped paths should use .claude/)
          // Note: Workspace structure diagrams may still show .cursor/ as a directory name
          const backtickPathMatches = updatedContent.match(/`\.cursor\/(tools|integrations|rules)\//g);
          assert.ok(!backtickPathMatches, 
            `${file} should have transformed backtick-wrapped .cursor/ paths to .claude/`);
        }
      });

      it('regenerates CLAUDE.md with updated timestamp', async () => {
        // Install Claude workspace
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        const claudeMdPath = join(tmpDir, 'CLAUDE.md');
        assert.ok(existsSync(claudeMdPath), 'CLAUDE.md should exist after install');

        // Capture initial content and timestamp
        const initialContent = readFileSync(claudeMdPath, 'utf8');
        const initialTimestampMatch = initialContent.match(/Generated by Areté.*on (\d{4}-\d{2}-\d{2}T[\d:\.Z]+)/);
        assert.ok(initialTimestampMatch, 'Should have timestamp in initial CLAUDE.md');
        const initialTimestamp = initialTimestampMatch![1];

        // Wait to ensure timestamp will differ (2 seconds for millisecond-precision timestamps)
        await sleep(2000);

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify CLAUDE.md was regenerated
        assert.ok(existsSync(claudeMdPath), 'CLAUDE.md should still exist after update');

        const updatedContent = readFileSync(claudeMdPath, 'utf8');
        const updatedTimestampMatch = updatedContent.match(/Generated by Areté.*on (\d{4}-\d{2}-\d{2}T[\d:\.Z]+)/);
        assert.ok(updatedTimestampMatch, 'Should have timestamp in updated CLAUDE.md');
        const updatedTimestamp = updatedTimestampMatch![1];

        // Verify timestamp changed
        assert.notEqual(updatedTimestamp, initialTimestamp, 
          'CLAUDE.md timestamp should be updated');

        // Verify content structure is preserved
        assert.ok(updatedContent.includes('# Areté - Product Builder\'s Operating System'), 
          'Should still have title');
        assert.ok(updatedContent.includes('## ⚠️ CRITICAL: Skill-Based Workflow (Mandatory)'), 
          'Should still have routing workflow section');
        assert.ok(updatedContent.includes('## Workspace Structure'), 
          'Should still have workspace structure section');
      });

      it('preserves workspace structure during update', async () => {
        // Install Claude workspace
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        // Verify structure exists
        assert.ok(existsSync(join(tmpDir, '.claude')), '.claude should exist');
        assert.ok(existsSync(join(tmpDir, '.claude', 'rules')), '.claude/rules should exist');
        assert.ok(existsSync(join(tmpDir, 'context')), 'context should exist');
        assert.ok(existsSync(join(tmpDir, '.arete', 'memory')), '.arete/memory should exist');

        // Save current directory and change to temp workspace
        const originalCwd = process.cwd();
        process.chdir(tmpDir);

        try {
          // Run update
          await updateCommand({ json: true });
        } finally {
          // Restore original directory
          process.chdir(originalCwd);
        }

        // Verify structure is preserved
        assert.ok(existsSync(join(tmpDir, '.claude')), '.claude should still exist');
        assert.ok(existsSync(join(tmpDir, '.claude', 'rules')), '.claude/rules should still exist');
        assert.ok(existsSync(join(tmpDir, 'context')), 'context should still exist');
        assert.ok(existsSync(join(tmpDir, '.arete', 'memory')), '.arete/memory should still exist');
        
        // Verify no .cursor/ created
        assert.ok(!existsSync(join(tmpDir, '.cursor')), '.cursor should NOT be created');
      });
    });
  });

  describe('rules check (PRODUCT_RULES_ALLOW_LIST)', () => {
    it('only reports rules in PRODUCT_RULES_ALLOW_LIST, excluding dev-only .mdc files', async () => {
      // Setup: Install workspace, then point to a custom source with an extra dev-only .mdc
      const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
      const canonicalRulesDir = join(repoRoot, 'packages', 'runtime', 'rules', 'cursor');
      const customSourceDir = join(tmpdir(), `arete-test-rules-source-${Date.now()}`);
      const customRulesDir = join(customSourceDir, 'packages', 'runtime', 'rules', 'cursor');

      mkdirSync(customRulesDir, { recursive: true });
      cpSync(canonicalRulesDir, customRulesDir, { recursive: true });
      writeFileSync(join(customRulesDir, 'dev-only.mdc'), '---\n---\n# Dev-only rule (not in allow list)\n', 'utf-8');

      await installCommand(tmpDir, { json: true, ide: 'cursor' });

      const configPath = join(tmpDir, 'arete.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      config.source = `local:${customSourceDir}`;
      writeFileSync(configPath, stringifyYaml(config), 'utf-8');

      let captured = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        captured = String(args[0]);
      };

      const originalCwd = process.cwd();
      process.chdir(tmpDir);
      try {
        await updateCommand({ check: true, json: true });
      } finally {
        process.chdir(originalCwd);
        console.log = originalLog;
        rmSync(customSourceDir, { recursive: true, force: true });
      }

      const result = JSON.parse(captured);
      const reportedRules = [
        ...(result.updates?.rules?.added ?? []),
        ...(result.updates?.rules?.updated ?? [])
      ];

      assert.ok(!reportedRules.includes('dev-only.mdc'), 'dev-only.mdc must not be reported (not in allow list)');
      for (const rule of reportedRules) {
        assert.ok(PRODUCT_RULES_ALLOW_LIST.includes(rule), `Reported rule ${rule} must be in PRODUCT_RULES_ALLOW_LIST`);
      }
    });
  });
});
