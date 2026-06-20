/**
 * project-exit Increment A — active-project marker + resume sidecar.
 *
 * Real fs + FileStorageAdapter (no mocks for storage ops).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  activeProjectMarkerPath,
  resumeSidecarPath,
  readActiveProjectMarker,
  writeActiveProjectMarker,
  setActiveProjectMarkerDirty,
  clearActiveProjectMarker,
  readResumeSidecar,
  writeResumeSidecar,
  dirtyByMtime,
  type ActiveProjectMarker,
} from '../../src/services/project-session.js';

describe('project-session marker + resume sidecar', () => {
  let root: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `project-session-${process.pid}-`));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('write/read/clear round-trip', async () => {
    assert.equal(await readActiveProjectMarker(storage, root), undefined);

    const marker: ActiveProjectMarker = {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt: '2026-06-19T10:00:00.000Z',
      dirty: false,
    };
    await writeActiveProjectMarker(storage, root, marker);
    assert.ok(existsSync(activeProjectMarkerPath(root)));

    const read = await readActiveProjectMarker(storage, root);
    assert.deepEqual(read, marker);

    await clearActiveProjectMarker(storage, root);
    assert.equal(await readActiveProjectMarker(storage, root), undefined);
    assert.ok(!existsSync(activeProjectMarkerPath(root)));
  });

  it('clear is a no-op when absent', async () => {
    await clearActiveProjectMarker(storage, root); // must not throw
    assert.equal(await readActiveProjectMarker(storage, root), undefined);
  });

  it('readActiveProjectMarker returns undefined on malformed json (never throws)', async () => {
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(activeProjectMarkerPath(root), '{ not valid json', 'utf8');
    assert.equal(await readActiveProjectMarker(storage, root), undefined);

    writeFileSync(activeProjectMarkerPath(root), JSON.stringify({ slug: 'x' }), 'utf8');
    assert.equal(await readActiveProjectMarker(storage, root), undefined);
  });

  it('setActiveProjectMarkerDirty flips clean→dirty; no-op without a marker', async () => {
    await setActiveProjectMarkerDirty(storage, root); // no marker → no-op
    assert.equal(await readActiveProjectMarker(storage, root), undefined);

    await writeActiveProjectMarker(storage, root, {
      slug: 's',
      name: 'S',
      openedAt: '2026-06-19T10:00:00.000Z',
      dirty: false,
    });
    await setActiveProjectMarkerDirty(storage, root);
    const read = await readActiveProjectMarker(storage, root);
    assert.equal(read?.dirty, true);
  });

  it('readResumeSidecar: undefined when absent, content when present', async () => {
    assert.equal(await readResumeSidecar(storage, root, 'slug'), undefined);
    mkdirSync(join(root, '.arete', 'sessions'), { recursive: true });
    writeFileSync(resumeSidecarPath(root, 'slug'), 'left off here\n', 'utf8');
    assert.equal(await readResumeSidecar(storage, root, 'slug'), 'left off here\n');
  });

  it('writeResumeSidecar creates .prev backup + flags thinnerThanPrev', async () => {
    // First write: no prior → no backup, not thinner.
    const first = await writeResumeSidecar(
      storage,
      root,
      'slug',
      '- one\n- two\n- three\n',
    );
    assert.equal(first.thinnerThanPrev, false);
    assert.ok(!existsSync(`${resumeSidecarPath(root, 'slug')}.prev`));

    // Thinner overwrite: 1 bullet < 3 → flagged + .prev holds the prior.
    const second = await writeResumeSidecar(storage, root, 'slug', '- only one\n');
    assert.equal(second.thinnerThanPrev, true);
    const prev = readFileSync(`${resumeSidecarPath(root, 'slug')}.prev`, 'utf8');
    assert.equal(prev, '- one\n- two\n- three\n');
    assert.equal(await readResumeSidecar(storage, root, 'slug'), '- only one\n');

    // Richer overwrite: 2 bullets > 1 → not thinner.
    const third = await writeResumeSidecar(storage, root, 'slug', '- a\n- b\n');
    assert.equal(third.thinnerThanPrev, false);
  });

  it('dirtyByMtime: true when a project file is newer than openedAt', async () => {
    const openedAt = '2026-06-19T10:00:00.000Z';
    const projectDir = join(root, 'projects', 'active', 'slug');
    mkdirSync(projectDir, { recursive: true });
    const file = join(projectDir, 'README.md');
    writeFileSync(file, '# Slug\n', 'utf8');

    // Pin mtime AFTER openedAt → dirty.
    const newer = new Date('2026-06-19T11:00:00.000Z');
    utimesSync(file, newer, newer);
    assert.equal(await dirtyByMtime(storage, root, 'slug', openedAt), true);

    // Pin mtime BEFORE openedAt → clean.
    const older = new Date('2026-06-19T09:00:00.000Z');
    utimesSync(file, older, older);
    assert.equal(await dirtyByMtime(storage, root, 'slug', openedAt), false);
  });

  it('dirtyByMtime: detects a newer resume sidecar even with no project dir', async () => {
    const openedAt = '2026-06-19T10:00:00.000Z';
    mkdirSync(join(root, '.arete', 'sessions'), { recursive: true });
    const sidecar = resumeSidecarPath(root, 'slug');
    writeFileSync(sidecar, '- note\n', 'utf8');
    const newer = new Date('2026-06-19T11:00:00.000Z');
    utimesSync(sidecar, newer, newer);
    assert.equal(await dirtyByMtime(storage, root, 'slug', openedAt), true);
  });

  it('dirtyByMtime: false on a bad openedAt timestamp', async () => {
    assert.equal(await dirtyByMtime(storage, root, 'slug', 'not-a-date'), false);
  });
});
