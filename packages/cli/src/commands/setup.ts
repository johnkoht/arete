/**
 * arete setup — interactive configuration (delegates to core where possible)
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, success, error, info } from '../formatters.js';

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Interactive configuration: API keys, integration credentials')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
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

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              workspace: root,
              message: 'Use interactive mode (without --json) for full setup',
            },
            null,
            2,
          ),
        );
        return;
      }

      header('Areté Setup');
      console.log('Configure integrations and credentials for your workspace.');
      console.log('');
      info('Use the commands below to configure integrations and credentials.');
      console.log('');
      console.log(chalk.dim('Quick config:'));
      console.log(`  • ${chalk.cyan('arete integration configure fathom')} - Configure Fathom integration`);
      console.log(`  • ${chalk.cyan('arete integration configure calendar')} - Configure calendar`);
      console.log('');
    });
}
