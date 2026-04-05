/**
 * Tests for EntityService directory fallback (Phase 3).
 *
 * Verifies that:
 * - resolve falls back to DirectoryProvider when no local person found
 * - resolve does NOT use directory when local person is found
 * - resolve works without directoryProvider (backward compat)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EntityService } from '../../src/services/entity.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import type { DirectoryProvider, DirectoryPerson } from '../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
    context: join(root, 'context'),
    memory: join(root, '.arete', 'memory'),
    now: join(root, 'now'),
    goals: join(root, 'goals'),
    projects: join(root, 'projects'),
    resources: join(root, 'resources'),
    people: join(root, 'people'),
    credentials: join(root, '.credentials'),
    templates: join(root, 'templates'),
  };
}

function writePersonFile(
  root: string,
  category: string,
  slug: string,
  frontmatter: Record<string, unknown>,
): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${yaml}\n---\n\n# ${frontmatter.name}\n`,
    'utf8',
  );
}

function createMockDirectoryProvider(
  results: DirectoryPerson[] = [],
): DirectoryProvider {
  return {
    name: 'mock-directory',
    async isAvailable() {
      return true;
    },
    async lookupPerson(_email: string) {
      return results[0] ?? null;
    },
    async searchDirectory(_query: string, _options?: { maxResults?: number }) {
      return results;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityService directory fallback', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entity-dir-'));
    paths = makePaths(tmpDir);
    // Create people directories so the service doesn't error
    for (const cat of ['internal', 'customers', 'users']) {
      mkdirSync(join(tmpDir, 'people', cat), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolve falls back to DirectoryProvider when no local person found', async () => {
    const dirProvider = createMockDirectoryProvider([
      {
        email: 'alice@example.com',
        name: 'Alice Johnson',
        title: 'Staff Engineer',
        department: 'Platform',
      },
    ]);

    const storage = new FileStorageAdapter();
    const svc = new EntityService(storage, undefined, dirProvider);

    const result = await svc.resolve('Alice Johnson', 'person', paths);

    assert.ok(result, 'should return a result from directory fallback');
    assert.equal(result.type, 'person');
    assert.equal(result.name, 'Alice Johnson');
    assert.equal(result.slug, 'alice@example.com');
    assert.equal(result.source, 'directory');
    assert.equal(result.score, 0.5);
    assert.equal(result.path, '');
    assert.equal(result.metadata.email, 'alice@example.com');
    assert.equal(result.metadata.title, 'Staff Engineer');
  });

  it('resolve does NOT use directory when local person is found', async () => {
    // Create a local person file
    writePersonFile(tmpDir, 'internal', 'alice-jones', {
      name: 'Alice Jones',
      email: 'alice@company.com',
      role: 'Designer',
      company: 'Acme',
    });

    let directoryCalled = false;
    const dirProvider: DirectoryProvider = {
      name: 'mock-directory',
      async isAvailable() { return true; },
      async lookupPerson() { directoryCalled = true; return null; },
      async searchDirectory() {
        directoryCalled = true;
        return [{ email: 'alice@other.com', name: 'Alice Other' }];
      },
    };

    const storage = new FileStorageAdapter();
    const svc = new EntityService(storage, undefined, dirProvider);

    const result = await svc.resolve('Alice Jones', 'person', paths);

    assert.ok(result, 'should find local person');
    assert.equal(result.name, 'Alice Jones');
    assert.equal(directoryCalled, false, 'should NOT call directory when local person found');
    assert.notEqual(result.source, 'directory');
  });

  it('resolve works without directoryProvider (backward compat)', async () => {
    const storage = new FileStorageAdapter();
    // No directory provider — backward compatible
    const svc = new EntityService(storage);

    const result = await svc.resolve('Nobody Here', 'person', paths);

    assert.equal(result, null, 'should return null when no local match and no directory');
  });

  it('resolveAll falls back to DirectoryProvider when no local person found', async () => {
    const dirProvider = createMockDirectoryProvider([
      { email: 'bob@example.com', name: 'Bob Smith', title: 'Manager' },
      { email: 'bob.jones@example.com', name: 'Bob Jones' },
    ]);

    const storage = new FileStorageAdapter();
    const svc = new EntityService(storage, undefined, dirProvider);

    const results = await svc.resolveAll('Bob', 'person', paths);

    assert.equal(results.length, 2);
    assert.equal(results[0].source, 'directory');
    assert.equal(results[1].source, 'directory');
  });
});
