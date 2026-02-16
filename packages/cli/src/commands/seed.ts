/**
 * arete seed [source] — import historical data
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, section, listItem, success, error, warn, info } from '../formatters.js';

export function registerSeedCommand(program: Command): void {
  program
    .command('seed [source]')
    .description('Import data: omit source for integrations, or use "test-data" for dev fixtures')
    .option('--days <n>', 'Number of days to import', parseInt)
    .option('--yes', 'Skip confirmation prompts')
    .option('--json', 'Output as JSON')
    .action(
      async (
        source: string | undefined,
        opts: { days?: number; yes?: boolean; json?: boolean },
      ) => {
        if (source === 'test-data') {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'seed test-data: use legacy CLI for full support',
              }),
            );
          } else {
            info('For seed test-data, use the legacy CLI.');
          }
          return;
        }

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

        const days = opts.days ?? 60;

        if (!opts.json) {
          header('Seed Workspace');
          console.log('Import historical data from connected integrations.');
          console.log('');
        }

        const result = await services.integrations.pull(root, 'fathom', {
          integration: 'fathom',
          days,
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: result.errors.length === 0,
                integration: 'fathom',
                itemsProcessed: result.itemsProcessed,
                itemsCreated: result.itemsCreated,
                errors: result.errors,
              },
              null,
              2,
            ),
          );
          return;
        }

        if (result.errors.length === 0) {
          section('Seeding Complete');
          success(`${result.itemsCreated} meeting(s) imported from Fathom`);
          console.log('');
          console.log(chalk.dim('Next steps:'));
          console.log(`  • Review: ${chalk.cyan('resources/meetings/')}`);
          console.log(`  • Run: ${chalk.cyan('arete status')}`);
          console.log('');
        } else {
          warn('Seeding had errors');
          for (const err of result.errors) {
            error(err);
          }
        }
      },
    );
}
