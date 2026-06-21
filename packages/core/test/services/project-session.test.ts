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
  statuslineSegment,
  handleSessionStart,
  GREETING_RECENCY_DAYS,
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

describe('statuslineSegment (project-exit Increment B)', () => {
  let root: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `project-session-sl-${process.pid}-`));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('no marker → empty string', async () => {
    assert.equal(await statuslineSegment(storage, root), '');
  });

  it('clean marker → ▸ slug', async () => {
    await writeActiveProjectMarker(storage, root, {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt: '2026-06-19T10:00:00.000Z',
      dirty: false,
    });
    assert.equal(await statuslineSegment(storage, root), '▸ glance-2-mvp');
  });

  it('dirty-bit marker → ▸ slug · unsaved', async () => {
    await writeActiveProjectMarker(storage, root, {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt: '2026-06-19T10:00:00.000Z',
      dirty: true,
    });
    assert.equal(await statuslineSegment(storage, root), '▸ glance-2-mvp · unsaved');
  });

  it('C1: clean bit but a project file newer than openedAt → ▸ slug · unsaved', async () => {
    const openedAt = '2026-06-19T10:00:00.000Z';
    await writeActiveProjectMarker(storage, root, {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt,
      dirty: false,
    });
    const projectDir = join(root, 'projects', 'active', 'glance-2-mvp');
    mkdirSync(projectDir, { recursive: true });
    const file = join(projectDir, 'README.md');
    writeFileSync(file, '# Glance 2 MVP\n', 'utf8');
    const newer = new Date('2026-06-19T11:00:00.000Z');
    utimesSync(file, newer, newer);
    assert.equal(await statuslineSegment(storage, root), '▸ glance-2-mvp · unsaved');
  });
});

describe('handleSessionStart (project-exit Increment B)', () => {
  let root: string;
  const storage = new FileStorageAdapter();

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `project-session-ss-${process.pid}-`));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const sessionsDir = (): string => join(root, '.arete', 'sessions');
  const lastGreetingPath = (): string => join(sessionsDir(), '.last-greeting');
  const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

  // Seed a project README + resume sidecar; pin the README mtime.
  function seedProjectWithSidecar(slug: string, readmeMtime: Date): void {
    const projectDir = join(root, 'projects', 'active', slug);
    mkdirSync(projectDir, { recursive: true });
    const readme = join(projectDir, 'README.md');
    writeFileSync(readme, `# ${slug}\n`, 'utf8');
    utimesSync(readme, readmeMtime, readmeMtime);
    mkdirSync(sessionsDir(), { recursive: true });
    writeFileSync(resumeSidecarPath(root, slug), '- left off\n', 'utf8');
  }

  it('startup + stale marker whose project file is newer than openedAt → wiped + notice', async () => {
    const openedAt = '2026-06-19T10:00:00.000Z';
    await writeActiveProjectMarker(storage, root, {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt,
      dirty: false,
    });
    const projectDir = join(root, 'projects', 'active', 'glance-2-mvp');
    mkdirSync(projectDir, { recursive: true });
    const file = join(projectDir, 'README.md');
    writeFileSync(file, '# Glance 2 MVP\n', 'utf8');
    const newer = new Date('2026-06-19T11:00:00.000Z');
    utimesSync(file, newer, newer);

    const result = await handleSessionStart(storage, root, {
      source: 'startup',
      now: new Date('2026-06-19T12:00:00.000Z'),
    });
    assert.equal(result.wipedMarker, true);
    assert.ok(result.notice);
    assert.ok(/glance-2-mvp/.test(result.notice!));
    assert.equal(await readActiveProjectMarker(storage, root), undefined);
  });

  it('resume + marker present → no wipe, no notice', async () => {
    await writeActiveProjectMarker(storage, root, {
      slug: 'glance-2-mvp',
      name: 'Glance 2 MVP',
      openedAt: '2026-06-19T10:00:00.000Z',
      dirty: true,
    });
    const result = await handleSessionStart(storage, root, {
      source: 'resume',
      now: new Date('2026-06-19T12:00:00.000Z'),
    });
    assert.equal(result.wipedMarker, false);
    assert.equal(result.notice, null);
    // Marker untouched.
    assert.ok(await readActiveProjectMarker(storage, root));
  });

  it('greeting once/day: already-stamped .last-greeting → greeting null', async () => {
    const now = new Date('2026-06-19T12:00:00.000Z');
    seedProjectWithSidecar('glance-2-mvp', now);
    mkdirSync(sessionsDir(), { recursive: true });
    writeFileSync(lastGreetingPath(), isoDay(now), 'utf8');

    const result = await handleSessionStart(storage, root, { source: 'startup', now });
    assert.equal(result.greeting, null);
  });

  it('greeting: recent sidecar + no stamp → greeting emitted AND .last-greeting stamped', async () => {
    const now = new Date('2026-06-19T12:00:00.000Z');
    seedProjectWithSidecar('glance-2-mvp', now);

    const result = await handleSessionStart(storage, root, { source: 'startup', now });
    assert.ok(result.greeting);
    assert.ok(/\/project glance-2-mvp/.test(result.greeting!));
    assert.equal(readFileSync(lastGreetingPath(), 'utf8').trim(), isoDay(now));
  });

  it('H1: sidecar present but README backdated > 14 days → greeting null (no stamp)', async () => {
    const now = new Date('2026-06-19T12:00:00.000Z');
    const stale = new Date(now.getTime() - (GREETING_RECENCY_DAYS + 1) * 24 * 60 * 60 * 1000);
    seedProjectWithSidecar('glance-2-mvp', stale);

    const result = await handleSessionStart(storage, root, { source: 'startup', now });
    assert.equal(result.greeting, null);
    assert.equal(existsSync(lastGreetingPath()), false, 'no stamp when no candidate');
  });

  it('clear + recent sidecar → greeting null (gating: greeting is startup-only)', async () => {
    const now = new Date('2026-06-19T12:00:00.000Z');
    seedProjectWithSidecar('glance-2-mvp', now);

    const result = await handleSessionStart(storage, root, { source: 'clear', now });
    assert.equal(result.greeting, null);
  });
});
