/**
 * Tests for CommitmentsService.
 *
 * Uses a mock StorageAdapter — no filesystem access.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { Commitment, CommitmentsFile, CommitmentDirection } from '../../src/models/index.js';
import { CommitmentsService } from '../../src/services/commitments.js';
import type { PersonActionItem } from '../../src/services/person-signals.js';

// ---------------------------------------------------------------------------
// Mock StorageAdapter
// ---------------------------------------------------------------------------

type MockStore = Map<string, string>;

function createMockStorage(initial: MockStore = new Map()): StorageAdapter {
  const store: MockStore = initial;
  return {
    async read(path: string): Promise<string | null> {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string): Promise<void> {
      store.set(path, content);
    },
    async exists(path: string): Promise<boolean> {
      return store.has(path);
    },
    async delete(path: string): Promise<void> {
      store.delete(path);
    },
    async list(): Promise<string[]> {
      return [];
    },
    async listSubdirectories(): Promise<string[]> {
      return [];
    },
    async mkdir(): Promise<void> {},
    async getModified(): Promise<Date | null> {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = '/workspace';
const COMMITMENTS_PATH = join(WORKSPACE_ROOT, '.arete/commitments.json');

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: 'a'.repeat(64),
    text: 'Send the slides',
    direction: 'i_owe_them',
    personSlug: 'alice',
    personName: 'Alice Smith',
    source: 'meeting-2026-01-15.md',
    date: '2026-01-15',
    status: 'open',
    resolvedAt: null,
    ...overrides,
  };
}

function makeFile(commitments: Commitment[]): string {
  const file: CommitmentsFile = { commitments };
  return JSON.stringify(file, null, 2);
}

function computeHash(text: string, personSlug: string, direction: CommitmentDirection): string {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}${personSlug}${direction}`)
    .digest('hex');
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeStorage(commitments: Commitment[] = []): StorageAdapter {
  const store = new Map<string, string>();
  if (commitments.length > 0) {
    store.set(COMMITMENTS_PATH, makeFile(commitments));
  }
  return createMockStorage(store);
}

// ---------------------------------------------------------------------------
// listOpen()
// ---------------------------------------------------------------------------

describe('CommitmentsService.listOpen()', () => {
  it('returns all open commitments when no filter', async () => {
    const open1 = makeCommitment({ id: 'a'.repeat(64), text: 'Send slides' });
    const open2 = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Provide feedback',
      direction: 'they_owe_me',
    });
    const resolved = makeCommitment({
      id: 'c'.repeat(64),
      text: 'Done already',
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });

    const svc = new CommitmentsService(makeStorage([open1, open2, resolved]), WORKSPACE_ROOT);
    const result = await svc.listOpen();

    assert.equal(result.length, 2);
    assert.ok(result.every((c) => c.status === 'open'));
  });

  it('returns empty array when no commitments file', async () => {
    const svc = new CommitmentsService(createMockStorage(), WORKSPACE_ROOT);
    const result = await svc.listOpen();
    assert.deepEqual(result, []);
  });

  it('filters by direction', async () => {
    const iOweThem = makeCommitment({ id: 'a'.repeat(64), direction: 'i_owe_them' });
    const theyOweMe = makeCommitment({ id: 'b'.repeat(64), direction: 'they_owe_me' });

    const svc = new CommitmentsService(makeStorage([iOweThem, theyOweMe]), WORKSPACE_ROOT);

    const iOweResult = await svc.listOpen({ direction: 'i_owe_them' });
    assert.equal(iOweResult.length, 1);
    assert.equal(iOweResult[0].direction, 'i_owe_them');

    const theyOweResult = await svc.listOpen({ direction: 'they_owe_me' });
    assert.equal(theyOweResult.length, 1);
    assert.equal(theyOweResult[0].direction, 'they_owe_me');
  });

  it('filters by personSlugs', async () => {
    const alice = makeCommitment({ id: 'a'.repeat(64), personSlug: 'alice' });
    const bob = makeCommitment({ id: 'b'.repeat(64), personSlug: 'bob' });
    const carol = makeCommitment({ id: 'c'.repeat(64), personSlug: 'carol' });

    const svc = new CommitmentsService(makeStorage([alice, bob, carol]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ personSlugs: ['alice', 'carol'] });
    assert.equal(result.length, 2);
    assert.ok(result.every((c) => c.personSlug === 'alice' || c.personSlug === 'carol'));
  });

  it('returns empty array when personSlugs matches nothing', async () => {
    const alice = makeCommitment({ id: 'a'.repeat(64), personSlug: 'alice' });
    const svc = new CommitmentsService(makeStorage([alice]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ personSlugs: ['nobody'] });
    assert.deepEqual(result, []);
  });

  it('filters by direction AND personSlugs together', async () => {
    const items: Commitment[] = [
      makeCommitment({ id: 'a'.repeat(64), personSlug: 'alice', direction: 'i_owe_them' }),
      makeCommitment({ id: 'b'.repeat(64), personSlug: 'alice', direction: 'they_owe_me' }),
      makeCommitment({ id: 'c'.repeat(64), personSlug: 'bob', direction: 'i_owe_them' }),
    ];

    const svc = new CommitmentsService(makeStorage(items), WORKSPACE_ROOT);
    const result = await svc.listOpen({ direction: 'i_owe_them', personSlugs: ['alice'] });
    assert.equal(result.length, 1);
    assert.equal(result[0].personSlug, 'alice');
    assert.equal(result[0].direction, 'i_owe_them');
  });
});

// ---------------------------------------------------------------------------
// listForPerson()
// ---------------------------------------------------------------------------

describe('CommitmentsService.listForPerson()', () => {
  it('delegates to listOpen with the given personSlug', async () => {
    const alice = makeCommitment({ id: 'a'.repeat(64), personSlug: 'alice' });
    const bob = makeCommitment({ id: 'b'.repeat(64), personSlug: 'bob' });
    const resolvedAlice = makeCommitment({
      id: 'c'.repeat(64),
      personSlug: 'alice',
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });

    const svc = new CommitmentsService(makeStorage([alice, bob, resolvedAlice]), WORKSPACE_ROOT);
    const result = await svc.listForPerson('alice');

    assert.equal(result.length, 1);
    assert.equal(result[0].personSlug, 'alice');
    assert.equal(result[0].status, 'open');
  });

  it('returns empty array for unknown person', async () => {
    const alice = makeCommitment({ id: 'a'.repeat(64), personSlug: 'alice' });
    const svc = new CommitmentsService(makeStorage([alice]), WORKSPACE_ROOT);
    const result = await svc.listForPerson('nobody');
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// resolve()
// ---------------------------------------------------------------------------

describe('CommitmentsService.resolve()', () => {
  it('marks a commitment resolved with resolvedAt timestamp', async () => {
    const c = makeCommitment({ id: 'abc123' + 'x'.repeat(58) });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const before = Date.now();
    const result = await svc.resolve(c.id);
    const after = Date.now();

    assert.equal(result.status, 'resolved');
    assert.ok(result.resolvedAt !== null);
    const resolvedTime = new Date(result.resolvedAt!).getTime();
    assert.ok(resolvedTime >= before && resolvedTime <= after);
  });

  it('default status is resolved', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);
    const result = await svc.resolve(c.id);
    assert.equal(result.status, 'resolved');
  });

  it('accepts explicit dropped status', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);
    const result = await svc.resolve(c.id, 'dropped');
    assert.equal(result.status, 'dropped');
    assert.ok(result.resolvedAt !== null);
  });

  it('matches by full 64-char hash', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);
    const result = await svc.resolve('a'.repeat(64));
    assert.equal(result.id, 'a'.repeat(64));
    assert.equal(result.status, 'resolved');
  });

  it('matches by 8-char prefix', async () => {
    const c = makeCommitment({ id: 'deadbeef' + 'f'.repeat(56) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);
    const result = await svc.resolve('deadbeef');
    assert.equal(result.status, 'resolved');
  });

  it('throws error when no commitment matches', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    await assert.rejects(
      () => svc.resolve('00000000'),
      /no commitment found/i,
    );
  });

  it('throws error when prefix matches multiple commitments', async () => {
    const c1 = makeCommitment({ id: 'abcd1234' + 'a'.repeat(56) });
    const c2 = makeCommitment({ id: 'abcd1234' + 'b'.repeat(56) });
    const svc = new CommitmentsService(makeStorage([c1, c2]), WORKSPACE_ROOT);

    await assert.rejects(
      () => svc.resolve('abcd1234'),
      /ambiguous/i,
    );
  });

  it('persists the resolved status', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64) });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.resolve(c.id);

    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments[0].status, 'resolved');
    assert.ok(parsed.commitments[0].resolvedAt !== null);
  });
});

// ---------------------------------------------------------------------------
// bulkResolve()
// ---------------------------------------------------------------------------

describe('CommitmentsService.bulkResolve()', () => {
  it('resolves multiple commitments and returns them all', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'Item A' });
    const c2 = makeCommitment({ id: 'b'.repeat(64), text: 'Item B' });
    const c3 = makeCommitment({ id: 'c'.repeat(64), text: 'Item C' });

    const svc = new CommitmentsService(makeStorage([c1, c2, c3]), WORKSPACE_ROOT);
    const results = await svc.bulkResolve([c1.id, c3.id]);

    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.status === 'resolved'));
    const texts = results.map((r) => r.text);
    assert.ok(texts.includes('Item A'));
    assert.ok(texts.includes('Item C'));
  });

  it('accepts explicit dropped status', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64) });
    const c2 = makeCommitment({ id: 'b'.repeat(64) });

    const svc = new CommitmentsService(makeStorage([c1, c2]), WORKSPACE_ROOT);
    const results = await svc.bulkResolve([c1.id, c2.id], 'dropped');

    assert.ok(results.every((r) => r.status === 'dropped'));
  });

  it('returns empty array for empty ids list', async () => {
    const svc = new CommitmentsService(createMockStorage(), WORKSPACE_ROOT);
    const results = await svc.bulkResolve([]);
    assert.deepEqual(results, []);
  });
});

// ---------------------------------------------------------------------------
// sync()
// ---------------------------------------------------------------------------

describe('CommitmentsService.sync()', () => {
  it('adds new items from freshItems', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const hash = computeHash('Send report', 'alice', 'i_owe_them');
    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].text, 'Send report');
    assert.equal(parsed.commitments[0].personSlug, 'alice');
    assert.equal(parsed.commitments[0].status, 'open');
    assert.equal(parsed.commitments[0].resolvedAt, null);
  });

  it('uses slug as personName fallback when no nameMap provided', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash: computeHash('Send report', 'alice', 'i_owe_them'),
      stale: false,
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].personName, 'alice', 'personName should fall back to slug');
  });

  it('uses nameMap to store real personName', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash: computeHash('Send report', 'alice', 'i_owe_them'),
      stale: false,
    };

    const nameMap = new Map([['alice', 'Alice Smith']]);
    await svc.sync(new Map([['alice', [item]]]), nameMap);

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].personName, 'Alice Smith', 'personName should use nameMap value');
  });

  it('falls back to slug when nameMap does not contain the slug', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash: computeHash('Send report', 'alice', 'i_owe_them'),
      stale: false,
    };

    // nameMap has bob but not alice
    const nameMap = new Map([['bob', 'Bob Jones']]);
    await svc.sync(new Map([['alice', [item]]]), nameMap);

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].personName, 'alice', 'personName should fall back to slug when not in nameMap');
  });

  it('preserves existing open items (no duplicate)', async () => {
    const hash = computeHash('Send report', 'alice', 'i_owe_them');
    const existing = makeCommitment({ id: hash, text: 'Send report', personSlug: 'alice' });
    const store = new Map([[COMMITMENTS_PATH, makeFile([existing])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    // Still just 1 — no duplicate
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].status, 'open');
  });

  it('does NOT reopen resolved items (idempotency)', async () => {
    const hash = computeHash('Send report', 'alice', 'i_owe_them');
    const resolved = makeCommitment({
      id: hash,
      text: 'Send report',
      personSlug: 'alice',
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([resolved])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    // Status must still be resolved — not reopened
    assert.equal(parsed.commitments[0].status, 'resolved');
    assert.ok(parsed.commitments[0].resolvedAt !== null);
  });

  it('deduplicates by hash within the same sync call', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const hash = computeHash('Send report', 'alice', 'i_owe_them');
    const item: PersonActionItem = {
      text: 'Send report',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
    };

    // Same item twice
    await svc.sync(new Map([['alice', [item, item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
  });

  it('handles empty freshItems map', async () => {
    const existing = makeCommitment({ id: 'a'.repeat(64) });
    const store = new Map([[COMMITMENTS_PATH, makeFile([existing])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    // Existing item preserved
    assert.equal(parsed.commitments.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

describe('CommitmentsService pruning', () => {
  it('prunes resolved items with resolvedAt older than 30 days on write', async () => {
    const old = makeCommitment({
      id: 'a'.repeat(64),
      status: 'resolved',
      resolvedAt: daysAgo(31),
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([old])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Trigger a write via resolve on a different item — or via sync
    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 0, 'Old resolved item should be pruned');
  });

  it('does NOT prune open items with null resolvedAt regardless of date', async () => {
    const open = makeCommitment({
      id: 'a'.repeat(64),
      status: 'open',
      resolvedAt: null,
      date: '2020-01-01', // Very old meeting date
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([open])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1, 'Open item must never be pruned');
  });

  it('does NOT prune resolved items with recent resolvedAt', async () => {
    const recent = makeCommitment({
      id: 'a'.repeat(64),
      status: 'resolved',
      resolvedAt: daysAgo(5), // Only 5 days ago
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([recent])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1, 'Recently resolved item must not be pruned');
  });

  it('does NOT prune item with old meeting date but recent resolvedAt (critical: date vs resolvedAt)', async () => {
    const c = makeCommitment({
      id: 'a'.repeat(64),
      status: 'resolved',
      date: '2020-01-01', // Meeting from 6 years ago
      resolvedAt: daysAgo(2), // Resolved 2 days ago
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(
      parsed.commitments.length,
      1,
      'Must use resolvedAt for pruning — not date. Old meeting date with recent resolvedAt must NOT be pruned.',
    );
  });

  it('prunes dropped items with old resolvedAt', async () => {
    const dropped = makeCommitment({
      id: 'a'.repeat(64),
      status: 'dropped',
      resolvedAt: daysAgo(45),
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([dropped])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.sync(new Map());

    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 0, 'Old dropped item should be pruned');
  });
});

// ---------------------------------------------------------------------------
// reconcile()
// ---------------------------------------------------------------------------

describe('CommitmentsService.reconcile()', () => {
  it('returns empty array for empty completedItems', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'Send slides' });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const result = await svc.reconcile([]);
    assert.deepEqual(result, []);
  });

  it('returns empty array when no open commitments', async () => {
    const resolved = makeCommitment({
      id: 'a'.repeat(64),
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
    const svc = new CommitmentsService(makeStorage([resolved]), WORKSPACE_ROOT);

    const result = await svc.reconcile([{ text: 'Send slides', source: 'meeting.md' }]);
    assert.deepEqual(result, []);
  });

  it('returns match above threshold (0.6)', async () => {
    // "send the report to alice" vs "send report to alice":
    //   A=['send','the','report','to','alice'], B=['send','report','to','alice']
    //   intersection=4, union=5 → jaccard=0.8 ≥ 0.6 ✓
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'send the report to alice' });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const result = await svc.reconcile([{ text: 'send report to alice', source: 'notes.md' }]);
    assert.ok(result.length >= 1);
    const match = result.find((r) => r.commitment.id === c.id);
    assert.ok(match !== undefined);
    assert.ok(match.confidence >= 0.6);
  });

  it('does NOT return match below threshold (< 0.6)', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'send the slides' });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    // Completely unrelated text
    const result = await svc.reconcile([{ text: 'schedule lunch meeting', source: 'notes.md' }]);
    assert.equal(result.length, 0);
  });

  it('returns multiple matches sorted by confidence descending', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'send slides' });
    const c2 = makeCommitment({ id: 'b'.repeat(64), text: 'send slides to alice' });
    const svc = new CommitmentsService(makeStorage([c1, c2]), WORKSPACE_ROOT);

    // "send slides" matches both; one will have higher overlap
    const result = await svc.reconcile([{ text: 'send slides', source: 'notes.md' }]);
    assert.ok(result.length >= 1);
    // Verify sorted descending
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].confidence >= result[i].confidence);
    }
  });

  it('never auto-resolves — only returns candidates', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'send slides' });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    await svc.reconcile([{ text: 'send slides', source: 'notes.md' }]);

    // Commitment must still be open
    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments[0].status, 'open');
    assert.equal(parsed.commitments[0].resolvedAt, null);
  });

  it('includes completedItem in each match result', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'send slides' });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const completedItem = { text: 'send slides', source: 'done.md' };
    const result = await svc.reconcile([completedItem]);

    assert.ok(result.length >= 1);
    assert.deepEqual(result[0].completedItem, completedItem);
  });
});
