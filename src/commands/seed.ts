/**
 * Seed command - import historical data from integrations
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { success, error, warn, info, header, listItem, section } from '../core/utils.js';
import { findIntegrationScript, runIntegrationScript, getIntegrationStatus } from '../core/scripts.js';
import { SEEDABLE_INTEGRATIONS } from '../integrations/registry.js';
import { pullFathom } from '../integrations/fathom/index.js';
import type { CommandOptions, ScriptableIntegration } from '../types.js';

export interface SeedOptions extends CommandOptions {
  days?: number;
  integration?: string;
  yes?: boolean;
}

/**
 * Seed command handler
 */
export async function seedCommand(options: SeedOptions): Promise<void> {
  const { days, integration, json, yes } = options;

  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);

  if (!json) {
    header('Seed Workspace');
    console.log('Import historical data from your connected integrations.');
    console.log('');
  }

  // Get available seedable integrations
  const available: Array<ScriptableIntegration & { status: string }> = [];
  for (const [name, intConfig] of Object.entries(SEEDABLE_INTEGRATIONS)) {
    const status = getIntegrationStatus(paths, name);
    if (status === 'active') {
      available.push({ ...intConfig, status });
    }
  }

  if (available.length === 0) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: 'No active integrations support seeding',
        hint: 'Run "arete integration add fathom" to add an integration'
      }));
    } else {
      warn('No active integrations support seeding');
      info('Available seedable integrations: ' + Object.keys(SEEDABLE_INTEGRATIONS).join(', '));
      info('Run "arete integration add <name>" to configure one');
    }
    process.exit(1);
  }

  // Select integration(s)
  let selectedIntegrations: Array<ScriptableIntegration & { status: string }> = [];

  if (integration) {
    const int = SEEDABLE_INTEGRATIONS[integration];
    if (!int) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: `Unknown integration: ${integration}` }));
      } else {
        error(`Unknown integration: ${integration}`);
      }
      process.exit(1);
    }

    const status = getIntegrationStatus(paths, integration);
    if (status !== 'active') {
      if (json) {
        console.log(JSON.stringify({ success: false, error: `Integration not active: ${integration}` }));
      } else {
        error(`Integration not active: ${integration}`);
        info(`Run "arete integration add ${integration}" to configure it`);
      }
      process.exit(1);
    }

    selectedIntegrations = [{ ...int, status }];
  } else if (json || yes) {
    selectedIntegrations = available;
  } else {
    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Which integrations do you want to seed from?',
        choices: available.map(i => ({
          name: `${i.displayName} - ${i.description}`,
          value: i.name,
          checked: true
        }))
      }
    ]);

    if (selected.length === 0) {
      info('No integrations selected');
      return;
    }

    selectedIntegrations = available.filter(i => selected.includes(i.name));
  }

  // Determine days
  let seedDays = days;
  if (!seedDays && !json && !yes) {
    const { daysChoice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'daysChoice',
        message: 'How far back should we import?',
        choices: [
          { name: 'Quick (30 days) - Fast startup', value: 30 },
          { name: 'Standard (60 days) - Recommended', value: 60 },
          { name: 'Deep (90 days) - Comprehensive', value: 90 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 1
      }
    ]);

    if (daysChoice === 'custom') {
      const { customDays } = await inquirer.prompt([
        {
          type: 'number',
          name: 'customDays',
          message: 'Enter number of days:',
          default: 60,
          validate: (val: number) => val > 0 && val <= 365 ? true : 'Enter a number between 1 and 365'
        } as any
      ]);
      seedDays = customDays;
    } else {
      seedDays = daysChoice;
    }
  }

  seedDays = seedDays || 60;

  // Confirm
  if (!json && !yes) {
    console.log('');
    section('Seed Configuration');
    listItem('Integrations', selectedIntegrations.map(i => i.displayName).join(', '));
    listItem('Time range', `Last ${seedDays} days`);
    console.log('');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Start seeding?',
        default: true
      }
    ]);

    if (!confirm) {
      info('Seeding cancelled');
      return;
    }
  }

  // Run seeding for each integration
  const results: Array<{ integration: string; success: boolean; days?: number; error?: string }> = [];

  for (const int of selectedIntegrations) {
    if (!json) {
      console.log('');
      info(`Seeding from ${int.displayName}...`);
    }

    if (int.name === 'fathom') {
      try {
        const result = await pullFathom(seedDays, json ?? false);
        if (result.success) {
          results.push({ integration: int.name, success: true, days: seedDays });
          if (!json) {
            success(`${int.displayName} seeding complete!`);
          }
        } else {
          results.push({ integration: int.name, success: false, error: result.error ?? 'Unknown error' });
          if (!json) {
            error(`${int.displayName} seeding failed: ${result.error ?? 'Unknown error'}`);
          }
        }
      } catch (err) {
        results.push({ integration: int.name, success: false, error: (err as Error).message });
        if (!json) {
          error(`${int.displayName} seeding failed: ${(err as Error).message}`);
        }
      }
      continue;
    }

    const scriptPath = findIntegrationScript(int.name);
    if (!scriptPath) {
      results.push({ integration: int.name, success: false, error: 'Script not found' });
      if (!json) {
        error(`Script not found for ${int.name}`);
      }
      continue;
    }

    try {
      const args = [int.command || 'fetch', '--days', String(seedDays)];
      if (json) args.push('--json');

      await runIntegrationScript(scriptPath, args, { quiet: json });

      results.push({ integration: int.name, success: true, days: seedDays });
      if (!json) {
        success(`${int.displayName} seeding complete!`);
      }
    } catch (err) {
      results.push({ integration: int.name, success: false, error: (err as Error).message });
      if (!json) {
        error(`${int.displayName} seeding failed: ${(err as Error).message}`);
      }
    }
  }

  // Summary
  if (json) {
    console.log(JSON.stringify({
      success: results.every(r => r.success),
      results
    }, null, 2));
  } else {
    console.log('');
    section('Seeding Complete');

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (succeeded > 0) {
      success(`${succeeded} integration(s) seeded successfully`);
    }
    if (failed > 0) {
      warn(`${failed} integration(s) failed`);
    }

    console.log('');
    console.log(chalk.dim('Next steps:'));
    console.log(`  • Review imported items in ${chalk.cyan('resources/meetings/')}`);
    console.log(`  • Check pending items: ${chalk.cyan('.arete/memory/pending-review.md')}`);
    console.log(`  • Run ${chalk.cyan('arete status')} to see workspace state`);
    console.log('');
  }
}

export default seedCommand;
