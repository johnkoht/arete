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
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Calendar configure requires interactive mode or --calendars/--all. Use legacy CLI.',
              }),
            );
          } else {
            info('For full calendar configuration, use the legacy CLI: arete integration configure calendar');
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
