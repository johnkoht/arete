import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSeedLock,
  readSeedLock,
  breakSeedLock,
  isPidAlive,
  SeedLockHeldError,
  type SeedLockInfo,
} from '../../src/services/seed-lock.js';

async function withAreteDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'arete-seed-lock-'));
  try {
    await fn(tmp);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Produce a pid that is GUARANTEED dead: spawn a trivial child
 * synchronously — by the time spawnSync returns, the child has exited
 * and been reaped, so its pid no longer exists.
 */
function deadPid(): number {
  const r = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  assert.ok(typeof r.pid === 'number' && r.pid > 0, 'spawnSync must report a pid');
  return r.pid;
}

function lockFileContent(pid: number, command = 'topic refresh'): string {
  return JSON.stringify({
    pid,
    started: '2026-06-08T21:29:42.474Z',
    command,
  } satisfies SeedLockInfo);
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

  it('throws SeedLockHeldError when lock is held by a LIVE pid (AC1 live-pid refusal)', async () => {
    await withAreteDir(async (dir) => {
      const release1 = await acquireSeedLock(dir, 'seed');
      try {
        await assert.rejects(
          () => acquireSeedLock(dir, 'other'),
          (err: unknown) => err instanceof SeedLockHeldError && err.info?.pid === process.pid,
        );
        // Lock must be untouched — still ours.
        const info = await readSeedLock(dir);
        assert.strictEqual(info?.command, 'seed');
      } finally {
        await release1();
      }
    });
  });

  it('takes over a stale lock whose pid is dead (AC1 dead-pid takeover)', async () => {
    await withAreteDir(async (dir) => {
      const stalePid = deadPid();
      await writeFile(join(dir, '.seed.lock'), lockFileContent(stalePid));

      let observed: SeedLockInfo | null | undefined;
      const release = await acquireSeedLock(dir, 'meeting approve (topic ingest)', {
        onStaleTakeover: (stale) => {
          observed = stale;
        },
      });

      // We now hold the lock under OUR pid.
      const info = await readSeedLock(dir);
      assert.strictEqual(info?.pid, process.pid);
      assert.strictEqual(info?.command, 'meeting approve (topic ingest)');

      // Callback saw the stale holder's info.
      assert.strictEqual(observed?.pid, stalePid);
      assert.strictEqual(observed?.command, 'topic refresh');

      await release();
      assert.strictEqual(await readSeedLock(dir), null);
    });
  });

  it('logs a seed-lock-takeover event to memory/log.md on takeover', async () => {
    await withAreteDir(async (dir) => {
      const stalePid = deadPid();
      await writeFile(join(dir, '.seed.lock'), lockFileContent(stalePid));

      const release = await acquireSeedLock(dir, 'topic refresh');
      await release();

      const log = await readFile(join(dir, 'memory', 'log.md'), 'utf8');
      const lines = log.split('\n').filter((l) => l.includes('seed-lock-takeover'));
      assert.strictEqual(lines.length, 1, 'exactly one takeover event');
      assert.match(lines[0], /^## \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] seed-lock-takeover \| /);
      assert.match(lines[0], new RegExp(`stale_pid=${stalePid}`));
      assert.match(lines[0], /stale_command=topic%20refresh/);
      assert.match(lines[0], /command=topic%20refresh/);
    });
  });

  it('treats an unparseable lock file as stale and takes over', async () => {
    await withAreteDir(async (dir) => {
      await writeFile(join(dir, '.seed.lock'), 'not json');
      let observed: SeedLockInfo | null | undefined = undefined;
      const release = await acquireSeedLock(dir, 'new', {
        onStaleTakeover: (stale) => {
          observed = stale;
        },
      });
      assert.strictEqual(observed, null, 'unparseable lock reports null stale info');
      const info = await readSeedLock(dir);
      assert.strictEqual(info?.pid, process.pid);
      await release();
    });
  });

  it('treats a lock with a non-numeric pid as stale and takes over', async () => {
    await withAreteDir(async (dir) => {
      await writeFile(
        join(dir, '.seed.lock'),
        JSON.stringify({ pid: 'garbage', started: 'x', command: 'y' }),
      );
      const release = await acquireSeedLock(dir, 'new');
      const info = await readSeedLock(dir);
      assert.strictEqual(info?.pid, process.pid);
      await release();
    });
  });

  it('refuses (no infinite loop) when EEXIST persists after one takeover', async () => {
    await withAreteDir(async (dir) => {
      // Simulate losing the takeover race: a stale lock exists, but the
      // moment we break it another LIVE process re-creates it. Model by
      // re-creating a live-pid lock from onStaleTakeover (which runs
      // after the break, before the retry).
      const stalePid = deadPid();
      await writeFile(join(dir, '.seed.lock'), lockFileContent(stalePid));
      await assert.rejects(
        () =>
          acquireSeedLock(dir, 'racer', {
            onStaleTakeover: async () => {
              await writeFile(
                join(dir, '.seed.lock'),
                lockFileContent(process.pid, 'winner'),
              );
            },
          }),
        (err: unknown) =>
          err instanceof SeedLockHeldError && err.info?.command === 'winner',
      );
      await breakSeedLock(dir);
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
      // the other two throw SeedLockHeldError (the winner's pid is LIVE
      // — ours — so no takeover happens).
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

  describe('isPidAlive', () => {
    it('returns true for our own pid', () => {
      assert.strictEqual(isPidAlive(process.pid), true);
    });
    it('returns false for a dead pid', () => {
      assert.strictEqual(isPidAlive(deadPid()), false);
    });
    it('returns false for invalid pids', () => {
      assert.strictEqual(isPidAlive(0), false);
      assert.strictEqual(isPidAlive(-1), false);
      assert.strictEqual(isPidAlive(1.5), false);
      assert.strictEqual(isPidAlive(NaN), false);
    });
  });
});
