/**
 * Tests for EntityService via compat (resolveEntity, resolveEntities, listPeople, etc.).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveEntity,
  resolveEntities,
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  slugifyPersonName,
} from '../../src/compat/entity.js';
import type { WorkspacePaths } from '../../src/models/index.js';

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
  frontmatter: Record<string, unknown>
): void {
  const dir = join(root, 'people', category);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  writeFileSync(
    join(dir, `${slug}.md`),
    `---\n${yaml}\n---\n\n# ${frontmatter.name}\n`,
    'utf8'
  );
}

describe('slugifyPersonName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyPersonName('Jane Doe'), 'jane-doe');
  });
});

describe('EntityService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entity-svc-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolve (person)', () => {
    it('resolves person by name', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });
      const result = await resolveEntity('Jane Doe', 'person', paths);
      assert.ok(result);
      assert.equal(result!.type, 'person');
      assert.equal(result!.name, 'Jane Doe');
      assert.equal(result!.slug, 'jane-doe');
    });

    it('returns null for empty reference', async () => {
      assert.equal(await resolveEntity('', 'person', paths), null);
    });
  });

  describe('resolveAll', () => {
    it('returns multiple matches and respects limit', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      writePersonFile(tmpDir, 'internal', 'jane-smith', {
        name: 'Jane Smith',
        category: 'internal',
      });
      const results = await resolveEntities('jane', 'person', paths, 2);
      assert.ok(results.length >= 2);
      assert.equal(results.length, 2);
    });
  });

  describe('listPeople', () => {
    it('returns empty array when no people', async () => {
      mkdirSync(join(paths.people, 'internal'), { recursive: true });
      const list = await listPeople(paths);
      assert.deepEqual(list, []);
    });

    it('lists people from category', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@co.com',
        category: 'internal',
      });
      const list = await listPeople(paths);
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'Jane Doe');
    });
  });

  describe('getPersonBySlug', () => {
    it('returns person when found', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      const person = await getPersonBySlug(paths, 'internal', 'jane-doe');
      assert.ok(person);
      assert.equal(person!.name, 'Jane Doe');
    });
  });

  describe('getPersonByEmail', () => {
    it('returns person when email matches', async () => {
      writePersonFile(tmpDir, 'customers', 'bob', {
        name: 'Bob Acme',
        email: 'bob@acme.com',
        category: 'customers',
      });
      const person = await getPersonByEmail(paths, 'bob@acme.com');
      assert.ok(person);
      assert.equal(person!.name, 'Bob Acme');
    });
  });

  describe('updatePeopleIndex', () => {
    it('writes index when people exist', async () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@co.com',
        category: 'internal',
      });
      await updatePeopleIndex(paths);
      const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
      assert.ok(content.includes('Jane Doe'));
    });
  });
});
