/**
 * Tests for commitment and relationship momentum services.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCommitmentMomentum, computeRelationshipMomentum } from '../../src/services/momentum.js';
import type { Commitment } from '../../src/models/index.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommitment(overrides: Partial<Commitment>): Commitment {
  return {
    id: 'abc123',
    text: 'Default action',
    direction: 'i_owe_them',
    personSlug: 'alice',
    personName: 'Alice Smith',
    source: 'meeting-2026-01-01.md',
    date: new Date().toISOString().slice(0, 10),
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function createMockStorage(files: Record<string, string>): StorageAdapter {
  const fileMap = new Map(Object.entries(files));
  return {
    async read(path: string): Promise<string | null> {
      return fileMap.get(path) ?? null;
    },
    async write(): Promise<void> {},
    async exists(path: string): Promise<boolean> {
      return fileMap.has(path);
    },
    async delete(): Promise<void> {},
    async list(dir: string, options?: { extensions?: string[] }): Promise<string[]> {
      const ext = options?.extensions?.[0] ?? '.md';
      return [...fileMap.keys()].filter((k) => k.startsWith(dir) && k.endsWith(ext));
    },
    async listSubdirectories(): Promise<string[]> { return []; },
    async mkdir(): Promise<void> {},
    async getModified(): Promise<Date | null> { return null; },
  };
}

// ---------------------------------------------------------------------------
// computeCommitmentMomentum tests
// ---------------------------------------------------------------------------

describe('computeCommitmentMomentum', () => {
  const ref = new Date('2026-03-05');

  it('returns empty buckets when no commitments', () => {
    const result = computeCommitmentMomentum([], ref);
    assert.deepEqual(result.hot, []);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.critical, []);
  });

  it('skips non-open commitments', () => {
    const resolved = makeCommitment({
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      date: '2026-03-01',
    });
    const result = computeCommitmentMomentum([resolved], ref);
    assert.equal(result.hot.length, 0);
    assert.equal(result.stale.length, 0);
    assert.equal(result.critical.length, 0);
  });

  it('puts a 3-day-old commitment in hot', () => {
    const c = makeCommitment({ date: '2026-03-02' }); // 3 days before ref
    const result = computeCommitmentMomentum([c], ref);
    assert.equal(result.hot.length, 1);
    assert.equal(result.stale.length, 0);
    assert.equal(result.critical.length, 0);
    assert.equal(result.hot[0].commitment.id, c.id);
    assert.equal(result.hot[0].ageDays, 3);
  });

  it('puts a 15-day-old commitment in stale', () => {
    const c = makeCommitment({ date: '2026-02-18' }); // 15 days before ref
    const result = computeCommitmentMomentum([c], ref);
    assert.equal(result.stale.length, 1);
    assert.equal(result.hot.length, 0);
    assert.equal(result.critical.length, 0);
  });

  it('puts a 45-day-old commitment in critical', () => {
    const c = makeCommitment({ date: '2026-01-19' }); // 45 days before ref
    const result = computeCommitmentMomentum([c], ref);
    assert.equal(result.critical.length, 1);
    assert.equal(result.hot.length, 0);
    assert.equal(result.stale.length, 0);
    assert.equal(result.critical[0].ageDays, 45);
  });

  it('buckets multiple commitments correctly', () => {
    const commitments: Commitment[] = [
      makeCommitment({ id: 'hot1', date: '2026-03-03' }),    // 2 days = hot
      makeCommitment({ id: 'stale1', date: '2026-02-15' }),  // 18 days = stale
      makeCommitment({ id: 'crit1', date: '2026-01-01' }),   // 63 days = critical
      makeCommitment({ id: 'crit2', date: '2026-01-15' }),   // 49 days = critical
    ];
    const result = computeCommitmentMomentum(commitments, ref);
    assert.equal(result.hot.length, 1);
    assert.equal(result.stale.length, 1);
    assert.equal(result.critical.length, 2);
  });

  it('sorts each bucket by age descending', () => {
    const commitments: Commitment[] = [
      makeCommitment({ id: 'newer', date: '2026-01-20' }), // 44 days = critical
      makeCommitment({ id: 'older', date: '2026-01-01' }), // 63 days = critical
    ];
    const result = computeCommitmentMomentum(commitments, ref);
    assert.equal(result.critical.length, 2);
    assert.equal(result.critical[0].commitment.id, 'older'); // older = more days = first
  });

  it('treats commitments with invalid date as stale', () => {
    const c = makeCommitment({ date: 'not-a-date' });
    const result = computeCommitmentMomentum([c], ref);
    assert.equal(result.stale.length, 1);
    assert.equal(result.stale[0].ageDays, -1);
  });
});

// ---------------------------------------------------------------------------
// computeRelationshipMomentum tests
// ---------------------------------------------------------------------------

describe('computeRelationshipMomentum', () => {
  const meetingsDir = '/workspace/resources/meetings';
  const peopleDir = '/workspace/people';
  const ref = new Date('2026-03-05');

  function makeMeetingFile(slug: string, date: string, attendeeIds: string[]): string {
    return `---
title: Meeting ${slug}
date: ${date}
status: processed
attendee_ids:
${attendeeIds.map((a) => `  - ${a}`).join('\n')}
---

## Summary
A meeting summary.
`;
  }

  it('returns empty buckets when no meetings', async () => {
    const storage = createMockStorage({});
    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    assert.deepEqual(result.active, []);
    assert.deepEqual(result.cooling, []);
    assert.deepEqual(result.stale, []);
  });

  it('classifies recent meeting as active (< 14 days)', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 7);
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/meeting1.md`]: makeMeetingFile('meeting1', dateStr, ['alice', 'bob']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const allPeople = [...result.active, ...result.cooling, ...result.stale];
    const alice = allPeople.find((r) => r.personSlug === 'alice');
    assert.ok(alice, 'Expected alice in results');
    assert.equal(alice.bucket, 'active');
  });

  it('classifies 20-day-old meeting as cooling', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 20);
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/meeting1.md`]: makeMeetingFile('meeting1', dateStr, ['sarah', 'charlie']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const allPeople = [...result.active, ...result.cooling, ...result.stale];
    const sarah = allPeople.find((r) => r.personSlug === 'sarah');
    assert.ok(sarah, 'Expected sarah in results');
    assert.equal(sarah.bucket, 'cooling');
  });

  it('classifies 45-day-old meeting as stale', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 45);
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/meeting1.md`]: makeMeetingFile('meeting1', dateStr, ['dana', 'evan']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const allPeople = [...result.active, ...result.cooling, ...result.stale];
    const dana = allPeople.find((r) => r.personSlug === 'dana');
    assert.ok(dana, 'Expected dana in results');
    assert.equal(dana.bucket, 'stale');
  });

  it('uses the most recent meeting date for a person with multiple meetings', async () => {
    const recent = new Date(ref);
    recent.setDate(recent.getDate() - 5);
    const old = new Date(ref);
    old.setDate(old.getDate() - 45);

    const storage = createMockStorage({
      [`${meetingsDir}/m1.md`]: makeMeetingFile('m1', recent.toISOString().slice(0, 10), ['alice']),
      [`${meetingsDir}/m2.md`]: makeMeetingFile('m2', old.toISOString().slice(0, 10), ['alice']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const alice = result.active.find((r) => r.personSlug === 'alice');
    assert.ok(alice, 'Alice should be in active (recent meeting)');
    assert.equal(alice.meetingCount, 2);
  });

  it('filters by personSlug when specified', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 5);
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/m1.md`]: makeMeetingFile('m1', dateStr, ['alice', 'bob']),
      [`${meetingsDir}/m2.md`]: makeMeetingFile('m2', dateStr, ['carol']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, {
      referenceDate: ref,
      personSlug: 'alice',
    });

    const allPeople = [...result.active, ...result.cooling, ...result.stale];
    assert.ok(allPeople.every((r) => r.personSlug === 'alice'), 'Should only include alice');
  });

  it('excludes meetings outside the lookback window', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 100); // outside 90-day default
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/old.md`]: makeMeetingFile('old', dateStr, ['alice']),
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const allPeople = [...result.active, ...result.cooling, ...result.stale];
    const alice = allPeople.find((r) => r.personSlug === 'alice');
    assert.equal(alice, undefined, 'Alice should not appear (outside lookback window)');
  });

  it('resolves person name from profile file if available', async () => {
    const d = new Date(ref);
    d.setDate(d.getDate() - 5);
    const dateStr = d.toISOString().slice(0, 10);

    const storage = createMockStorage({
      [`${meetingsDir}/m1.md`]: makeMeetingFile('m1', dateStr, ['alice-smith']),
      [`${peopleDir}/internal/alice-smith.md`]: `---
name: Alice Smith
role: Engineering
---

# Alice Smith

Engineer at Acme.
`,
    });

    const result = await computeRelationshipMomentum(meetingsDir, peopleDir, storage, { referenceDate: ref });
    const alice = result.active.find((r) => r.personSlug === 'alice-smith');
    assert.ok(alice, 'Expected alice-smith in results');
    assert.equal(alice.personName, 'Alice Smith');
  });
});
