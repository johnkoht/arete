/**
 * Integration commands — list, add, configure, remove
 */

import { createServices, KrispMcpClient, saveKrispCredentials } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, listItem, success, error, warn, info } from '../formatters.js';

export function registerIntegrationCommands(program: Command): void {
  const integrationCmd = program
    .command('integration')
    .description('Manage integrations');

  integrationCmd
    .command('list')
    .description('List available integrations and their status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      const entries = root
        ? await services.integrations.list(root)
        : [];

      if (opts.json) {
        console.log(
          JSON.stringify(
            { success: true, workspace: root, integrations: entries },
            null,
            2,
          ),
        );
        return;
      }

      header('Available Integrations');
      if (entries.length === 0) {
        if (!root) {
          info('Not in an Areté workspace. Run "arete install" first.');
        } else {
          info('No integrations configured.');
        }
        console.log('');
        return;
      }

      for (const int of entries) {
        const status =
          int.configured === 'active'
            ? chalk.green(' [active]')
            : int.configured
              ? chalk.yellow(` [${int.configured}]`)
              : '';
        console.log(`  ${chalk.dim('•')} ${int.displayName ?? int.name}${status}`);
        if (int.description) {
          console.log(`    ${chalk.dim(int.description)}`);
        }
      }
      console.log('');
    });

  integrationCmd
    .command('configure <name>')
    .description('Configure an integration')
    .option('--calendars <list>', 'Calendar names (comma-separated)')
    .option('--all', 'Include all calendars')
    .option('--json', 'Output as JSON')
    .action(
      async (
        name: string,
        opts: { calendars?: string; all?: boolean; json?: boolean },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
          } else {
            error('Not in an Areté workspace');
          }
          process.exit(1);
        }

        if (name === 'calendar') {
          const selectedCalendars = (opts.calendars ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

          const calendarConfig: Record<string, unknown> = {
            provider: 'macos',
            status: 'active',
          };

          if (opts.all) {
            calendarConfig.calendars = [];
          } else if (selectedCalendars.length > 0) {
            calendarConfig.calendars = selectedCalendars;
          }

          await services.integrations.configure(root, name, calendarConfig);

          if (opts.json) {
            console.log(
              JSON.stringify({
                success: true,
                integration: name,
                provider: 'macos',
                calendars: opts.all ? 'all' : selectedCalendars,
              }),
            );
          } else {
            success('calendar integration configured');
            if (opts.all) {
              info('Calendar scope: all calendars');
            } else if (selectedCalendars.length > 0) {
              info(`Calendar scope: ${selectedCalendars.join(', ')}`);
            } else {
              info('Calendar scope: provider configured (add --calendars or --all to set scope)');
            }
          }
          return;
        }

        if (name === 'google-calendar') {
          // 1. Run OAuth flow
          const { authenticateGoogle, listCalendars } = await import('@arete/core');
          console.log('');
          info('Opening browser for Google Calendar authorization...');
          info('If you see an "unverified app" warning, click "Advanced" → "Go to Areté"');
          console.log('');
          await authenticateGoogle(services.storage, root);
          success('Google Calendar authenticated');

          // 2. Fetch and select calendars
          const calendars = await listCalendars(services.storage, root);

          let selectedCalendarIds: string[] = [];
          if (opts.all) {
            selectedCalendarIds = calendars.map(c => c.id);
          } else if (opts.calendars) {
            selectedCalendarIds = opts.calendars.split(',').map(s => s.trim()).filter(Boolean);
          } else if (calendars.length > 0) {
            // Interactive calendar selection
            const { checkbox } = await import('@inquirer/prompts');
            const selected = await checkbox({
              message: 'Select calendars to sync',
              choices: calendars.map(c => ({
                name: `${c.summary}${c.primary ? ' (primary)' : ''}`,
                value: c.id,
                checked: c.primary === true,
              })),
              pageSize: 12,
            });
            selectedCalendarIds = selected;
          }

          // 3. Write config — provider: 'google' (producer-consumer: factory reads this exact string)
          const calendarConfig: Record<string, unknown> = {
            provider: 'google',  // getCalendarProvider reads this — keep in sync
            status: 'active',
            calendars: selectedCalendarIds,
          };
          await services.integrations.configure(root, 'calendar', calendarConfig);

          if (opts.json) {
            console.log(JSON.stringify({
              success: true,
              integration: 'google-calendar',
              provider: 'google',
              calendars: selectedCalendarIds,
            }));
          } else {
            success('Google Calendar configured');
            info(`Syncing ${selectedCalendarIds.length} calendar(s)`);
            info('Run: arete pull calendar');
          }
          return;
        }

        if (name === 'krisp') {
          const client = new KrispMcpClient(services.storage, root);
          const creds = await client.configure(services.storage, root);
          await saveKrispCredentials(services.storage, root, creds);
          await services.integrations.configure(root, 'krisp', { status: 'active' });
          if (opts.json) {
            console.log(JSON.stringify({ success: true, integration: 'krisp' }));
          } else {
            success('✅ Krisp connected. Run `arete pull krisp` to sync meetings.');
          }
          return;
        }

        await services.integrations.configure(root, name, { status: 'active' });
        if (opts.json) {
          console.log(JSON.stringify({ success: true, integration: name }));
        } else {
          success(`${name} integration configured`);
        }
      },
    );
}
