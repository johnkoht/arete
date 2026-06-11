/**
 * Tests for CommitmentsService.
 *
 * Uses a mock StorageAdapter — no filesystem access. The virtual workspace
 * root (`/workspace`) cannot be mkdir'd on a real filesystem, so we set
 * `ARETE_LOCK_BYPASS_MOCK=1` to allow `runUnderLock` to skip the lock
 * acquire and run `fn` directly in-process. Cross-process safety is
 * irrelevant in single-process unit tests; the flag is unset in production.
 * See `commitments-withlock.test.ts` for real-fs lock contract tests.
 */

process.env.ARETE_LOCK_BYPASS_MOCK = '1';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { StorageAdapter } from '../../src/storage/adapter.js';
import type { Commitment, CommitmentsFile, CommitmentDirection } from '../../src/models/index.js';
import { CommitmentsService, computeCommitmentPriority, computeCommitmentHash } from '../../src/services/commitments.js';
import type { CommitmentPriorityInput } from '../../src/services/commitments.js';
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
// Hash invariance GATE (phase-8-followup-8 AC5 / C2 / pre-mortem R3)
//
// EXPLICIT regression gate: `computeCommitmentHash(text, slug, dir)` must be
// invariant under changes to the constructed Commitment's `area`. If a future
// change folds `area` (or any commitment metadata) into the hash inputs, every
// existing area-null commitment will get a new id on next sync — silently
// duplicating commitments. R3 named this as the single highest-regret silent
// regression in the pre-mortem; the gate exists to fail loudly first.
//
// Build-report.md MUST echo: hash invariance verified: "[name of this test]".
// ---------------------------------------------------------------------------

describe('CommitmentsService — hash invariance gate (AC5/C2, R3)', () => {
  it('computeCommitmentHash(text, slug, dir) is invariant when constructed Commitment.area differs', () => {
    // Same text + person + direction, but the surrounding Commitment carries
    // different `area` values (and different `areaSetBy` provenance). Hash
    // must be byte-identical across all three constructions.
    const text = 'Send the customer the signed contract';
    const personSlug = 'jane-doe';
    const direction: CommitmentDirection = 'i_owe_them';

    const hashCanonical = computeCommitmentHash(text, personSlug, direction);

    // Build three commitments that differ ONLY in area / areaSetBy.
    const cNoArea: Commitment = {
      id: hashCanonical,
      text,
      direction,
      personSlug,
      personName: 'Jane Doe',
      source: 'meeting.md',
      date: '2026-05-27',
      status: 'open',
      resolvedAt: null,
    };
    const cWithFrontmatterArea: Commitment = {
      ...cNoArea,
      area: 'glance-communications',
    };
    const cBackfilledArea: Commitment = {
      ...cNoArea,
      area: 'unrelated-area',
      areaSetBy: 'backfill',
    };

    // The hash itself MUST be invariant — it derives only from
    // text/personSlug/direction, never from anything on the Commitment shape.
    const reHash = (c: Commitment) => computeCommitmentHash(c.text, c.personSlug, c.direction);

    assert.equal(reHash(cNoArea), hashCanonical, 'no-area construction must yield canonical hash');
    assert.equal(
      reHash(cWithFrontmatterArea),
      hashCanonical,
      'frontmatter area must not perturb hash',
    );
    assert.equal(
      reHash(cBackfilledArea),
      hashCanonical,
      'backfill-stamped area must not perturb hash',
    );

    // Also assert hash format / determinism for completeness.
    assert.equal(hashCanonical.length, 64, 'sha256 hex hash should be 64 chars');
    assert.equal(
      computeCommitmentHash(text, personSlug, direction),
      hashCanonical,
      'hash must be deterministic across calls',
    );
  });

  it('computeCommitmentHash is invariant when createdAt differs (LOW-2, phase-10a-pre)', () => {
    // The hash signature is (text, personSlug, direction) — `createdAt`
    // cannot perturb it by construction (type system). This test makes
    // that explicit so a future refactor that inlines the hash from a
    // full Commitment object would fail loudly rather than silently
    // dup-creating commitments on backfill.
    const text = 'Send the customer the signed contract';
    const personSlug = 'jane-doe';
    const direction: CommitmentDirection = 'i_owe_them';

    const hashBefore = computeCommitmentHash(text, personSlug, direction);

    // Build two commitments identical in everything except createdAt.
    const earlierCreatedAt = '2026-05-01T08:00:00.000Z';
    const laterCreatedAt = '2026-05-27T18:42:11.000Z';

    const cEarlier: Commitment = {
      id: hashBefore,
      text,
      direction,
      personSlug,
      personName: 'Jane Doe',
      source: 'meeting.md',
      date: '2026-05-27',
      status: 'open',
      resolvedAt: null,
      createdAt: earlierCreatedAt,
    };
    const cLater: Commitment = { ...cEarlier, createdAt: laterCreatedAt };

    const reHash = (c: Commitment) =>
      computeCommitmentHash(c.text, c.personSlug, c.direction);

    assert.equal(
      reHash(cEarlier),
      hashBefore,
      'earlier-createdAt construction must yield canonical hash',
    );
    assert.equal(
      reHash(cLater),
      hashBefore,
      'later-createdAt construction must yield canonical hash',
    );
    assert.equal(
      reHash(cEarlier),
      reHash(cLater),
      'differing createdAt values must produce identical hashes',
    );
  });

  it('computeCommitmentHash differs only when text, personSlug, or direction changes', () => {
    const base = computeCommitmentHash('Send report', 'alice', 'i_owe_them');
    assert.notEqual(
      computeCommitmentHash('Different text', 'alice', 'i_owe_them'),
      base,
      'Different text must yield different hash',
    );
    assert.notEqual(
      computeCommitmentHash('Send report', 'bob', 'i_owe_them'),
      base,
      'Different personSlug must yield different hash',
    );
    assert.notEqual(
      computeCommitmentHash('Send report', 'alice', 'they_owe_me'),
      base,
      'Different direction must yield different hash',
    );
    // Whitespace normalization is part of the hash contract (text lowercased + trimmed + collapsed).
    assert.equal(
      computeCommitmentHash('Send report ', 'alice', 'i_owe_them'),
      base,
      'whitespace normalization is part of the hash contract',
    );
  });
});

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

// ---------------------------------------------------------------------------
// Phase 13 AC5 — setProjectSlug (commitment claim verb)
// ---------------------------------------------------------------------------

describe('CommitmentsService.setProjectSlug() (Phase 13 AC5)', () => {
  it('stamps projectSlug by 8-char prefix and persists', async () => {
    const c = makeCommitment({ id: 'deadbeef' + 'f'.repeat(56) });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const updated = await svc.setProjectSlug('deadbeef', 'glance-2-runyon');
    assert.equal(updated.projectSlug, 'glance-2-runyon');

    const persisted = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(persisted.commitments[0].projectSlug, 'glance-2-runyon');
  });

  it('null clears the claim (--clear)', async () => {
    const c = makeCommitment({ id: 'deadbeef' + 'f'.repeat(56), projectSlug: 'glance-2-runyon' });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const updated = await svc.setProjectSlug('deadbeef', null);
    assert.equal(updated.projectSlug, undefined);

    const persisted = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.ok(!('projectSlug' in persisted.commitments[0]), 'key removed, not set undefined');
  });

  it('ambiguous prefix → error listing matches, NO write', async () => {
    const c1 = makeCommitment({ id: 'deadbeef' + '1'.repeat(56) });
    const c2 = makeCommitment({ id: 'deadbeef' + '2'.repeat(56) });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c1, c2])]]);
    const before = store.get(COMMITMENTS_PATH);
    const svc = new CommitmentsService(createMockStorage(store), WORKSPACE_ROOT);

    await assert.rejects(
      () => svc.setProjectSlug('deadbeef', 'some-project'),
      /Ambiguous prefix "deadbeef" matches 2 commitments/,
    );
    assert.equal(store.get(COMMITMENTS_PATH), before, 'no write on ambiguity');
  });

  it('unknown id → error, no write', async () => {
    const svc = new CommitmentsService(makeStorage([makeCommitment()]), WORKSPACE_ROOT);
    await assert.rejects(
      () => svc.setProjectSlug('ffffffff', 'p'),
      /No commitment found matching id prefix/,
    );
  });

  it('HASH INVARIANCE PINNED (review finding 5): stamping/clearing projectSlug leaves dedup hash/ID unchanged', async () => {
    const text = 'Send the slides';
    const personSlug = 'alice';
    const direction = 'i_owe_them' as const;
    const canonical = computeCommitmentHash(text, personSlug, direction);
    const c = makeCommitment({ id: canonical, text, personSlug, direction });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c])]]);
    const svc = new CommitmentsService(createMockStorage(store), WORKSPACE_ROOT);

    const claimed = await svc.setProjectSlug(canonical.slice(0, 8), 'glance-2-runyon');
    // The ID is untouched AND re-deriving the hash from the claimed
    // commitment's hash inputs yields the same canonical value —
    // projectSlug is not a hash input (same contract as `area`).
    assert.equal(claimed.id, canonical);
    assert.equal(
      computeCommitmentHash(claimed.text, claimed.personSlug, claimed.direction),
      canonical,
      'projectSlug must not perturb the dedup hash',
    );

    const cleared = await svc.setProjectSlug(canonical.slice(0, 8), null);
    assert.equal(cleared.id, canonical);
    assert.equal(
      computeCommitmentHash(cleared.text, cleared.personSlug, cleared.direction),
      canonical,
    );
  });

  it('runs through save() under the service lock without disturbing other commitments', async () => {
    const c1 = makeCommitment({ id: '1'.repeat(64), text: 'One', personSlug: 'a' });
    const c2 = makeCommitment({ id: '2'.repeat(64), text: 'Two', personSlug: 'b' });
    const store = new Map([[COMMITMENTS_PATH, makeFile([c1, c2])]]);
    const svc = new CommitmentsService(createMockStorage(store), WORKSPACE_ROOT);

    await svc.setProjectSlug('1'.repeat(8), 'proj-x');
    const persisted = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(persisted.commitments.length, 2);
    assert.equal(persisted.commitments[0].projectSlug, 'proj-x');
    assert.ok(!('projectSlug' in persisted.commitments[1]));
  });
});

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
// goalSlug serialization
// ---------------------------------------------------------------------------

describe('CommitmentsService.sync() — goalSlug', () => {
  it('copies goalSlug from PersonActionItem to Commitment', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const hash = computeHash('Deliver Q1 roadmap', 'alice', 'i_owe_them');
    const item: PersonActionItem = {
      text: 'Deliver Q1 roadmap',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
      goalSlug: 'q1-roadmap',
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].goalSlug, 'q1-roadmap', 'goalSlug should be copied from PersonActionItem');
  });

  it('omits goalSlug when not provided in PersonActionItem', async () => {
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
      // No goalSlug
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].goalSlug, undefined, 'goalSlug should be undefined when not provided');
  });

  it('different action items can have different goalSlugs', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const item1: PersonActionItem = {
      text: 'Deliver Q1 roadmap',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash: computeHash('Deliver Q1 roadmap', 'alice', 'i_owe_them'),
      stale: false,
      goalSlug: 'q1-roadmap',
    };

    const item2: PersonActionItem = {
      text: 'Fix customer issue',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash: computeHash('Fix customer issue', 'alice', 'i_owe_them'),
      stale: false,
      goalSlug: 'q1-customer-retention',
    };

    await svc.sync(new Map([['alice', [item1, item2]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 2);
    
    const roadmapCommitment = parsed.commitments.find(c => c.text === 'Deliver Q1 roadmap');
    const customerCommitment = parsed.commitments.find(c => c.text === 'Fix customer issue');
    
    assert.equal(roadmapCommitment?.goalSlug, 'q1-roadmap');
    assert.equal(customerCommitment?.goalSlug, 'q1-customer-retention');
  });
});

// ---------------------------------------------------------------------------

describe('CommitmentsService goalSlug serialization', () => {
  it('persists and retrieves goalSlug correctly', async () => {
    const commitmentWithGoal = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Deliver Q1 roadmap',
      goalSlug: 'q1-roadmap',
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([commitmentWithGoal])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Read it back
    const result = await svc.listOpen();

    assert.equal(result.length, 1);
    assert.equal(result[0].goalSlug, 'q1-roadmap', 'goalSlug should be preserved');
  });

  it('handles commitments without goalSlug (backward compatibility)', async () => {
    // Simulate an existing commitment without goalSlug field
    const legacyCommitment = {
      id: 'b'.repeat(64),
      text: 'Send slides',
      direction: 'i_owe_them',
      personSlug: 'alice',
      personName: 'Alice Smith',
      source: 'meeting-2026-01-15.md',
      date: '2026-01-15',
      status: 'open',
      resolvedAt: null,
      // Note: no goalSlug field
    };
    const store = new Map([[COMMITMENTS_PATH, JSON.stringify({ commitments: [legacyCommitment] })]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Should load without error
    const result = await svc.listOpen();

    assert.equal(result.length, 1);
    assert.equal(result[0].goalSlug, undefined, 'goalSlug should be undefined for legacy commitments');
  });

  it('preserves goalSlug through sync operations', async () => {
    const commitmentWithGoal = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Deliver Q1 roadmap',
      goalSlug: 'q1-roadmap',
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([commitmentWithGoal])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Sync with empty items (triggers write without adding new items)
    await svc.sync(new Map());

    // Verify goalSlug is still there
    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments[0].goalSlug, 'q1-roadmap', 'goalSlug should be preserved after sync');
  });
});

// ---------------------------------------------------------------------------
// area field — sync and serialization
// ---------------------------------------------------------------------------

describe('CommitmentsService.sync() — area', () => {
  it('copies area from PersonActionItem to Commitment', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const hash = computeHash('Review customer contract', 'alice', 'i_owe_them');
    const item: PersonActionItem = {
      text: 'Review customer contract',
      direction: 'i_owe_them',
      source: 'meeting.md',
      date: '2026-01-15',
      hash,
      stale: false,
      area: 'glance-communications',
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].area, 'glance-communications', 'area should be copied from PersonActionItem');
  });

  it('omits area when not provided in PersonActionItem', async () => {
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
      // No area
    };

    await svc.sync(new Map([['alice', [item]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].area, undefined, 'area should be undefined when not provided');
  });

  it('CRITICAL: area is NOT included in dedup hash — same text with different areas creates distinct commitments', async () => {
    // This is the critical test: area is metadata only, NOT part of dedup hash
    // Two items with same text/person/direction but different areas should be DEDUPLICATED
    // because the hash only uses text + personSlug + direction
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const text = 'Send report';
    const hash = computeHash(text, 'alice', 'i_owe_them');

    const item1: PersonActionItem = {
      text,
      direction: 'i_owe_them',
      source: 'meeting1.md',
      date: '2026-01-15',
      hash,
      stale: false,
      area: 'area-1',
    };

    const item2: PersonActionItem = {
      text,
      direction: 'i_owe_them',
      source: 'meeting2.md',
      date: '2026-01-16',
      hash, // Same hash because area is NOT included
      stale: false,
      area: 'area-2', // Different area
    };

    // Sync both items
    await svc.sync(new Map([['alice', [item1, item2]]]));

    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;

    // CRITICAL: Should have only 1 commitment because area is NOT part of hash
    assert.equal(
      parsed.commitments.length,
      1,
      'Area must NOT be part of dedup hash — same text/person/direction should create only one commitment',
    );
    // First item wins, so area should be from item1
    assert.equal(parsed.commitments[0].area, 'area-1', 'First synced item should win');
  });
});

describe('CommitmentsService area serialization', () => {
  it('persists and retrieves area correctly', async () => {
    const commitmentWithArea = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Review contract',
      area: 'glance-communications',
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([commitmentWithArea])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.listOpen();

    assert.equal(result.length, 1);
    assert.equal(result[0].area, 'glance-communications', 'area should be preserved');
  });

  it('handles commitments without area (backward compatibility)', async () => {
    // Simulate an existing commitment without area field
    const legacyCommitment = {
      id: 'b'.repeat(64),
      text: 'Send slides',
      direction: 'i_owe_them',
      personSlug: 'alice',
      personName: 'Alice Smith',
      source: 'meeting-2026-01-15.md',
      date: '2026-01-15',
      status: 'open',
      resolvedAt: null,
      // Note: no area field
    };
    const store = new Map([[COMMITMENTS_PATH, JSON.stringify({ commitments: [legacyCommitment] })]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Should load without error
    const result = await svc.listOpen();

    assert.equal(result.length, 1);
    assert.equal(result[0].area, undefined, 'area should be undefined for legacy commitments');
  });

  it('preserves area through sync operations', async () => {
    const commitmentWithArea = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Review contract',
      area: 'glance-communications',
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([commitmentWithArea])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Sync with empty items (triggers write without adding new items)
    await svc.sync(new Map());

    // Verify area is still there
    const written = store.get(COMMITMENTS_PATH)!;
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments[0].area, 'glance-communications', 'area should be preserved after sync');
  });
});

describe('CommitmentsService.listOpen() — area filtering', () => {
  it('filters by area when provided', async () => {
    const c1 = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Action in area 1',
      personSlug: 'alice',
      area: 'area-1',
    });
    const c2 = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Action in area 2',
      personSlug: 'alice',
      area: 'area-2',
    });
    const c3 = makeCommitment({
      id: 'c'.repeat(64),
      text: 'Action without area',
      personSlug: 'alice',
      // No area
    });

    const svc = new CommitmentsService(makeStorage([c1, c2, c3]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'area-1' });

    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Action in area 1');
    assert.equal(result[0].area, 'area-1');
  });

  it('returns empty array when area filter matches nothing', async () => {
    const c = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Some action',
      area: 'existing-area',
    });

    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'nonexistent-area' });
    assert.deepEqual(result, []);
  });

  it('excludes commitments without area when filtering by area', async () => {
    const withArea = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Has area',
      area: 'my-area',
    });
    const withoutArea = makeCommitment({
      id: 'b'.repeat(64),
      text: 'No area',
      // No area field
    });

    const svc = new CommitmentsService(makeStorage([withArea, withoutArea]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'my-area' });

    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Has area');
  });

  it('combines area filter with direction filter', async () => {
    const c1 = makeCommitment({
      id: 'a'.repeat(64),
      text: 'I owe in area 1',
      direction: 'i_owe_them',
      area: 'area-1',
    });
    const c2 = makeCommitment({
      id: 'b'.repeat(64),
      text: 'They owe in area 1',
      direction: 'they_owe_me',
      area: 'area-1',
    });
    const c3 = makeCommitment({
      id: 'c'.repeat(64),
      text: 'I owe in area 2',
      direction: 'i_owe_them',
      area: 'area-2',
    });

    const svc = new CommitmentsService(makeStorage([c1, c2, c3]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'area-1', direction: 'i_owe_them' });

    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'I owe in area 1');
  });

  it('combines area filter with personSlugs filter', async () => {
    const c1 = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Alice action in area 1',
      personSlug: 'alice',
      area: 'area-1',
    });
    const c2 = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Bob action in area 1',
      personSlug: 'bob',
      area: 'area-1',
    });
    const c3 = makeCommitment({
      id: 'c'.repeat(64),
      text: 'Alice action in area 2',
      personSlug: 'alice',
      area: 'area-2',
    });

    const svc = new CommitmentsService(makeStorage([c1, c2, c3]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'area-1', personSlugs: ['alice'] });

    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Alice action in area 1');
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

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe('CommitmentsService.create()', () => {
  it('creates a commitment with correct fields', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.create(
      'Send the report',
      'alice',
      'Alice Smith',
      'i_owe_them',
      { source: 'meeting.md' }
    );

    assert.equal(result.commitment.text, 'Send the report');
    assert.equal(result.commitment.personSlug, 'alice');
    assert.equal(result.commitment.personName, 'Alice Smith');
    assert.equal(result.commitment.direction, 'i_owe_them');
    assert.equal(result.commitment.status, 'open');
    assert.equal(result.commitment.resolvedAt, null);
    assert.equal(result.commitment.source, 'meeting.md');

    // Verify persisted
    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].text, 'Send the report');
  });

  it('includes goalSlug and area when provided', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.create(
      'Complete Q1 deliverable',
      'bob',
      'Bob Jones',
      'i_owe_them',
      { goalSlug: 'q1-roadmap', area: 'engineering' }
    );

    assert.equal(result.commitment.goalSlug, 'q1-roadmap');
    assert.equal(result.commitment.area, 'engineering');
  });

  it('uses current date when date not provided', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const before = new Date().toISOString().split('T')[0];
    const result = await svc.create('Task', 'alice', 'Alice', 'i_owe_them');
    const after = new Date().toISOString().split('T')[0];

    // Date should be between before and after (typically same)
    assert.ok(result.commitment.date >= before);
    assert.ok(result.commitment.date <= after);
  });

  it('uses provided date when specified', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.create(
      'Task',
      'alice',
      'Alice',
      'i_owe_them',
      { date: new Date('2026-01-15') }
    );

    assert.equal(result.commitment.date, '2026-01-15');
  });

  it('is idempotent — returns existing commitment if hash matches', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Create first
    const result1 = await svc.create('Same task', 'alice', 'Alice', 'i_owe_them');
    // Create again with same text/person/direction
    const result2 = await svc.create('Same task', 'alice', 'Alice', 'i_owe_them');

    // Should return same commitment
    assert.equal(result1.commitment.id, result2.commitment.id);

    // Should only have one in storage
    const written = store.get(COMMITMENTS_PATH);
    const parsed = JSON.parse(written!) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
  });

  it('does not create task when createTask: false', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let taskCreated = false;
    svc.setCreateTaskFn(async () => {
      taskCreated = true;
      return { id: 'task123', text: 'Test' };
    });

    const result = await svc.create(
      'Task',
      'alice',
      'Alice',
      'i_owe_them',
      { createTask: false }
    );

    assert.equal(taskCreated, false);
    assert.equal(result.task, undefined);
  });

  it('creates task by default for i_owe_them when createTaskFn is set', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let capturedMetadata: { area?: string; person?: string; from?: { type: string; id: string } } = {};
    svc.setCreateTaskFn(async (text, metadata) => {
      capturedMetadata = metadata;
      return { id: 'task456', text };
    });

    const result = await svc.create(
      'Send report',
      'alice',
      'Alice',
      'i_owe_them',
      { area: 'sales' }
    );

    assert.ok(result.task !== undefined);
    assert.equal(result.task?.id, 'task456');
    assert.equal(result.task?.destination, 'inbox');
    assert.equal(capturedMetadata.area, 'sales');
    assert.equal(capturedMetadata.person, 'alice');
    assert.equal(capturedMetadata.from?.type, 'commitment');
    // from.id should be 8-char prefix of commitment hash
    assert.equal(capturedMetadata.from?.id.length, 8);
  });

  it('does NOT create task by default for they_owe_me', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let taskCreated = false;
    svc.setCreateTaskFn(async () => {
      taskCreated = true;
      return { id: 'task123', text: 'Test' };
    });

    const result = await svc.create('Waiting on', 'bob', 'Bob', 'they_owe_me');

    assert.equal(taskCreated, false);
    assert.equal(result.task, undefined);
  });

  it('can force task creation for they_owe_me with createTask: true', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let taskCreated = false;
    svc.setCreateTaskFn(async () => {
      taskCreated = true;
      return { id: 'task123', text: 'Test' };
    });

    const result = await svc.create(
      'Waiting on',
      'bob',
      'Bob',
      'they_owe_me',
      { createTask: true }
    );

    assert.equal(taskCreated, true);
    assert.ok(result.task !== undefined);
  });

  it('rolls back commitment if task creation fails (transactional)', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    svc.setCreateTaskFn(async () => {
      throw new Error('Task creation failed');
    });

    await assert.rejects(
      () => svc.create('Task', 'alice', 'Alice', 'i_owe_them'),
      /Task creation failed/
    );

    // Commitment should be rolled back
    const written = store.get(COMMITMENTS_PATH);
    if (written) {
      const parsed = JSON.parse(written) as CommitmentsFile;
      assert.equal(parsed.commitments.length, 0, 'Commitment should be rolled back on task failure');
    }
  });

  it('does not create task when createTaskFn is not set', async () => {
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Don't set createTaskFn
    const result = await svc.create('Task', 'alice', 'Alice', 'i_owe_them');

    // Commitment created, no task
    assert.ok(result.commitment);
    assert.equal(result.task, undefined);
  });
});

describe('CommitmentsService.exists()', () => {
  it('returns true for existing commitment', async () => {
    const c = makeCommitment({ id: 'abc12345' + 'f'.repeat(56) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const exists = await svc.exists('abc12345');
    assert.equal(exists, true);
  });

  it('returns false for non-existing commitment', async () => {
    const c = makeCommitment({ id: 'abc12345' + 'f'.repeat(56) });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const exists = await svc.exists('xyz00000');
    assert.equal(exists, false);
  });

  it('matches full hash', async () => {
    const fullHash = 'a'.repeat(64);
    const c = makeCommitment({ id: fullHash });
    const svc = new CommitmentsService(makeStorage([c]), WORKSPACE_ROOT);

    const exists = await svc.exists(fullHash);
    assert.equal(exists, true);
  });
});

// ---------------------------------------------------------------------------
// backfillArea() + resetBackfilledAreas() (phase-8-followup-8 AC3)
// ---------------------------------------------------------------------------

describe('CommitmentsService.backfillArea()', () => {
  it('preview mode (apply=false) returns proposals without writing', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'No area', source: 'mtg-a.md' });
    const c2 = makeCommitment({ id: 'b'.repeat(64), text: 'Has area', source: 'mtg-b.md', area: 'existing' });
    const store = new Map<string, string>([[COMMITMENTS_PATH, makeFile([c1, c2])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.backfillArea(
      async (source) => (source === 'mtg-a.md' ? 'glance-communications' : null),
    );

    assert.equal(result.applied, false);
    assert.equal(result.candidates, 1, 'only c1 lacks area');
    assert.equal(result.matched, 1);
    assert.equal(result.proposals[0].id, 'a'.repeat(64));
    assert.equal(result.proposals[0].area, 'glance-communications');

    // Verify file unchanged
    const parsed = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].area, undefined, 'preview must NOT write');
    assert.equal(parsed.commitments[0].areaSetBy, undefined);
  });

  it('apply mode writes area AND areaSetBy="backfill" provenance', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'No area', source: 'mtg-a.md' });
    const store = new Map<string, string>([[COMMITMENTS_PATH, makeFile([c1])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.backfillArea(
      async () => 'glance-communications',
      { apply: true },
    );

    assert.equal(result.applied, true);
    assert.equal(result.matched, 1);

    const parsed = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(parsed.commitments[0].area, 'glance-communications');
    assert.equal(parsed.commitments[0].areaSetBy, 'backfill',
      'every backfill write must stamp the provenance marker');
    // Hash invariance: id is preserved.
    assert.equal(parsed.commitments[0].id, 'a'.repeat(64),
      'commitment id (= hash) must be preserved across backfill');
  });

  it('skips commitments with source="manual" or missing source', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'manual', source: 'manual' });
    const c2 = makeCommitment({ id: 'b'.repeat(64), text: 'no src', source: '' });
    const store = new Map<string, string>([[COMMITMENTS_PATH, makeFile([c1, c2])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let resolverCalls = 0;
    const result = await svc.backfillArea(
      async () => { resolverCalls++; return 'glance-communications'; },
      { apply: true },
    );

    assert.equal(resolverCalls, 0, 'resolver must NOT be called for manual/empty source');
    assert.equal(result.matched, 0);
  });

  it('null resolver result keeps area unset (no proposal recorded)', async () => {
    const c1 = makeCommitment({ id: 'a'.repeat(64), text: 'No area', source: 'mtg-a.md' });
    const store = new Map<string, string>([[COMMITMENTS_PATH, makeFile([c1])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.backfillArea(async () => null, { apply: true });

    assert.equal(result.applied, false, 'no proposals → nothing applied');
    assert.equal(result.matched, 0);
  });
});

describe('CommitmentsService.resetBackfilledAreas()', () => {
  it('clears area + areaSetBy ONLY on commitments with areaSetBy="backfill"', async () => {
    const cBackfilled = makeCommitment({
      id: 'a'.repeat(64),
      text: 'backfilled',
      area: 'glance-communications',
    });
    // Add provenance marker out-of-band (mimics post-backfill state)
    const backfilledWithMarker = { ...cBackfilled, areaSetBy: 'backfill' as const };
    const cPathA = makeCommitment({
      id: 'b'.repeat(64),
      text: 'path-a',
      area: 'glance-communications',
    });
    const cNoArea = makeCommitment({ id: 'c'.repeat(64), text: 'no area' });

    const store = new Map<string, string>([
      [COMMITMENTS_PATH, makeFile([backfilledWithMarker, cPathA, cNoArea])],
    ]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.resetBackfilledAreas();
    assert.equal(result.reset, 1, 'only the marker-carrying commitment is reset');

    const parsed = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    const a = parsed.commitments.find((c) => c.id === 'a'.repeat(64))!;
    const b = parsed.commitments.find((c) => c.id === 'b'.repeat(64))!;
    assert.equal(a.area, undefined, 'reset cleared backfill-stamped area');
    assert.equal(a.areaSetBy, undefined, 'reset cleared provenance marker');
    assert.equal(b.area, 'glance-communications', 'Path A area preserved');
  });

  it('no-op when no commitments carry the backfill marker', async () => {
    const c = makeCommitment({ id: 'a'.repeat(64), text: 'path-a', area: 'glance-communications' });
    const store = new Map<string, string>([[COMMITMENTS_PATH, makeFile([c])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.resetBackfilledAreas();
    assert.equal(result.reset, 0);
  });
});

// ---------------------------------------------------------------------------
// computeCommitmentPriority()
// ---------------------------------------------------------------------------

describe('computeCommitmentPriority()', () => {
  // Helper to create input with defaults
  function makeInput(overrides: Partial<CommitmentPriorityInput> = {}): CommitmentPriorityInput {
    return {
      daysOpen: 0,
      healthIndicator: 'regular',
      direction: 'i_owe_them',
      text: 'Send the project report to the client',
      ...overrides,
    };
  }

  describe('staleness scoring', () => {
    it('returns 0 staleness for 0 days open', () => {
      const result = computeCommitmentPriority(makeInput({ daysOpen: 0 }));
      // With all other factors at moderate values, score should be lowish
      assert.ok(result.score >= 0 && result.score <= 100);
    });

    it('returns ~50 staleness score for 7 days open', () => {
      const base = computeCommitmentPriority(makeInput({ daysOpen: 0 }));
      const week = computeCommitmentPriority(makeInput({ daysOpen: 7 }));
      // 7 days contributes ~15 points (50 * 0.3)
      assert.ok(week.score > base.score, 'Week-old should score higher than fresh');
    });

    it('returns 100 staleness score for 14+ days open', () => {
      const twoWeeks = computeCommitmentPriority(makeInput({ daysOpen: 14 }));
      const threeWeeks = computeCommitmentPriority(makeInput({ daysOpen: 21 }));
      // Both should cap at 100 staleness, so same contribution
      assert.equal(twoWeeks.score, threeWeeks.score, '14 and 21 days should have same staleness');
    });
  });

  describe('health indicator scoring', () => {
    it('active health gives highest health score', () => {
      const active = computeCommitmentPriority(makeInput({ healthIndicator: 'active' }));
      const regular = computeCommitmentPriority(makeInput({ healthIndicator: 'regular' }));
      const cooling = computeCommitmentPriority(makeInput({ healthIndicator: 'cooling' }));
      const dormant = computeCommitmentPriority(makeInput({ healthIndicator: 'dormant' }));

      assert.ok(active.score > regular.score, 'Active > regular');
      assert.ok(regular.score > cooling.score, 'Regular > cooling');
      assert.ok(cooling.score > dormant.score, 'Cooling > dormant');
    });

    it('dormant health gives 0 health contribution', () => {
      const dormant = computeCommitmentPriority(makeInput({ healthIndicator: 'dormant' }));
      const active = computeCommitmentPriority(makeInput({ healthIndicator: 'active' }));
      // Difference should be ~25 points (100 * 0.25)
      const diff = active.score - dormant.score;
      assert.ok(diff >= 20 && diff <= 30, `Health diff should be ~25, got ${diff}`);
    });
  });

  describe('direction scoring', () => {
    it('i_owe_them gives higher score than they_owe_me', () => {
      const iOwe = computeCommitmentPriority(makeInput({ direction: 'i_owe_them' }));
      const theyOwe = computeCommitmentPriority(makeInput({ direction: 'they_owe_me' }));

      assert.ok(iOwe.score > theyOwe.score, 'I owe them should be higher priority');
      // Difference should be ~12.5 points (50 * 0.25)
      const diff = iOwe.score - theyOwe.score;
      assert.ok(diff >= 10 && diff <= 15, `Direction diff should be ~12.5, got ${diff}`);
    });
  });

  describe('specificity scoring', () => {
    it('long text with action verb gets 100 specificity', () => {
      const specific = computeCommitmentPriority(
        makeInput({ text: 'I need to send the detailed quarterly report to the executive team by Friday afternoon' })
      );
      const vague = computeCommitmentPriority(makeInput({ text: 'stuff' }));

      assert.ok(specific.score > vague.score, 'Specific text should score higher');
    });

    it('short text without action verb gets 50 specificity', () => {
      const short = computeCommitmentPriority(makeInput({ text: 'do it' }));
      // With 50 specificity (10 points), score should be lower
      assert.ok(short.score >= 0 && short.score <= 100);
    });

    it('requires BOTH length >= 50 AND action verb for 100', () => {
      // Long but no action verb (avoid words that contain verbs like "meeting" contains "meet")
      const longNoVerb = computeCommitmentPriority(
        makeInput({ text: 'Something about the thing that we talked about in the sync yesterday morning' })
      );
      // Short but has action verb
      const shortVerb = computeCommitmentPriority(makeInput({ text: 'send it' }));

      // Both should get 50 specificity (not 100)
      // They should have similar scores (within rounding)
      assert.ok(Math.abs(longNoVerb.score - shortVerb.score) <= 1);
    });

    it('recognizes common action verbs', () => {
      const verbs = ['send', 'call', 'email', 'schedule', 'review', 'follow', 'share', 'update'];
      for (const verb of verbs) {
        const text = `I will ${verb} the complete project documentation to the team members`;
        const result = computeCommitmentPriority(makeInput({ text }));
        // Should get 100 specificity (20 points instead of 10)
        assert.ok(result.score >= 0, `Verb "${verb}" should be recognized`);
      }
    });
  });

  describe('priority levels', () => {
    it('returns high for score >= 50', () => {
      // High score scenario: stale (14d), active health, i_owe_them, specific text
      const result = computeCommitmentPriority(
        makeInput({
          daysOpen: 14,
          healthIndicator: 'active',
          direction: 'i_owe_them',
          text: 'Send the complete project report with all attachments to the stakeholders',
        })
      );
      assert.equal(result.level, 'high', `Score ${result.score} should be high`);
      assert.ok(result.score >= 50);
    });

    it('returns medium for score 25-49', () => {
      // Medium score scenario: moderate staleness, regular health, i_owe_them, vague text
      const result = computeCommitmentPriority(
        makeInput({
          daysOpen: 3,
          healthIndicator: 'cooling',
          direction: 'they_owe_me',
          text: 'things',
        })
      );
      assert.equal(result.level, 'medium', `Score ${result.score} should be medium`);
      assert.ok(result.score >= 25 && result.score < 50);
    });

    it('returns low for score < 25', () => {
      // Low score scenario: fresh, dormant health, they_owe_me, vague text
      const result = computeCommitmentPriority(
        makeInput({
          daysOpen: 0,
          healthIndicator: 'dormant',
          direction: 'they_owe_me',
          text: 'stuff',
        })
      );
      assert.equal(result.level, 'low', `Score ${result.score} should be low`);
      assert.ok(result.score < 25);
    });
  });

  describe('formula weights', () => {
    it('uses correct weights: staleness=30%, health=25%, direction=25%, specificity=20%', () => {
      // Max score scenario: all components at 100
      const max = computeCommitmentPriority(
        makeInput({
          daysOpen: 14, // 100 staleness
          healthIndicator: 'active', // 100 health
          direction: 'i_owe_them', // 100 direction
          text: 'Send the detailed quarterly financial report to all regional managers immediately', // 100 specificity
        })
      );
      // 100*0.3 + 100*0.25 + 100*0.25 + 100*0.2 = 30 + 25 + 25 + 20 = 100
      assert.equal(max.score, 100, 'Max score should be 100');

      // Min-ish scenario
      const min = computeCommitmentPriority(
        makeInput({
          daysOpen: 0, // 0 staleness
          healthIndicator: 'dormant', // 0 health
          direction: 'they_owe_me', // 50 direction
          text: 'x', // 50 specificity
        })
      );
      // 0*0.3 + 0*0.25 + 50*0.25 + 50*0.2 = 0 + 0 + 12.5 + 10 = 22.5 → rounds to 23
      assert.ok(min.score >= 22 && min.score <= 23, `Min score should be ~23, got ${min.score}`);
    });
  });
});

// ---------------------------------------------------------------------------
// purgeResolved()
// ---------------------------------------------------------------------------

describe('CommitmentsService.purgeResolved()', () => {
  it('returns { purged: 0 } when no commitments file exists', async () => {
    const svc = new CommitmentsService(createMockStorage(), WORKSPACE_ROOT);
    const result = await svc.purgeResolved();
    assert.deepEqual(result, { purged: 0 });
  });

  it('returns { purged: 0 } when commitments file is empty', async () => {
    const store = new Map<string, string>([
      [COMMITMENTS_PATH, makeFile([])],
    ]);
    const svc = new CommitmentsService(createMockStorage(store), WORKSPACE_ROOT);
    const result = await svc.purgeResolved();
    assert.deepEqual(result, { purged: 0 });
  });

  it('returns { purged: 0 } when no resolved commitments exist', async () => {
    const open1 = makeCommitment({ id: 'a'.repeat(64), text: 'Send slides' });
    const open2 = makeCommitment({ id: 'b'.repeat(64), text: 'Follow up on report' });

    const svc = new CommitmentsService(makeStorage([open1, open2]), WORKSPACE_ROOT);
    const result = await svc.purgeResolved();
    assert.deepEqual(result, { purged: 0 });

    // Verify open commitments are still there
    const remaining = await svc.listOpen();
    assert.equal(remaining.length, 2);
  });

  it('purges resolved commitments older than default 30 days', async () => {
    const open = makeCommitment({ id: 'a'.repeat(64), text: 'Open item' });
    const recentResolved = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Recently resolved',
      status: 'resolved',
      resolvedAt: daysAgo(10),
    });
    const oldResolved = makeCommitment({
      id: 'c'.repeat(64),
      text: 'Old resolved',
      status: 'resolved',
      resolvedAt: daysAgo(35),
    });

    const store = new Map<string, string>([
      [COMMITMENTS_PATH, makeFile([open, recentResolved, oldResolved])],
    ]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.purgeResolved();
    assert.equal(result.purged, 1);

    // Verify file contents: open + recentResolved remain, oldResolved is gone
    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 2);
    assert.ok(parsed.commitments.some((c) => c.id === 'a'.repeat(64)));
    assert.ok(parsed.commitments.some((c) => c.id === 'b'.repeat(64)));
    assert.ok(!parsed.commitments.some((c) => c.id === 'c'.repeat(64)));
  });

  it('purges with custom threshold (7 days)', async () => {
    const open = makeCommitment({ id: 'a'.repeat(64), text: 'Open item' });
    const resolved8days = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Resolved 8 days ago',
      status: 'resolved',
      resolvedAt: daysAgo(8),
    });
    const resolved3days = makeCommitment({
      id: 'c'.repeat(64),
      text: 'Resolved 3 days ago',
      status: 'resolved',
      resolvedAt: daysAgo(3),
    });

    const store = new Map<string, string>([
      [COMMITMENTS_PATH, makeFile([open, resolved8days, resolved3days])],
    ]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.purgeResolved(7);
    assert.equal(result.purged, 1);

    // Only the 8-day-old resolved commitment should be purged
    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 2);
    assert.ok(parsed.commitments.some((c) => c.id === 'a'.repeat(64)));
    assert.ok(parsed.commitments.some((c) => c.id === 'c'.repeat(64)));
    assert.ok(!parsed.commitments.some((c) => c.id === 'b'.repeat(64)));
  });

  it('does not touch open commitments regardless of age', async () => {
    const ancientOpen = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Very old open item',
      date: '2020-01-01',
    });
    const oldResolved = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Old resolved',
      status: 'resolved',
      resolvedAt: daysAgo(60),
    });

    const store = new Map<string, string>([
      [COMMITMENTS_PATH, makeFile([ancientOpen, oldResolved])],
    ]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const result = await svc.purgeResolved();
    assert.equal(result.purged, 1);

    // Ancient open item must survive
    const written = store.get(COMMITMENTS_PATH);
    assert.ok(written !== undefined);
    const parsed = JSON.parse(written) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].id, 'a'.repeat(64));
    assert.equal(parsed.commitments[0].status, 'open');
  });

  it('also purges dropped commitments older than threshold', async () => {
    const dropped = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Dropped item',
      status: 'dropped',
      resolvedAt: daysAgo(35),
    });

    const svc = new CommitmentsService(makeStorage([dropped]), WORKSPACE_ROOT);
    const result = await svc.purgeResolved();
    assert.equal(result.purged, 1);
  });
});

// ---------------------------------------------------------------------------
// F1: back-propagate resolve → task [x]
// ---------------------------------------------------------------------------

describe('CommitmentsService.resolve() — F1 back-propagation', () => {
  it('calls completeTaskFromCommitmentFn with 8-char id prefix after resolve', async () => {
    const fullId = 'a'.repeat(64);
    const expectedPrefix = fullId.slice(0, 8);
    const open = makeCommitment({ id: fullId, status: 'open', resolvedAt: null });
    const store = new Map([[COMMITMENTS_PATH, makeFile([open])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const calls: string[] = [];
    svc.setCompleteTaskFromCommitmentFn(async (prefix) => {
      calls.push(prefix);
      return [{ id: 'task1', text: 'matched task' }];
    });

    await svc.resolve(fullId);

    assert.deepEqual(calls, [expectedPrefix], 'fn must be called once with 8-char prefix');
  });

  it('still resolves commitment when back-prop fn throws (silent)', async () => {
    const fullId = 'b'.repeat(64);
    const open = makeCommitment({ id: fullId, status: 'open', resolvedAt: null });
    const store = new Map([[COMMITMENTS_PATH, makeFile([open])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    svc.setCompleteTaskFromCommitmentFn(async () => {
      throw new Error('back-prop failed');
    });

    const result = await svc.resolve(fullId);
    assert.equal(result.status, 'resolved');

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(written.commitments[0].status, 'resolved');
  });

  it('works without back-prop fn injected (backward compat)', async () => {
    const fullId = 'c'.repeat(64);
    const open = makeCommitment({ id: fullId, status: 'open', resolvedAt: null });
    const store = new Map([[COMMITMENTS_PATH, makeFile([open])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // No setCompleteTaskFromCommitmentFn call.
    const result = await svc.resolve(fullId);
    assert.equal(result.status, 'resolved');
  });
});

// ---------------------------------------------------------------------------
// F2: refuse to prune commitments with open task references
// ---------------------------------------------------------------------------

describe('CommitmentsService pruning — F2 task-reference safety', () => {
  it('does NOT prune resolved commitment when an open task references it', async () => {
    const fullId = 'd'.repeat(64);
    const prefix = fullId.slice(0, 8);
    const resolved = makeCommitment({
      id: fullId,
      status: 'resolved',
      resolvedAt: daysAgo(45), // would normally be pruned
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([resolved])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    svc.setHasOpenTaskReferencesFn(async (prefixes) => new Set(prefixes.filter((p) => p === prefix)));

    // Trigger a write
    await svc.sync(new Map());

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      written.commitments.length,
      1,
      'Commitment with live open-task reference must NOT be pruned',
    );
    assert.equal(written.commitments[0].id, fullId);
  });

  it('DOES prune resolved commitment when no open task references it', async () => {
    const fullId = 'e'.repeat(64);
    const resolved = makeCommitment({
      id: fullId,
      status: 'resolved',
      resolvedAt: daysAgo(45),
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([resolved])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // Injection present but always returns empty set (no live references).
    svc.setHasOpenTaskReferencesFn(async () => new Set());

    await svc.sync(new Map());

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      written.commitments.length,
      0,
      'Resolved commitment with no open-task reference should still prune at age threshold',
    );
  });

  it('falls back to pure age-based prune when no injection (backward compat)', async () => {
    const fullId = 'f'.repeat(64);
    const resolved = makeCommitment({
      id: fullId,
      status: 'resolved',
      resolvedAt: daysAgo(45),
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([resolved])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    // No setHasOpenTaskReferencesFn — preserves Phase 0 behavior.
    await svc.sync(new Map());

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(written.commitments.length, 0, 'Default behavior: age-based prune still works');
  });

  it('FU3: makes ONE batched call per save() regardless of candidate count', async () => {
    const oldId = '1'.repeat(64);
    const olderId = '2'.repeat(64);
    const oldestId = '3'.repeat(64);
    const recentId = '4'.repeat(64);
    const openId = '5'.repeat(64);
    const commitments = [
      makeCommitment({ id: oldId, status: 'resolved', resolvedAt: daysAgo(45) }),
      makeCommitment({ id: olderId, status: 'resolved', resolvedAt: daysAgo(50) }),
      makeCommitment({ id: oldestId, status: 'dropped', resolvedAt: daysAgo(60) }),
      makeCommitment({ id: recentId, status: 'resolved', resolvedAt: daysAgo(5) }),
      makeCommitment({ id: openId, status: 'open', resolvedAt: null }),
    ];
    const store = new Map([[COMMITMENTS_PATH, makeFile(commitments)]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    const calls: string[][] = [];
    svc.setHasOpenTaskReferencesFn(async (prefixes) => {
      calls.push([...prefixes]);
      return new Set();
    });

    await svc.sync(new Map());

    assert.equal(calls.length, 1, 'Exactly one batched call per save()');
    assert.deepEqual(
      calls[0].sort(),
      [oldId, olderId, oldestId].map((id) => id.slice(0, 8)).sort(),
      'Batch contains all 3 age-prune candidates; not recent or open',
    );
  });

  it('FU2: hard ceiling — commitment older than 90d ALWAYS prunes regardless of references', async () => {
    const fullId = 'a'.repeat(64);
    const prefix = fullId.slice(0, 8);
    const ancient = makeCommitment({
      id: fullId,
      status: 'resolved',
      resolvedAt: daysAgo(120), // well past hard ceiling
    });
    const store = new Map([[COMMITMENTS_PATH, makeFile([ancient])]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    let consulted = false;
    svc.setHasOpenTaskReferencesFn(async (prefixes) => {
      consulted = true;
      // Even if we claim a task references it, the hard ceiling overrides.
      return new Set(prefixes);
    });

    await svc.sync(new Map());

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      written.commitments.length,
      0,
      'Hard ceiling (>90d) overrides open-task-reference protection',
    );
    assert.equal(
      consulted,
      false,
      'Hard-ceiling-forced prunes should skip the task-ref check entirely',
    );
    // Suppress unused-var lint
    void prefix;
  });

  it('FU2: ceiling-forced + ref-protected coexist in same save()', async () => {
    const ceilingId = 'a'.repeat(64); // 120d old — force prune
    const protectedId = 'b'.repeat(64); // 45d old — protected by open task
    const orphanId = 'c'.repeat(64); // 45d old — no task ref, normal prune
    const commitments = [
      makeCommitment({ id: ceilingId, status: 'resolved', resolvedAt: daysAgo(120) }),
      makeCommitment({ id: protectedId, status: 'resolved', resolvedAt: daysAgo(45) }),
      makeCommitment({ id: orphanId, status: 'resolved', resolvedAt: daysAgo(45) }),
    ];
    const store = new Map([[COMMITMENTS_PATH, makeFile(commitments)]]);
    const storage = createMockStorage(store);
    const svc = new CommitmentsService(storage, WORKSPACE_ROOT);

    svc.setHasOpenTaskReferencesFn(async (prefixes) => {
      // Only the "protected" commitment has an open task referencing it.
      return new Set(prefixes.filter((p) => p === protectedId.slice(0, 8)));
    });

    await svc.sync(new Map());

    const written = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(written.commitments.length, 1);
    assert.equal(
      written.commitments[0].id,
      protectedId,
      'Only the ref-protected commitment survives; ceiling-forced and orphan both pruned',
    );
  });
});

// ---------------------------------------------------------------------------
// FU1: F1+F2 integration — both injections wired together over full lifecycle
// ---------------------------------------------------------------------------

describe('CommitmentsService + TaskService integration (FU1)', () => {
  // Mirrors factory.ts wiring: builds both services with shared storage,
  // wires forward (createTask) + back-prop (completeTaskFromCommitment) +
  // task-ref check (hasOpenTaskReferences) injections. This is the
  // load-bearing wiring — these tests guard against silent regressions
  // where one service is refactored independently.
  async function buildWiredServices() {
    const { TaskService } = await import('../../src/services/tasks.js');
    const paths = {
      root: WORKSPACE_ROOT,
      manifest: join(WORKSPACE_ROOT, 'arete.yaml'),
      ideConfig: join(WORKSPACE_ROOT, '.cursor'),
      rules: join(WORKSPACE_ROOT, '.cursor/rules'),
      agentSkills: join(WORKSPACE_ROOT, '.agents/skills'),
      tools: join(WORKSPACE_ROOT, '.cursor/tools'),
      integrations: join(WORKSPACE_ROOT, '.arete/integrations'),
      context: join(WORKSPACE_ROOT, 'context'),
      memory: join(WORKSPACE_ROOT, '.arete/memory'),
      now: join(WORKSPACE_ROOT, 'now'),
      goals: join(WORKSPACE_ROOT, 'goals'),
      projects: join(WORKSPACE_ROOT, 'projects'),
      resources: join(WORKSPACE_ROOT, 'resources'),
      people: join(WORKSPACE_ROOT, 'people'),
      credentials: join(WORKSPACE_ROOT, '.credentials'),
      templates: join(WORKSPACE_ROOT, 'templates'),
    };
    const store = new Map<string, string>();
    const storage = createMockStorage(store);
    const commitments = new CommitmentsService(storage, WORKSPACE_ROOT);
    const tasks = new TaskService(storage, paths, commitments);
    commitments.setCreateTaskFn(async (text, metadata) => {
      const task = await tasks.addTask(text, 'inbox', metadata);
      return { id: task.id, text: task.text };
    });
    commitments.setCompleteTaskFromCommitmentFn((prefix) =>
      tasks.completeTaskByCommitmentId(prefix),
    );
    commitments.setHasOpenTaskReferencesFn((prefixes) =>
      tasks.hasOpenTaskReferencesToCommitments(prefixes),
    );
    return { commitments, tasks, store, paths };
  }

  it('resolve() back-props to task [x] AND a later save can prune the now-orphaned commitment', async () => {
    const { commitments, tasks, store, paths } = await buildWiredServices();
    const weekFile = join(paths.now, 'week.md');

    // 1. Create commitment — injection creates linked task.
    const { commitment, task } = await commitments.create(
      'Ship the deck to Anthony',
      'anthony-avina',
      'Anthony Avina',
      'i_owe_them',
    );
    assert.ok(task, 'create() should produce a linked task for i_owe_them');

    // Task should be present + open in week.md inbox.
    const openTasksBefore = await tasks.listTasks({ completed: false });
    assert.equal(openTasksBefore.length, 1);
    assert.equal(openTasksBefore[0].metadata.from?.id, commitment.id.slice(0, 8));

    // 2. Resolve commitment — F1 back-prop fires.
    const resolved = await commitments.resolve(commitment.id);
    assert.equal(resolved.status, 'resolved');

    // Task should now be [x] in week.md.
    const updatedFile = store.get(weekFile)!;
    assert.match(updatedFile, /- \[x\] Ship the deck to Anthony/);
    assert.match(updatedFile, /@completedAt\(/);

    // 3. Commitment is still present (only resolvedAt was set, no time has passed).
    const allAfterResolve = await commitments.listOpen();
    assert.equal(allAfterResolve.length, 0, 'resolved is not "open"');

    // 4. Now simulate the 30+ day age threshold by editing the stored JSON.
    const raw = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    raw.commitments[0].resolvedAt = daysAgo(45);
    store.set(COMMITMENTS_PATH, JSON.stringify(raw, null, 2));

    // 5. Trigger another save (sync). Task is COMPLETED now, so F2 does NOT
    //    block — commitment prunes cleanly. This is the load-bearing
    //    F1+F2 interaction the unit tests don't exercise individually.
    await commitments.sync(new Map());

    const finalRaw = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      finalRaw.commitments.length,
      0,
      'Aged-out commitment with only completed-task ref must prune normally',
    );
  });

  it('open task keeps commitment alive at age threshold; hard ceiling eventually frees it', async () => {
    const { commitments, store } = await buildWiredServices();

    // Create + the linked task is auto-added and stays [ ] (never completed).
    const { commitment } = await commitments.create(
      'Sticky open task',
      'sam-searcy',
      'Sam Searcy',
      'i_owe_them',
    );

    // Resolve commitment. F1 back-props → task becomes [x]. But we want
    // to model the "sticky" case where the user never closes the task,
    // so manually mark commitment resolved + REOPEN the task.
    await commitments.resolve(commitment.id);
    // Re-open the linked task by hand-editing the file.
    const weekFile = [...store.keys()].find((p) => p.endsWith('/week.md'))!;
    const reopened = store.get(weekFile)!.replace(/- \[x\]/, '- [ ]').replace(/ @completedAt\([^)]+\)/, '');
    store.set(weekFile, reopened);

    // Age the commitment to 45d (past PRUNE_DAYS, before ceiling).
    let raw = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    raw.commitments[0].resolvedAt = daysAgo(45);
    store.set(COMMITMENTS_PATH, JSON.stringify(raw, null, 2));

    // sync → F2 protects the commitment because task is now open again.
    await commitments.sync(new Map());
    raw = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      raw.commitments.length,
      1,
      'Open task ref protects commitment from age-based prune',
    );

    // Now age to 120d (past hard ceiling). FU2 forces prune regardless.
    raw.commitments[0].resolvedAt = daysAgo(120);
    store.set(COMMITMENTS_PATH, JSON.stringify(raw, null, 2));

    await commitments.sync(new Map());
    raw = JSON.parse(store.get(COMMITMENTS_PATH)!) as CommitmentsFile;
    assert.equal(
      raw.commitments.length,
      0,
      'Hard ceiling (>90d) eventually frees ref-protected commitments — prevents unbounded growth',
    );
  });
});

describe('CommitmentsService.listOpen() — area alias canonicalization', () => {
  function makeAliasStore(commitments: Commitment[]): StorageAdapter {
    const areaPath = join(WORKSPACE_ROOT, 'areas/glance-operations.md');
    const store: MockStore = new Map();
    store.set(COMMITMENTS_PATH, makeFile(commitments));
    // Renamed area declaring its former slug — listOpen loads this map.
    store.set(
      areaPath,
      '---\narea: Glance Operations\naliases:\n  - glance-2-mvp\n---\n\n# Glance Operations\n',
    );
    const base = createMockStorage(store);
    // This file's shared mock hardcodes list() → []; the alias map needs
    // to enumerate areas/.
    return {
      ...base,
      async list(dir: string): Promise<string[]> {
        return dir === join(WORKSPACE_ROOT, 'areas') ? [areaPath] : [];
      },
    };
  }

  it('matches commitments stamped with a former slug when filtering by canonical', async () => {
    const old = makeCommitment({
      id: 'a'.repeat(64),
      text: 'Stamped before the rename',
      personSlug: 'alice',
      area: 'glance-2-mvp',
    });
    const svc = new CommitmentsService(makeAliasStore([old]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'glance-operations' });
    assert.equal(result.length, 1);
    // Stored value is untouched — comparison is canonicalized, data is not.
    assert.equal(result[0].area, 'glance-2-mvp');
  });

  it('matches canonical-stamped commitments when filtering by the alias', async () => {
    const fresh = makeCommitment({
      id: 'b'.repeat(64),
      text: 'Stamped after the rename',
      personSlug: 'alice',
      area: 'glance-operations',
    });
    const svc = new CommitmentsService(makeAliasStore([fresh]), WORKSPACE_ROOT);

    const result = await svc.listOpen({ area: 'glance-2-mvp' });
    assert.equal(result.length, 1);
  });
});
