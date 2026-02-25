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
  ensureQmdCollection,
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
    .option('--skip-qmd', 'Skip automatic qmd collection setup')
    .option('--json', 'Output as JSON')
    .action(
      async (
        directory: string | undefined,
        opts: { source?: string; ide?: string; skipQmd?: boolean; json?: boolean },
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
        const basePaths = getSourcePaths(packageRoot);
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

        // Auto-setup qmd collection if available
        let qmdResult;
        if (!opts.skipQmd) {
          if (!opts.json) {
            console.log(chalk.dim('  Setting up search index...'));
          }
          qmdResult = await ensureQmdCollection(targetDir);
          if (qmdResult.collectionName && qmdResult.created) {
            // Persist collection name to arete.yaml
            await services.workspace.updateManifestField(
              targetDir,
              'qmd_collection',
              qmdResult.collectionName,
            );
          }
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                path: targetDir,
                source: sourceInfo,
                results: result,
                qmd: qmdResult ?? { skipped: true, available: false, created: false, indexed: false },
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
        listItem('Tools installed', result.tools.length.toString());
        listItem('Rules installed', result.rules.length.toString());

        if (qmdResult && !qmdResult.skipped) {
          if (qmdResult.created) {
            listItem('Search index', `qmd collection "${qmdResult.collectionName}" created`);
          } else if (qmdResult.indexed) {
            listItem('Search index', `qmd collection "${qmdResult.collectionName}" updated`);
          }
          if (qmdResult.warning) {
            warn(qmdResult.warning);
          }
        } else if (qmdResult && qmdResult.skipped) {
          listItem('Search index', chalk.dim('qmd not installed, skipping'));
        } else if (!qmdResult) {
          listItem('Search index', chalk.dim('skipped (--skip-qmd)'));
        }

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
        console.log(`  2. ${chalk.cyan('arete onboard')} to set up your profile and integrations`);
        console.log(`  3. Say ${chalk.cyan('"Let\'s get started"')} in chat to continue onboarding`);
        console.log('');
      },
    );
}
