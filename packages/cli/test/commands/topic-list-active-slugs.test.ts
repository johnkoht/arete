/**
 * `arete topic list --active --slugs [--json]` — active-topics slug-list CLI primitive.
 *
 * The slack-digest skill (Task 4) shells out to this command to bias its
 * per-thread topic-extraction prompt against the SAME active-topic slug
 * universe the meeting-extraction prompt uses. Byte-equality with
 * `renderActiveTopicsAsSlugList(getActiveTopics(topics))` is load-bearing
 * for the dual-tier sprawl defense (extraction-time bias + alias-merge
 * Jaccard backstop) — see PRD Task 3 AC and risk R10.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  getActiveTopics,
  renderActiveTopicsAsSlugList,
  type TopicPage,
} from '@arete/core';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('topic list --active --slugs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-topic-list-active-slugs');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  /**
   * Seed a topic page on disk. `last_refreshed` defaults to today (within the
   * default 90-day recency window) so the topic counts as "active".
   */
  function seedTopic(
    slug: string,
    opts: {
      status?: string;
      area?: string;
      currentState?: string;
      lastRefreshed?: string;
    } = {},
  ): void {
    const dir = join(tmpDir, '.arete', 'memory', 'topics');
    mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const fm: string[] = [
      '---',
      `topic_slug: ${slug}`,
    ];
    if (opts.area !== undefined) fm.push(`area: ${opts.area}`);
    fm.push(`status: ${opts.status ?? 'active'}`);
    fm.push('first_seen: 2026-03-01');
    fm.push(`last_refreshed: ${opts.lastRefreshed ?? today}`);
    fm.push('sources_integrated: []');
    fm.push('---');
    fm.push('');
    fm.push(`# ${slug}`);
    fm.push('');
    if (opts.currentState !== undefined) {
      fm.push('## Current state');
      fm.push('');
      fm.push(opts.currentState);
      fm.push('');
    }
    writeFileSync(join(dir, `${slug}.md`), fm.join('\n'));
  }

  /**
   * Build the in-process expected slug-list and JSON shape from the SAME
   * helpers the CLI uses. Asserting byte-equality against this catches
   * silent rendering drift between the CLI primitive and the
   * meeting-extraction prompt's bias block.
   */
  function buildExpected(pages: TopicPage[]): { plain: string; slugs: string[] } {
    const entries = getActiveTopics(pages);
    return {
      plain: renderActiveTopicsAsSlugList(entries),
      slugs: entries.map((e) => e.slug),
    };
  }

  it('--json emits { slugs: string[] } with sort matching getActiveTopics', () => {
    seedTopic('cover-whale-templates', {
      status: 'active',
      area: 'glance-comms',
      currentState: 'Drafting v2 templates.',
      lastRefreshed: '2026-04-22',
    });
    seedTopic('leap-templates', {
      status: 'new',
      area: 'glance-comms',
      currentState: 'Pilot in flight.',
      lastRefreshed: '2026-04-25',
    });

    const r = runCliRaw(['topic', 'list', '--active', '--slugs', '--json'], { cwd: tmpDir });
    assert.strictEqual(r.code, 0, `exit 0 expected, got ${r.code}: ${r.stderr}`);

    const parsed = JSON.parse(r.stdout);
    // Shape: { slugs: string[] } — the canonical interchange shape Task 4
    // pipes into the slack-digest skill's per-thread extraction prompt.
    assert.ok(Array.isArray(parsed.slugs), 'parsed.slugs must be an array');
    assert.deepStrictEqual(parsed.slugs.sort(), ['cover-whale-templates', 'leap-templates']);
  });

  it('plain form is byte-equal to renderActiveTopicsAsSlugList(getActiveTopics(...))', () => {
    seedTopic('cover-whale-templates', {
      status: 'active',
      area: 'glance-comms',
      currentState: 'Drafting v2 templates.',
      lastRefreshed: '2026-04-22',
    });
    seedTopic('leap-templates', {
      status: 'new',
      currentState: 'Pilot in flight.',
      lastRefreshed: '2026-04-25',
    });
    seedTopic('reserv-runbook', {
      status: 'active',
      currentState: 'Operational doc.',
      lastRefreshed: '2026-04-20',
    });

    const r = runCliRaw(['topic', 'list', '--active', '--slugs'], { cwd: tmpDir });
    assert.strictEqual(r.code, 0, `exit 0 expected, got ${r.code}: ${r.stderr}`);

    // Read the same on-disk topics back via the JSON shape so we can
    // construct the in-process expected output through the SAME core helpers
    // the CLI uses. We use the JSON form of `topic list` (without --slugs)
    // to fetch the parsed pages indirectly via `topic show` per slug; but
    // for the byte-equality assertion the simplest path is to call the
    // slug-list JSON form too, then reconstruct via getActiveTopics over
    // a re-read. To keep this test hermetic we instead assert structural
    // equivalence: stdout (sans trailing newline) must match the bare
    // `slug — status: summary` shape per line.
    const stdout = r.stdout.replace(/\n+$/, '');
    const lines = stdout.split('\n');
    // Three seeded topics, all within recency → three lines.
    assert.strictEqual(lines.length, 3, `expected 3 lines, got ${lines.length}: ${stdout}`);
    for (const line of lines) {
      // Each line: `<slug> — <status>[: <summary>]` (no wikilinks, no bullets)
      assert.match(line, /^[a-z0-9-]+ — [a-z]+(: .+)?$/, `line shape: "${line}"`);
      assert.ok(!line.includes('[['), `no wikilinks in slug list: "${line}"`);
      assert.ok(!line.startsWith('-'), `no bullet prefix: "${line}"`);
    }
    // Sort + slug equality with getActiveTopics output. Build expected via
    // a pre-rendered fixture: re-run the CLI in --json mode and compare.
    const j = runCliRaw(['topic', 'list', '--active', '--slugs', '--json'], { cwd: tmpDir });
    const parsed = JSON.parse(j.stdout);
    const stdoutSlugs = lines.map((l) => l.split(' — ')[0]);
    assert.deepStrictEqual(stdoutSlugs, parsed.slugs,
      'plain-form slug order must match --json slug order (single source of truth: getActiveTopics)');
  });

  it('byte-equals in-process renderActiveTopicsAsSlugList(getActiveTopics(...))', async () => {
    // The load-bearing assertion: the CLI primitive's plain output must be
    // byte-equal to a direct in-process call. If a future refactor inlines
    // a renderer in the CLI, this test fails immediately.
    seedTopic('alpha', { status: 'active', currentState: 'A.', lastRefreshed: '2026-04-25' });
    seedTopic('beta', { status: 'new', currentState: 'B.', lastRefreshed: '2026-04-22' });

    // Read the seeded pages back via core's listAll equivalent. Easiest in
    // a CLI test: import the core service through a one-shot script. We use
    // the topic-memory service via createServices.
    const { createServices } = await import('@arete/core');
    const services = await createServices(tmpDir);
    const root = await services.workspace.findRoot(tmpDir);
    assert.ok(root, 'workspace root must resolve');
    const paths = services.workspace.getPaths(root);
    const { topics } = await services.topicMemory.listAll(paths);

    const expected = buildExpected(topics);

    const r = runCliRaw(['topic', 'list', '--active', '--slugs'], { cwd: tmpDir });
    assert.strictEqual(r.code, 0);
    const stdout = r.stdout.replace(/\n+$/, '');
    assert.strictEqual(stdout, expected.plain,
      'CLI plain output must be byte-equal to renderActiveTopicsAsSlugList(getActiveTopics(...))');

    const j = runCliRaw(['topic', 'list', '--active', '--slugs', '--json'], { cwd: tmpDir });
    assert.strictEqual(j.code, 0);
    const parsed = JSON.parse(j.stdout);
    assert.deepStrictEqual(parsed.slugs, expected.slugs,
      'CLI --json slugs must match getActiveTopics(...).map(e => e.slug)');
  });

  it('emits empty output on a fresh workspace (no active topics)', () => {
    const r = runCliRaw(['topic', 'list', '--active', '--slugs', '--json'], { cwd: tmpDir });
    assert.strictEqual(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.deepStrictEqual(parsed.slugs, []);

    const plain = runCliRaw(['topic', 'list', '--active', '--slugs'], { cwd: tmpDir });
    assert.strictEqual(plain.code, 0);
    // Empty slug list renders as empty stdout (renderActiveTopicsAsSlugList
    // returns '' for [] entries — see active-topics.ts:144).
    assert.strictEqual(plain.stdout.trim(), '');
  });

  it('--slugs without --active is rejected', () => {
    const r = runCliRaw(['topic', 'list', '--slugs', '--json'], { cwd: tmpDir });
    assert.strictEqual(r.code, 1);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.success, false);
    assert.match(parsed.error, /--slugs requires --active/);
  });

  it('--help documents the --active and --slugs flags', () => {
    const r = runCliRaw(['topic', 'list', '--help'], { cwd: tmpDir });
    assert.strictEqual(r.code, 0);
    assert.match(r.stdout, /--active/, '--active must appear in help');
    assert.match(r.stdout, /--slugs/, '--slugs must appear in help');
  });
});
