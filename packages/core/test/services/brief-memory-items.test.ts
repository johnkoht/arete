/**
 * W6 (wiki-repair-foundation) — decisions/learnings parser respec tests.
 *
 * The live `.arete/memory/items/{decisions,learnings}.md` format is
 * `## Title` headings with `- **Date**:` / `- **Topics**:` bullets, NOT
 * the legacy `### YYYY-MM-DD: Title` + `Area:` shape the old parser
 * expected. Verifies:
 *  - parseMemoryItemEntries handles the live format
 *  - legacy format (### heading + Area:/[area:]) still parses (fallback)
 *  - loadTopicAreaMap surfaces topic-page `area:` frontmatter
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { TopicMemoryService } from '../../src/services/topic-memory.js';
import {
  parseMemoryItemEntries,
  loadTopicAreaMap,
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

describe('parseMemoryItemEntries', () => {
  it('parses the LIVE format: ## Title + **Date** + **Topics** bullets', () => {
    const content = `# Decisions

## Reprioritize draft emails ahead of inbound emails
- **Date**: 2026-05-29
- **Source**: 2026-05-29-slack-digest.md (DMs w/ Lindsay Gray)
- **Topics**: glance-communications, rollout-strategy, copilot-email-drafting
- CJ escalated that automated status letters are needed across all programs.

## DOI language: ship via a drop method
- **Date**: 2026-05-29
- **Source**: 2026-05-29-slack-digest.md (DM w/ Anthony Avina)
- **Topics**: doi-fraud-language, glance-communications
- With a path forward identified, DOI work continues.
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 2);

    assert.equal(entries[0].title, 'Reprioritize draft emails ahead of inbound emails');
    assert.equal(entries[0].date, '2026-05-29');
    assert.deepEqual(entries[0].topics, [
      'glance-communications',
      'rollout-strategy',
      'copilot-email-drafting',
    ]);
    assert.equal(entries[0].area, undefined);

    assert.equal(entries[1].title, 'DOI language: ship via a drop method');
    assert.deepEqual(entries[1].topics, ['doi-fraud-language', 'glance-communications']);
  });

  it('strips backticks from Topics slugs and skips empties', () => {
    const content = `## Some decision
- **Date**: 2026-06-01
- **Topics**: \`glance-2-mvp\`, , \`multiagent-priority\`
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].topics, ['glance-2-mvp', 'multiagent-priority']);
  });

  it('entries without a Topics bullet parse with empty topics', () => {
    const content = `## Untagged decision
- **Date**: 2026-06-02
- Body bullet only, ties mentioned inline in prose.
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].title, 'Untagged decision');
    assert.equal(entries[0].date, '2026-06-02');
    assert.deepEqual(entries[0].topics, []);
  });

  it('legacy fallback: ### YYYY-MM-DD: Title + Area: line', () => {
    const content = `# Decisions

### 2026-05-15: Anchor discovery in adjuster interviews
Area: glance-modernization

Decided to lean on adjuster interviews.

### 2026-04-01: Use POP migration path
Area: other-area
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].title, 'Anchor discovery in adjuster interviews');
    assert.equal(entries[0].date, '2026-05-15');
    assert.equal(entries[0].area, 'glance-modernization');
    assert.equal(entries[1].area, 'other-area');
  });

  it('legacy fallback: [area:foo] inline tag', () => {
    const content = `## Tagged via inline tag
- **Date**: 2026-05-20
Some body line with [area:glance-communications] tag.
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].area, 'glance-communications');
  });

  it('Area: line beyond the first body line is still found (old regex truncated at line 1)', () => {
    const content = `### 2026-05-01: Multi-line legacy entry
First body line without the tag.
Second body line.
Area: glance-modernization
`;
    const entries = parseMemoryItemEntries(content);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].area, 'glance-modernization');
  });

  it('ignores the # H1 and returns [] for empty content', () => {
    assert.deepEqual(parseMemoryItemEntries('# Decisions\n\nNo entries yet.\n'), []);
    assert.deepEqual(parseMemoryItemEntries(''), []);
  });
});

describe('loadTopicAreaMap', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'topic-area-map-'));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('maps topic_slug → area from topic-page frontmatter; skips pages without area', async () => {
    const topicsDir = join(tmpDir, '.arete', 'memory', 'topics');
    mkdirSync(topicsDir, { recursive: true });
    writeFileSync(
      join(topicsDir, 'rollout-strategy.md'),
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
      'utf8',
    );
    writeFileSync(
      join(topicsDir, 'no-area-topic.md'),
      `---
topic_slug: no-area-topic
status: new
first_seen: 2026-04-24
last_refreshed: 2026-06-04
sources_integrated: []
---

# No Area Topic

## Current state
A topic page without area frontmatter.
`,
      'utf8',
    );

    const storage = new FileStorageAdapter();
    const topicMemory = new TopicMemoryService(storage, getSearchProvider(tmpDir));
    const map = await loadTopicAreaMap(topicMemory, paths);
    assert.equal(map.get('rollout-strategy'), 'glance-communications');
    assert.equal(map.has('no-area-topic'), false);
  });

  it('returns an empty map when the topics dir is missing', async () => {
    const storage = new FileStorageAdapter();
    const topicMemory = new TopicMemoryService(storage, getSearchProvider(tmpDir));
    const map = await loadTopicAreaMap(topicMemory, paths);
    assert.equal(map.size, 0);
  });
});
