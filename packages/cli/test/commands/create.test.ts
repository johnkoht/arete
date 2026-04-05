/**
 * Tests for arete create area command
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('create area command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-create');
    // Initialize workspace
    runCli(['install', tmpDir, '--skip-qmd', '--json']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('file creation', () => {
    it('creates area file from template', () => {
      const output = runCli([
        'create', 'area', 'test-area',
        '--name', 'Test Area',
        '--description', 'A test description',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean; areaPath: string };
      assert.equal(parsed.success, true);
      assert.equal(parsed.areaPath, 'areas/test-area.md');

      const areaPath = join(tmpDir, 'areas', 'test-area.md');
      assert.ok(existsSync(areaPath), 'Area file should exist');

      const content = readFileSync(areaPath, 'utf8');
      assert.ok(content.includes('area: Test Area'), 'Should have area name in frontmatter');
      assert.ok(content.includes('# Test Area'), 'Should have area name as heading');
      assert.ok(content.includes('A test description'), 'Should include description');
      assert.ok(content.includes('status: active'), 'Should have active status');
    });

    it('creates context directory with README', () => {
      runCli([
        'create', 'area', 'my-area',
        '--name', 'My Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const contextDir = join(tmpDir, 'context', 'my-area');
      assert.ok(existsSync(contextDir), 'Context directory should exist');

      const readmePath = join(contextDir, 'README.md');
      assert.ok(existsSync(readmePath), 'README.md should exist in context dir');

      const content = readFileSync(readmePath, 'utf8');
      assert.ok(content.includes('# My Area'), 'README should have area name');
      assert.ok(content.includes('Context files'), 'README should explain purpose');
    });

    it('includes recurring meeting when provided', () => {
      runCli([
        'create', 'area', 'client-acme',
        '--name', 'Client Acme',
        '--meeting-title', 'Acme Weekly Sync',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const areaPath = join(tmpDir, 'areas', 'client-acme.md');
      const content = readFileSync(areaPath, 'utf8');
      assert.ok(content.includes('Acme Weekly Sync'), 'Should include meeting title');
      assert.ok(content.includes('recurring_meetings:'), 'Should have recurring_meetings section');
    });

    it('uses empty recurring_meetings array when no meeting provided', () => {
      runCli([
        'create', 'area', 'no-meeting-area',
        '--name', 'No Meeting Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const areaPath = join(tmpDir, 'areas', 'no-meeting-area.md');
      const content = readFileSync(areaPath, 'utf8');
      assert.ok(content.includes('recurring_meetings: []'), 'Should have empty recurring_meetings');
    });
  });

  describe('slug validation', () => {
    it('rejects invalid slug with uppercase', () => {
      const { stdout, code } = runCliRaw([
        'create', 'area', 'TestArea',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Invalid slug format'), 'Should report invalid slug');
      assert.equal(code, 1);
    });

    it('rejects slug starting with number', () => {
      const { stdout, code } = runCliRaw([
        'create', 'area', '123-area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Invalid slug format'), 'Should report invalid slug');
      assert.equal(code, 1);
    });

    it('rejects slug with consecutive hyphens', () => {
      const { stdout, code } = runCliRaw([
        'create', 'area', 'test--area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('Invalid slug format'), 'Should report invalid slug');
      assert.equal(code, 1);
    });

    it('accepts valid slugs with numbers and hyphens', () => {
      const output = runCli([
        'create', 'area', 'project-2026-q1',
        '--name', 'Project 2026 Q1',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean };
      assert.equal(parsed.success, true);
    });
  });

  describe('duplicate prevention', () => {
    it('rejects when area file already exists', () => {
      // Create area first
      runCli([
        'create', 'area', 'existing-area',
        '--name', 'Existing Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      // Try to create again
      const { stdout, code } = runCliRaw([
        'create', 'area', 'existing-area',
        '--name', 'Duplicate Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('already exists'), 'Should report area exists');
      assert.equal(code, 1);
    });

    it('rejects when context directory already exists', () => {
      // Create context directory manually
      mkdirSync(join(tmpDir, 'context', 'manual-area'), { recursive: true });

      const { stdout, code } = runCliRaw([
        'create', 'area', 'manual-area',
        '--name', 'Manual Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(stdout) as { success: boolean; error: string };
      assert.equal(parsed.success, false);
      assert.ok(parsed.error.includes('already exists'), 'Should report context dir exists');
      assert.equal(code, 1);
    });
  });

  describe('default name generation', () => {
    it('generates titlecased name from slug when not provided', () => {
      const output = runCli([
        'create', 'area', 'glance-communications',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { success: boolean; name: string };
      assert.equal(parsed.success, true);
      assert.equal(parsed.name, 'Glance Communications');
    });
  });

  describe('JSON output', () => {
    it('includes all expected fields in JSON output', () => {
      const output = runCli([
        'create', 'area', 'full-area',
        '--name', 'Full Area',
        '--description', 'Full description',
        '--meeting-title', 'Weekly Sync',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as {
        success: boolean;
        slug: string;
        areaPath: string;
        contextDir: string;
        name: string;
        description: string;
        meetingTitle: string;
        qmd: { skipped: boolean };
      };

      assert.equal(parsed.success, true);
      assert.equal(parsed.slug, 'full-area');
      assert.equal(parsed.areaPath, 'areas/full-area.md');
      assert.equal(parsed.contextDir, 'context/full-area/');
      assert.equal(parsed.name, 'Full Area');
      assert.equal(parsed.description, 'Full description');
      assert.equal(parsed.meetingTitle, 'Weekly Sync');
      assert.equal(parsed.qmd.skipped, true);
    });

    it('returns null for optional fields when not provided', () => {
      const output = runCli([
        'create', 'area', 'minimal-area',
        '--name', 'Minimal Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as {
        description: string | null;
        meetingTitle: string | null;
      };

      assert.equal(parsed.description, null);
      assert.equal(parsed.meetingTitle, null);
    });
  });

  describe('workspace validation', () => {
    it('fails when not in workspace', () => {
      const nonWorkspaceDir = createTmpDir('arete-test-non-workspace');
      try {
        const { stdout, code } = runCliRaw([
          'create', 'area', 'test',
          '--skip-qmd', '--json',
        ], { cwd: nonWorkspaceDir });

        const parsed = JSON.parse(stdout) as { success: boolean; error: string };
        assert.equal(parsed.success, false);
        assert.ok(parsed.error.includes('Not in an Areté workspace'));
        assert.equal(code, 1);
      } finally {
        cleanupTmpDir(nonWorkspaceDir);
      }
    });
  });

  describe('qmd integration', () => {
    it('includes qmd result in JSON output', () => {
      const output = runCli([
        'create', 'area', 'indexed-area',
        '--name', 'Indexed Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const parsed = JSON.parse(output) as { qmd: { indexed: boolean; skipped: boolean } };
      assert.ok('qmd' in parsed, 'Should include qmd field');
      assert.equal(parsed.qmd.skipped, true, 'Should be skipped with --skip-qmd');
    });
  });

  describe('template content', () => {
    it('includes all expected markdown sections', () => {
      runCli([
        'create', 'area', 'full-template-area',
        '--name', 'Full Template Area',
        '--skip-qmd', '--json',
      ], { cwd: tmpDir });

      const areaPath = join(tmpDir, 'areas', 'full-template-area.md');
      const content = readFileSync(areaPath, 'utf8');

      // Check for all expected sections from the template
      assert.ok(content.includes('## Goal'), 'Should have Goal section');
      assert.ok(content.includes('## Focus'), 'Should have Focus section');
      assert.ok(content.includes('## Horizon'), 'Should have Horizon section');
      assert.ok(content.includes('## Projects'), 'Should have Projects section');
      assert.ok(content.includes('## Stakeholders'), 'Should have Stakeholders section');
      assert.ok(content.includes('## Backlog'), 'Should have Backlog section');
      assert.ok(content.includes('## Notes'), 'Should have Notes section');
    });
  });
});
