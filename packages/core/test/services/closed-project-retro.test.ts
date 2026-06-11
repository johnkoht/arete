/**
 * Phase 14 AC5 (stretch) — closed-project retro FORMAT contract.
 *
 * The finalize-project retro step appends a standard memory-item entry
 * (`## Closed project: <name>` + Date/Source/Topics/Project bullets) to
 * `.arete/memory/items/decisions.md`. This test guards the substrate the
 * prose relies on: an entry in EXACTLY the documented format surfaces in
 * the area-scoped brief's "Decisions & learnings" section via the
 * existing `parseMemoryItemEntries` + `readAreaTaggedMemoryItems`
 * machinery (zero new code paths — pre-mortem D5's adapted mechanism).
 *
 * Real fs + FileStorageAdapter (no mocks for memory/storage ops).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

/** The EXACT entry shape documented in finalize-project/SKILL.md. */
const RETRO_ENTRY = `## Closed project: Visioning Deck
- **Date**: 2026-06-10
- **Source**: projects/archive/2026-06_visioning-deck/README.md
- **Topics**: glance-2-mvp, vision-deck
- **Project**: visioning-deck

Shipped the visioning deck; decided to anchor the 2027 narrative on claims
automation; learned the exec audience wants one page, not twelve.
`;

describe('closed-project retro format contract (Phase 14 AC5)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  const write = (rel: string, content: string): void => {
    const p = join(tmpDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'p14-retro-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildIntel(): IntelligenceService {
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

  it('a retro entry in the documented format surfaces in a same-area project brief (Decisions & learnings)', async () => {
    // Sibling project still active in the same area — the consumer of the
    // frozen trace.
    write(
      'projects/active/glance-2-roadmap/README.md',
      `---
title: Glance 2 Roadmap
area: glance-2-mvp
status: active
---

# Glance 2 Roadmap

## Background

Roadmap work.
`,
    );
    // Pre-existing ordinary decision + the appended retro (append = the
    // finalize-project step's write shape).
    write(
      '.arete/memory/items/decisions.md',
      `# Decisions

## Use claims automation for 2027 narrative
- **Date**: 2026-06-01
- **Source**: resources/meetings/2026-06-01-strategy.md
- **Topics**: glance-2-mvp

Existing entry.

${RETRO_ENTRY}`,
    );

    const brief = await buildIntel().assembleBriefForProject('glance-2-roadmap', paths);
    const section = brief.sections.find((s) => s.heading.startsWith('Decisions & learnings'));
    assert.ok(section, 'Decisions & learnings section present');
    const joined = section.bullets.join('\n');
    assert.match(joined, /Closed project: Visioning Deck/);
    assert.match(joined, /\[2026-06-10\]/, 'retro carries its date');
  });

  it('idempotency-scan key: the heading is findable by the documented scan string', () => {
    // The prose rule is "scan decisions.md for `Closed project: <name>`
    // before writing" — pin that the documented format actually contains
    // the scan key (a format drift here would silently break dedup).
    assert.ok(RETRO_ENTRY.includes('Closed project: Visioning Deck'));
    assert.match(RETRO_ENTRY, /^## Closed project: /m);
    assert.match(RETRO_ENTRY, /- \*\*Project\*\*: visioning-deck/);
  });
});
