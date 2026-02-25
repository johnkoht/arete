/**
 * Google Calendar provider — thin REST wrapper over the Google Calendar API.
 *
 * No `googleapis` dependency. Uses native `fetch` with Bearer token auth.
 * Implements `CalendarProvider` interface for use with the calendar factory.
 */
import type { StorageAdapter } from '../../storage/adapter.js';
import type { CalendarProvider } from './types.js';
/**
 * Dependencies that can be injected for testing the FreeBusy method.
 * Follows the same pattern as IcalBuddyCalendarDeps in ical-buddy.ts.
 */
export interface FreeBusyDeps {
    fetch?: typeof fetch;
}
/**
 * Dependencies that can be injected for testing the createEvent method.
 */
export interface CreateEventDeps {
    fetch?: typeof fetch;
}
/**
 * Factory function returning a CalendarProvider for Google Calendar.
 *
 * The provider never throws from isAvailable() — returns false if
 * credentials are missing or refresh fails.
 */
export declare function getGoogleCalendarProvider(storage: StorageAdapter, workspaceRoot: string): CalendarProvider;
/**
 * Fetch available calendars for the authenticated user.
 * Used by the configure command to let users pick calendars.
 */
export declare function listCalendars(storage: StorageAdapter, workspaceRoot: string): Promise<Array<{
    id: string;
    summary: string;
    primary?: boolean;
}>>;
//# sourceMappingURL=google-calendar.d.ts.map