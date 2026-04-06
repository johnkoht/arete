/**
 * arete pull [integration] — fetch data from integrations
 */

import { createServices, loadConfig, getCalendarProvider, refreshQmdIndex, inferMeetingImportance, findMatchingAgendaPath, getEmailProvider, getDriveProvider } from '@arete/core';
import type { QmdRefreshResult, CalendarProvider, AreteConfig, EmailProvider, DriveProvider } from '@arete/core';
import type { Command } from 'commander';
import { isAbsolute, join, basename } from 'path';
import { tmpdir } from 'os';
import { header, listItem, success, error, info } from '../formatters.js';
import { resolveEntities } from '@arete/core';
import { displayQmdResult } from '../lib/qmd-output.js';

const DEFAULT_DAYS = 7;
const DEFAULT_NOTION_DESTINATION = 'resources/notes';

export function registerPullCommand(program: Command): void {
  program
    .command('pull [integration]')
    .description('Fetch latest data from integrations or calendar')
    .option('--days <n>', 'Number of days to fetch', String(DEFAULT_DAYS))
    .option('--today', 'Fetch only today\'s events (calendar only)')
    .option('--page <url-or-id>', 'Notion page URL/ID (repeatable)', collectOptionValues, [])
    .option('--destination <path>', 'Destination path for Notion pulls', DEFAULT_NOTION_DESTINATION)
    .option('--dry-run', 'Fetch + convert and print markdown without saving (notion only)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .option('--query <q>', 'Search query (drive, gmail)')
    .action(
      async (
        integration: string | undefined,
        opts: {
          days?: string;
          today?: boolean;
          page?: string[];
          destination?: string;
          dryRun?: boolean;
          skipQmd?: boolean;
          json?: boolean;
          query?: string;
        },
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
          return pullCalendarHelper(services, root, { today: opts.today ?? false, json: opts.json ?? false });
        }

        if (integration === 'notion') {
          return pullNotion(services, root, {
            pages: opts.page ?? [],
            destination: opts.destination ?? DEFAULT_NOTION_DESTINATION,
            dryRun: Boolean(opts.dryRun),
            skipQmd: Boolean(opts.skipQmd),
            json: Boolean(opts.json),
          });
        }

        if (integration === 'gmail') {
          return pullGmailHelper(services, root, {
            days,
            json: opts.json ?? false,
          });
        }

        if (integration === 'drive') {
          return pullDriveHelper(services, root, {
            days,
            json: opts.json ?? false,
            query: opts.query,
          });
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
          displayQmdResult(qmdResult);
          return;
        }

        if (integration === 'krisp') {
          const config = await loadConfig(services.storage, root);
          const result = await services.integrations.pull(root, 'krisp', { integration: 'krisp', days });

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
                  integration: 'krisp',
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
          header('Pull Latest Data');
          listItem('Integration', 'Krisp');
          listItem('Time range', `Last ${days} days`);
          console.log('');
          if (result.errors.length === 0) {
            success(`Krisp pull complete! ${result.itemsCreated} item(s) saved.`);
          } else {
            error(`Krisp pull failed: ${result.errors.join(', ')}`);
          }
          displayQmdResult(qmdResult);
          return;
        }

        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: `Unknown integration: ${integration}`,
              available: ['calendar', 'drive', 'fathom', 'gmail', 'krisp', 'notion'],
            }),
          );
        } else {
          error(`Unknown integration: ${integration}`);
          info('Available: calendar, drive, fathom, gmail, krisp, notion');
        }
        process.exit(1);
      },
    );
}

function collectOptionValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export type PullNotionDeps = {
  loadConfigFn: (
    storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'],
    workspaceRoot: string,
  ) => Promise<{ qmd_collection?: string }>;
  refreshQmdIndexFn: (workspaceRoot: string, collectionName: string | undefined) => Promise<QmdRefreshResult>;
};

export type PullCalendarDeps = {
  loadConfigFn: (
    storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'],
    workspaceRoot: string,
  ) => Promise<AreteConfig>;
  getCalendarProviderFn: (
    config: AreteConfig,
    storage: Awaited<ReturnType<typeof import('@arete/core').createServices>>['storage'],
    workspaceRoot: string,
  ) => Promise<CalendarProvider | null>;
};

export async function pullNotion(
  services: Awaited<ReturnType<typeof import('@arete/core').createServices>>,
  workspaceRoot: string,
  opts: {
    pages: string[];
    destination: string;
    dryRun: boolean;
    skipQmd: boolean;
    json: boolean;
  },
  deps: PullNotionDeps = {
    loadConfigFn: loadConfig,
    refreshQmdIndexFn: refreshQmdIndex,
  },
): Promise<void> {
  if (opts.pages.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ success: false, error: 'Provide at least one --page <url-or-id>' }));
    } else {
      error('Provide at least one --page <url-or-id>');
    }
    process.exit(1);
  }

  if (opts.dryRun) {
    const dryRunDestination = join(
      tmpdir(),
      `arete-notion-dry-run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    try {
      const result = await services.integrations.pull(workspaceRoot, 'notion', {
        integration: 'notion',
        pages: opts.pages,
        destination: dryRunDestination,
      });

      const markdownFiles = (await services.storage.list(dryRunDestination, { extensions: ['.md'] }))
        .sort((a, b) => a.localeCompare(b));

      const previews: Array<{ path: string; markdown: string }> = [];
      for (const filePath of markdownFiles) {
        const content = await services.storage.read(filePath);
        if (content) {
          previews.push({
            path: filePath,
            markdown: stripFrontmatter(content),
          });
        }
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: result.errors.length === 0,
              integration: 'notion',
              dryRun: true,
              itemsProcessed: result.itemsProcessed,
              itemsCreated: result.itemsCreated,
              errors: result.errors,
              previews,
            },
            null,
            2,
          ),
        );
        return;
      }

      header('Notion Pull (dry-run)');
      listItem('Pages requested', String(opts.pages.length));
      listItem('Pages converted', String(previews.length));
      console.log('');

      if (previews.length === 0) {
        info('No markdown generated.');
      }

      for (const preview of previews) {
        console.log(`--- ${preview.path} ---`);
        console.log(preview.markdown);
        if (!preview.markdown.endsWith('\n')) {
          console.log('');
        }
      }

      if (result.errors.length > 0) {
        error(`Notion dry-run completed with errors: ${result.errors.join(', ')}`);
      }
      return;
    } finally {
      await services.storage.delete(dryRunDestination);
    }
  }

  const destination = resolveDestinationPath(workspaceRoot, opts.destination);
  const result = await services.integrations.pull(workspaceRoot, 'notion', {
    integration: 'notion',
    pages: opts.pages,
    destination,
  });

  let qmdResult: QmdRefreshResult | undefined;
  if (result.itemsCreated > 0 && !opts.skipQmd) {
    const config = await deps.loadConfigFn(services.storage, workspaceRoot);
    qmdResult = await deps.refreshQmdIndexFn(workspaceRoot, config.qmd_collection);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: result.errors.length === 0,
          integration: 'notion',
          destination,
          pages: opts.pages,
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

  header('Pull Latest Data');
  listItem('Integration', 'Notion');
  listItem('Pages', String(opts.pages.length));
  listItem('Destination', destination);
  console.log('');

  if (result.errors.length === 0) {
    success(`Notion pull complete! ${result.itemsCreated} page(s) saved.`);
  } else {
    error(`Notion pull completed with errors: ${result.errors.join(', ')}`);
  }
  displayQmdResult(qmdResult);
}

function resolveDestinationPath(workspaceRoot: string, destination: string): string {
  if (isAbsolute(destination)) {
    return destination;
  }
  return join(workspaceRoot, destination);
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : content;
}

export async function pullCalendarHelper(
  services: Awaited<ReturnType<typeof import('@arete/core').createServices>>,
  workspaceRoot: string,
  opts: {
    today: boolean;
    json: boolean;
  },
  deps: PullCalendarDeps = {
    loadConfigFn: loadConfig,
    getCalendarProviderFn: getCalendarProvider,
  },
): Promise<void> {
  const { today, json } = opts;
  const config = await deps.loadConfigFn(services.storage, workspaceRoot);
  const provider = await deps.getCalendarProviderFn(config, services.storage, workspaceRoot);

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
    let errorMsg: string;
    let helpMsg: string;

    if (provider.name === 'ical-buddy') {
      errorMsg = 'icalBuddy not installed';
      helpMsg = 'Run: brew install ical-buddy';
    } else if (provider.name === 'google-calendar') {
      errorMsg = 'Google Calendar not available';
      helpMsg = 'Run: arete integration configure google-calendar';
    } else {
      errorMsg = `Calendar provider "${provider.name}" not available`;
      helpMsg = 'Check your integration configuration';
    }

    if (json) {
      console.log(
        JSON.stringify({
          success: false,
          error: errorMsg,
          message: helpMsg,
        }),
      );
    } else {
      error(errorMsg);
      info(helpMsg);
    }
    process.exit(1);
  }

  const events = today
    ? await provider.getTodayEvents()
    : await provider.getUpcomingEvents(7);

  const paths = services.workspace.getPaths(workspaceRoot);
  const enrichedEvents: Array<{
    title: string;
    startTime: Date;
    endTime: Date;
    calendar: string;
    location?: string;
    notes?: string;
    isAllDay: boolean;
    attendees: Array<{ name: string; email?: string; personSlug?: string }>;
    organizer?: { name: string; email?: string; self?: boolean };
    importance: 'light' | 'normal' | 'important';
    hasAgenda: boolean;
  }> = [];

  // Cache agenda files — list once before the loop instead of N times for N events
  const agendasDir = join(workspaceRoot, 'now', 'agendas');
  const agendaFiles = await services.storage.list(agendasDir, { extensions: ['.md'] });
  // Build Set of date prefixes (YYYY-MM-DD) for O(1) lookup
  const agendaDateSet = new Set(agendaFiles.map(f => basename(f).slice(0, 10)));

  for (const event of events) {
    // Enrich attendees with personSlug from workspace people
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

    // Check for matching agenda file in now/agendas/ (uses cached date Set for O(1) filtering)
    const dateStr = event.startTime.toISOString().slice(0, 10);
    const agendaPath = agendaDateSet.has(dateStr)
      ? await findMatchingAgendaPath(services.storage, workspaceRoot, dateStr, event.title)
      : null;
    const hasAgenda = agendaPath !== null;

    // Infer importance from calendar event metadata
    const importance = inferMeetingImportance(event, { hasAgenda });

    enrichedEvents.push({
      ...event,
      attendees: enrichedAttendees,
      importance,
      hasAgenda,
    });
  }

  if (json) {
    /**
     * JSON Output Structure for `arete pull calendar --json`:
     * {
     *   success: boolean,
     *   events: Array<{
     *     title: string,
     *     startTime: string (ISO 8601),
     *     endTime: string (ISO 8601),
     *     calendar: string,
     *     location?: string,
     *     notes?: string,
     *     isAllDay: boolean,
     *     attendees: Array<{ name: string, email?: string, personSlug?: string }>,
     *     organizer?: { name: string, email?: string, self?: boolean },
     *     importance: 'light' | 'normal' | 'important',
     *     hasAgenda: boolean
     *   }>
     * }
     *
     * Importance inference rules (see inferMeetingImportance in @arete/core):
     * - 'important': organizer.self=true OR 1:1 meeting (2 attendees)
     * - 'normal': small group (≤3 attendees) OR large meeting with agenda
     * - 'light': large audience (≥5 attendees, not organizer, no agenda)
     */
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
            notes: e.notes ?? null,
            isAllDay: e.isAllDay,
            attendees: e.attendees.map((a) => ({
              name: a.name,
              email: a.email,
              personSlug: a.personSlug,
            })),
            organizer: e.organizer ?? null,
            importance: e.importance,
            hasAgenda: e.hasAgenda,
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

// ---------------------------------------------------------------------------
// Gmail helper
// ---------------------------------------------------------------------------

export async function pullGmailHelper(
  services: Awaited<ReturnType<typeof import('@arete/core').createServices>>,
  workspaceRoot: string,
  opts: {
    days: number;
    json: boolean;
  },
): Promise<void> {
  const config = await loadConfig(services.storage, workspaceRoot);
  const provider = await getEmailProvider(config, services.storage, workspaceRoot);

  if (!provider) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Google Workspace integration not configured',
          message: 'Run: arete integration configure google-workspace',
        }),
      );
    } else {
      error('Google Workspace integration not configured');
      info('Run: arete integration configure google-workspace');
    }
    process.exit(1);
  }

  const available = await provider.isAvailable();
  if (!available) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Gmail provider not available',
          message: 'Ensure gws CLI is installed and authenticated: gws auth login',
        }),
      );
    } else {
      error('Gmail provider not available');
      info('Ensure gws CLI is installed and authenticated: gws auth login');
    }
    process.exit(1);
  }

  // Build date query if --days specified
  let queryExtra = '';
  if (opts.days > 0) {
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - opts.days);
    const yyyy = afterDate.getFullYear();
    const mm = String(afterDate.getMonth() + 1).padStart(2, '0');
    const dd = String(afterDate.getDate()).padStart(2, '0');
    queryExtra = ` after:${yyyy}/${mm}/${dd}`;
  }

  // getImportantUnread will add the base query; if we have a date filter,
  // use searchThreads directly with the combined query
  let threads;
  if (queryExtra) {
    threads = await provider.searchThreads(
      `is:important is:unread -category:promotions -category:social${queryExtra}`,
      { maxResults: 20 },
    );
  } else {
    threads = await provider.getImportantUnread({ maxResults: 20 });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          integration: 'gmail',
          threads,
        },
        null,
        2,
      ),
    );
    return;
  }

  header('Gmail — Important Unread');
  console.log('');

  if (threads.length === 0) {
    info('No important unread threads found.');
    return;
  }

  for (const thread of threads) {
    console.log(`  * [${thread.subject}] — from ${thread.from}, ${thread.date}`);
    if (thread.snippet) {
      console.log(`    ${thread.snippet}`);
    }
    console.log('');
  }

  console.log(`Total: ${threads.length} thread(s)`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Drive helper
// ---------------------------------------------------------------------------

export async function pullDriveHelper(
  services: Awaited<ReturnType<typeof import('@arete/core').createServices>>,
  workspaceRoot: string,
  opts: {
    days: number;
    json: boolean;
    query?: string;
  },
): Promise<void> {
  const config = await loadConfig(services.storage, workspaceRoot);
  const provider = await getDriveProvider(config, services.storage, workspaceRoot);

  if (!provider) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Google Workspace integration not configured',
          message: 'Run: arete integration configure google-workspace',
        }),
      );
    } else {
      error('Google Workspace integration not configured');
      info('Run: arete integration configure google-workspace');
    }
    process.exit(1);
  }

  const available = await provider.isAvailable();
  if (!available) {
    if (opts.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: 'Drive provider not available',
          message: 'Ensure gws CLI is installed and authenticated: gws auth login',
        }),
      );
    } else {
      error('Drive provider not available');
      info('Ensure gws CLI is installed and authenticated: gws auth login');
    }
    process.exit(1);
  }

  let files;
  if (opts.query) {
    // Drive API requires query syntax (e.g. `fullText contains 'term'`).
    // If the user passed plain text, wrap it as a fullText search.
    const driveQuery = /\b(contains|mimeType|modifiedTime|and\b|or\b|not\b|in\b)/.test(opts.query)
      ? opts.query
      : `fullText contains '${opts.query.replace(/'/g, "\\'")}'`;
    files = await provider.search(driveQuery, { maxResults: 25 });
  } else {
    // Default: recent files within --days range
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - opts.days);
    const iso = cutoff.toISOString();
    files = await provider.search(`modifiedTime > '${iso}'`, { maxResults: 25 });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          integration: 'drive',
          files,
        },
        null,
        2,
      ),
    );
    return;
  }

  header('Google Drive Files');
  console.log('');

  if (files.length === 0) {
    info('No files found matching the query.');
    return;
  }

  for (const file of files) {
    const modified = file.modifiedTime ? file.modifiedTime.split('T')[0] : 'unknown';
    const link = file.webViewLink ? ` — ${file.webViewLink}` : '';
    console.log(`  * [${file.name}] (${file.mimeType}) — modified ${modified}${link}`);
  }

  console.log('');
  console.log(`Total: ${files.length} file(s)`);
  console.log('');
}
