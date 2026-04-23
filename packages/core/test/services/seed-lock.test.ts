import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSeedLock,
  readSeedLock,
  breakSeedLock,
  SeedLockHeldError,
} from '../../src/services/seed-lock.js';

async function withAreteDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'arete-seed-lock-'));
  try {
    await fn(tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

describe('seed-lock', () => {
  it('acquires lock on fresh directory and records pid + command', async () => {
    await withAreteDir(async (dir) => {
      const release = await acquireSeedLock(dir, 'seed');
      const info = await readSeedLock(dir);
      assert.ok(info !== null);
      assert.strictEqual(info.pid, process.pid);
      assert.strictEqual(info.command, 'seed');
      assert.match(info.started, /^\d{4}-\d{2}-\d{2}T/);
      await release();
    });
  });

  it('throws SeedLockHeldError when lock already exists', async () => {
    await withAreteDir(async (dir) => {
      const release1 = await acquireSeedLock(dir, 'seed');
      try {
        await assert.rejects(
          () => acquireSeedLock(dir, 'other'),
          (err: unknown) => err instanceof SeedLockHeldError && err.info?.pid === process.pid,
        );
      } finally {
        await release1();
      }
    });
  });

  it('releases the lock so a subsequent acquire succeeds', async () => {
    await withAreteDir(async (dir) => {
      const release1 = await acquireSeedLock(dir, 'first');
      await release1();
      const release2 = await acquireSeedLock(dir, 'second');
      const info = await readSeedLock(dir);
      assert.strictEqual(info?.command, 'second');
      await release2();
    });
  });

  it('release is idempotent — second call is a no-op', async () => {
    await withAreteDir(async (dir) => {
      const release = await acquireSeedLock(dir, 'x');
      await release();
      await release(); // must not throw
      assert.strictEqual(await readSeedLock(dir), null);
    });
  });

  it('surfaces existing lock info in SeedLockHeldError.info', async () => {
    await withAreteDir(async (dir) => {
      // Pre-seed a lock file (simulating another process's lock)
      await writeFile(
        join(dir, '.seed.lock'),
        JSON.stringify({
          pid: 99999,
          started: '2026-04-22T10:00:00Z',
          command: 'other-process',
        }),
      );
      try {
        await acquireSeedLock(dir, 'new');
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof SeedLockHeldError);
        assert.strictEqual(err.info?.pid, 99999);
        assert.strictEqual(err.info?.command, 'other-process');
      }
      await breakSeedLock(dir);
    });
  });

  it('tolerates malformed existing lock (reports without info)', async () => {
    await withAreteDir(async (dir) => {
      await writeFile(join(dir, '.seed.lock'), 'not json');
      try {
        await acquireSeedLock(dir, 'new');
        assert.fail('should have thrown');
      } catch (err) {
        assert.ok(err instanceof SeedLockHeldError);
        assert.strictEqual(err.info, null);
      }
      await breakSeedLock(dir);
    });
  });

  it('breakSeedLock clears the lock forcibly', async () => {
    await withAreteDir(async (dir) => {
      await writeFile(join(dir, '.seed.lock'), '{}');
      await breakSeedLock(dir);
      assert.strictEqual(await readSeedLock(dir), null);
    });
  });

  it('is safe against concurrent acquirers (at most one wins)', async () => {
    await withAreteDir(async (dir) => {
      // Race three simultaneous acquires. Exactly one should succeed;
      // the other two throw SeedLockHeldError.
      const results = await Promise.allSettled([
        acquireSeedLock(dir, 'a'),
        acquireSeedLock(dir, 'b'),
        acquireSeedLock(dir, 'c'),
      ]);
      const wins = results.filter((r) => r.status === 'fulfilled');
      const losses = results.filter((r) => r.status === 'rejected');
      assert.strictEqual(wins.length, 1, 'exactly one acquire wins');
      assert.strictEqual(losses.length, 2);
      for (const l of losses) {
        if (l.status !== 'rejected') continue;
        assert.ok(l.reason instanceof SeedLockHeldError);
      }
      // release the winner
      if (wins[0].status === 'fulfilled') {
        await wins[0].value();
      }
    });
  });
});
