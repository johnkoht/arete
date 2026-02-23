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
  attendees: Array<{ name: string; email?: string }>;
  notes?: string;
  isAllDay: boolean;
}

export interface CalendarOptions {
  calendars?: string[];
}

export interface CalendarProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]>;
  getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]>;
}
