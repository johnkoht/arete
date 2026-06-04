/**
 * Phase 9 — assembleBriefForArea tests (AC3).
 *
 * Verifies area memory excerpt, active projects, recent meetings,
 * open commitments, decisions/learnings — all filtered by area slug.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(full.substring(0, full.lastIndexOf('/')), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function buildIntel(root: string): IntelligenceService {
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

describe('IntelligenceService.assembleBriefForArea', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-area-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC3: composes area memory + projects + meetings + commitments + decisions', async () => {
    // Area definition (areas/<slug>.md)
    writeFile(
      tmpDir,
      'areas/claims-modernization.md',
      `---
area: Claims Modernization
status: active
---

## Goal
Bring claims surface to v2.

## Focus
Adjuster experience.
`,
    );

    // Area memory page (.arete/memory/areas/<slug>.md)
    writeFile(
      tmpDir,
      '.arete/memory/areas/claims-modernization.md',
      `---
area: claims-modernization
last_refreshed: 2026-06-01
---

# Claims Modernization

## Summary
Recent work has focused on POP migration timeline and adjuster discovery cadence.
`,
    );

    // Project in area
    writeFile(
      tmpDir,
      'projects/active/glance-2-mvp/README.md',
      `---
name: Glance 2 MVP
area: claims-modernization
status: active
---

# Glance 2 MVP
`,
    );

    // Meeting tagged to area
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-claims-sync.md',
      `---
title: Claims sync
date: 2026-05-15
attendee_ids:
  - john
  - lindsay-gray
area: claims-modernization
---

## Summary
Discussed POP migration plan.
`,
    );

    // Commitment in area
    writeFile(
      tmpDir,
      '.arete/commitments.json',
      JSON.stringify({
        commitments: [
          {
            id: 'aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111',
            text: 'Draft POP migration timeline',
            direction: 'i_owe_them',
            personSlug: 'lindsay-gray',
            personName: 'Lindsay',
            source: '2026-05-15-claims-sync.md',
            date: '2026-05-15',
            status: 'open',
            resolvedAt: null,
            area: 'claims-modernization',
          },
        ],
      }),
    );

    // Decision in area
    writeFile(
      tmpDir,
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-05-15: Use phased POP migration
Area: claims-modernization

We decided to phase POP migration over two quarters.
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForArea('claims-modernization', paths);

    assert.equal(brief.mode, 'area');
    assert.equal(brief.subjectSlug, 'claims-modernization');
    assert.equal(brief.metadata.name, 'Claims Modernization');

    const headings = brief.sections.map((s) => s.heading);
    assert.ok(headings.includes('Area memory'), `missing Area memory; got ${headings.join(', ')}`);
    assert.ok(
      headings.some((h) => h.startsWith('Active projects')),
      `missing Active projects; got ${headings.join(', ')}`,
    );
    assert.ok(
      headings.some((h) => h.startsWith('Recent meetings')),
      `missing Recent meetings; got ${headings.join(', ')}`,
    );
    assert.ok(
      headings.some((h) => h.startsWith('Open commitments')),
      `missing Open commitments; got ${headings.join(', ')}`,
    );
    assert.ok(
      headings.some((h) => h.startsWith('Decisions & learnings')),
      `missing Decisions & learnings; got ${headings.join(', ')}`,
    );

    // Area memory body
    const am = brief.sections.find((s) => s.heading === 'Area memory');
    assert.ok(am);
    assert.ok(/POP migration/.test(am!.body ?? ''));

    // Active projects lists Glance 2
    const projects = brief.sections.find((s) => s.heading.startsWith('Active projects'));
    assert.ok(projects);
    assert.ok(projects!.bullets.some((b) => /Glance 2 MVP/.test(b)));

    // Sources include area memory + area definition + project + meeting
    assert.ok(brief.sources.some((s) => s.includes('claims-modernization.md')));
  });

  it('returns empty AreaBrief when area not found', async () => {
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForArea('does-not-exist', paths);
    assert.equal(brief.subjectSlug, 'does-not-exist');
    assert.equal(brief.sections.length, 0);
  });
});
