import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
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

    it('cost-threshold triggers confirm gate without --yes', () => {
      // Seed a topic and a meeting, set cost threshold artificially low so
      // the single integration trips the confirm gate. With no LLM configured,
      // --allow-no-llm bypasses the callLLM requirement but the threshold
      // still applies in the real-run path... actually, the threshold only
      // applies when callLLM IS configured. Without AI, fallback path runs
      // without confirm. So this test uses a high threshold: integration
      // without AI and confirms no prompt appears.
      seedTopic('my-topic');
      const meetingsDir = join(tmpDir, 'resources', 'meetings');
      mkdirSync(meetingsDir, { recursive: true });
      writeFileSync(
        join(meetingsDir, '2026-04-22-ex.md'),
        `---
title: "Ex"
date: "2026-04-22"
topics:
  - my-topic
attendees: []
---

Body.`,
      );
      // With --allow-no-llm (no AI configured), confirm gate should NOT trigger
      // (gate is AI-spending-only). Exit 0 with successful write.
      const r = runCliRaw(
        ['topic', 'refresh', 'my-topic', '--allow-no-llm', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.ok(!('error' in parsed && parsed.error === 'confirm_required'),
        'no-LLM path must not gate on confirm');
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
  // topic refresh — Task 5: --slugs, --source, --skip-topics, lock-held
  // ---------------------------------------------------------------------------

  describe('topic refresh --slugs / --source / --skip-topics (Task 5)', () => {
    function seedSlackDigest(name: string, topics: string[], date: string): string {
      const notesDir = join(tmpDir, 'resources', 'notes');
      mkdirSync(notesDir, { recursive: true });
      const topicList = `[${topics.join(', ')}]`;
      const digestPath = join(notesDir, `${name}.md`);
      writeFileSync(
        digestPath,
        `---
title: "Slack Digest — ${date}"
date: ${date}
type: slack-digest
participants: [person-a]
items_extracted: 1
items_approved: 1
topics: ${topicList}
---

# Slack Digest — ${date}

## Conversations

### 1. DM with Person A
Discussed ${topics.join(', ')} on ${date}.
`,
      );
      return digestPath;
    }

    it('--slugs comma-list refreshes only listed slugs', () => {
      seedTopic('foo');
      seedTopic('bar');
      seedTopic('baz');
      seedSlackDigest('2026-04-28-slack-digest', ['foo', 'bar', 'baz'], '2026-04-28');
      const r = runCliRaw(
        ['topic', 'refresh', '--slugs', 'foo,bar', '--allow-no-llm', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      const slugs = parsed.topics.map((t: { slug: string }) => t.slug).sort();
      assert.deepStrictEqual(slugs, ['bar', 'foo']);
    });

    it('--slugs and positional <slug> together is an error', () => {
      seedTopic('foo');
      const r = runCliRaw(
        ['topic', 'refresh', 'foo', '--slugs', 'bar', '--allow-no-llm', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.match(parsed.error, /Cannot pass both/);
    });

    it('--skip-topics short-circuits without LLM/writes', () => {
      seedTopic('foo');
      seedSlackDigest('2026-04-28-slack-digest', ['foo'], '2026-04-28');
      const r = runCliRaw(
        ['topic', 'refresh', '--slugs', 'foo', '--skip-topics', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.skipped, 'topics');
      // Topic page's sources_integrated must remain empty.
      const topicContent = readFileSync(
        join(tmpDir, '.arete', 'memory', 'topics', 'foo.md'),
        'utf8',
      );
      assert.match(topicContent, /sources_integrated: \[\]/);
    });

    it('--source rejects non-existent path', () => {
      seedTopic('foo');
      const r = runCliRaw(
        [
          'topic',
          'refresh',
          '--slugs',
          'foo',
          '--source',
          'resources/notes/does-not-exist.md',
          '--allow-no-llm',
          '--json',
        ],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.match(parsed.error, /does not exist/);
    });

    it('--source rejects file with non-conforming filename', () => {
      seedTopic('foo');
      // A real file but wrong filename shape.
      const notesDir = join(tmpDir, 'resources', 'notes');
      mkdirSync(notesDir, { recursive: true });
      const badPath = join(notesDir, 'random-note.md');
      writeFileSync(badPath, '---\ntopics: [foo]\n---\n\nBody.');
      const r = runCliRaw(
        ['topic', 'refresh', '--slugs', 'foo', '--source', badPath, '--allow-no-llm', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.match(parsed.error, /must be a meeting.*or slack-digest/);
    });

    it('--source scopes integration to a single digest (no cost-blowup)', () => {
      seedTopic('foo');
      // Three prior digests + one new digest, all tagged `foo`.
      seedSlackDigest('2026-04-20-slack-digest', ['foo'], '2026-04-20');
      seedSlackDigest('2026-04-22-slack-digest', ['foo'], '2026-04-22');
      seedSlackDigest('2026-04-25-slack-digest', ['foo'], '2026-04-25');
      const newDigest = seedSlackDigest('2026-04-28-slack-digest', ['foo'], '2026-04-28');

      const r = runCliRaw(
        [
          'topic',
          'refresh',
          '--slugs',
          'foo',
          '--source',
          newDigest,
          '--allow-no-llm',
          '--json',
        ],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0, `stderr=${r.stderr} stdout=${r.stdout}`);
      const parsed = JSON.parse(r.stdout);
      // Exactly 1 source integrated (fallback path since --allow-no-llm).
      assert.strictEqual(parsed.totals.fallback, 1);
      assert.strictEqual(parsed.totals.integrated, 0);

      const topicContent = readFileSync(
        join(tmpDir, '.arete', 'memory', 'topics', 'foo.md'),
        'utf8',
      );
      assert.match(topicContent, /2026-04-28-slack-digest/);
      // Prior digests must NOT appear.
      assert.doesNotMatch(topicContent, /2026-04-20-slack-digest/);
      assert.doesNotMatch(topicContent, /2026-04-22-slack-digest/);
      assert.doesNotMatch(topicContent, /2026-04-25-slack-digest/);
    });

    it('emits stable seed_lock_held JSON when .arete/.seed.lock is held', () => {
      seedTopic('foo');
      const newDigest = seedSlackDigest('2026-04-28-slack-digest', ['foo'], '2026-04-28');
      // Hold the lock externally by writing the file with O_EXCL semantics.
      // The CLI must detect EEXIST and exit with the seed_lock_held marker.
      const lockPath = join(tmpDir, '.arete', '.seed.lock');
      mkdirSync(join(tmpDir, '.arete'), { recursive: true });
      writeFileSync(
        lockPath,
        JSON.stringify({ pid: 99999, started: new Date().toISOString(), command: 'test-hold' }),
        { flag: 'wx' },
      );

      try {
        const r = runCliRaw(
          [
            'topic',
            'refresh',
            '--slugs',
            'foo',
            '--source',
            newDigest,
            '--allow-no-llm',
            '--json',
          ],
          { cwd: tmpDir },
        );
        assert.strictEqual(r.code, 1, 'CLI exits non-zero on lock contention');
        // Stdout must contain the parseable JSON marker for the
        // slack-digest skill's catch+warn behavior. The skill's bash
        // invocation greps for `"error":"seed_lock_held"`.
        assert.match(r.stdout, /"error":\s*"seed_lock_held"/);
        // No stack trace leakage in stderr.
        assert.doesNotMatch(r.stderr, /\s+at\s+.*\(.*:\d+:\d+\)/);
      } finally {
        // Cleanup so afterEach() rmSync doesn't trip on stale lock.
        try {
          unlinkSync(lockPath);
        } catch {
          /* already gone */
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // topic seed
  // ---------------------------------------------------------------------------

  describe('topic seed', () => {
    function seedMeeting(name: string, topics: string[]): void {
      const meetingsDir = join(tmpDir, 'resources', 'meetings');
      mkdirSync(meetingsDir, { recursive: true });
      const topicsList = topics.map((t) => `  - ${t}`).join('\n');
      writeFileSync(
        join(meetingsDir, `${name}.md`),
        `---\ntitle: "${name}"\ndate: "2026-04-22"\ntopics:\n${topicsList}\nattendees: []\n---\n\nBody: ${name}`,
      );
    }

    it('reports nothing-to-seed when no meetings have topics frontmatter', () => {
      const r = runCliRaw(['topic', 'seed', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.match(parsed.message, /nothing to seed/);
    });

    it('errors out when no AI configured and no --allow-no-llm', () => {
      seedMeeting('2026-04-22-example', ['cover-whale-templates']);
      const r = runCliRaw(['topic', 'seed', '--json'], { cwd: tmpDir });
      assert.strictEqual(r.code, 1);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, false);
      assert.match(parsed.error, /AI not configured/);
    });

    it('dry-run reports scope + cost estimate without spending', () => {
      seedMeeting('2026-04-22-a', ['cover-whale-templates', 'leap-templates']);
      seedMeeting('2026-04-23-b', ['cover-whale-templates']);
      const r = runCliRaw(
        ['topic', 'seed', '--dry-run', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.dryRun, true);
      assert.strictEqual(parsed.meetings_with_topics, 2);
      assert.strictEqual(parsed.unique_slugs, 2);
      assert.ok(parsed.estimate.cost_usd > 0);
      assert.strictEqual(parsed.estimate.max_usd, 50); // default ceiling
    });

    it('honors ARETE_SEED_MAX_USD envvar for ceiling', () => {
      seedMeeting('2026-04-22-a', ['cover-whale-templates']);
      const r = runCliRaw(
        ['topic', 'seed', '--dry-run', '--json'],
        { cwd: tmpDir, env: { ARETE_SEED_MAX_USD: '100' } },
      );
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.estimate.max_usd, 100);
    });

    it('with --allow-no-llm, materializes topic pages from meeting frontmatter', () => {
      seedMeeting('2026-04-22-a', ['cover-whale-templates']);
      seedMeeting('2026-04-23-b', ['leap-templates']);
      const r = runCliRaw(
        ['topic', 'seed', '--allow-no-llm', '--yes', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.success, true);
      // Both topic pages should exist on disk
      assert.ok(existsSync(join(tmpDir, '.arete/memory/topics/cover-whale-templates.md')));
      assert.ok(existsSync(join(tmpDir, '.arete/memory/topics/leap-templates.md')));
    });

    it('is idempotent — second seed produces zero new integrations', () => {
      seedMeeting('2026-04-22-a', ['cover-whale-templates']);
      runCliRaw(['topic', 'seed', '--allow-no-llm', '--yes', '--json'], { cwd: tmpDir });

      const r2 = runCliRaw(
        ['topic', 'seed', '--allow-no-llm', '--yes', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r2.code, 0);
      const parsed = JSON.parse(r2.stdout);
      assert.strictEqual(parsed.totals.integrated, 0);
      assert.ok(parsed.totals.skipped > 0 || parsed.totals.fallback > 0);
    });

    it('appends a seed event to log.md', () => {
      seedMeeting('2026-04-22-a', ['t1']);
      runCliRaw(['topic', 'seed', '--allow-no-llm', '--yes', '--json'], { cwd: tmpDir });
      const logPath = join(tmpDir, '.arete', 'memory', 'log.md');
      assert.ok(existsSync(logPath));
      const log = readFileSync(logPath, 'utf8');
      assert.match(log, /\] seed \|/);
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

    it('does NOT flag person slugs as dangling wikilinks', () => {
      // Seed a person file so the slug is resolvable.
      const personDir = join(tmpDir, 'people', 'internal');
      mkdirSync(personDir, { recursive: true });
      writeFileSync(
        join(personDir, 'jane-doe.md'),
        '---\nname: "Jane Doe"\ncategory: "internal"\n---\n\nbody',
      );
      seedTopic('a-topic', { currentState: 'Coordinating with [[jane-doe]].' });
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      const dangles = parsed.findings.dangling.filter(
        (d: { toSlug: string }) => d.toSlug === 'jane-doe',
      );
      assert.strictEqual(dangles.length, 0, 'person slugs must not be flagged as dangling');
    });

    it('does NOT flag meeting-slug wikilinks (date-prefixed) as dangling', () => {
      // Meeting wikilinks appear in Source trail after integrateSource.
      // Even if they appear elsewhere, date-prefixed slugs are meeting refs.
      const dir = join(tmpDir, '.arete', 'memory', 'topics');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'has-meeting-ref.md'),
        `---
topic_slug: has-meeting-ref
status: active
first_seen: 2026-03-01
last_refreshed: 2026-04-22
sources_integrated: []
---

# Has Meeting Ref

## Current state

Discussed in [[2026-04-15-some-meeting]] and [[2026-04-20-other]].
`,
      );
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      const dangles = parsed.findings.dangling.filter(
        (d: { toSlug: string }) =>
          d.toSlug === '2026-04-15-some-meeting' || d.toSlug === '2026-04-20-other',
      );
      assert.strictEqual(dangles.length, 0, 'meeting-slug refs must not be flagged as dangling');
    });

    it('does NOT scan Source trail section for dangling refs', () => {
      const dir = join(tmpDir, '.arete', 'memory', 'topics');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'via-trail.md'),
        `---
topic_slug: via-trail
status: active
first_seen: 2026-03-01
last_refreshed: 2026-04-22
sources_integrated: []
---

# Via Trail

## Current state

Real content.

## Source trail

- [[completely-made-up-slug]] (2026-04-01)
`,
      );
      const r = runCliRaw(['topic', 'lint', '--json'], { cwd: tmpDir });
      const parsed = JSON.parse(r.stdout);
      const dangles = parsed.findings.dangling.filter(
        (d: { toSlug: string }) => d.toSlug === 'completely-made-up-slug',
      );
      assert.strictEqual(dangles.length, 0, 'Source trail refs must not be scanned for dangling');
    });

    it('appends a lint event to log.md', () => {
      seedTopic('any');
      runCli(['topic', 'lint', '--json'], { cwd: tmpDir });
      const logPath = join(tmpDir, '.arete', 'memory', 'log.md');
      assert.ok(existsSync(logPath), 'log.md must exist after lint');
      const log = readFileSync(logPath, 'utf8');
      assert.match(log, /\] lint \|/);
    });

    it('--fix-dangling rewrites dangling [[refs]] to plain text', () => {
      seedTopic('source-topic', {
        currentState: 'See [[missing-slug]] and [[another-missing]] for context.',
      });
      const r = runCliRaw(
        ['topic', 'lint', '--fix-dangling', '--json'],
        { cwd: tmpDir },
      );
      assert.strictEqual(r.code, 0);
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.findings.fixed !== undefined, 'fixed block must be present when --fix-dangling is set');
      assert.strictEqual(parsed.findings.fixed.dangling, 2);
      assert.deepStrictEqual(parsed.findings.fixed.topicsModified, ['source-topic']);

      const contents = readFileSync(
        join(tmpDir, '.arete', 'memory', 'topics', 'source-topic.md'),
        'utf8',
      );
      assert.ok(contents.includes('missing-slug'), 'target text preserved');
      assert.ok(contents.includes('another-missing'), 'target text preserved');
      assert.ok(!contents.includes('[[missing-slug]]'), 'brackets stripped');
      assert.ok(!contents.includes('[[another-missing]]'), 'brackets stripped');
    });

    it('--fix-dangling preserves valid wikilinks', () => {
      // Source trail wikilinks must never be touched; real topic refs too.
      seedTopic('real-target', { currentState: 'content' });
      seedTopic('source-topic', {
        currentState: 'See [[real-target]] and [[fake-slug]].',
      });
      runCliRaw(['topic', 'lint', '--fix-dangling', '--json'], { cwd: tmpDir });
      const contents = readFileSync(
        join(tmpDir, '.arete', 'memory', 'topics', 'source-topic.md'),
        'utf8',
      );
      assert.ok(contents.includes('[[real-target]]'), 'valid wikilink preserved');
      assert.ok(!contents.includes('[[fake-slug]]'), 'dangling wikilink stripped');
    });

    it('--fix-dangling is a no-op when nothing dangling', () => {
      seedTopic('tidy-topic', { currentState: 'No wikilinks here.' });
      const r = runCliRaw(
        ['topic', 'lint', '--fix-dangling', '--json'],
        { cwd: tmpDir },
      );
      const parsed = JSON.parse(r.stdout);
      assert.strictEqual(parsed.findings.fixed.dangling, 0);
    });
  });
});
