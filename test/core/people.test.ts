/**
 * Tests for src/core/people.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  slugifyPersonName,
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
} from '../../src/core/people.js';
import type { WorkspacePaths } from '../../src/types.js';

function makePaths(peopleDir: string): WorkspacePaths {
  return {
    root: join(peopleDir, '..'),
    manifest: join(peopleDir, '..', 'arete.yaml'),
    ideConfig: join(peopleDir, '..', '.cursor'),
    rules: join(peopleDir, '..', '.cursor', 'rules'),
    agentSkills: join(peopleDir, '..', '.agents', 'skills'),
    tools: join(peopleDir, '..', '.cursor', 'tools'),
    integrations: join(peopleDir, '..', '.cursor', 'integrations'),
    context: join(peopleDir, '..', 'context'),
    memory: join(peopleDir, '..', '.arete', 'memory'),
    projects: join(peopleDir, '..', 'projects'),
    resources: join(peopleDir, '..', 'resources'),
    people: peopleDir,
    credentials: join(peopleDir, '..', '.credentials'),
    templates: join(peopleDir, '..', 'templates'),
  };
}

function writePersonFile(
  peopleDir: string,
  category: string,
  slug: string,
  frontmatter: Record<string, unknown>
): void {
  const dir = join(peopleDir, category);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v == null ? '' : JSON.stringify(v)}`)
    .join('\n');
  const content = `---\n${yaml}\n---\n\n# ${frontmatter.name}\n`;
  writeFileSync(join(dir, `${slug}.md`), content, 'utf8');
}

describe('slugifyPersonName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    assert.equal(slugifyPersonName('Jane Doe'), 'jane-doe');
  });

  it('strips non-alphanumeric characters', () => {
    assert.equal(slugifyPersonName('Jane O\'Brien-Smith'), 'jane-obrien-smith');
  });

  it('collapses multiple hyphens', () => {
    assert.equal(slugifyPersonName('Jane   Doe'), 'jane-doe');
  });

  it('returns unnamed for empty after trim', () => {
    assert.equal(slugifyPersonName('  ---  '), 'unnamed');
  });
});

describe('listPeople', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-test-'));
    paths = makePaths(join(tmpDir, 'people'));
    mkdirSync(paths.people, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when people dir does not exist', async () => {
    const noPaths = makePaths(join(tmpDir, 'nonexistent'));
    assert.deepEqual(await listPeople(noPaths), []);
  });

  it('returns empty array when no person files', async () => {
    mkdirSync(join(paths.people, 'internal'), { recursive: true });
    assert.deepEqual(await listPeople(paths), []);
  });

  it('lists person from one category', async () => {
    writePersonFile(paths.people, 'internal', 'jane-doe', {
      name: 'Jane Doe',
      email: 'jane@co.com',
      role: 'PM',
      category: 'internal',
    });
    const list = await listPeople(paths);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Jane Doe');
    assert.equal(list[0].slug, 'jane-doe');
    assert.equal(list[0].category, 'internal');
    assert.equal(list[0].email, 'jane@co.com');
  });

  it('filters by category when option provided', async () => {
    writePersonFile(paths.people, 'internal', 'jane', { name: 'Jane', category: 'internal' });
    writePersonFile(paths.people, 'customers', 'bob', { name: 'Bob', category: 'customers' });
    const list = await listPeople(paths, { category: 'customers' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Bob');
  });

  it('sorts by name', async () => {
    writePersonFile(paths.people, 'internal', 'zara', { name: 'Zara', category: 'internal' });
    writePersonFile(paths.people, 'internal', 'alice', { name: 'Alice', category: 'internal' });
    const list = await listPeople(paths);
    assert.equal(list[0].name, 'Alice');
    assert.equal(list[1].name, 'Zara');
  });

  it('ignores index.md', async () => {
    mkdirSync(join(paths.people, 'internal'), { recursive: true });
    writeFileSync(join(paths.people, 'internal', 'index.md'), '# Index\n', 'utf8');
    assert.deepEqual(await listPeople(paths), []);
  });

  it('returns null for person file without name in frontmatter', async () => {
    writePersonFile(paths.people, 'internal', 'no-name', { role: 'PM', category: 'internal' });
    const list = await listPeople(paths);
    assert.equal(list.length, 0);
  });
});

describe('getPersonBySlug', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-get-'));
    paths = makePaths(join(tmpDir, 'people'));
    mkdirSync(paths.people, { recursive: true });
    writePersonFile(paths.people, 'internal', 'jane-doe', {
      name: 'Jane Doe',
      email: 'jane@co.com',
      category: 'internal',
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns person when found', async () => {
    const person = await getPersonBySlug(paths, 'internal', 'jane-doe');
    assert.ok(person);
    assert.equal(person!.name, 'Jane Doe');
    assert.equal(person!.slug, 'jane-doe');
  });

  it('returns null when slug not found', async () => {
    assert.equal(await getPersonBySlug(paths, 'internal', 'nobody'), null);
  });

  it('returns null when category dir missing', async () => {
    assert.equal(await getPersonBySlug(paths, 'customers', 'jane-doe'), null);
  });
});

describe('getPersonByEmail', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-email-'));
    paths = makePaths(join(tmpDir, 'people'));
    mkdirSync(paths.people, { recursive: true });
    writePersonFile(paths.people, 'customers', 'bob-acme', {
      name: 'Bob Acme',
      email: 'bob@acme.com',
      category: 'customers',
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns person when email matches', async () => {
    const person = await getPersonByEmail(paths, 'bob@acme.com');
    assert.ok(person);
    assert.equal(person!.name, 'Bob Acme');
    assert.equal(person!.email, 'bob@acme.com');
  });

  it('is case insensitive', async () => {
    const person = await getPersonByEmail(paths, 'BOB@ACME.COM');
    assert.ok(person);
    assert.equal(person!.name, 'Bob Acme');
  });

  it('returns null when email not found', async () => {
    assert.equal(await getPersonByEmail(paths, 'other@example.com'), null);
  });

  it('returns null when paths.people is null', async () => {
    assert.equal(await getPersonByEmail(null, 'bob@acme.com'), null);
  });
});

describe('updatePeopleIndex', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'people-index-'));
    paths = makePaths(join(tmpDir, 'people'));
    mkdirSync(paths.people, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes placeholder when no people', async () => {
    await updatePeopleIndex(paths);
    const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
    assert.ok(content.includes('(none yet)'));
    assert.ok(content.includes('| Name |'));
  });

  it('writes table rows when people exist', async () => {
    writePersonFile(paths.people, 'internal', 'jane-doe', {
      name: 'Jane Doe',
      email: 'jane@co.com',
      role: 'PM',
      category: 'internal',
    });
    await updatePeopleIndex(paths);
    const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
    assert.ok(content.includes('Jane Doe'));
    assert.ok(content.includes('jane@co.com'));
    assert.ok(content.includes('internal'));
  });

  it('does nothing when paths.people is null', async () => {
    await updatePeopleIndex(null);
    assert.ok(!existsSync(join(tmpDir, 'index.md')));
  });
});
