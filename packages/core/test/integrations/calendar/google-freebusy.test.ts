/**
 * Tests for Google Calendar FreeBusy API integration.
 *
 * Uses DI pattern: injects mock fetch via `deps: { fetch: mockFn }`.
 * Tests cover happy path, no-access, and mixed scenarios.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleCalendarProvider } from '../../../src/integrations/calendar/google-calendar.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import { stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKSPACE = '/test/workspace';
const CRED_PATH = '/test/workspace/.credentials/credentials.yaml';

/** Valid credentials YAML with a token that won't expire during tests. */
function makeCredentialsYaml(): string {
  return stringifyYaml({
    google_calendar: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    },
  });
}

/** Minimal mock StorageAdapter. */
function makeMockStorage(files: Record<string, string> = {}): StorageAdapter {
  const store = new Map(Object.entries(files));
  return {
    async read(path: string) {
      return store.get(path) ?? null;
    },
    async write(path: string, content: string) {
      store.set(path, content);
    },
    async exists(path: string) {
      return store.has(path);
    },
    async delete(path: string) {
      store.delete(path);
    },
    async list() {
      return [];
    },
    async listSubdirectories() {
      return [];
    },
    async mkdir() {},
    async getModified() {
      return null;
    },
  };
}

/** Build a mock Response object. */
function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Standard time range for tests. */
const TIME_MIN = new Date('2026-02-25T00:00:00Z');
const TIME_MAX = new Date('2026-03-04T00:00:00Z');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Calendar FreeBusy', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = makeMockStorage({
      [CRED_PATH]: makeCredentialsYaml(),
    });
  });

  // -------------------------------------------------------------------------
  // Happy path: both primary and target return busy blocks
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns busy blocks for primary and target email', async () => {
      const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        // Verify correct endpoint and method
        assert.ok(url.includes('/freeBusy'), 'Should call freeBusy endpoint');
        assert.equal(init?.method, 'POST', 'Should use POST method');

        // Verify request body structure
        const body = JSON.parse(init?.body as string);
        assert.ok(body.timeMin, 'Should include timeMin');
        assert.ok(body.timeMax, 'Should include timeMax');
        assert.ok(body.items.some((i: { id: string }) => i.id === 'primary'), 'Should include primary');
        assert.ok(body.items.some((i: { id: string }) => i.id === 'jamie@example.com'), 'Should include target email');

        return mockResponse({
          calendars: {
            primary: {
              busy: [
                { start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' },
                { start: '2026-02-25T14:00:00Z', end: '2026-02-25T15:00:00Z' },
              ],
            },
            'jamie@example.com': {
              busy: [
                { start: '2026-02-25T09:00:00Z', end: '2026-02-25T10:00:00Z' },
              ],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['jamie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // Verify userBusy (from primary)
      assert.equal(result.userBusy.length, 2, 'Should have 2 busy blocks for user');
      assert.ok(result.userBusy[0].start instanceof Date, 'start should be Date');
      assert.ok(result.userBusy[0].end instanceof Date, 'end should be Date');
      assert.equal(
        result.userBusy[0].start.toISOString(),
        '2026-02-25T10:00:00.000Z'
      );
      assert.equal(
        result.userBusy[0].end.toISOString(),
        '2026-02-25T11:00:00.000Z'
      );

      // Verify target calendar
      assert.ok(result.calendars['jamie@example.com'], 'Should have result for target');
      assert.equal(result.calendars['jamie@example.com'].accessible, true);
      assert.equal(result.calendars['jamie@example.com'].busy.length, 1);
      assert.equal(
        result.calendars['jamie@example.com'].busy[0].start.toISOString(),
        '2026-02-25T09:00:00.000Z'
      );
    });

    it('handles multiple target emails', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            'alice@example.com': {
              busy: [{ start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' }],
            },
            'bob@example.com': {
              busy: [{ start: '2026-02-25T14:00:00Z', end: '2026-02-25T15:00:00Z' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['alice@example.com', 'bob@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      assert.equal(result.userBusy.length, 0, 'User has no busy blocks');
      assert.equal(result.calendars['alice@example.com'].accessible, true);
      assert.equal(result.calendars['alice@example.com'].busy.length, 1);
      assert.equal(result.calendars['bob@example.com'].accessible, true);
      assert.equal(result.calendars['bob@example.com'].busy.length, 1);
    });

    it('handles empty busy arrays', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            'jamie@example.com': { busy: [] },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['jamie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      assert.deepEqual(result.userBusy, []);
      assert.equal(result.calendars['jamie@example.com'].accessible, true);
      assert.deepEqual(result.calendars['jamie@example.com'].busy, []);
    });
  });

  // -------------------------------------------------------------------------
  // No-access: target returns errors
  // -------------------------------------------------------------------------

  describe('no-access case', () => {
    it('returns accessible: false when target has notFound error', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: {
              busy: [{ start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' }],
            },
            'jamie@example.com': {
              busy: [],
              errors: [{ domain: 'calendar', reason: 'notFound' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['jamie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // User's calendar should still be accessible
      assert.equal(result.userBusy.length, 1);

      // Target should be marked as inaccessible
      assert.equal(result.calendars['jamie@example.com'].accessible, false);
      assert.equal(result.calendars['jamie@example.com'].error, 'notFound');
      assert.deepEqual(result.calendars['jamie@example.com'].busy, []);
    });

    it('returns accessible: false for permission denied', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            'external@company.com': {
              busy: [],
              errors: [{ domain: 'calendar', reason: 'forbidden' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['external@company.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      assert.equal(result.calendars['external@company.com'].accessible, false);
      assert.equal(result.calendars['external@company.com'].error, 'forbidden');
    });

    it('handles calendar not in response', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            // 'missing@example.com' intentionally not in response
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['missing@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      assert.equal(result.calendars['missing@example.com'].accessible, false);
      assert.equal(result.calendars['missing@example.com'].error, 'No response from API');
    });
  });

  // -------------------------------------------------------------------------
  // Mixed: primary accessible, some targets have errors
  // -------------------------------------------------------------------------

  describe('mixed case', () => {
    it('returns userBusy populated when primary accessible but target has error', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: {
              busy: [
                { start: '2026-02-25T09:00:00Z', end: '2026-02-25T10:00:00Z' },
                { start: '2026-02-25T14:00:00Z', end: '2026-02-25T15:30:00Z' },
              ],
            },
            'jamie@example.com': {
              busy: [],
              errors: [{ domain: 'calendar', reason: 'notFound' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['jamie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // User's busy blocks should be populated
      assert.equal(result.userBusy.length, 2);
      assert.equal(
        result.userBusy[0].start.toISOString(),
        '2026-02-25T09:00:00.000Z'
      );

      // Target should be inaccessible
      assert.equal(result.calendars['jamie@example.com'].accessible, false);
    });

    it('handles mix of accessible and inaccessible targets', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            primary: {
              busy: [{ start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' }],
            },
            'alice@example.com': {
              busy: [{ start: '2026-02-25T13:00:00Z', end: '2026-02-25T14:00:00Z' }],
            },
            'bob@external.com': {
              busy: [],
              errors: [{ domain: 'calendar', reason: 'notFound' }],
            },
            'charlie@example.com': {
              busy: [{ start: '2026-02-25T15:00:00Z', end: '2026-02-25T16:00:00Z' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['alice@example.com', 'bob@external.com', 'charlie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // User's calendar
      assert.equal(result.userBusy.length, 1);

      // Alice - accessible
      assert.equal(result.calendars['alice@example.com'].accessible, true);
      assert.equal(result.calendars['alice@example.com'].busy.length, 1);

      // Bob - not accessible
      assert.equal(result.calendars['bob@external.com'].accessible, false);
      assert.equal(result.calendars['bob@external.com'].error, 'notFound');

      // Charlie - accessible
      assert.equal(result.calendars['charlie@example.com'].accessible, true);
      assert.equal(result.calendars['charlie@example.com'].busy.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Request validation
  // -------------------------------------------------------------------------

  describe('request format', () => {
    it('sends correct ISO date format', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            'test@example.com': { busy: [] },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.getFreeBusy!(
        ['test@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      const body = capturedBody as { timeMin: string; timeMax: string; items: Array<{ id: string }> };
      assert.equal(body.timeMin, '2026-02-25T00:00:00.000Z');
      assert.equal(body.timeMax, '2026-03-04T00:00:00.000Z');
      assert.deepEqual(body.items, [
        { id: 'primary' },
        { id: 'test@example.com' },
      ]);
    });

    it('includes Authorization header', async () => {
      let capturedHeaders: HeadersInit | undefined;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return mockResponse({
          calendars: {
            primary: { busy: [] },
            'test@example.com': { busy: [] },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.getFreeBusy!(
        ['test@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      const headers = capturedHeaders as Record<string, string>;
      assert.ok(headers.Authorization?.startsWith('Bearer '), 'Should include Bearer token');
      assert.equal(headers['Content-Type'], 'application/json');
    });
  });

  // -------------------------------------------------------------------------
  // Infrastructure error handling
  // -------------------------------------------------------------------------

  describe('infrastructure errors', () => {
    it('throws on 401 after failed refresh', async () => {
      // Use expired credentials that will need refresh
      const expiredStorage = makeMockStorage({
        [CRED_PATH]: stringifyYaml({
          google_calendar: {
            access_token: 'expired-token',
            refresh_token: 'test-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) - 600,
          },
        }),
      });

      let callCount = 0;
      const mockFetch = async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        callCount++;

        // Mock refresh token endpoint failure
        if (url.includes('oauth2.googleapis.com/token')) {
          return mockResponse({ error: 'invalid_grant' }, 400);
        }

        return mockResponse({}, 401);
      };

      const provider = getGoogleCalendarProvider(expiredStorage, WORKSPACE);

      await assert.rejects(
        () => provider.getFreeBusy!(
          ['test@example.com'],
          TIME_MIN,
          TIME_MAX,
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(
            err.message.includes('authentication'),
            `Expected auth error, got: ${err.message}`
          );
          return true;
        }
      );
    });

    it('throws on 500 server error', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Internal server error' }, 500);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.getFreeBusy!(
          ['test@example.com'],
          TIME_MIN,
          TIME_MAX,
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(
            err.message.includes('temporarily unavailable'),
            `Expected 5xx error message, got: ${err.message}`
          );
          return true;
        }
      );
    });

    it('throws on network failure', async () => {
      const mockFetch = async () => {
        throw new Error('Network failure');
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.getFreeBusy!(
          ['test@example.com'],
          TIME_MIN,
          TIME_MAX,
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(
            err.message.includes('Unable to contact'),
            `Expected network error message, got: ${err.message}`
          );
          return true;
        }
      );
    });

    it('throws on rate limit (429)', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Rate limit' }, 429);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.getFreeBusy!(
          ['test@example.com'],
          TIME_MIN,
          TIME_MAX,
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(
            err.message.includes('rate limit'),
            `Expected rate limit error, got: ${err.message}`
          );
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles primary calendar missing from response', async () => {
      const mockFetch = async () => {
        return mockResponse({
          calendars: {
            // primary intentionally missing
            'jamie@example.com': {
              busy: [{ start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        ['jamie@example.com'],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // Should gracefully handle missing primary
      assert.deepEqual(result.userBusy, []);
      assert.equal(result.calendars['jamie@example.com'].accessible, true);
    });

    it('handles empty emails array', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse({
          calendars: {
            primary: {
              busy: [{ start: '2026-02-25T10:00:00Z', end: '2026-02-25T11:00:00Z' }],
            },
          },
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.getFreeBusy!(
        [],
        TIME_MIN,
        TIME_MAX,
        { fetch: mockFetch }
      );

      // Should still query primary calendar
      const body = capturedBody as { items: Array<{ id: string }> };
      assert.deepEqual(body.items, [{ id: 'primary' }]);

      assert.equal(result.userBusy.length, 1);
      assert.deepEqual(result.calendars, {});
    });
  });
});
