/**
 * Tests for src/core/workspace-structure.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  WORKSPACE_DIRS,
  DEFAULT_FILES,
  ensureWorkspaceStructure,
} from '../../src/core/workspace-structure.js';

describe('workspace-structure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ws-structure-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('WORKSPACE_DIRS', () => {
    it('includes people and category subdirs', () => {
      assert.ok(WORKSPACE_DIRS.includes('people'));
      assert.ok(WORKSPACE_DIRS.includes('people/internal'));
      assert.ok(WORKSPACE_DIRS.includes('people/customers'));
      assert.ok(WORKSPACE_DIRS.includes('people/users'));
    });

    it('includes core workspace dirs', () => {
      assert.ok(WORKSPACE_DIRS.includes('context'));
      assert.ok(WORKSPACE_DIRS.includes('memory'));
      assert.ok(WORKSPACE_DIRS.includes('projects'));
      assert.ok(WORKSPACE_DIRS.includes('resources'));
    });

    it('includes planning dirs', () => {
      assert.ok(WORKSPACE_DIRS.includes('resources/plans'));
      assert.ok(WORKSPACE_DIRS.includes('resources/plans/archive'));
      assert.ok(WORKSPACE_DIRS.includes('templates/plans'));
    });
  });

  describe('DEFAULT_FILES', () => {
    it('includes people/index.md', () => {
      assert.ok('people/index.md' in DEFAULT_FILES);
      assert.ok(DEFAULT_FILES['people/index.md'].includes('People Index'));
    });

    it('includes planning default files', () => {
      assert.ok('resources/plans/README.md' in DEFAULT_FILES);
      assert.ok(
        DEFAULT_FILES['resources/plans/README.md'].includes('Planning') ||
          DEFAULT_FILES['resources/plans/README.md'].includes('quarter')
      );
      assert.ok('templates/plans/quarter-goals.md' in DEFAULT_FILES);
      assert.ok('templates/plans/week-priorities.md' in DEFAULT_FILES);
    });

    it('includes context default files with placeholder content', () => {
      const contextFiles = [
        'context/README.md',
        'context/business-overview.md',
        'context/users-personas.md',
        'context/products-services.md',
        'context/business-model.md',
        'context/goals-strategy.md',
        'context/competitive-landscape.md',
      ];
      for (const file of contextFiles) {
        assert.ok(file in DEFAULT_FILES, `expected ${file} in DEFAULT_FILES`);
      }
      assert.ok(DEFAULT_FILES['context/README.md'].includes('Context'));
      assert.ok(DEFAULT_FILES['context/business-overview.md'].includes('Business Overview'));
      assert.ok(DEFAULT_FILES['context/goals-strategy.md'].includes('Goals & Strategy'));
    });
  });

  describe('ensureWorkspaceStructure', () => {
    it('creates missing directories', () => {
      const result = ensureWorkspaceStructure(tmpDir);
      assert.ok(result.directoriesAdded.length > 0);
      assert.ok(result.directoriesAdded.includes('people'));
      assert.ok(existsSync(join(tmpDir, 'people')));
      assert.ok(existsSync(join(tmpDir, 'people/internal')));
    });

    it('creates missing default files', () => {
      const result = ensureWorkspaceStructure(tmpDir);
      assert.ok(result.filesAdded.includes('people/index.md'));
      assert.ok(existsSync(join(tmpDir, 'people/index.md')));
      const content = readFileSync(join(tmpDir, 'people/index.md'), 'utf8');
      assert.ok(content.includes('People Index'));
    });

    it('creates context files with placeholder content', () => {
      const result = ensureWorkspaceStructure(tmpDir);
      assert.ok(result.filesAdded.includes('context/business-overview.md'));
      assert.ok(result.filesAdded.includes('context/goals-strategy.md'));
      const overview = readFileSync(join(tmpDir, 'context/business-overview.md'), 'utf8');
      assert.ok(overview.includes('Business Overview') && overview.includes('[Your company name]'));
      const goals = readFileSync(join(tmpDir, 'context/goals-strategy.md'), 'utf8');
      assert.ok(goals.includes('Goals & Strategy') && goals.includes('North Star'));
    });

    it('does not overwrite existing files', () => {
      mkdirSync(join(tmpDir, 'people'), { recursive: true });
      const customContent = '# My custom index\nCustom content.';
      writeFileSync(join(tmpDir, 'people/index.md'), customContent, 'utf8');
      const result = ensureWorkspaceStructure(tmpDir);
      assert.ok(!result.filesAdded.includes('people/index.md'));
      assert.equal(readFileSync(join(tmpDir, 'people/index.md'), 'utf8'), customContent);
    });

    it('reports but does not create when dryRun is true', () => {
      const result = ensureWorkspaceStructure(tmpDir, { dryRun: true });
      assert.ok(result.directoriesAdded.length > 0);
      assert.ok(result.filesAdded.includes('people/index.md'));
      assert.ok(!existsSync(join(tmpDir, 'people')));
      assert.ok(!existsSync(join(tmpDir, 'people/index.md')));
    });

    it('returns empty arrays when structure already complete', () => {
      ensureWorkspaceStructure(tmpDir);
      const result = ensureWorkspaceStructure(tmpDir);
      assert.equal(result.directoriesAdded.length, 0);
      assert.equal(result.filesAdded.length, 0);
    });
  });
});
