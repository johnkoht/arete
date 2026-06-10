/**
 * Phase 12 AC2 — project-area backfill helpers.
 *
 * Real fs + FileStorageAdapter (no mocks for memory/storage ops).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  listProjectsForBackfill,
  applyAreaToProjectReadme,
  resetBackfilledProjectAreas,
} from '../../src/services/project-area.js';
import type { WorkspacePaths } from '../../src/models/index.js';

function makePaths(root: string): WorkspacePaths {
  return {
    root,
    manifest: join(root, 'arete.yaml'),
    ideConfig: join(root, '.cursor'),
    rules: join(root, '.cursor', 'rules'),
    agentSkills: join(root, '.agents', 'skills'),
    managedSkills: join(root, '.arete', 'skills'),
    tools: join(root, '.cursor', 'tools'),
    integrations: join(root, '.cursor', 'integrations'),
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

function writeProject(root: string, slug: string, content: string): string {
  const dir = join(root, 'projects', 'active', slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'README.md');
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('project-area backfill helpers (Phase 12 AC2)', () => {
  let tmpDir: string;
  let paths: WorkspacePaths;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `project-area-${process.pid}-`));
    paths = makePaths(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('listProjectsForBackfill: inference text = Background + Key Questions; area resolution annotated', async () => {
    writeProject(
      tmpDir,
      'no-area',
      `---
title: Claims Review Generator
status: active
---

# Claims Review Generator

## Background
Generate claims reviews automatically.

## Key Questions
Which review template fits POP?

## Other
Should not appear in inference text.
`,
    );
    writeProject(
      tmpDir,
      'prose-area',
      `---
title: Prose Area Project
---

**Area**: [G](../../../areas/glance-2-mvp.md)
`,
    );

    const list = await listProjectsForBackfill(storage, paths);
    const noArea = list.find((p) => p.slug === 'no-area')!;
    assert.equal(noArea.area, undefined);
    assert.equal(noArea.title, 'Claims Review Generator');
    assert.ok(/Generate claims reviews/.test(noArea.inferenceSummary));
    assert.ok(/Which review template/.test(noArea.inferenceSummary));
    assert.ok(!/Should not appear/.test(noArea.inferenceSummary));

    const prose = list.find((p) => p.slug === 'prose-area')!;
    assert.equal(prose.area, 'glance-2-mvp');
    assert.equal(prose.areaSource, 'prose');
  });

  it('applyAreaToProjectReadme: writes both keys, preserves body + nested frontmatter, idempotent', async () => {
    const path = writeProject(
      tmpDir,
      'apply-me',
      `---
title: Apply Me
status: active
notion:
  roadmap:
    url: "https://example.com/x"
    page_id: "abc-123"
---

# Apply Me

**Bold body content** stays put.

## Background
Body preserved verbatim.
`,
    );

    await applyAreaToProjectReadme(storage, path, 'glance-2-mvp', 'backfill');
    const once = readFileSync(path, 'utf8');
    assert.ok(/area: glance-2-mvp/.test(once));
    assert.ok(/area_set_by: backfill/.test(once));
    assert.ok(/title: Apply Me/.test(once));
    assert.ok(/page_id: abc-123|page_id: "abc-123"/.test(once));
    assert.ok(/\*\*Bold body content\*\* stays put\./.test(once));
    assert.ok(/Body preserved verbatim\./.test(once));

    await applyAreaToProjectReadme(storage, path, 'glance-2-mvp', 'backfill');
    const twice = readFileSync(path, 'utf8');
    assert.equal(twice, once, 'second apply must be byte-identical (idempotent)');
  });

  it('resetBackfilledProjectAreas: clears only backfill-stamped; creation provenance untouched', async () => {
    const backfilled = writeProject(
      tmpDir,
      'backfilled',
      `---
title: Backfilled
area: glance-2-mvp
area_set_by: backfill
---

# Backfilled
`,
    );
    const creation = writeProject(
      tmpDir,
      'created-with-area',
      `---
title: Created
area: glance-comms
area_set_by: creation
---

# Created
`,
    );
    const manual = writeProject(
      tmpDir,
      'manual-area',
      `---
title: Manual
area: ops
---

# Manual
`,
    );

    const result = await resetBackfilledProjectAreas(storage, paths);
    assert.deepEqual(result.reset, ['backfilled']);

    const backfilledAfter = readFileSync(backfilled, 'utf8');
    assert.ok(!/area:/.test(backfilledAfter));
    assert.ok(!/area_set_by/.test(backfilledAfter));

    assert.ok(/area: glance-comms/.test(readFileSync(creation, 'utf8')));
    assert.ok(/area_set_by: creation/.test(readFileSync(creation, 'utf8')));
    assert.ok(/area: ops/.test(readFileSync(manual, 'utf8')));
  });
});
