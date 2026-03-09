/**
 * arete config — View and modify AI configuration
 *
 * Commands:
 *   arete config show ai                      - Display full AI config
 *   arete config set ai.tiers.<tier> <model>  - Set tier model
 *   arete config set ai.tasks.<task> <tier>   - Set task-to-tier mapping
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createServices, getConfiguredProviders, loadConfig } from '@arete/core';
import type { AIConfig, AITask, AITier, AreteConfig } from '@arete/core';
import { header, success, error, info, warn, listItem } from '../formatters.js';

/** Valid tier names */
const VALID_TIERS: AITier[] = ['fast', 'standard', 'frontier'];

/** Valid task names */
const VALID_TASKS: AITask[] = [
  'summary',
  'extraction',
  'decision_extraction',
  'learning_extraction',
  'significance_analysis',
  'reconciliation',
];

/**
 * Check if a model ID is known to pi-ai.
 * Dynamically imports pi-ai to avoid top-level import.
 */
async function isKnownModel(modelId: string): Promise<boolean> {
  try {
    const { getProviders, getModels } = await import('@mariozechner/pi-ai');
    for (const provider of getProviders()) {
      const models = getModels(provider);
      if (models.some((m) => m.id === modelId)) {
        return true;
      }
    }
    return false;
  } catch {
    // If pi-ai import fails, skip validation
    return true;
  }
}

/**
 * Update the AI section of arete.yaml.
 * Uses direct file manipulation to preserve structure.
 */
async function updateAIConfig(
  workspaceRoot: string,
  storage: { exists(p: string): Promise<boolean>; read(p: string): Promise<string | null>; write(p: string, c: string): Promise<void> },
  updater: (ai: AIConfig) => AIConfig,
): Promise<void> {
  const manifestPath = join(workspaceRoot, 'arete.yaml');
  const exists = await storage.exists(manifestPath);
  if (!exists) {
    throw new Error('No arete.yaml found in workspace');
  }

  const content = await storage.read(manifestPath);
  if (!content) {
    throw new Error('Could not read arete.yaml');
  }

  const parsed = parseYaml(content) as Record<string, unknown>;
  const currentAi = (parsed.ai ?? {}) as AIConfig;
  const updatedAi = updater(currentAi);
  parsed.ai = updatedAi;

  await storage.write(manifestPath, stringifyYaml(parsed));
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command('config')
    .description('View and modify configuration');

  // --- config show ai ---
  configCmd
    .command('show <section>')
    .description('Show configuration section')
    .option('--json', 'Output as JSON')
    .action(async (section: string, opts: { json?: boolean }) => {
      if (section !== 'ai') {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Unknown section: ${section}. Supported: ai` }));
        } else {
          error(`Unknown section: ${section}`);
          info('Supported sections: ai');
        }
        process.exit(1);
      }

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

      const config = await loadConfig(services.storage, root);
      const ai = config.ai ?? {};
      const tiers = ai.tiers ?? {};
      const tasks = ai.tasks ?? {};
      const providers = getConfiguredProviders();

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          ai: {
            tiers,
            tasks,
            providers: providers.map((p) => ({ provider: p.provider, source: p.source })),
          },
        }));
        return;
      }

      header('AI Configuration');

      // Tiers section
      console.log(chalk.bold('Tiers:'));
      const tierWidth = 12;
      for (const tier of VALID_TIERS) {
        const model = tiers[tier];
        const modelDisplay = model ?? chalk.dim('(default)');
        console.log(`  ${tier.padEnd(tierWidth)}${modelDisplay}`);
      }
      console.log('');

      // Tasks section
      console.log(chalk.bold('Tasks:'));
      const taskWidth = 24;
      for (const task of VALID_TASKS) {
        const tier = tasks[task] ?? chalk.dim('(default)');
        console.log(`  ${task.padEnd(taskWidth)}${tier}`);
      }
      console.log('');

      // Providers section
      console.log(chalk.bold('Configured Providers:'));
      if (providers.length === 0) {
        console.log(chalk.dim('  (none)'));
        info('Run: arete credentials set <provider>');
      } else {
        for (const p of providers) {
          const sourceLabel = p.source === 'env' ? 'env var' : 'file';
          console.log(`  ${chalk.green('●')} ${p.provider} ${chalk.dim(`(${sourceLabel})`)}`);
        }
      }
      console.log('');
    });

  // --- config set <path> <value> ---
  configCmd
    .command('set <path> <value>')
    .description('Set a configuration value')
    .option('--json', 'Output as JSON')
    .action(async (path: string, value: string, opts: { json?: boolean }) => {
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

      // Parse path: ai.tiers.<tier> or ai.tasks.<task>
      const parts = path.split('.');
      if (parts.length !== 3 || parts[0] !== 'ai') {
        if (opts.json) {
          console.log(JSON.stringify({
            success: false,
            error: `Invalid path: ${path}`,
            hint: 'Use ai.tiers.<tier> or ai.tasks.<task>',
          }));
        } else {
          error(`Invalid path: ${path}`);
          info('Use ai.tiers.<tier> or ai.tasks.<task>');
        }
        process.exit(1);
      }

      const category = parts[1];
      const key = parts[2];

      if (category === 'tiers') {
        // Validate tier name
        if (!VALID_TIERS.includes(key as AITier)) {
          if (opts.json) {
            console.log(JSON.stringify({
              success: false,
              error: `Invalid tier: ${key}`,
              validTiers: VALID_TIERS,
            }));
          } else {
            error(`Invalid tier: ${key}`);
            info(`Valid tiers: ${VALID_TIERS.join(', ')}`);
          }
          process.exit(1);
        }

        // Check if model is known (warning only)
        const isKnown = await isKnownModel(value);
        let warning: string | undefined;
        if (!isKnown) {
          warning = `Model '${value}' not found in pi-ai model list. Proceeding anyway.`;
          if (!opts.json) {
            warn(warning);
          }
        }

        // Update config
        await updateAIConfig(root, services.storage, (ai) => ({
          ...ai,
          tiers: {
            ...(ai.tiers ?? {}),
            [key]: value,
          },
        }));

        if (opts.json) {
          const result: Record<string, unknown> = {
            success: true,
            path,
            value,
          };
          if (warning) result.warning = warning;
          console.log(JSON.stringify(result));
        } else {
          success(`Set ${path} = ${value}`);
        }
        return;
      }

      if (category === 'tasks') {
        // Validate task name
        if (!VALID_TASKS.includes(key as AITask)) {
          if (opts.json) {
            console.log(JSON.stringify({
              success: false,
              error: `Invalid task: ${key}`,
              validTasks: VALID_TASKS,
            }));
          } else {
            error(`Invalid task: ${key}`);
            info(`Valid tasks: ${VALID_TASKS.join(', ')}`);
          }
          process.exit(1);
        }

        // Validate tier value
        if (!VALID_TIERS.includes(value as AITier)) {
          if (opts.json) {
            console.log(JSON.stringify({
              success: false,
              error: `Invalid tier value: ${value}`,
              validTiers: VALID_TIERS,
            }));
          } else {
            error(`Invalid tier value: ${value}`);
            info(`Valid tiers: ${VALID_TIERS.join(', ')}`);
          }
          process.exit(1);
        }

        // Update config
        await updateAIConfig(root, services.storage, (ai) => ({
          ...ai,
          tasks: {
            ...(ai.tasks ?? {}),
            [key]: value as AITier,
          },
        }));

        if (opts.json) {
          console.log(JSON.stringify({
            success: true,
            path,
            value,
          }));
        } else {
          success(`Set ${path} = ${value}`);
        }
        return;
      }

      // Unknown category
      if (opts.json) {
        console.log(JSON.stringify({
          success: false,
          error: `Invalid path category: ${category}`,
          hint: 'Use ai.tiers.<tier> or ai.tasks.<task>',
        }));
      } else {
        error(`Invalid path category: ${category}`);
        info('Use ai.tiers.<tier> or ai.tasks.<task>');
      }
      process.exit(1);
    });
}
