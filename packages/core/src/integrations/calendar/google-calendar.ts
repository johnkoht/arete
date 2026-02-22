/**
 * Google Calendar provider — thin REST wrapper over the Google Calendar API.
 *
 * No `googleapis` dependency. Uses native `fetch` with Bearer token auth.
 * Implements `CalendarProvider` interface for use with the calendar factory.
 */

import type { StorageAdapter } from '../../storage/adapter.js';
import type { CalendarEvent, CalendarOptions, CalendarProvider } from './types.js';
import {
  loadGoogleCredentials,
  isTokenValid,
  refreshToken,
  saveGoogleCredentials,
  type GoogleCalendarCredentials,
} from './google-auth.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

// ---------------------------------------------------------------------------
// Google API response types
// ---------------------------------------------------------------------------

type GoogleEventTime = {
  dateTime?: string;
  date?: string;
};

type GoogleAttendee = {
  email?: string;
  displayName?: string;
};

type GoogleEvent = {
  summary?: string;
  start: GoogleEventTime;
  end: GoogleEventTime;
  location?: string;
  attendees?: GoogleAttendee[];
  description?: string;
};

type GoogleEventsResponse = {
  items?: GoogleEvent[];
  nextPageToken?: string;
};

type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
};

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Google Calendar API.
 *
 * 1. Load credentials from storage
 * 2. If expired, refresh and save
 * 3. Make request with Bearer token
 * 4. If 401, refresh once and retry
 * 5. Return response
 */
async function googleFetch(
  url: string,
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<Response> {
  let credentials = await loadGoogleCredentials(storage, workspaceRoot);
  if (!credentials) {
    throw new Error(
      'Google Calendar not authenticated — run: arete integration configure google-calendar'
    );
  }

  // Refresh if expired before making the request
  if (!isTokenValid(credentials)) {
    credentials = await refreshToken(credentials);
    await saveGoogleCredentials(storage, workspaceRoot, credentials);
  }

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  });

  // On 401, attempt one refresh and retry
  if (res.status === 401) {
    credentials = await refreshToken(credentials);
    await saveGoogleCredentials(storage, workspaceRoot, credentials);
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function handleApiError(status: number, statusText: string, calendarId?: string): never {
  switch (status) {
    case 401:
      throw new Error(
        'Google Calendar authentication failed after refresh — run: arete integration configure google-calendar'
      );
    case 403:
      throw new Error(
        `Permission denied for calendar ${calendarId ?? 'unknown'}. Check sharing settings.`
      );
    case 404:
      throw new Error(`Calendar ${calendarId ?? 'unknown'} not found.`);
    case 429:
      throw new Error('Google Calendar rate limit exceeded. Try again in a few minutes.');
    default:
      throw new Error(`Google Calendar API error: ${status} ${statusText}`);
  }
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------

function mapGoogleEvent(item: GoogleEvent, calendarName: string): CalendarEvent {
  const attendees = (item.attendees ?? []).map((a) => ({
    name: a.displayName ?? a.email ?? '',
    email: a.email,
  }));

  return {
    title: item.summary ?? '(No title)',
    startTime: new Date(item.start.dateTime ?? item.start.date ?? ''),
    endTime: new Date(item.end.dateTime ?? item.end.date ?? ''),
    isAllDay: !!item.start.date,
    calendar: calendarName,
    location: item.location,
    attendees,
    notes: item.description,
  };
}

// ---------------------------------------------------------------------------
// Event fetching with pagination
// ---------------------------------------------------------------------------

async function fetchEvents(
  calendarId: string,
  calendarName: string,
  timeMin: string,
  timeMax: string,
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('maxResults', '250');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await googleFetch(url.toString(), storage, workspaceRoot);
    if (!res.ok) {
      handleApiError(res.status, res.statusText, calendarId);
    }

    const data = (await res.json()) as GoogleEventsResponse;
    for (const item of data.items ?? []) {
      events.push(mapGoogleEvent(item, calendarName));
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

// ---------------------------------------------------------------------------
// Calendar list helper
// ---------------------------------------------------------------------------

async function fetchCalendarList(
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`);
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await googleFetch(url.toString(), storage, workspaceRoot);
    if (!res.ok) {
      handleApiError(res.status, res.statusText);
    }

    const data = (await res.json()) as GoogleCalendarListResponse;
    for (const item of data.items ?? []) {
      calendars.push({
        id: item.id,
        summary: item.summary,
        primary: item.primary,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return calendars;
}

// ---------------------------------------------------------------------------
// Resolve calendar IDs to names
// ---------------------------------------------------------------------------

async function resolveCalendarNames(
  calendarIds: string[],
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const allCalendars = await fetchCalendarList(storage, workspaceRoot);

  for (const cal of allCalendars) {
    if (calendarIds.includes(cal.id)) {
      nameMap.set(cal.id, cal.summary);
    }
  }

  // Fallback: use ID as name if not found in list
  for (const id of calendarIds) {
    if (!nameMap.has(id)) {
      nameMap.set(id, id);
    }
  }

  return nameMap;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getTodayRange(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
  };
}

function getUpcomingRange(days: number): { timeMin: string; timeMax: string } {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return {
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Shared event query logic
// ---------------------------------------------------------------------------

async function queryEvents(
  timeMin: string,
  timeMax: string,
  storage: StorageAdapter,
  workspaceRoot: string,
  options?: CalendarOptions
): Promise<CalendarEvent[]> {
  const calendarIds = options?.calendars?.length
    ? options.calendars
    : ['primary'];

  const nameMap = await resolveCalendarNames(calendarIds, storage, workspaceRoot);

  const allEvents: CalendarEvent[] = [];
  for (const calId of calendarIds) {
    const calName = nameMap.get(calId) ?? calId;
    const events = await fetchEvents(calId, calName, timeMin, timeMax, storage, workspaceRoot);
    allEvents.push(...events);
  }

  return allEvents;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Factory function returning a CalendarProvider for Google Calendar.
 *
 * The provider never throws from isAvailable() — returns false if
 * credentials are missing or refresh fails.
 */
export function getGoogleCalendarProvider(
  storage: StorageAdapter,
  workspaceRoot: string
): CalendarProvider {
  return {
    name: 'google-calendar',

    async isAvailable(): Promise<boolean> {
      try {
        const credentials = await loadGoogleCredentials(storage, workspaceRoot);
        if (!credentials) return false;

        if (isTokenValid(credentials)) return true;

        // Token expired — attempt refresh
        const refreshed = await refreshToken(credentials);
        await saveGoogleCredentials(storage, workspaceRoot, refreshed);
        return true;
      } catch {
        return false;
      }
    },

    async getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]> {
      const { timeMin, timeMax } = getTodayRange();
      return queryEvents(timeMin, timeMax, storage, workspaceRoot, options);
    },

    async getUpcomingEvents(
      days: number,
      options?: CalendarOptions
    ): Promise<CalendarEvent[]> {
      const { timeMin, timeMax } = getUpcomingRange(days);
      return queryEvents(timeMin, timeMax, storage, workspaceRoot, options);
    },
  };
}

/**
 * Fetch available calendars for the authenticated user.
 * Used by the configure command to let users pick calendars.
 */
export async function listCalendars(
  storage: StorageAdapter,
  workspaceRoot: string
): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  return fetchCalendarList(storage, workspaceRoot);
}
