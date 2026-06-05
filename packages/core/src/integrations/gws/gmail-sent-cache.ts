/**
 * Gmail Sent-folder cache (Phase 11-pre, F4).
 *
 * Reader / writer for `.arete/cache/gmail-sent-YYYY-MM-DD.json`.
 * Envelope shape: `{ version: 2, pulledAt, daysCovered, threads, recipientIndex }`.
 *
 * Versioning policy (F4):
 *  - Writes always use `version: GMAIL_SENT_CACHE_VERSION` (= 2).
 *  - Reads MUST verify `version === 2`. Any other value (including missing,
 *    legacy `version: 1`, or a future bump) is rejected → caller refetches.
 *  - Rejection is non-throwing: the reader returns `null` with a console
 *    warning, and the caller treats it as a cache miss.
 *
 * IMPORTANT: storage I/O is delegated via the StorageAdapter so tests can
 * inject a memory adapter (no real fs writes).
 */

import { join } from 'node:path';
import type { StorageAdapter } from '../../storage/adapter.js';
import {
  GMAIL_SENT_CACHE_VERSION,
  normalizeEmail,
} from './types.js';
import type { EmailThread, GmailSentCache } from './types.js';

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

/**
 * Build the canonical cache path for a given date.
 * `dateYYYYMMDD` defaults to today (UTC) when not provided.
 */
export function gmailSentCachePath(
  workspaceRoot: string,
  dateYYYYMMDD?: string,
): string {
  const date = dateYYYYMMDD ?? new Date().toISOString().slice(0, 10);
  return join(workspaceRoot, '.arete', 'cache', `gmail-sent-${date}.json`);
}

// ---------------------------------------------------------------------------
// Recipient pre-index — built at write time
// ---------------------------------------------------------------------------

/**
 * Build a `normalizedEmail → thread.id[]` index from a thread list.
 *
 * Includes to + cc + bcc. Skips empties + malformed addresses.
 */
export function buildRecipientIndex(
  threads: EmailThread[],
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const t of threads) {
    const allRecipients = [
      ...(t.to ?? []),
      ...(t.cc ?? []),
      ...(t.bcc ?? []),
    ];
    for (const raw of allRecipients) {
      const norm = normalizeEmail(raw);
      if (!norm) continue;
      if (!index[norm]) index[norm] = [];
      if (!index[norm].includes(t.id)) index[norm].push(t.id);
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

export type WriteCacheOpts = {
  /** Days the pull covered (echoed in envelope for debugging). */
  daysCovered: number;
  /** Override `pulledAt` (mostly for tests). */
  pulledAt?: string;
  /** Override the date segment of the filename. Default: today UTC. */
  dateYYYYMMDD?: string;
};

/**
 * Write threads to the daily cache file with `version: 2` envelope.
 * Returns the absolute path that was written.
 */
export async function writeGmailSentCache(
  storage: StorageAdapter,
  workspaceRoot: string,
  threads: EmailThread[],
  opts: WriteCacheOpts,
): Promise<string> {
  const path = gmailSentCachePath(workspaceRoot, opts.dateYYYYMMDD);
  const envelope: GmailSentCache = {
    version: GMAIL_SENT_CACHE_VERSION,
    pulledAt: opts.pulledAt ?? new Date().toISOString(),
    daysCovered: opts.daysCovered,
    threads,
    recipientIndex: buildRecipientIndex(threads),
  };
  await storage.write(path, JSON.stringify(envelope, null, 2));
  return path;
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

export type ReadCacheResult =
  | { ok: true; cache: GmailSentCache }
  | { ok: false; reason: 'missing' | 'unparseable' | 'wrong-version' | 'malformed'; message: string };

/**
 * Read + version-validate the daily cache. Non-throwing.
 *
 * F4 invalidation policy:
 *  - File missing → `{ ok: false, reason: 'missing' }`
 *  - JSON parse error → `{ ok: false, reason: 'unparseable' }`
 *  - `version` missing OR !== 2 → `{ ok: false, reason: 'wrong-version' }`
 *  - Missing top-level fields → `{ ok: false, reason: 'malformed' }`
 *
 * On non-ok return, the caller should refetch + overwrite via
 * `writeGmailSentCache`. Console-logs a clear warning so the user sees
 * the cache-bust.
 */
export async function readGmailSentCache(
  storage: StorageAdapter,
  workspaceRoot: string,
  dateYYYYMMDD?: string,
): Promise<ReadCacheResult> {
  const path = gmailSentCachePath(workspaceRoot, dateYYYYMMDD);
  const raw = await storage.read(path);
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'missing', message: `Cache file not found: ${path}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = `[gmail-sent-cache] Unparseable JSON at ${path}: ${(err as Error).message}. Will refetch.`;
    console.warn(msg);
    return { ok: false, reason: 'unparseable', message: msg };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    const msg = `[gmail-sent-cache] Malformed cache (not an object) at ${path}. Will refetch.`;
    console.warn(msg);
    return { ok: false, reason: 'malformed', message: msg };
  }

  const obj = parsed as Record<string, unknown>;

  // Version gate (F4) — reject v1 + anything other than 2.
  const version = obj.version;
  if (typeof version !== 'number' || version !== GMAIL_SENT_CACHE_VERSION) {
    const found = version === undefined ? 'missing (likely v1)' : String(version);
    const msg = `[gmail-sent-cache] Cache version mismatch at ${path}: expected ${GMAIL_SENT_CACHE_VERSION}, got ${found}. Invalidating + refetching.`;
    console.warn(msg);
    return { ok: false, reason: 'wrong-version', message: msg };
  }

  // Shape gate — minimum fields.
  if (
    typeof obj.pulledAt !== 'string' ||
    typeof obj.daysCovered !== 'number' ||
    !Array.isArray(obj.threads) ||
    typeof obj.recipientIndex !== 'object' ||
    obj.recipientIndex === null
  ) {
    const msg = `[gmail-sent-cache] Malformed v2 envelope at ${path} (missing required fields). Will refetch.`;
    console.warn(msg);
    return { ok: false, reason: 'malformed', message: msg };
  }

  return {
    ok: true,
    cache: {
      version: 2,
      pulledAt: obj.pulledAt,
      daysCovered: obj.daysCovered,
      threads: obj.threads as EmailThread[],
      recipientIndex: obj.recipientIndex as Record<string, string[]>,
    },
  };
}

/**
 * Best-effort delete of the cache file at the given date (default today).
 * No-op if the file is already absent. Used after a `wrong-version`
 * read so the next pull can overwrite cleanly.
 */
export async function deleteGmailSentCache(
  storage: StorageAdapter,
  workspaceRoot: string,
  dateYYYYMMDD?: string,
): Promise<void> {
  const path = gmailSentCachePath(workspaceRoot, dateYYYYMMDD);
  try {
    await storage.delete(path);
  } catch {
    // Best-effort; storage adapter may throw on missing path.
  }
}
