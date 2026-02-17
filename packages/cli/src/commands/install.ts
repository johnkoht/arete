/**
 * arete install [directory] — initialize a new Areté workspace
 */

import {
  createServices,
  isAreteWorkspace,
  parseSourceType,
  getSourcePaths,
  getPackageRoot,
  getAdapter,
} from '@arete/core';
import { join, resolve } from 'path';
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  success,
  error,
  warn,
  info,
  header,
  listItem,
  formatPath,
} from '../formatters.js';

export function registerInstallCommand(program: Command): void {
  program
    .command('install [directory]')
    .description('Initialize a new Areté workspace')
    .option('--source <source>', 'Installation source: npm, symlink, or local:/path', 'npm')
    .option('--ide <target>', 'Target IDE: cursor or claude', 'cursor')
    .option('--json', 'Output as JSON')
    .action(
      async (
        directory: string | undefined,
        opts: { source?: string; ide?: string; json?: boolean },
      ) => {
        const targetDir = resolve(directory || '.');
        const source = opts.source ?? 'npm';
        const ide = (opts.ide ?? 'cursor') as 'cursor' | 'claude';

        if (ide !== 'cursor' && ide !== 'claude') {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'`,
              }),
            );
          } else {
            error(`Invalid IDE target: ${ide}. Must be 'cursor' or 'claude'`);
          }
          process.exit(1);
        }

        if (isAreteWorkspace(targetDir)) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Directory is already an Areté workspace',
                path: targetDir,
              }),
            );
          } else {
            warn(`Directory is already an Areté workspace: ${formatPath(targetDir)}`);
            info('Use "arete update" to pull latest changes');
          }
          process.exit(1);
        }

        let sourceInfo;
        try {
          const packageRoot = getPackageRoot();
          sourceInfo = parseSourceType(
            source,
            source === 'symlink' ? packageRoot : undefined,
          );
        } catch (err) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: (err as Error).message }),
            );
          } else {
            error((err as Error).message);
          }
          process.exit(1);
        }

        const services = await createServices(process.cwd());
        const adapter = getAdapter(ide);

        if (!opts.json) {
          header('Installing Areté Workspace');
          console.log(`  Target: ${chalk.cyan(formatPath(targetDir))}`);
          console.log(`  Source: ${chalk.cyan(source)}`);
          console.log('');
        }

        const packageRoot = getPackageRoot();
        const useRuntime = !packageRoot.includes('node_modules');
        const basePaths = getSourcePaths(packageRoot, useRuntime);
        const rulesSubdir = ide === 'cursor' ? 'cursor' : 'claude-code';
        const sourcePaths = {
          root: basePaths.root,
          skills: basePaths.skills,
          tools: basePaths.tools,
          rules: join(basePaths.rules, rulesSubdir),
          integrations: basePaths.integrations,
          templates: basePaths.templates,
          guide: basePaths.guide,
        };

        const result = await services.workspace.create(targetDir, {
          ideTarget: ide,
          source: source,
          sourcePaths,
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                path: targetDir,
                source: sourceInfo,
                results: result,
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log('');
        success('Workspace installed successfully!');
        console.log('');
        listItem('Location', formatPath(targetDir));
        listItem('Source', source);
        listItem('Skills installed', result.skills.length.toString());
        listItem('Rules installed', result.rules.length.toString());

        if (result.errors.length > 0) {
          console.log('');
          warn(`${result.errors.length} errors occurred:`);
          for (const err of result.errors) {
            console.log(`  - ${err.path}: ${err.error}`);
          }
        }

        console.log('');
        console.log(chalk.dim('Next steps:'));
        console.log(`  1. ${chalk.cyan('cd ' + formatPath(targetDir))}`);
        console.log(`  2. ${chalk.cyan('arete setup')} to configure integrations`);
        console.log(`  3. ${chalk.cyan('arete status')} to verify installation`);
        console.log('');
      },
    );
}
