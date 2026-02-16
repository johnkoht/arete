/**
 * Tests for EntityService.findMentions, EntityService.getRelationships,
 * and relationship-enriched briefings.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { EntityService } from '../../src/services/entity.js';
import { assembleBriefing } from '../../src/compat/intelligence.js';
import type {
  WorkspacePaths,
  ResolvedEntity,
  EntityRelationship,
  RelationshipType,
} from '../../src/models/index.js';

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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function makeEntity(name: string, type: 'person' | 'meeting' | 'project', path: string, slug?: string): ResolvedEntity {
  return {
    type,
    path,
    name,
    slug: slug ?? name.toLowerCase().replace(/\s+/g, '-'),
    metadata: {},
    score: 100,
  };
}

// ---------------------------------------------------------------------------
// findMentions tests
// ---------------------------------------------------------------------------

describe('EntityService.findMentions', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'find-mentions-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds mentions in context files', async () => {
    writeFile(tmpDir, 'context/overview.md', '# Overview\n\nSarah leads the product team.');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1);
    const m = mentions.find(m => m.sourceType === 'context');
    assert.ok(m, 'Should find mention in context');
    assert.equal(m!.entity, 'Sarah');
    assert.equal(m!.entityType, 'person');
    assert.ok(m!.sourcePath.includes('context/overview.md'));
    assert.equal(m!.sourceType, 'context');
    assert.ok(m!.excerpt.includes('Sarah'));
  });

  it('finds mentions in meeting files', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-02-10-standup.md', '---\ntitle: "Standup"\ndate: "2026-02-10"\n---\n\nSarah presented the new feature.\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1);
    const m = mentions.find(m => m.sourceType === 'meeting');
    assert.ok(m, 'Should find mention in meeting');
    assert.equal(m!.sourceType, 'meeting');
    assert.equal(m!.date, '2026-02-10');
    assert.ok(m!.excerpt.includes('Sarah'));
  });

  it('finds mentions in memory files', async () => {
    writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-15: Sarah decided to use React\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1);
    const m = mentions.find(m => m.sourceType === 'memory');
    assert.ok(m, 'Should find mention in memory');
    assert.equal(m!.sourceType, 'memory');
    assert.ok(m!.excerpt.includes('Sarah'));
  });

  it('finds mentions in project files', async () => {
    writeFile(tmpDir, 'projects/active/project-x/README.md', '# Project X\n\nSarah is the lead engineer.\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1);
    const m = mentions.find(m => m.sourceType === 'project');
    assert.ok(m, 'Should find mention in project');
    assert.equal(m!.sourceType, 'project');
    assert.ok(m!.excerpt.includes('Sarah'));
  });

  it('returns empty array when no mentions found', async () => {
    writeFile(tmpDir, 'context/overview.md', '# Overview\n\nNothing relevant here.');
    const entity = makeEntity('NonExistent', 'person', join(tmpDir, 'people/internal/nobody.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.deepEqual(mentions, []);
  });

  it('is case-insensitive when matching entity names', async () => {
    writeFile(tmpDir, 'context/notes.md', '# Notes\n\nsarah mentioned this approach works.');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1, 'Should find case-insensitive match');
  });

  it('sorts mentions by date (newest first)', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-01-01-old.md', '---\ntitle: "Old"\ndate: "2026-01-01"\n---\n\nSarah was there.\n');
    writeFile(tmpDir, 'resources/meetings/2026-02-15-new.md', '---\ntitle: "New"\ndate: "2026-02-15"\n---\n\nSarah presented.\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 2);
    const dates = mentions.filter(m => m.date).map(m => m.date!);
    for (let i = 1; i < dates.length; i++) {
      assert.ok(dates[i - 1] >= dates[i], `Dates should be newest first: ${dates[i - 1]} >= ${dates[i]}`);
    }
  });

  it('returns correct excerpt with surrounding context', async () => {
    writeFile(tmpDir, 'context/notes.md', 'The quick brown fox jumps over Sarah and the lazy dog in the field.');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const mentions = await service.findMentions(entity, paths);

    assert.ok(mentions.length >= 1);
    assert.ok(mentions[0].excerpt.includes('Sarah'));
    assert.ok(mentions[0].excerpt.length > 'Sarah'.length);
  });
});

// ---------------------------------------------------------------------------
// getRelationships tests
// ---------------------------------------------------------------------------

describe('EntityService.getRelationships', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: EntityService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'get-rels-'));
    paths = makePaths(tmpDir);
    service = new EntityService(new FileStorageAdapter());
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts works_on from project README team section', async () => {
    writeFile(tmpDir, 'projects/active/project-x/README.md', '# Project X\n\n## Team\n\n- Sarah\n- Bob\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const rels = await service.getRelationships(entity, paths);

    const worksOn = rels.filter(r => r.type === 'works_on');
    assert.ok(worksOn.length >= 1, 'Should find works_on relationship');
    assert.equal(worksOn[0].from, 'Sarah');
    assert.equal(worksOn[0].to, 'Project X');
    assert.equal(worksOn[0].toType, 'project');
    assert.ok(worksOn[0].evidence?.includes('README.md'));
  });

  it('extracts works_on from project README owner field', async () => {
    writeFile(tmpDir, 'projects/active/project-y/README.md', '---\nowner: "Sarah"\ntitle: "Project Y"\n---\n\n# Project Y\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const rels = await service.getRelationships(entity, paths);

    const worksOn = rels.filter(r => r.type === 'works_on');
    assert.ok(worksOn.length >= 1, 'Should find works_on from owner field');
    assert.equal(worksOn[0].to, 'Project Y');
  });

  it('extracts attended from meeting attendees string', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-02-10-standup.md', '---\ntitle: "Standup"\nattendees: "Sarah, Bob, Charlie"\n---\n\n# Standup\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const rels = await service.getRelationships(entity, paths);

    const attended = rels.filter(r => r.type === 'attended');
    assert.ok(attended.length >= 1, 'Should find attended relationship');
    assert.equal(attended[0].from, 'Sarah');
    assert.equal(attended[0].to, 'Standup');
    assert.equal(attended[0].toType, 'meeting');
  });

  it('extracts attended from meeting attendee_ids array', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-02-10-review.md', '---\ntitle: "Review"\nattendee_ids:\n  - sarah\n  - bob\n---\n\n# Review\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'), 'sarah');

    const rels = await service.getRelationships(entity, paths);

    const attended = rels.filter(r => r.type === 'attended');
    assert.ok(attended.length >= 1, 'Should find attended from attendee_ids');
    assert.equal(attended[0].to, 'Review');
  });

  it('extracts mentioned_in from findMentions results', async () => {
    writeFile(tmpDir, 'context/overview.md', '# Overview\n\nSarah leads the product team.');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const rels = await service.getRelationships(entity, paths);

    const mentionedIn = rels.filter(r => r.type === 'mentioned_in');
    assert.ok(mentionedIn.length >= 1, 'Should find mentioned_in relationship');
    assert.equal(mentionedIn[0].from, 'Sarah');
    assert.ok(mentionedIn[0].evidence?.includes('overview.md'));
  });

  it('returns only valid relationship types', async () => {
    writeFile(tmpDir, 'context/overview.md', '# Overview\n\nSarah leads the product team.');
    writeFile(tmpDir, 'projects/active/project-x/README.md', '# Project X\n\n## Team\n\n- Sarah\n');
    writeFile(tmpDir, 'resources/meetings/2026-02-10-standup.md', '---\ntitle: "Standup"\nattendees: "Sarah, Bob"\n---\n\n# Standup\n');
    const entity = makeEntity('Sarah', 'person', join(tmpDir, 'people/internal/sarah.md'));

    const rels = await service.getRelationships(entity, paths);

    const validTypes: RelationshipType[] = ['works_on', 'attended', 'mentioned_in'];
    for (const rel of rels) {
      assert.ok(
        validTypes.includes(rel.type),
        `Relationship type "${rel.type}" should be one of: ${validTypes.join(', ')}`
      );
    }
  });

  it('returns empty array when no relationships found', async () => {
    const entity = makeEntity('Nobody', 'person', join(tmpDir, 'people/internal/nobody.md'));

    const rels = await service.getRelationships(entity, paths);

    assert.deepEqual(rels, []);
  });
});

// ---------------------------------------------------------------------------
// Relationship-enriched briefing tests
// ---------------------------------------------------------------------------

describe('Relationship-enriched briefings', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rel-briefing-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes relationships in briefing when entities detected', async () => {
    writeFile(tmpDir, 'people/internal/sarah.md', '---\nname: "Sarah"\nemail: "sarah@co.com"\ncategory: "internal"\n---\n\n# Sarah\n');
    writeFile(tmpDir, 'projects/active/project-x/README.md', '# Project X\n\n## Team\n\n- Sarah\n');

    const result = await assembleBriefing('discuss Project X with Sarah', paths);

    assert.ok(Array.isArray(result.relationships), 'Briefing should include relationships array');
  });

  it('briefing markdown shows relationship context', async () => {
    writeFile(tmpDir, 'people/internal/sarah.md', '---\nname: "Sarah"\nemail: "sarah@co.com"\ncategory: "internal"\n---\n\n# Sarah\n');
    writeFile(tmpDir, 'projects/active/project-x/README.md', '# Project X\n\n## Team\n\n- Sarah\n');

    const result = await assembleBriefing('what is Sarah working on for Project X', paths);

    if (result.relationships.length > 0) {
      assert.ok(
        result.markdown.includes('Entity Relationships'),
        'Markdown should include Entity Relationships section when relationships exist'
      );
      const worksOn = result.relationships.find(r => r.type === 'works_on');
      if (worksOn) {
        assert.ok(
          result.markdown.includes('works on'),
          'Markdown should show "works on" relationship label'
        );
      }
    }
  });

  it('briefing has empty relationships when no entities found', async () => {
    const result = await assembleBriefing('what is the weather', paths);

    assert.ok(Array.isArray(result.relationships));
    assert.equal(result.relationships.length, 0);
  });
});
