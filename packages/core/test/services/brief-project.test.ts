/**
 * Phase 9 — assembleBriefForProject tests (AC2).
 *
 * Verifies:
 *  - Project context (Background + Status excerpt) renders
 *  - Recent activity = meetings tagged to project's area
 *  - Open work = commitments scoped to project area, grouped by direction
 *  - Decisions & learnings tagged by area
 *  - Sources includes README + meetings + items
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
import {
  meetingsForArea,
  resolveProjectArea,
  type MeetingIndexEntry,
} from '../../src/services/brief-assemblers.js';
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

describe('IntelligenceService.assembleBriefForProject', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-project-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC2: returns project context, recent activity, open work, decisions & learnings', async () => {
    writeFile(
      tmpDir,
      'projects/active/glance-2-mvp/README.md',
      `---
name: Glance 2 MVP
area: glance-modernization
status: active
started: 2026-04-01
---

# Glance 2 MVP

## Background
Modernize the Glance surface for adjuster workflows.

## Status Updates
2026-05-15: Story mapping kickoff complete; discovery interviews in progress.

2026-04-29: Architecture review approved.
`,
    );

    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-design-review.md',
      `---
title: Design review
date: 2026-05-15
attendee_ids:
  - john
  - lindsay-gray
area: glance-modernization
---

## Summary
Reviewed mocks for Glance 2.
`,
    );

    writeFile(
      tmpDir,
      'resources/meetings/2026-05-08-irrelevant.md',
      `---
title: Irrelevant meeting
date: 2026-05-08
attendee_ids:
  - bob
area: other-area
---
`,
    );

    // Two commitments in this area, both directions
    writeFile(
      tmpDir,
      '.arete/commitments.json',
      JSON.stringify({
        commitments: [
          {
            id: 'aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111aaa11111',
            text: 'Ship Glance 2 alpha',
            direction: 'i_owe_them',
            personSlug: 'lindsay-gray',
            personName: 'Lindsay',
            source: '2026-05-15-design-review.md',
            date: '2026-05-15',
            status: 'open',
            resolvedAt: null,
            area: 'glance-modernization',
          },
          {
            id: 'bbb22222bbb22222bbb22222bbb22222bbb22222bbb22222bbb22222bbb22222',
            text: 'Approve PRD',
            direction: 'they_owe_me',
            personSlug: 'lindsay-gray',
            personName: 'Lindsay',
            source: '2026-05-15-design-review.md',
            date: '2026-05-15',
            status: 'open',
            resolvedAt: null,
            area: 'glance-modernization',
          },
        ],
      }),
    );

    // Area-tagged decision
    writeFile(
      tmpDir,
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-05-15: Anchor discovery in adjuster interviews
Area: glance-modernization

Decided to lean on adjuster interviews for discovery cadence.

### 2026-04-01: Use POP migration path
Area: other-area

(unrelated)
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForProject('glance-2-mvp', paths);

    assert.equal(brief.mode, 'project');
    assert.equal(brief.subjectSlug, 'glance-2-mvp');
    assert.equal(brief.subject, 'Glance 2 MVP');
    assert.equal(brief.metadata.area, 'glance-modernization');
    assert.equal(brief.metadata.status, 'active');

    const headings = brief.sections.map((s) => s.heading);
    assert.ok(headings.includes('Project context'), `missing Project context; got ${headings.join(', ')}`);
    assert.ok(
      headings.some((h) => h.startsWith('Recent activity')),
      `missing Recent activity; got ${headings.join(', ')}`,
    );
    assert.ok(
      headings.some((h) => h.startsWith('Open work')),
      `missing Open work; got ${headings.join(', ')}`,
    );
    assert.ok(
      headings.some((h) => h.startsWith('Decisions & learnings')),
      `missing Decisions & learnings; got ${headings.join(', ')}`,
    );

    // Project context body
    const ctx = brief.sections.find((s) => s.heading === 'Project context');
    assert.ok(ctx);
    assert.ok(/Background/.test(ctx!.body ?? ''));
    assert.ok(/Status/.test(ctx!.body ?? ''));

    // Recent activity excludes the other-area meeting
    const recent = brief.sections.find((s) => s.heading.startsWith('Recent activity'));
    assert.ok(recent);
    assert.ok(recent!.bullets.some((b) => /Design review/.test(b)));
    assert.ok(
      recent!.bullets.every((b) => !/Irrelevant meeting/.test(b)),
      'should not include other-area meeting',
    );

    // Open work has both directions
    const work = brief.sections.find((s) => s.heading.startsWith('Open work'));
    assert.ok(work);
    const workText = work!.bullets.join('\n');
    assert.ok(/I owe/.test(workText));
    assert.ok(/They owe/.test(workText));
    assert.ok(/Ship Glance 2 alpha/.test(workText));
    assert.ok(/Approve PRD/.test(workText));

    // Decisions filters by area
    const decisions = brief.sections.find((s) => s.heading.startsWith('Decisions & learnings'));
    assert.ok(decisions);
    assert.ok(decisions!.bullets.some((b) => /Anchor discovery/.test(b)));
    assert.ok(
      decisions!.bullets.every((b) => !/POP migration/.test(b)),
      'should not include other-area decision',
    );

    // Sources
    assert.ok(brief.sources.some((s) => s.includes('glance-2-mvp/README.md')));
    assert.ok(brief.sources.some((s) => s.includes('2026-05-15-design-review.md')));
  });

  it('W6: live-format decisions/learnings attribute via **Topics** slugs (direct + topic-page area map)', async () => {
    writeFile(
      tmpDir,
      'projects/active/status-letters/README.md',
      `---
name: Status Letters
area: glance-communications
status: active
---

# Status Letters

## Background
Automate status letters.
`,
    );

    // Topic page whose frontmatter maps a non-area slug into the area.
    writeFile(
      tmpDir,
      '.arete/memory/topics/rollout-strategy.md',
      `---
topic_slug: rollout-strategy
area: glance-communications
status: new
first_seen: 2026-04-24
last_refreshed: 2026-06-04
sources_integrated: []
---

# Rollout Strategy

## Current state
Rollout sequencing for email templates.
`,
    );

    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));

    // June-style meeting: `topics:` list, NO `area:` key (W6.2 topics-union).
    writeFile(
      tmpDir,
      'resources/meetings/2026-06-01-drafts-alignment.md',
      `---
title: Drafts Alignment - Status Letters
date: 2026-06-01
attendee_ids:
  - john
topics:
  - glance-communications
  - rollout-strategy
---

## Summary
Aligned on the drafts approach for status letters.
`,
    );

    // LIVE format: ## Title + **Date** + **Topics** bullets.
    writeFile(
      tmpDir,
      '.arete/memory/items/decisions.md',
      `# Decisions

## Reprioritize draft emails ahead of inbound emails
- **Date**: 2026-05-29
- **Source**: 2026-05-29-slack-digest.md
- **Topics**: glance-communications, copilot-email-drafting
- CJ escalated status letters across all programs.

## Rollout: turn templates on for everybody after Lyft
- **Date**: 2026-05-29
- **Source**: 2026-05-29-slack-digest.md
- **Topics**: rollout-strategy, leap-rollout
- Confirmed the rollout sequence.

## Unrelated decision
- **Date**: 2026-05-28
- **Topics**: some-other-topic
- Should not appear.
`,
    );

    writeFile(
      tmpDir,
      '.arete/memory/items/learnings.md',
      `# Learnings

## Templates without explicit scoping go everywhere
- **Date**: 2026-05-22
- **Topics**: glance-communications
- Treat unscoped as a soft bug.

### 2026-05-01: Legacy learning still works
Area: glance-communications

Legacy-format fallback entry.
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForProject('status-letters', paths);

    // S2: June-style topics-only meeting surfaces in Recent activity.
    const recent = brief.sections.find((s) => s.heading.startsWith('Recent activity'));
    assert.ok(recent, `missing Recent activity; got ${brief.sections.map((s) => s.heading).join(', ')}`);
    assert.ok(
      recent!.bullets.some((b) => /Drafts Alignment/.test(b)),
      'topics-only (no area key) meeting missing from Recent activity',
    );

    const decisions = brief.sections.find((s) => s.heading.startsWith('Decisions & learnings'));
    assert.ok(decisions, `missing Decisions & learnings; got ${brief.sections.map((s) => s.heading).join(', ')}`);
    // 2 decisions (direct slug + mapped via rollout-strategy area) + 2 learnings (live + legacy)
    assert.ok(
      decisions!.heading.includes('(4)'),
      `expected 4 items; heading was "${decisions!.heading}"`,
    );
    const text = decisions!.bullets.join('\n');
    assert.ok(/Reprioritize draft emails/.test(text), 'direct Topics slug match missing');
    assert.ok(/turn templates on for everybody/.test(text), 'topic-page area-map match missing');
    assert.ok(/explicit scoping go everywhere/.test(text), 'live-format learning missing');
    assert.ok(/Legacy learning still works/.test(text), 'legacy Area: fallback missing');
    assert.ok(!/Unrelated decision/.test(text), 'unrelated topic leaked in');
    assert.ok(/\[2026-05-29\]/.test(text), 'date from **Date** bullet missing');
  });

  it('returns empty ProjectBrief when project not found', async () => {
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForProject('nonexistent', paths);
    assert.equal(brief.subjectSlug, 'nonexistent');
    assert.equal(brief.sections.length, 0);
  });
});

describe('project name fallback (W6.3)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brief-project-name-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function subjectFor(frontmatter: string): Promise<string> {
    writeFile(
      tmpDir,
      'projects/active/status-letter-automation/README.md',
      `---\n${frontmatter}\n---\n\n# Project\n\n## Background\nSome background.\n`,
    );
    writeFile(tmpDir, '.arete/commitments.json', JSON.stringify({ commitments: [] }));
    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForProject('status-letter-automation', paths);
    return brief.subject;
  }

  it('prefers name: when present', async () => {
    assert.equal(await subjectFor('name: Status Letters\ntitle: Other\nstatus: active'), 'Status Letters');
  });

  it('falls back to title: when name: absent', async () => {
    assert.equal(await subjectFor('title: Status Letter Automation\nstatus: active'), 'Status Letter Automation');
  });

  it('falls back to project: when name:/title: absent (live README shape)', async () => {
    assert.equal(
      await subjectFor('project: status-letter-automation\ntype: definition\nstatus: active'),
      'status-letter-automation',
    );
  });

  it('falls back to slug when no naming key present', async () => {
    assert.equal(await subjectFor('status: active'), 'status-letter-automation');
  });
});

describe('meetingsForArea (W6.2 topics-union)', () => {
  function entry(overrides: Partial<MeetingIndexEntry>): MeetingIndexEntry {
    return {
      path: '/w/resources/meetings/x.md',
      date: '2026-06-01',
      title: 'x',
      attendeeIds: [],
      attendeeNames: [],
      topics: [],
      ...overrides,
    };
  }

  it('unions area: match with topics: membership', () => {
    const index = [
      entry({ title: 'area-only', area: 'glance-communications' }),
      entry({ title: 'topics-only-june', topics: ['glance-communications', 'rollout-strategy'] }),
      entry({ title: 'both', area: 'glance-communications', topics: ['glance-communications'] }),
      entry({ title: 'other-area', area: 'other', topics: ['unrelated-topic'] }),
      entry({ title: 'neither' }),
    ];
    const got = meetingsForArea(index, 'glance-communications').map((m) => m.title);
    assert.deepEqual(got, ['area-only', 'topics-only-june', 'both']);
  });

  it('does not substring-match topic slugs', () => {
    const index = [entry({ title: 'near-miss', topics: ['glance-communications-v2'] })];
    assert.equal(meetingsForArea(index, 'glance-communications').length, 0);
  });
});

// ---------------------------------------------------------------------------
// Phase 12 AC1 — project area resolution (priority order + prose variants)
// ---------------------------------------------------------------------------

describe('resolveProjectArea (Phase 12 AC1)', () => {
  it('resolves from fm.area (frontmatter wins tier)', () => {
    const res = resolveProjectArea({ area: 'glance-2-mvp' }, 'body');
    assert.equal(res.area, 'glance-2-mvp');
    assert.equal(res.source, 'frontmatter');
    assert.equal(res.divergence, undefined);
  });

  it('treats empty-string fm.area as absent', () => {
    const res = resolveProjectArea({ area: '   ' }, 'no signal');
    assert.equal(res.area, undefined);
    assert.equal(res.source, undefined);
  });

  it('tolerates a future areas: plural list — first entry (R4)', () => {
    const res = resolveProjectArea({ areas: ['comms', 'claims'] }, '');
    assert.equal(res.area, 'comms');
    assert.equal(res.source, 'frontmatter');
  });

  it('reads area_set_by provenance', () => {
    const res = resolveProjectArea({ area: 'x', area_set_by: 'backfill' }, '');
    assert.equal(res.areaSetBy, 'backfill');
  });

  it('resolves prose **Area**: markdown link (live glance-2-mvp shape)', () => {
    const body = 'Intro\n\n**Area**: [Glance 2.0 MVP](../../../areas/glance-2-mvp.md)\n';
    const res = resolveProjectArea({}, body);
    assert.equal(res.area, 'glance-2-mvp');
    assert.equal(res.source, 'prose');
  });

  it('resolves prose link at a different relative depth', () => {
    const body = '**Area**: [Comms](../../areas/glance-communications.md)';
    assert.equal(resolveProjectArea({}, body).area, 'glance-communications');
  });

  it('resolves **Area:** colon-inside-bold variant', () => {
    const body = '**Area:** [Glance](../../../areas/glance-2-mvp.md)';
    assert.equal(resolveProjectArea({}, body).area, 'glance-2-mvp');
  });

  it('resolves unbolded Area: variant', () => {
    const body = 'Area: [Glance](../../../areas/glance-2-mvp.md)';
    assert.equal(resolveProjectArea({}, body).area, 'glance-2-mvp');
  });

  it('resolves plain-text slug-shaped value', () => {
    const body = '**Area**: glance-2-mvp';
    const res = resolveProjectArea({}, body);
    assert.equal(res.area, 'glance-2-mvp');
    assert.equal(res.source, 'prose');
  });

  it('does NOT guess from a non-slug display name (R3: wrong area worse than none)', () => {
    const body = '**Area**: Glance 2.0 MVP Launch';
    const res = resolveProjectArea({}, body);
    assert.equal(res.area, undefined);
  });

  it('unresolved when neither signal present', () => {
    const res = resolveProjectArea({ title: 'X' }, '# X\n\nNo area anywhere.');
    assert.equal(res.area, undefined);
    assert.equal(res.source, undefined);
  });

  it('frontmatter wins over agreeing prose with no divergence', () => {
    const body = '**Area**: [G](../../../areas/glance-2-mvp.md)';
    const res = resolveProjectArea({ area: 'glance-2-mvp' }, body);
    assert.equal(res.area, 'glance-2-mvp');
    assert.equal(res.source, 'frontmatter');
    assert.equal(res.divergence, undefined);
  });

  it('R9: frontmatter wins over disagreeing prose and surfaces divergence', () => {
    const body = '**Area**: [Other](../../../areas/other-area.md)';
    const res = resolveProjectArea({ area: 'glance-2-mvp' }, body);
    assert.equal(res.area, 'glance-2-mvp');
    assert.ok(res.divergence && /other-area/.test(res.divergence));
    assert.ok(/glance-2-mvp/.test(res.divergence!));
  });
});

describe('assembleBriefForProject with prose-only area (Phase 12 AC1 integration)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `brief-project-ac1-${process.pid}-`));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('populates area-gated sections from a prose **Area**: line alone', async () => {
    writeFile(
      tmpDir,
      'projects/active/glance-2-mvp/README.md',
      `---
title: Glance 2.0 MVP — POP Launch
status: active
started: 2026-04-14
notion:
  roadmap:
    url: "https://example.com"
---

# Project: Glance 2.0 MVP — POP Launch

**Area**: [Glance 2.0 MVP](../../../areas/glance-2-mvp.md)

## Background
Migrate POP to Glance 2.

## Status Updates
2026-05-15: Story mapping complete.
`,
    );

    writeFile(
      tmpDir,
      'resources/meetings/2026-05-15-pop-sync.md',
      `---
title: POP sync
date: 2026-05-15
attendee_ids:
  - john
area: glance-2-mvp
---

## Summary
POP migration sync.
`,
    );

    writeFile(
      tmpDir,
      '.arete/commitments.json',
      JSON.stringify({
        commitments: [
          {
            id: 'ccc33333ccc33333ccc33333ccc33333ccc33333ccc33333ccc33333ccc33333',
            text: 'Draft POP migration plan',
            direction: 'i_owe_them',
            personSlug: 'lindsay-gray',
            personName: 'Lindsay',
            source: '2026-05-15-pop-sync.md',
            date: '2026-05-15',
            status: 'open',
            resolvedAt: null,
            area: 'glance-2-mvp',
          },
        ],
      }),
    );

    writeFile(
      tmpDir,
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-05-15: POP first
Area: glance-2-mvp

POP is the first program to migrate.
`,
    );

    const intel = buildIntel(tmpDir);
    const brief = await intel.assembleBriefForProject('glance-2-mvp', paths);

    assert.equal(brief.metadata.area, 'glance-2-mvp');
    const headings = brief.sections.map((s) => s.heading);
    assert.ok(headings.includes('Project context'), `got: ${headings.join(', ')}`);
    assert.ok(headings.some((h) => h.startsWith('Recent activity')), `got: ${headings.join(', ')}`);
    assert.ok(headings.some((h) => h.startsWith('Open work')), `got: ${headings.join(', ')}`);
    assert.ok(
      headings.some((h) => h.startsWith('Decisions & learnings')),
      `got: ${headings.join(', ')}`,
    );
  });
});
