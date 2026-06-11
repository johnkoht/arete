/**
 * Phase 14 AC2 — project topics-cache compute/diff/write.
 *
 * Real fs + FileStorageAdapter (no mocks for memory/storage ops). The
 * TopicMemoryService is constructed WITHOUT a search provider so
 * `retrieveWiki` takes its deterministic fallback path (listAll +
 * alias-jaccard) — scores are reproducible, which the floor tests need.
 *
 * NOTE (AC4 regression wall): the phase-12 zero-write suite lives in
 * project-area.test.ts and is byte-frozen this phase — all phase-14
 * tests live HERE.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { AreaMemoryService } from '../../src/services/area-memory.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import { getSearchProvider } from '../../src/search/factory.js';
import {
  computeProjectTopicsRefresh,
  applyProjectTopics,
  sameSlugSet,
  PROJECT_TOPICS_CAP,
  PROJECT_TOPICS_SCORE_FLOOR,
  PROJECT_TOPICS_OWNERSHIP_COMMENT,
} from '../../src/services/project-topics.js';
import type { WorkspacePaths } from '../../src/models/index.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    managedSkills: join(root, '.arete', 'skills'),
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

/** Counting adapter — the R2 assertion is "zero write CALLS", not "same content". */
const counts = { write: 0, append: 0, delete: 0 };
class CountingAdapter extends FileStorageAdapter {
  override async write(path: string, content: string): Promise<void> {
    counts.write += 1;
    return super.write(path, content);
  }
  override async append(path: string, content: string): Promise<void> {
    counts.append += 1;
    return super.append(path, content);
  }
  override async delete(path: string): Promise<void> {
    counts.delete += 1;
    return super.delete(path);
  }
}

function resetCounts(): void {
  counts.write = 0;
  counts.append = 0;
  counts.delete = 0;
}

function topicPage(slug: string, area?: string, aliases: string[] = []): string {
  return `---
topic_slug: ${slug}
status: active
first_seen: 2026-05-01
last_refreshed: 2026-06-07
sources_integrated: []
aliases: [${aliases.map((a) => `"${a}"`).join(', ')}]
${area ? `area: ${area}` : ''}
---

# ${slug}

## Current state
Something.
`;
}

describe('project-topics compute/diff/write (Phase 14 AC2)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let storage: CountingAdapter;
  let topicMemory: TopicMemoryService;

  const write = (rel: string, content: string): string => {
    const p = join(tmpDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
    return p;
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'p14-topics-'));
    paths = makePaths(tmpDir);
    resetCounts();
    storage = new CountingAdapter();
    // NO search provider → retrieveWiki deterministic fallback path.
    topicMemory = new TopicMemoryService(storage, undefined);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const PROJECT = `---
title: Snapsheet Task Replacement
area: glance-2-mvp
status: active
---

# Snapsheet Task Replacement

Replacing snapsheet tasks.
`;

  it('computes top topics above the floor with scores; weak match is below-floor excluded', async () => {
    write('projects/active/snapsheet-task-replacement/README.md', PROJECT);
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );
    // One shared token ("task") — genuinely weak (review finding 3 fixture).
    write('.arete/memory/topics/task-board.md', topicPage('task-board', 'glance-2-mvp'));

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res);
    assert.deepEqual(
      res.computed.map((c) => c.slug),
      ['snapsheet-task-replacement'],
    );
    // Wide-margin separation on the fallback scale (pre-mortem D6).
    assert.ok(
      res.computed[0].score >= PROJECT_TOPICS_SCORE_FLOOR + 0.1,
      `strong score ${res.computed[0].score} should clear the floor with margin`,
    );
    const weak = res.belowFloor.find((b) => b.slug === 'task-board');
    assert.ok(weak, 'weak match must be reported below-floor, not silently dropped');
    assert.ok(
      weak.score <= PROJECT_TOPICS_SCORE_FLOOR - 0.1,
      `weak score ${weak.score} should sit below the floor with margin`,
    );
    assert.equal(res.changed, true);
    assert.deepEqual(res.current, []);
  });

  it('honors the cap: never more than PROJECT_TOPICS_CAP slugs even when more clear the floor', async () => {
    write('projects/active/snapsheet-task-replacement/README.md', PROJECT);
    for (let i = 1; i <= PROJECT_TOPICS_CAP + 2; i++) {
      write(
        `.arete/memory/topics/strong-${i}.md`,
        topicPage(`strong-${i}`, 'glance-2-mvp', ['snapsheet-task-replacement']),
      );
    }
    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res);
    assert.equal(res.computed.length, PROJECT_TOPICS_CAP);
  });

  it('R2 change gate: same slug set (any order) → changed=false and apply performs ZERO write calls', async () => {
    write(
      'projects/active/snapsheet-task-replacement/README.md',
      `---
title: Snapsheet Task Replacement
area: glance-2-mvp
status: active
topics:
  - snapsheet-task-replacement
topics_refreshed: 2026-06-01
---

${PROJECT_TOPICS_OWNERSHIP_COMMENT}

# Snapsheet Task Replacement

Replacing snapsheet tasks.
`,
    );
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res);
    assert.equal(res.changed, false);
    assert.deepEqual(res.current, ['snapsheet-task-replacement']);
    assert.equal(res.currentRefreshed, '2026-06-01');

    const before = readFileSync(res.readmePath, 'utf8');
    resetCounts();
    const applied = await applyProjectTopics(storage, res, { today: '2026-06-11' });
    assert.equal(applied.written, false);
    assert.deepEqual(counts, { write: 0, append: 0, delete: 0 });
    assert.equal(readFileSync(res.readmePath, 'utf8'), before);
    // topics_refreshed NOT bumped on a no-op (R2: no date-only churn).
    assert.match(readFileSync(res.readmePath, 'utf8'), /topics_refreshed: 2026-06-01/);
  });

  it('sameSlugSet is order-insensitive', () => {
    assert.equal(sameSlugSet(['a', 'b'], ['b', 'a']), true);
    assert.equal(sameSlugSet(['a'], ['a', 'b']), false);
    assert.equal(sameSlugSet([], []), true);
  });

  it('slug-set change → single wholesale rewrite (topics + topics_refreshed + ownership comment once); rerun → zero writes, byte-identical', async () => {
    write('projects/active/snapsheet-task-replacement/README.md', PROJECT);
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res && res.changed);
    resetCounts();
    const applied = await applyProjectTopics(storage, res, { today: '2026-06-11' });
    assert.equal(applied.written, true);
    assert.deepEqual(counts, { write: 1, append: 0, delete: 0 });

    const content = readFileSync(res.readmePath, 'utf8');
    assert.match(content, /topics:\n\s+- snapsheet-task-replacement/);
    assert.match(content, /topics_refreshed: 2026-06-11/);
    const occurrences = content.split('topics: maintained by arete').length - 1;
    assert.equal(occurrences, 1, 'ownership comment inserted exactly once');
    assert.match(content, /## |# Snapsheet Task Replacement/, 'body preserved');

    // Rerun with unchanged wiki state — the AC8 shape at core level.
    const res2 = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res2);
    assert.equal(res2.changed, false);
    resetCounts();
    const applied2 = await applyProjectTopics(storage, res2, { today: '2026-06-12' });
    assert.equal(applied2.written, false);
    assert.deepEqual(counts, { write: 0, append: 0, delete: 0 });
    assert.equal(readFileSync(res.readmePath, 'utf8'), content, 'byte-identical after first apply');
  });

  it('ownership comment preserved (not duplicated) on a later rewrite; hand-moved sentinel respected (D7)', async () => {
    write(
      'projects/active/snapsheet-task-replacement/README.md',
      `---
title: Snapsheet Task Replacement
area: glance-2-mvp
topics:
  - stale-old-topic
topics_refreshed: 2026-05-01
---

# Snapsheet Task Replacement

Some intro.

${PROJECT_TOPICS_OWNERSHIP_COMMENT}

More body.
`,
    );
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res && res.changed, 'cached set differs from computed → changed');
    await applyProjectTopics(storage, res, { today: '2026-06-11' });
    const content = readFileSync(res.readmePath, 'utf8');
    const occurrences = content.split('topics: maintained by arete').length - 1;
    assert.equal(occurrences, 1, 'hand-moved comment NOT re-inserted at top');
    assert.match(content, /Some intro\.\n\n<!-- topics: maintained by arete/);
    assert.match(content, /topics:\n\s+- snapsheet-task-replacement/);
    assert.doesNotMatch(content, /stale-old-topic/, 'wholesale rewrite replaces the old set');
  });

  it('lossless frontmatter round-trip: nested jira:/notion: blocks survive the rewrite', async () => {
    write(
      'projects/active/snapsheet-task-replacement/README.md',
      `---
title: Snapsheet Task Replacement
area: glance-2-mvp
status: active
jira:
  idea: GL-12
  epic: GL-40
notion:
  page: abc-123
  database: def-456
---

# Snapsheet Task Replacement

Body text.
`,
    );
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res && res.changed);
    await applyProjectTopics(storage, res, { today: '2026-06-11' });
    const content = readFileSync(res.readmePath, 'utf8');
    assert.match(content, /jira:\n\s+idea: GL-12\n\s+epic: GL-40/);
    assert.match(content, /notion:\n\s+page: abc-123\n\s+database: def-456/);
    assert.match(content, /title: Snapsheet Task Replacement/);
    assert.match(content, /Body text\./);
  });

  it('body starting with an unrelated HTML comment: ownership comment inserted as its own line (D7)', async () => {
    write(
      'projects/active/snapsheet-task-replacement/README.md',
      `---
title: Snapsheet Task Replacement
area: glance-2-mvp
---
<!-- generated by create-prd -->
# Snapsheet Task Replacement
`,
    );
    write(
      '.arete/memory/topics/snapsheet-task-replacement.md',
      topicPage('snapsheet-task-replacement', 'glance-2-mvp'),
    );

    const res = await computeProjectTopicsRefresh(
      storage,
      topicMemory,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res && res.changed);
    await applyProjectTopics(storage, res, { today: '2026-06-11' });
    const content = readFileSync(res.readmePath, 'utf8');
    assert.match(
      content,
      /---\n\n<!-- topics: maintained by arete[^\n]*-->\n\n<!-- generated by create-prd -->\n# Snapsheet Task Replacement/,
    );
  });

  it('retrieval failure → retrievalFailed + changed=false (a transient error never empties a legit cache)', async () => {
    write(
      'projects/active/snapsheet-task-replacement/README.md',
      `---
title: Snapsheet Task Replacement
area: glance-2-mvp
topics:
  - snapsheet-task-replacement
topics_refreshed: 2026-06-01
---

# Snapsheet Task Replacement
`,
    );
    const failing = {
      retrieveRelevant: async () => ({ results: [], searchBackend: 'none' as const }),
      listAll: async () => {
        throw new Error('boom');
      },
    } as unknown as TopicMemoryService;

    const res = await computeProjectTopicsRefresh(
      storage,
      failing,
      paths,
      'snapsheet-task-replacement',
    );
    assert.ok(res);
    assert.equal(res.retrievalFailed, true);
    assert.equal(res.changed, false);
    resetCounts();
    const applied = await applyProjectTopics(storage, res, { today: '2026-06-11' });
    assert.equal(applied.written, false);
    assert.deepEqual(counts, { write: 0, append: 0, delete: 0 });
  });

  it('returns null for a project with no README', async () => {
    const res = await computeProjectTopicsRefresh(storage, topicMemory, paths, 'nope');
    assert.equal(res, null);
  });
});

describe('R10 guard — topics cache must not become load-bearing (Phase 14 AC4)', () => {
  let tmpA: string;
  let tmpB: string;

  afterEach(() => {
    if (tmpA) rmSync(tmpA, { recursive: true, force: true });
    if (tmpB) rmSync(tmpB, { recursive: true, force: true });
  });

  function buildIntel(root: string) {
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(root);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);
    const commitments = new CommitmentsService(storage, root);
    const topicMemory = new TopicMemoryService(storage, search);
    const areaParser = new AreaParserService(storage, root);
    const areaMemory = new AreaMemoryService(storage, areaParser, commitments, memory, topicMemory);
    const intelligence = new IntelligenceService(context, memory, entity);
    intelligence.setBriefDependencies({
      commitments,
      topicMemory,
      areaMemory,
      areaParser,
      storage,
      searchProvider: search,
    });
    return intelligence;
  }

  function writeWorkspaceProject(root: string, withCache: boolean): void {
    const dir = join(root, 'projects', 'active', 'guard-project');
    mkdirSync(dir, { recursive: true });
    const cache = withCache
      ? `topics:\n  - some-cached-topic\ntopics_refreshed: 2026-06-01\n`
      : '';
    writeFileSync(
      join(dir, 'README.md'),
      `---
title: Guard Project
area: guard-area
status: active
${cache}---

# Guard Project

## Background

The same project either way.
`,
      'utf8',
    );
  }

  it('behavioral: the project brief is IDENTICAL with and without the topics cache (no section/metadata branches on it)', async () => {
    tmpA = mkdtempSync(join(tmpdir(), 'p14-r10-a-'));
    tmpB = mkdtempSync(join(tmpdir(), 'p14-r10-b-'));
    writeWorkspaceProject(tmpA, false);
    writeWorkspaceProject(tmpB, true);

    const briefA = await buildIntel(tmpA).assembleBriefForProject('guard-project', makePaths(tmpA));
    const briefB = await buildIntel(tmpB).assembleBriefForProject('guard-project', makePaths(tmpB));

    assert.deepEqual(briefB.sections, briefA.sections);
    assert.deepEqual(briefB.metadata, briefA.metadata);
    assert.equal(briefB.subject, briefA.subject);
  });

  it('source tripwire: no brief assembler/formatter code reads project.topics (fails loudly when a consumer appears)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const servicesDir = join(here, '..', '..', 'src', 'services');
    const assemblers = readFileSync(join(servicesDir, 'brief-assemblers.ts'), 'utf8');
    const formatters = readFileSync(join(servicesDir, 'brief-formatters.ts'), 'utf8');

    // ActiveProject instances are bound to `project` / `p` in the
    // assemblers. The cache is populated via the parseTopicsCache spread
    // only — any direct property READ is a new consumer and must first
    // make the cache authoritative (pre-mortem R10).
    assert.doesNotMatch(assemblers, /\bproject\.topics/);
    assert.doesNotMatch(assemblers, /\bp\.topics/);
    assert.doesNotMatch(assemblers, /\bproject\.topicsRefreshed/);
    assert.doesNotMatch(formatters, /topicsRefreshed|parseTopicsCache/);
  });
});
