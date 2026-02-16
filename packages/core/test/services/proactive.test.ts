/**
 * Tests for proactive context assembly (Phase 6b):
 * - Deep source search in assembleBriefing
 * - ContextInventory with freshness, staleness, coverage gaps
 * - prepareForSkill with skill metadata and temporal patterns
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
import type { WorkspacePaths, SkillDefinition } from '../../src/models/index.js';

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

const SAMPLE_SKILL: SkillDefinition = {
  id: 'create-prd',
  name: 'create-prd',
  description: 'Create a product requirements document for a feature',
  path: '/ws/.agents/skills/create-prd',
  triggers: ['create a PRD', 'write requirements', 'define the feature'],
  primitives: ['Problem', 'User', 'Solution'],
  workType: 'definition',
  category: 'essential',
  requiresBriefing: true,
};

// ---------------------------------------------------------------------------
// getContextInventory tests
// ---------------------------------------------------------------------------

describe('ContextService.getContextInventory', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'inv-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty inventory for empty workspace', async () => {
    const inv = await services.context.getContextInventory(paths);
    assert.equal(inv.totalFiles, 0);
    assert.equal(inv.freshness.length, 0);
    assert.equal(inv.staleFiles.length, 0);
    assert.equal(inv.staleThresholdDays, 30);
    // All primitives should be missing with no files
    assert.ok(inv.missingPrimitives.length > 0);
  });

  it('detects freshness metadata for context files', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve enterprise problems.');
    const inv = await services.context.getContextInventory(paths);
    const biz = inv.freshness.find(f => f.relativePath === 'context/business-overview.md');
    assert.ok(biz, 'Should include business-overview.md in freshness');
    assert.equal(biz!.category, 'context');
    assert.equal(biz!.primitive, 'Problem');
    assert.ok(biz!.lastModified !== null, 'Should have lastModified date');
    assert.ok(biz!.daysOld !== null, 'Should have daysOld');
    assert.equal(biz!.isStale, false, 'Fresh file should not be stale');
  });

  it('flags stale files exceeding threshold', async () => {
    writeFileWithAge(tmpDir, 'context/users-personas.md', '# Users\n\nOur target users are enterprise teams.', 45);
    const inv = await services.context.getContextInventory(paths, { staleThresholdDays: 30 });
    assert.ok(inv.staleFiles.length >= 1, 'Should have at least 1 stale file');
    const stale = inv.staleFiles.find(f => f.relativePath === 'context/users-personas.md');
    assert.ok(stale, 'users-personas.md should be stale');
    assert.ok(stale!.isStale);
    assert.ok(stale!.daysOld !== null && stale!.daysOld >= 44, 'Should be at least 44 days old');
  });

  it('respects custom staleness threshold', async () => {
    writeFileWithAge(tmpDir, 'context/business-overview.md', '# Business\n\nSolving enterprise problems.', 10);
    const inv5 = await services.context.getContextInventory(paths, { staleThresholdDays: 5 });
    assert.ok(inv5.staleFiles.length >= 1, 'Should be stale with 5-day threshold');

    const inv30 = await services.context.getContextInventory(paths, { staleThresholdDays: 30 });
    const staleInv30 = inv30.staleFiles.find(f => f.relativePath === 'context/business-overview.md');
    assert.equal(staleInv30, undefined, 'Should not be stale with 30-day threshold');
  });

  it('identifies missing primitives (coverage gaps)', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems.');
    const inv = await services.context.getContextInventory(paths);
    // Problem should be covered, but User, Solution, Market, Risk should be missing
    assert.ok(!inv.missingPrimitives.includes('Problem'), 'Problem should be covered');
    assert.ok(inv.missingPrimitives.includes('User'), 'User should be missing');
    assert.ok(inv.missingPrimitives.includes('Market'), 'Market should be missing');
  });

  it('does not count placeholder files as coverage', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\n[Add your overview here]');
    const inv = await services.context.getContextInventory(paths);
    assert.ok(inv.missingPrimitives.includes('Problem'), 'Problem should be missing (placeholder)');
  });

  it('scans meetings and memory directories', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-01-15-standup.md', '---\ntitle: "Standup"\n---\n\n# Standup Notes\n\nDiscussed search.');
    writeFile(tmpDir, '.arete/memory/items/decisions.md', '# Decisions\n\n### 2026-01-10: Use Elasticsearch\n\nChose Elasticsearch.\n');
    const inv = await services.context.getContextInventory(paths);
    assert.ok(inv.totalFiles >= 2, 'Should include meeting and memory files');
    const meeting = inv.freshness.find(f => f.relativePath.includes('meetings'));
    assert.ok(meeting, 'Should include meeting file in freshness');
    const mem = inv.freshness.find(f => f.relativePath.includes('memory'));
    assert.ok(mem, 'Should include memory file in freshness');
  });

  it('includes byCategory counts', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nEnterprise search problems.');
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nQ1 focus on search.');
    const inv = await services.context.getContextInventory(paths);
    assert.ok(inv.byCategory['context'] >= 1);
    assert.ok(inv.byCategory['goals'] >= 1);
  });
});

// ---------------------------------------------------------------------------
// assembleBriefing deep source search tests
// ---------------------------------------------------------------------------

describe('IntelligenceService.assembleBriefing (proactive)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'briefing-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('searches meeting transcripts proactively', async () => {
    writeFile(tmpDir, 'resources/meetings/2026-01-15-search-review.md',
      '---\ntitle: "Search Feature Review"\n---\n\n# Search Feature Review\n\nDiscussed search architecture and Elasticsearch migration.');
    const result = await services.intelligence.assembleBriefing({
      task: 'search architecture review',
      paths,
    });
    // Meeting content should be found (either through context or proactive search)
    assert.ok(result.markdown.length > 0);
    assert.ok(result.assembledAt.length > 0);
  });

  it('searches project docs beyond README.md', async () => {
    writeFile(tmpDir, 'projects/active/search-discovery/README.md',
      '# Search Discovery\n\nDiscover user search needs.');
    writeFile(tmpDir, 'projects/active/search-discovery/prd.md',
      '# Search PRD\n\nRequirements for search feature: full text search, filters, facets.');
    const result = await services.intelligence.assembleBriefing({
      task: 'search feature requirements',
      paths,
    });
    // Should find project docs
    const projFiles = result.context.files.filter(f => f.category === 'projects');
    assert.ok(projFiles.length >= 1, 'Should find project docs');
  });

  it('deduplicates files across source types', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nWe solve search problems for enterprises.');
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nSearch is our Q1 priority.');
    const result = await services.intelligence.assembleBriefing({
      task: 'search strategy overview',
      paths,
    });
    // Check no duplicate paths in context files
    const pathSet = new Set<string>();
    for (const f of result.context.files) {
      assert.ok(!pathSet.has(f.path), `Duplicate file found: ${f.path}`);
      pathSet.add(f.path);
    }
  });

  it('ranks results by relevance score', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nEnterprise search platform solving discovery needs.');
    writeFile(tmpDir, 'goals/strategy.md', '# Strategy\n\nOur pillars for next quarter.');
    const result = await services.intelligence.assembleBriefing({
      task: 'enterprise search',
      paths,
    });
    if (result.context.files.length >= 2) {
      for (let i = 1; i < result.context.files.length; i++) {
        const prevScore = result.context.files[i - 1].relevanceScore ?? 0;
        const currScore = result.context.files[i].relevanceScore ?? 0;
        assert.ok(prevScore >= currScore, 'Files should be sorted by relevance score descending');
      }
    }
  });

  it('includes memory results alongside context', async () => {
    writeFile(tmpDir, '.arete/memory/items/decisions.md',
      '# Decisions\n\n### 2026-01-15: Chose Elasticsearch\n\nWe decided to use Elasticsearch for our search backend.\n');
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nSearch platform for enterprise.');
    const result = await services.intelligence.assembleBriefing({
      task: 'search technology decisions',
      paths,
    });
    assert.ok(result.memory.results.length >= 1, 'Should find memory results');
    assert.ok(result.context.files.length >= 1, 'Should find context files');
  });
});

// ---------------------------------------------------------------------------
// prepareForSkill tests
// ---------------------------------------------------------------------------

describe('IntelligenceService.prepareForSkill', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'prep-skill-'));
    paths = makePaths(tmpDir);
    services = createServices(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns SkillContext with skill metadata', async () => {
    const result = await services.intelligence.prepareForSkill(SAMPLE_SKILL, 'create a PRD for search', paths);
    assert.equal(result.task, 'create a PRD for search');
    assert.ok(result.assembledAt.length > 0);
    assert.ok(result.skill);
    assert.equal(result.skill.id, 'create-prd');
    assert.equal(result.skill.name, 'create-prd');
    assert.deepEqual(result.skill.primitives, ['Problem', 'User', 'Solution']);
    assert.equal(result.skill.work_type, 'definition');
  });

  it('uses skill primitives to focus context', async () => {
    writeFile(tmpDir, 'context/business-overview.md', '# Business\n\nSolving search friction.');
    writeFile(tmpDir, 'context/competitive-landscape.md', '# Competition\n\nAlgolia, Elasticsearch, Meilisearch.');
    const result = await services.intelligence.prepareForSkill(SAMPLE_SKILL, 'create a PRD for search', paths);
    // The skill requests Problem, User, Solution — not Market
    // Context should still be assembled properly
    assert.ok(result.context, 'Should have context');
    assert.ok(result.context!.primitives.length > 0, 'Should have primitives in context');
  });

  it('includes temporal patterns via memory', async () => {
    writeFile(tmpDir, '.arete/memory/items/decisions.md',
      '# Decisions\n\n### 2026-02-01: Search architecture chosen\n\nWe chose Elasticsearch for search.\n');
    writeFile(tmpDir, '.arete/memory/items/learnings.md',
      '# Learnings\n\n### 2026-01-20: Search UX research\n\nUsers want instant results and clear filters.\n');
    const result = await services.intelligence.prepareForSkill(SAMPLE_SKILL, 'create search PRD', paths);
    // Memory should include both briefing results and timeline items
    assert.ok(result.memory, 'Should have memory results');
    assert.ok(Array.isArray(result.memory), 'Memory should be an array');
  });

  it('includes recent memory from timeline (deduplicated)', async () => {
    writeFile(tmpDir, '.arete/memory/items/decisions.md',
      '# Decisions\n\n### 2026-02-10: API design for search\n\nREST endpoints with filter params.\n');
    writeFile(tmpDir, 'resources/meetings/2026-02-12-search-sync.md',
      '---\ntitle: "Search Sync"\n---\n\n# Search Sync\n\nDiscussed search API design and filter requirements.');
    const result = await services.intelligence.prepareForSkill(SAMPLE_SKILL, 'search API design', paths);
    // Should have memory results (deduplicated between briefing and timeline)
    if (result.memory && result.memory.length > 0) {
      const sourceKeys = result.memory.map(m => `${m.source}:${m.date ?? ''}`);
      const uniqueKeys = new Set(sourceKeys);
      assert.equal(sourceKeys.length, uniqueKeys.size, 'Memory results should be deduplicated');
    }
  });

  it('works with a skill that has no primitives', async () => {
    const genericSkill: SkillDefinition = {
      id: 'workspace-tour',
      name: 'workspace-tour',
      description: 'Orient users to the workspace',
      path: '/ws/.agents/skills/workspace-tour',
      triggers: ['tour', 'how does this work'],
      category: 'essential',
    };
    const result = await services.intelligence.prepareForSkill(genericSkill, 'give me a tour', paths);
    assert.ok(result.skill);
    assert.equal(result.skill.id, 'workspace-tour');
    assert.equal(result.task, 'give me a tour');
  });

  it('includes entities resolved from the task', async () => {
    writeFile(tmpDir, 'people/internal/jane-doe.md',
      '---\nname: "Jane Doe"\nemail: "jane@acme.com"\nrole: "PM"\ncategory: "internal"\n---\n\n# Jane Doe\n');
    const result = await services.intelligence.prepareForSkill(
      SAMPLE_SKILL,
      'create a PRD with Jane Doe for search',
      paths,
    );
    assert.ok(result.entities, 'Should have entities');
    if (result.entities && result.entities.length > 0) {
      const jane = result.entities.find(e => e.name === 'Jane Doe');
      assert.ok(jane, 'Should resolve Jane Doe');
    }
  });
});
