/**
 * Tests for src/commands/install.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

import { installCommand } from '../../src/commands/install.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-install-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('install command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('arete.yaml manifest', () => {
    it('includes commented-out calendar config example', async () => {
      await installCommand(tmpDir, { json: true });

      const manifestPath = join(tmpDir, 'arete.yaml');
      assert.ok(existsSync(manifestPath), 'arete.yaml should be created');

      const content = readFileSync(manifestPath, 'utf8');
      
      // Check for calendar config comment
      assert.ok(content.includes('# Calendar integration (macOS only)'), 
        'Should include calendar integration comment');
      assert.ok(content.includes('# Uncomment and configure with: arete integration configure calendar'), 
        'Should include configuration instructions');
      assert.ok(content.includes('# calendar:'), 
        'Should include commented calendar key');
      assert.ok(content.includes('#   provider: macos'), 
        'Should include commented provider field');
      assert.ok(content.includes('#   calendars:'), 
        'Should include commented calendars field');
      assert.ok(content.includes('#     - Work'), 
        'Should include example calendar names');
      assert.ok(content.includes('#     - Personal'), 
        'Should include example calendar names');
    });

    it('creates valid YAML with calendar example commented out', async () => {
      await installCommand(tmpDir, { json: true });

      const manifestPath = join(tmpDir, 'arete.yaml');
      const content = readFileSync(manifestPath, 'utf8');
      
      // Parse the YAML to ensure it's valid (comments are stripped by parser)
      const { parse } = await import('yaml');
      const parsed = parse(content);
      
      assert.equal(typeof parsed, 'object', 'Should parse as valid YAML object');
      assert.equal(parsed.schema, 1, 'Should have schema version');
      assert.ok(parsed.integrations !== undefined, 'Should have integrations section');
      
      // Calendar config should NOT be in the parsed object (it's commented out)
      assert.equal(parsed.integrations.calendar, undefined, 
        'Commented calendar config should not be parsed');
    });
  });

  describe('multi-IDE support', () => {
    describe('Cursor target (default behavior)', () => {
      it('creates Cursor workspace structure with --ide cursor', async () => {
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Verify .cursor/ structure exists
        assert.ok(existsSync(join(tmpDir, '.cursor')), '.cursor directory should exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'rules')), '.cursor/rules directory should exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'tools')), '.cursor/tools directory should exist');
        assert.ok(existsSync(join(tmpDir, '.cursor', 'integrations')), '.cursor/integrations directory should exist');

        // Verify .claude/ does NOT exist
        assert.ok(!existsSync(join(tmpDir, '.claude')), '.claude directory should NOT exist');

        // Verify manifest has correct ide_target
        const manifestPath = join(tmpDir, 'arete.yaml');
        const content = readFileSync(manifestPath, 'utf8');
        const { parse } = await import('yaml');
        const parsed = parse(content);
        assert.equal(parsed.ide_target, 'cursor', 'ide_target should be cursor');
      });

      it('transpiles rules to .mdc format starting with frontmatter', async () => {
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        // Check that rules were transpiled to .cursor/rules/
        const rulesDir = join(tmpDir, '.cursor', 'rules');
        assert.ok(existsSync(rulesDir), 'Rules directory should exist');

        // Find at least one .mdc file
        const files = readdirSync(rulesDir);
        const mdcFiles = files.filter(f => f.endsWith('.mdc'));
        assert.ok(mdcFiles.length > 0, 'Should have at least one .mdc rule file');

        // Verify rules start with YAML frontmatter (no auto-generated header)
        const sampleRule = readFileSync(join(rulesDir, mdcFiles[0]), 'utf8');
        assert.ok(
          sampleRule.startsWith('---\n'),
          'Rule should start with YAML frontmatter'
        );
      });

      it('does NOT create CLAUDE.md for Cursor workspace', async () => {
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        const claudeMdPath = join(tmpDir, 'CLAUDE.md');
        assert.ok(!existsSync(claudeMdPath), 'CLAUDE.md should NOT exist for Cursor workspace');
      });

      it('creates AGENTS.md with required sections', async () => {
        await installCommand(tmpDir, { json: true, ide: 'cursor' });

        const agentsMdPath = join(tmpDir, 'AGENTS.md');
        assert.ok(existsSync(agentsMdPath), 'AGENTS.md should exist for Cursor workspace');

        const content = readFileSync(agentsMdPath, 'utf8');

        // Verify required sections
        assert.ok(content.includes('# Areté - Product Builder\'s Operating System'), 
          'Should have title');
        assert.ok(content.includes('## ⚠️ CRITICAL: Skill-Based Workflow (Mandatory)'), 
          'Should have critical routing section');
        assert.ok(content.includes('## Workspace Structure'), 
          'Should have workspace structure section');
        assert.ok(content.includes('## Key CLI Commands'), 
          'Should have CLI commands section');
        assert.ok(content.includes('.cursor/rules/'), 
          'Should reference Cursor rules directory');
      });
    });

    describe('Claude target', () => {
      it('creates Claude workspace structure with --ide claude', async () => {
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        // Verify .claude/ structure exists
        assert.ok(existsSync(join(tmpDir, '.claude')), '.claude directory should exist');
        assert.ok(existsSync(join(tmpDir, '.claude', 'rules')), '.claude/rules directory should exist');
        assert.ok(existsSync(join(tmpDir, '.claude', 'tools')), '.claude/tools directory should exist');
        assert.ok(existsSync(join(tmpDir, '.claude', 'integrations')), '.claude/integrations directory should exist');

        // Verify .cursor/ does NOT exist
        assert.ok(!existsSync(join(tmpDir, '.cursor')), '.cursor directory should NOT exist');

        // Verify manifest has correct ide_target
        const manifestPath = join(tmpDir, 'arete.yaml');
        const content = readFileSync(manifestPath, 'utf8');
        const { parse } = await import('yaml');
        const parsed = parse(content);
        assert.equal(parsed.ide_target, 'claude', 'ide_target should be claude');
      });

      it('transpiles rules to .md format starting with frontmatter', async () => {
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        // Check that rules were transpiled to .claude/rules/
        const rulesDir = join(tmpDir, '.claude', 'rules');
        assert.ok(existsSync(rulesDir), 'Rules directory should exist');

        // Find at least one .md file
        const files = readdirSync(rulesDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        assert.ok(mdFiles.length > 0, 'Should have at least one .md rule file');

        // Verify rules start with YAML frontmatter (no auto-generated header)
        const sampleRule = readFileSync(join(rulesDir, mdFiles[0]), 'utf8');
        assert.ok(
          sampleRule.startsWith('---\n'),
          'Rule should start with YAML frontmatter'
        );

        // Verify path transformations (.cursor/ -> .claude/)
        assert.ok(
          !sampleRule.includes('.cursor/'),
          'Rule should not contain .cursor/ paths'
        );
      });

      it('creates CLAUDE.md with required sections', async () => {
        await installCommand(tmpDir, { json: true, ide: 'claude' });

        const claudeMdPath = join(tmpDir, 'CLAUDE.md');
        assert.ok(existsSync(claudeMdPath), 'CLAUDE.md should exist for Claude workspace');

        const content = readFileSync(claudeMdPath, 'utf8');

        // Verify required sections
        assert.ok(content.includes('# Areté - Product Builder\'s Operating System'), 
          'Should have title');
        assert.ok(content.includes('## ⚠️ CRITICAL: Skill-Based Workflow (Mandatory)'), 
          'Should have mandatory routing workflow section');
        assert.ok(content.includes('## Workspace Structure'), 
          'Should have workspace structure section');
        assert.ok(content.includes('## Agent Mode: BUILDER vs GUIDE'), 
          'Should have agent mode section');
        assert.ok(content.includes('## Memory Management'), 
          'Should have memory management section');
        assert.ok(content.includes('## Key CLI Commands'), 
          'Should have CLI commands section');
        assert.ok(content.includes('## Version Information'), 
          'Should have version information section');

        // Verify routing workflow is inlined (not just referenced)
        assert.ok(content.includes('🛑 STOP - READ THIS FIRST'), 
          'Should inline routing workflow');
        assert.ok(content.includes('arete skill route'), 
          'Should include skill routing command');

        // Verify timestamp
        assert.ok(content.match(/Generated by Areté.*on \d{4}-\d{2}-\d{2}T/), 
          'Should include generation timestamp');
      });
    });
  });

  describe('GUIDE.md shipping', () => {
    it('copies GUIDE.md to workspace root on install', async () => {
      await installCommand(tmpDir, { json: true });

      const guidePath = join(tmpDir, 'GUIDE.md');
      assert.ok(existsSync(guidePath), 'GUIDE.md should be copied to workspace root');

      const content = readFileSync(guidePath, 'utf8');
      assert.ok(content.includes('# Areté User Guide'), 'GUIDE.md should have correct title');
      assert.ok(content.includes('Table of Contents'), 'GUIDE.md should have table of contents');
    });

    it('does NOT overwrite existing GUIDE.md (copy-if-missing)', async () => {
      // First install
      await installCommand(tmpDir, { json: true });

      const guidePath = join(tmpDir, 'GUIDE.md');
      assert.ok(existsSync(guidePath), 'GUIDE.md should exist after first install');

      // Simulate user editing GUIDE.md
      const customContent = '# My Custom Guide\n\nUser-customized content.';
      writeFileSync(guidePath, customContent, 'utf8');

      // Run update (simulating workspace update) - should NOT overwrite
      const { updateCommand } = await import('../../src/commands/update.js');
      await updateCommand({ json: true });

      const afterContent = readFileSync(guidePath, 'utf8');
      assert.equal(afterContent, customContent, 'GUIDE.md should not be overwritten on update');
    });
  });
});
