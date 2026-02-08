/**
 * Tests for src/core/entity-resolution.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveEntity, resolveEntities } from '../../src/core/entity-resolution.js';
import type { WorkspacePaths } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    cursor: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    skills: join(root, '.cursor', 'skills'),
    skillsCore: join(root, '.cursor', 'skills-core'),
    skillsLocal: join(root, '.cursor', 'skills-local'),
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
  writeFileSync(join(dir, `${slug}.md`), `---\n${yaml}\n---\n\n# ${frontmatter.name}\n`, 'utf8');
}

function writeMeetingFile(
  root: string,
  fileName: string,
  frontmatter: Record<string, unknown>,
  body = ''
): void {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map(i => JSON.stringify(i)).join(', ')}]`;
      return `${k}: ${v == null ? '' : JSON.stringify(v)}`;
    })
    .join('\n');
  writeFileSync(join(dir, fileName), `---\n${yaml}\n---\n\n${body}`, 'utf8');
}

function writeProjectDir(
  root: string,
  status: string,
  name: string,
  readmeContent: string
): void {
  const dir = join(root, 'projects', status, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), readmeContent, 'utf8');
}

// ---------------------------------------------------------------------------
// Tests: Person Resolution
// ---------------------------------------------------------------------------

describe('entity-resolution', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'entity-res-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('person resolution', () => {
    it('resolves "Jane Doe" to exact match', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        role: 'PM',
        category: 'internal',
      });
      const result = resolveEntity('Jane Doe', 'person', paths);
      assert.ok(result);
      assert.equal(result!.type, 'person');
      assert.equal(result!.name, 'Jane Doe');
      assert.equal(result!.slug, 'jane-doe');
    });

    it('resolves "jane" to partial match (case-insensitive)', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });
      const result = resolveEntity('jane', 'person', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Jane Doe');
    });

    it('resolves "jane-doe" slug form', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });
      const result = resolveEntity('jane-doe', 'person', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Jane Doe');
    });

    it('resolves by email (exact, case-insensitive)', () => {
      writePersonFile(tmpDir, 'customers', 'bob-buyer', {
        name: 'Bob Buyer',
        email: 'bob@buyer.com',
        category: 'customers',
      });
      const result = resolveEntity('bob@buyer.com', 'person', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Bob Buyer');
      assert.ok(result!.score >= 90, 'Email match should have high score');
    });

    it('resolves by email (case-insensitive)', () => {
      writePersonFile(tmpDir, 'customers', 'bob-buyer', {
        name: 'Bob Buyer',
        email: 'bob@buyer.com',
        category: 'customers',
      });
      const result = resolveEntity('BOB@BUYER.COM', 'person', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Bob Buyer');
    });

    it('returns null for no match', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      const result = resolveEntity('xyz nobody', 'person', paths);
      assert.equal(result, null);
    });

    it('returns null for empty reference', () => {
      assert.equal(resolveEntity('', 'person', paths), null);
      assert.equal(resolveEntity('   ', 'person', paths), null);
    });

    it('picks the best match among multiple people', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        email: 'jane@acme.com',
        category: 'internal',
      });
      writePersonFile(tmpDir, 'internal', 'jane-smith', {
        name: 'Jane Smith',
        email: 'janes@acme.com',
        category: 'internal',
      });
      const result = resolveEntity('Jane Doe', 'person', paths);
      assert.ok(result);
      assert.equal(result!.slug, 'jane-doe');
    });

    it('searches across all person categories', () => {
      writePersonFile(tmpDir, 'customers', 'alice-wonderland', {
        name: 'Alice Wonderland',
        category: 'customers',
      });
      const result = resolveEntity('Alice', 'person', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Alice Wonderland');
      assert.equal(result!.metadata.category, 'customers');
    });
  });

  // -------------------------------------------------------------------------
  // Meeting resolution
  // -------------------------------------------------------------------------

  describe('meeting resolution', () => {
    it('resolves meeting by title', () => {
      writeMeetingFile(tmpDir, '2026-02-05-product-review.md', {
        title: 'Product Review',
        date: '2026-02-05',
        attendees: 'Jane Doe, Bob Buyer',
      });
      const result = resolveEntity('Product Review', 'meeting', paths);
      assert.ok(result);
      assert.equal(result!.type, 'meeting');
      assert.equal(result!.name, 'Product Review');
    });

    it('resolves meeting by date', () => {
      writeMeetingFile(tmpDir, '2026-02-05-standup.md', {
        title: 'Standup',
        date: '2026-02-05',
      });
      const result = resolveEntity('2026-02-05', 'meeting', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Standup');
    });

    it('resolves meeting by attendee', () => {
      writeMeetingFile(tmpDir, '2026-02-05-strategy.md', {
        title: 'Strategy Session',
        date: '2026-02-05',
        attendees: 'Jane Doe, Alice Wonderland',
        attendee_ids: ['jane-doe', 'alice-wonderland'],
      });
      const result = resolveEntity('jane', 'meeting', paths);
      assert.ok(result);
      assert.equal(result!.type, 'meeting');
    });

    it('resolves meeting by partial title', () => {
      writeMeetingFile(tmpDir, '2026-02-05-onboarding-kickoff.md', {
        title: 'Onboarding Kickoff Meeting',
        date: '2026-02-05',
      });
      const result = resolveEntity('onboarding', 'meeting', paths);
      assert.ok(result);
      assert.ok(result!.name.includes('Onboarding'));
    });

    it('returns null when no meetings dir', () => {
      const result = resolveEntity('any meeting', 'meeting', paths);
      assert.equal(result, null);
    });
  });

  // -------------------------------------------------------------------------
  // Project resolution
  // -------------------------------------------------------------------------

  describe('project resolution', () => {
    it('resolves active project by directory name', () => {
      writeProjectDir(tmpDir, 'active', 'search-discovery', '# Search Discovery\n\nDiscover search user needs.');
      const result = resolveEntity('search-discovery', 'project', paths);
      assert.ok(result);
      assert.equal(result!.type, 'project');
      assert.equal(result!.slug, 'search-discovery');
      assert.equal(result!.metadata.status, 'active');
    });

    it('resolves project by README title', () => {
      writeProjectDir(tmpDir, 'active', 'onboarding-prd', '# Onboarding PRD\n\nDefine onboarding requirements.');
      const result = resolveEntity('Onboarding PRD', 'project', paths);
      assert.ok(result);
      assert.equal(result!.name, 'Onboarding PRD');
    });

    it('resolves project by partial name', () => {
      writeProjectDir(tmpDir, 'active', 'search-discovery', '# Search Discovery\n\nDiscover search needs.');
      const result = resolveEntity('search', 'project', paths);
      assert.ok(result);
      assert.ok(result!.name.includes('Search'));
    });

    it('resolves archived projects', () => {
      writeProjectDir(tmpDir, 'archive', 'old-project', '# Old Project\n\nThis was completed.');
      const result = resolveEntity('old project', 'project', paths);
      assert.ok(result);
      assert.equal(result!.metadata.status, 'archived');
    });

    it('returns null when no matching project', () => {
      writeProjectDir(tmpDir, 'active', 'something-else', '# Something Else\n\nNot related.');
      const result = resolveEntity('nonexistent', 'project', paths);
      assert.equal(result, null);
    });
  });

  // -------------------------------------------------------------------------
  // Any-type resolution
  // -------------------------------------------------------------------------

  describe('any-type resolution', () => {
    it('resolves across types with entityType "any"', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      writeMeetingFile(tmpDir, '2026-02-05-strategy.md', {
        title: 'Strategy Session',
        date: '2026-02-05',
      });
      writeProjectDir(tmpDir, 'active', 'strategy-work', '# Strategy Work\n\nStrategic planning.');

      // "Jane" should resolve to person
      const jane = resolveEntity('Jane', 'any', paths);
      assert.ok(jane);
      assert.equal(jane!.type, 'person');
    });

    it('returns best match across types', () => {
      writePersonFile(tmpDir, 'internal', 'alice-eng', {
        name: 'Alice Engineer',
        category: 'internal',
      });
      writeProjectDir(tmpDir, 'active', 'alice-project', '# Alice Project\n\nAlice leads this.');

      const result = resolveEntity('Alice Engineer', 'any', paths);
      assert.ok(result);
      // Person should score higher for exact name match
      assert.equal(result!.type, 'person');
    });
  });

  // -------------------------------------------------------------------------
  // resolveEntities (multiple results)
  // -------------------------------------------------------------------------

  describe('resolveEntities', () => {
    it('returns multiple matches ranked by score', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', {
        name: 'Jane Doe',
        category: 'internal',
      });
      writePersonFile(tmpDir, 'internal', 'jane-smith', {
        name: 'Jane Smith',
        category: 'internal',
      });
      const results = resolveEntities('jane', 'person', paths);
      assert.ok(results.length >= 2);
      // Both Janes should appear
      const slugs = results.map(r => r.slug);
      assert.ok(slugs.includes('jane-doe'));
      assert.ok(slugs.includes('jane-smith'));
    });

    it('respects limit', () => {
      writePersonFile(tmpDir, 'internal', 'jane-doe', { name: 'Jane Doe', category: 'internal' });
      writePersonFile(tmpDir, 'internal', 'jane-smith', { name: 'Jane Smith', category: 'internal' });
      writePersonFile(tmpDir, 'internal', 'jane-jones', { name: 'Jane Jones', category: 'internal' });
      const results = resolveEntities('jane', 'person', paths, 2);
      assert.equal(results.length, 2);
    });

    it('returns empty array for no matches', () => {
      const results = resolveEntities('nobody', 'person', paths);
      assert.deepEqual(results, []);
    });

    it('returns empty array for empty reference', () => {
      assert.deepEqual(resolveEntities('', 'person', paths), []);
    });
  });
});
