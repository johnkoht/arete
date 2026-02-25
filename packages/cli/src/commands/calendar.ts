/**
 * arete calendar — calendar event management commands
 */

import {
  createServices,
  loadConfig,
  getCalendarProvider,
  type CalendarProvider,
  type CreateEventInput,
  type CreatedEvent,
} from '@arete/core';
import type { Command } from 'commander';
import { header, listItem, error, info, success, formatSlotTime } from '../formatters.js';

const DEFAULT_DURATION = 30;

/**
 * Parse natural language date strings into Date objects.
 * Supports:
 * - ISO dates: 2026-02-26T14:00:00
 * - Keywords: today, tomorrow
 * - Day + time: monday 2pm, tuesday 10:30am
 * - Relative: next monday, next week
 */
export function parseNaturalDate(input: string): Date {
  const trimmed = input.trim().toLowerCase();
  const now = new Date();

  // ISO date: try parsing directly
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = new Date(input.trim()); // Use original case for ISO
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Keywords: today, tomorrow
  if (trimmed === 'today') {
    // Today at next hour
    const result = new Date(now);
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
    return result;
  }

  if (trimmed === 'tomorrow') {
    // Tomorrow at 9am
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  // Day names
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Relative: next week (Monday of next week at 9am)
  if (trimmed === 'next week') {
    const result = new Date(now);
    const currentDay = result.getDay();
    const daysUntilNextMonday = currentDay === 0 ? 8 : 8 - currentDay + 7;
    result.setDate(result.getDate() + daysUntilNextMonday);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  // Parse time string like "2pm", "10:30am", "14:00"
  function parseTime(timeStr: string): { hours: number; minutes: number } | null {
    // 12-hour format: 2pm, 10:30am
    const match12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      const period = match12[3].toLowerCase();

      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }

      return { hours, minutes };
    }

    // 24-hour format: 14:00
    const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
      return {
        hours: parseInt(match24[1], 10),
        minutes: parseInt(match24[2], 10),
      };
    }

    return null;
  }

  // Get next occurrence of a day of week
  function getNextDay(targetDay: number): Date {
    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }
    result.setDate(result.getDate() + daysToAdd);
    return result;
  }

  // Relative + day: next monday, next tuesday
  const nextDayMatch = trimmed.match(/^next\s+(\w+)$/);
  if (nextDayMatch) {
    const dayName = nextDayMatch[1];
    const dayIndex = dayNames.indexOf(dayName);
    if (dayIndex !== -1) {
      const result = getNextDay(dayIndex);
      // If today is that day, skip to next week
      if (now.getDay() === dayIndex) {
        result.setDate(result.getDate() + 7);
      }
      result.setHours(9, 0, 0, 0);
      return result;
    }
  }

  // Day + time: monday 2pm, tuesday 10:30am
  const dayTimeMatch = trimmed.match(/^(\w+)\s+(.+)$/);
  if (dayTimeMatch) {
    const dayName = dayTimeMatch[1];
    const timeStr = dayTimeMatch[2];

    // Check if it's "tomorrow Xpm"
    if (dayName === 'tomorrow') {
      const time = parseTime(timeStr);
      if (time) {
        const result = new Date(now);
        result.setDate(result.getDate() + 1);
        result.setHours(time.hours, time.minutes, 0, 0);
        return result;
      }
    }

    // Check if it's "today Xpm"
    if (dayName === 'today') {
      const time = parseTime(timeStr);
      if (time) {
        const result = new Date(now);
        result.setHours(time.hours, time.minutes, 0, 0);
        return result;
      }
    }

    // Regular day name
    const dayIndex = dayNames.indexOf(dayName);
    if (dayIndex !== -1) {
      const time = parseTime(timeStr);
      if (time) {
        const result = getNextDay(dayIndex);
        result.setHours(time.hours, time.minutes, 0, 0);
        return result;
      }
    }
  }

  // No pattern matched
  throw new Error(
    `Invalid date format: "${input}". ` +
      'Valid formats: ISO (2026-02-26T14:00:00), today, tomorrow, ' +
      'day+time (monday 2pm, tomorrow 10:30am), relative (next monday, next week)'
  );
}

export interface CalendarDeps {
  createServicesFn: typeof createServices;
  loadConfigFn: typeof loadConfig;
  getCalendarProviderFn: typeof getCalendarProvider;
}

const defaultDeps: CalendarDeps = {
  createServicesFn: createServices,
  loadConfigFn: loadConfig,
  getCalendarProviderFn: getCalendarProvider,
};

export interface CreateEventOptions {
  title: string;
  start: string;
  duration: number;
  with?: string;
  description?: string;
  json: boolean;
}

export async function createCalendarEvent(
  opts: CreateEventOptions,
  deps: CalendarDeps = defaultDeps
): Promise<void> {
  const services = await deps.createServicesFn(process.cwd());
  const root = await services.workspace.findRoot();

  if (!root) {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace');
    }
    process.exit(1);
  }

  const paths = services.workspace.getPaths(root);

  // Step 1: Parse start time
  let startTime: Date;
  try {
    startTime = parseNaturalDate(opts.start);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Invalid date',
          message,
        })
      );
    } else {
      error(message);
    }
    process.exit(1);
  }

  // Step 2: Calculate end time
  const endTime = new Date(startTime.getTime() + opts.duration * 60 * 1000);

  // Step 3: Resolve person → email if --with is provided
  let attendeeEmail: string | undefined;
  let personName: string | undefined;

  if (opts.with) {
    if (opts.with.includes('@')) {
      // It's already an email
      attendeeEmail = opts.with;
      personName = opts.with;
    } else {
      // Resolve name to person
      const resolved = await services.entity.resolve(opts.with, 'person', paths);
      if (!resolved) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Person not found',
              message: `Could not find '${opts.with}' in people/. Try: arete people list`,
            })
          );
        } else {
          error(`Could not find '${opts.with}' in people/. Try: arete people list`);
        }
        process.exit(1);
      }

      personName = resolved.name;
      const resolvedEmail = resolved.metadata?.email as string | undefined;

      if (!resolvedEmail) {
        const personCategory = resolved.metadata?.category as string | undefined;
        const filePath = personCategory
          ? `people/${personCategory}/${resolved.slug}.md`
          : `people/internal/${resolved.slug}.md`;

        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'No email on file',
              message: `${personName} found but no email on file — add email to ${filePath}`,
            })
          );
        } else {
          error(`${personName} found but no email on file — add email to ${filePath}`);
        }
        process.exit(1);
      }

      attendeeEmail = resolvedEmail;
    }
  }

  // Step 4: Get calendar provider
  const config = await deps.loadConfigFn(services.storage, root);
  const provider = await deps.getCalendarProviderFn(config, services.storage, root);

  if (!provider) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Calendar not configured',
          message: 'Run: arete integration configure calendar',
        })
      );
    } else {
      error('Calendar not configured');
      info('Run: arete integration configure calendar');
    }
    process.exit(1);
  }

  // Step 5: Check provider has createEvent
  if (!provider.createEvent) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Provider does not support event creation',
          message: 'Event creation requires Google Calendar. Run: arete integration configure google-calendar',
        })
      );
    } else {
      error('Event creation requires Google Calendar. Run: arete integration configure google-calendar');
    }
    process.exit(1);
  }

  // Step 6: Build event input
  const eventInput: CreateEventInput = {
    summary: opts.title,
    start: startTime,
    end: endTime,
    ...(opts.description && { description: opts.description }),
    ...(attendeeEmail && { attendees: [attendeeEmail] }),
  };

  // Step 7: Create event
  let createdEvent: CreatedEvent;
  try {
    createdEvent = await provider.createEvent(eventInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Calendar API error',
          message,
        })
      );
    } else {
      error(`Calendar API error: ${message}`);
    }
    process.exit(1);
  }

  // Step 8: Display results
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          event: {
            id: createdEvent.id,
            title: createdEvent.summary,
            start: createdEvent.start.toISOString(),
            end: createdEvent.end.toISOString(),
            duration: opts.duration,
            htmlLink: createdEvent.htmlLink,
            ...(personName && { attendee: { name: personName, email: attendeeEmail } }),
          },
          display: {
            start: formatSlotTime(createdEvent.start),
            end: formatSlotTime(createdEvent.end),
          },
        },
        null,
        2
      )
    );
    return;
  }

  success('Event created');
  console.log('');
  header(createdEvent.summary);
  listItem('When', `${formatSlotTime(createdEvent.start)} → ${formatSlotTime(createdEvent.end)}`);
  listItem('Duration', `${opts.duration} minutes`);
  if (personName) {
    listItem('With', `${personName} (${attendeeEmail})`);
  }
  if (opts.description) {
    listItem('Description', opts.description);
  }
  listItem('Link', createdEvent.htmlLink);
  console.log('');
}

export function registerCalendarCommands(program: Command): void {
  const calendarCmd = program
    .command('calendar')
    .description('Calendar event management');

  calendarCmd
    .command('create')
    .description('Create a calendar event')
    .requiredOption('--title <title>', 'Event title')
    .requiredOption('--start <datetime>', 'Start time (ISO, today, tomorrow, monday 2pm, next monday)')
    .option('--duration <minutes>', 'Duration in minutes', String(DEFAULT_DURATION))
    .option('--with <person-or-email>', 'Person name or email to invite')
    .option('--description <text>', 'Event description')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: {
        title: string;
        start: string;
        duration?: string;
        with?: string;
        description?: string;
        json?: boolean;
      }) => {
        const duration = parseInt(opts.duration ?? String(DEFAULT_DURATION), 10);

        await createCalendarEvent({
          title: opts.title,
          start: opts.start,
          duration,
          with: opts.with,
          description: opts.description,
          json: opts.json ?? false,
        });
      }
    );
}
