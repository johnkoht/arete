/**
 * Tests for the extended EmailThread shape (Phase 11-pre, F4).
 *
 * Verifies:
 *  - Backward-compat: pre-11-pre shape (7 fields, no extras) still
 *    type-checks and serializes identically (snapshot).
 *  - Forward-compat: 11-pre extension (`to/cc/body/attachments/sentAt/cacheVersion`)
 *    is OPTIONAL — code reading just the base fields works on both.
 *  - normalizeEmail() handles the documented input forms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  GMAIL_SENT_CACHE_VERSION,
} from '../../../src/integrations/gws/types.js';
import type {
  EmailThread,
  GmailSentCache,
} from '../../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Snapshots — pre-11-pre shape (base fields only).
// ---------------------------------------------------------------------------

const PRE_EXTENSION_THREAD: EmailThread = {
  id: 'thread-1',
  subject: 'Q2 Roadmap Review',
  snippet: 'Please review the Q2 roadmap by Friday',
  from: 'Jane Smith <jane@example.com>',
  date: 'Fri, 03 Apr 2026 10:30:00 -0500',
  labels: ['INBOX', 'IMPORTANT'],
  unread: true,
};

const PRE_EXTENSION_SNAPSHOT_JSON = JSON.stringify(PRE_EXTENSION_THREAD);

const POST_EXTENSION_THREAD: EmailThread = {
  id: 'thread-1',
  subject: 'Sent: Q2 Roadmap',
  snippet: 'Here is the Q2 roadmap...',
  from: 'me@example.com',
  date: 'Fri, 03 Apr 2026 10:30:00 -0500',
  labels: ['SENT'],
  unread: false,
  to: ['jane@example.com'],
  cc: ['bob@example.com'],
  bcc: [],
  body: 'Here is the Q2 roadmap.\n\nLet me know.',
  attachments: [
    { filename: 'roadmap-q2.pdf', mimeType: 'application/pdf', sizeBytes: 12345 },
  ],
  sentAt: '2026-04-03T15:30:00.000Z',
  cacheVersion: 2,
};

describe('EmailThread shape — Phase 11-pre F4', () => {
  describe('backward compatibility (pre-11-pre snapshot)', () => {
    it('pre-extension thread still type-checks against current EmailThread', () => {
      // If this compiles, backward compat passes at the type layer.
      const t: EmailThread = PRE_EXTENSION_THREAD;
      assert.equal(t.id, 'thread-1');
      assert.equal(t.subject, 'Q2 Roadmap Review');
      assert.equal(t.unread, true);
    });

    it('pre-extension JSON snapshot remains byte-identical', () => {
      // Critical: existing v1 cache JSON (no new fields) must still round-trip
      // via JSON.parse without loss.
      const reparsed = JSON.parse(PRE_EXTENSION_SNAPSHOT_JSON) as EmailThread;
      assert.equal(reparsed.id, 'thread-1');
      assert.equal(reparsed.subject, 'Q2 Roadmap Review');
      assert.equal(reparsed.labels.length, 2);
      // New fields must be undefined (NOT empty arrays) on pre-extension threads.
      assert.equal(reparsed.to, undefined);
      assert.equal(reparsed.cc, undefined);
      assert.equal(reparsed.body, undefined);
      assert.equal(reparsed.attachments, undefined);
      assert.equal(reparsed.sentAt, undefined);
    });

    it('JSON.stringify omits undefined new fields (serialization gate)', () => {
      // fetchBody=false mode: new fields should be absent from output.
      const out = JSON.stringify(PRE_EXTENSION_THREAD);
      assert.equal(out.includes('"to"'), false, '"to" must be omitted');
      assert.equal(out.includes('"cc"'), false, '"cc" must be omitted');
      assert.equal(out.includes('"body"'), false, '"body" must be omitted');
      assert.equal(
        out.includes('"attachments"'),
        false,
        '"attachments" must be omitted',
      );
      assert.equal(out.includes('"sentAt"'), false, '"sentAt" must be omitted');
    });
  });

  describe('forward compatibility (post-11-pre snapshot)', () => {
    it('post-extension thread carries new fields when fetchBody=true', () => {
      assert.deepEqual(POST_EXTENSION_THREAD.to, ['jane@example.com']);
      assert.deepEqual(POST_EXTENSION_THREAD.cc, ['bob@example.com']);
      assert.deepEqual(POST_EXTENSION_THREAD.bcc, []);
      assert.equal(typeof POST_EXTENSION_THREAD.body, 'string');
      assert.equal(POST_EXTENSION_THREAD.attachments?.length, 1);
      assert.equal(POST_EXTENSION_THREAD.attachments?.[0].filename, 'roadmap-q2.pdf');
      assert.equal(POST_EXTENSION_THREAD.sentAt, '2026-04-03T15:30:00.000Z');
      assert.equal(POST_EXTENSION_THREAD.cacheVersion, 2);
    });

    it('JSON.stringify emits new fields when present', () => {
      const out = JSON.stringify(POST_EXTENSION_THREAD);
      assert.ok(out.includes('"to":["jane@example.com"]'), 'to[] present');
      assert.ok(out.includes('"body"'), 'body present');
      assert.ok(out.includes('"attachments"'), 'attachments present');
      assert.ok(out.includes('"sentAt"'), 'sentAt present');
      assert.ok(out.includes('"cacheVersion":2'), 'cacheVersion present');
    });

    it('round-trips through JSON without loss', () => {
      const reparsed = JSON.parse(JSON.stringify(POST_EXTENSION_THREAD)) as EmailThread;
      assert.deepEqual(reparsed, POST_EXTENSION_THREAD);
    });
  });

  describe('GmailSentCache envelope', () => {
    it('exposes version constant = 2', () => {
      assert.equal(GMAIL_SENT_CACHE_VERSION, 2);
    });

    it('envelope shape carries version, pulledAt, threads, recipientIndex', () => {
      const cache: GmailSentCache = {
        version: 2,
        pulledAt: '2026-06-01T12:00:00.000Z',
        daysCovered: 14,
        threads: [POST_EXTENSION_THREAD],
        recipientIndex: { 'jane@example.com': ['thread-1'] },
      };
      assert.equal(cache.version, 2);
      assert.equal(cache.daysCovered, 14);
      assert.equal(cache.threads.length, 1);
      assert.equal(cache.recipientIndex['jane@example.com'][0], 'thread-1');
    });
  });
});

describe('normalizeEmail() — Phase 11-pre eng MC1', () => {
  it('lowercases bare email', () => {
    assert.equal(normalizeEmail('Jane@Example.COM'), 'jane@example.com');
  });

  it('strips whitespace', () => {
    assert.equal(normalizeEmail('  jane@example.com  '), 'jane@example.com');
  });

  it('extracts address from "Name <email>" form', () => {
    assert.equal(
      normalizeEmail('Jane Smith <jane@example.com>'),
      'jane@example.com',
    );
  });

  it('handles quoted display name', () => {
    assert.equal(
      normalizeEmail('"Smith, Jane" <jane.smith@example.com>'),
      'jane.smith@example.com',
    );
  });

  it('returns empty for empty/null/undefined input', () => {
    assert.equal(normalizeEmail(''), '');
    assert.equal(normalizeEmail(null), '');
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(normalizeEmail('   '), '');
  });

  it('returns empty for unparseable input (no @)', () => {
    assert.equal(normalizeEmail('not-an-email'), '');
    assert.equal(normalizeEmail('Jane Smith'), '');
  });

  it('returns empty for malformed (missing local or domain)', () => {
    assert.equal(normalizeEmail('@example.com'), '');
    assert.equal(normalizeEmail('jane@'), '');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('Jane Smith <Jane@Example.COM>');
    const twice = normalizeEmail(once);
    assert.equal(twice, once);
    assert.equal(twice, 'jane@example.com');
  });
});
