/**
 * Tests for HygieneService.
 *
 * Uses mock StorageAdapter with Map<string,string>, stub service deps.
 * No filesystem or network access.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { CommitmentsService } from '../../src/services/commitments.js';
import type { AreaMemoryService } from '../../src/services/area-memory.js';
import type { AreaParserService } from '../../src/services/area-parser.js';
import type { MemoryService } from '../../src/services/memory.js';
import type { HygieneReport, ApprovedAction } from '../../src/models/hygiene.js';
import { HygieneService } from '../../src/services/hygiene.js';

// ---------------------------------------------------------------------------
// Mock StorageAdapter
// ---------------------------------------------------------------------------

type MockStore = Map<string, string>;

function createMockStorage(initial?: MockStore): StorageAdapter & { store: MockStore } {
  const store: MockStore = initial ?? new Map();
  return {
    store,
    async read(path: string): Promise<string | null> {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string): Promise<void> {
      store.set(path, content);
    },
    async exists(path: string): Promise<boolean> {
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
// Stub service deps
// ---------------------------------------------------------------------------

function createStubCommitments(): CommitmentsService & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { purgeResolved: [] };
  return {
    calls,
    purgeResolved: async (olderThanDays?: number) => {
      calls.purgeResolved.push([olderThanDays]);
      return { purged: 1 };
    },
  } as unknown as CommitmentsService & { calls: Record<string, unknown[][]> };
}

function createStubAreaMemory(): AreaMemoryService & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { compactDecisions: [], compactLearnings: [] };
  return {
    calls,
    compactDecisions: async (workspacePaths: unknown, options?: unknown) => {
      calls.compactDecisions.push([workspacePaths, options]);
      return { compacted: 1, preserved: 0, areasUpdated: 0 };
    },
    compactLearnings: async (workspacePaths: unknown, options?: unknown) => {
      calls.compactLearnings.push([workspacePaths, options]);
      return { archived: 1, kept: 0, archivePath: null };
    },
  } as unknown as AreaMemoryService & { calls: Record<string, unknown[][]> };
}

function createStubAreaParser(): AreaParserService {
  return {} as unknown as AreaParserService;
}

function createStubMemory(): MemoryService {
  return {} as unknown as MemoryService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = '/workspace';

function oldDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function oldISODate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function createService(store?: MockStore) {
  const storage = createMockStorage(store);
  const commitments = createStubCommitments();
  const areaMemory = createStubAreaMemory();
  const areaParser = createStubAreaParser();
  const memory = createStubMemory();

  // Minimal WorkspacePaths for compactMemory delegation
  const workspacePaths = {
    root: WORKSPACE,
    manifest: join(WORKSPACE, 'arete.yaml'),
    ideConfig: join(WORKSPACE, '.cursor'),
    rules: join(WORKSPACE, '.cursor', 'rules'),
    agentSkills: join(WORKSPACE, '.agents', 'skills'),
    tools: join(WORKSPACE, '.cursor', 'tools'),
    integrations: join(WORKSPACE, '.cursor', 'integrations'),
    context: join(WORKSPACE, 'context'),
    memory: join(WORKSPACE, '.arete', 'memory'),
    now: join(WORKSPACE, 'now'),
    goals: join(WORKSPACE, 'goals'),
    projects: join(WORKSPACE, 'projects'),
    resources: join(WORKSPACE, 'resources'),
    people: join(WORKSPACE, 'people'),
    credentials: join(WORKSPACE, '.credentials'),
    templates: join(WORKSPACE, 'templates'),
  };

  const service = new HygieneService(
    storage,
    WORKSPACE,
    commitments,
    areaMemory,
    areaParser,
    memory,
    workspacePaths,
  );

  return { service, storage, commitments, areaMemory };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HygieneService', () => {
  // -----------------------------------------------------------------------
  // scan()
  // -----------------------------------------------------------------------

  describe('scan()', () => {
    it('scan empty workspace returns 0 items', async () => {
      const { service } = createService();
      const report = await service.scan();

      assert.equal(report.items.length, 0);
      assert.equal(report.summary.total, 0);
      assert.equal(report.summary.byTier[1], 0);
      assert.equal(report.summary.byTier[2], 0);
      assert.equal(report.summary.byTier[3], 0);
      assert.ok(report.scannedAt, 'scannedAt is set');
    });

    it('scan flags old meeting with processed status as tier 1 item', async () => {
      const store = new Map<string, string>();
      const meetingDate = oldDate(100);
      store.set(
        join(WORKSPACE, 'resources', 'meetings', '2025-01-01-standup.md'),
        `---\ntitle: "Standup"\ndate: "${meetingDate}"\nstatus: processed\n---\n# Standup\nNotes here`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.equal(report.items.length, 1);
      const item = report.items[0];
      assert.equal(item.tier, 1);
      assert.equal(item.category, 'meetings');
      assert.equal(item.actionType, 'archive');
      assert.ok(item.description.includes('Standup'));
      assert.ok((item.metadata.ageDays as number) >= 99);
      assert.equal(item.metadata.status, 'processed');
    });

    it('scan does not flag recent meeting', async () => {
      const store = new Map<string, string>();
      const recentDate = oldDate(10);
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'recent.md'),
        `---\ntitle: "Recent"\ndate: "${recentDate}"\nstatus: processed\n---\n# Recent`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.equal(report.items.length, 0);
    });

    it('scan does not flag meeting with non-archivable status', async () => {
      const store = new Map<string, string>();
      const meetingDate = oldDate(100);
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'open.md'),
        `---\ntitle: "Open"\ndate: "${meetingDate}"\nstatus: draft\n---\n# Open`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.equal(report.items.length, 0);
    });

    it('scan flags resolved commitments as single aggregate tier 1 item', async () => {
      const store = new Map<string, string>();
      const resolvedAt = oldISODate(45);
      store.set(
        join(WORKSPACE, '.arete', 'commitments.json'),
        JSON.stringify({
          commitments: [
            {
              id: 'abc123',
              text: 'Send proposal to Alice',
              status: 'resolved',
              resolvedAt,
              date: oldDate(60),
            },
            {
              id: 'def456',
              text: 'Review budget doc',
              status: 'resolved',
              resolvedAt: oldISODate(50),
              date: oldDate(70),
            },
          ],
        }),
      );

      const { service } = createService(store);
      const report = await service.scan();

      // Should be ONE aggregate item, not one per commitment
      assert.equal(report.items.length, 1);
      assert.equal(report.items[0].tier, 1);
      assert.equal(report.items[0].category, 'commitments');
      assert.equal(report.items[0].actionType, 'purge');
      assert.equal(report.items[0].metadata.count, 2);
      assert.equal(report.items[0].metadata.thresholdDays, 30);
    });

    it('scan flags old memory decisions as single aggregate tier 2 item', async () => {
      const store = new Map<string, string>();
      const oldDecisionDate = oldDate(100);
      const olderDecisionDate = oldDate(150);
      store.set(
        join(WORKSPACE, '.arete', 'memory', 'items', 'decisions.md'),
        `# Decisions\n\n### ${oldDecisionDate}: Use TypeScript for all services\n\nWe decided to use TypeScript.\n\n### ${olderDecisionDate}: Use Node.js for runtime\n\nWe decided on Node.\n`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      // Should be ONE aggregate item, not one per decision
      assert.equal(report.items.length, 1);
      assert.equal(report.items[0].tier, 2);
      assert.equal(report.items[0].category, 'memory');
      assert.equal(report.items[0].actionType, 'compact');
      assert.equal(report.items[0].metadata.type, 'decision');
      assert.equal(report.items[0].metadata.count, 2);
    });

    it('scan flags old memory learnings as single aggregate tier 2 item', async () => {
      const store = new Map<string, string>();
      const learningDate = oldDate(120);
      store.set(
        join(WORKSPACE, '.arete', 'memory', 'items', 'learnings.md'),
        `# Learnings\n\n- ${learningDate}: Always mock StorageAdapter in tests\n`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.equal(report.items.length, 1);
      assert.equal(report.items[0].tier, 2);
      assert.equal(report.items[0].category, 'memory');
      assert.equal(report.items[0].actionType, 'compact');
      assert.equal(report.items[0].metadata.type, 'learning');
      assert.equal(report.items[0].metadata.count, 1);
    });

    it('scan flags bloated activity log as tier 2', async () => {
      const store = new Map<string, string>();
      // Create a file with >5000 lines
      const lines = Array.from({ length: 5500 }, (_, i) => `Line ${i + 1}: activity entry`);
      store.set(
        join(WORKSPACE, '.arete', 'activity', 'activity-log.md'),
        lines.join('\n'),
      );

      const { service } = createService(store);
      const report = await service.scan();

      const activityItems = report.items.filter(i => i.category === 'activity');
      assert.equal(activityItems.length, 1);
      assert.equal(activityItems[0].tier, 2);
      assert.equal(activityItems[0].actionType, 'trim');
      assert.equal(activityItems[0].metadata.lineCount, 5500);
    });

    it('scan does not flag activity log under threshold', async () => {
      const store = new Map<string, string>();
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      store.set(
        join(WORKSPACE, '.arete', 'activity', 'activity-log.md'),
        lines.join('\n'),
      );

      const { service } = createService(store);
      const report = await service.scan();

      const activityItems = report.items.filter(i => i.category === 'activity');
      assert.equal(activityItems.length, 0);
    });

    it('scan flags duplicate memory entries as tier 3 with similarity', async () => {
      const store = new Map<string, string>();
      store.set(
        join(WORKSPACE, '.arete', 'memory', 'items', 'decisions.md'),
        [
          '# Decisions',
          '',
          `### ${oldDate(10)}: Use TypeScript for all backend services`,
          '',
          'We decided to use TypeScript for all backend services in the project.',
          '',
          `### ${oldDate(5)}: Use TypeScript for all backend service implementations`,
          '',
          'We decided to use TypeScript for all backend service implementations in the project.',
          '',
        ].join('\n'),
      );

      const { service } = createService(store);
      const report = await service.scan();

      const dedupItems = report.items.filter(i => i.tier === 3);
      assert.ok(dedupItems.length >= 1, 'should find at least one duplicate pair');
      assert.equal(dedupItems[0].actionType, 'merge');
      assert.ok(
        (dedupItems[0].metadata.similarity as number) > 0.6,
        'similarity should exceed threshold',
      );
    });

    it('scan respects tier filter', async () => {
      const store = new Map<string, string>();
      // Add tier 1 item (meeting)
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'old.md'),
        `---\ntitle: "Old"\ndate: "${oldDate(100)}"\nstatus: processed\n---\n# Old`,
      );
      // Add tier 2 item (activity log)
      const lines = Array.from({ length: 5500 }, (_, i) => `Line ${i + 1}`);
      store.set(
        join(WORKSPACE, '.arete', 'activity', 'activity-log.md'),
        lines.join('\n'),
      );

      const { service } = createService(store);

      // Only scan tier 2
      const report = await service.scan({ tiers: [2] });
      assert.ok(report.items.every(i => i.tier === 2), 'all items should be tier 2');
      assert.equal(report.items.filter(i => i.category === 'meetings').length, 0);
    });

    it('scan respects category filter', async () => {
      const store = new Map<string, string>();
      // Add meeting
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'old.md'),
        `---\ntitle: "Old"\ndate: "${oldDate(100)}"\nstatus: processed\n---\n# Old`,
      );
      // Add commitment
      store.set(
        join(WORKSPACE, '.arete', 'commitments.json'),
        JSON.stringify({
          commitments: [{
            id: 'abc',
            text: 'Do something',
            status: 'resolved',
            resolvedAt: oldISODate(45),
            date: oldDate(60),
          }],
        }),
      );

      const { service } = createService(store);

      // Only scan meetings
      const report = await service.scan({ categories: ['meetings'] });
      assert.ok(
        report.items.every(i => i.category === 'meetings'),
        'all items should be meetings',
      );
      assert.equal(report.items.length, 1);
    });

    it('scan summary counts are accurate', async () => {
      const store = new Map<string, string>();
      // Tier 1 meeting
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'old.md'),
        `---\ntitle: "Old"\ndate: "${oldDate(100)}"\nstatus: processed\n---\n# Old`,
      );
      // Tier 1 commitment
      store.set(
        join(WORKSPACE, '.arete', 'commitments.json'),
        JSON.stringify({
          commitments: [{
            id: 'abc',
            text: 'Something',
            status: 'resolved',
            resolvedAt: oldISODate(45),
            date: oldDate(60),
          }],
        }),
      );
      // Tier 2 activity
      const lines = Array.from({ length: 6000 }, (_, i) => `Line ${i + 1}`);
      store.set(
        join(WORKSPACE, '.arete', 'activity', 'activity-log.md'),
        lines.join('\n'),
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.equal(report.summary.total, 3);
      assert.equal(report.summary.byTier[1], 2);
      assert.equal(report.summary.byTier[2], 1);
      assert.equal(report.summary.byCategory.meetings, 1);
      assert.equal(report.summary.byCategory.commitments, 1);
      assert.equal(report.summary.byCategory.activity, 1);
    });
  });

  // -----------------------------------------------------------------------
  // apply()
  // -----------------------------------------------------------------------

  describe('apply()', () => {
    it('apply with valid report delegates correctly', async () => {
      const store = new Map<string, string>();
      // Set up a meeting to archive
      const meetingDate = oldDate(100);
      const meetingPath = join(WORKSPACE, 'resources', 'meetings', '2025-01-01-standup.md');
      store.set(
        meetingPath,
        `---\ntitle: "Standup"\ndate: "${meetingDate}"\nstatus: processed\n---\n# Standup\nNotes`,
      );

      const { service, storage, commitments } = createService(store);

      // First scan to get a report
      const report = await service.scan();
      assert.ok(report.items.length >= 1);

      const meetingItem = report.items.find(i => i.category === 'meetings');
      assert.ok(meetingItem, 'should have a meeting item');

      // Apply the meeting archive action
      const result = await service.apply(report, [{ id: meetingItem!.id }]);

      assert.equal(result.applied.length, 1);
      assert.equal(result.failed.length, 0);
      assert.equal(result.applied[0], meetingItem!.id);

      // Verify original file was deleted
      assert.equal(store.has(meetingPath), false, 'original file should be deleted');

      // Verify archive file was created
      const archiveKeys = [...store.keys()].filter(k => k.includes('/archive/'));
      assert.ok(archiveKeys.length >= 1, 'archive file should be created');
      const archiveContent = store.get(archiveKeys[0])!;
      assert.ok(archiveContent.includes('archived_at'), 'should have archived_at in frontmatter');
    });

    it('apply purge commitments delegates to CommitmentsService with correct threshold', async () => {
      const store = new Map<string, string>();
      store.set(
        join(WORKSPACE, '.arete', 'commitments.json'),
        JSON.stringify({
          commitments: [{
            id: 'abc123',
            text: 'Something resolved',
            status: 'resolved',
            resolvedAt: oldISODate(45),
            date: oldDate(60),
          }],
        }),
      );

      const { service, commitments } = createService(store);
      const report = await service.scan();

      const commitmentItem = report.items.find(i => i.category === 'commitments');
      assert.ok(commitmentItem);

      const result = await service.apply(report, [{ id: commitmentItem!.id }]);

      assert.equal(result.applied.length, 1);
      assert.ok(commitments.calls.purgeResolved.length === 1, 'purgeResolved should be called once');
      // Verify threshold is passed through from scan metadata
      assert.equal(commitments.calls.purgeResolved[0][0], 30, 'should pass default threshold');
    });

    it('apply purge commitments passes custom threshold from scan', async () => {
      const store = new Map<string, string>();
      store.set(
        join(WORKSPACE, '.arete', 'commitments.json'),
        JSON.stringify({
          commitments: [{
            id: 'abc123',
            text: 'Something resolved',
            status: 'resolved',
            resolvedAt: oldISODate(70),
            date: oldDate(90),
          }],
        }),
      );

      const { service, commitments } = createService(store);
      const report = await service.scan({ commitmentOlderThanDays: 60 });

      const commitmentItem = report.items.find(i => i.category === 'commitments');
      assert.ok(commitmentItem);

      const result = await service.apply(report, [{ id: commitmentItem!.id }]);

      assert.equal(result.applied.length, 1);
      // Verify custom threshold (60) is passed through, not default (30)
      assert.equal(commitments.calls.purgeResolved[0][0], 60, 'should pass custom threshold');
    });

    it('apply compact decisions delegates to AreaMemoryService', async () => {
      const store = new Map<string, string>();
      store.set(
        join(WORKSPACE, '.arete', 'memory', 'items', 'decisions.md'),
        `# Decisions\n\n### ${oldDate(100)}: Some old decision\n\nDetails.\n`,
      );

      const { service, areaMemory } = createService(store);
      const report = await service.scan();

      const decisionItem = report.items.find(
        i => i.category === 'memory' && i.metadata.type === 'decision',
      );
      assert.ok(decisionItem);

      const result = await service.apply(report, [{ id: decisionItem!.id }]);

      assert.equal(result.applied.length, 1);
      assert.ok(
        areaMemory.calls.compactDecisions.length >= 1,
        'compactDecisions should be called',
      );
    });

    it('apply compact learnings delegates to AreaMemoryService', async () => {
      const store = new Map<string, string>();
      store.set(
        join(WORKSPACE, '.arete', 'memory', 'items', 'learnings.md'),
        `# Learnings\n\n- ${oldDate(100)}: Some old learning\n`,
      );

      const { service, areaMemory } = createService(store);
      const report = await service.scan();

      const learningItem = report.items.find(
        i => i.category === 'memory' && i.metadata.type === 'learning',
      );
      assert.ok(learningItem);

      const result = await service.apply(report, [{ id: learningItem!.id }]);

      assert.equal(result.applied.length, 1);
      assert.ok(
        areaMemory.calls.compactLearnings.length >= 1,
        'compactLearnings should be called',
      );
    });

    it('apply trim activity splits file and archives old lines', async () => {
      const store = new Map<string, string>();
      const lines = Array.from({ length: 5500 }, (_, i) => `Line ${i + 1}`);
      store.set(
        join(WORKSPACE, '.arete', 'activity', 'activity-log.md'),
        lines.join('\n'),
      );

      const { service, storage } = createService(store);
      const report = await service.scan();

      const activityItem = report.items.find(i => i.category === 'activity');
      assert.ok(activityItem);

      const result = await service.apply(report, [{ id: activityItem!.id }]);

      assert.equal(result.applied.length, 1);

      // Check trimmed file
      const trimmed = store.get(join(WORKSPACE, '.arete', 'activity', 'activity-log.md'))!;
      const trimmedLines = trimmed.split('\n');
      assert.equal(trimmedLines.length, 2500, 'should keep 2500 lines');

      // Check archive was created
      const archiveKeys = [...store.keys()].filter(k => k.includes('archive/activity-'));
      assert.ok(archiveKeys.length >= 1, 'should create archive file');
    });

    it('apply rejects stale scan report (>1 hour)', async () => {
      const { service } = createService();

      const staleReport: HygieneReport = {
        scannedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        items: [],
        summary: { total: 0, byTier: { 1: 0, 2: 0, 3: 0 }, byCategory: { meetings: 0, memory: 0, commitments: 0, activity: 0 } },
      };

      await assert.rejects(
        () => service.apply(staleReport, []),
        (err: Error) => {
          assert.ok(err.message.includes('stale'));
          return true;
        },
      );
    });

    it('apply with partial failure returns both applied and failed', async () => {
      const store = new Map<string, string>();
      // One valid meeting to archive
      store.set(
        join(WORKSPACE, 'resources', 'meetings', 'good.md'),
        `---\ntitle: "Good"\ndate: "${oldDate(100)}"\nstatus: processed\n---\n# Good`,
      );

      const { service } = createService(store);
      const report = await service.scan();

      assert.ok(report.items.length >= 1);
      const validId = report.items[0].id;

      // Apply with one valid and one invalid action
      const result = await service.apply(report, [
        { id: validId },
        { id: 'nonexistent-id' },
      ]);

      assert.equal(result.applied.length, 1);
      assert.equal(result.failed.length, 1);
      assert.equal(result.applied[0], validId);
      assert.equal(result.failed[0].id, 'nonexistent-id');
      assert.ok(result.failed[0].error.includes('not found'));
    });

    it('apply accepts fresh report with no actions', async () => {
      const { service } = createService();

      const freshReport: HygieneReport = {
        scannedAt: new Date().toISOString(),
        items: [],
        summary: { total: 0, byTier: { 1: 0, 2: 0, 3: 0 }, byCategory: { meetings: 0, memory: 0, commitments: 0, activity: 0 } },
      };

      const result = await service.apply(freshReport, []);
      assert.equal(result.applied.length, 0);
      assert.equal(result.failed.length, 0);
    });
  });
});
