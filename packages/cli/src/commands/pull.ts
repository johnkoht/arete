/**
 * arete pull [integration] — fetch data from integrations
 */

import { createServices, loadConfig, getCalendarProvider, refreshQmdIndex } from '@arete/core';
import type { QmdRefreshResult } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, listItem, success, error, info, warn } from '../formatters.js';
import { resolveEntities } from '@arete/core';

const DEFAULT_DAYS = 7;

export function registerPullCommand(program: Command): void {
  program
    .command('pull [integration]')
    .description('Fetch latest data from integrations or calendar')
    .option('--days <n>', 'Number of days to fetch', String(DEFAULT_DAYS))
    .option('--today', 'Fetch only today\'s events (calendar only)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (
        integration: string | undefined,
        opts: { days?: string; today?: boolean; skipQmd?: boolean; json?: boolean },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace first');
          }
          process.exit(1);
        }

        const days = parseInt(opts.days ?? String(DEFAULT_DAYS), 10);

        if (integration === 'calendar') {
          return pullCalendar(services, root, opts.today ?? false, opts.json ?? false);
        }

        if (integration === 'fathom' || !integration) {
          const config = await loadConfig(services.storage, root);
          const result = await services.integrations.pull(root, 'fathom', { integration: 'fathom', days });

          // Auto-refresh qmd index after write (skip if nothing new or --skip-qmd)
          let qmdResult: QmdRefreshResult | undefined;
          if (result.itemsCreated > 0 && !opts.skipQmd) {
            qmdResult = await refreshQmdIndex(root, config.qmd_collection);
          }

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  success: result.errors.length === 0,
                  integration: 'fathom',
                  itemsProcessed: result.itemsProcessed,
                  itemsCreated: result.itemsCreated,
                  errors: result.errors,
                  qmd: qmdResult ?? { indexed: false, skipped: true },
                },
                null,
                2,
              ),
            );
            return;
          }
          if (!opts.json) {
            header('Pull Latest Data');
            listItem('Integration', 'Fathom');
            listItem('Time range', `Last ${days} days`);
            console.log('');
          }
          if (result.errors.length === 0) {
            success(`Fathom pull complete! ${result.itemsCreated} item(s) saved.`);
          } else {
            error(`Fathom pull failed: ${result.errors.join(', ')}`);
          }
          if (qmdResult && !qmdResult.skipped) {
            if (qmdResult.indexed) {
              listItem('Search index', 'qmd index updated');
            }
            if (qmdResult.warning) {
              warn(qmdResult.warning);
            }
          }
          return;
        }

        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: `Unknown integration: ${integration}`,
              available: ['calendar', 'fathom'],
            }),
          );
        } else {
          error(`Unknown integration: ${integration}`);
          info('Available: calendar, fathom');
        }
        process.exit(1);
      },
    );
}

async function pullCalendar(
  services: Awaited<ReturnType<typeof import('@arete/core').createServices>>,
  workspaceRoot: string,
  today: boolean,
  json: boolean,
): Promise<void> {
  const config = await loadConfig(services.storage, workspaceRoot);
  const provider = await getCalendarProvider(config);

  if (!provider) {
    if (json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Calendar not configured',
          message: 'Run: arete integration configure calendar',
        }),
      );
    } else {
      error('Calendar not configured');
      info('Run: arete integration configure calendar');
    }
    process.exit(1);
  }

  const available = await provider.isAvailable();
  if (!available) {
    if (json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'icalBuddy not installed',
          message: 'Run: brew install ical-buddy',
        }),
      );
    } else {
      error('icalBuddy not installed');
      info('Run: brew install ical-buddy');
    }
    process.exit(1);
  }

  const events = today
    ? await provider.getTodayEvents()
    : await provider.getUpcomingEvents(7);

  const paths = services.workspace.getPaths(workspaceRoot);
  const enrichedEvents = [];
  for (const event of events) {
    const enrichedAttendees = [];
    for (const attendee of event.attendees) {
      const e: typeof attendee & { personSlug?: string } = { ...attendee };
      if (attendee.email) {
        const matches = await resolveEntities(
          attendee.email,
          'person',
          paths,
          1,
        );
        if (matches.length > 0) {
          e.personSlug = matches[0].slug;
        }
      }
      enrichedAttendees.push(e);
    }
    enrichedEvents.push({ ...event, attendees: enrichedAttendees });
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          events: enrichedEvents.map((e) => ({
            title: e.title,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime.toISOString(),
            calendar: e.calendar,
            location: e.location,
            isAllDay: e.isAllDay,
            attendees: e.attendees.map((a) => ({
              name: a.name,
              email: a.email,
              personSlug: (a as { personSlug?: string }).personSlug,
            })),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  console.log(`📅 Calendar Events (${today ? 'Today' : 'Next 7 days'})`);
  console.log('');
  for (const event of enrichedEvents) {
    const dateStr = event.startTime.toISOString().split('T')[0];
    const timeStr = event.isAllDay
      ? 'All day'
      : `${event.startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}-${event.endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    console.log(`📅 ${dateStr} ${timeStr}  ${event.title} (${event.calendar})`);
    if (event.location) console.log(`   📍 ${event.location}`);
    if (event.attendees.length > 0) {
      console.log('   👥 Attendees:');
      for (const a of event.attendees) {
        let line = `      ${a.name}`;
        if (a.email) line += ` (${a.email})`;
        console.log(line);
      }
    }
    console.log('');
  }
  console.log(`Total: ${enrichedEvents.length} event(s)`);
  console.log('');
}
