/**
 * IcalBuddy calendar provider — macOS Calendar integration via ical-buddy CLI.
 * Reads events from macOS Calendar app using the ical-buddy command-line tool.
 */

import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import type {
  CalendarProvider,
  CalendarEvent,
  CalendarOptions,
  CalendarAttendee,
} from '../calendar.js';

const execFileAsync = promisify(execFile);

export const ICAL_BUDDY_PROVIDER_NAME = 'ical-buddy';

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds for calendar queries

/** Optional test doubles (used only in tests) */
export interface IcalBuddyTestDeps {
  whichSync: () => { status: number; stdout?: string };
  execFileAsync: (
    file: string,
    args: string[],
    opts: { timeout: number; maxBuffer: number }
  ) => Promise<{ stdout?: string; stderr?: string }>;
}

/**
 * Parse attendee string from ical-buddy output.
 * Format: "Name <email>" or "Name" or "email"
 */
function parseAttendee(attendeeStr: string): CalendarAttendee {
  const trimmed = attendeeStr.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  // Check if it looks like an email
  if (trimmed.includes('@')) {
    return { name: trimmed, email: trimmed };
  }
  return { name: trimmed };
}

/**
 * Parse ical-buddy event block into CalendarEvent.
 * Example block:
 * • Meeting Title
 *     location: Conference Room A
 *     2026-02-09 at 14:00 - 15:00
 *     attendees: Jane Doe <jane@example.com>, John Smith
 *     notes: Discuss project timeline
 */
export function parseEventBlock(block: string, defaultCalendar: string = 'Unknown'): CalendarEvent | null {
  const lines = block.split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;

  // First line after • is the title
  const titleLine = lines[0].replace(/^•\s*/, '').trim();
  if (!titleLine) return null;

  let location: string | undefined;
  let attendees: CalendarAttendee[] = [];
  let notes: string | undefined;
  let dateTimeLine: string | undefined;
  let calendar = defaultCalendar;

  // Parse remaining lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('location:')) {
      location = line.substring('location:'.length).trim();
    } else if (line.startsWith('attendees:')) {
      const attendeeStr = line.substring('attendees:'.length).trim();
      attendees = attendeeStr.split(',').map(parseAttendee);
    } else if (line.startsWith('notes:')) {
      notes = line.substring('notes:'.length).trim();
    } else if (line.startsWith('calendar:')) {
      calendar = line.substring('calendar:'.length).trim();
    } else if (line.match(/\d{4}-\d{2}-\d{2}/)) {
      // Date/time line
      dateTimeLine = line;
    }
  }

  if (!dateTimeLine) return null;

  // Parse date and time
  // Format: "2026-02-09 at 14:00 - 15:00" or "2026-02-09 (all-day)"
  const isAllDay = dateTimeLine.includes('all-day') || dateTimeLine.includes('00:00 - 00:00');
  
  let startTime: Date;
  let endTime: Date;

  if (isAllDay) {
    // All-day event
    const dateMatch = dateTimeLine.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return null;
    startTime = new Date(dateMatch[1] + 'T00:00:00.000Z');
    endTime = new Date(dateMatch[1] + 'T23:59:59.000Z');
  } else {
    // Regular event with times
    const timeMatch = dateTimeLine.match(/(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (!timeMatch) return null;
    
    const [, date, startTimeStr, endTimeStr] = timeMatch;
    startTime = new Date(`${date}T${startTimeStr}:00.000Z`);
    endTime = new Date(`${date}T${endTimeStr}:00.000Z`);
  }

  return {
    title: titleLine,
    startTime,
    endTime,
    calendar,
    location,
    attendees,
    notes,
    isAllDay,
  };
}

/**
 * Parse ical-buddy output into CalendarEvent array.
 * Events are separated by blank lines.
 */
export function parseIcalBuddyOutput(stdout: string, defaultCalendar: string = 'Unknown'): CalendarEvent[] {
  if (!stdout.trim()) return [];

  // Split on blank lines to get event blocks
  const blocks = stdout.split(/\n\s*\n/).filter(b => b.trim());
  
  const events: CalendarEvent[] = [];
  for (const block of blocks) {
    const event = parseEventBlock(block, defaultCalendar);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * IcalBuddy-backed calendar provider. isAvailable() checks for ical-buddy binary.
 * getTodayEvents() and getUpcomingEvents() run ical-buddy and parse output.
 * Optional testDeps for unit tests (inject mocks).
 */
export function getProvider(
  testDeps?: IcalBuddyTestDeps
): CalendarProvider {
  const whichSyncImpl = testDeps?.whichSync ?? (() => spawnSync('which', ['ical-buddy'], { encoding: 'utf8' }));
  const execFileAsyncImpl =
    testDeps?.execFileAsync ??
    (async (file: string, args: string[], opts: { timeout: number; maxBuffer: number }) =>
      execFileAsync(file, args, opts) as Promise<{ stdout?: string; stderr?: string }>);

  async function runIcalBuddy(args: string[], options?: CalendarOptions): Promise<CalendarEvent[]> {
    try {
      const finalArgs = [...args];
      
      // Add calendar filter if specified
      if (options?.calendars && options.calendars.length > 0) {
        finalArgs.push('-ic', options.calendars.join(','));
      }

      const { stdout } = await execFileAsyncImpl(
        'ical-buddy',
        finalArgs,
        { timeout: DEFAULT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
      );

      return parseIcalBuddyOutput(stdout ?? '', options?.calendars?.[0] ?? 'Unknown');
    } catch {
      // Graceful degradation: return empty array on error
      return [];
    }
  }

  return {
    name: ICAL_BUDDY_PROVIDER_NAME,

    async isAvailable(): Promise<boolean> {
      try {
        const r = whichSyncImpl();
        return r.status === 0 && (r.stdout?.trim()?.length ?? 0) > 0;
      } catch {
        return false;
      }
    },

    async getTodayEvents(options?: CalendarOptions): Promise<CalendarEvent[]> {
      const args = [
        '-b', '',          // No bullet prefix
        '-nc',             // No calendar names in output
        '-nrd',            // No relative dates
        '-ea',             // Include event attendees
        '-df', '%Y-%m-%d', // Date format
        '-tf', '%H:%M',    // Time format
        '-li',             // Limit items (not used but keeps format clean)
        'eventsToday'      // Command: events today
      ];
      
      return runIcalBuddy(args, options);
    },

    async getUpcomingEvents(days: number, options?: CalendarOptions): Promise<CalendarEvent[]> {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + days);

      const formatDate = (d: Date) => d.toISOString().split('T')[0];

      const args = [
        '-b', '',          // No bullet prefix
        '-nc',             // No calendar names in output
        '-nrd',            // No relative dates
        '-ea',             // Include event attendees
        '-df', '%Y-%m-%d', // Date format
        '-tf', '%H:%M',    // Time format
        'eventsFrom:today',
        `to:${formatDate(endDate)}`
      ];
      
      return runIcalBuddy(args, options);
    },
  };
}
