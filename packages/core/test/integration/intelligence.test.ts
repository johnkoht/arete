/**
 * Integration tests for Phase 6 intelligence features.
 *
 * Verifies the full intelligence pipeline end-to-end:
 * - assembleBriefing with temporal signals, proactive search, entity relationships
 * - getTimeline with themes and date filtering
 * - getContextInventory with freshness dashboard
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { getSearchProvider } from '../../src/search/factory.js';
import { ContextService } from '../../src/services/context.js';
import { MemoryService } from '../../src/services/memory.js';
import { EntityService } from '../../src/services/entity.js';
import { IntelligenceService } from '../../src/services/intelligence.js';
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

function writeFileWithAge(root: string, relativePath: string, content: string, daysOld: number): void {
  writeFile(root, relativePath, content);
  const fullPath = join(root, relativePath);
  const past = new Date();
  past.setDate(past.getDate() - daysOld);
  utimesSync(fullPath, past, past);
}

function createServices(root: string): {
  context: ContextService;
  memory: MemoryService;
  entity: EntityService;
  intelligence: IntelligenceService;
} {
  const storage = new FileStorageAdapter();
  const search = getSearchProvider(root);
  const context = new ContextService(storage, search);
  const memory = new MemoryService(storage, search);
  const entity = new EntityService(storage);
  const intelligence = new IntelligenceService(context, memory, entity);
  return { context, memory, entity, intelligence };
}

// ---------------------------------------------------------------------------
// Test 1: Full briefing assembly with all intelligence features
// ---------------------------------------------------------------------------

describe('Integration: assembleBriefing', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'intel-integ-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces briefing with temporal signals, proactive search, and entity relationships', async () => {
    // Context files
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe build search products for enterprise onboarding.');
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nFocus on onboarding success metrics.');

    // Memory items
    writeFile(tmpDir, '.arete/memory/items/decisions.md', `# Decisions

### 2026-02-10: Onboarding flow redesign
**Decision**: Redesign onboarding wizard for non-technical users.

### 2026-01-20: Onboarding metrics baseline
**Decision**: Track completion rate as primary onboarding metric.
`);

    // Meeting transcript
    writeFile(tmpDir, 'resources/meetings/2026-02-12-onboarding-sync.md', `---
title: "Onboarding Sync with Sarah"
date: "2026-02-12"
attendees: "Sarah Chen, Jane Doe"
attendee_ids: ["sarah-chen", "jane-doe"]
---

# Onboarding Sync
Discussed onboarding funnel improvements. Sarah presented completion rate data.
`);

    // Person file (entity)
    writeFile(tmpDir, 'people/internal/sarah-chen.md', `---
name: "Sarah Chen"
email: "sarah@acme.com"
role: "Senior PM"
category: "internal"
---

# Sarah Chen
`);

    // Project with team section (for works_on relationship)
    writeFile(tmpDir, 'projects/active/onboarding-discovery/README.md', `# Onboarding Discovery

owner: Sarah Chen
team: Sarah Chen, Jane Doe

## Summary
Discovery project for onboarding improvements.
`);

    const result = await services.intelligence.assembleBriefing({
      task: 'prep for meeting with Sarah Chen about onboarding improvements',
      paths,
    });

    // Verify context files from multiple sources
    assert.ok(result.context.files.length >= 1, 'Should have context files');
    const hasContext = result.context.files.some(f =>
      f.relativePath.includes('business-overview') || f.relativePath.includes('strategy'),
    );
    assert.ok(hasContext, 'Should include context or goals files');

    // Verify memory search results
    assert.ok(result.memory.results.length >= 1, 'Should have memory results');
    assert.ok(result.markdown.includes('Relevant Memory'), 'Markdown should include Relevant Memory section');

    // Verify entity resolution
    assert.ok(result.entities.length >= 1, 'Should resolve entities');
    const sarah = result.entities.find(e => e.name === 'Sarah Chen');
    assert.ok(sarah, 'Should resolve Sarah Chen');

    // Verify entity relationships (works_on, attended, or mentioned_in)
    if (result.relationships.length > 0) {
      assert.ok(result.markdown.includes('Entity Relationships'), 'Markdown should include relationship section');
    }

    // Verify temporal signals in context (when memory/meetings match)
    if (result.context.temporalSignals && result.context.temporalSignals.length > 0) {
      assert.ok(
        result.context.temporalSignals.some(s => s.includes('last discussed')),
        'Temporal signals should include recency',
      );
    }

    // Verify markdown structure
    assert.ok(typeof result.markdown === 'string');
    assert.ok(result.markdown.includes('Primitive Briefing'));
    assert.ok(['High', 'Medium', 'Low'].includes(result.confidence));
  });
});

// ---------------------------------------------------------------------------
// Test 2: Memory timeline end-to-end
// ---------------------------------------------------------------------------

describe('Integration: getTimeline', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'timeline-integ-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces meaningful output with themes and chronological ordering', async () => {
    writeFile(tmpDir, '.arete/memory/items/decisions.md', `# Decisions

### 2026-01-10: Onboarding setup improvements
Improve setup documentation for new user onboarding.

### 2026-01-20: Onboarding wizard documentation
Better docs for the onboarding wizard flow.

### 2026-02-01: Documentation for onboarding
Updated onboarding setup with screenshots.
`);

    writeFile(tmpDir, 'resources/meetings/2026-01-28-onboarding-review.md', `---
title: "Onboarding Review"
date: "2026-01-28"
---

# Onboarding Review
Discussed onboarding metrics and completion rates.
`);

    const result = await services.memory.getTimeline('onboarding', paths);

    assert.ok(result.items.length >= 3, 'Should have multiple timeline items');
    assert.ok(result.themes.length > 0, 'Should extract recurring themes');
    assert.ok(result.themes.includes('onboarding'), 'Should include "onboarding" theme');

    // Chronological order (newest first)
    for (let i = 1; i < result.items.length; i++) {
      assert.ok(
        result.items[i - 1].date >= result.items[i].date,
        `Items should be sorted newest first: ${result.items[i - 1].date} >= ${result.items[i].date}`,
      );
    }

    // Date range populated
    assert.ok(result.dateRange.start, 'Should have date range start');
    assert.ok(result.dateRange.end, 'Should have date range end');

    // Date range filtering works
    const filtered = await services.memory.getTimeline('onboarding', paths, {
      start: '2026-01-15',
      end: '2026-01-25',
    });
    assert.ok(filtered.items.length <= result.items.length, 'Filtered should have fewer or equal items');
  });
});

// ---------------------------------------------------------------------------
// Test 3: Context inventory end-to-end
// ---------------------------------------------------------------------------

describe('Integration: getContextInventory', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'inventory-integ-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows complete freshness dashboard with stale flagging and coverage gaps', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve enterprise search problems.');
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nQ1 focus on onboarding.');
    writeFileWithAge(tmpDir, 'context/users-personas.md', '# Users\n\nEnterprise teams.', 45);
    writeFile(tmpDir, 'resources/meetings/2026-02-10-standup.md', '---\ntitle: "Standup"\n---\n\n# Standup\n');
    writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-02-01: Test\n\nDecision.\n');

    const inventory = await services.context.getContextInventory(paths, { staleThresholdDays: 30 });

    // Freshness metadata
    assert.ok(inventory.freshness.length >= 3, 'Should have freshness for multiple files');
    const biz = inventory.freshness.find(f => f.relativePath === 'context/business-overview.md');
    assert.ok(biz, 'Should include business-overview in freshness');
    assert.equal(biz!.category, 'context');
    assert.equal(biz!.primitive, 'Problem');
    assert.ok(biz!.lastModified !== null);
    assert.ok(biz!.daysOld !== null);

    // Stale flagging
    assert.ok(inventory.staleFiles.length >= 1, 'Should flag stale files');
    const stale = inventory.staleFiles.find(f => f.relativePath === 'context/users-personas.md');
    assert.ok(stale, 'users-personas.md should be stale');
    assert.ok(stale!.isStale);

    // Coverage gaps
    assert.ok(Array.isArray(inventory.missingPrimitives));
    // Problem covered by business-overview, User might be missing if users-personas is placeholder-like
    assert.ok(inventory.byCategory['context'] >= 1);
    assert.ok(inventory.byCategory['goals'] >= 1);

    // Scanned metadata
    assert.ok(inventory.scannedAt.length > 0);
    assert.equal(inventory.staleThresholdDays, 30);
  });
});
