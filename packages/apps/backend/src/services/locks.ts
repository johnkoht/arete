/**
 * File write lock utility.
 *
 * Prevents concurrent write corruption by serializing writes per file path.
 */

/** Lock wait timeout in milliseconds */
const LOCK_TIMEOUT_MS = 5000;

/** Per-file write queue - each file path maps to its current lock promise */
const writeQueue = new Map<string, Promise<void>>();

/**
 * Execute a function while holding an exclusive lock on the given file path.
 * Concurrent calls for the same path are serialized.
 * Calls for different paths proceed in parallel.
 *
 * @param filePath - Path to lock (key for serialization)
 * @param fn - Async function to execute while holding lock
 * @returns Result of fn
 * @throws If lock acquisition times out (5 seconds) or fn throws
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  // Get the prior lock promise (if any) - this is what we wait for
  const prior = writeQueue.get(filePath) ?? Promise.resolve();

  // Create our lock promise that subsequent callers will wait on
  let resolve!: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });

  // Register our lock in the queue immediately
  writeQueue.set(filePath, next);

  // Wait for prior lock with timeout
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Lock timeout: waited 5 seconds for lock on ${filePath}`));
    }, LOCK_TIMEOUT_MS);
  });

  let acquiredLock = false;
  try {
    // Wait for prior lock to release (with timeout)
    await Promise.race([prior, timeout]);
    clearTimeout(timeoutId!);
    acquiredLock = true;

    // Execute the function while holding the lock
    return await fn();
  } finally {
    if (acquiredLock) {
      // Normal completion or fn() error - release immediately
      resolve();
    } else {
      // Timed out before acquiring lock - chain to maintain serialization
      // Next waiter must wait for prior holder to complete
      prior.finally(() => resolve());
    }
  }
}
