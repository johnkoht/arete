/**
 * I-5 — `arete topic add-aliases <slug> <alias...>` CLI verb.
 *
 * Verifies the no-LLM frontmatter writer end-to-end: it edits the topic
 * page's `aliases:` frontmatter on disk, emits the JSON shape, dedupes an
 * already-present alias, and errors on a missing page. The `--refresh`
 * chaining path is not exercised here (it requires AI configured).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

describe('arete topic add-aliases', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-add-aliases');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  function seedTopic(slug: string, aliases?: string[]): void {
    const dir = join(tmpDir, '.arete', 'memory', 'topics');
    mkdirSync(dir, { recursive: true });
    const fm: string[] = ['---', `topic_slug: ${slug}`, 'status: active'];
    if (aliases !== undefined && aliases.length > 0) {
      fm.push('aliases:');
      for (const a of aliases) fm.push(`  - ${a}`);
    }
    fm.push('first_seen: 2026-03-01');
    fm.push('last_refreshed: 2026-04-22');
    fm.push('sources_integrated: []');
    fm.push('---', '', `# ${slug}`, '', '## Current state', '', 'A topic.', '');
    writeFileSync(join(dir, `${slug}.md`), fm.join('\n'));
  }

  function readPage(slug: string): string {
    return readFileSync(join(tmpDir, '.arete', 'memory', 'topics', `${slug}.md`), 'utf8');
  }

  it('writes aliases to frontmatter and emits JSON', () => {
    seedTopic('email-templates');
    const r = runCliRaw(
      ['topic', 'add-aliases', 'email-templates', 'default-email-template', 'campaign-emails', '--json'],
      { cwd: tmpDir },
    );
    assert.strictEqual(r.code, 0, r.stderr || r.stdout);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.slug, 'email-templates');
    assert.deepStrictEqual(parsed.aliases, ['campaign-emails', 'default-email-template']);
    assert.deepStrictEqual([...parsed.added].sort(), ['campaign-emails', 'default-email-template']);

    const onDisk = readPage('email-templates');
    assert.match(onDisk, /aliases:/);
    assert.match(onDisk, /default-email-template/);
    assert.match(onDisk, /campaign-emails/);
  });

  it('dedupes an alias that already exists in frontmatter', () => {
    seedTopic('email-templates', ['default-email-template']);
    const r = runCliRaw(
      ['topic', 'add-aliases', 'email-templates', 'default-email-template', 'newsletter-emails', '--json'],
      { cwd: tmpDir },
    );
    assert.strictEqual(r.code, 0, r.stderr || r.stdout);
    const parsed = JSON.parse(r.stdout);
    assert.deepStrictEqual(parsed.added, ['newsletter-emails']);
    assert.deepStrictEqual(parsed.aliases, ['default-email-template', 'newsletter-emails']);
  });

  it('errors (non-zero) on a nonexistent topic slug', () => {
    const r = runCliRaw(
      ['topic', 'add-aliases', 'no-such-topic', 'x', '--json'],
      { cwd: tmpDir },
    );
    assert.notStrictEqual(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.strictEqual(parsed.success, false);
    assert.match(parsed.error, /not found/i);
  });
});
