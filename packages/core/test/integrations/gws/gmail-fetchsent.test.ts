/**
 * Tests for GmailProvider.fetchSent (Phase 11-pre, F4).
 *
 * Covers:
 *  - List → 5 messages → fetch all 5 (metadata mode)
 *  - format='full' decodes plain-text body (base64url)
 *  - MIME walk: multipart/alternative with text/plain + text/html prefers plain
 *  - Attachment metadata extraction (no payload)
 *  - fetchBody=false → no body fetched, format=metadata used
 *  - Rate-limit (429) response → retry with backoff → succeeds
 *  - Multi-recipient parsing (to, cc, bcc) — normalized
 *  - Query building: in:sent + after:YYYY/MM/DD + user query
 *  - Internal `__testing__` helpers (decode, MIME walk, address parsing)
 *
 * All tests use mocked GwsDeps — NO real Gmail API calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GmailProvider, __testing__ } from '../../../src/integrations/gws/gmail.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Fixtures — fully-decoded Gmail API response shapes for Sent messages.
// ---------------------------------------------------------------------------

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const PLAIN_BODY_TEXT = 'Hi Jane,\n\nHere is the Q2 roadmap.\n\n-John';
const HTML_BODY_TEXT = '<html><body><p>Hi Jane,</p><p>Here is the Q2 roadmap.</p></body></html>';

const SENT_MSG_FULL = {
  id: 'sent-1',
  threadId: 'sent-thread-1',
  labelIds: ['SENT'],
  snippet: 'Here is the Q2 roadmap',
  internalDate: String(new Date('2026-04-03T15:30:00.000Z').getTime()),
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'Subject', value: 'Q2 Roadmap' },
      { name: 'From', value: 'John Koht <john@example.com>' },
      { name: 'To', value: 'Jane Smith <jane@example.com>, Bob <BOB@example.com>' },
      { name: 'Cc', value: 'carol@example.com' },
      { name: 'Date', value: 'Fri, 03 Apr 2026 10:30:00 -0500' },
    ],
    parts: [
      {
        mimeType: 'multipart/alternative',
        body: { size: 0 },
        parts: [
          {
            mimeType: 'text/plain',
            body: { size: PLAIN_BODY_TEXT.length, data: base64UrlEncode(PLAIN_BODY_TEXT) },
          },
          {
            mimeType: 'text/html',
            body: { size: HTML_BODY_TEXT.length, data: base64UrlEncode(HTML_BODY_TEXT) },
          },
        ],
      },
      {
        mimeType: 'application/pdf',
        filename: 'roadmap-q2.pdf',
        body: { attachmentId: 'att-1', size: 12345 },
      },
    ],
  },
};

const SENT_MSG_METADATA = {
  id: 'sent-2',
  threadId: 'sent-thread-2',
  labelIds: ['SENT'],
  snippet: 'Decision summary',
  internalDate: String(new Date('2026-04-02T18:00:00.000Z').getTime()),
  payload: {
    headers: [
      { name: 'Subject', value: 'Decision' },
      { name: 'From', value: 'john@example.com' },
      { name: 'To', value: 'jane@example.com' },
      { name: 'Date', value: 'Thu, 02 Apr 2026 13:00:00 -0500' },
    ],
  },
};

const FIVE_MESSAGES_LIST = {
  messages: [
    { id: 'm1', threadId: 't1' },
    { id: 'm2', threadId: 't2' },
    { id: 'm3', threadId: 't3' },
    { id: 'm4', threadId: 't4' },
    { id: 'm5', threadId: 't5' },
  ],
};

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

function makeFetchSentDeps(opts: {
  listResponse?: unknown;
  messageDetails?: Record<string, unknown>;
  /** Inject a 429 response on the Nth call (1-indexed). */
  rateLimitOnCall?: number;
  /** Track calls. Filled by builder. */
  calls?: { service: string; args: string[] }[];
}): GwsDeps {
  const calls = opts.calls ?? [];
  let callCount = 0;
  return {
    exec: async (_command: string, args: string[]) => {
      callCount++;
      calls.push({ service: args[0] ?? '', args });

      if (args.includes('--version')) {
        return { stdout: 'gws version 0.22.1', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: true }), stderr: '' };
      }
      if (args[0] !== 'gmail') return { stdout: '{}', stderr: '' };

      // Rate-limit injection.
      if (opts.rateLimitOnCall === callCount) {
        const err = new Error('gws command failed: HTTP 429 rateLimitExceeded') as Error & {
          stderr?: string;
        };
        err.stderr = 'HTTP 429 rateLimitExceeded';
        throw err;
      }

      const paramsIdx = args.indexOf('--params');
      const params =
        paramsIdx >= 0
          ? (JSON.parse(args[paramsIdx + 1]) as Record<string, unknown>)
          : {};

      if (args.includes('list')) {
        return {
          stdout: JSON.stringify(opts.listResponse ?? FIVE_MESSAGES_LIST),
          stderr: '',
        };
      }

      if (args.includes('get') && typeof params.id === 'string') {
        const msg = (opts.messageDetails ?? {})[params.id] ?? null;
        return { stdout: JSON.stringify(msg ?? {}), stderr: '' };
      }

      return { stdout: '{}', stderr: '' };
    },
  };
}

// ---------------------------------------------------------------------------
// __testing__ internal helpers
// ---------------------------------------------------------------------------

describe('Gmail Sent extraction internals (Phase 11-pre)', () => {
  describe('decodeBase64Url', () => {
    it('decodes a basic base64url string', () => {
      const out = __testing__.decodeBase64Url(base64UrlEncode('Hello, world!'));
      assert.equal(out, 'Hello, world!');
    });

    it('handles URL-safe characters (- and _)', () => {
      // Construct a string whose std base64 contains + and /, then convert.
      const std = Buffer.from('?>?>').toString('base64'); // 'Pz4/Pg=='
      assert.ok(std.includes('/'), 'precondition: std b64 has /');
      const urlSafe = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      assert.equal(__testing__.decodeBase64Url(urlSafe), '?>?>');
    });

    it('returns empty for undefined/empty', () => {
      assert.equal(__testing__.decodeBase64Url(undefined), '');
      assert.equal(__testing__.decodeBase64Url(''), '');
    });
  });

  describe('parseAddressList', () => {
    it('parses single address', () => {
      assert.deepEqual(__testing__.parseAddressList('jane@example.com'), ['jane@example.com']);
    });

    it('parses multiple addresses, mixed forms', () => {
      assert.deepEqual(
        __testing__.parseAddressList('Jane <jane@x.com>, BOB@y.com, "Carol" <carol@z.com>'),
        ['jane@x.com', 'bob@y.com', 'carol@z.com'],
      );
    });

    it('returns [] for empty input', () => {
      assert.deepEqual(__testing__.parseAddressList(''), []);
    });

    it('skips malformed entries', () => {
      assert.deepEqual(
        __testing__.parseAddressList('jane@x.com, not-an-email, , bob@y.com'),
        ['jane@x.com', 'bob@y.com'],
      );
    });
  });

  describe('extractBody (MIME walk)', () => {
    it('prefers text/plain over text/html in multipart/alternative', () => {
      const body = __testing__.extractBody(SENT_MSG_FULL.payload);
      assert.equal(body, PLAIN_BODY_TEXT);
    });

    it('falls back to HTML (stripped) when no text/plain', () => {
      const payload = {
        mimeType: 'multipart/alternative',
        parts: [
          {
            mimeType: 'text/html',
            body: { data: base64UrlEncode('<p>Hello</p>') },
          },
        ],
      };
      assert.equal(__testing__.extractBody(payload), 'Hello');
    });

    it('decodes single-part text/plain', () => {
      const payload = {
        mimeType: 'text/plain',
        body: { data: base64UrlEncode('Single part') },
      };
      assert.equal(__testing__.extractBody(payload), 'Single part');
    });

    it('returns empty for unknown mime type with no parts', () => {
      assert.equal(__testing__.extractBody({ mimeType: 'application/zip' }), '');
    });
  });

  describe('extractAttachments', () => {
    it('extracts attachment metadata only (no payload)', () => {
      const atts = __testing__.extractAttachments(SENT_MSG_FULL.payload);
      assert.ok(atts);
      assert.equal(atts.length, 1);
      assert.equal(atts[0].filename, 'roadmap-q2.pdf');
      assert.equal(atts[0].mimeType, 'application/pdf');
      assert.equal(atts[0].sizeBytes, 12345);
    });

    it('skips parts without filenames (inline images, body parts)', () => {
      const atts = __testing__.extractAttachments({
        mimeType: 'multipart/mixed',
        parts: [
          { mimeType: 'text/plain', body: { size: 10, data: 'aGVsbG8' } }, // no filename
        ],
      });
      assert.deepEqual(atts, []);
    });
  });

  describe('isRateLimitError', () => {
    it('returns true for 429 in message', () => {
      assert.equal(__testing__.isRateLimitError(new Error('HTTP 429 rateLimit')), true);
    });

    it('returns true for "quota" in message', () => {
      assert.equal(__testing__.isRateLimitError(new Error('Daily quota exceeded')), true);
    });

    it('returns true for "userRateLimitExceeded"', () => {
      assert.equal(
        __testing__.isRateLimitError(new Error('userRateLimitExceeded')),
        true,
      );
    });

    it('returns false for unrelated errors', () => {
      assert.equal(__testing__.isRateLimitError(new Error('500 internal')), false);
    });
  });

  describe('withRateLimitRetry', () => {
    it('returns immediately on success', async () => {
      const result = await __testing__.withRateLimitRetry(async () => 'ok');
      assert.equal(result, 'ok');
    });

    it('retries on 429 then succeeds', async () => {
      let calls = 0;
      const result = await __testing__.withRateLimitRetry(
        async () => {
          calls++;
          if (calls < 3) throw new Error('HTTP 429');
          return 'ok';
        },
        { baseDelayMs: 1, sleep: async () => {} },
      );
      assert.equal(result, 'ok');
      assert.equal(calls, 3);
    });

    it('rethrows non-rate-limit errors immediately', async () => {
      let calls = 0;
      await assert.rejects(
        () =>
          __testing__.withRateLimitRetry(async () => {
            calls++;
            throw new Error('500 internal server error');
          }),
        /500 internal/,
      );
      assert.equal(calls, 1);
    });

    it('gives up after maxRetries', async () => {
      let calls = 0;
      await assert.rejects(
        () =>
          __testing__.withRateLimitRetry(
            async () => {
              calls++;
              throw new Error('HTTP 429');
            },
            { maxRetries: 2, baseDelayMs: 1, sleep: async () => {} },
          ),
        /429/,
      );
      assert.equal(calls, 3); // initial + 2 retries
    });
  });
});

// ---------------------------------------------------------------------------
// GmailProvider.fetchSent — integration with mocked deps
// ---------------------------------------------------------------------------

describe('GmailProvider.fetchSent — Phase 11-pre F4', () => {
  it('Sent folder list returns 5 messages → fetches all 5 (metadata mode)', async () => {
    const calls: { service: string; args: string[] }[] = [];
    const messages = Object.fromEntries(
      ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => [
        id,
        { ...SENT_MSG_METADATA, id },
      ]),
    );
    const deps = makeFetchSentDeps({ messageDetails: messages, calls });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ limit: 50 });

    assert.equal(threads.length, 5);
    const ids = threads.map((t) => t.id).sort();
    assert.deepEqual(ids, ['m1', 'm2', 'm3', 'm4', 'm5']);

    // 1 list call + 5 get calls.
    const listCalls = calls.filter((c) => c.args.includes('list'));
    const getCalls = calls.filter((c) => c.args.includes('get'));
    assert.equal(listCalls.length, 1);
    assert.equal(getCalls.length, 5);
  });

  it('format=full decodes body correctly (multipart with plain + html → prefers plain)', async () => {
    const deps = makeFetchSentDeps({
      listResponse: { messages: [{ id: 'sent-1', threadId: 'sent-thread-1' }] },
      messageDetails: { 'sent-1': SENT_MSG_FULL },
    });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ fetchBody: true });

    assert.equal(threads.length, 1);
    assert.equal(threads[0].body, PLAIN_BODY_TEXT);
    assert.equal(threads[0].subject, 'Q2 Roadmap');
    assert.equal(threads[0].sentAt, '2026-04-03T15:30:00.000Z');
    assert.equal(threads[0].cacheVersion, 2);
  });

  it('extracts attachment metadata (filename, mimeType, sizeBytes)', async () => {
    const deps = makeFetchSentDeps({
      listResponse: { messages: [{ id: 'sent-1', threadId: 'sent-thread-1' }] },
      messageDetails: { 'sent-1': SENT_MSG_FULL },
    });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ fetchBody: true });

    assert.equal(threads[0].attachments?.length, 1);
    assert.equal(threads[0].attachments?.[0].filename, 'roadmap-q2.pdf');
    assert.equal(threads[0].attachments?.[0].mimeType, 'application/pdf');
    assert.equal(threads[0].attachments?.[0].sizeBytes, 12345);
  });

  it('fetchBody=false uses format=metadata + skips body (smaller payload)', async () => {
    const calls: { service: string; args: string[] }[] = [];
    const deps = makeFetchSentDeps({
      listResponse: { messages: [{ id: 'sent-2', threadId: 'sent-thread-2' }] },
      messageDetails: { 'sent-2': SENT_MSG_METADATA },
      calls,
    });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ fetchBody: false });

    assert.equal(threads.length, 1);
    // body should be undefined (NOT empty string) when fetchBody=false.
    assert.equal(threads[0].body, undefined);

    // The get call params should specify format=metadata + metadataHeaders.
    const getCall = calls.find((c) => c.args.includes('get'));
    assert.ok(getCall);
    const paramsIdx = getCall.args.indexOf('--params');
    const params = JSON.parse(getCall.args[paramsIdx + 1]) as Record<string, unknown>;
    assert.equal(params.format, 'metadata');
    assert.ok(Array.isArray(params.metadataHeaders));
    const headers = params.metadataHeaders as string[];
    assert.ok(headers.includes('To'));
    assert.ok(headers.includes('Cc'));
    assert.ok(headers.includes('Bcc'));
  });

  it('rate-limit (429) on first list call → retries → succeeds', async () => {
    const calls: { service: string; args: string[] }[] = [];
    const deps = makeFetchSentDeps({
      // Override id in the detail blob to match the listed id.
      messageDetails: { m1: { ...SENT_MSG_METADATA, id: 'm1' } },
      listResponse: { messages: [{ id: 'm1', threadId: 't1' }] },
      rateLimitOnCall: 1, // First call (the list) gets 429.
      calls,
    });
    const provider = new GmailProvider(deps);

    // The retry wrapper uses real timers; default baseDelay is 250ms so
    // the first retry waits ~250ms. Bounded — acceptable for a test.
    const threads = await provider.fetchSent({ limit: 5 });

    assert.equal(threads.length, 1);
    assert.equal(threads[0].id, 'm1');

    // Confirm we observed >1 list-call attempt (i.e. the retry happened).
    const listCalls = calls.filter((c) => c.args.includes('list'));
    assert.ok(
      listCalls.length >= 2,
      `expected ≥2 list-call attempts after 429, got ${listCalls.length}`,
    );
  });

  it('parses multi-recipient to/cc/bcc and normalizes', async () => {
    const deps = makeFetchSentDeps({
      listResponse: { messages: [{ id: 'sent-1', threadId: 'sent-thread-1' }] },
      messageDetails: { 'sent-1': SENT_MSG_FULL },
    });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ fetchBody: true });

    assert.deepEqual(threads[0].to, ['jane@example.com', 'bob@example.com']);
    assert.deepEqual(threads[0].cc, ['carol@example.com']);
    assert.deepEqual(threads[0].bcc, []);
  });

  it('builds the right query: in:sent + after:YYYY/MM/DD + user query', async () => {
    const calls: { service: string; args: string[] }[] = [];
    const deps = makeFetchSentDeps({
      listResponse: { messages: [] },
      calls,
    });
    const provider = new GmailProvider(deps);
    await provider.fetchSent({
      sinceDate: '2026-05-15',
      query: 'subject:roadmap',
    });

    const listCall = calls.find((c) => c.args.includes('list'));
    assert.ok(listCall);
    const paramsIdx = listCall.args.indexOf('--params');
    const params = JSON.parse(listCall.args[paramsIdx + 1]) as Record<string, unknown>;
    assert.equal(params.q, 'in:sent after:2026/05/15 subject:roadmap');
  });

  it('returns empty array when list has no messages', async () => {
    const deps = makeFetchSentDeps({ listResponse: { messages: [] } });
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent();
    assert.deepEqual(threads, []);
  });

  it('skips per-message failures (best-effort)', async () => {
    const deps: GwsDeps = {
      exec: async (_cmd, args) => {
        if (args.includes('--version')) {
          return { stdout: 'gws version 0.22.1', stderr: '' };
        }
        if (args.includes('list')) {
          return {
            stdout: JSON.stringify({
              messages: [
                { id: 'm1', threadId: 't1' },
                { id: 'm2', threadId: 't2' },
              ],
            }),
            stderr: '',
          };
        }
        if (args.includes('get')) {
          const paramsIdx = args.indexOf('--params');
          const params = JSON.parse(args[paramsIdx + 1]) as Record<string, unknown>;
          if (params.id === 'm1') {
            throw new Error('500 internal server error');
          }
          return { stdout: JSON.stringify({ ...SENT_MSG_METADATA, id: 'm2' }), stderr: '' };
        }
        return { stdout: '{}', stderr: '' };
      },
    };
    const provider = new GmailProvider(deps);
    const threads = await provider.fetchSent({ limit: 5 });

    // m1 get failed → skipped; m2 succeeds.
    assert.equal(threads.length, 1);
    assert.equal(threads[0].id, 'm2');
  });
});
