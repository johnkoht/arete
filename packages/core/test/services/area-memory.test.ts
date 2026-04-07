/**
 * Tests for AreaMemoryService.
 *
 * Uses mock StorageAdapter, stub AreaParserService, stub CommitmentsService,
 * and stub MemoryService — no filesystem or network access.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { WorkspacePaths, Commitment, AreaContext } from '../../src/models/index.js';
import { AreaMemoryService, isAreaMemoryStale, buildSynthesisPrompt } from '../../src/services/area-memory.js';
import type { LLMCallFn } from '../../src/services/area-memory.js';
import type { AreaParserService } from '../../src/services/area-parser.js';
import type { CommitmentsService } from '../../src/services/commitments.js';
import type { MemoryService } from '../../src/services/memory.js';

// ---------------------------------------------------------------------------
// Mock StorageAdapter
// ---------------------------------------------------------------------------

type MockStore = Map<string, string>;

function createMockStorage(initial: MockStore = new Map()): StorageAdapter & { store: MockStore } {
  const store: MockStore = new Map(initial);
  return {
    store,
    async read(path: string): Promise<string | null> {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string): Promise<void> {
      store.set(path, content);
    },
    async exists(path: string): Promise<boolean> {
      // Check exact match or if any key starts with path + '/'
      if (store.has(path)) return true;
      for (const key of store.keys()) {
        if (key.startsWith(path + '/')) return true;
      }
      return false;
    },
    async delete(path: string): Promise<void> {
      store.delete(path);
    },
    async list(dir: string, opts?: { extensions?: string[] }): Promise<string[]> {
      const results: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(dir + '/') && !key.slice(dir.length + 1).includes('/')) {
          if (opts?.extensions) {
            const hasExt = opts.extensions.some(ext => key.endsWith(ext));
            if (!hasExt) continue;
          }
          results.push(key);
        }
      }
      return results;
    },
    async listSubdirectories(): Promise<string[]> {
      return [];
    },
    async mkdir(): Promise<void> {},
    async getModified(): Promise<Date | null> {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = '/workspace';

function makeWorkspacePaths(): WorkspacePaths {
  return {
    root: WORKSPACE_ROOT,
    manifest: join(WORKSPACE_ROOT, 'arete.yaml'),
    ideConfig: join(WORKSPACE_ROOT, '.cursor'),
    rules: join(WORKSPACE_ROOT, '.cursor/rules'),
    agentSkills: join(WORKSPACE_ROOT, '.agents/skills'),
    tools: join(WORKSPACE_ROOT, '.cursor/tools'),
    integrations: join(WORKSPACE_ROOT, '.cursor/integrations'),
    context: join(WORKSPACE_ROOT, 'context'),
    memory: join(WORKSPACE_ROOT, '.arete/memory'),
    now: join(WORKSPACE_ROOT, 'now'),
    goals: join(WORKSPACE_ROOT, 'goals'),
    projects: join(WORKSPACE_ROOT, 'projects'),
    resources: join(WORKSPACE_ROOT, 'resources'),
    people: join(WORKSPACE_ROOT, 'people'),
    credentials: join(WORKSPACE_ROOT, '.arete/credentials'),
    templates: join(WORKSPACE_ROOT, 'templates'),
  };
}

function makeAreaContext(overrides: Partial<AreaContext> = {}): AreaContext {
  return {
    slug: 'glance-comms',
    name: 'Glance Communications',
    status: 'active',
    recurringMeetings: [
      { title: 'CoverWhale Sync', attendees: ['alice-jones'], frequency: 'weekly' },
    ],
    filePath: join(WORKSPACE_ROOT, 'areas/glance-comms.md'),
    sections: {
      goal: null,
      focus: null,
      horizon: null,
      projects: null,
      backlog: null,
      stakeholders: null,
      notes: null,
    },
    ...overrides,
  };
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'a'.repeat(64),
    text: 'Send proposal',
    direction: 'i_owe_them',
    personSlug: 'alice-jones',
    personName: 'Alice Jones',
    source: 'meeting.md',
    date: '2026-03-20',
    status: 'open',
    resolvedAt: null,
    area: 'glance-comms',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stub services
// ---------------------------------------------------------------------------

function createStubAreaParser(areas: AreaContext[] = []): AreaParserService {
  return {
    getAreaContext(slug: string) {
      return Promise.resolve(areas.find(a => a.slug === slug) ?? null);
    },
    listAreas() {
      return Promise.resolve(areas);
    },
    parseAreaFile() {
      return Promise.resolve(null);
    },
    getAreaForMeeting() {
      return Promise.resolve(null);
    },
  } as unknown as AreaParserService;
}

function createStubCommitments(openItems: Commitment[] = []): CommitmentsService {
  return {
    listOpen(opts?: { area?: string }) {
      if (opts?.area) {
        return Promise.resolve(openItems.filter(c => c.area === opts.area));
      }
      return Promise.resolve(openItems);
    },
    listForPerson() {
      return Promise.resolve([]);
    },
  } as unknown as CommitmentsService;
}

function createStubMemory(): MemoryService {
  return {} as unknown as MemoryService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AreaMemoryService', () => {
  let storage: StorageAdapter & { store: MockStore };
  let paths: WorkspacePaths;

  beforeEach(() => {
    storage = createMockStorage();
    paths = makeWorkspacePaths();
  });

  describe('refreshAreaMemory', () => {
    it('writes area memory file for valid area', async () => {
      const area = makeAreaContext();
      const commitment = makeCommitment();
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments([commitment]);
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAreaMemory('glance-comms', paths);

      assert.equal(result, true);

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      const content = storage.store.get(outputPath);
      assert.ok(content, 'Area memory file should be written');
      assert.ok(content.includes('area_slug: glance-comms'), 'Should have area_slug in frontmatter');
      assert.ok(content.includes('area_name: "Glance Communications"'), 'Should have area_name');
      assert.ok(content.includes('last_refreshed:'), 'Should have last_refreshed');
      assert.ok(content.includes('Send proposal'), 'Should include commitment text');
    });

    it('returns false for non-existent area', async () => {
      const areaParser = createStubAreaParser([]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAreaMemory('nonexistent', paths);

      assert.equal(result, false);
    });

    it('respects dry-run mode', async () => {
      const area = makeAreaContext();
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths, { dryRun: true });

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      assert.equal(storage.store.has(outputPath), false, 'Should not write in dry-run mode');
    });

    it('includes active people from recurring meetings', async () => {
      const area = makeAreaContext({
        recurringMeetings: [
          { title: 'Team Sync', attendees: ['alice-jones', 'bob-smith'], frequency: 'weekly' },
        ],
      });
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      const content = storage.store.get(outputPath)!;
      assert.ok(content.includes('alice-jones'), 'Should include alice-jones');
      assert.ok(content.includes('bob-smith'), 'Should include bob-smith');
    });

    it('includes recent decisions that match the area', async () => {
      const area = makeAreaContext();
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      // Add decisions.md with area-matching content
      const today = new Date().toISOString().split('T')[0];
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n### ${today}: Adopt new email template for Glance Communications\n\nWe decided to use the new template.\n\n### ${today}: Unrelated decision\n\nThis is about something else.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      const content = storage.store.get(outputPath)!;
      assert.ok(content.includes('Adopt new email template'), 'Should include matched decision');
      assert.ok(!content.includes('Unrelated decision'), 'Should not include unrelated decision');
    });

    it('parses real memory format (## heading + Date line)', async () => {
      const areaContext = makeAreaContext({ slug: 'glance-comms', name: 'Glance Communications' });
      const areaParser = createStubAreaParser([areaContext]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const today = new Date().toISOString().split('T')[0];
      // Real format: ## heading, then - **Date**: on a separate line
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n## Email template rollout for Glance Communications\n- **Date**: ${today}\n- **Source**: Email Templates Deep Dive (Jamie Burk)\n- Phase 1: POP team first.\n\n## Unrelated widget decision\n- **Date**: ${today}\n- **Source**: Widget Sync\n- Chose widget framework.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      const content = storage.store.get(outputPath)!;
      assert.ok(content.includes('Email template rollout'), 'Should include matched decision with ## heading');
      assert.ok(!content.includes('widget decision'), 'Should not include unrelated decision');
    });
  });

  describe('topics aggregation', () => {
    it('aggregates topics from meetings matched by area: frontmatter field', async () => {
      const area = makeAreaContext({ slug: 'glance-comms', recurringMeetings: [] });
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      // Meeting tagged with area: glance-comms and topics
      const today = new Date().toISOString().slice(0, 10);
      storage.store.set(
        join(WORKSPACE_ROOT, 'resources/meetings', `${today}-email-work.md`),
        `---\ntitle: "Email Work"\ndate: "${today}"\narea: glance-comms\ntopics:\n  - email-templates\n  - sms\nopen_action_items: 2\nmy_commitments: 1\ntheir_commitments: 1\nattendees: []\n---\n\nBody.`,
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const outputPath = join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md');
      const content = storage.store.get(outputPath)!;

      // Topics should appear in frontmatter
      assert.ok(content.includes('slug: email-templates'), 'Should have email-templates slug');
      assert.ok(content.includes('name: Email Templates'), 'Should have title-cased name');
      assert.ok(content.includes('meeting_count: 1'), 'Should have meeting_count: 1');
      assert.ok(content.includes('open_items: 2'), 'Should have open_items: 2');
      assert.ok(content.includes(`last_referenced: "${today}"`), 'Should have last_referenced');
      // Topics section in body
      assert.ok(content.includes('## Topics'), 'Should have Topics section');
      assert.ok(content.includes('**Email Templates**'), 'Should have bold topic name');
    });

    it('aggregates topics from meetings matched by recurring title', async () => {
      const area = makeAreaContext({
        slug: 'glance-comms',
        recurringMeetings: [{ title: 'CoverWhale Sync', attendees: [], frequency: 'weekly' }],
      });
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const today = new Date().toISOString().slice(0, 10);
      storage.store.set(
        join(WORKSPACE_ROOT, 'resources/meetings', `${today}-coverwhale-sync.md`),
        `---\ntitle: "CoverWhale Sync"\ndate: "${today}"\ntopics:\n  - roadmap\nopen_action_items: 1\nattendees: []\n---\n\nBody.`,
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const content = storage.store.get(join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md'))!;
      assert.ok(content.includes('slug: roadmap'), 'Should include roadmap from title-matched meeting');
    });

    it('counts meetings with two tags for the same topic across multiple meetings', async () => {
      const area = makeAreaContext({ slug: 'glance-comms', recurringMeetings: [] });
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const d1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const d2 = new Date().toISOString().slice(0, 10);
      storage.store.set(
        join(WORKSPACE_ROOT, 'resources/meetings', `${d1}-meeting-a.md`),
        `---\ntitle: "Meeting A"\ndate: "${d1}"\narea: glance-comms\ntopics:\n  - email-templates\nopen_action_items: 1\nattendees: []\n---\n\nBody.`,
      );
      storage.store.set(
        join(WORKSPACE_ROOT, 'resources/meetings', `${d2}-meeting-b.md`),
        `---\ntitle: "Meeting B"\ndate: "${d2}"\narea: glance-comms\ntopics:\n  - email-templates\n  - sms\nopen_action_items: 2\nattendees: []\n---\n\nBody.`,
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      await service.refreshAreaMemory('glance-comms', paths);

      const content = storage.store.get(join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md'))!;
      assert.ok(content.includes('meeting_count: 2'), 'email-templates should have meeting_count: 2');
      assert.ok(content.includes('open_items: 3'), 'Should sum open_action_items (1+2=3)');
      assert.ok(content.includes('slug: sms'), 'Should also have sms topic');
    });

    it('does not crash when meeting has no topics frontmatter field', async () => {
      const area = makeAreaContext({ slug: 'glance-comms', recurringMeetings: [] });
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const today = new Date().toISOString().slice(0, 10);
      storage.store.set(
        join(WORKSPACE_ROOT, 'resources/meetings', `${today}-no-topics.md`),
        `---\ntitle: "No Topics"\ndate: "${today}"\narea: glance-comms\nattendees: []\n---\n\nBody.`,
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      // Should not throw
      const result = await service.refreshAreaMemory('glance-comms', paths);
      assert.equal(result, true);

      const content = storage.store.get(join(WORKSPACE_ROOT, '.arete/memory/areas/glance-comms.md'))!;
      assert.ok(!content.includes('## Topics'), 'Should not have Topics section when no topics');
    });
  });

  describe('refreshAllAreaMemory', () => {
    it('refreshes all areas', async () => {
      const areas = [
        makeAreaContext({ slug: 'area-1', name: 'Area One' }),
        makeAreaContext({ slug: 'area-2', name: 'Area Two' }),
      ];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths);

      assert.equal(result.updated, 2);
      assert.equal(result.scannedAreas, 2);
      assert.equal(result.skipped, 0);
    });

    it('filters by areaSlug option', async () => {
      const areas = [
        makeAreaContext({ slug: 'area-1', name: 'Area One' }),
        makeAreaContext({ slug: 'area-2', name: 'Area Two' }),
      ];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths, { areaSlug: 'area-1' });

      assert.equal(result.updated, 1);
      assert.equal(result.scannedAreas, 1);
    });

    it('calls synthesizeCrossArea when callLLM provided and refreshing all areas', async () => {
      const areas = [
        makeAreaContext({ slug: 'area-1', name: 'Area One' }),
        makeAreaContext({ slug: 'area-2', name: 'Area Two' }),
      ];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const callLLM: LLMCallFn = async () => '## Connections\n- Area One connects to Area Two';

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths, { callLLM });

      assert.ok(result.synthesis, 'Should have synthesis result');
      assert.equal(result.synthesis!.updated, true);
      assert.ok(result.synthesis!.areasAnalyzed!.length > 0);

      // Verify _synthesis.md was written
      const synthPath = join(WORKSPACE_ROOT, '.arete/memory/areas/_synthesis.md');
      const content = storage.store.get(synthPath);
      assert.ok(content, '_synthesis.md should be written');
      assert.ok(content!.includes('type: cross-area-synthesis'), 'Should have type in frontmatter');
      assert.ok(content!.includes('last_refreshed:'), 'Should have last_refreshed');
      assert.ok(content!.includes('areas_analyzed:'), 'Should have areas_analyzed');
      assert.ok(content!.includes('Area One connects to Area Two'), 'Should contain LLM response');
    });

    it('skips synthesis when callLLM not provided', async () => {
      const areas = [makeAreaContext({ slug: 'area-1', name: 'Area One' })];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths);

      assert.ok(result.synthesis, 'Should have synthesis result');
      assert.equal(result.synthesis!.updated, false);
      assert.equal(result.synthesis!.skipped, true);
      assert.equal(result.synthesis!.reason, 'no AI configured');
    });

    it('skips synthesis on single-area refresh', async () => {
      const areas = [
        makeAreaContext({ slug: 'area-1', name: 'Area One' }),
        makeAreaContext({ slug: 'area-2', name: 'Area Two' }),
      ];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      let llmCalled = false;
      const callLLM: LLMCallFn = async () => { llmCalled = true; return 'response'; };

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths, { areaSlug: 'area-1', callLLM });

      assert.equal(llmCalled, false, 'Should not call LLM for single-area refresh');
      assert.equal(result.synthesis, undefined, 'No synthesis for single-area');
    });

    it('handles callLLM errors gracefully', async () => {
      const areas = [makeAreaContext({ slug: 'area-1', name: 'Area One' })];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const callLLM: LLMCallFn = async () => { throw new Error('LLM service unavailable'); };

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.refreshAllAreaMemory(paths, { callLLM });

      // Should still succeed for individual areas
      assert.equal(result.updated, 1);
      assert.ok(result.synthesis, 'Should have synthesis result');
      assert.equal(result.synthesis!.updated, false);
      assert.equal(result.synthesis!.skipped, true);
      assert.ok(result.synthesis!.reason!.includes('LLM service unavailable'));

      // No _synthesis.md should be written
      const synthPath = join(WORKSPACE_ROOT, '.arete/memory/areas/_synthesis.md');
      assert.equal(storage.store.has(synthPath), false);
    });
  });

  describe('compactDecisions', () => {
    it('compacts old decisions and archives them', async () => {
      const area = makeAreaContext();
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      // Add decisions with old dates
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n### 2025-01-01: Old Glance Communications decision\n\nThis is old.\n\n### 2026-03-30: Recent decision about widgets\n\nThis is new.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.compactDecisions(paths, { olderThan: 90 });

      assert.equal(result.compacted, 1);
      assert.ok(result.preserved >= 1, 'Recent decision should be preserved');
      assert.ok(result.archivePath, 'Should have archive path');

      // Check archive was created
      const archiveContent = storage.store.get(result.archivePath!);
      assert.ok(archiveContent, 'Archive file should exist');
      assert.ok(archiveContent.includes('Old Glance Communications decision'), 'Archive should contain old decision');

      // Check decisions.md still has the recent one
      const decisionsContent = storage.store.get(join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'))!;
      assert.ok(decisionsContent.includes('Recent decision'), 'Recent decision should be preserved');
    });

    it('does nothing when no old decisions exist', async () => {
      const areaParser = createStubAreaParser([]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const today = new Date().toISOString().split('T')[0];
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n### ${today}: Recent decision\n\nFresh.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.compactDecisions(paths, { olderThan: 90 });

      assert.equal(result.compacted, 0);
      assert.equal(result.preserved, 1);
    });

    it('preserves unmatched old decisions', async () => {
      const areaParser = createStubAreaParser([]); // No areas to match against
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n### 2025-01-01: Orphan decision about nothing\n\nNo area matches.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.compactDecisions(paths, { olderThan: 90 });

      // Unmatched decisions are preserved, not compacted
      assert.equal(result.compacted, 0);
      assert.equal(result.preserved, 1);
    });

    it('respects dry-run mode', async () => {
      const area = makeAreaContext();
      const areaParser = createStubAreaParser([area]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'),
        `# Decisions\n\n### 2025-01-01: Old Glance Communications decision\n\nThis is old.\n`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.compactDecisions(paths, { olderThan: 90, dryRun: true });

      assert.equal(result.compacted, 1);
      assert.equal(result.archivePath, undefined);

      // Original file should be unchanged
      const content = storage.store.get(join(WORKSPACE_ROOT, '.arete/memory/items/decisions.md'))!;
      assert.ok(content.includes('Old Glance Communications decision'));
    });

    it('returns empty result when decisions.md does not exist', async () => {
      const areaParser = createStubAreaParser([]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.compactDecisions(paths);

      assert.equal(result.compacted, 0);
      assert.equal(result.preserved, 0);
    });
  });

  describe('getLastRefreshed', () => {
    it('returns date from frontmatter', async () => {
      const areaParser = createStubAreaParser([]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/areas/test-area.md'),
        '---\nlast_refreshed: "2026-04-01T12:00:00.000Z"\n---\n\n# Test'
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.getLastRefreshed('test-area', paths);

      assert.equal(result, '2026-04-01T12:00:00.000Z');
    });

    it('returns null when file does not exist', async () => {
      const areaParser = createStubAreaParser([]);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const result = await service.getLastRefreshed('nonexistent', paths);

      assert.equal(result, null);
    });
  });

  describe('listAreaMemoryStatus', () => {
    it('returns status for all areas', async () => {
      const areas = [
        makeAreaContext({ slug: 'fresh-area', name: 'Fresh Area' }),
        makeAreaContext({ slug: 'stale-area', name: 'Stale Area' }),
        makeAreaContext({ slug: 'no-memory', name: 'No Memory' }),
      ];
      const areaParser = createStubAreaParser(areas);
      const commitments = createStubCommitments();
      const memoryService = createStubMemory();

      // Fresh area — refreshed today
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/areas/fresh-area.md'),
        `---\nlast_refreshed: "${new Date().toISOString()}"\n---\n\n# Fresh`
      );

      // Stale area — refreshed 30 days ago
      const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      storage.store.set(
        join(WORKSPACE_ROOT, '.arete/memory/areas/stale-area.md'),
        `---\nlast_refreshed: "${staleDate}"\n---\n\n# Stale`
      );

      const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
      const statuses = await service.listAreaMemoryStatus(paths);

      assert.equal(statuses.length, 3);
      const freshStatus = statuses.find(s => s.slug === 'fresh-area')!;
      const staleStatus = statuses.find(s => s.slug === 'stale-area')!;
      const noMemoryStatus = statuses.find(s => s.slug === 'no-memory')!;

      assert.equal(freshStatus.stale, false);
      assert.equal(staleStatus.stale, true);
      assert.equal(noMemoryStatus.stale, true);
      assert.equal(noMemoryStatus.lastRefreshed, null);
    });
  });
});

describe('synthesizeCrossArea', () => {
  let storage: StorageAdapter & { store: MockStore };
  let paths: WorkspacePaths;

  beforeEach(() => {
    storage = createMockStorage();
    paths = makeWorkspacePaths();
  });

  it('returns null when callLLM is not provided', async () => {
    const areaParser = createStubAreaParser([]);
    const commitments = createStubCommitments();
    const memoryService = createStubMemory();

    const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
    const result = await service.synthesizeCrossArea(paths);

    assert.equal(result, null);
  });

  it('returns null when no area files exist', async () => {
    const areaParser = createStubAreaParser([]);
    const commitments = createStubCommitments();
    const memoryService = createStubMemory();

    const callLLM: LLMCallFn = async () => 'should not be called';
    const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
    const result = await service.synthesizeCrossArea(paths, { callLLM });

    assert.equal(result, null);
  });

  it('passes all area content to callLLM and returns response', async () => {
    const areaParser = createStubAreaParser([]);
    const commitments = createStubCommitments();
    const memoryService = createStubMemory();

    // Seed area memory files
    const areaDir = join(WORKSPACE_ROOT, '.arete/memory/areas');
    storage.store.set(join(areaDir, 'engineering.md'), '---\narea_slug: engineering\n---\n# Engineering\nOpen work: build API');
    storage.store.set(join(areaDir, 'product.md'), '---\narea_slug: product\n---\n# Product\nOpen work: define roadmap');

    let capturedPrompt = '';
    const callLLM: LLMCallFn = async (prompt: string) => {
      capturedPrompt = prompt;
      return '## Connections\n- **Engineering <> Product**: API work relates to roadmap';
    };

    const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
    const result = await service.synthesizeCrossArea(paths, { callLLM });

    assert.ok(result, 'Should return a result');
    assert.ok(capturedPrompt.includes('engineering'), 'Prompt should contain engineering area name');
    assert.ok(capturedPrompt.includes('product'), 'Prompt should contain product area name');
    assert.ok(capturedPrompt.includes('build API'), 'Prompt should contain engineering content');
    assert.ok(capturedPrompt.includes('define roadmap'), 'Prompt should contain product content');
    assert.ok(result.response.includes('Engineering <> Product'), 'Should return LLM response');
    assert.deepEqual(result.areasAnalyzed.sort(), ['engineering', 'product']);
  });

  it('excludes _-prefixed files from synthesis', async () => {
    const areaParser = createStubAreaParser([]);
    const commitments = createStubCommitments();
    const memoryService = createStubMemory();

    const areaDir = join(WORKSPACE_ROOT, '.arete/memory/areas');
    storage.store.set(join(areaDir, 'engineering.md'), '# Engineering\nContent');
    storage.store.set(join(areaDir, '_synthesis.md'), '# Old synthesis\nShould be excluded');

    let capturedPrompt = '';
    const callLLM: LLMCallFn = async (prompt: string) => {
      capturedPrompt = prompt;
      return 'synthesis result';
    };

    const service = new AreaMemoryService(storage, areaParser, commitments, memoryService);
    const result = await service.synthesizeCrossArea(paths, { callLLM });

    assert.ok(result);
    assert.ok(!capturedPrompt.includes('Should be excluded'), 'Should not include _synthesis.md content');
    assert.deepEqual(result.areasAnalyzed, ['engineering']);
  });
});

describe('buildSynthesisPrompt', () => {
  it('includes all area names and content', () => {
    const prompt = buildSynthesisPrompt([
      { slug: 'eng', content: '# Engineering area content' },
      { slug: 'sales', content: '# Sales area content' },
    ]);

    assert.ok(prompt.includes('eng, sales'), 'Should list area names');
    assert.ok(prompt.includes('--- Area: eng ---'), 'Should have eng section delimiter');
    assert.ok(prompt.includes('# Engineering area content'), 'Should include eng content');
    assert.ok(prompt.includes('--- Area: sales ---'), 'Should have sales section delimiter');
    assert.ok(prompt.includes('# Sales area content'), 'Should include sales content');
    assert.ok(prompt.includes('Cross-area connections'), 'Should ask for connections');
    assert.ok(prompt.includes('Dependencies'), 'Should ask for dependencies');
  });
});

describe('isAreaMemoryStale', () => {
  it('returns true when lastRefreshed is null', () => {
    assert.equal(isAreaMemoryStale(null), true);
  });

  it('returns false when recently refreshed', () => {
    const recent = new Date().toISOString();
    assert.equal(isAreaMemoryStale(recent), false);
  });

  it('returns true when older than staleDays', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isAreaMemoryStale(old, 7), true);
  });

  it('respects custom staleDays', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isAreaMemoryStale(fiveDaysAgo, 3), true);
    assert.equal(isAreaMemoryStale(fiveDaysAgo, 7), false);
  });
});
