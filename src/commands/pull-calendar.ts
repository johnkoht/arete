/**
 * Pull calendar command - fetch calendar events with person matching
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig } from '../core/config.js';
import { getCalendarProvider } from '../core/calendar.js';
import type { CalendarEvent, CalendarAttendee } from '../core/calendar.js';
import { resolveEntities } from '../core/entity-resolution.js';
import type { ResolvedEntity } from '../types.js';
import { error, info } from '../core/utils.js';

export interface PullCalendarOptions {
  today?: boolean;
  json?: boolean;
  // For testing - inject a provider instead of loading from config
  _testProvider?: import('../core/calendar.js').CalendarProvider;
}

/** Calendar attendee with optional person match */
export interface EnrichedAttendee extends CalendarAttendee {
  personSlug?: string;
  personRole?: string;
  personCategory?: string;
}

/** Calendar event with enriched attendees */
export interface EnrichedCalendarEvent extends Omit<CalendarEvent, 'attendees'> {
  attendees: EnrichedAttendee[];
}

/**
 * Format time for terminal output (e.g. "14:00-15:00")
 */
function formatTimeRange(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${startTime}-${endTime}`;
}

/**
 * Format date for terminal output (e.g. "2026-02-09")
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Match attendee emails to person files
 */
async function enrichAttendees(
  attendees: CalendarAttendee[],
  paths: ReturnType<typeof getWorkspacePaths>
): Promise<EnrichedAttendee[]> {
  const enriched: EnrichedAttendee[] = [];

  for (const attendee of attendees) {
    const enrichedAttendee: EnrichedAttendee = { ...attendee };

    if (attendee.email) {
      const matches = resolveEntities(attendee.email, 'person', paths, 1);
      if (matches.length > 0) {
        const match = matches[0];
        enrichedAttendee.personSlug = match.slug;
        enrichedAttendee.personRole = match.metadata.role as string | undefined;
        enrichedAttendee.personCategory = match.metadata.category as string | undefined;
      }
    }

    enriched.push(enrichedAttendee);
  }

  return enriched;
}

/**
 * Format calendar event for terminal output
 */
function formatEventForTerminal(event: EnrichedCalendarEvent): string {
  const lines: string[] = [];

  // Date and time header
  const dateStr = formatDate(event.startTime);
  const timeStr = event.isAllDay ? 'All day' : formatTimeRange(event.startTime, event.endTime);
  const header = `📅 ${dateStr} ${timeStr}  ${event.title}`;
  const calendarTag = ` (${event.calendar})`;
  lines.push(header + calendarTag);

  // Location
  if (event.location) {
    lines.push(`   📍 ${event.location}`);
  }

  // Attendees
  if (event.attendees.length > 0) {
    lines.push('   👥 Attendees:');
    for (const attendee of event.attendees) {
      let attendeeLine = `      ${attendee.name}`;
      if (attendee.email) {
        attendeeLine += ` (${attendee.email})`;
      }
      if (attendee.personRole && attendee.personCategory) {
        attendeeLine += ` - ${attendee.personRole} [${attendee.personCategory}]`;
      }
      if (attendee.status && attendee.status !== 'none') {
        attendeeLine += ` [${attendee.status}]`;
      }
      lines.push(attendeeLine);
    }
  }

  return lines.join('\n');
}

/**
 * Pull calendar events
 */
export async function pullCalendar(options: PullCalendarOptions): Promise<void> {
  const { today = false, json = false } = options;

  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const config = loadConfig(workspaceRoot);

  // Get calendar provider (use test provider if provided)
  const provider = options._testProvider || await getCalendarProvider(config);

  if (!provider) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'Calendar not configured',
        message: 'Run: arete integration configure calendar'
      }));
    } else {
      error('Calendar not configured');
      info('Run: arete integration configure calendar');
    }
    process.exit(1);
  }

  // Check if provider is available (e.g. ical-buddy installed)
  const available = await provider.isAvailable();
  if (!available) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'ical-buddy not installed',
        message: 'Run: brew install ical-buddy'
      }));
    } else {
      error('ical-buddy not installed');
      info('Run: brew install ical-buddy');
    }
    process.exit(1);
  }

  // Fetch events
  let events: CalendarEvent[];
  try {
    if (today) {
      events = await provider.getTodayEvents();
    } else {
      events = await provider.getUpcomingEvents(7);
    }
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'Failed to fetch calendar events',
        message: (err as Error).message
      }));
    } else {
      error('Failed to fetch calendar events');
      info((err as Error).message);
    }
    process.exit(1);
  }

  if (events.length === 0) {
    if (json) {
      console.log(JSON.stringify({ success: true, events: [] }));
    } else {
      info('No events found');
    }
    return;
  }

  // Enrich events with person matching
  const enrichedEvents: EnrichedCalendarEvent[] = [];
  for (const event of events) {
    const enrichedAttendees = await enrichAttendees(event.attendees, paths);
    enrichedEvents.push({
      ...event,
      attendees: enrichedAttendees
    });
  }

  // Output
  if (json) {
    console.log(JSON.stringify({
      success: true,
      events: enrichedEvents.map(e => ({
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        calendar: e.calendar,
        location: e.location,
        isAllDay: e.isAllDay,
        notes: e.notes,
        attendees: e.attendees.map(a => ({
          name: a.name,
          email: a.email,
          status: a.status,
          personSlug: a.personSlug,
          personRole: a.personRole,
          personCategory: a.personCategory
        }))
      }))
    }, null, 2));
  } else {
    // Terminal output
    console.log('');
    console.log(`📅 Calendar Events (${today ? 'Today' : 'Next 7 days'})`);
    console.log('');

    for (const event of enrichedEvents) {
      console.log(formatEventForTerminal(event));
      console.log('');
    }

    console.log(`Total: ${enrichedEvents.length} event${enrichedEvents.length === 1 ? '' : 's'}`);
    console.log('');
  }
}

export default pullCalendar;
