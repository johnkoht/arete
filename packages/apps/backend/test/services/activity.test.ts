/**
 * Activity service tests.
 *
 * Tests writeActivityEvent (creates file, prepends, max 50) and
 * readActivityEvents (returns last N). Uses node:test + node:assert/strict.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeActivityEvent, readActivityEvents } from '../../src/services/activity.js';
import type { ActivityEvent } from '../../src/services/activity.js';

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: crypto.randomUUID(),
    type: 'meeting:processed',
    title: 'Meeting processed: test-meeting',
    detail: 'test-meeting',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('readActivityEvents — empty / missing file', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-activity-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when activity.json does not exist', async () => {
    const events = await readActivityEvents(tmpDir, 10);
    assert.ok(Array.isArray(events));
    assert.equal(events.length, 0);
  });
});

describe('writeActivityEvent — creates and prepends', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-activity-write-test-'));
    // No .arete dir — writeActivityEvent should create it
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates activity.json and writes the first event', async () => {
    const event = makeEvent({ id: 'evt-001', title: 'First event' });
    await writeActivityEvent(tmpDir, event);

    const events = await readActivityEvents(tmpDir, 10);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.id, 'evt-001');
    assert.equal(events[0]!.title, 'First event');
  });

  it('prepends new events (most recent first)', async () => {
    const second = makeEvent({ id: 'evt-002', title: 'Second event' });
    await writeActivityEvent(tmpDir, second);

    const events = await readActivityEvents(tmpDir, 10);
    assert.equal(events.length, 2);
    assert.equal(events[0]!.id, 'evt-002', 'most recent should be first');
    assert.equal(events[1]!.id, 'evt-001');
  });

  it('readActivityEvents respects limit', async () => {
    const third = makeEvent({ id: 'evt-003', title: 'Third event' });
    await writeActivityEvent(tmpDir, third);

    const events = await readActivityEvents(tmpDir, 2);
    assert.equal(events.length, 2);
    assert.equal(events[0]!.id, 'evt-003');
    assert.equal(events[1]!.id, 'evt-002');
  });
});

describe('writeActivityEvent — max 50 events', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-activity-max-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('keeps only the 50 most recent events', async () => {
    // Write 55 events
    for (let i = 1; i <= 55; i++) {
      await writeActivityEvent(tmpDir, makeEvent({ id: `evt-${i}`, title: `Event ${i}` }));
    }

    const events = await readActivityEvents(tmpDir, 100);
    assert.equal(events.length, 50, 'should cap at 50 events');
    // Most recent should be evt-55
    assert.equal(events[0]!.id, 'evt-55', 'most recent event should be first');
    // Oldest kept should be evt-6 (55 - 50 + 1 = 6)
    assert.equal(events[49]!.id, 'evt-6', 'evt-6 should be the oldest kept');
    // evt-1 through evt-5 should be pruned
    assert.ok(
      !events.some((e) => e.id === 'evt-1'),
      'evt-1 should have been pruned',
    );
  });
});

describe('ActivityEvent fields', () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'arete-activity-fields-test-'));
    await mkdir(join(tmpDir, '.arete'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('preserves all event fields', async () => {
    const event: ActivityEvent = {
      id: 'test-id',
      type: 'meeting:processed',
      title: 'Test title',
      detail: 'test-detail',
      timestamp: '2026-01-15T10:00:00.000Z',
    };
    await writeActivityEvent(tmpDir, event);

    const events = await readActivityEvents(tmpDir, 1);
    assert.equal(events.length, 1);
    const stored = events[0]!;
    assert.equal(stored.id, 'test-id');
    assert.equal(stored.type, 'meeting:processed');
    assert.equal(stored.title, 'Test title');
    assert.equal(stored.detail, 'test-detail');
    assert.equal(stored.timestamp, '2026-01-15T10:00:00.000Z');
  });

  it('works without optional detail field', async () => {
    const event: ActivityEvent = {
      id: 'no-detail',
      type: 'meeting:processed',
      title: 'No detail',
      timestamp: new Date().toISOString(),
    };
    await writeActivityEvent(tmpDir, event);

    const events = await readActivityEvents(tmpDir, 10);
    const stored = events.find((e) => e.id === 'no-detail');
    assert.ok(stored, 'event should be stored');
    assert.equal(stored.detail, undefined);
  });
});
