import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageAdapter } from '../../src/storage/file.js';
import { WorkspaceService } from '../../src/services/workspace.js';
import { ClaudeAdapter } from '../../src/adapters/claude-adapter.js';
import { CursorAdapter } from '../../src/adapters/cursor-adapter.js';
import type { AreteConfig, WorkspacePaths } from '../../src/models/index.js';
import type { MemorySummary } from '../../src/models/memory-summary.js';

function makeConfig(): AreteConfig {
  return {
    schema: 1,
    version: '0.8.1',
    source: 'test',
    ide_target: 'claude',
    skills: { core: [], overrides: [] },
    tools: [],
    integrations: {},
    settings: {
      memory: {
        decisions: { prompt_before_save: true },
        learnings: { prompt_before_save: true },
      },
      conversations: { peopleProcessing: 'ask' },
    },
  };
}

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.claude'),
    rules: join(root, '.claude', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    tools: join(root, '.claude', 'tools'),
    integrations: join(root, '.claude', 'integrations'),
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

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmp = await mkdtemp(join(tmpdir(), 'arete-regen-'));
  try {
    return await fn(tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const MEMORY_WITH_TOPICS: MemorySummary = {
  activeTopics: [
    {
      slug: 'cover-whale-templates',
      area: 'glance-comms',
      status: 'active',
      summary: 'Staging-validated.',
      lastRefreshed: '2026-04-22',
    },
  ],
};

// ---------------------------------------------------------------------------

describe('WorkspaceService.regenerateRootFiles', () => {
  it('writes CLAUDE.md with Active Topics when memory provided (Claude adapter)', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);
      const adapter = new ClaudeAdapter();

      const result = await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });

      assert.strictEqual(result['CLAUDE.md'], 'updated');
      const content = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.match(content, /^## Active Topics$/m);
      assert.match(content, /\[\[cover-whale-templates\]\]/);
    });
  });

  it('is idempotent: second call with identical inputs returns "unchanged"', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);
      const adapter = new ClaudeAdapter();

      const r1 = await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });
      assert.strictEqual(r1['CLAUDE.md'], 'updated');

      const r2 = await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });
      assert.strictEqual(r2['CLAUDE.md'], 'unchanged');
    });
  });

  it('omits Active Topics section when memory absent (init-style call)', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);
      const adapter = new ClaudeAdapter();

      await svc.regenerateRootFiles(makeConfig(), paths, { adapter });

      const content = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.ok(!content.includes('## Active Topics'));
    });
  });

  it('CursorAdapter does NOT inject memory (supportsMemoryInjection=false)', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);
      const adapter = new CursorAdapter();

      await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });

      // AGENTS.md written by Cursor adapter must NOT contain the topic wikilink.
      const content = await readFile(join(root, 'AGENTS.md'), 'utf8').catch(() => '');
      assert.ok(!content.includes('[[cover-whale-templates]]'));
    });
  });

  it('capability method returns expected values', () => {
    assert.strictEqual(new ClaudeAdapter().supportsMemoryInjection?.(), true);
    assert.strictEqual(new CursorAdapter().supportsMemoryInjection?.(), false);
  });

  it('double-fallback preserves existing CLAUDE.md (does NOT overwrite with stub)', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);

      // Write a known-good CLAUDE.md on disk first
      const existing = '# User-facing CLAUDE.md\n\nImportant content.\n';
      await import('node:fs/promises').then((fs) =>
        fs.writeFile(join(root, 'CLAUDE.md'), existing, 'utf8'),
      );

      // Throwing adapter — simulates a generator bug
      const throwingAdapter = {
        target: 'claude' as const,
        configDirName: '.claude',
        ruleExtension: '.md',
        getIDEDirs: () => [],
        rulesDir: () => '.claude/rules',
        toolsDir: () => '.claude/tools',
        integrationsDir: () => '.claude/integrations',
        formatRule: () => '',
        transformRuleContent: (c: string) => c,
        supportsMemoryInjection: () => true,
        generateRootFiles: () => {
          throw new Error('injected generator failure');
        },
        generateMinimalRootFiles: () => ({ 'CLAUDE.md': '# Stub\n' }),
        detectInWorkspace: () => true,
      };

      const result = await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter: throwingAdapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });

      assert.strictEqual(result['CLAUDE.md'], 'failed', 'must report failed, not overwrite');
      const current = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.strictEqual(current, existing, 'existing CLAUDE.md must be untouched');
      assert.ok(!current.includes('# Stub'), 'stub must NOT replace existing file');
    });
  });

  it('double-fallback DOES write minimal stub when no existing file', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);

      const throwingAdapter = {
        target: 'claude' as const,
        configDirName: '.claude',
        ruleExtension: '.md',
        getIDEDirs: () => [],
        rulesDir: () => '.claude/rules',
        toolsDir: () => '.claude/tools',
        integrationsDir: () => '.claude/integrations',
        formatRule: () => '',
        transformRuleContent: (c: string) => c,
        supportsMemoryInjection: () => true,
        generateRootFiles: () => {
          throw new Error('injected generator failure');
        },
        generateMinimalRootFiles: () => ({ 'CLAUDE.md': '# Minimal stub\n' }),
        detectInWorkspace: () => true,
      };

      const result = await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter: throwingAdapter,
      });
      assert.strictEqual(result['CLAUDE.md'], 'updated');
      const content = await readFile(join(root, 'CLAUDE.md'), 'utf8');
      assert.match(content, /Minimal stub/);
    });
  });

  it('regeneration stays byte-equal across wall-clock days with identical memory', async () => {
    await withTmp(async (root) => {
      const svc = new WorkspaceService(new FileStorageAdapter());
      const paths = makePaths(root);
      const adapter = new ClaudeAdapter();

      // Run 1
      await svc.regenerateRootFiles(makeConfig(), paths, {
        adapter,
        memorySummary: MEMORY_WITH_TOPICS,
      });
      const c1 = await readFile(join(root, 'CLAUDE.md'), 'utf8');

      // Mock Date to a later day
      const OriginalDate = Date;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Date = class extends OriginalDate {
        constructor(...args: ConstructorParameters<typeof Date>) {
          if (args.length === 0) super('2026-06-01T00:00:00Z');
          else super(...args);
        }
        static now() { return new OriginalDate('2026-06-01T00:00:00Z').getTime(); }
      };
      try {
        const r2 = await svc.regenerateRootFiles(makeConfig(), paths, {
          adapter,
          memorySummary: MEMORY_WITH_TOPICS,
        });
        assert.strictEqual(r2['CLAUDE.md'], 'unchanged', 'same inputs across days → no write');
        const c2 = await readFile(join(root, 'CLAUDE.md'), 'utf8');
        assert.strictEqual(c1, c2);
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Date = OriginalDate;
      }
    });
  });
});
