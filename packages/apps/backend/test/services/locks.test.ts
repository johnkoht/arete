/**
 * Tests for services/locks.ts — file write lock utility.
 *
 * Tests async queue pattern for preventing concurrent write corruption.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withFileLock } from '../../src/services/locks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Helper to sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withFileLock', () => {
  describe('serialization', () => {
    it('serializes concurrent writes to the same file', async () => {
      const events: string[] = [];
      const filePath = '/test/same-file.txt';

      // Start two concurrent operations on the same file
      const op1 = withFileLock(filePath, async () => {
        events.push('op1:start');
        await sleep(50);
        events.push('op1:end');
        return 'result1';
      });

      const op2 = withFileLock(filePath, async () => {
        events.push('op2:start');
        await sleep(50);
        events.push('op2:end');
        return 'result2';
      });

      const [result1, result2] = await Promise.all([op1, op2]);

      // Operations should be serialized: op1 completes before op2 starts
      assert.deepEqual(events, ['op1:start', 'op1:end', 'op2:start', 'op2:end']);
      assert.equal(result1, 'result1');
      assert.equal(result2, 'result2');
    });

    it('allows parallel writes to different files', async () => {
      const events: string[] = [];

      const op1 = withFileLock('/test/file-a.txt', async () => {
        events.push('a:start');
        await sleep(50);
        events.push('a:end');
        return 'a';
      });

      const op2 = withFileLock('/test/file-b.txt', async () => {
        events.push('b:start');
        await sleep(50);
        events.push('b:end');
        return 'b';
      });

      const [resultA, resultB] = await Promise.all([op1, op2]);

      // Both should start before either ends (parallel execution)
      assert.ok(events.indexOf('a:start') < events.indexOf('a:end'));
      assert.ok(events.indexOf('b:start') < events.indexOf('b:end'));
      // Both started before the first one ended
      assert.ok(events.indexOf('b:start') < events.indexOf('a:end'));

      assert.equal(resultA, 'a');
      assert.equal(resultB, 'b');
    });
  });

  describe('error handling', () => {
    it('releases lock on function error', async () => {
      const filePath = '/test/error-file.txt';
      const events: string[] = [];

      // First operation throws
      const op1 = withFileLock(filePath, async () => {
        events.push('op1:start');
        throw new Error('intentional error');
      }).catch((err) => {
        events.push('op1:caught');
        return err;
      });

      // Second operation should still proceed after op1 fails
      const op2 = withFileLock(filePath, async () => {
        events.push('op2:start');
        events.push('op2:end');
        return 'success';
      });

      const [error, result2] = await Promise.all([op1, op2]);

      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, 'intentional error');
      assert.equal(result2, 'success');
      // op2 should have run after op1 failed
      assert.ok(events.indexOf('op1:caught') < events.indexOf('op2:start'));
    });

    it('propagates function errors to caller', async () => {
      const customError = new Error('custom test error');

      await assert.rejects(
        withFileLock('/test/file.txt', async () => {
          throw customError;
        }),
        (err) => err === customError
      );
    });
  });

  describe('timeout', () => {
    it('times out after 5 seconds waiting for lock with descriptive error', async () => {
      const filePath = '/test/timeout-file.txt';

      // Start a long-running operation that holds the lock
      const longOp = withFileLock(filePath, async () => {
        // Hold lock for 6 seconds (longer than timeout)
        await sleep(6000);
        return 'completed';
      });

      // Wait a bit for longOp to acquire lock
      await sleep(10);

      // Try to acquire lock - should timeout waiting
      const timeoutOp = withFileLock(filePath, async () => {
        return 'should not reach here';
      });

      // Timeout should occur around 5 seconds
      const startTime = Date.now();
      await assert.rejects(
        timeoutOp,
        (err) => {
          assert.ok(err instanceof Error);
          const elapsed = Date.now() - startTime;
          // Should timeout between 4.5 and 5.5 seconds
          assert.ok(elapsed >= 4500 && elapsed <= 5500, `Elapsed: ${elapsed}ms`);
          // Error message should be descriptive
          assert.ok(
            (err as Error).message.includes('timeout') ||
            (err as Error).message.includes('Lock'),
            `Message: ${(err as Error).message}`
          );
          assert.ok(
            (err as Error).message.includes(filePath),
            `Message should include file path: ${(err as Error).message}`
          );
          return true;
        }
      );

      // Clean up - wait for longOp to complete
      await longOp;
    });

    it('maintains serialization when middle waiter times out', async () => {
      const filePath = '/test/serialization-timeout.txt';
      const events: string[] = [];

      // A: holds lock for 6 seconds (completes at t=6s)
      const opA = withFileLock(filePath, async () => {
        events.push('A:start');
        await sleep(6000);
        events.push('A:end');
        return 'A';
      });

      // Wait for A to acquire lock
      await sleep(10);

      // B: tries to acquire, will timeout after 5 seconds (at t=5s)
      const opB = withFileLock(filePath, async () => {
        events.push('B:start');
        return 'B';
      }).catch((err) => {
        events.push('B:timeout');
        return err;
      });

      // Wait 1.5 seconds so C's 5s timeout fires at t=6.5s (after A completes at t=6s)
      await sleep(1500);

      // C: queued behind B, must wait for A to complete (not just B's timeout)
      // C's own 5s timeout will fire at ~t=6.5s, after A completes at t=6s
      const opC = withFileLock(filePath, async () => {
        events.push('C:start');
        events.push('C:end');
        return 'C';
      });

      // Wait for all operations
      const [resultA, resultB, resultC] = await Promise.all([opA, opB, opC]);

      // Verify results
      assert.equal(resultA, 'A');
      assert.ok(resultB instanceof Error, 'B should have timed out');
      assert.equal(resultC, 'C');

      // Critical assertion: C must start AFTER A ends
      // If the bug exists, C would start before A ends (concurrent execution)
      const aEndIndex = events.indexOf('A:end');
      const cStartIndex = events.indexOf('C:start');
      assert.ok(
        aEndIndex < cStartIndex,
        `C must wait for A to complete. Events: ${events.join(', ')}`
      );

      // B should timeout before A ends
      const bTimeoutIndex = events.indexOf('B:timeout');
      assert.ok(
        bTimeoutIndex < aEndIndex,
        `B should timeout before A ends. Events: ${events.join(', ')}`
      );
    });
  });

  describe('return values', () => {
    it('returns the function result', async () => {
      const result = await withFileLock('/test/file.txt', async () => {
        return { key: 'value', num: 42 };
      });

      assert.deepEqual(result, { key: 'value', num: 42 });
    });

    it('supports synchronous functions', async () => {
      const result = await withFileLock('/test/file.txt', async () => {
        return 'sync result';
      });

      assert.equal(result, 'sync result');
    });
  });
});
