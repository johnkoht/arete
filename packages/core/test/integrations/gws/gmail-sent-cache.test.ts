/**
 * Tests for Gmail Sent-folder cache reader / writer (Phase 11-pre, F4).
 *
 * Covers:
 *  - write + read round-trip
 *  - missing file → reason: 'missing'
 *  - v1 cache (no version OR version: 1) → reason: 'wrong-version' (refetch)
 *  - parse error → reason: 'unparseable'
 *  - malformed (missing fields) → reason: 'malformed'
 *  - recipientIndex correctness (normalized email keys, includes to+cc+bcc)
 *  - delete on missing path is a no-op
 *
 * Uses FileStorageAdapter with a tmpdir — no fixtures committed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileStorageAdapter } from '../../../src/storage/file.js';
import {
  GMAIL_SENT_CACHE_VERSION,
} from '../../../src/integrations/gws/types.js';
import {
  gmailSentCachePath,
  buildRecipientIndex,
  writeGmailSentCache,
  readGmailSentCache,
  deleteGmailSentCache,
} from '../../../src/integrations/gws/gmail-sent-cache.js';
import type { EmailThread } from '../../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'thread-x',
    subject: 'Subj',
    snippet: 'snip',
    from: 'me@example.com',
    date: 'Fri, 03 Apr 2026 10:30:00 -0500',
    labels: ['SENT'],
    unread: false,
    to: ['jane@example.com'],
    cc: [],
    bcc: [],
    body: 'body',
    attachments: [],
    sentAt: '2026-04-03T15:30:00.000Z',
    cacheVersion: 2,
    ...overrides,
  };
}

// Suppress console.warn during tests so output stays clean.
function silenceWarn<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.warn;
  console.warn = () => {};
  return fn().finally(() => {
    console.warn = orig;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gmail-sent-cache — Phase 11-pre F4', () => {
  let tmp: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'arete-gmail-cache-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    if (tmp && existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  describe('gmailSentCachePath()', () => {
    it('builds the canonical path with explicit date', () => {
      const p = gmailSentCachePath('/ws', '2026-06-01');
      assert.equal(p, '/ws/.arete/cache/gmail-sent-2026-06-01.json');
    });

    it('defaults to today (UTC)', () => {
      const p = gmailSentCachePath('/ws');
      const today = new Date().toISOString().slice(0, 10);
      assert.equal(p, `/ws/.arete/cache/gmail-sent-${today}.json`);
    });
  });

  describe('buildRecipientIndex()', () => {
    it('builds normalized email → thread.id[] from to/cc/bcc', () => {
      const threads: EmailThread[] = [
        makeThread({
          id: 't1',
          to: ['Jane Smith <jane@example.com>'],
          cc: ['BOB@example.com'],
          bcc: ['carol@example.com'],
        }),
        makeThread({
          id: 't2',
          to: ['jane@example.com'], // same as t1
          cc: [],
        }),
      ];

      const idx = buildRecipientIndex(threads);
      assert.deepEqual(idx['jane@example.com'].sort(), ['t1', 't2']);
      assert.deepEqual(idx['bob@example.com'], ['t1']);
      assert.deepEqual(idx['carol@example.com'], ['t1']);
    });

    it('dedupes thread.id within a recipient', () => {
      const threads: EmailThread[] = [
        makeThread({ id: 't1', to: ['jane@example.com'], cc: ['jane@example.com'] }),
      ];
      const idx = buildRecipientIndex(threads);
      assert.deepEqual(idx['jane@example.com'], ['t1']);
    });

    it('skips malformed addresses', () => {
      const threads: EmailThread[] = [
        makeThread({ id: 't1', to: ['not-an-email', '', 'jane@example.com'] }),
      ];
      const idx = buildRecipientIndex(threads);
      assert.deepEqual(Object.keys(idx), ['jane@example.com']);
    });

    it('handles undefined/missing to/cc/bcc fields', () => {
      const t: EmailThread = {
        id: 't1',
        subject: '',
        snippet: '',
        from: '',
        date: '',
        labels: [],
        unread: false,
      };
      const idx = buildRecipientIndex([t]);
      assert.deepEqual(idx, {});
    });
  });

  describe('write + read round-trip', () => {
    it('writes envelope with version: 2, pulledAt, daysCovered, threads, recipientIndex', async () => {
      const threads = [makeThread({ id: 't1' })];
      const path = await writeGmailSentCache(storage, tmp, threads, {
        daysCovered: 14,
        pulledAt: '2026-06-01T12:00:00.000Z',
      });

      const raw = await storage.read(path);
      assert.ok(raw, 'cache file should exist');
      const parsed = JSON.parse(raw!) as Record<string, unknown>;
      assert.equal(parsed.version, GMAIL_SENT_CACHE_VERSION);
      assert.equal(parsed.pulledAt, '2026-06-01T12:00:00.000Z');
      assert.equal(parsed.daysCovered, 14);
      assert.equal((parsed.threads as unknown[]).length, 1);
      assert.ok(parsed.recipientIndex && typeof parsed.recipientIndex === 'object');
    });

    it('readGmailSentCache returns ok:true for a fresh write', async () => {
      const threads = [makeThread({ id: 't1' })];
      await writeGmailSentCache(storage, tmp, threads, {
        daysCovered: 7,
        dateYYYYMMDD: '2026-06-01',
      });

      const result = await readGmailSentCache(storage, tmp, '2026-06-01');
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.cache.version, 2);
        assert.equal(result.cache.daysCovered, 7);
        assert.equal(result.cache.threads.length, 1);
        assert.equal(result.cache.threads[0].id, 't1');
      }
    });
  });

  describe('invalidation — F4 versioning gate', () => {
    it('returns reason:missing when file does not exist', async () => {
      const result = await readGmailSentCache(storage, tmp, '2026-06-01');
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'missing');
    });

    it('rejects v1 cache (no version field) with reason:wrong-version', async () => {
      // Synthesize a v1-shape cache file manually.
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      const v1Envelope = {
        // version field deliberately absent
        pulledAt: '2026-06-01T12:00:00.000Z',
        daysCovered: 7,
        threads: [makeThread({ id: 't1' })],
      };
      writeFileSync(path, JSON.stringify(v1Envelope), 'utf8');

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, 'wrong-version');
        assert.ok(
          result.message.includes('missing (likely v1)'),
          `expected v1 message, got: ${result.message}`,
        );
      }
    });

    it('rejects cache with version:1 explicitly', async () => {
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          version: 1,
          pulledAt: 'x',
          daysCovered: 1,
          threads: [],
          recipientIndex: {},
        }),
        'utf8',
      );

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'wrong-version');
    });

    it('rejects future version (e.g. v3) with reason:wrong-version', async () => {
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          version: 3,
          pulledAt: 'x',
          daysCovered: 1,
          threads: [],
          recipientIndex: {},
        }),
        'utf8',
      );

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'wrong-version');
    });

    it('rejects unparseable JSON', async () => {
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(path, 'NOT JSON {{', 'utf8');

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'unparseable');
    });

    it('rejects malformed v2 (missing required fields)', async () => {
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ version: 2 /* missing all other fields */ }),
        'utf8',
      );

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'malformed');
    });

    it('rejects array-shaped JSON (not an envelope object)', async () => {
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(path, JSON.stringify([{ id: 't1' }]), 'utf8');

      const result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'malformed');
    });

    it('refetch flow: invalidate v1 → delete → write v2 → read ok', async () => {
      // 1. Synthesize v1.
      const path = gmailSentCachePath(tmp, '2026-06-01');
      mkdirSync(join(tmp, '.arete', 'cache'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ pulledAt: 'x', daysCovered: 1, threads: [] }),
        'utf8',
      );

      // 2. Reader rejects.
      let result = await silenceWarn(() =>
        readGmailSentCache(storage, tmp, '2026-06-01'),
      );
      assert.equal(result.ok, false);

      // 3. Caller deletes + refetches.
      await deleteGmailSentCache(storage, tmp, '2026-06-01');
      await writeGmailSentCache(storage, tmp, [makeThread({ id: 't1' })], {
        daysCovered: 7,
        dateYYYYMMDD: '2026-06-01',
      });

      // 4. Read succeeds.
      result = await readGmailSentCache(storage, tmp, '2026-06-01');
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.cache.threads[0].id, 't1');
      }
    });
  });

  describe('deleteGmailSentCache()', () => {
    it('no-ops when file is already absent', async () => {
      // Should not throw.
      await deleteGmailSentCache(storage, tmp, '2026-06-01');
    });

    it('removes an existing cache file', async () => {
      await writeGmailSentCache(storage, tmp, [makeThread()], {
        daysCovered: 1,
        dateYYYYMMDD: '2026-06-01',
      });
      const path = gmailSentCachePath(tmp, '2026-06-01');
      assert.ok(await storage.exists(path));
      await deleteGmailSentCache(storage, tmp, '2026-06-01');
      assert.equal(await storage.exists(path), false);
    });
  });
});
