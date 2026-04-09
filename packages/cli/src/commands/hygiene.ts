/**
 * Hygiene commands — scan and apply workspace cleanup actions
 */

import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  type QmdRefreshResult,
  type HygieneReport,
  type HygieneTier,
  type HygieneCategory,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { header, section, listItem, info, success, warn, error } from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

const TIER_LABELS: Record<HygieneTier, string> = {
  1: 'Safe auto-apply',
  2: 'Review recommended',
  3: 'Human judgment required',
};

export function registerHygieneCommand(program: Command): void {
  const hygieneCmd = program
    .command('hygiene')
    .description('Workspace hygiene — scan and clean up entropy');

  // ---------------------------------------------------------------------------
  // arete hygiene scan
  // ---------------------------------------------------------------------------

  hygieneCmd
    .command('scan')
    .description('Scan workspace for hygiene issues')
    .option('--tier <tiers...>', 'Filter by tier(s): 1, 2, 3')
    .option('--category <categories...>', 'Filter by category: meetings, memory, commitments, activity')
    .option('--area <slug>', 'Filter by area slug')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: {
        tier?: string[];
        category?: string[];
        area?: string;
        json?: boolean;
      }) => {
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

        // Parse tier values
        const tiers = opts.tier
          ? opts.tier.map((t) => Number(t) as HygieneTier)
          : undefined;
        const categories = opts.category as HygieneCategory[] | undefined;

        let report: HygieneReport;
        try {
          report = await services.hygiene.scan({
            tiers,
            categories,
            areaSlug: opts.area,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to scan workspace';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        if (opts.json) {
          console.log(JSON.stringify({ success: true, report }, null, 2));
          return;
        }

        if (report.items.length === 0) {
          info('Workspace is clean — no issues found');
          return;
        }

        header('Workspace Hygiene Scan');

        // Group items by tier and display
        for (const tier of [1, 2, 3] as HygieneTier[]) {
          const tierItems = report.items.filter((item) => item.tier === tier);
          if (tierItems.length === 0) continue;

          section(`Tier ${tier} — ${TIER_LABELS[tier]}`);
          console.log('');
          for (const item of tierItems) {
            listItem(item.description, undefined, 1);
            listItem('Action', item.suggestedAction, 2);
            listItem('Path', item.affectedPath, 2);
          }
          console.log('');
        }

        info(
          `Found ${report.summary.total} issue${report.summary.total === 1 ? '' : 's'}: ` +
            `Tier 1: ${report.summary.byTier[1]}, ` +
            `Tier 2: ${report.summary.byTier[2]}, ` +
            `Tier 3: ${report.summary.byTier[3]}`,
        );
        console.log('');
      },
    );

  // ---------------------------------------------------------------------------
  // arete hygiene apply
  // ---------------------------------------------------------------------------

  hygieneCmd
    .command('apply')
    .description('Apply workspace hygiene fixes')
    .option('--tier <tiers...>', 'Filter by tier(s): 1, 2, 3')
    .option('--yes', 'Auto-approve all items (skip interactive selection)')
    .option('--dry-run', 'Show what would be applied without making changes')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: {
        tier?: string[];
        yes?: boolean;
        dryRun?: boolean;
        skipQmd?: boolean;
        json?: boolean;
      }) => {
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

        // Parse tier values
        const tiers = opts.tier
          ? opts.tier.map((t) => Number(t) as HygieneTier)
          : undefined;

        // Run scan internally
        let report: HygieneReport;
        try {
          report = await services.hygiene.scan({ tiers });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to scan workspace';
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: msg }));
          } else {
            error(msg);
          }
          process.exit(1);
        }

        if (report.items.length === 0) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: true,
                applied: [],
                failed: [],
                message: 'Nothing to apply — workspace is clean',
                qmd: { indexed: false, skipped: true },
              }, null, 2),
            );
          } else {
            info('Nothing to apply — workspace is clean');
          }
          return;
        }

        // Determine which items to apply
        let approvedIds: string[];

        if (opts.yes || opts.json) {
          // Auto-approve all items
          approvedIds = report.items.map((item) => item.id);
        } else {
          // Interactive checkbox
          const { checkbox } = await import('@inquirer/prompts');

          // Build choices grouped by tier
          const choices: Array<{
            name: string;
            value: string;
            checked: boolean;
          }> = [];

          for (const tier of [1, 2, 3] as HygieneTier[]) {
            const tierItems = report.items.filter((item) => item.tier === tier);
            if (tierItems.length === 0) continue;

            // Add separator-like header
            choices.push({
              name: chalk.bold(`--- Tier ${tier}: ${TIER_LABELS[tier]} ---`),
              value: `__separator_${tier}`,
              checked: false,
            });

            for (const item of tierItems) {
              choices.push({
                name: `[${item.actionType}] ${item.description}`,
                value: item.id,
                checked: tier === 1, // Pre-check tier 1 items
              });
            }
          }

          console.log('');
          const selected = await checkbox({
            message: 'Select items to apply:',
            choices,
            pageSize: 12,
          });

          // Filter out separator values
          approvedIds = selected.filter(
            (id: string) => !id.startsWith('__separator_'),
          );

          if (approvedIds.length === 0) {
            info('No items selected. Aborted.');
            return;
          }
        }

        // Dry-run mode
        if (opts.dryRun) {
          const selectedItems = report.items.filter((item) =>
            approvedIds.includes(item.id),
          );

          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  dryRun: true,
                  wouldApply: selectedItems.map((item) => ({
                    id: item.id,
                    tier: item.tier,
                    category: item.category,
                    actionType: item.actionType,
                    description: item.description,
                    affectedPath: item.affectedPath,
                  })),
                  count: selectedItems.length,
                },
                null,
                2,
              ),
            );
          } else {
            header('Dry Run — Would Apply');
            for (const item of selectedItems) {
              listItem(
                `[Tier ${item.tier}] ${item.description}`,
                item.suggestedAction,
              );
            }
            console.log('');
            info(`${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} would be applied`);
          }
          return;
        }

        // Apply approved actions
        const actions = approvedIds.map((id) => ({ id }));
        let result;
        try {
          result = await services.hygiene.apply(report, actions);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to apply hygiene actions';
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
                applied: result.applied,
                failed: result.failed,
                appliedCount: result.applied.length,
                failedCount: result.failed.length,
                qmd: qmdResult ?? { indexed: false, skipped: true },
              },
              null,
              2,
            ),
          );
          return;
        }

        // Human-readable output
        header('Hygiene Applied');

        for (const id of result.applied) {
          const item = report.items.find((i) => i.id === id);
          if (item) {
            success(`${item.description}`);
          } else {
            success(`Applied: ${id}`);
          }
        }

        for (const f of result.failed) {
          const item = report.items.find((i) => i.id === f.id);
          if (item) {
            warn(`Failed: ${item.description} — ${f.error}`);
          } else {
            warn(`Failed: ${f.id} — ${f.error}`);
          }
        }

        console.log('');
        displayQmdResult(qmdResult);
        info(
          `Applied: ${result.applied.length}, Failed: ${result.failed.length}`,
        );
        console.log('');
      },
    );
}
