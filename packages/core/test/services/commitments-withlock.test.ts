/**
 * Tests for CommitmentsService file locking (phase-10a-pre F5/R12 mitigation).
 *
 * Uses a REAL filesystem (a tmp dir under os.tmpdir()) because
 * `proper-lockfile` operates on real disk: it creates a sidecar `.lock`
 * directory next to the target file. Mock storage adapters that back to
 * memory don't satisfy that contract.
 *
 * Covers:
 *  - Two concurrent `sync()` calls (each goes through save()) don't corrupt
 *    commitments.json — all items land, no partial writes.
 *  - `withLock(fn)` runs `fn` to completion before another `withLock`
 *    starts (atomic RMW across N concurrent appenders).
 *  - Re-entrant: `save()` called from inside a `withLock` callback on the
 *    same instance does NOT deadlock.
 *  - Lock is released when `fn` throws.
 *  - `withLock(fn)` propagates fn's return value.
 *  - Fresh-workspace bootstrap (no commitments.json yet) does not blow up.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommitmentsService, LockBootstrapError } from '../../src/services/commitments.js';
import { FileStorageAdapter } from '../../src/storage/file.js';
import type { CommitmentsFile } from '../../src/models/index.js';
import type { PersonActionItem } from '../../src/services/person-signals.js';
import type { StorageAdapter } from '../../src/storage/adapter.js';

function makeActionItem(
  overrides: Partial<PersonActionItem> = {},
): PersonActionItem {
  return {
    text: 'baseline action',
    direction: 'i_owe_them',
    source: 'meeting.md',
    date: '2026-05-01',
    hash: 'unused',
    stale: false,
    ...overrides,
  };
}

describe('CommitmentsService.withLock + concurrent save() — F5/R12', () => {
  let workspaceRoot: string;
  let service: CommitmentsService;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'arete-withlock-'));
    const storage = new FileStorageAdapter();
    service = new CommitmentsService(storage, workspaceRoot);
  });

  afterEach(() => {
    if (workspaceRoot && existsSync(workspaceRoot)) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('two concurrent save() writes do not corrupt the JSON (parses cleanly, no torn writes)', async () => {
    // Even without atomic RMW at the caller layer, the proper-lockfile-
    // protected save() guarantees readers see either the full prior file
    // or the full new file — never a partial write. The exact set that
    // wins is last-writer-wins (which is the documented save() contract),
    // but the OUTPUT is always parseable JSON with the expected shape.
    //
    // F5/R12 atomicity for caller-level RMW lives at the `withLock(fn)`
    // layer, exercised in the next test. This case just validates that
    // single-call save() is corruption-free under concurrent fire.
    const aItems = new Map([
      [
        'alice',
        [
          makeActionItem({ text: 'A item one' }),
          makeActionItem({ text: 'A item two' }),
        ],
      ],
    ]);
    const bItems = new Map([
      [
        'bob',
        [
          makeActionItem({ text: 'B item one', direction: 'they_owe_me', source: 'b.md', date: '2026-05-02' }),
          makeActionItem({ text: 'B item two', direction: 'they_owe_me', source: 'b.md', date: '2026-05-02' }),
        ],
      ],
    ]);
    const nameMap = new Map([
      ['alice', 'Alice Smith'],
      ['bob', 'Bob Lee'],
    ]);

    await Promise.all([service.sync(aItems, nameMap), service.sync(bItems, nameMap)]);

    const raw = readFileSync(join(workspaceRoot, '.arete/commitments.json'), 'utf8');
    // Must parse cleanly — no partial / mid-write garbage.
    const parsed = JSON.parse(raw) as CommitmentsFile;
    assert.ok(Array.isArray(parsed.commitments), 'commitments[] missing');

    // Whichever batch wrote last, that batch's items are present (2 items).
    // The OTHER batch may have landed too if its write completed before
    // the second read; OR may have been overwritten. Either is acceptable
    // for the single-save-lock contract — the point of THIS test is
    // "no JSON corruption."
    const texts = new Set(parsed.commitments.map((c) => c.text));
    const wroteA = texts.has('A item one') && texts.has('A item two');
    const wroteB = texts.has('B item one') && texts.has('B item two');
    assert.ok(
      wroteA || wroteB,
      `expected at least one batch to land cleanly; got: ${JSON.stringify([...texts])}`,
    );
  });

  it('withLock(fn) serializes RMW across concurrent appenders', async () => {
    // Seed the file with a baseline.
    await service.sync(
      new Map([['alice', [makeActionItem({ text: 'seed' })]]]),
      new Map([['alice', 'Alice']]),
    );

    // Each closure does: read all → sync ONE unique item. With three
    // concurrent appenders + atomic RMW, all three texts must land.
    async function appendOne(label: string): Promise<void> {
      await service.withLock(async () => {
        await service.listOpen();
        await service.sync(
          new Map([
            [
              'alice',
              [
                makeActionItem({
                  text: `concurrent-${label}`,
                  source: `m-${label}.md`,
                  date: '2026-05-10',
                }),
              ],
            ],
          ]),
          new Map([['alice', 'Alice']]),
        );
      });
    }

    await Promise.all([appendOne('alpha'), appendOne('beta'), appendOne('gamma')]);

    const raw = readFileSync(join(workspaceRoot, '.arete/commitments.json'), 'utf8');
    const parsed = JSON.parse(raw) as CommitmentsFile;
    const texts = parsed.commitments.map((c) => c.text).sort();
    assert.deepEqual(
      texts,
      ['concurrent-alpha', 'concurrent-beta', 'concurrent-gamma', 'seed'],
      `expected all RMW results to land; got: ${JSON.stringify(texts)}`,
    );
  });

  it('re-entrant: save() called from inside withLock() does not deadlock', async () => {
    // 5s timeout — if save() tried to re-acquire the same proper-lockfile
    // lock, it would hang forever.
    await Promise.race([
      service.withLock(async () => {
        await service.sync(
          new Map([['alice', [makeActionItem({ text: 'reentrant' })]]]),
          new Map([['alice', 'Alice']]),
        );
      }),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('deadlock — withLock did not complete in 5s')),
          5_000,
        ),
      ),
    ]);

    const raw = readFileSync(join(workspaceRoot, '.arete/commitments.json'), 'utf8');
    const parsed = JSON.parse(raw) as CommitmentsFile;
    assert.equal(parsed.commitments.length, 1);
    assert.equal(parsed.commitments[0].text, 'reentrant');
  });

  it('lock is released when withLock(fn) throws', async () => {
    await assert.rejects(
      service.withLock(async () => {
        throw new Error('boom');
      }),
      /boom/,
    );

    // Subsequent sync must complete without hanging on a leaked lock.
    await Promise.race([
      service.sync(
        new Map([['alice', [makeActionItem({ text: 'after-throw' })]]]),
        new Map([['alice', 'Alice']]),
      ),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('post-throw sync timed out — lock leaked')),
          5_000,
        ),
      ),
    ]);

    const raw = readFileSync(join(workspaceRoot, '.arete/commitments.json'), 'utf8');
    const parsed = JSON.parse(raw) as CommitmentsFile;
    assert.equal(parsed.commitments[0].text, 'after-throw');
  });

  it('withLock returns the value from fn', async () => {
    const result = await service.withLock(async () => 42);
    assert.equal(result, 42);
  });

  it('save() in a fresh workspace bootstraps the lockfile target', async () => {
    await service.sync(
      new Map([['alice', [makeActionItem({ text: 'bootstrap' })]]]),
      new Map([['alice', 'Alice']]),
    );

    const raw = readFileSync(join(workspaceRoot, '.arete/commitments.json'), 'utf8');
    const parsed = JSON.parse(raw) as CommitmentsFile;
    assert.equal(parsed.commitments[0].text, 'bootstrap');
  });

  // -------------------------------------------------------------------------
  // Phase 10a-pre HIGH-1 mitigation: bootstrap failure surfaces explicitly
  // -------------------------------------------------------------------------
  //
  // Previously `ensureLockTarget` returned false on bootstrap failure and
  // `runUnderLock` silently bypassed the lock. The plan says "abstain,
  // never silent corruption" — the new behavior throws `LockBootstrapError`
  // so a future StorageAdapter shape (remote / S3 / SQLite) that lacks
  // filesystem semantics cannot silently degrade cross-process safety.
  //
  // The mock-storage tests in commitments.test.ts set
  // `ARETE_LOCK_BYPASS_MOCK=1` to opt back into the bypass for unit tests
  // running against virtual paths. Production code never sets the flag.
  it('runUnderLock throws LockBootstrapError when bootstrap fails (HIGH-1)', async () => {
    // Mock storage adapter backed by an in-memory Map — write/read work,
    // but the lockfile bootstrap mkdir against a virtual root will fail.
    const store = new Map<string, string>();
    const mockStorage: StorageAdapter = {
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

    // Virtual root that cannot be mkdir'd on a real filesystem.
    const virtualSvc = new CommitmentsService(mockStorage, '/nonexistent-virtual-root-for-bootstrap-test');

    // Save sentinel: make sure the bypass flag is NOT set during this test.
    const prior = process.env.ARETE_LOCK_BYPASS_MOCK;
    delete process.env.ARETE_LOCK_BYPASS_MOCK;
    try {
      await assert.rejects(
        virtualSvc.withLock(async () => 'unreachable'),
        (err: Error) => {
          assert.ok(err instanceof LockBootstrapError, `expected LockBootstrapError, got ${err.constructor.name}`);
          assert.match(err.message, /Cannot bootstrap lock target/);
          assert.match(err.message, /abstaining rather than silently bypassing/);
          return true;
        },
      );
    } finally {
      if (prior !== undefined) process.env.ARETE_LOCK_BYPASS_MOCK = prior;
    }
  });

  it('ARETE_LOCK_BYPASS_MOCK=1 allows mock-path bypass without throwing', async () => {
    // With the env flag set, virtual-root mock storage runs `fn` without
    // a lock. This is the explicit, opt-in escape hatch for unit tests.
    const store = new Map<string, string>();
    const mockStorage: StorageAdapter = {
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
    const virtualSvc = new CommitmentsService(mockStorage, '/nonexistent-virtual-root-for-bootstrap-test');

    const prior = process.env.ARETE_LOCK_BYPASS_MOCK;
    process.env.ARETE_LOCK_BYPASS_MOCK = '1';
    try {
      const result = await virtualSvc.withLock(async () => 'ok');
      assert.equal(result, 'ok');
    } finally {
      if (prior !== undefined) process.env.ARETE_LOCK_BYPASS_MOCK = prior;
      else delete process.env.ARETE_LOCK_BYPASS_MOCK;
    }
  });
});
