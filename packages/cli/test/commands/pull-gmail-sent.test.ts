/**
 * Tests for `arete pull gmail --sent` (Phase 11-pre, F4).
 *
 * Verifies:
 *  - --sent not set → existing inbox behavior (unchanged, backward compat).
 *  - --sent set → invokes provider.fetchSent + writes v2 cache.
 *  - --fetch-body forwards to provider.fetchSent.
 *  - --days forwards to provider.fetchSent as sinceDate (YYYY-MM-DD).
 *  - JSON output includes the new `sent` payload section.
 *  - Provider that doesn't implement fetchSent → clear error.
 *
 * Uses mock EmailProvider + in-memory storage. NO real Gmail API calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type {
  AreteConfig,
  EmailProvider,
  EmailThread,
} from '@arete/core';
import { FileStorageAdapter } from '../../../core/src/storage/file.js';
import {
  pullGmailHelper,
  type PullGmailDeps,
} from '../../src/commands/pull.js';
import { captureConsole } from '../helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchSentCall = {
  query?: string;
  sinceDate?: string;
  fetchBody?: boolean;
  limit?: number;
};

function makeMockProvider(opts: {
  inboxThreads?: EmailThread[];
  sentThreads?: EmailThread[];
  recordFetchSent?: (call: FetchSentCall) => void;
  withFetchSent?: boolean;
}): EmailProvider {
  const provider: EmailProvider & {
    fetchSent?: (call: FetchSentCall) => Promise<EmailThread[]>;
  } = {
    name: 'mock-gmail',
    isAvailable: async () => true,
    searchThreads: async () => opts.inboxThreads ?? [],
    getThread: async (id: string) => ({
      id,
      subject: '',
      snippet: '',
      from: '',
      date: '',
      labels: [],
      unread: false,
    }),
    getImportantUnread: async () => opts.inboxThreads ?? [],
  };

  if (opts.withFetchSent !== false) {
    provider.fetchSent = async (call) => {
      opts.recordFetchSent?.(call);
      return opts.sentThreads ?? [];
    };
  }

  return provider;
}

function makeServices(storage: FileStorageAdapter): Awaited<
  ReturnType<typeof import('@arete/core').createServices>
> {
  return {
    storage,
    workspace: {
      getPaths: () => ({
        root: '/workspace',
        people: '/workspace/people',
        meetings: '/workspace/meetings',
        projects: '/workspace/projects',
        context: '/workspace/context',
        resources: '/workspace/resources',
        templates: '/workspace/templates',
        areas: '/workspace/areas',
        skills: '/workspace/skills',
        tools: '/workspace/tools',
        now: '/workspace/now',
        goals: '/workspace/goals',
        memory: '/workspace/.arete/memory',
        memoryEntries: '/workspace/.arete/memory/entries',
      }),
      findRoot: async () => '/workspace',
    },
  } as unknown as Awaited<ReturnType<typeof import('@arete/core').createServices>>;
}

function sentSampleThread(overrides: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 'sent-1',
    subject: 'Q2 Roadmap',
    snippet: 'Here is the Q2 roadmap',
    from: 'me@example.com',
    date: 'Fri, 03 Apr 2026 10:30:00 -0500',
    labels: ['SENT'],
    unread: false,
    to: ['jane@example.com'],
    cc: [],
    bcc: [],
    sentAt: '2026-04-03T15:30:00.000Z',
    cacheVersion: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('arete pull gmail — Phase 11-pre F4', () => {
  let tmp: string;
  let storage: FileStorageAdapter;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'arete-pull-gmail-'));
    storage = new FileStorageAdapter();
  });

  afterEach(() => {
    if (tmp && existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  describe('backward compat — no --sent', () => {
    it('does NOT call fetchSent when sent flag is false/omitted', async () => {
      let fetchSentCalled = false;
      const provider = makeMockProvider({
        inboxThreads: [sentSampleThread({ id: 'inbox-1', subject: 'Inbox subj' })],
        recordFetchSent: () => {
          fetchSentCalled = true;
        },
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 7, json: true /* sent omitted */ },
          deps,
        );
      });

      assert.equal(fetchSentCalled, false, 'fetchSent must NOT be called when --sent omitted');
    });

    it('JSON output has no `sent` key when --sent omitted (backward compat)', async () => {
      const provider = makeMockProvider({
        inboxThreads: [sentSampleThread({ id: 'inbox-1' })],
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      const out = await captureConsole(async () => {
        await pullGmailHelper(services, tmp, { days: 7, json: true }, deps);
      });

      const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
      assert.equal(parsed.success, true);
      assert.equal(parsed.integration, 'gmail');
      assert.ok(Array.isArray(parsed.threads));
      assert.equal(parsed.sent, undefined, '`sent` key must be absent in backward-compat mode');
    });
  });

  describe('--sent flag', () => {
    it('invokes fetchSent + writes v2 envelope cache when --sent set', async () => {
      const provider = makeMockProvider({
        inboxThreads: [],
        sentThreads: [
          sentSampleThread({ id: 's1' }),
          sentSampleThread({ id: 's2', to: ['bob@example.com'] }),
        ],
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      const out = await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 14, json: true, sent: true },
          deps,
        );
      });

      const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
      assert.equal(parsed.success, true);
      assert.ok(parsed.sent, '`sent` payload should be present');
      const sentPayload = parsed.sent as { cachePath: string; threadCount: number; fetchBody: boolean };
      assert.equal(sentPayload.threadCount, 2);
      assert.equal(sentPayload.fetchBody, false);
      assert.ok(sentPayload.cachePath.includes('.arete/cache/gmail-sent-'));

      // Verify the cache file was written + has v2 envelope.
      const raw = readFileSync(sentPayload.cachePath, 'utf8');
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      assert.equal(envelope.version, 2);
      assert.equal(envelope.daysCovered, 14);
      assert.ok(Array.isArray(envelope.threads));
      assert.equal((envelope.threads as unknown[]).length, 2);
      // Recipient pre-index should be present.
      const idx = envelope.recipientIndex as Record<string, string[]>;
      assert.deepEqual(idx['jane@example.com'].sort(), ['s1']);
      assert.deepEqual(idx['bob@example.com'], ['s2']);
    });

    it('forwards --days as sinceDate (YYYY-MM-DD) to fetchSent', async () => {
      let lastCall: FetchSentCall | undefined;
      const provider = makeMockProvider({
        sentThreads: [],
        recordFetchSent: (call) => {
          lastCall = call;
        },
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 14, json: true, sent: true },
          deps,
        );
      });

      assert.ok(lastCall, 'fetchSent should be called');
      // sinceDate is today - 14 days, YYYY-MM-DD form.
      assert.ok(
        /^\d{4}-\d{2}-\d{2}$/.test(lastCall.sinceDate ?? ''),
        `sinceDate should be YYYY-MM-DD, got: ${lastCall.sinceDate}`,
      );
    });

    it('forwards --fetch-body=true to fetchSent', async () => {
      let lastCall: FetchSentCall | undefined;
      const provider = makeMockProvider({
        sentThreads: [],
        recordFetchSent: (call) => {
          lastCall = call;
        },
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      const out = await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 7, json: true, sent: true, fetchBody: true },
          deps,
        );
      });

      assert.equal(lastCall?.fetchBody, true);

      const parsed = JSON.parse(out.stdout) as Record<string, unknown>;
      const sentPayload = parsed.sent as { fetchBody: boolean };
      assert.equal(sentPayload.fetchBody, true);
    });

    it('defaults fetchBody to false when --fetch-body omitted', async () => {
      let lastCall: FetchSentCall | undefined;
      const provider = makeMockProvider({
        sentThreads: [],
        recordFetchSent: (call) => {
          lastCall = call;
        },
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 7, json: true, sent: true },
          deps,
        );
      });

      assert.equal(lastCall?.fetchBody, false);
    });

    it('still pulls Inbox (existing behavior) in addition to Sent', async () => {
      const provider = makeMockProvider({
        inboxThreads: [sentSampleThread({ id: 'inbox-1', subject: 'Inbox' })],
        sentThreads: [sentSampleThread({ id: 'sent-1' })],
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      const out = await captureConsole(async () => {
        await pullGmailHelper(
          services,
          tmp,
          { days: 7, json: true, sent: true },
          deps,
        );
      });

      const parsed = JSON.parse(out.stdout) as {
        threads: { id: string }[];
        sent: { threadCount: number };
      };
      // Inbox path still ran (via getImportantUnread, since query+queryExtra
      // both empty when days=0... actually days=7 here so searchThreads).
      assert.ok(Array.isArray(parsed.threads));
      // Sent payload also present.
      assert.equal(parsed.sent.threadCount, 1);
    });

    it('errors clearly when provider does not implement fetchSent', async () => {
      const provider = makeMockProvider({
        inboxThreads: [],
        withFetchSent: false,
      });
      const services = makeServices(storage);
      const deps: PullGmailDeps = {
        loadConfigFn: async () =>
          ({
            integrations: { 'google-workspace': { status: 'active' } },
          }) as unknown as AreteConfig,
        getEmailProviderFn: async () => provider,
      };

      // process.exit(1) is called. Stub it so the test doesn't bail.
      const origExit = process.exit;
      let exitCode: number | string | null | undefined;
      // @ts-expect-error — replacing process.exit with a non-conforming stub
      // is intentional for test isolation.
      process.exit = (code?: number | string | null) => {
        exitCode = code;
        throw new Error('process.exit-stub');
      };

      let captured: { stdout: string; stderr: string } | undefined;
      try {
        captured = await captureConsole(async () => {
          try {
            await pullGmailHelper(
              services,
              tmp,
              { days: 7, json: true, sent: true },
              deps,
            );
          } catch (err) {
            if ((err as Error).message !== 'process.exit-stub') throw err;
          }
        });
      } finally {
        process.exit = origExit;
      }

      assert.equal(exitCode, 1);
      assert.ok(captured?.stdout || captured?.stderr);
      const out = captured!.stdout + captured!.stderr;
      assert.ok(
        out.includes('does not implement fetchSent'),
        `expected error to mention missing fetchSent, got: ${out}`,
      );
    });
  });
});
