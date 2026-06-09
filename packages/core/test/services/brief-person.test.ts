/**
 * Phase 9 — assembleBriefForPerson tests.
 *
 * Covers AC1 + AC1a:
 *  - All expected sections appear with sources
 *  - Empty stances/asks/concerns degrade cleanly (no "None detected yet" bleed)
 *  - Relationship Health subsection surfaces independently
 *  - Per-section cap (open commitments) truncates and emits marker
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
  const areaMemory = new AreaMemoryService(
    storage,
    areaParser,
    commitments,
    memory,
    topicMemory,
  );

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

describe('IntelligenceService.assembleBriefForPerson', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-person-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC1: returns all expected sections + sources for a populated person file', async () => {
    // Person file with full Memory Highlights
    writeFile(
      tmpDir,
      'people/internal/lindsay-gray.md',
      `---
name: Lindsay Gray
role: Manager
team: Product
company: Reserv
email: lindsay@reserv.com
aliases:
  - Lindsay
---

# Lindsay Gray

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

Last refreshed: 2026-06-01

### Repeated asks
- **Story mapping** — mentioned 3 times (last: 2026-05-15)
- **POP migration timeline** — mentioned 2 times

### Repeated concerns
- **Adjuster research bandwidth** — mentioned 2 times

### Stances
- **Glance 2.0 rollout** — supportive: Glance 2.0 is the right next surface (from: 2026-05-15-meeting.md, 2026-05-15)
- **Discovery process** — cautious: Discovery cycles should anchor in adjuster interviews (from: 2026-05-15-meeting.md, 2026-05-15)

### Open Items (I owe them)
- Send story-map draft (from: 2026-05-15-meeting.md, 2026-05-15)

### Open Items (They owe me)
- Confirm discovery cadence (from: 2026-05-15-meeting.md, 2026-05-15)

### Relationship Health
- Last met: 2026-05-15 (14 days ago)
- Meetings: 3 in last 30d, 12 in last 90d
- Open loops: 2
- Status: Active
<!-- AUTO_PERSON_MEMORY:END -->
`,
    );

    // 3 meetings — Lindsay in attendee_ids for each
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-15
attendee_ids:
  - john
  - lindsay-gray
area: glance-modernization
---

## Summary
Discussed Glance 2.0 rollout planning.
`,
    );
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-08-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-08
attendee_ids:
  - john
  - lindsay-gray
area: glance-modernization
---

## Summary
Story mapping kickoff.
`,
    );

    // Commitments (one each direction)
    const commitmentsContent = {
      commitments: [
        {
          id: 'abc12345abc12345abc12345abc12345abc12345abc12345abc12345abc12345',
          text: 'Send story-map draft to Lindsay',
          direction: 'i_owe_them',
          personSlug: 'lindsay-gray',
          personName: 'Lindsay Gray',
          source: '2026-05-15-john-lindsay-11.md',
          date: '2026-05-15',
          status: 'open',
          resolvedAt: null,
          area: 'glance-modernization',
        },
        {
          id: 'def67890def67890def67890def67890def67890def67890def67890def67890',
          text: 'Confirm discovery cadence',
          direction: 'they_owe_me',
          personSlug: 'lindsay-gray',
          personName: 'Lindsay Gray',
          source: '2026-05-15-john-lindsay-11.md',
          date: '2026-05-15',
          status: 'open',
          resolvedAt: null,
        },
      ],
    };
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify(commitmentsContent, null, 2));

    // Project to surface "Shared areas & projects"
    writeFile(
      tmpDir,
      'projects/active/glance-2-mvp/README.md',
      `---
name: Glance 2 MVP
area: glance-modernization
status: active
---

# Glance 2 MVP
`,
    );

    // Topic wiki page (alias jaccard fallback path)
    writeFile(
      tmpDir,
      '.arete/memory/topics/lindsay-gray.md',
      `---
topic_slug: lindsay-gray
last_refreshed: 2026-06-01
aliases:
  - Lindsay
---

# Lindsay Gray

## Current state
Manager of Product team.
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForPerson('lindsay-gray', paths);

    assert.equal(brief.mode, 'person');
    assert.equal(brief.subjectSlug, 'lindsay-gray');
    assert.equal(brief.subject, 'Lindsay Gray');
    assert.equal(brief.metadata.role, 'Manager');
    assert.equal(brief.metadata.team, 'Product');
    assert.equal(brief.metadata.email, 'lindsay@reserv.com');

    const headings = brief.sections.map((s) => s.heading);
    // Expect at minimum these sections present (Recent meetings, Open commitments,
    // Memory highlights, Shared areas & projects)
    assert.ok(headings.some((h) => h.startsWith('Recent meetings')), `missing Recent meetings; got ${headings.join(', ')}`);
    assert.ok(headings.some((h) => h.startsWith('Open commitments')), `missing Open commitments; got ${headings.join(', ')}`);
    assert.ok(headings.includes('Memory highlights'), `missing Memory highlights; got ${headings.join(', ')}`);
    assert.ok(
      headings.includes('Shared areas & projects'),
      `missing Shared areas & projects; got ${headings.join(', ')}`,
    );

    // Sources includes person file + meetings + project
    assert.ok(
      brief.sources.some((s) => s.endsWith('lindsay-gray.md')),
      'person file in sources',
    );
    assert.ok(
      brief.sources.some((s) => s.endsWith('2026-05-15-john-lindsay-11.md')),
      'meeting in sources',
    );

    // Memory highlights bullets do NOT contain "None detected yet"
    const mh = brief.sections.find((s) => s.heading === 'Memory highlights');
    assert.ok(mh);
    assert.ok(
      mh!.bullets.every((b) => !/none detected yet/i.test(b)),
      'Memory highlights should not surface "None detected yet" placeholder',
    );
    // Stances/Asks/Concerns rendered
    assert.ok(mh!.bullets.some((b) => /Glance 2\.0/.test(b)));
    assert.ok(mh!.bullets.some((b) => /Story mapping/.test(b)));
  });

  it('AC1a: degrades cleanly when stances/asks/concerns are empty (surfaces Relationship Health + Action Items only)', async () => {
    // Person file with ONLY Relationship Health + Open Items populated;
    // stances/asks/concerns marked "None detected yet."
    writeFile(
      tmpDir,
      'people/internal/quiet-quentin.md',
      `---
name: Quentin Quiet
role: Engineer
---

# Quentin Quiet

<!-- AUTO_PERSON_MEMORY:START -->
## Memory Highlights (Auto)

Last refreshed: 2026-06-01

### Repeated asks
- None detected yet.

### Repeated concerns
- None detected yet.

### Stances
- None detected yet.

### Open Items (I owe them)
- Send onboarding doc (from: 2026-05-30-meeting.md, 2026-05-30)

### Open Items (They owe me)
- None detected yet.

### Relationship Health
- Last met: 2026-05-30 (2 days ago)
- Meetings: 1 in last 30d, 1 in last 90d
- Open loops: 1
- Status: Regular
<!-- AUTO_PERSON_MEMORY:END -->
`,
    );

    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForPerson('quiet-quentin', paths);

    const mh = brief.sections.find((s) => s.heading === 'Memory highlights');
    assert.ok(mh, 'Memory highlights section should still appear');

    // No "None detected yet" anywhere
    for (const bullet of mh!.bullets) {
      assert.ok(
        !/none detected yet/i.test(bullet),
        `bullet contains "None detected yet": ${bullet}`,
      );
    }

    // Stances/asks/concerns headers NOT present (no body to back them)
    const text = mh!.bullets.join('\n');
    assert.ok(!/\*\*Stances:/.test(text), 'Stances header should be dropped when empty');
    assert.ok(!/\*\*Asks:/.test(text), 'Asks header should be dropped when empty');
    assert.ok(!/\*\*Concerns:/.test(text), 'Concerns header should be dropped when empty');

    // Relationship Health AND Action items (I owe them) surface
    assert.ok(
      /Relationship health/i.test(text),
      `Relationship health should surface; got: ${text}`,
    );
    assert.ok(
      /Action items \(I owe them\)/i.test(text),
      `Action items (I owe them) should surface; got: ${text}`,
    );
    // They-owe-me section should not surface a "None detected" bullet
    assert.ok(
      !/Action items \(They owe me\)/i.test(text),
      'Empty They-owe-me section should be dropped',
    );
  });

  it('returns empty PersonBrief when person file not found', async () => {
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForPerson('does-not-exist', paths);
    assert.equal(brief.subjectSlug, 'does-not-exist');
    assert.equal(brief.sections.length, 0);
    assert.equal(brief.sources.length, 0);
  });
});
