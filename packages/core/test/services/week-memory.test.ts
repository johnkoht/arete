/**
 * Week-memory store tests (weekly-working-memory plan, Step 1).
 *
 * Real fs + FileStorageAdapter (no mocks), mirroring the core service test
 * convention. Covers: add writes + returns id; list active excludes resolved;
 * resolve flips status WITHOUT deleting; dedup no-op on identical
 * type+statement; read on absent file returns []; and the Risk-2 archive
 * idempotency (current-week no-op, prior-week move+reset) via an injected clock.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStorageAdapter } from '../../src/storage/file.js';
import {
  readWeekMemory,
  listWeekMemory,
  addWeekMemoryEntry,
  resolveWeekMemory,
  archiveWeekMemory,
  WEEK_MEMORY_FILE,
  WEEK_MEMORY_ARCHIVE_DIR,
  type Clock,
} from '../../src/services/week-memory.js';
import { isoWeekStamp } from '../../src/utils/dates.js';

function fixedClock(iso: string): Clock {
  return () => new Date(iso);
}

describe('week-memory store', () => {
  let root: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'arete-week-memory-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('readWeekMemory on an absent file returns [] (never throws)', async () => {
    const entries = await readWeekMemory(storage, root);
    assert.deepEqual(entries, []);
  });

  it('addWeekMemoryEntry writes an entry and returns a generated id + week stamp', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z');
    const result = await addWeekMemoryEntry(
      storage,
      root,
      {
        type: 'framing-override',
        statement: 'Lindsay email is NOT overdue — proactive Wednesday update',
        why: 'John: it is a proactive update, not a manager-facing deadline',
        suppresses: '1ceb15cc',
      },
      clock,
    );

    assert.equal(result.deduped, false);
    assert.match(result.entry.id, /^[0-9a-f]{8}$/);
    assert.equal(result.entry.status, 'active');
    assert.equal(result.entry.type, 'framing-override');
    assert.equal(result.entry.suppresses, '1ceb15cc');
    assert.equal(result.entry.created, '2026-06-22T12:00:00.000Z');
    assert.equal(result.entry.week, isoWeekStamp(new Date('2026-06-22T12:00:00.000Z')));

    // Persisted and re-readable.
    const all = await readWeekMemory(storage, root);
    assert.equal(all.length, 1);
    assert.equal(all[0]!.id, result.entry.id);
    assert.equal(all[0]!.suppresses, '1ceb15cc');
  });

  it('list active excludes resolved entries', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z');
    const a = await addWeekMemoryEntry(
      storage,
      root,
      { type: 'deprioritization', statement: 'Analytics in Josiah court', why: 'OK past PTO' },
      clock,
    );
    await addWeekMemoryEntry(
      storage,
      root,
      { type: 'week-constraint', statement: '3-day pre-PTO sprint', why: 'OOO 6/25-30' },
      clock,
    );

    await resolveWeekMemory(storage, root, a.entry.id, clock);

    const active = await listWeekMemory(storage, root, { active: true });
    assert.equal(active.length, 1);
    assert.equal(active[0]!.type, 'week-constraint');

    const resolved = await listWeekMemory(storage, root, { active: false });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0]!.id, a.entry.id);

    const all = await listWeekMemory(storage, root);
    assert.equal(all.length, 2);
  });

  it('resolve flips status to resolved WITHOUT deleting (retire, not erase)', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z');
    const a = await addWeekMemoryEntry(
      storage,
      root,
      { type: 'deprioritization', statement: 'Liability PRD punts to return', why: 'after PTO' },
      clock,
    );

    const res = await resolveWeekMemory(storage, root, a.entry.id, clock);
    assert.equal(res.outcome, 'resolved');
    assert.equal(res.entry!.status, 'resolved');

    // Still present in the store, just resolved.
    const all = await readWeekMemory(storage, root);
    assert.equal(all.length, 1);
    assert.equal(all[0]!.status, 'resolved');

    // Resolving again is a no-op with a clear outcome.
    const again = await resolveWeekMemory(storage, root, a.entry.id, clock);
    assert.equal(again.outcome, 'already');

    // Unknown id is a clear no-op.
    const unknown = await resolveWeekMemory(storage, root, 'deadbeef', clock);
    assert.equal(unknown.outcome, 'unknown');
    assert.equal(unknown.entry, null);
  });

  it('resolve accepts an 8-char prefix', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z');
    const a = await addWeekMemoryEntry(
      storage,
      root,
      { type: 'week-constraint', statement: 'Prefix resolve test', why: 'x' },
      clock,
    );
    const res = await resolveWeekMemory(storage, root, a.entry.id.slice(0, 8), clock);
    assert.equal(res.outcome, 'resolved');
  });

  it('dedup: identical active type+statement is a no-op returning the existing entry', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z');
    const first = await addWeekMemoryEntry(
      storage,
      root,
      { type: 'framing-override', statement: 'Lindsay email is NOT overdue', why: 'proactive' },
      clock,
    );
    // Same type+statement (whitespace/case insensitive), later clock.
    const second = await addWeekMemoryEntry(
      storage,
      root,
      {
        type: 'framing-override',
        statement: '  lindsay   EMAIL is not OVERDUE ',
        why: 'different why text',
      },
      fixedClock('2026-06-22T18:00:00.000Z'),
    );

    assert.equal(second.deduped, true);
    assert.equal(second.entry.id, first.entry.id);

    const all = await readWeekMemory(storage, root);
    assert.equal(all.length, 1);
  });

  it('archive is a NO-OP when the live file is stamped with the current week', async () => {
    const clock = fixedClock('2026-06-22T12:00:00.000Z'); // ISO 2026-W26
    await addWeekMemoryEntry(
      storage,
      root,
      { type: 'week-constraint', statement: 'current week entry', why: 'x' },
      clock,
    );

    const before = await readWeekMemory(storage, root);

    // Archive run within the SAME week — must not wipe active overrides.
    const result = await archiveWeekMemory(storage, root, clock);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'current-week');

    const after = await readWeekMemory(storage, root);
    assert.deepEqual(after, before);
    assert.equal(after.length, 1);
    // No archive file created.
    assert.equal(
      existsSync(join(root, WEEK_MEMORY_ARCHIVE_DIR)),
      false,
    );
  });

  it('archive moves a PRIOR-week file to the dated path and resets the live file', async () => {
    // Capture in week 2026-W25 (Mon 6/15).
    const captureClock = fixedClock('2026-06-15T12:00:00.000Z');
    const priorWeek = isoWeekStamp(new Date('2026-06-15T12:00:00.000Z'));
    await addWeekMemoryEntry(
      storage,
      root,
      { type: 'deprioritization', statement: 'prior week entry', why: 'x' },
      captureClock,
    );
    await addWeekMemoryEntry(
      storage,
      root,
      { type: 'week-constraint', statement: 'another prior entry', why: 'y' },
      captureClock,
    );

    // Archive run the NEXT week (Mon 6/22 = 2026-W26).
    const nextWeekClock = fixedClock('2026-06-22T09:00:00.000Z');
    const currentWeek = isoWeekStamp(new Date('2026-06-22T09:00:00.000Z'));
    assert.notEqual(priorWeek, currentWeek);

    const result = await archiveWeekMemory(storage, root, nextWeekClock);
    assert.equal(result.skipped, false);
    assert.equal(result.archivedWeek, priorWeek);
    assert.equal(result.movedCount, 2);

    const expectedArchive = join(
      root,
      WEEK_MEMORY_ARCHIVE_DIR,
      `week-memory-${priorWeek}.md`,
    );
    assert.equal(result.archivePath, expectedArchive);
    assert.equal(existsSync(expectedArchive), true);

    // Archive content carries both entries.
    const archived = await storage.read(expectedArchive);
    assert.match(archived!, /prior week entry/);
    assert.match(archived!, /another prior entry/);

    // Live file reset empty and re-stamped to the current week.
    const live = await readWeekMemory(storage, root);
    assert.deepEqual(live, []);
    const liveRaw = await storage.read(join(root, WEEK_MEMORY_FILE));
    assert.match(liveRaw!, new RegExp(`week: ['"]?${currentWeek}`));
  });

  it('archive on an absent/empty store is a skipped no-op', async () => {
    const result = await archiveWeekMemory(storage, root, fixedClock('2026-06-22T12:00:00.000Z'));
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'empty');
  });

  it('archive on a freshly-seeded (week: "") empty store skips, not archives a malformed path', async () => {
    // The install template seeds `week: ""` + `entries: []`. A blank week stamp
    // must NOT be treated as a prior week (which would write week-memory-.md).
    await storage.write(
      join(root, WEEK_MEMORY_FILE),
      '---\nweek: ""\nentries: []\n---\n\n# Week Memory\n',
    );
    const result = await archiveWeekMemory(storage, root, fixedClock('2026-06-22T12:00:00.000Z'));
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'empty');
    assert.equal(existsSync(join(root, WEEK_MEMORY_ARCHIVE_DIR, 'week-memory-.md')), false);
  });
});
