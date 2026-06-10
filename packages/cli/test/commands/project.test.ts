/**
 * `arete project backfill-area` (Phase 12 AC2) + `arete project open`
 * (Phase 12 AC3) — CLI behavior tests.
 *
 * Uses runCli subprocess helper + real temp workspaces (arete install).
 * ARETE_SEARCH_FALLBACK is set by the test env so qmd is never touched.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { runCli, runCliRaw, createTmpDir, cleanupTmpDir } from '../helpers.js';

function seedArea(root: string, slug: string, name: string): void {
  const dir = join(root, 'areas');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    `---
area: ${name}
status: active
recurring_meetings: []
---

# ${name}

## Focus
${name} delivery work.
`,
    'utf8',
  );
}

function seedProject(root: string, slug: string, content: string): string {
  const dir = join(root, 'projects', 'active', slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'README.md');
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('arete project backfill-area', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-project-backfill');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
    seedArea(tmpDir, 'glance-comms', 'Glance Comms');
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  it('preview (default): proposes confident match, leaves READMEs byte-identical', () => {
    const matchable = seedProject(
      tmpDir,
      'comms-rollout',
      `---
title: Glance Comms rollout plan
status: active
---

# Glance Comms rollout plan

## Background
Rollout plan for Glance Comms across claims.
`,
    );
    const unrelated = seedProject(
      tmpDir,
      'zebra-unrelated',
      `---
title: Zebra quarterly logistics
status: active
---

# Zebra quarterly logistics
`,
    );
    const beforeMatchable = readFileSync(matchable, 'utf8');
    const beforeUnrelated = readFileSync(unrelated, 'utf8');

    const out = JSON.parse(
      runCli(['project', 'backfill-area', '--json'], { cwd: tmpDir }),
    );
    assert.equal(out.success, true);
    assert.equal(out.applied, false);
    assert.equal(out.candidates, 2);
    assert.equal(out.matched, 1);
    assert.equal(out.proposals[0].slug, 'comms-rollout');
    assert.equal(out.proposals[0].area, 'glance-comms');
    assert.ok(out.proposals[0].confidence >= 0.7);
    assert.deepEqual(out.unmatched, ['zebra-unrelated']);

    // Zero writes in preview.
    assert.equal(readFileSync(matchable, 'utf8'), beforeMatchable);
    assert.equal(readFileSync(unrelated, 'utf8'), beforeUnrelated);
  });

  it('--apply: writes area + backfill provenance for confident matches only', () => {
    const matchable = seedProject(
      tmpDir,
      'comms-rollout',
      `---
title: Glance Comms rollout plan
status: active
---

# Glance Comms rollout plan

## Background
Rollout for Glance Comms.
`,
    );
    const unrelated = seedProject(
      tmpDir,
      'zebra-unrelated',
      `---
title: Zebra quarterly logistics
status: active
---

# Zebra
`,
    );

    const out = JSON.parse(
      runCli(['project', 'backfill-area', '--apply', '--skip-qmd', '--json'], { cwd: tmpDir }),
    );
    assert.equal(out.applied, true);
    assert.equal(out.matched, 1);

    const applied = readFileSync(matchable, 'utf8');
    assert.ok(/area: glance-comms/.test(applied));
    assert.ok(/area_set_by: backfill/.test(applied));
    assert.ok(/## Background/.test(applied), 'body preserved');

    assert.ok(!/area:/.test(readFileSync(unrelated, 'utf8')), 'below-floor project untouched');

    // Rerun: the applied project now resolves an area → no candidates left to match.
    const rerun = JSON.parse(
      runCli(['project', 'backfill-area', '--json'], { cwd: tmpDir }),
    );
    assert.equal(rerun.matched, 0);
    assert.deepEqual(rerun.unmatched, ['zebra-unrelated']);
  });

  it('--reset: clears only backfill-stamped areas', () => {
    const backfilled = seedProject(
      tmpDir,
      'was-backfilled',
      `---
title: Was Backfilled
area: glance-comms
area_set_by: backfill
---

# Was Backfilled
`,
    );
    const creation = seedProject(
      tmpDir,
      'creation-stamped',
      `---
title: Creation Stamped
area: glance-comms
area_set_by: creation
---

# Creation Stamped
`,
    );

    const out = JSON.parse(
      runCli(['project', 'backfill-area', '--reset', '--json'], { cwd: tmpDir }),
    );
    assert.deepEqual(out.reset, ['was-backfilled']);
    assert.ok(!/area:/.test(readFileSync(backfilled, 'utf8')));
    assert.ok(/area: glance-comms/.test(readFileSync(creation, 'utf8')));
    assert.ok(/area_set_by: creation/.test(readFileSync(creation, 'utf8')));
  });

  it('projects whose area resolves from a prose line are not candidates', () => {
    seedProject(
      tmpDir,
      'prose-resolved',
      `---
title: Prose Resolved
status: active
---

# Prose Resolved

**Area**: [Glance Comms](../../../areas/glance-comms.md)
`,
    );
    const out = JSON.parse(
      runCli(['project', 'backfill-area', '--json'], { cwd: tmpDir }),
    );
    assert.equal(out.candidates, 0);
  });

  it('--json error path outside a workspace', () => {
    const bare = createTmpDir('arete-test-project-noworkspace');
    try {
      const { stdout, code } = runCliRaw(['project', 'backfill-area', '--json'], { cwd: bare });
      assert.equal(code, 1);
      const parsed = JSON.parse(stdout);
      assert.equal(parsed.success, false);
      assert.ok(/workspace/i.test(parsed.error));
    } finally {
      cleanupTmpDir(bare);
    }
  });
});

describe('arete project open (Phase 12 AC3 — read-only)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir('arete-test-project-open');
    runCli(['install', tmpDir, '--skip-qmd', '--json', '--ide', 'cursor']);
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

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

  it('opens by exact slug: brief + whatsNew in JSON; workspace byte-identical', () => {
    seedProject(
      tmpDir,
      'glance-2-mvp',
      `---
title: Glance 2 MVP
area: glance-2-mvp
status: active
---

# Glance 2 MVP

## Background
POP migration.
`,
    );
    const before = snapshotTree(tmpDir);

    const out = JSON.parse(runCli(['project', 'open', 'glance-2-mvp', '--json'], { cwd: tmpDir }));
    assert.equal(out.success, true);
    assert.equal(out.subjectSlug, 'glance-2-mvp');
    assert.equal(out.metadata.area, 'glance-2-mvp');
    assert.ok(out.whatsNew, 'whatsNew block present');
    assert.ok(Array.isArray(out.whatsNew.meetings));

    const after = snapshotTree(tmpDir);
    assert.equal(after.size, before.size, 'no files created or deleted');
    for (const [path, content] of before) {
      assert.equal(after.get(path), content, `file changed: ${path}`);
    }
  });

  it('tie → top-N disambiguation, never auto-loads', () => {
    seedProject(
      tmpDir,
      'status-letter-automation',
      `---
title: Status Letter Automation
status: active
---

# Status Letter Automation
`,
    );
    seedProject(
      tmpDir,
      'status-letter-research',
      `---
title: Status Letter Research
status: active
---

# Status Letter Research
`,
    );

    const out = JSON.parse(runCli(['project', 'open', 'status letter', '--json'], { cwd: tmpDir }));
    assert.equal(out.disambiguation, true);
    const slugs = out.candidates.map((c: { slug: string }) => c.slug);
    assert.ok(slugs.includes('status-letter-automation'));
    assert.ok(slugs.includes('status-letter-research'));
  });

  it('archived project → read-only note, no brief', () => {
    const dir = join(tmpDir, 'projects', 'archive', 'old-initiative');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'README.md'),
      `---
title: Old Initiative
status: archived
---

# Old Initiative
`,
      'utf8',
    );

    const out = JSON.parse(runCli(['project', 'open', 'old-initiative', '--json'], { cwd: tmpDir }));
    assert.equal(out.archived, true);
    assert.equal(out.slug, 'old-initiative');
    assert.equal(out.sections, undefined, 'no brief sections for archived');
  });

  it('no match → --json error with exit 1', () => {
    const { stdout, code } = runCliRaw(['project', 'open', 'zzz-nonexistent-zzz', '--json'], {
      cwd: tmpDir,
    });
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.success, false);
  });
});
