/**
 * Calendar Provider — abstract interface for calendar integrations.
 * Supports macOS calendar via ical-buddy (and potentially other providers).
 */

import type { AreteConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Calendar attendee status */
export type AttendeeStatus = 'accepted' | 'declined' | 'tentative' | 'none';

/** Calendar event attendee */
export interface CalendarAttendee {
  name: string;
  email?: string;
  status?: AttendeeStatus;
}

/** Calendar event */
export interface CalendarEvent {
  title: string;
  startTime: Date;
  endTime: Date;
  calendar: string;
  location?: string;
  attendees: CalendarAttendee[];
  notes?: string;
  isAllDay: boolean;
}

/** Options for calendar queries */
export interface CalendarOptions {
  /** Filter to specific calendar names (if omitted, all calendars included) */
  calendars?: string[];
}

/** Calendar provider interface */
export interface CalendarProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]>;
  getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Get calendar provider from config.
 * Returns null if no calendar provider is configured or available.
 *
 * @param config - Areté configuration
 * @returns CalendarProvider instance or null
 */
export async function getCalendarProvider(config: AreteConfig): Promise<CalendarProvider | null> {
  // Check if calendar integration is configured
  if (!config.integrations.calendar) {
    return null;
  }

  const calendarConfig = config.integrations.calendar as { provider?: string };
  if (!calendarConfig.provider) {
    return null;
  }

  // Check for ical-buddy provider
  if (calendarConfig.provider === 'ical-buddy') {
    const { getProvider } = await import('./calendar-providers/ical-buddy.js');
    const provider = getProvider();
    
    // Only return if available
    const available = await provider.isAvailable();
    if (available) {
      return provider;
    }
  }

  return null;
}
