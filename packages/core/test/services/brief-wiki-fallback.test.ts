/**
 * Phase 9 — AC5 wiki integration coverage.
 *
 * Two fixture tests per mode:
 *  - With a configured SearchProvider stub → exercises retrieveRelevant() path
 *  - Without a SearchProvider          → exercises listAll() + tokenizeSlug() fallback
 *
 * Verifies the `## Related wiki pages` section appears with expected matches.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import { AreaMemoryService } from '../../src/services/area-memory.js';
import { AreaParserService } from '../../src/services/area-parser.js';
import type { SearchProvider, SearchResult } from '../../src/search/types.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import { wikiStalenessLabel } from '../../src/services/brief-assemblers.js';

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

/** Minimal SearchProvider stub that returns the given topic page paths. */
function fakeSearchProvider(topicPaths: string[]): SearchProvider {
  return {
    name: 'qmd',
    isAvailable: async () => true,
    search: async (): Promise<SearchResult[]> => [],
    semanticSearch: async (_q, _opts): Promise<SearchResult[]> => {
      return topicPaths.map((p, i) => ({
        path: p,
        score: 0.9 - i * 0.1,
        content: '(snippet)',
        matchType: 'semantic' as const,
      }));
    },
  };
}

function buildIntel(root: string, search: SearchProvider | undefined): IntelligenceService {
  const storage = new FileStorageAdapter();
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

function fixtureWiki(tmpDir: string): void {
  // Two topic pages — one with an alias matching Lindsay, one unrelated.
  writeFile(
    tmpDir,
    '.arete/memory/topics/glance-2-roadmap.md',
    `---
topic_slug: glance-2-roadmap
status: active
first_seen: 2026-05-01
last_refreshed: 2026-06-01
sources_integrated: []
aliases:
  - Glance 2
  - Glance 2 MVP
  - Lindsay
area: glance-modernization
---

# Glance 2 Roadmap

## Current state
Story mapping in progress; alpha targets Q3.

## Why/background
Lindsay leads the rollout effort.
`,
  );
  writeFile(
    tmpDir,
    '.arete/memory/topics/unrelated-topic.md',
    `---
topic_slug: unrelated-topic
status: active
first_seen: 2026-05-01
last_refreshed: 2026-06-01
sources_integrated: []
aliases:
  - Unrelated
---

# Unrelated

## Current state
.
`,
  );
}

function fixtureBasicPerson(tmpDir: string): void {
  writeFile(
    tmpDir,
    'people/internal/lindsay-gray.md',
    `---
name: Lindsay Gray
role: Manager
aliases:
  - Lindsay
---

# Lindsay
`,
  );
  writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
}

describe('AC5: wiki integration', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-wiki-'));
    paths = makePaths(tmpDir);
    fixtureWiki(tmpDir);
    fixtureBasicPerson(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exercises retrieveRelevant() path when SearchProvider is configured', async () => {
    const search = fakeSearchProvider([
      join(tmpDir, '.arete/memory/topics/glance-2-roadmap.md'),
    ]);
    const intel = buildIntel(tmpDir, search);
    const brief = await intel.assembleBriefForPerson('lindsay-gray', paths);
    const wiki = brief.sections.find((s) => s.heading.startsWith('Related wiki pages'));
    assert.ok(wiki, 'Related wiki pages section should appear');
    assert.ok(wiki!.bullets.some((b) => /glance-2-roadmap/.test(b)));
    // W5/AC5: bullets display last_refreshed.
    assert.ok(
      wiki!.bullets.some((b) => /\(as of 2026-06-01/.test(b)),
      `bullets must show last_refreshed: ${JSON.stringify(wiki!.bullets)}`,
    );
  });

  it('marks a >60d-old wiki page visibly stale in brief output (W5/AC5)', async () => {
    // Freeze the page at a date guaranteed >60 days old relative to ANY
    // run date of this test (fixture written 2026; page frozen 2025).
    writeFile(
      tmpDir,
      '.arete/memory/topics/glance-2-roadmap.md',
      `---
topic_slug: glance-2-roadmap
status: active
first_seen: 2025-01-01
last_refreshed: 2025-01-01
sources_integrated: []
aliases:
  - Lindsay
area: glance-modernization
---

# Glance 2 Roadmap

## Current state
Frozen at the seed.
`,
    );
    const search = fakeSearchProvider([
      join(tmpDir, '.arete/memory/topics/glance-2-roadmap.md'),
    ]);
    const intel = buildIntel(tmpDir, search);
    const brief = await intel.assembleBriefForPerson('lindsay-gray', paths);
    const wiki = brief.sections.find((s) => s.heading.startsWith('Related wiki pages'));
    assert.ok(wiki, 'Related wiki pages section should appear');
    const bullet = wiki!.bullets.find((b) => /glance-2-roadmap/.test(b));
    assert.ok(bullet, 'glance-2-roadmap bullet present');
    assert.match(bullet!, /\(as of 2025-01-01 — stale\)/);
  });

  it('falls back to listAll() + tokenizeSlug() when SearchProvider is absent (searchBackend === "none")', async () => {
    // Person aliases include "Lindsay" — wiki page is "Glance 2 Roadmap"
    // which doesn't share tokens with Lindsay's name. Replace fixture to
    // exercise the fallback meaningfully: query for "glance" should match
    // glance-2-roadmap via alias jaccard.
    writeFile(
      tmpDir,
      'people/internal/glance-pm.md',
      `---
name: Glance PM
aliases:
  - Glance 2
---
# Glance PM
`,
    );
    // No SearchProvider — exercises fallback path
    const intel = buildIntel(tmpDir, undefined);
    const brief = await intel.assembleBriefForPerson('glance-pm', paths);
    const wiki = brief.sections.find((s) => s.heading.startsWith('Related wiki pages'));
    assert.ok(wiki, 'Related wiki pages section should appear via fallback');
    assert.ok(wiki!.bullets.some((b) => /glance-2-roadmap/.test(b)));
    // Unrelated topic should NOT bubble up
    assert.ok(
      wiki!.bullets.every((b) => !/unrelated-topic/.test(b)),
      'unrelated topic should not match in fallback',
    );
    // W5/AC5: fallback path also displays last_refreshed.
    assert.ok(
      wiki!.bullets.some((b) => /\(as of 2026-06-01/.test(b)),
      `fallback bullets must show last_refreshed: ${JSON.stringify(wiki!.bullets)}`,
    );
  });
});

describe('wikiStalenessLabel (W5/AC5)', () => {
  const today = new Date('2026-06-09T12:00:00Z');

  it('renders fresh pages without the stale marker', () => {
    assert.equal(wikiStalenessLabel('2026-06-01', today), '(as of 2026-06-01)');
    // Exactly 60 days old is NOT stale (strict >, matching listTopicMemoryStatus)
    assert.equal(wikiStalenessLabel('2026-04-10', today), '(as of 2026-04-10)');
  });

  it('renders >60d-old pages with the stale marker', () => {
    assert.equal(wikiStalenessLabel('2026-04-08', today), '(as of 2026-04-08 — stale)');
    assert.equal(wikiStalenessLabel('2025-01-01', today), '(as of 2025-01-01 — stale)');
  });

  it('treats unparseable dates as stale (unknown age must not read as fresh)', () => {
    assert.equal(wikiStalenessLabel('not-a-date', today), '(as of not-a-date — stale)');
    assert.equal(wikiStalenessLabel('', today), '(as of unknown — stale)');
  });
});
