/**
 * Tests for WorkspaceService and compat workspace functions.
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
} from '../../src/compat/workspace.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { WorkspaceService } from '../../src/services/workspace.js';

function createTmpDir(): string {
  const dir = join(
    tmpdir(),
    `arete-test-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('workspace compat', () => {
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

    it('returns false for empty directory', () => {
      assert.equal(isAreteWorkspace(tmpDir), false);
    });
  });

  describe('findWorkspaceRoot', () => {
    it('finds workspace in current directory', () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = findWorkspaceRoot(tmpDir);
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
      assert.equal(paths.agentSkills, join('/test/workspace', '.agents', 'skills'));
      assert.equal(paths.context, join('/test/workspace', 'context'));
      assert.equal(paths.memory, join('/test/workspace', '.arete', 'memory'));
    });
  });

  describe('parseSourceType', () => {
    it('parses "npm" source', () => {
      const result = parseSourceType('npm');
      assert.equal(result.type, 'npm');
      assert.equal(result.path, null);
    });

    it('parses "local:" source', () => {
      const result = parseSourceType('local:/some/path');
      assert.equal(result.type, 'local');
      assert.ok(
        result.path!.endsWith('/some/path') || result.path!.includes('some/path')
      );
    });

    it('throws on unknown source type', () => {
      assert.throws(() => parseSourceType('unknown'), {
        message: /Unknown source type/,
      });
    });
  });
});

describe('WorkspaceService', () => {
  let tmpDir: string;
  let service: WorkspaceService;

  beforeEach(() => {
    tmpDir = createTmpDir();
    service = new WorkspaceService(new FileStorageAdapter());
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('isWorkspace', () => {
    it('returns true when arete.yaml exists', async () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = await service.isWorkspace(tmpDir);
      assert.equal(result, true);
    });

    it('returns false for empty directory', async () => {
      const result = await service.isWorkspace(tmpDir);
      assert.equal(result, false);
    });
  });

  describe('findRoot', () => {
    it('finds workspace', async () => {
      writeFileSync(join(tmpDir, 'arete.yaml'), 'schema: 1\n');
      const result = await service.findRoot(tmpDir);
      assert.equal(result, tmpDir);
    });

    it('returns null when no workspace', async () => {
      const result = await service.findRoot(tmpDir);
      assert.equal(result, null);
    });
  });

  describe('getPaths', () => {
    it('returns WorkspacePaths', () => {
      const paths = service.getPaths('/test/root');
      assert.equal(paths.root, '/test/root');
      assert.equal(paths.manifest, join('/test/root', 'arete.yaml'));
      assert.equal(paths.agentSkills, join('/test/root', '.agents', 'skills'));
    });
  });

  describe('create', () => {
    it('creates workspace structure', async () => {
      const result = await service.create(tmpDir, {
        ideTarget: 'cursor',
        source: 'npm',
      });
      assert.ok(result.directories.length > 0);
      assert.ok(result.files.length > 0);
      const manifestExists = existsSync(join(tmpDir, 'arete.yaml'));
      assert.equal(manifestExists, true);
    });
  });

  describe('getStatus', () => {
    it('returns status for workspace with manifest', async () => {
      writeFileSync(
        join(tmpDir, 'arete.yaml'),
        'schema: 1\nversion: "0.1.0"\n'
      );
      const status = await service.getStatus(tmpDir);
      assert.equal(status.initialized, true);
      assert.equal(status.version, '0.1.0');
    });

    it('returns errors when no manifest', async () => {
      const status = await service.getStatus(tmpDir);
      assert.equal(status.initialized, false);
      assert.ok(status.errors.length > 0);
    });
  });
});
