/**
 * arete update — pull latest skills/tools/integrations
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, listItem, success, error, info } from '../formatters.js';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Pull latest skills/tools/integrations from upstream')
    .option('--check', 'Check for updates without applying')
    .option('--json', 'Output as JSON')
    .action(async (opts: { check?: boolean; json?: boolean }) => {
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

      const result = await services.workspace.update(root);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              mode: opts.check ? 'check' : 'update',
              result,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (!opts.json) {
        header(opts.check ? 'Checking for Updates' : 'Updating Workspace');
        listItem('Added', result.added.length.toString());
        listItem('Updated', result.updated.length.toString());
        listItem('Preserved', result.preserved.length.toString());
        console.log('');
        success('Update complete!');
        console.log('');
      }
    });
}
