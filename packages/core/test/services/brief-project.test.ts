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
