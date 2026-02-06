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
    cursor: join(peopleDir, '..', '.cursor'),
    rules: join(peopleDir, '..', '.cursor', 'rules'),
    skills: join(peopleDir, '..', '.cursor', 'skills'),
    skillsCore: join(peopleDir, '..', '.cursor', 'skills-core'),
    skillsLocal: join(peopleDir, '..', '.cursor', 'skills-local'),
    tools: join(peopleDir, '..', '.cursor', 'tools'),
    integrations: join(peopleDir, '..', '.cursor', 'integrations'),
    context: join(peopleDir, '..', 'context'),
    memory: join(peopleDir, '..', 'memory'),
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

  it('returns empty array when people dir does not exist', () => {
    const noPaths = makePaths(join(tmpDir, 'nonexistent'));
    assert.deepEqual(listPeople(noPaths), []);
  });

  it('returns empty array when no person files', () => {
    mkdirSync(join(paths.people, 'internal'), { recursive: true });
    assert.deepEqual(listPeople(paths), []);
  });

  it('lists person from one category', () => {
    writePersonFile(paths.people, 'internal', 'jane-doe', {
      name: 'Jane Doe',
      email: 'jane@co.com',
      role: 'PM',
      category: 'internal',
    });
    const list = listPeople(paths);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Jane Doe');
    assert.equal(list[0].slug, 'jane-doe');
    assert.equal(list[0].category, 'internal');
    assert.equal(list[0].email, 'jane@co.com');
  });

  it('filters by category when option provided', () => {
    writePersonFile(paths.people, 'internal', 'jane', { name: 'Jane', category: 'internal' });
    writePersonFile(paths.people, 'customers', 'bob', { name: 'Bob', category: 'customers' });
    const list = listPeople(paths, { category: 'customers' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Bob');
  });

  it('sorts by name', () => {
    writePersonFile(paths.people, 'internal', 'zara', { name: 'Zara', category: 'internal' });
    writePersonFile(paths.people, 'internal', 'alice', { name: 'Alice', category: 'internal' });
    const list = listPeople(paths);
    assert.equal(list[0].name, 'Alice');
    assert.equal(list[1].name, 'Zara');
  });

  it('ignores index.md', () => {
    mkdirSync(join(paths.people, 'internal'), { recursive: true });
    writeFileSync(join(paths.people, 'internal', 'index.md'), '# Index\n', 'utf8');
    assert.deepEqual(listPeople(paths), []);
  });

  it('returns null for person file without name in frontmatter', () => {
    writePersonFile(paths.people, 'internal', 'no-name', { role: 'PM', category: 'internal' });
    const list = listPeople(paths);
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

  it('returns person when found', () => {
    const person = getPersonBySlug(paths, 'internal', 'jane-doe');
    assert.ok(person);
    assert.equal(person!.name, 'Jane Doe');
    assert.equal(person!.slug, 'jane-doe');
  });

  it('returns null when slug not found', () => {
    assert.equal(getPersonBySlug(paths, 'internal', 'nobody'), null);
  });

  it('returns null when category dir missing', () => {
    assert.equal(getPersonBySlug(paths, 'customers', 'jane-doe'), null);
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

  it('returns person when email matches', () => {
    const person = getPersonByEmail(paths, 'bob@acme.com');
    assert.ok(person);
    assert.equal(person!.name, 'Bob Acme');
    assert.equal(person!.email, 'bob@acme.com');
  });

  it('is case insensitive', () => {
    const person = getPersonByEmail(paths, 'BOB@ACME.COM');
    assert.ok(person);
    assert.equal(person!.name, 'Bob Acme');
  });

  it('returns null when email not found', () => {
    assert.equal(getPersonByEmail(paths, 'other@example.com'), null);
  });

  it('returns null when paths.people is null', () => {
    assert.equal(getPersonByEmail(null, 'bob@acme.com'), null);
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

  it('writes placeholder when no people', () => {
    updatePeopleIndex(paths);
    const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
    assert.ok(content.includes('(none yet)'));
    assert.ok(content.includes('| Name |'));
  });

  it('writes table rows when people exist', () => {
    writePersonFile(paths.people, 'internal', 'jane-doe', {
      name: 'Jane Doe',
      email: 'jane@co.com',
      role: 'PM',
      category: 'internal',
    });
    updatePeopleIndex(paths);
    const content = readFileSync(join(paths.people, 'index.md'), 'utf8');
    assert.ok(content.includes('Jane Doe'));
    assert.ok(content.includes('jane@co.com'));
    assert.ok(content.includes('internal'));
  });

  it('does nothing when paths.people is null', () => {
    updatePeopleIndex(null);
    assert.ok(!existsSync(join(tmpDir, 'index.md')));
  });
});
