/**
 * Task 6: slack-digest topic-refresh integration test with AI mock.
 *
 * Exercises the same path `arete topic refresh --slugs ... --source <digest>`
 * triggers, in-process via `AIServiceTestDeps`. If Hook 2 wiring regresses
 * (e.g., `--source` becomes label-only and N prior digests leak in), the
 * LLM-call-count assertion fails meaningfully. Scope-limited per plan R9.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { open as fsOpen, unlink } from 'node:fs/promises';
import { createServices, AIService, parseTopicPage, SeedLockHeldError,
  type AIServiceTestDeps, type AreteConfig } from '@arete/core';
import type { AssistantMessage, Context, KnownProvider, Model } from '@mariozechner/pi-ai';
import { getModel, getEnvApiKey } from '@mariozechner/pi-ai';
import { runCli, createTmpDir, cleanupTmpDir } from '../helpers.js';

const SLUG = 'cover-whale-templates';
// Stable phrase from buildIntegratePrompt — match by prompt-shape.
const INTEGRATE_MARKER = 'maintaining a compiled wiki page';
const SCRIPTED_OUTPUT = JSON.stringify({
  updated_sections: { 'Current state': 'Templates v2 confirmed for EOM via slack-digest.' },
  new_change_log_entry: 'Slack digest 2026-04-28 confirmed v2 EOM timing.',
  new_open_questions: ['Who owns the v2 announcement copy?'],
});

function mockAIDeps(): { deps: AIServiceTestDeps; calls: { prompt: string }[] } {
  const calls: { prompt: string }[] = [];
  const msg = (text: string): AssistantMessage => ({ role: 'assistant', content: [{ type: 'text', text }],
    api: 'anthropic-messages', provider: 'anthropic', model: 'mock',
    usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
    stopReason: 'stop', timestamp: Date.now() });
  const deps: AIServiceTestDeps = {
    completeSimple: async (_m, ctx: Context) => {
      const u = ctx.messages.find((x) => x.role === 'user');
      const prompt = typeof u?.content === 'string' ? u.content : '';
      calls.push({ prompt });
      if (prompt.includes(INTEGRATE_MARKER)) return msg(SCRIPTED_OUTPUT);
      throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
    },
    getModel: ((p: KnownProvider, id: string) => ({ id, name: id, api: 'anthropic-messages',
      provider: p, baseUrl: 'https://api.anthropic.com', reasoning: false, input: ['text'],
      cost: { input: 0.003, output: 0.015, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000, maxTokens: 8192 } as Model<never>)) as typeof getModel,
    getEnvApiKey: (() => 'test-api-key') as typeof getEnvApiKey,
  };
  return { deps, calls };
}

const TEST_CONFIG: AreteConfig = { schema: 1, version: null, source: 'test',
  ai: { tiers: { standard: 'anthropic/test' }, tasks: { synthesis: 'standard' } as never },
  skills: { core: [], overrides: [] }, tools: [], integrations: {},
  settings: { memory: { decisions: { prompt_before_save: false }, learnings: { prompt_before_save: false } },
    conversations: { peopleProcessing: 'off' } } };

function seedTopic(d: string): void {
  mkdirSync(join(d, '.arete/memory/topics'), { recursive: true });
  writeFileSync(join(d, '.arete/memory/topics', `${SLUG}.md`),
    `---\ntopic_slug: ${SLUG}\nstatus: active\nfirst_seen: 2026-03-01\nlast_refreshed: 2026-04-22\nsources_integrated: []\n---\n\n# ${SLUG}\n\n## Current state\n\nTemplates in pilot.\n`);
}
function seedDigest(d: string, date: string): string {
  mkdirSync(join(d, 'resources/notes'), { recursive: true });
  const p = join(d, 'resources/notes', `${date}-slack-digest.md`);
  writeFileSync(p, `---\ntitle: "Slack Digest — ${date}"\ndate: ${date}\ntype: slack-digest\nparticipants: [person-a]\nitems_extracted: 1\nitems_approved: 1\ntopics: [${SLUG}]\n---\n\n# Slack Digest — ${date}\n\n### 1. DM\nConfirmed ${SLUG} v2 on ${date}.\n`);
  return p;
}

async function setup(tmpDir: string) {
  const services = await createServices(tmpDir);
  const root = await services.workspace.findRoot(tmpDir);
  assert.ok(root, 'workspace root resolves');
  const paths = services.workspace.getPaths(root);
  const { deps, calls } = mockAIDeps();
  services.ai = new AIService(TEST_CONFIG, deps);
  const callLLM = async (p: string): Promise<string> => (await services.ai.call('synthesis', p)).text;
  return { services, root: root as string, paths, callLLM, calls };
}

describe('topic refresh — slack-digest with AI mock', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-topic-refresh-slack');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    seedTopic(tmpDir);
  });
  afterEach(() => cleanupTmpDir(tmpDir));

  it('LLM called exactly once; sources_integrated grew by 1; change log gained an entry', async () => {
    const digest = seedDigest(tmpDir, '2026-04-28');
    const { services, root, paths, callLLM, calls } = await setup(tmpDir);
    const result = await services.topicMemory.refreshAllFromSources(paths, {
      today: '2026-04-29', callLLM, slugs: [SLUG], sourcePath: digest,
      workspaceRoot: root, lockLabel: 'topic refresh',
    });
    assert.strictEqual(calls.length, 1, `LLM called ${calls.length}× (expected 1)`);
    assert.strictEqual(result.totalIntegrated, 1);
    assert.strictEqual(result.totalFallback, 0);
    const parsed = parseTopicPage(readFileSync(join(tmpDir, '.arete/memory/topics', `${SLUG}.md`), 'utf8'));
    assert.ok(parsed);
    assert.strictEqual(parsed.frontmatter.sources_integrated.length, 1, 'grew by exactly 1');
    assert.match(parsed.frontmatter.sources_integrated[0].path, /2026-04-28-slack-digest\.md$/);
    assert.match(parsed.sections['Current state'] ?? '', /v2 confirmed for EOM/);
    assert.match(parsed.sections['Change log'] ?? '', /Slack digest 2026-04-28/);
  });

  it('--source scoping: 3 prior + 1 new digest → LLM called once, prior digests do NOT leak', async () => {
    seedDigest(tmpDir, '2026-04-20'); seedDigest(tmpDir, '2026-04-22'); seedDigest(tmpDir, '2026-04-25');
    const newDigest = seedDigest(tmpDir, '2026-04-28');
    const { services, root, paths, callLLM, calls } = await setup(tmpDir);
    const result = await services.topicMemory.refreshAllFromSources(paths, {
      today: '2026-04-29', callLLM, slugs: [SLUG], sourcePath: newDigest,
      workspaceRoot: root, lockLabel: 'topic refresh',
    });
    assert.strictEqual(calls.length, 1, `LLM called ${calls.length}× — --source scoping broken if >1`);
    assert.strictEqual(result.totalIntegrated, 1);
    const written = readFileSync(join(tmpDir, '.arete/memory/topics', `${SLUG}.md`), 'utf8');
    assert.match(written, /2026-04-28-slack-digest/);
    for (const stale of ['2026-04-20', '2026-04-22', '2026-04-25']) {
      assert.doesNotMatch(written, new RegExp(`${stale}-slack-digest`), `${stale} must not leak in`);
    }
  });

  it('lock-held: refresh throws SeedLockHeldError; no LLM calls', async () => {
    const digest = seedDigest(tmpDir, '2026-04-28');
    const lockPath = join(tmpDir, '.arete', '.seed.lock');
    const handle = await fsOpen(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: 99999, started: new Date().toISOString(), command: 'test-hold' }));
    await handle.close();
    try {
      const { services, root, paths, callLLM, calls } = await setup(tmpDir);
      await assert.rejects(
        () => services.topicMemory.refreshAllFromSources(paths, {
          today: '2026-04-29', callLLM, slugs: [SLUG], sourcePath: digest,
          workspaceRoot: root, lockLabel: 'topic refresh',
        }),
        (err: unknown) => err instanceof SeedLockHeldError,
        'refresh under held lock must throw SeedLockHeldError',
      );
      assert.strictEqual(calls.length, 0, 'no LLM calls on lock contention');
    } finally {
      try { await unlink(lockPath); } catch { /* gone */ }
    }
  });
});
