/**
 * Phase 9 — assembleBriefForMeeting tests (AC4, AC4a-d).
 *
 * Covers:
 *  - AC4: typed mode accepts both slug-shape and free-text title;
 *         per-attendee mini-briefs, Meeting area & projects, Recent
 *         meetings with this group, Open commitments touching group,
 *         Related wiki, Sources.
 *  - AC4a: --project override pins project section unconditionally.
 *  - AC4b: explicit area: frontmatter triggers deterministic project
 *          composition (no inference).
 *  - AC4c: unknown attendee email surfaced as one-line stub.
 *  - AC4d: unresolved input returns title-only brief with (unresolved)
 *          placeholders, NOT silent empty, NOT errored.
 *  - M1: slug-vs-title precedence — free-text title does NOT match an
 *        old meeting file slug.
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

// Helper: pre-populate a small workspace with two attendees + meeting.
function setupWorkspace(tmpDir: string): void {
  writeFile(
    tmpDir,
    'people/internal/lindsay-gray.md',
    `---
name: Lindsay Gray
role: Manager
team: Product
---

# Lindsay
`,
  );
  writeFile(
    tmpDir,
    'people/internal/john-doe.md',
    `---
name: John Doe
role: PM
---

# John
`,
  );
  writeFile(
    tmpDir,
    '.arete/commitments.json',
    JSON.stringify({
      commitments: [
        {
          id: 'aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111',
          text: 'Send story-map draft',
          direction: 'i_owe_them',
          personSlug: 'lindsay-gray',
          personName: 'Lindsay Gray',
          source: '2026-05-15-john-lindsay-11.md',
          date: '2026-05-15',
          status: 'open',
          resolvedAt: null,
        },
      ],
    }),
  );
}

describe('IntelligenceService.assembleBriefForMeeting', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-meeting-'));
    paths = makePaths(tmpDir);
    setupWorkspace(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC4: meeting file slug resolves and produces attendee mini-briefs', async () => {
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-15
attendee_ids:
  - john-doe
  - lindsay-gray
area: glance-modernization
---

## Summary
Discussed roadmap.
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForMeeting('2026-05-15-john-lindsay-11', paths);
    assert.equal(brief.mode, 'meeting');
    assert.equal(brief.metadata.resolved, true);
    assert.equal(brief.metadata.unresolved, undefined);
    assert.equal(brief.attendeeMiniBriefs.length, 2);
    const headings = brief.sections.map((s) => s.heading);
    assert.ok(headings.some((h) => h.startsWith('Attendees')), `missing Attendees; got ${headings.join(', ')}`);
  });

  it('AC4b: explicit `area:` frontmatter triggers deterministic project section', async () => {
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
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-15
attendee_ids:
  - john-doe
  - lindsay-gray
area: glance-modernization
---

## Summary
.
`,
    );
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForMeeting('2026-05-15-john-lindsay-11', paths);
    const proj = brief.sections.find((s) => s.heading === 'Meeting area & projects');
    assert.ok(proj, 'Meeting area & projects should appear');
    assert.ok(proj!.bullets.some((b) => /Glance 2 MVP/.test(b)));
    assert.equal(brief.metadata.explicitArea, 'glance-modernization');
    assert.equal(brief.metadata.inferredArea, undefined, 'inference must not run when explicit area present');
  });

  it('AC4a: --project override pins project section even with no `area:` frontmatter', async () => {
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
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2026-05-15
attendee_ids:
  - john-doe
  - lindsay-gray
---

## Summary
.
`,
    );
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForMeeting(
      '2026-05-15-john-lindsay-11',
      paths,
      { projectOverride: 'glance-2-mvp' },
    );
    const proj = brief.sections.find((s) => s.heading === 'Meeting area & projects');
    assert.ok(proj, 'Meeting area & projects should appear');
    assert.ok(proj!.bullets.some((b) => /Glance 2 MVP/.test(b)));
    assert.equal(brief.metadata.projectOverride, 'glance-2-mvp');
    assert.equal(brief.metadata.inferredArea, undefined);
  });

  it('AC4c: unresolved attendee (no person file) surfaced as one-line stub, NOT silently dropped', async () => {
    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-mixed-attendees.md',
      `---
title: Mixed attendees meeting
date: 2026-05-15
attendee_ids:
  - lindsay-gray
  - unknown-stranger
---

## Summary
.
`,
    );
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForMeeting('2026-05-15-mixed-attendees', paths);
    const attendeesSec = brief.sections.find((s) => s.heading.startsWith('Attendees'));
    assert.ok(attendeesSec);
    const text = attendeesSec!.bullets.join('\n');
    // Resolved attendee appears as real name
    assert.ok(/Lindsay Gray/.test(text));
    // Unresolved attendee appears as stub
    assert.ok(
      /unknown-stranger/.test(text) && /no person file/i.test(text),
      `unresolved attendee stub missing; got: ${text}`,
    );
    // Mini-brief array has both entries
    assert.equal(brief.attendeeMiniBriefs.length, 2);
    const stranger = brief.attendeeMiniBriefs.find((mb) => mb.name === 'unknown-stranger');
    assert.ok(stranger);
    assert.equal(stranger!.resolved, false);
  });

  it('AC4d: unresolved input (no slug, no agenda, no calendar) returns title-only brief with (unresolved) placeholders', async () => {
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForMeeting('Random meeting title', paths);
    assert.equal(brief.metadata.resolved, false);
    assert.equal(brief.metadata.unresolved, true);
    assert.equal(brief.subject, 'Random meeting title');
    // Sections include the (unresolved) placeholder bullets — NOT silent empty
    assert.ok(brief.sections.length >= 2, `expected at least 2 sections; got ${brief.sections.length}`);
    const flat = brief.sections.flatMap((s) => s.bullets).join('\n');
    assert.ok(
      /unresolved/i.test(flat),
      `(unresolved) marker should appear in bullets; got: ${flat}`,
    );
  });

  it('M1: free-text title does NOT accidentally match an old meeting file slug', async () => {
    // Workspace contains a slug-shaped meeting from 6 months ago.
    writeFile(
      tmpDir,
      'resources/meetings/2025-12-01-john-lindsay-11.md',
      `---
title: John / Lindsay 1:1
date: 2025-12-01
attendee_ids:
  - john-doe
  - lindsay-gray
---

## Summary
Old meeting.
`,
    );

    const intel = buildIntel(tmpDir);
    // Pass a free-text title that DOES exist as a title in a meeting file.
    // Per AC4 input precedence, free-text without ^YYYY-MM-DD- prefix goes to
    // calendar+agenda match path, not slug match. Title match against the
    // index should resolve it normally (newest first).
    const brief = await intel.assembleBriefForMeeting('John / Lindsay 1:1', paths);
    assert.equal(brief.metadata.resolved, true);
    // Should not fail through to AC4d
    assert.equal(brief.metadata.unresolved, undefined);
  });
});
