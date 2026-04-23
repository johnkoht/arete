import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import {
  runCli,
  runCliRaw,
  createTmpDir,
  cleanupTmpDir,
} from '../helpers.js';

describe('topic command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-topic');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function seedTopic(slug: string, opts: { status?: string; area?: string; currentState?: string } = {}): void {
    const dir = join(tmpDir, '.arete', 'memory', 'topics');
    mkdirSync(dir, { recursive: true });
    const fm: string[] = [
      '---',
      `topic_slug: ${slug}`,
    ];
    if (opts.area !== undefined) fm.push(`area: ${opts.area}`);
    fm.push(`status: ${opts.status ?? 'active'}`);
    fm.push('first_seen: 2026-03-01');
    fm.push('last_refreshed: 2026-04-22');
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

  // ---------------------------------------------------------------------------
  // topic list
  // ---------------------------------------------------------------------------

  describe('topic list', () => {
    it('reports empty on fresh workspace', () => {
      const r = runCliRaw(['topic', 'list', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.count, 0);
    });

    it('lists seeded topics in JSON mode', () => {
      seedTopic('cover-whale-templates', { area: 'glance-comms', currentState: 'staging' });
      seedTopic('leap-templates', { area: 'glance-comms' });
      const r = runCliRaw(['topic', 'list', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.count, 2);
      const slugs = parsed.topics.map((t: { slug: string }) => t.slug).sort();
      assert.deepStrictEqual(slugs, ['cover-whale-templates', 'leap-templates']);
    });

    it('filters by --area', () => {
      seedTopic('cw', { area: 'glance-comms' });
      seedTopic('other', { area: 'pm-ops' });
      const r = runCliRaw(['topic', 'list', '--area', 'glance-comms', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.topics[0].slug, 'cw');
    });

    it('plain-text empty output includes guidance', () => {
      const r = runCliRaw(['topic', 'list'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      assert.match(r.stdout, /No topic pages yet/);
    });
  });

  // ---------------------------------------------------------------------------
  // topic show
  // ---------------------------------------------------------------------------

  describe('topic show', () => {
    it('returns error + exit 1 when topic missing', () => {
      const r = runCliRaw(['topic', 'show', 'nonexistent', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, false);
      assert.match(parsed.error, /not found/);
    });

    it('renders existing topic page as markdown (plain-text mode)', () => {
      seedTopic('my-topic', { currentState: 'body text' });
      const r = runCliRaw(['topic', 'show', 'my-topic'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      assert.match(r.stdout, /topic_slug: my-topic/);
      assert.match(r.stdout, /## Current state/);
      assert.match(r.stdout, /body text/);
    });

    it('returns JSON shape with frontmatter + sections', () => {
      seedTopic('my-topic', { currentState: 'body text' });
      const r = runCliRaw(['topic', 'show', 'my-topic', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.topic.frontmatter.topic_slug, 'my-topic');
      assert.strictEqual(parsed.topic.sections['Current state'], 'body text');
    });
  });

  // ---------------------------------------------------------------------------
  // topic refresh
  // ---------------------------------------------------------------------------

  describe('topic refresh', () => {
    it('errors out when no slug and no --all', () => {
      const r = runCliRaw(['topic', 'refresh', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.match(parsed.error, /Specify a slug/);
    });

    it('reports "no meetings" status when topic has no source meetings', () => {
      seedTopic('lonely-topic');
      const r = runCliRaw(['topic', 'refresh', 'lonely-topic', '--allow-no-llm', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.topics[0].status, 'no-sources');
    });

    it('dry-run reports counts without writing LLM calls', () => {
      seedTopic('my-topic');
      const meetingsDir = join(tmpDir, 'resources', 'meetings');
      mkdirSync(meetingsDir, { recursive: true });
      writeFileSync(
        join(meetingsDir, '2026-04-22-example.md'),
        `---
title: "Example"
date: "2026-04-22"
topics:
  - my-topic
attendees: []
---

Body.`,
      );
      const r = runCliRaw(['topic', 'refresh', 'my-topic', '--dry-run', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.dryRun, true);
      assert.strictEqual(parsed.topics[0].integrated, 1);
    });

    it('fallback path writes Source trail when --allow-no-llm + no AI', () => {
      seedTopic('my-topic');
      const meetingsDir = join(tmpDir, 'resources', 'meetings');
      mkdirSync(meetingsDir, { recursive: true });
      writeFileSync(
        join(meetingsDir, '2026-04-22-example.md'),
        `---
title: "Example"
date: "2026-04-22"
topics:
  - my-topic
attendees: []
---

Body content here.`,
      );
      const r = runCliRaw(['topic', 'refresh', 'my-topic', '--allow-no-llm', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.topics[0].fallback, 1);
      const topicContent = readFileSync(
        join(tmpDir, '.arete', 'memory', 'topics', 'my-topic.md'),
        'utf8',
      );
      assert.match(topicContent, /## Source trail/);
      assert.match(topicContent, /2026-04-22-example/);
    });
  });

  // ---------------------------------------------------------------------------
  // topic lint
  // ---------------------------------------------------------------------------

  describe('topic lint', () => {
    it('reports zero findings on empty workspace', () => {
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.total, 0);
    });

    it('flags stale topics (last_refreshed > 60 days old)', () => {
      const dir = join(tmpDir, '.arete', 'memory', 'topics');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'old-topic.md'),
        `---
topic_slug: old-topic
status: active
first_seen: 2026-01-01
last_refreshed: 2026-01-01
sources_integrated: []
---

# Old

## Current state

Stale content.
`,
      );
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.findings.stale.includes('old-topic'), 'stale list must include old-topic');
    });

    it('flags stub topics (no Current state)', () => {
      seedTopic('stub-topic'); // no currentState
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.findings.stub.includes('stub-topic'));
    });

    it('flags orphans (no inbound wikilinks)', () => {
      seedTopic('lonely-topic', { currentState: 'No refs in or out.' });
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.findings.orphan.includes('lonely-topic'));
    });

    it('detects dangling wikilinks', () => {
      seedTopic('a-topic', { currentState: 'See [[missing-topic]] for details.' });
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      const found = parsed.findings.dangling.some(
        (d: { fromSlug: string; toSlug: string }) =>
          d.fromSlug === 'a-topic' && d.toSlug === 'missing-topic',
      );
      assert.ok(found);
    });

    it('appends a lint event to log.md', () => {
      seedTopic('any');
      runCli(['topic', 'lint', '--json'], { cwd: tmpDir });
      const logPath = join(tmpDir, '.arete', 'memory', 'log.md');
      assert.ok(existsSync(logPath), 'log.md must exist after lint');
      const log = readFileSync(logPath, 'utf8');
      assert.match(log, /\] lint \|/);
    });
  });
});
