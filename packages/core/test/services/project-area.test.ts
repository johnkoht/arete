/**
 * Phase 12 AC2 — project-area backfill helpers.
 *
 * Real fs + FileStorageAdapter (no mocks for memory/storage ops).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { AreaMemoryService } from '../../src/services/area-memory.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import {
  listProjectsForBackfill,
  applyAreaToProjectReadme,
  resetBackfilledProjectAreas,
} from '../../src/services/project-area.js';
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

function writeProject(root: string, slug: string, content: string): string {
  const dir = join(root, 'projects', 'active', slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'README.md');
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('project-area backfill helpers (Phase 12 AC2)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `project-area-${process.pid}-`));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('listProjectsForBackfill: inference text = Background + Key Questions; area resolution annotated', async () => {
    writeProject(
      tmpDir,
      'no-area',
      `---
title: Claims Review Generator
status: active
---

# Claims Review Generator

## Background
Generate claims reviews automatically.

## Key Questions
Which review template fits POP?

## Other
Should not appear in inference text.
`,
    );
    writeProject(
      tmpDir,
      'prose-area',
      `---
title: Prose Area Project
---

**Area**: [G](../../../areas/glance-2-mvp.md)
`,
    );

    const list = await listProjectsForBackfill(storage, paths);
    const noArea = list.find((p) => p.slug === 'no-area')!;
    assert.equal(noArea.area, undefined);
    assert.equal(noArea.title, 'Claims Review Generator');
    assert.ok(/Generate claims reviews/.test(noArea.inferenceSummary));
    assert.ok(/Which review template/.test(noArea.inferenceSummary));
    assert.ok(!/Should not appear/.test(noArea.inferenceSummary));

    const prose = list.find((p) => p.slug === 'prose-area')!;
    assert.equal(prose.area, 'glance-2-mvp');
    assert.equal(prose.areaSource, 'prose');
  });

  it('applyAreaToProjectReadme: writes both keys, preserves body + nested frontmatter, idempotent', async () => {
    const path = writeProject(
      tmpDir,
      'apply-me',
      `---
title: Apply Me
status: active
notion:
  roadmap:
    url: "https://example.com/x"
    page_id: "abc-123"
---

# Apply Me

**Bold body content** stays put.

## Background
Body preserved verbatim.
`,
    );

    await applyAreaToProjectReadme(storage, path, 'glance-2-mvp', 'backfill');
    const once = readFileSync(path, 'utf8');
    assert.ok(/area: glance-2-mvp/.test(once));
    assert.ok(/area_set_by: backfill/.test(once));
    assert.ok(/title: Apply Me/.test(once));
    assert.ok(/page_id: abc-123|page_id: "abc-123"/.test(once));
    assert.ok(/\*\*Bold body content\*\* stays put\./.test(once));
    assert.ok(/Body preserved verbatim\./.test(once));

    await applyAreaToProjectReadme(storage, path, 'glance-2-mvp', 'backfill');
    const twice = readFileSync(path, 'utf8');
    assert.equal(twice, once, 'second apply must be byte-identical (idempotent)');
  });

  it('resetBackfilledProjectAreas: clears only backfill-stamped; creation provenance untouched', async () => {
    const backfilled = writeProject(
      tmpDir,
      'backfilled',
      `---
title: Backfilled
area: glance-2-mvp
area_set_by: backfill
---

# Backfilled
`,
    );
    const creation = writeProject(
      tmpDir,
      'created-with-area',
      `---
title: Created
area: glance-comms
area_set_by: creation
---

# Created
`,
    );
    const manual = writeProject(
      tmpDir,
      'manual-area',
      `---
title: Manual
area: ops
---

# Manual
`,
    );

    const result = await resetBackfilledProjectAreas(storage, paths);
    assert.deepEqual(result.reset, ['backfilled']);

    const backfilledAfter = readFileSync(backfilled, 'utf8');
    assert.ok(!/area:/.test(backfilledAfter));
    assert.ok(!/area_set_by/.test(backfilledAfter));

    assert.ok(/area: glance-comms/.test(readFileSync(creation, 'utf8')));
    assert.ok(/area_set_by: creation/.test(readFileSync(creation, 'utf8')));
    assert.ok(/area: ops/.test(readFileSync(manual, 'utf8')));
  });
});

// ---------------------------------------------------------------------------
// Phase 12 AC3 — what's-new delta + zero-write guarantee
// ---------------------------------------------------------------------------

describe('assembleProjectWhatsNew (Phase 12 AC3)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `whats-new-${process.pid}-`));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function write(rel: string, content: string): string {
    const full = join(tmpDir, rel);
    mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
    writeFileSync(full, content, 'utf8');
    return full;
  }

  function buildIntel() {
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);
    const commitments = new CommitmentsService(storage, tmpDir);
    const topicMemory = new TopicMemoryService(storage, search);
    const areaParser = new AreaParserService(storage, tmpDir);
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

  it('returns meetings, fresher topics, newly-opened commitments after README mtime; older items excluded', async () => {
    const readmePath = write(
      'projects/active/glance-2-mvp/README.md',
      `---
title: Glance 2 MVP
area: glance-2-mvp
status: active
---

# Glance 2 MVP
`,
    );
    // Pin README mtime to 2026-06-01.
    const pinned = new Date('2026-06-01T12:00:00Z');
    utimesSync(readmePath, pinned, pinned);

    write(
      'resources/meetings/2026-06-05-after.md',
      `---
title: After meeting
date: 2026-06-05
attendee_ids: [john]
area: glance-2-mvp
---
`,
    );
    write(
      'resources/meetings/2026-05-20-before.md',
      `---
title: Before meeting
date: 2026-05-20
attendee_ids: [john]
area: glance-2-mvp
---
`,
    );
    write(
      '.arete/memory/topics/pop-migration.md',
      `---
topic_slug: pop-migration
status: active
first_seen: 2026-05-01
last_refreshed: 2026-06-07
sources_integrated: []
aliases: []
area: glance-2-mvp
---

# POP Migration

## Current state
Fresh.
`,
    );
    write(
      '.arete/memory/topics/stale-topic.md',
      `---
topic_slug: stale-topic
status: active
first_seen: 2026-04-01
last_refreshed: 2026-05-01
sources_integrated: []
aliases: []
area: glance-2-mvp
---

# Stale

## Current state
Old.
`,
    );
    write(
      '.arete/commitments.json',
      JSON.stringify({
        commitments: [
          {
            id: 'new11111new11111new11111new11111new11111new11111new11111new11111',
            text: 'New commitment',
            direction: 'i_owe_them',
            personSlug: 'p',
            personName: 'P',
            source: 's.md',
            date: '2026-06-06',
            createdAt: '2026-06-06T09:00:00Z',
            status: 'open',
            resolvedAt: null,
            area: 'glance-2-mvp',
          },
          {
            id: 'old22222old22222old22222old22222old22222old22222old22222old22222',
            text: 'Old commitment',
            direction: 'i_owe_them',
            personSlug: 'p',
            personName: 'P',
            source: 's.md',
            date: '2026-05-01',
            createdAt: '2026-05-01T09:00:00Z',
            status: 'open',
            resolvedAt: null,
            area: 'glance-2-mvp',
          },
        ],
      }),
    );

    const intel = buildIntel();
    const delta = await intel.assembleProjectWhatsNew('glance-2-mvp', paths);
    assert.ok(delta && !delta.sinceUnknown);
    assert.deepEqual(delta!.meetings.map((m) => m.title), ['After meeting']);
    assert.deepEqual(delta!.topics.map((t) => t.slug), ['pop-migration']);
    assert.deepEqual(delta!.commitments.map((c) => c.text), ['New commitment']);
  });

  it('zero writes: counting adapter sees no write/append/delete during open assembly', async () => {
    write(
      'projects/active/quiet-project/README.md',
      `---
title: Quiet
area: quiet-area
status: active
---

# Quiet

Linked sibling: [sib](../some-sibling/README.md)
`,
    );

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

    const storage = new CountingAdapter();
    const search = getSearchProvider(tmpDir);
    const context = new ContextService(storage, search);
    const memory = new MemoryService(storage, search);
    const entity = new EntityService(storage);
    const commitments = new CommitmentsService(storage, tmpDir);
    const topicMemory = new TopicMemoryService(storage, search);
    const areaParser = new AreaParserService(storage, tmpDir);
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

    await intelligence.assembleBriefForProject('quiet-project', paths);
    await intelligence.assembleProjectWhatsNew('quiet-project', paths);

    assert.deepEqual(counts, { write: 0, append: 0, delete: 0 });
  });

  it('sinceUnknown when README missing mtime path entirely (project not found → null)', async () => {
    const intel = buildIntel();
    assert.equal(await intel.assembleProjectWhatsNew('nope', paths), null);
  });
});
