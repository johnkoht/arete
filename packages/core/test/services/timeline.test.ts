/**
 * Tests for MemoryService.getTimeline and temporal signals in ContextService.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { MemoryService } from '../../src/services/memory.js';
import { ContextService } from '../../src/services/context.js';
import type { WorkspacePaths } from '../../src/models/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
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

function writeFile(root: string, relativePath: string, content: string): void {
  const fullPath = join(root, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function writeMemoryFile(root: string, fileName: string, content: string): void {
  writeFile(root, join('.arete', 'memory', 'items', fileName), content);
}

function writeMeetingFile(root: string, fileName: string, content: string): void {
  writeFile(root, join('resources', 'meetings', fileName), content);
}

// ---------------------------------------------------------------------------
// MemoryService.getTimeline tests
// ---------------------------------------------------------------------------

describe('MemoryService.getTimeline', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let service: MemoryService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'timeline-'));
    paths = makePaths(tmpDir);
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    service = new MemoryService(storage, search);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty timeline when no memory files exist', async () => {
    const result = await service.getTimeline('onboarding', paths);
    assert.equal(result.query, 'onboarding');
    assert.equal(result.items.length, 0);
    assert.equal(result.themes.length, 0);
  });

  it('finds memory items matching query', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-15: Use Elasticsearch for search
**Decision**: We chose Elasticsearch over Algolia for search.

### 2026-01-20: Onboarding flow redesign
**Context**: Onboarding drop-off was 40%.
**Decision**: Redesign the onboarding wizard.
`);
    writeMemoryFile(tmpDir, 'learnings.md', `# Learnings

### 2026-02-01: Onboarding insight
**Insight**: Self-guided onboarding reduces support burden by 60%.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.items.length >= 2, `Expected at least 2 items, got ${result.items.length}`);
    assert.ok(result.items.every(item => item.date.length > 0));
    // Should be sorted newest first
    for (let i = 1; i < result.items.length; i++) {
      assert.ok(result.items[i - 1].date >= result.items[i].date, 'Items should be sorted newest first');
    }
  });

  it('filters by date range', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-10: Early decision about onboarding
**Decision**: Start onboarding project.

### 2026-02-01: Late decision about onboarding
**Decision**: Revamp onboarding flow.
`);

    const result = await service.getTimeline('onboarding', paths, {
      start: '2026-01-15',
      end: '2026-02-15',
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].date, '2026-02-01');
  });

  it('filters with start date only', async () => {
    writeMemoryFile(tmpDir, 'learnings.md', `# Learnings

### 2025-12-01: Old onboarding learning
**Insight**: Users need help.

### 2026-02-10: Recent onboarding learning
**Insight**: Tutorial videos help onboarding.
`);

    const result = await service.getTimeline('onboarding', paths, {
      start: '2026-01-01',
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].date, '2026-02-10');
  });

  it('includes meeting transcripts matching query', async () => {
    writeMeetingFile(tmpDir, '2026-01-28-onboarding-metrics.md', `---
title: "Discuss onboarding metrics"
date: "2026-01-28"
source: "Fathom"
---

# Discuss onboarding metrics

## Summary
Reviewed onboarding funnel metrics with the team. Discussed conversion rates and user drop-off points.

## Transcript
Sarah: The onboarding completion rate went up to 75%.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.items.length >= 1);
    const meetingItem = result.items.find(i => i.type === 'meeting');
    assert.ok(meetingItem, 'Should include meeting item');
    assert.equal(meetingItem!.date, '2026-01-28');
    assert.ok(meetingItem!.source.includes('onboarding-metrics'));
  });

  it('combines memory items and meetings in chronological order', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-02-10: Updated onboarding flow
**Decision**: Updated onboarding for non-technical PMs.
`);
    writeMemoryFile(tmpDir, 'learnings.md', `# Learnings

### 2026-02-05: Onboarding self-guided
**Insight**: Self-guided onboarding reduces support burden.
`);
    writeMeetingFile(tmpDir, '2026-01-28-onboarding-review.md', `---
title: "Onboarding review with Sarah"
date: "2026-01-28"
---

# Onboarding review with Sarah
Discussed onboarding metrics and progress.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.items.length >= 3, `Expected at least 3 items, got ${result.items.length}`);
    // Verify chronological order (newest first)
    assert.equal(result.items[0].date, '2026-02-10');
    assert.equal(result.items[1].date, '2026-02-05');
    assert.equal(result.items[2].date, '2026-01-28');
  });

  it('extracts recurring themes from matched entries', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-10: Onboarding setup improvements
Improve the setup documentation for new user onboarding experience.

### 2026-01-20: Onboarding wizard documentation
Better documentation for the onboarding setup wizard.

### 2026-02-01: Documentation for onboarding
Updated onboarding setup documentation with screenshots.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.items.length >= 3);
    // "onboarding", "setup", "documentation" should appear as themes (in 3+ items)
    assert.ok(result.themes.length > 0, 'Should extract at least one theme');
    assert.ok(result.themes.includes('onboarding'), 'Should include "onboarding" as theme');
    assert.ok(result.themes.includes('documentation'), 'Should include "documentation" as theme');
  });

  it('returns empty items when query has no matches', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-15: Use Elasticsearch for search
**Decision**: We chose Elasticsearch.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.equal(result.items.length, 0);
  });

  it('includes relevance scores on all items', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-20: Onboarding flow
**Decision**: Redesign the onboarding experience.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.items.length >= 1);
    for (const item of result.items) {
      assert.equal(typeof item.relevanceScore, 'number');
      assert.ok(item.relevanceScore > 0, 'Relevance score should be positive');
    }
  });

  it('populates dateRange from items when no range specified', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-10: First onboarding decision
Started onboarding project.

### 2026-02-10: Latest onboarding decision
Updated onboarding flow.
`);

    const result = await service.getTimeline('onboarding', paths);
    assert.ok(result.dateRange.start);
    assert.ok(result.dateRange.end);
    assert.equal(result.dateRange.start, '2026-01-10');
    assert.equal(result.dateRange.end, '2026-02-10');
  });
});

// ---------------------------------------------------------------------------
// Temporal signals in ContextService tests
// ---------------------------------------------------------------------------

describe('ContextService temporal signals', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let contextService: ContextService;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'temporal-ctx-'));
    paths = makePaths(tmpDir);
    const storage = new FileStorageAdapter();
    const search = getSearchProvider(tmpDir);
    contextService = new ContextService(storage, search);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes temporal signals when memory items match the query', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-02-10: Onboarding flow redesign
**Decision**: Redesign onboarding for non-technical PMs.
`);

    const result = await contextService.getRelevantContext({
      query: 'onboarding',
      paths,
    });
    assert.ok(result.temporalSignals, 'Should have temporal signals');
    assert.ok(result.temporalSignals!.length > 0, 'Should have at least one temporal signal');
    assert.ok(
      result.temporalSignals![0].includes('last discussed'),
      'Signal should include "last discussed"',
    );
    assert.ok(
      result.temporalSignals![0].includes('decisions'),
      'Signal should reference the source',
    );
  });

  it('includes temporal signals from meeting files', async () => {
    writeMeetingFile(tmpDir, '2026-02-12-onboarding-review.md', `---
title: "Onboarding review"
date: "2026-02-12"
---

# Onboarding review
Discussed onboarding progress with team.
`);

    const result = await contextService.getRelevantContext({
      query: 'onboarding',
      paths,
    });
    assert.ok(result.temporalSignals, 'Should have temporal signals');
    assert.ok(result.temporalSignals!.length > 0);
    assert.ok(
      result.temporalSignals!.some(s => s.includes('meeting')),
      'Should have a meeting temporal signal',
    );
  });

  it('returns no temporal signals when query has no memory matches', async () => {
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions

### 2026-01-15: Search engine choice
**Decision**: Use Elasticsearch.
`);

    const result = await contextService.getRelevantContext({
      query: 'billing',
      paths,
    });
    assert.equal(result.temporalSignals, undefined);
  });

  it('limits temporal signals to at most 5', async () => {
    // Write many onboarding entries
    const sections = Array.from({ length: 8 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return `### 2026-02-${day}: Onboarding item ${i + 1}\nDiscussed onboarding changes.\n`;
    }).join('\n');
    writeMemoryFile(tmpDir, 'decisions.md', `# Decisions\n\n${sections}`);

    const result = await contextService.getRelevantContext({
      query: 'onboarding',
      paths,
    });
    assert.ok(result.temporalSignals);
    assert.ok(result.temporalSignals!.length <= 5, `Expected at most 5, got ${result.temporalSignals!.length}`);
  });
});
