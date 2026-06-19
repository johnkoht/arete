/**
 * `arete meeting topics <file> --set/--add/--remove` (CHR-W4 Piece 2) —
 * chef topic-review write surface CLI behavior tests.
 *
 * Uses runCli subprocess helper + real temp workspaces (arete install).
 * ARETE_SEARCH_FALLBACK is set by the test env so qmd is never touched.
 * Pattern mirrors meeting-area-cli.test.ts.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

function seedMeeting(root: string, name: string, content: string): string {
  const dir = join(root, 'resources', 'meetings');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

function readFrontmatter(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  return (m ? (parseYaml(m[1]) as Record<string, unknown>) : {}) ?? {};
}

const MEETING = `---
title: "John / Jamie — Status Letter"
date: 2026-06-18T16:00:00.000Z
status: synced
topics:
  - glance-2-mvp
  - multi-agent-strategy
staged_item_status:
  ai_001: pending
  de_001: approved
staged_item_elevated:
  de_001: true
---

## Staged Action Items
- ai_001: Draft the status letter

## Transcript
Body text here.
`;

describe('arete meeting topics', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-meeting-topics');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    seedMeeting(tmpDir, '2026-06-18-status-letter.md', MEETING);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('--add appends a slug (dedup, JSON output)', () => {
    const out = JSON.parse(
      runCli(
        ['meeting', 'topics', '2026-06-18-status-letter.md', '--add', 'status-letter-automation', '--json'],
        { cwd: tmpDir },
      ),
    );
    assert.equal(out.success, true);
    assert.equal(out.mode, 'add');
    assert.equal(out.changed, true);
    assert.deepEqual(out.topics, ['glance-2-mvp', 'multi-agent-strategy', 'status-letter-automation']);
  });

  it('--remove drops a slug', () => {
    const out = JSON.parse(
      runCli(
        ['meeting', 'topics', '2026-06-18-status-letter.md', '--remove', 'multi-agent-strategy', '--json'],
        { cwd: tmpDir },
      ),
    );
    assert.equal(out.changed, true);
    assert.deepEqual(out.topics, ['glance-2-mvp']);
  });

  it('--set replaces the whole list', () => {
    const out = JSON.parse(
      runCli(
        ['meeting', 'topics', '2026-06-18-status-letter.md', '--set', 'status-letter-automation', '--json'],
        { cwd: tmpDir },
      ),
    );
    assert.deepEqual(out.topics, ['status-letter-automation']);
  });

  it('PRESERVES sibling frontmatter — never touches staged-item status/elevated or body', () => {
    const p = join(tmpDir, 'resources', 'meetings', '2026-06-18-status-letter.md');
    runCli(
      ['meeting', 'topics', '2026-06-18-status-letter.md', '--add', 'status-letter-automation', '--json'],
      { cwd: tmpDir },
    );
    const fm = readFrontmatter(p);
    assert.deepEqual(fm['staged_item_status'], { ai_001: 'pending', de_001: 'approved' });
    assert.deepEqual(fm['staged_item_elevated'], { de_001: true });
    assert.equal(fm['title'], 'John / Jamie — Status Letter');
    const raw = readFileSync(p, 'utf8');
    assert.ok(raw.includes('## Transcript'));
    assert.ok(raw.includes('- ai_001: Draft the status letter'));
  });

  it('rejects when more than one mode is given', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'topics', '2026-06-18-status-letter.md', '--add', 'x', '--remove', 'y', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    assert.equal(JSON.parse(stdout).success, false);
  });

  it('rejects when no mode is given', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'topics', '2026-06-18-status-letter.md', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    assert.equal(JSON.parse(stdout).success, false);
  });

  it('errors on a missing meeting file', () => {
    const { stdout, code } = runCliRaw(
      ['meeting', 'topics', 'does-not-exist.md', '--add', 'x', '--json'],
      { cwd: tmpDir },
    );
    assert.equal(code, 1);
    assert.match(JSON.parse(stdout).error, /Meeting not found/);
  });
});
