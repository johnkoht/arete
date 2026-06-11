/**
 * `arete project refresh-topics` (Phase 14 AC2) — CLI behavior tests.
 *
 * Uses runCli subprocess helper + real temp workspaces (arete install).
 * ARETE_SEARCH_FALLBACK=1 is forced so qmd is never touched — scores ride
 * the normalized token-fallback provider (top hit 0.6×1.0 + recency +
 * area bonuses), which clears the 0.35 floor with margin; the weak
 * fixture (stale, different area, one shared token) sits far below it
 * (pre-mortem D6: both backend scales separated by the same constant).
 *
 * NOTE (AC4 regression wall): the phase-12 zero-write suite lives in
 * project.test.ts and is byte-frozen this phase — phase-14 CLI tests
 * live HERE. The apply-twice test below is the AC8 hard gate.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

const ENV = { ARETE_SEARCH_FALLBACK: '1' };

function seedProject(root: string, slug: string, content: string): string {
  const dir = join(root, 'projects', 'active', slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'README.md');
  writeFileSync(path, content, 'utf8');
  return path;
}

function seedTopic(
  root: string,
  slug: string,
  opts: { area?: string; lastRefreshed?: string; body?: string } = {},
): void {
  const dir = join(root, '.arete', 'memory', 'topics');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---
topic_slug: ${slug}
status: active
first_seen: 2026-05-01
last_refreshed: ${opts.lastRefreshed ?? new Date().toISOString().slice(0, 10)}
sources_integrated: []
aliases: []
${opts.area ? `area: ${opts.area}` : ''}
---

# ${slug}

## Current state
${opts.body ?? 'Something about this topic.'}
`,
    'utf8',
  );
}

function snapshotTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else out.set(full, readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  return out;
}

const PROJECT = `---
title: Snapsheet Task Replacement
area: glance-2-mvp
status: active
---

# Snapsheet Task Replacement

## Background

Replacing snapsheet task handling with native glance tasks.
`;

describe('arete project refresh-topics (Phase 14 AC2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-refresh-topics');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    seedProject(tmpDir, 'snapsheet-task-replacement', PROJECT);
    // Strong: fresh, same area, heavy token overlap with the wiki query.
    seedTopic(tmpDir, 'snapsheet-task-replacement', {
      area: 'glance-2-mvp',
      body: 'Snapsheet task replacement work for glance.',
    });
    // Weak: stale, different area, one shared token ("task").
    seedTopic(tmpDir, 'task-board-archive', {
      area: 'other-area',
      lastRefreshed: '2025-01-01',
      body: 'Old board archive notes.',
    });
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('preview (default) is a pure read: JSON shape complete, workspace byte-identical', () => {
    const before = snapshotTree(tmpDir);
    const out = runCli(['project', 'refresh-topics', 'snapsheet-task-replacement', '--json'], {
      cwd: tmpDir,
      env: ENV,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.success, true);
    assert.equal(parsed.slug, 'snapsheet-task-replacement');
    assert.equal(parsed.area, 'glance-2-mvp');
    assert.equal(typeof parsed.floor, 'number');
    assert.ok(Array.isArray(parsed.computed));
    assert.ok(
      parsed.computed.some(
        (c: { slug: string }) => c.slug === 'snapsheet-task-replacement',
      ),
      `strong topic should clear the floor; got ${JSON.stringify(parsed.computed)}`,
    );
    assert.ok(
      !parsed.computed.some((c: { slug: string }) => c.slug === 'task-board-archive'),
      'weak topic must NOT enter the cache',
    );
    assert.deepEqual(parsed.current, []);
    assert.equal(parsed.changed, true);
    assert.equal(parsed.applied, false);
    assert.ok(parsed.qmd);

    const after = snapshotTree(tmpDir);
    assert.equal(after.size, before.size);
    for (const [path, content] of before) {
      assert.equal(after.get(path), content, `preview modified ${path}`);
    }
  });

  it('AC8 GATE: --apply writes once on change; second --apply with unchanged wiki is byte-identical (zero-write rerun)', () => {
    const out1 = runCli(
      ['project', 'refresh-topics', 'snapsheet-task-replacement', '--apply', '--skip-qmd', '--json'],
      { cwd: tmpDir, env: ENV },
    );
    const parsed1 = JSON.parse(out1);
    assert.equal(parsed1.changed, true);
    assert.equal(parsed1.applied, true);

    const readmePath = join(
      tmpDir,
      'projects',
      'active',
      'snapsheet-task-replacement',
      'README.md',
    );
    const applied = readFileSync(readmePath, 'utf8');
    assert.match(applied, /topics:\n\s+- snapsheet-task-replacement/);
    assert.match(applied, /topics_refreshed: \d{4}-\d{2}-\d{2}/);
    assert.equal(
      applied.split('topics: maintained by arete').length - 1,
      1,
      'ownership comment exactly once',
    );
    assert.match(applied, /## Background/, 'body preserved');

    // Second run — the R2 end-to-end hard stop: byte-identical workspace.
    const before = snapshotTree(tmpDir);
    const out2 = runCli(
      ['project', 'refresh-topics', 'snapsheet-task-replacement', '--apply', '--skip-qmd', '--json'],
      { cwd: tmpDir, env: ENV },
    );
    const parsed2 = JSON.parse(out2);
    assert.equal(parsed2.changed, false);
    assert.equal(parsed2.applied, false);
    assert.deepEqual(parsed2.current, parsed1.computed.map((c: { slug: string }) => c.slug));

    const after = snapshotTree(tmpDir);
    assert.equal(after.size, before.size);
    for (const [path, content] of before) {
      assert.equal(after.get(path), content, `no-op apply modified ${path}`);
    }
  });

  it('stale cache vs empty computed set → changed=true (removal proposed); preview never writes', () => {
    seedProject(
      tmpDir,
      'pre-cached',
      `---
title: Pre Cached
status: active
topics:
  - already-cached
topics_refreshed: 2026-06-01
---

# Pre Cached
`,
    );
    // No area + no matching topics → computed is empty → set differs
    // (already-cached vs []) → changed=true: the verb proposes clearing
    // the stale cache, and preview mode leaves the README untouched.
    const out = runCli(['project', 'refresh-topics', 'pre-cached', '--json'], {
      cwd: tmpDir,
      env: ENV,
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.changed, true, 'stale cache vs empty computed set → changed');
    assert.equal(parsed.applied, false);
    const content = readFileSync(
      join(tmpDir, 'projects', 'active', 'pre-cached', 'README.md'),
      'utf8',
    );
    assert.match(content, /already-cached/, 'preview never writes');
  });

  it('--json error path: no such project (exit 1, parseable)', () => {
    const { stdout, code } = runCliRaw(['project', 'refresh-topics', 'nope', '--json'], {
      cwd: tmpDir,
      env: ENV,
    });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.success, false);
    assert.match(parsed.error, /nope/);
  });

  it('--json error path: outside a workspace (exit 1, parseable)', () => {
    const outside = createTmpDir('arete-test-refresh-topics-outside');
    try {
      const { stdout, code } = runCliRaw(
        ['project', 'refresh-topics', 'whatever', '--json'],
        { cwd: outside, env: ENV },
      );
      assert.equal(code, 1);
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.success, false);
      assert.match(parsed.error, /workspace/i);
    } finally {
      cleanupTmpDir(outside);
    }
  });
});
