/**
 * Commitments commands — list and resolve open commitments
 */

import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  type QmdRefreshResult,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { listItem, error, info, success } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

export function registerCommitmentsCommand(program: Command): void {
  const commitmentsCmd = program
    .command('commitments')
    .description('Track and resolve open commitments');

  // ---------------------------------------------------------------------------
  // arete commitments list
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('list')
    .description('List open commitments')
    .option('--direction <direction>', 'Filter by direction: i_owe_them or they_owe_me')
    .option('--person <slugs...>', 'Filter by person slug(s)')
    .option('--area <slug>', 'Filter by area slug')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { direction?: string; person?: string[]; area?: string; json?: boolean }) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        // Validate direction if provided
        if (
          opts.direction &&
          opts.direction !== 'i_owe_them' &&
          opts.direction !== 'they_owe_me'
        ) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
              }),
            );
          } else {
            error(
              `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
            );
          }
          process.exit(1);
        }

        const direction = opts.direction as 'i_owe_them' | 'they_owe_me' | undefined;

        let commitments;
        try {
          commitments = await services.commitments.listOpen({
            direction,
            personSlugs: opts.person,
            area: opts.area,
          });
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to list commitments';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        if (opts.json) {
          const out = commitments.map((c) => ({
            id: c.id,
            idShort: c.id.slice(0, 8),
            direction: c.direction,
            personSlug: c.personSlug,
            personName: c.personName,
            text: c.text,
            date: c.date,
            resolvedAt: c.resolvedAt,
            ...(c.goalSlug ? { goalSlug: c.goalSlug } : {}),
            ...(c.area ? { area: c.area } : {}),
          }));
          console.log(
            JSON.stringify({ success: true, commitments: out, count: out.length }, null, 2),
          );
          return;
        }

        if (commitments.length === 0) {
          info('No open commitments.');
          return;
        }

        // Group by direction
        const iOweThem = commitments.filter((c) => c.direction === 'i_owe_them');
        const theyOweMe = commitments.filter((c) => c.direction === 'they_owe_me');

        // Check if any commitment has an area value (to conditionally show area column)
        const hasAreas = commitments.some((c) => c.area);

        console.log('');
        if (iOweThem.length > 0) {
          console.log(chalk.bold('I owe them'));
          for (const c of iOweThem) {
            const shortId = c.id.slice(0, 8);
            const personName = c.personName.padEnd(20).slice(0, 20);
            const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
            const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
            const date = c.date ? chalk.dim(`(${c.date})`) : '';
            console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
          }
          console.log('');
        }
        if (theyOweMe.length > 0) {
          console.log(chalk.bold('They owe me'));
          for (const c of theyOweMe) {
            const shortId = c.id.slice(0, 8);
            const personName = c.personName.padEnd(20).slice(0, 20);
            const goalPrefix = c.goalSlug ? chalk.cyan(`[${c.goalSlug}] `) : '';
            const areaTag = hasAreas ? (c.area ? chalk.magenta(`@${c.area} `) : '') : '';
            const date = c.date ? chalk.dim(`(${c.date})`) : '';
            console.log(`  ${chalk.dim(shortId)}  ${personName}  ${areaTag}${goalPrefix}${c.text}  ${date}`);
          }
          console.log('');
        }
        listItem('Total', String(commitments.length));
        console.log('');
      },
    );

  // ---------------------------------------------------------------------------
  // arete commitments create <text>
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('create <text>')
    .description('Create a commitment')
    .requiredOption('--person <slug>', 'Person slug (e.g. anthony-avina)')
    .requiredOption(
      '--direction <direction>',
      'Direction: i_owe_them or they_owe_me',
    )
    .option('--person-name <name>', 'Person display name (derived from slug if omitted)')
    .option('--goal <slug>', 'Goal slug to link')
    .option('--area <slug>', 'Area slug')
    .option('--date <date>', 'Date (YYYY-MM-DD, defaults to today)')
    .option('--source <source>', 'Source reference (e.g. meeting file)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (
        text: string,
        opts: {
          person: string;
          direction: string;
          personName?: string;
          goal?: string;
          area?: string;
          date?: string;
          source?: string;
          skipQmd?: boolean;
          json?: boolean;
        },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        // Validate direction
        if (
          opts.direction !== 'i_owe_them' &&
          opts.direction !== 'they_owe_me'
        ) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
              }),
            );
          } else {
            error(
              `Invalid direction: "${opts.direction}". Must be i_owe_them or they_owe_me`,
            );
          }
          process.exit(1);
        }

        const direction = opts.direction as 'i_owe_them' | 'they_owe_me';

        // Derive person name from slug if not provided
        const personName =
          opts.personName ??
          opts.person
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

        // Parse date
        const date = opts.date ? new Date(opts.date) : undefined;
        if (date && Number.isNaN(date.getTime())) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: `Invalid date: "${opts.date}"` }),
            );
          } else {
            error(`Invalid date: "${opts.date}"`);
          }
          process.exit(1);
        }

        let result;
        try {
          result = await services.commitments.create(
            text,
            opts.person,
            personName,
            direction,
            {
              goalSlug: opts.goal,
              area: opts.area,
              date,
              source: opts.source,
            },
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to create commitment';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        // Refresh QMD index
        let qmdResult: QmdRefreshResult | undefined;
        if (!opts.skipQmd) {
          const config = await loadConfig(services.storage, root);
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                commitment: {
                  id: result.commitment.id,
                  idShort: result.commitment.id.slice(0, 8),
                  text: result.commitment.text,
                  direction: result.commitment.direction,
                  personSlug: result.commitment.personSlug,
                  personName: result.commitment.personName,
                  date: result.commitment.date,
                  status: result.commitment.status,
                },
                ...(result.task
                  ? { task: { id: result.task.id, destination: result.task.destination } }
                  : {}),
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        success('Commitment created.');
        listItem('Text', result.commitment.text);
        listItem('Person', personName);
        listItem(
          'Direction',
          direction === 'i_owe_them' ? 'I owe them' : 'They owe me',
        );
        listItem('ID', result.commitment.id.slice(0, 8));
        if (result.task) {
          listItem('Task', `${result.task.id} → ${result.task.destination}`);
        }
        displayQmdResult(qmdResult);
        console.log('');
      },
    );

  // ---------------------------------------------------------------------------
  // arete commitments resolve <id>
  // ---------------------------------------------------------------------------

  commitmentsCmd
    .command('resolve <id>')
    .description(
      'Resolve or drop a commitment by ID (8-char prefix or full 64-char hash)',
    )
    .option(
      '--status <status>',
      'Resolution status: resolved or dropped (default: resolved)',
    )
    .option('--yes', 'Skip confirmation prompt')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (
        id: string,
        opts: {
          status?: string;
          yes?: boolean;
          skipQmd?: boolean;
          json?: boolean;
        },
      ) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        if (!root) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: 'Not in an Areté workspace' }),
            );
          } else {
            error('Not in an Areté workspace');
            info('Run "arete install" to create a workspace');
          }
          process.exit(1);
        }

        const config = await loadConfig(services.storage, root);

        // Validate status
        const status = (opts.status ?? 'resolved') as 'resolved' | 'dropped';
        if (status !== 'resolved' && status !== 'dropped') {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: `Invalid status: "${opts.status}". Must be resolved or dropped`,
              }),
            );
          } else {
            error(
              `Invalid status: "${opts.status}". Must be resolved or dropped`,
            );
          }
          process.exit(1);
        }

        // Look up the commitment to show details in confirmation prompt
        let targetCommitment:
          | Awaited<ReturnType<typeof services.commitments.listOpen>>[number]
          | undefined;
        try {
          const open = await services.commitments.listOpen();
          targetCommitment = open.find(
            (c) => c.id === id || c.id.startsWith(id),
          );
        } catch {
          // Non-critical — resolve() will produce its own error if needed
        }

        // Confirmation prompt (unless --yes or --json)
        if (!opts.yes && !opts.json) {
          const { confirm } = await import('@inquirer/prompts');
          if (targetCommitment) {
            console.log('');
            console.log(
              `  ${chalk.bold('Commitment:')} ${targetCommitment.text}`,
            );
            console.log(`  ${chalk.bold('Person:')}     ${targetCommitment.personName}`);
            console.log(
              `  ${chalk.bold('Direction:')}  ${
                targetCommitment.direction === 'i_owe_them'
                  ? 'I owe them'
                  : 'They owe me'
              }`,
            );
            console.log('');
          }
          const confirmed = await confirm({
            message: `Mark as ${status}?`,
            default: false,
          });
          if (!confirmed) {
            info('Aborted.');
            process.exit(0);
          }
        }

        // Resolve the commitment
        let resolved;
        try {
          resolved = await services.commitments.resolve(id, status);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to resolve commitment';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        // Refresh QMD index
        let qmdResult: QmdRefreshResult | undefined;
        if (!opts.skipQmd) {
          qmdResult = await refreshQmdIndex(root, config.qmd_collection);
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                resolved: {
                  id: resolved.id,
                  text: resolved.text,
                  personName: resolved.personName,
                  direction: resolved.direction,
                  resolvedAt: resolved.resolvedAt,
                  status: resolved.status,
                },
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        success(`Commitment marked as ${status}.`);
        listItem('Text', resolved.text);
        listItem('Person', resolved.personName);
        displayQmdResult(qmdResult);
        console.log('');
      },
    );
}
