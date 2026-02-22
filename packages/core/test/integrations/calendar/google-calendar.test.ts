/**
 * Tests for Google Calendar API client and provider.
 *
 * Mocks `fetch` globally and uses a mock StorageAdapter to inject credentials.
 * Does NOT test the authenticate() flow (covered in google-auth.test.ts).
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGoogleCalendarProvider,
  listCalendars,
} from '../../../src/integrations/calendar/google-calendar.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import { stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Valid credentials YAML with a token that won't expire during tests. */
function makeCredentialsYaml(overrides: Record<string, unknown> = {}): string {
  return stringifyYaml({
    google_calendar: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    },
  });
}

/** Expired credentials YAML. */
function makeExpiredCredentialsYaml(): string {
  return stringifyYaml({
    google_calendar: {
      access_token: 'expired-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 600, // 10 min ago
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

/** Build a Google Calendar event JSON object. */
function makeGoogleEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: 'Test Meeting',
    start: { dateTime: '2026-02-22T14:00:00-06:00' },
    end: { dateTime: '2026-02-22T15:00:00-06:00' },
    location: 'Room 101',
    attendees: [{ email: 'alice@example.com', displayName: 'Alice' }],
    description: 'Meeting notes',
    ...overrides,
  };
}

/** Standard calendar list response. */
function makeCalendarListResponse(
  calendars: Array<{ id: string; summary: string; primary?: boolean }> = [
    { id: 'primary', summary: 'My Calendar', primary: true },
  ]
): Record<string, unknown> {
  return { items: calendars };
}

const WORKSPACE = '/test/workspace';
const CRED_PATH = '/test/workspace/.credentials/credentials.yaml';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let originalFetch: FetchFn;
let fetchMock: ReturnType<typeof mock.fn<FetchFn>>;

function setupFetchMock(): ReturnType<typeof mock.fn<FetchFn>> {
  originalFetch = globalThis.fetch;
  fetchMock = mock.fn<FetchFn>();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Route fetch calls based on URL patterns.
 * Accepts a map of URL substring -> response (or response function).
 */
function routeFetch(
  routes: Record<string, Response | (() => Response)>
): void {
  fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return mockResponse({ error: 'unmatched route' }, 500, 'Internal Server Error');
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Calendar Provider', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    restoreFetch();
  });

  // -----------------------------------------------------------------------
  // isAvailable()
  // -----------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('returns false when no credentials exist', async () => {
      const storage = makeMockStorage();
      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      assert.equal(await provider.isAvailable(), false);
    });

    it('returns true when valid credentials exist', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });
      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      assert.equal(await provider.isAvailable(), true);
    });

    it('attempts refresh before returning false when token expired', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeExpiredCredentialsYaml(),
      });

      // Mock refresh token endpoint — return success
      routeFetch({
        'oauth2.googleapis.com/token': mockResponse({
          access_token: 'new-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      assert.equal(await provider.isAvailable(), true);
    });

    it('returns false when refresh fails', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeExpiredCredentialsYaml(),
      });

      routeFetch({
        'oauth2.googleapis.com/token': mockResponse(
          { error: 'invalid_grant' },
          400,
          'Bad Request'
        ),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      assert.equal(await provider.isAvailable(), false);
    });
  });

  // -----------------------------------------------------------------------
  // Event mapping
  // -----------------------------------------------------------------------

  describe('Event mapping', () => {
    function setupProviderWithEvents(events: unknown[]): {
      provider: ReturnType<typeof getGoogleCalendarProvider>;
    } {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        'calendarList': mockResponse(makeCalendarListResponse()),
        '/events': mockResponse({ items: events }),
      });

      return { provider: getGoogleCalendarProvider(storage, WORKSPACE) };
    }

    it('maps timed event correctly (dateTime field)', async () => {
      const { provider } = setupProviderWithEvents([makeGoogleEvent()]);
      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'Test Meeting');
      assert.equal(events[0].isAllDay, false);
      assert.equal(events[0].location, 'Room 101');
      assert.equal(events[0].attendees.length, 1);
      assert.equal(events[0].attendees[0].name, 'Alice');
      assert.equal(events[0].attendees[0].email, 'alice@example.com');
      assert.equal(events[0].notes, 'Meeting notes');
      assert.equal(events[0].calendar, 'My Calendar');
      assert.ok(events[0].startTime instanceof Date);
      assert.ok(events[0].endTime instanceof Date);
    });

    it('maps all-day event correctly (date field)', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({
          summary: 'All Day Event',
          start: { date: '2026-02-22' },
          end: { date: '2026-02-23' },
          location: undefined,
          attendees: undefined,
          description: undefined,
        }),
      ]);

      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'All Day Event');
      assert.equal(events[0].isAllDay, true);
      assert.deepEqual(events[0].attendees, []);
    });

    it('maps multi-day event (date spans multiple days)', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({
          summary: 'Conference',
          start: { date: '2026-02-22' },
          end: { date: '2026-02-25' },
        }),
      ]);

      const events = await provider.getUpcomingEvents(7);

      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'Conference');
      assert.equal(events[0].isAllDay, true);
      // Start and end should be different dates
      const startDate = events[0].startTime.toISOString().split('T')[0];
      const endDate = events[0].endTime.toISOString().split('T')[0];
      assert.notEqual(startDate, endDate);
    });

    it('maps event with no title to "(No title)"', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({ summary: undefined }),
      ]);

      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.equal(events[0].title, '(No title)');
    });

    it('handles empty attendees array', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({ attendees: [] }),
      ]);

      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.deepEqual(events[0].attendees, []);
    });

    it('handles missing attendees field (undefined)', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({ attendees: undefined }),
      ]);

      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.deepEqual(events[0].attendees, []);
    });

    it('uses email as name when displayName is missing', async () => {
      const { provider } = setupProviderWithEvents([
        makeGoogleEvent({
          attendees: [{ email: 'bob@example.com' }],
        }),
      ]);

      const events = await provider.getUpcomingEvents(1);

      assert.equal(events[0].attendees[0].name, 'bob@example.com');
      assert.equal(events[0].attendees[0].email, 'bob@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('Pagination', () => {
    it('handles nextPageToken by making additional requests', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      let eventsCallCount = 0;
      fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes('calendarList')) {
          return mockResponse(makeCalendarListResponse());
        }

        if (url.includes('/events')) {
          eventsCallCount++;
          if (eventsCallCount === 1) {
            return mockResponse({
              items: [makeGoogleEvent({ summary: 'Event 1' })],
              nextPageToken: 'page2token',
            });
          }
          // Second page — verify pageToken param is present
          assert.ok(url.includes('pageToken=page2token'));
          return mockResponse({
            items: [makeGoogleEvent({ summary: 'Event 2' })],
          });
        }

        return mockResponse({}, 500);
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 2);
      assert.equal(events[0].title, 'Event 1');
      assert.equal(events[1].title, 'Event 2');
      assert.equal(eventsCallCount, 2);
    });
  });

  // -----------------------------------------------------------------------
  // Calendar filtering
  // -----------------------------------------------------------------------

  describe('Calendar filtering', () => {
    it('only queries specified calendars', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      const queriedCalendarIds: string[] = [];

      fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes('calendarList')) {
          return mockResponse(makeCalendarListResponse([
            { id: 'cal-work', summary: 'Work' },
            { id: 'cal-personal', summary: 'Personal' },
          ]));
        }

        if (url.includes('/events')) {
          // Extract calendar ID from URL path
          const match = url.match(/calendars\/([^/]+)\/events/);
          if (match) {
            queriedCalendarIds.push(decodeURIComponent(match[1]));
          }
          return mockResponse({ items: [makeGoogleEvent()] });
        }

        return mockResponse({}, 500);
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.getUpcomingEvents(1, { calendars: ['cal-work', 'cal-personal'] });

      assert.deepEqual(queriedCalendarIds.sort(), ['cal-personal', 'cal-work']);
    });

    it('queries primary calendar when no calendars specified', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      const queriedCalendarIds: string[] = [];

      fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes('calendarList')) {
          return mockResponse(makeCalendarListResponse());
        }

        if (url.includes('/events')) {
          const match = url.match(/calendars\/([^/]+)\/events/);
          if (match) {
            queriedCalendarIds.push(decodeURIComponent(match[1]));
          }
          return mockResponse({ items: [] });
        }

        return mockResponse({}, 500);
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await provider.getUpcomingEvents(1);

      assert.deepEqual(queriedCalendarIds, ['primary']);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('Error handling', () => {
    it('401 triggers token refresh and retry', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      let eventsCallCount = 0;

      fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        if (url.includes('calendarList')) {
          return mockResponse(makeCalendarListResponse());
        }

        if (url.includes('oauth2.googleapis.com/token')) {
          return mockResponse({
            access_token: 'refreshed-token',
            expires_in: 3600,
            token_type: 'Bearer',
          });
        }

        if (url.includes('/events')) {
          eventsCallCount++;
          if (eventsCallCount === 1) {
            return mockResponse({ error: 'Unauthorized' }, 401, 'Unauthorized');
          }
          return mockResponse({ items: [makeGoogleEvent()] });
        }

        return mockResponse({}, 500);
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const events = await provider.getUpcomingEvents(1);

      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'Test Meeting');
    });

    it('429 returns rate limit error message', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        'calendarList': mockResponse(makeCalendarListResponse()),
        '/events': mockResponse(
          { error: 'Rate limit exceeded' },
          429,
          'Too Many Requests'
        ),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await assert.rejects(
        () => provider.getUpcomingEvents(1),
        (err: Error) => {
          assert.ok(err.message.includes('rate limit'));
          return true;
        }
      );
    });

    it('403 returns permission error with calendar ID', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        'calendarList': mockResponse(makeCalendarListResponse()),
        '/events': mockResponse(
          { error: 'Forbidden' },
          403,
          'Forbidden'
        ),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      await assert.rejects(
        () => provider.getUpcomingEvents(1),
        (err: Error) => {
          assert.ok(err.message.includes('Permission denied'));
          assert.ok(err.message.includes('primary'));
          return true;
        }
      );
    });
  });

  // -----------------------------------------------------------------------
  // listCalendars()
  // -----------------------------------------------------------------------

  describe('listCalendars()', () => {
    it('returns calendar list', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        'calendarList': mockResponse(makeCalendarListResponse([
          { id: 'primary', summary: 'My Calendar', primary: true },
          { id: 'work@group.calendar.google.com', summary: 'Work' },
        ])),
      });

      const calendars = await listCalendars(storage, WORKSPACE);

      assert.equal(calendars.length, 2);
      assert.equal(calendars[0].id, 'primary');
      assert.equal(calendars[0].summary, 'My Calendar');
      assert.equal(calendars[0].primary, true);
      assert.equal(calendars[1].id, 'work@group.calendar.google.com');
      assert.equal(calendars[1].summary, 'Work');
    });
  });

  // -----------------------------------------------------------------------
  // Provider name
  // -----------------------------------------------------------------------

  describe('Provider metadata', () => {
    it('has name "google-calendar"', () => {
      const storage = makeMockStorage();
      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      assert.equal(provider.name, 'google-calendar');
    });
  });
});
