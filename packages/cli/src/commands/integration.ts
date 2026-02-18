/**
 * Integration commands — list, add, configure, remove
 */

import { createServices } from '@arete/core';
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

        await services.integrations.configure(root, name, { status: 'active' });
        if (opts.json) {
          console.log(JSON.stringify({ success: true, integration: name }));
        } else {
          success(`${name} integration configured`);
        }
      },
    );
}
