/**
 * Integration tests for the Google Calendar provider.
 *
 * These tests compose multiple layers (config → factory → provider → API → mapped events)
 * in a single flow. Individual unit tests live in google-calendar.test.ts and google-auth.test.ts.
 *
 * DO NOT duplicate unit-level coverage here — focus on cross-layer composition and round-trip scenarios.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { stringify as stringifyYaml } from 'yaml';
import { getCalendarProvider } from '../../../src/integrations/calendar/index.js';
import { getGoogleCalendarProvider } from '../../../src/integrations/calendar/google-calendar.js';
import { getDefaultConfig } from '../../../src/config.js';
import type { StorageAdapter } from '../../../src/storage/adapter.js';
import type { AreteConfig } from '../../../src/models/workspace.js';

// ---------------------------------------------------------------------------
// Helpers (copied from google-calendar.test.ts — not imported from test files)
// ---------------------------------------------------------------------------

const WORKSPACE = '/test/workspace';
const CRED_PATH = '/test/workspace/.credentials/credentials.yaml';

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

function makeExpiredCredentialsYaml(): string {
  return stringifyYaml({
    google_calendar: {
      access_token: 'expired-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 600,
    },
  });
}

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

function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Fetch mock infrastructure
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

function routeFetch(routes: Record<string, Response | (() => Response)>): void {
  fetchMock.mock.mockImplementation(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return typeof response === 'function' ? response() : response;
      }
    }
    return mockResponse({ error: 'unmatched route' }, 500, 'Internal Server Error');
  });
}

// ---------------------------------------------------------------------------
// Standard API mock responses
// ---------------------------------------------------------------------------

function makeCalendarListResponse(
  calendars: Array<{ id: string; summary: string; primary?: boolean }> = [
    { id: 'primary', summary: 'My Calendar', primary: true },
  ]
): Record<string, unknown> {
  return { items: calendars };
}

// ---------------------------------------------------------------------------
// Realistic Google Calendar API fixtures
// ---------------------------------------------------------------------------

const fixtures = {
  timedEvent: {
    summary: 'Weekly 1:1 with Sarah',
    start: { dateTime: '2026-02-23T10:00:00-06:00' },
    end: { dateTime: '2026-02-23T10:30:00-06:00' },
    location: 'Zoom - https://zoom.us/j/123',
    attendees: [
      { email: 'me@company.com', displayName: 'Me', self: true, responseStatus: 'accepted' },
      { email: 'sarah@company.com', displayName: 'Sarah Chen', responseStatus: 'accepted' },
    ],
    description: 'Weekly sync on project Alpha',
  },
  allDayEvent: {
    summary: 'Company Holiday',
    start: { date: '2026-02-23' },
    end: { date: '2026-02-24' },
  },
  multiDayEvent: {
    summary: 'Product Offsite',
    start: { date: '2026-02-23' },
    end: { date: '2026-02-26' },
    location: 'Austin, TX',
    attendees: [{ email: 'team@company.com', displayName: 'Product Team' }],
  },
  recurringExpanded: {
    summary: 'Daily Standup',
    start: { dateTime: '2026-02-23T09:00:00-06:00' },
    end: { dateTime: '2026-02-23T09:15:00-06:00' },
    recurringEventId: 'abc123_recurring',
    attendees: [{ email: 'eng@company.com', displayName: 'Engineering' }],
  },
  declinedEvent: {
    summary: 'Optional Review',
    start: { dateTime: '2026-02-23T15:00:00-06:00' },
    end: { dateTime: '2026-02-23T16:00:00-06:00' },
    attendees: [
      { email: 'me@company.com', self: true, responseStatus: 'declined' },
      { email: 'lead@company.com', displayName: 'Tech Lead', responseStatus: 'accepted' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Calendar Integration Tests', () => {
  beforeEach(() => {
    setupFetchMock();
  });

  afterEach(() => {
    restoreFetch();
  });

  // -----------------------------------------------------------------------
  // 1. Configure → Pull Round-Trip (Google)
  // -----------------------------------------------------------------------

  describe('Configure → Pull Round-Trip (Google)', () => {
    it('config written by configure is accepted by factory and returns mapped events', async () => {
      // Exact config shape that configureCalendar() writes for google-calendar
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: 'google', // Exact string from configure command
            status: 'active',
            calendars: ['primary'],
          },
        },
      };

      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        calendarList: mockResponse(makeCalendarListResponse()),
        '/events': mockResponse({
          items: [fixtures.timedEvent],
        }),
      });

      // Full chain: config → factory → provider → API → mapped events
      const provider = await getCalendarProvider(config, storage, WORKSPACE);

      assert.ok(provider !== null, 'expected a non-null provider');
      assert.equal(provider.name, 'google-calendar');

      const events = await provider.getUpcomingEvents(1);
      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'Weekly 1:1 with Sarah');
      assert.equal(events[0].isAllDay, false);
      assert.equal(events[0].location, 'Zoom - https://zoom.us/j/123');
      assert.equal(events[0].attendees.length, 2);
      assert.ok(events[0].startTime instanceof Date);
    });
  });

  // -----------------------------------------------------------------------
  // 2. macOS Configure → Factory Round-Trip (Regression)
  // -----------------------------------------------------------------------

  describe('macOS Configure → Factory Round-Trip (Regression)', () => {
    it('factory routes provider "macos" to ical-buddy provider', async () => {
      const config: AreteConfig = {
        ...getDefaultConfig(),
        integrations: {
          calendar: {
            provider: 'macos', // Exact string macOS configure writes
            status: 'active',
            calendars: ['Work'],
          },
        },
      };

      const provider = await getCalendarProvider(config);
      // ical-buddy may or may not be installed on the test machine
      assert.ok(
        provider === null || provider.name === 'ical-buddy',
        `expected null or ical-buddy, got: ${provider?.name}`
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. Token Expiry → Auto-Refresh → Successful Pull
  // -----------------------------------------------------------------------

  describe('Token Expiry → Auto-Refresh → Successful Pull', () => {
    it('transparently refreshes expired token and returns events', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeExpiredCredentialsYaml(),
      });

      routeFetch({
        'oauth2.googleapis.com/token': mockResponse({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        calendarList: mockResponse(makeCalendarListResponse()),
        '/events': mockResponse({
          items: [fixtures.timedEvent],
        }),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const events = await provider.getUpcomingEvents(1);

      // Events returned successfully (refresh happened transparently)
      assert.equal(events.length, 1);
      assert.equal(events[0].title, 'Weekly 1:1 with Sarah');

      // Verify storage was updated with new credentials after refresh
      const updatedCreds = await storage.read(CRED_PATH);
      assert.ok(updatedCreds !== null, 'credentials should have been written');
      assert.ok(
        updatedCreds.includes('new-access-token'),
        'credentials should contain the refreshed access token'
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Expired Refresh Token → Actionable Error
  // -----------------------------------------------------------------------

  describe('Expired Refresh Token → Actionable Error', () => {
    it('isAvailable returns false when refresh token is invalid', async () => {
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
      const available = await provider.isAvailable();

      // Returns false, not an exception
      assert.equal(available, false);
    });

    it('getUpcomingEvents throws actionable error mentioning configure command', async () => {
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

      await assert.rejects(
        () => provider.getUpcomingEvents(1),
        (err: Error) => {
          assert.ok(
            err.message.includes('arete integration configure google-calendar') ||
              err.message.includes('configure google-calendar'),
            `error should mention configure command, got: ${err.message}`
          );
          return true;
        }
      );
    });
  });

  // -----------------------------------------------------------------------
  // 5. Zero Events → Empty Array
  // -----------------------------------------------------------------------

  describe('Zero Events → Empty Array', () => {
    it('returns empty array when API returns no events', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      routeFetch({
        calendarList: mockResponse(makeCalendarListResponse()),
        '/events': mockResponse({ items: [] }),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const events = await provider.getUpcomingEvents(1);

      assert.ok(Array.isArray(events), 'should return an array');
      assert.equal(events.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Realistic Google API Fixtures
  // -----------------------------------------------------------------------

  describe('Realistic Google API Fixtures', () => {
    it('maps all fixture event types correctly (timed, all-day, multi-day, recurring, declined)', async () => {
      const storage = makeMockStorage({
        [CRED_PATH]: makeCredentialsYaml(),
      });

      const allFixtureEvents = [
        fixtures.timedEvent,
        fixtures.allDayEvent,
        fixtures.multiDayEvent,
        fixtures.recurringExpanded,
        fixtures.declinedEvent,
      ];

      routeFetch({
        calendarList: mockResponse(makeCalendarListResponse()),
        '/events': mockResponse({ items: allFixtureEvents }),
      });

      const provider = getGoogleCalendarProvider(storage, WORKSPACE);
      const events = await provider.getUpcomingEvents(7);

      // All 5 events returned — provider does NOT filter declined events
      assert.equal(events.length, 5);

      // --- Timed event ---
      const timed = events.find((e) => e.title === 'Weekly 1:1 with Sarah');
      assert.ok(timed, 'timed event should be present');
      assert.equal(timed.isAllDay, false);
      assert.equal(timed.location, 'Zoom - https://zoom.us/j/123');
      assert.equal(timed.attendees.length, 2);
      assert.equal(timed.attendees[0].name, 'Me');
      assert.equal(timed.attendees[0].email, 'me@company.com');
      assert.equal(timed.attendees[1].name, 'Sarah Chen');
      assert.equal(timed.notes, 'Weekly sync on project Alpha');
      assert.ok(timed.startTime instanceof Date);
      assert.ok(timed.endTime instanceof Date);

      // --- All-day event ---
      const allDay = events.find((e) => e.title === 'Company Holiday');
      assert.ok(allDay, 'all-day event should be present');
      assert.equal(allDay.isAllDay, true);
      assert.deepEqual(allDay.attendees, []);

      // --- Multi-day event ---
      const multiDay = events.find((e) => e.title === 'Product Offsite');
      assert.ok(multiDay, 'multi-day event should be present');
      assert.equal(multiDay.isAllDay, true);
      assert.equal(multiDay.location, 'Austin, TX');
      assert.equal(multiDay.attendees.length, 1);
      assert.equal(multiDay.attendees[0].name, 'Product Team');
      // Start and end should span multiple days
      const startDate = multiDay.startTime.toISOString().split('T')[0];
      const endDate = multiDay.endTime.toISOString().split('T')[0];
      assert.notEqual(startDate, endDate);

      // --- Recurring expanded event ---
      const recurring = events.find((e) => e.title === 'Daily Standup');
      assert.ok(recurring, 'recurring expanded event should be present');
      assert.equal(recurring.isAllDay, false);
      assert.equal(recurring.attendees.length, 1);
      assert.equal(recurring.attendees[0].name, 'Engineering');

      // --- Declined event (still included — provider doesn't filter) ---
      const declined = events.find((e) => e.title === 'Optional Review');
      assert.ok(declined, 'declined event should be present (provider does not filter)');
      assert.equal(declined.isAllDay, false);
      assert.equal(declined.attendees.length, 2);
      assert.equal(declined.attendees[1].name, 'Tech Lead');
    });
  });
});
