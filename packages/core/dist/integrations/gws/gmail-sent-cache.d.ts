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
import type { StorageAdapter } from '../../storage/adapter.js';
import type { EmailThread, GmailSentCache } from './types.js';
/**
 * Build the canonical cache path for a given date.
 * `dateYYYYMMDD` defaults to today (UTC) when not provided.
 */
export declare function gmailSentCachePath(workspaceRoot: string, dateYYYYMMDD?: string): string;
/**
 * Build a `normalizedEmail → thread.id[]` index from a thread list.
 *
 * Includes to + cc + bcc. Skips empties + malformed addresses.
 */
export declare function buildRecipientIndex(threads: EmailThread[]): Record<string, string[]>;
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
export declare function writeGmailSentCache(storage: StorageAdapter, workspaceRoot: string, threads: EmailThread[], opts: WriteCacheOpts): Promise<string>;
export type ReadCacheResult = {
    ok: true;
    cache: GmailSentCache;
} | {
    ok: false;
    reason: 'missing' | 'unparseable' | 'wrong-version' | 'malformed';
    message: string;
};
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
export declare function readGmailSentCache(storage: StorageAdapter, workspaceRoot: string, dateYYYYMMDD?: string): Promise<ReadCacheResult>;
/**
 * Best-effort delete of the cache file at the given date (default today).
 * No-op if the file is already absent. Used after a `wrong-version`
 * read so the next pull can overwrite cleanly.
 */
export declare function deleteGmailSentCache(storage: StorageAdapter, workspaceRoot: string, dateYYYYMMDD?: string): Promise<void>;
//# sourceMappingURL=gmail-sent-cache.d.ts.map