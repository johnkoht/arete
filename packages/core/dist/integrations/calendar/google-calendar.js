/**
 * Google Calendar provider — thin REST wrapper over the Google Calendar API.
 *
 * No `googleapis` dependency. Uses native `fetch` with Bearer token auth.
 * Implements `CalendarProvider` interface for use with the calendar factory.
 */
import { loadGoogleCredentials, isTokenValid, refreshToken, saveGoogleCredentials, } from './google-auth.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const FREEBUSY_URL = `${CALENDAR_API_BASE}/freeBusy`;
const CONFIGURE_COMMAND = 'arete integration configure google-calendar';
/**
 * Make an authenticated request to the Google Calendar API.
 *
 * 1. Load credentials from storage
 * 2. If expired, refresh and save
 * 3. Make request with Bearer token
 * 4. If 401, refresh once and retry
 * 5. Return response
 */
async function googleFetch(url, storage, workspaceRoot, options) {
    const fetchFn = options?.fetchFn ?? fetch;
    const method = options?.method ?? 'GET';
    let credentials = await loadGoogleCredentials(storage, workspaceRoot);
    if (!credentials) {
        throw new Error(`Google Calendar not authenticated — run: ${CONFIGURE_COMMAND}`);
    }
    // Refresh if expired before making the request
    if (!isTokenValid(credentials)) {
        try {
            credentials = await refreshToken(credentials);
            await saveGoogleCredentials(storage, workspaceRoot, credentials);
        }
        catch {
            throw new Error(`Google Calendar authentication expired — run: ${CONFIGURE_COMMAND}`);
        }
    }
    const buildRequestInit = (token) => {
        const init = {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
            },
        };
        if (options?.body) {
            init.body = JSON.stringify(options.body);
        }
        return init;
    };
    let res;
    try {
        res = await fetchFn(url, buildRequestInit(credentials.access_token));
    }
    catch {
        throw new Error('Unable to contact Google Calendar. Check your network and try again.');
    }
    // On 401, attempt one refresh and retry
    if (res.status === 401) {
        try {
            credentials = await refreshToken(credentials);
            await saveGoogleCredentials(storage, workspaceRoot, credentials);
        }
        catch {
            throw new Error(`Google Calendar authentication failed — run: ${CONFIGURE_COMMAND}`);
        }
        try {
            res = await fetchFn(url, buildRequestInit(credentials.access_token));
        }
        catch {
            throw new Error('Unable to contact Google Calendar. Check your network and try again.');
        }
    }
    return res;
}
// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
function handleApiError(status, calendarId) {
    switch (status) {
        case 400:
            throw new Error('Google Calendar request was invalid. Please retry.');
        case 401:
            throw new Error(`Google Calendar authentication failed — run: ${CONFIGURE_COMMAND}`);
        case 403:
            throw new Error(`Permission denied for calendar ${calendarId ?? 'unknown'}. Check sharing settings.`);
        case 404:
            throw new Error(`Calendar ${calendarId ?? 'unknown'} not found.`);
        case 429:
            throw new Error('Google Calendar rate limit exceeded. Try again in a few minutes.');
        default:
            if (status >= 500) {
                throw new Error('Google Calendar is temporarily unavailable. Try again in a few minutes.');
            }
            throw new Error(`Google Calendar request failed (HTTP ${status}).`);
    }
}
// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------
function mapGoogleEvent(item, calendarName) {
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
async function fetchEvents(calendarId, calendarName, timeMin, timeMax, storage, workspaceRoot) {
    const events = [];
    let pageToken;
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
            handleApiError(res.status, calendarId);
        }
        const data = (await res.json());
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
async function fetchCalendarList(storage, workspaceRoot) {
    const calendars = [];
    let pageToken;
    do {
        const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`);
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }
        const res = await googleFetch(url.toString(), storage, workspaceRoot);
        if (!res.ok) {
            handleApiError(res.status);
        }
        const data = (await res.json());
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
async function resolveCalendarNames(calendarIds, storage, workspaceRoot) {
    const nameMap = new Map();
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
function getTodayRange() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
    };
}
function getUpcomingRange(days) {
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
async function queryEvents(timeMin, timeMax, storage, workspaceRoot, options) {
    const calendarIds = options?.calendars?.length
        ? options.calendars
        : ['primary'];
    const nameMap = await resolveCalendarNames(calendarIds, storage, workspaceRoot);
    const allEvents = [];
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
export function getGoogleCalendarProvider(storage, workspaceRoot) {
    return {
        name: 'google-calendar',
        async isAvailable() {
            try {
                const credentials = await loadGoogleCredentials(storage, workspaceRoot);
                if (!credentials)
                    return false;
                if (isTokenValid(credentials))
                    return true;
                // Token expired — attempt refresh
                const refreshed = await refreshToken(credentials);
                await saveGoogleCredentials(storage, workspaceRoot, refreshed);
                return true;
            }
            catch {
                return false;
            }
        },
        async getTodayEvents(options) {
            const { timeMin, timeMax } = getTodayRange();
            return queryEvents(timeMin, timeMax, storage, workspaceRoot, options);
        },
        async getUpcomingEvents(days, options) {
            const { timeMin, timeMax } = getUpcomingRange(days);
            return queryEvents(timeMin, timeMax, storage, workspaceRoot, options);
        },
        async getFreeBusy(emails, timeMin, timeMax, deps) {
            // Build request body with primary calendar + all target emails
            const requestBody = {
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                items: [
                    { id: 'primary' },
                    ...emails.map((email) => ({ id: email })),
                ],
            };
            // Make authenticated POST request
            const res = await googleFetch(FREEBUSY_URL, storage, workspaceRoot, {
                method: 'POST',
                body: requestBody,
                fetchFn: deps?.fetch,
            });
            // Handle infrastructure errors (throw)
            if (!res.ok) {
                handleApiError(res.status);
            }
            const data = (await res.json());
            // Helper to convert ISO strings to BusyBlock with Date objects
            const toBusyBlocks = (blocks) => blocks.map((block) => ({
                start: new Date(block.start),
                end: new Date(block.end),
            }));
            // Extract user's busy blocks from 'primary'
            const primaryCalendar = data.calendars.primary;
            const userBusy = primaryCalendar?.busy
                ? toBusyBlocks(primaryCalendar.busy)
                : [];
            // Build per-email results
            const calendars = {};
            for (const email of emails) {
                const calendarData = data.calendars[email];
                if (!calendarData) {
                    // Calendar not in response — treat as inaccessible
                    calendars[email] = {
                        busy: [],
                        accessible: false,
                        error: 'No response from API',
                    };
                }
                else if (calendarData.errors?.length) {
                    // Calendar returned errors — mark as inaccessible
                    calendars[email] = {
                        busy: [],
                        accessible: false,
                        error: calendarData.errors[0].reason,
                    };
                }
                else {
                    // Calendar accessible — return busy blocks
                    calendars[email] = {
                        busy: toBusyBlocks(calendarData.busy),
                        accessible: true,
                    };
                }
            }
            return { userBusy, calendars };
        },
        async createEvent(input, deps) {
            const calendarId = input.calendarId ?? 'primary';
            const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
            // Build request body — use dateTime with timezone offset for timed events
            const requestBody = {
                summary: input.summary,
                start: { dateTime: input.start.toISOString() },
                end: { dateTime: input.end.toISOString() },
            };
            if (input.description) {
                requestBody.description = input.description;
            }
            if (input.location) {
                requestBody.location = input.location;
            }
            if (input.attendees?.length) {
                requestBody.attendees = input.attendees.map((email) => ({ email }));
            }
            const res = await googleFetch(url, storage, workspaceRoot, {
                method: 'POST',
                body: requestBody,
                fetchFn: deps?.fetch,
            });
            if (!res.ok) {
                handleApiError(res.status, calendarId);
            }
            const data = (await res.json());
            return {
                id: data.id,
                htmlLink: data.htmlLink,
                summary: data.summary ?? input.summary,
                start: new Date(data.start.dateTime ?? data.start.date ?? input.start.toISOString()),
                end: new Date(data.end.dateTime ?? data.end.date ?? input.end.toISOString()),
            };
        },
    };
}
/**
 * Fetch available calendars for the authenticated user.
 * Used by the configure command to let users pick calendars.
 */
export async function listCalendars(storage, workspaceRoot) {
    return fetchCalendarList(storage, workspaceRoot);
}
//# sourceMappingURL=google-calendar.js.map