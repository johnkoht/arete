/**
 * Tests for src/core/workspace.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

import {
  isAreteWorkspace,
  findWorkspaceRoot,
  getWorkspacePaths,
  parseSourceType,
} from '../../src/core/workspace.js';

// Helpers
function createTmpDir(): string {
  const dir = join(tmpdir(), `arete-test-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('workspace', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('isAreteWorkspace', () => {
    it('returns true when arete.yaml exists', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      assert.equal(isAreteWorkspace(tmpDir), true);
    });

    it('returns true when .cursor + context + .arete/memory exist', () => {
      mkdirSync(join(tmpDir, '.cursor'), { recursive: true });
      mkdirSync(join(tmpDir, 'context'), { recursive: true });
      mkdirSync(join(tmpDir, '.arete', 'memory'), { recursive: true });
      assert.equal(isAreteWorkspace(tmpDir), true);
    });

    it('returns true when .cursor + context + legacy memory exist', () => {
      mkdirSync(join(tmpDir, '.cursor'), { recursive: true });
      mkdirSync(join(tmpDir, 'context'), { recursive: true });
      mkdirSync(join(tmpDir, 'memory'), { recursive: true });
      assert.equal(isAreteWorkspace(tmpDir), true);
    });

    it('returns false for empty directory', () => {
      assert.equal(isAreteWorkspace(tmpDir), false);
    });

    it('returns false when only .cursor exists (no context/memory)', () => {
      mkdirSync(join(tmpDir, '.cursor'), { recursive: true });
      assert.equal(isAreteWorkspace(tmpDir), false);
    });

    it('returns false when only context + memory exist (no .cursor)', () => {
      mkdirSync(join(tmpDir, 'context'), { recursive: true });
      mkdirSync(join(tmpDir, 'memory'), { recursive: true });
      assert.equal(isAreteWorkspace(tmpDir), false);
    });
  });

  describe('findWorkspaceRoot', () => {
    it('finds workspace in current directory', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = findWorkspaceRoot(tmpDir);
      assert.equal(result, tmpDir);
    });

    it('finds workspace in parent directory', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const child = join(tmpDir, 'some', 'nested', 'dir');
      mkdirSync(child, { recursive: true });
      const result = findWorkspaceRoot(child);
      assert.equal(result, tmpDir);
    });

    it('returns null when no workspace found', () => {
      const result = findWorkspaceRoot(tmpDir);
      assert.equal(result, null);
    });
  });

  describe('getWorkspacePaths', () => {
    it('returns all expected paths', () => {
      const paths = getWorkspacePaths('/test/workspace');
      assert.equal(paths.root, '/test/workspace');
      assert.equal(paths.manifest, join('/test/workspace', 'arete.yaml'));
      assert.equal(paths.cursor, join('/test/workspace', '.cursor'));
      assert.equal(paths.rules, join('/test/workspace', '.cursor', 'rules'));
      assert.equal(paths.skills, join('/test/workspace', '.cursor', 'skills'));
      assert.equal(paths.skillsCore, join('/test/workspace', '.cursor', 'skills-core'));
      assert.equal(paths.skillsLocal, join('/test/workspace', '.cursor', 'skills-local'));
      assert.equal(paths.tools, join('/test/workspace', '.cursor', 'tools'));
      assert.equal(paths.integrations, join('/test/workspace', '.cursor', 'integrations'));
      assert.equal(paths.context, join('/test/workspace', 'context'));
      assert.equal(paths.memory, join('/test/workspace', '.arete', 'memory'));
      assert.equal(paths.now, join('/test/workspace', 'now'));
      assert.equal(paths.goals, join('/test/workspace', 'goals'));
      assert.equal(paths.projects, join('/test/workspace', 'projects'));
      assert.equal(paths.resources, join('/test/workspace', 'resources'));
      assert.equal(paths.people, join('/test/workspace', 'people'));
      assert.equal(paths.credentials, join('/test/workspace', '.credentials'));
      assert.equal(paths.templates, join('/test/workspace', 'templates'));
    });
  });

  describe('parseSourceType', () => {
    it('parses "npm" source', () => {
      const result = parseSourceType('npm');
      assert.equal(result.type, 'npm');
      assert.equal(result.path, null);
    });

    it('parses "symlink" source', () => {
      const result = parseSourceType('symlink');
      assert.equal(result.type, 'symlink');
      assert.ok(result.path); // Should resolve to package root
    });

    it('parses "local:" source', () => {
      const result = parseSourceType('local:/some/path');
      assert.equal(result.type, 'local');
      assert.ok(result.path!.endsWith('/some/path') || result.path!.includes('some/path'));
    });

    it('throws on unknown source type', () => {
      assert.throws(() => parseSourceType('unknown'), {
        message: /Unknown source type/,
      });
    });

    it('throws on empty string', () => {
      assert.throws(() => parseSourceType(''), {
        message: /Unknown source type/,
      });
    });
  });
});
