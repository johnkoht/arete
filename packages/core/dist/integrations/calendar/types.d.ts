/**
 * Shared calendar provider types.
 *
 * All calendar providers (ical-buddy, google-calendar, etc.) implement
 * CalendarProvider and return CalendarEvent instances.
 */
export interface CalendarEvent {
    title: string;
    startTime: Date;
    endTime: Date;
    calendar: string;
    location?: string;
    attendees: Array<{
        name: string;
        email?: string;
    }>;
    notes?: string;
    isAllDay: boolean;
}
export interface CalendarOptions {
    calendars?: string[];
}
/**
 * A block of time when a calendar is busy.
 */
export interface BusyBlock {
    start: Date;
    end: Date;
}
/**
 * FreeBusy result for a single calendar (identified by email).
 */
export interface FreeBusyCalendarResult {
    busy: BusyBlock[];
    accessible: boolean;
    error?: string;
}
/**
 * FreeBusy result for a query.
 * - userBusy: busy blocks from the authenticated user's primary calendar
 * - calendars: per-email results for requested calendars
 */
export interface FreeBusyResult {
    userBusy: BusyBlock[];
    calendars: Record<string, FreeBusyCalendarResult>;
}
/**
 * Input for creating a calendar event.
 */
export interface CreateEventInput {
    summary: string;
    start: Date;
    end: Date;
    calendarId?: string;
    description?: string;
    location?: string;
    attendees?: string[];
}
/**
 * Result of creating a calendar event.
 */
export interface CreatedEvent {
    id: string;
    htmlLink: string;
    summary: string;
    start: Date;
    end: Date;
}
export interface CalendarProvider {
    name: string;
    isAvailable(): Promise<boolean>;
    getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]>;
    getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]>;
    /**
     * Query free/busy information for a list of email addresses.
     * Optional — not all providers support FreeBusy (e.g., ical-buddy).
     */
    getFreeBusy?(emails: string[], timeMin: Date, timeMax: Date): Promise<FreeBusyResult>;
    /**
     * Create a calendar event.
     * Optional — not all providers support event creation (e.g., ical-buddy).
     */
    createEvent?(input: CreateEventInput): Promise<CreatedEvent>;
}
//# sourceMappingURL=types.d.ts.map