/**
 * Tests for MemoryService via compat searchMemory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { searchMemory } from '../../src/compat/memory.js';
import { getMemoryItemsForTopics, parseMemorySections } from '../../src/services/memory.js';
import type { WorkspacePaths } from '../../src/models/index.js';
import { createTestWorkspace } from '../fixtures/index.js';

describe('MemoryService (via compat)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let writeFixtureFile: (relativePath: string, content: string) => void;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mem-svc-'));
    const fixture = createTestWorkspace(tmpDir);
    paths = fixture.paths;
    writeFixtureFile = fixture.writeFile;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty results for empty query tokens', async () => {
    const result = await searchMemory('the a', paths);
    assert.equal(result.results.length, 0);
    assert.equal(result.total, 0);
  });

  it('finds decisions matching query tokens', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      `# Decisions

### 2026-01-15: Use Elasticsearch for search
**Decision**: We chose Elasticsearch over Algolia.

### 2026-01-20: Onboarding flow redesign
**Context**: Onboarding drop-off was 40%.
**Decision**: Redesign the onboarding wizard.
`,
    );

    const result = await searchMemory('onboarding', paths);
    assert.ok(result.results.length >= 1);
    assert.equal(result.results[0].type, 'decisions');
    assert.ok(result.results[0].content.includes('Onboarding'));
  });

  it('filters by memory type when specified', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      '# Decisions\n\n### 2026-01-15: Search decision\n\n**Decision**: Use Elasticsearch.\n',
    );
    writeFixtureFile(
      '.arete/memory/items/learnings.md',
      '# Learnings\n\n### 2026-02-01: Search insight\n\n**Insight**: Users want instant search.\n',
    );

    const result = await searchMemory('search', paths, { types: ['learnings'] });
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].type, 'learnings');
  });

  it('respects limit option', async () => {
    writeFixtureFile(
      '.arete/memory/items/decisions.md',
      `# Decisions
### 2026-01-10: Search tech
**Decision**: Elasticsearch.
### 2026-01-15: Search UX
**Decision**: Instant search.
### 2026-01-20: Search API
**Decision**: REST endpoints.
`,
    );

    const result = await searchMemory('search', paths, { limit: 2 });
    assert.equal(result.results.length, 2);
    assert.equal(result.total, 3);
  });
});

// ---------------------------------------------------------------------------
// parseMemorySections — single-pass classifier with priority order
// ---------------------------------------------------------------------------

describe('parseMemorySections', () => {
  // Need to import dynamically since it's exported but the test file is
  // already long; keep the import at the top alongside getMemoryItemsForTopics.
  it('parses all three header shapes in the same file', async () => {
    const content = `# Mixed file

## New writer convention
- **Date**: 2026-04-20
Body of new section.

### 2026-03-15: Legacy date-prefixed
Body of legacy dated section.

### Legacy bare title
Body of legacy bare section.
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, 'New writer convention');
    assert.equal(sections[0].date, '2026-04-20');
    assert.equal(sections[1].title, 'Legacy date-prefixed');
    assert.equal(sections[1].date, '2026-03-15');
    assert.equal(sections[2].title, 'Legacy bare title');
    assert.equal(sections[2].date, undefined);
  });

  it('handles a mixed file with interleaved new + legacy headers and metadata bullets', async () => {
    const content = `# Decisions

### 2026-01-15: Use Elasticsearch
**Decision**: We chose Elasticsearch.

## Adopt instant search UX
- **Date**: 2026-04-21
- **Source**: Q2 Planning (Alice, Bob)
- **Topics**: search, ux
- We will roll out instant search next sprint.

### 2026-02-01: Cache layer
**Decision**: Add Redis.

## Postgres upgrade
- **Date**: 2026-04-22
- **Source**: Infra Sync (Carol)
- We're moving to Postgres 16.
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 4);

    // Section 0: legacy dated, no metadata bullets
    assert.equal(sections[0].title, 'Use Elasticsearch');
    assert.equal(sections[0].date, '2026-01-15');
    assert.equal(sections[0].topics, undefined);
    assert.equal(sections[0].source, undefined);

    // Section 1: new format with full metadata, including topics
    assert.equal(sections[1].title, 'Adopt instant search UX');
    assert.equal(sections[1].date, '2026-04-21');
    assert.equal(sections[1].source, 'Q2 Planning (Alice, Bob)');
    assert.deepEqual(sections[1].topics, ['search', 'ux']);

    // Section 2: legacy dated again — metadata from prior section MUST NOT bleed
    assert.equal(sections[2].title, 'Cache layer');
    assert.equal(sections[2].date, '2026-02-01');
    assert.equal(sections[2].topics, undefined);
    assert.equal(sections[2].source, undefined);

    // Section 3: new format without topics — topics stays undefined (not [])
    assert.equal(sections[3].title, 'Postgres upgrade');
    assert.equal(sections[3].date, '2026-04-22');
    assert.equal(sections[3].source, 'Infra Sync (Carol)');
    assert.equal(sections[3].topics, undefined);
  });

  it('does NOT parse a header line inside a fenced code block', async () => {
    const content = `Some preamble.

\`\`\`markdown
## This Is Inside A Fence
- **Date**: 2026-01-01
\`\`\`

## This Is A Real Section
- **Date**: 2026-04-28
- Content.
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'This Is A Real Section');
    assert.equal(sections[0].date, '2026-04-28');
  });

  it('tolerates trailing whitespace on header lines', async () => {
    const content = `## Title with trailing spaces   \n- **Date**: 2026-04-28\nbody\n`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    // Title is trimmed.
    assert.equal(sections[0].title, 'Title with trailing spaces');
    assert.equal(sections[0].date, '2026-04-28');
  });

  it('rejects empty title (whitespace-only after marker → no section produced)', async () => {
    const content = `## \nbody for ghost section\n\n## Real Title\n- **Date**: 2026-04-28\nreal body\n`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Real Title');
  });

  it('parses topics bullet into an array, splitting on comma and trimming', async () => {
    const content = `## Title
- **Date**: 2026-04-28
- **Topics**:   slug-one ,  slug-two,slug-three
- body
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].topics, ['slug-one', 'slug-two', 'slug-three']);
  });

  it('leaves topics undefined (not []) when bullet is absent', async () => {
    const content = `## Title
- **Date**: 2026-04-28
- body without topics
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].topics, undefined);
  });

  it('discards metadata bullets that appear before any header', async () => {
    const content = `# File preamble
- **Date**: 2026-01-01
- **Topics**: orphan

## First Section
- **Date**: 2026-04-28
- **Topics**: real
- body
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'First Section');
    assert.equal(sections[0].date, '2026-04-28');
    assert.deepEqual(sections[0].topics, ['real']);
  });

  it('preserves legacy-dated header date when no Date bullet is present', async () => {
    const content = `### 2026-02-01: Search insight
**Insight**: Users want instant search.
`;
    const sections = parseMemorySections(content);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, 'Search insight');
    assert.equal(sections[0].date, '2026-02-01');
  });
});

// ---------------------------------------------------------------------------
// getMemoryItemsForTopics
// ---------------------------------------------------------------------------

describe('getMemoryItemsForTopics', () => {
  let dir: string;
  let learningsPath: string;
  let decisionsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mem-topics-'));
    learningsPath = join(dir, 'learnings.md');
    decisionsPath = join(dir, 'decisions.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function todayMinusDays(days: number): string {
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  it('returns entries whose topics intersect any requested slug', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## Pricing learning
- **Date**: ${todayMinusDays(10)}
- **Source**: Pricing review (Alice)
- **Topics**: pricing
- We learned that customers prefer $99 over $149.

## Onboarding learning
- **Date**: ${todayMinusDays(5)}
- **Source**: Onboarding sync
- **Topics**: onboarding
- New users want fewer steps.

## Cross-cutting learning
- **Date**: ${todayMinusDays(2)}
- **Topics**: pricing, retention
- Discounts help retention.
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing']);
    assert.equal(result.length, 2);
    assert.ok(result.some((e) => e.title === 'Pricing learning'));
    assert.ok(result.some((e) => e.title === 'Cross-cutting learning'));
    // Each result carries the topics array verbatim from the file.
    const pricing = result.find((e) => e.title === 'Pricing learning');
    assert.deepEqual(pricing?.topics, ['pricing']);
  });

  it('respects the per-slug cap (default 5)', async () => {
    const lines: string[] = ['# Learnings\n'];
    for (let i = 0; i < 8; i++) {
      lines.push(
        `## Item ${i}`,
        `- **Date**: ${todayMinusDays(i)}`,
        `- **Topics**: search`,
        `- entry ${i}`,
        '',
      );
    }
    writeFileSync(learningsPath, lines.join('\n'), 'utf8');

    const result = await getMemoryItemsForTopics([learningsPath], ['search']);
    assert.equal(result.length, 5);
  });

  it('respects a custom per-slug limit', async () => {
    const lines: string[] = ['# Learnings\n'];
    for (let i = 0; i < 5; i++) {
      lines.push(
        `## Item ${i}`,
        `- **Date**: ${todayMinusDays(i)}`,
        `- **Topics**: pricing`,
        `- entry ${i}`,
        '',
      );
    }
    writeFileSync(learningsPath, lines.join('\n'), 'utf8');

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing'], { limit: 2 });
    assert.equal(result.length, 2);
  });

  it('respects the sinceDays window (default 90)', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## Recent
- **Date**: ${todayMinusDays(10)}
- **Topics**: pricing
- recent body

## Old
- **Date**: ${todayMinusDays(120)}
- **Topics**: pricing
- old body
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing']);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Recent');
  });

  it('respects a custom sinceDays window', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## Within window
- **Date**: ${todayMinusDays(20)}
- **Topics**: pricing
- body

## Outside window
- **Date**: ${todayMinusDays(40)}
- **Topics**: pricing
- body
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing'], { sinceDays: 30 });
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Within window');
  });

  it('returns [] when no entry matches any requested slug', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## Some entry
- **Date**: ${todayMinusDays(5)}
- **Topics**: onboarding
- body
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing']);
    assert.deepEqual(result, []);
  });

  it('returns [] when topicSlugs is empty', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## Some entry
- **Date**: ${todayMinusDays(5)}
- **Topics**: pricing
- body
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], []);
    assert.deepEqual(result, []);
  });

  it('skips missing files silently', async () => {
    const result = await getMemoryItemsForTopics(
      [join(dir, 'does-not-exist.md')],
      ['pricing'],
    );
    assert.deepEqual(result, []);
  });

  it('infers the entry type from the file basename', async () => {
    writeFileSync(
      decisionsPath,
      `# Decisions

## Decision A
- **Date**: ${todayMinusDays(3)}
- **Topics**: pricing
- We chose Option X.
`,
      'utf8',
    );
    writeFileSync(
      learningsPath,
      `# Learnings

## Learning A
- **Date**: ${todayMinusDays(3)}
- **Topics**: pricing
- We learned Y.
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics(
      [decisionsPath, learningsPath],
      ['pricing'],
    );
    assert.equal(result.length, 2);
    const decision = result.find((e) => e.title === 'Decision A');
    const learning = result.find((e) => e.title === 'Learning A');
    assert.equal(decision?.type, 'decisions');
    assert.equal(learning?.type, 'learnings');
  });

  it('uses the parsed Source bullet when present, fileName as fallback', async () => {
    writeFileSync(
      learningsPath,
      `# Learnings

## With source
- **Date**: ${todayMinusDays(3)}
- **Source**: Q2 Planning (Alice)
- **Topics**: pricing
- body

## Without source
- **Date**: ${todayMinusDays(3)}
- **Topics**: pricing
- body
`,
      'utf8',
    );

    const result = await getMemoryItemsForTopics([learningsPath], ['pricing']);
    assert.equal(result.length, 2);
    const withSource = result.find((e) => e.title === 'With source');
    const withoutSource = result.find((e) => e.title === 'Without source');
    assert.equal(withSource?.source, 'Q2 Planning (Alice)');
    assert.equal(withoutSource?.source, 'learnings.md');
  });
});
