/**
 * Tests for GmailProvider.
 *
 * searchThreads makes two calls:
 *   1. users messages list  → returns {messages: [{id, threadId}]}
 *   2. users messages get   → returns full message with headers (one per ID)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GmailProvider } from '../../../src/integrations/gws/gmail.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';

// ---------------------------------------------------------------------------
// Fixtures (inline — Gmail API returns different shapes for list vs get)
// ---------------------------------------------------------------------------

const MESSAGE_1 = {
  id: 'msg-1',
  threadId: 'thread-1',
  labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
  snippet: 'Please review the Q2 roadmap by Friday',
  payload: {
    headers: [
      { name: 'Subject', value: 'Q2 Roadmap Review' },
      { name: 'From', value: 'Jane Smith <jane@example.com>' },
      { name: 'Date', value: 'Fri, 03 Apr 2026 10:30:00 -0500' },
    ],
  },
};

const MESSAGE_2 = {
  id: 'msg-2',
  threadId: 'thread-2',
  labelIds: ['INBOX', 'IMPORTANT'],
  snippet: 'The vendor contract has been signed',
  payload: {
    headers: [
      { name: 'Subject', value: 'Re: Vendor Contract' },
      { name: 'From', value: 'Bob Lee <bob@example.com>' },
      { name: 'Date', value: 'Thu, 02 Apr 2026 14:00:00 -0500' },
    ],
  },
};

const MESSAGE_ID_LIST = {
  messages: [
    { id: 'msg-1', threadId: 'thread-1' },
    { id: 'msg-2', threadId: 'thread-2' },
  ],
};

const MESSAGES_BY_ID: Record<string, unknown> = {
  'msg-1': MESSAGE_1,
  'msg-2': MESSAGE_2,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Makes a GwsDeps that handles the two-call Gmail pattern.
 * List calls (args includes 'list') return the ID list.
 * Get calls (args includes 'get') return per-message detail keyed by id in --params.
 */
function makeGmailDeps(
  listResponse: unknown = MESSAGE_ID_LIST,
  messageDetails: Record<string, unknown> = MESSAGES_BY_ID,
): GwsDeps {
  return {
    exec: async (_command: string, args: string[]) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.22.1', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: true }), stderr: '' };
      }

      if (args[0] !== 'gmail') return { stdout: '{}', stderr: '' };

      const paramsIdx = args.indexOf('--params');
      const params = paramsIdx >= 0 ? JSON.parse(args[paramsIdx + 1]) as Record<string, unknown> : {};

      if (args.includes('list')) {
        return { stdout: JSON.stringify(listResponse), stderr: '' };
      }

      if (args.includes('get') && typeof params.id === 'string') {
        const msg = messageDetails[params.id] ?? {};
        return { stdout: JSON.stringify(msg), stderr: '' };
      }

      return { stdout: '{}', stderr: '' };
    },
  };
}

function makeNotInstalledDeps(): GwsDeps {
  return {
    exec: async () => {
      const err = new Error('spawn gws ENOENT') as Error & { code: string };
      err.code = 'ENOENT';
      throw err;
    },
  };
}

function makeUnauthenticatedDeps(): GwsDeps {
  return {
    exec: async (_command: string, args: string[]) => {
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.22.1', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: false }), stderr: '' };
      }
      return { stdout: '{}', stderr: '' };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GmailProvider', () => {
  describe('searchThreads', () => {
    it('issues a list call then get calls for each message ID', async () => {
      const calls: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_cmd: string, args: string[]) => {
          calls.push(args);
          if (args.includes('list')) {
            return { stdout: JSON.stringify(MESSAGE_ID_LIST), stderr: '' };
          }
          const paramsIdx = args.indexOf('--params');
          const params = paramsIdx >= 0 ? JSON.parse(args[paramsIdx + 1]) as Record<string, unknown> : {};
          const id = params.id as string | undefined;
          return { stdout: JSON.stringify(MESSAGES_BY_ID[id ?? ''] ?? {}), stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      await provider.searchThreads('is:unread', { maxResults: 5 });

      const listCall = calls.find((a) => a.includes('list'));
      assert.ok(listCall, 'Expected a list call');
      assert.equal(listCall[0], 'gmail');
      assert.ok(listCall.includes('--params'), 'list call should use --params');

      const getCalls = calls.filter((a) => a.includes('get'));
      assert.ok(getCalls.length > 0, 'Expected at least one get call for message metadata');
    });

    it('passes query and maxResults in list --params', async () => {
      const calls: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_cmd: string, args: string[]) => {
          calls.push(args);
          if (args.includes('list')) {
            return { stdout: JSON.stringify({ messages: [] }), stderr: '' };
          }
          return { stdout: '{}', stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      await provider.searchThreads('is:unread', { maxResults: 5 });

      const listCall = calls.find((a) => a.includes('list'));
      assert.ok(listCall);
      const paramsIdx = listCall.indexOf('--params');
      const params = JSON.parse(listCall[paramsIdx + 1]) as Record<string, unknown>;
      assert.equal(params.userId, 'me');
      assert.equal(params.q, 'is:unread');
      assert.equal(params.maxResults, 5);
    });

    it('maps response to EmailThread array with full metadata', async () => {
      const deps = makeGmailDeps();
      const provider = new GmailProvider(deps);
      const threads = await provider.searchThreads('is:unread');

      assert.equal(threads.length, 2);

      assert.equal(threads[0].id, 'msg-1');
      assert.equal(threads[0].subject, 'Q2 Roadmap Review');
      assert.equal(threads[0].from, 'Jane Smith <jane@example.com>');
      assert.equal(threads[0].snippet, 'Please review the Q2 roadmap by Friday');
      assert.equal(threads[0].unread, true);
      assert.ok(threads[0].labels.includes('IMPORTANT'));

      assert.equal(threads[1].id, 'msg-2');
      assert.equal(threads[1].subject, 'Re: Vendor Contract');
      assert.equal(threads[1].unread, false);
    });

    it('returns empty array when list response has no messages', async () => {
      const deps = makeGmailDeps({ messages: [] });
      const provider = new GmailProvider(deps);
      const threads = await provider.searchThreads('is:unread');

      assert.equal(threads.length, 0);
    });

    it('skips messages whose get call fails', async () => {
      const deps: GwsDeps = {
        exec: async (_cmd: string, args: string[]) => {
          if (args.includes('list')) {
            return { stdout: JSON.stringify(MESSAGE_ID_LIST), stderr: '' };
          }
          if (args.includes('get')) {
            const paramsIdx = args.indexOf('--params');
            const params = JSON.parse(args[paramsIdx + 1]) as Record<string, unknown>;
            if (params.id === 'msg-1') throw Object.assign(new Error('API error'), { stderr: 'API error' });
            return { stdout: JSON.stringify(MESSAGE_2), stderr: '' };
          }
          return { stdout: '{}', stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      const threads = await provider.searchThreads('is:unread');

      // msg-1 get failed → skipped; msg-2 succeeds
      assert.equal(threads.length, 1);
      assert.equal(threads[0].id, 'msg-2');
    });
  });

  describe('getImportantUnread', () => {
    it('uses the correct Gmail query in list --params', async () => {
      const calls: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_cmd: string, args: string[]) => {
          calls.push(args);
          if (args.includes('list')) {
            return { stdout: JSON.stringify({ messages: [] }), stderr: '' };
          }
          return { stdout: '{}', stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      await provider.getImportantUnread({ maxResults: 10 });

      const listCall = calls.find((a) => a.includes('list'));
      assert.ok(listCall);
      const paramsIdx = listCall.indexOf('--params');
      const params = JSON.parse(listCall[paramsIdx + 1]) as Record<string, unknown>;
      const q = params.q as string;
      assert.ok(q.includes('is:important'), 'Query should include is:important');
      assert.ok(q.includes('is:unread'), 'Query should include is:unread');
      assert.ok(q.includes('-category:promotions'), 'Query should exclude promotions');
      assert.ok(q.includes('-category:social'), 'Query should exclude social');
    });
  });

  describe('getThread', () => {
    it('fetches single message by ID using users messages get', async () => {
      const calls: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_cmd: string, args: string[]) => {
          calls.push(args);
          return { stdout: JSON.stringify(MESSAGE_1), stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      const thread = await provider.getThread('msg-1');

      assert.equal(thread.id, 'msg-1');
      assert.equal(thread.subject, 'Q2 Roadmap Review');
      assert.equal(thread.from, 'Jane Smith <jane@example.com>');
      assert.equal(thread.unread, true);

      const getCall = calls.find((a) => a.includes('get'));
      assert.ok(getCall, 'Expected a get call');
      const paramsIdx = getCall.indexOf('--params');
      const params = JSON.parse(getCall[paramsIdx + 1]) as Record<string, unknown>;
      assert.equal(params.id, 'msg-1');
      assert.equal(params.userId, 'me');
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeGmailDeps();
      const provider = new GmailProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, true);
    });

    it('returns false when gws is not installed', async () => {
      const deps = makeNotInstalledDeps();
      const provider = new GmailProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });

    it('returns false when gws is not authenticated', async () => {
      const deps = makeUnauthenticatedDeps();
      const provider = new GmailProvider(deps);
      const result = await provider.isAvailable();
      assert.equal(result, false);
    });
  });
});
