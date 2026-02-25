/**
 * Tests for Google Calendar createEvent API integration.
 *
 * Uses DI pattern: injects mock fetch via `deps: { fetch: mockFn }`.
 * Tests cover happy path, optional fields, error handling, and edge cases.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleCalendarProvider } from '../../../src/integrations/calendar/google-calendar.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import type { CreateEventInput } from '../../../src/integrations/calendar/types.js';
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

/** Standard event input for tests. */
function makeEventInput(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return {
    summary: 'Team Meeting',
    start: new Date('2026-02-25T14:00:00Z'),
    end: new Date('2026-02-25T15:00:00Z'),
    ...overrides,
  };
}

/** Standard API response for created event. */
function makeCreatedEventResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'event123',
    htmlLink: 'https://calendar.google.com/event?eid=event123',
    summary: 'Team Meeting',
    start: { dateTime: '2026-02-25T14:00:00Z' },
    end: { dateTime: '2026-02-25T15:00:00Z' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Calendar createEvent', () => {
  let storage: StorageAdapter;

  beforeEach(() => {
    storage = makeMockStorage({
      [CRED_PATH]: makeCredentialsYaml(),
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('creates event with required fields only', async () => {
      const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        // Verify correct endpoint and method
        assert.ok(url.includes('/calendars/primary/events'), 'Should call events endpoint');
        assert.equal(init?.method, 'POST', 'Should use POST method');

        // Verify request body structure
        const body = JSON.parse(init?.body as string);
        assert.equal(body.summary, 'Team Meeting');
        assert.ok(body.start.dateTime, 'Should include start dateTime');
        assert.ok(body.end.dateTime, 'Should include end dateTime');

        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.createEvent!(makeEventInput(), { fetch: mockFetch });

      assert.equal(result.id, 'event123');
      assert.equal(result.htmlLink, 'https://calendar.google.com/event?eid=event123');
      assert.equal(result.summary, 'Team Meeting');
      assert.ok(result.start instanceof Date, 'start should be Date');
      assert.ok(result.end instanceof Date, 'end should be Date');
    });

    it('creates event with all optional fields', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse({
          description: 'Weekly sync',
          location: 'Room 101',
        }));
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(
        makeEventInput({
          description: 'Weekly sync',
          location: 'Room 101',
          attendees: ['alice@example.com', 'bob@example.com'],
        }),
        { fetch: mockFetch }
      );

      const body = capturedBody as Record<string, unknown>;
      assert.equal(body.description, 'Weekly sync');
      assert.equal(body.location, 'Room 101');
      assert.deepEqual(body.attendees, [
        { email: 'alice@example.com' },
        { email: 'bob@example.com' },
      ]);
    });

    it('uses specified calendarId instead of primary', async () => {
      let capturedUrl: string = '';

      const mockFetch = async (input: string | URL | Request) => {
        capturedUrl = typeof input === 'string' ? input : input.toString();
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(
        makeEventInput({ calendarId: 'work@group.calendar.google.com' }),
        { fetch: mockFetch }
      );

      assert.ok(
        capturedUrl.includes('/calendars/work%40group.calendar.google.com/events'),
        'Should URL-encode calendarId'
      );
    });

    it('returns event with dates as Date objects', async () => {
      const mockFetch = async () => {
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.createEvent!(makeEventInput(), { fetch: mockFetch });

      assert.equal(result.start.toISOString(), '2026-02-25T14:00:00.000Z');
      assert.equal(result.end.toISOString(), '2026-02-25T15:00:00.000Z');
    });
  });

  // -------------------------------------------------------------------------
  // Request format validation
  // -------------------------------------------------------------------------

  describe('request format', () => {
    it('sends ISO date format for dateTime', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(makeEventInput(), { fetch: mockFetch });

      const body = capturedBody as { start: { dateTime: string }; end: { dateTime: string } };
      assert.equal(body.start.dateTime, '2026-02-25T14:00:00.000Z');
      assert.equal(body.end.dateTime, '2026-02-25T15:00:00.000Z');
    });

    it('includes Authorization header', async () => {
      let capturedHeaders: HeadersInit | undefined;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(makeEventInput(), { fetch: mockFetch });

      const headers = capturedHeaders as Record<string, string>;
      assert.ok(headers.Authorization?.startsWith('Bearer '), 'Should include Bearer token');
      assert.equal(headers['Content-Type'], 'application/json');
    });

    it('does not include optional fields when not provided', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(makeEventInput(), { fetch: mockFetch });

      const body = capturedBody as Record<string, unknown>;
      assert.ok(!('description' in body), 'Should not include description');
      assert.ok(!('location' in body), 'Should not include location');
      assert.ok(!('attendees' in body), 'Should not include attendees');
    });

    it('does not include attendees when array is empty', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(makeEventInput({ attendees: [] }), { fetch: mockFetch });

      const body = capturedBody as Record<string, unknown>;
      assert.ok(!('attendees' in body), 'Should not include empty attendees array');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws actionable message on 401', async () => {
      // Use expired credentials
      const expiredStorage = makeMockStorage({
        [CRED_PATH]: stringifyYaml({
          google_calendar: {
            access_token: 'expired-token',
            refresh_token: 'test-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) - 600,
          },
        }),
      });

      const mockFetch = async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();

        // Mock refresh token endpoint failure
        if (url.includes('oauth2.googleapis.com/token')) {
          return mockResponse({ error: 'invalid_grant' }, 400);
        }

        return mockResponse({}, 401);
      };

      const provider = getGoogleCalendarProvider(expiredStorage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(makeEventInput(), { fetch: mockFetch }),
        (err: Error) => {
          assert.ok(
            err.message.includes('authentication') || err.message.includes('configure google-calendar'),
            `Expected auth error with remediation, got: ${err.message}`
          );
          return true;
        }
      );
    });

    it('throws permission error on 403 with calendar ID', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Forbidden' }, 403);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(
          makeEventInput({ calendarId: 'shared@calendar.com' }),
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(err.message.includes('Permission denied'), 'Should mention permission');
          assert.ok(err.message.includes('shared@calendar.com'), 'Should include calendar ID');
          return true;
        }
      );
    });

    it('throws on 404 calendar not found', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Not Found' }, 404);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(
          makeEventInput({ calendarId: 'nonexistent@calendar.com' }),
          { fetch: mockFetch }
        ),
        (err: Error) => {
          assert.ok(err.message.includes('not found'), 'Should mention not found');
          return true;
        }
      );
    });

    it('throws on 429 rate limit', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Rate limit' }, 429);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(makeEventInput(), { fetch: mockFetch }),
        (err: Error) => {
          assert.ok(err.message.includes('rate limit'), 'Should mention rate limit');
          return true;
        }
      );
    });

    it('throws on 5xx server error', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Server error' }, 503);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(makeEventInput(), { fetch: mockFetch }),
        (err: Error) => {
          assert.ok(err.message.includes('temporarily unavailable'), 'Should mention unavailable');
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
        () => provider.createEvent!(makeEventInput(), { fetch: mockFetch }),
        (err: Error) => {
          assert.ok(err.message.includes('Unable to contact'), 'Should mention contact failure');
          return true;
        }
      );
    });

    it('throws on 400 bad request', async () => {
      const mockFetch = async () => {
        return mockResponse({ error: 'Bad request' }, 400);
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);

      await assert.rejects(
        () => provider.createEvent!(makeEventInput(), { fetch: mockFetch }),
        (err: Error) => {
          assert.ok(err.message.includes('invalid'), 'Should mention invalid request');
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('uses input summary when API response has no summary', async () => {
      const mockFetch = async () => {
        return mockResponse(makeCreatedEventResponse({ summary: undefined }));
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.createEvent!(
        makeEventInput({ summary: 'My Meeting' }),
        { fetch: mockFetch }
      );

      assert.equal(result.summary, 'My Meeting');
    });

    it('falls back to input dates when API response has unexpected format', async () => {
      const mockFetch = async () => {
        return mockResponse({
          id: 'event123',
          htmlLink: 'https://calendar.google.com/event?eid=event123',
          summary: 'Test',
          start: {}, // Missing dateTime and date
          end: {},
        });
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const inputStart = new Date('2026-02-25T14:00:00Z');
      const inputEnd = new Date('2026-02-25T15:00:00Z');

      const result = await provider.createEvent!(
        makeEventInput({ start: inputStart, end: inputEnd }),
        { fetch: mockFetch }
      );

      assert.equal(result.start.toISOString(), inputStart.toISOString());
      assert.equal(result.end.toISOString(), inputEnd.toISOString());
    });

    it('handles attendees with special characters in email', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse());
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.createEvent!(
        makeEventInput({ attendees: ['user+tag@example.com', "o'brien@example.com"] }),
        { fetch: mockFetch }
      );

      const body = capturedBody as { attendees: Array<{ email: string }> };
      assert.deepEqual(body.attendees, [
        { email: 'user+tag@example.com' },
        { email: "o'brien@example.com" },
      ]);
    });

    it('handles summary with special characters', async () => {
      let capturedBody: unknown;

      const mockFetch = async (_input: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string);
        return mockResponse(makeCreatedEventResponse({ summary: '1:1 with José — "Planning"' }));
      };

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const result = await provider.createEvent!(
        makeEventInput({ summary: '1:1 with José — "Planning"' }),
        { fetch: mockFetch }
      );

      const body = capturedBody as { summary: string };
      assert.equal(body.summary, '1:1 with José — "Planning"');
      assert.equal(result.summary, '1:1 with José — "Planning"');
    });
  });
});
