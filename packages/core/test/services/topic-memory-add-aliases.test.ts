/**
 * I-5 — `TopicMemoryService.addAliases` no-LLM frontmatter writer.
 *
 * Covers: happy path (writes + sorts), dedupe of already-present aliases,
 * canonical-slug-never-self-aliased, idempotent re-add (no-op), and the
 * nonexistent-page error. The alias-aware re-integration this enables lives
 * in `refreshAllFromSources` (AC2) and is exercised by the discovery tests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { renderTopicPage, parseTopicPage } from '../../src/models/topic-page.js';
import type { TopicPage } from '../../src/models/topic-page.js';
import type { WorkspacePaths } from '../../src/models/workspace.js';

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

function samplePage(overrides: Partial<TopicPage['frontmatter']> = {}): TopicPage {
  return {
    frontmatter: {
      topic_slug: 'email-templates',
      status: 'active',
      first_seen: '2026-03-02',
      last_refreshed: '2026-04-15',
      sources_integrated: [],
      ...overrides,
    },
    sections: {
      'Current state': 'Canonical email templates page.',
    },
  };
}

describe('TopicMemoryService.addAliases (I-5)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  const storage = new FileStorageAdapter();
  const service = new TopicMemoryService(storage);

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'add-aliases-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePage(page: TopicPage): string {
    const dir = join(paths.memory, 'topics');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${page.frontmatter.topic_slug}.md`);
    writeFileSync(file, renderTopicPage(page), 'utf8');
    return file;
  }

  async function readBack(slug: string): Promise<TopicPage> {
    const content = await storage.read(join(paths.memory, 'topics', `${slug}.md`));
    assert.ok(content !== null, 'page should exist on disk');
    const parsed = parseTopicPage(content!);
    assert.ok(parsed !== null, 'page should parse');
    return parsed!;
  }

  it('happy path: appends aliases and sorts them, persists to disk', async () => {
    writePage(samplePage());
    const result = await service.addAliases(paths, 'email-templates', [
      'default-email-template',
      'auto-email-templates',
    ]);

    assert.strictEqual(result.slug, 'email-templates');
    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(result.added.sort(), ['auto-email-templates', 'default-email-template']);
    // Sorted ASCII (matches render-time normalization).
    assert.deepStrictEqual(result.aliases, ['auto-email-templates', 'default-email-template']);

    const onDisk = await readBack('email-templates');
    assert.deepStrictEqual(onDisk.frontmatter.aliases, ['auto-email-templates', 'default-email-template']);
  });

  it('unions with existing aliases and dedupes (existing alias re-added is dropped)', async () => {
    writePage(samplePage({ aliases: ['default-email-template'] }));
    const result = await service.addAliases(paths, 'email-templates', [
      'default-email-template', // already present → dropped from `added`
      'campaign-emails',
    ]);

    assert.deepStrictEqual(result.added, ['campaign-emails']);
    assert.deepStrictEqual(result.aliases, ['campaign-emails', 'default-email-template']);
    assert.strictEqual(result.changed, true);
  });

  it('dedupes duplicate aliases within the same call', async () => {
    writePage(samplePage());
    const result = await service.addAliases(paths, 'email-templates', [
      'campaign-emails',
      'campaign-emails',
    ]);
    assert.deepStrictEqual(result.added, ['campaign-emails']);
    assert.deepStrictEqual(result.aliases, ['campaign-emails']);
  });

  it('never records the canonical slug as its own alias', async () => {
    writePage(samplePage());
    const result = await service.addAliases(paths, 'email-templates', [
      'email-templates', // self → skipped
      'campaign-emails',
    ]);
    assert.deepStrictEqual(result.added, ['campaign-emails']);
    assert.ok(!result.aliases.includes('email-templates'));
  });

  it('idempotent: re-adding only already-present aliases is a no-op (changed=false)', async () => {
    writePage(samplePage({ aliases: ['default-email-template'] }));
    const result = await service.addAliases(paths, 'email-templates', ['default-email-template']);
    assert.deepStrictEqual(result.added, []);
    assert.strictEqual(result.changed, false);
    assert.deepStrictEqual(result.aliases, ['default-email-template']);
  });

  it('ignores blank/whitespace aliases', async () => {
    writePage(samplePage());
    const result = await service.addAliases(paths, 'email-templates', ['  ', '', 'real-alias']);
    assert.deepStrictEqual(result.added, ['real-alias']);
  });

  it('throws on a nonexistent topic page', async () => {
    mkdirSync(join(paths.memory, 'topics'), { recursive: true });
    await assert.rejects(
      () => service.addAliases(paths, 'does-not-exist', ['x']),
      /Topic page not found: does-not-exist/,
    );
  });
});
