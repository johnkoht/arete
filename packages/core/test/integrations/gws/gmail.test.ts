/**
 * Tests for GmailProvider.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GmailProvider } from '../../../src/integrations/gws/gmail.js';
import type { GwsDeps } from '../../../src/integrations/gws/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'gmail-messages.json'), 'utf-8'),
);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeDeps(responses: Record<string, string>): GwsDeps {
  return {
    exec: async (_command: string, args: string[]) => {
      // Detection calls
      if (args.includes('--version')) {
        return { stdout: 'gws version 0.5.2', stderr: '' };
      }
      if (args.includes('status')) {
        return { stdout: JSON.stringify({ authenticated: true }), stderr: '' };
      }

      // Gmail CLI calls — match on the key built from service+command
      const key = `${args[0]}_${args[1]}`;
      const stdout = responses[key] ?? '{}';
      return { stdout, stderr: '' };
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
        return { stdout: 'gws version 0.5.2', stderr: '' };
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
    it('calls gwsExec with correct args', async () => {
      const capturedArgs: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_command: string, args: string[]) => {
          capturedArgs.push(args);
          return { stdout: JSON.stringify({ messages: [] }), stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      await provider.searchThreads('is:unread', { maxResults: 5 });

      // Should have called with gmail messages --format json -q ... --maxResults ...
      const gmailCall = capturedArgs.find((a) => a[0] === 'gmail');
      assert.ok(gmailCall, 'Expected a gmail CLI call');
      assert.equal(gmailCall[1], 'messages');
      assert.ok(gmailCall.includes('-q'), 'Should include -q or --q flag');
      assert.ok(gmailCall.includes('is:unread'), 'Should include the query value');
      assert.ok(gmailCall.includes('--maxResults'), 'Should include --maxResults flag');
      assert.ok(gmailCall.includes('5'), 'Should include maxResults value');
    });

    it('maps response to EmailThread array', async () => {
      const deps = makeDeps({
        gmail_messages: JSON.stringify(fixture),
      });

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

    it('handles empty results', async () => {
      const deps = makeDeps({
        gmail_messages: JSON.stringify({ messages: [] }),
      });

      const provider = new GmailProvider(deps);
      const threads = await provider.searchThreads('is:unread');

      assert.equal(threads.length, 0);
    });
  });

  describe('getImportantUnread', () => {
    it('uses correct Gmail query', async () => {
      const capturedArgs: string[][] = [];
      const deps: GwsDeps = {
        exec: async (_command: string, args: string[]) => {
          capturedArgs.push(args);
          return { stdout: JSON.stringify({ messages: [] }), stderr: '' };
        },
      };

      const provider = new GmailProvider(deps);
      await provider.getImportantUnread({ maxResults: 10 });

      const gmailCall = capturedArgs.find((a) => a[0] === 'gmail');
      assert.ok(gmailCall, 'Expected a gmail CLI call');

      const qIndex = gmailCall.indexOf('-q');
      assert.ok(qIndex >= 0, 'Should include -q or --q flag');
      const query = gmailCall[qIndex + 1];
      assert.ok(query.includes('is:important'), 'Query should include is:important');
      assert.ok(query.includes('is:unread'), 'Query should include is:unread');
      assert.ok(query.includes('-category:promotions'), 'Query should exclude promotions');
      assert.ok(query.includes('-category:social'), 'Query should exclude social');
    });
  });

  describe('getThread', () => {
    it('returns single thread', async () => {
      const singleMessage = fixture.messages[0];
      const deps = makeDeps({
        gmail_messages: JSON.stringify(singleMessage),
      });

      const provider = new GmailProvider(deps);
      const thread = await provider.getThread('msg-1');

      assert.equal(thread.id, 'msg-1');
      assert.equal(thread.subject, 'Q2 Roadmap Review');
      assert.equal(thread.from, 'Jane Smith <jane@example.com>');
      assert.equal(thread.unread, true);
    });
  });

  describe('isAvailable', () => {
    it('returns true when gws is installed and authenticated', async () => {
      const deps = makeDeps({});
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
