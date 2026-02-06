#!/usr/bin/env node

/**
 * Areté CLI
 * Product Management Workspace
 */

import { program } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Get package info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

// Import commands
import { installCommand } from '../src/commands/install.js';
import { setupCommand } from '../src/commands/setup.js';
import { updateCommand } from '../src/commands/update.js';
import { statusCommand } from '../src/commands/status.js';
import { skillCommand } from '../src/commands/skill.js';
import { integrationCommand } from '../src/commands/integration.js';
import { fathomCommand } from '../src/commands/fathom.js';
import { seedCommand } from '../src/commands/seed.js';
import { pullCommand } from '../src/commands/pull.js';

// CLI Header
const printHeader = () => {
  console.log('');
  console.log(chalk.bold('  Areté') + ' - Product Management Workspace');
  console.log('');
};

// Configure program
program
  .name('arete')
  .description('Areté - Product Management Workspace CLI')
  .version(packageJson.version, '-v, --version', 'Show version number')
  .hook('preAction', (thisCommand) => {
    // Don't print header for --json output or version/help
    const opts = thisCommand.opts();
    if (!opts.json && !['help', 'version'].includes(thisCommand.args[0])) {
      // Header is printed by individual commands if needed
    }
  });

// Workspace Lifecycle Commands
program
  .command('install [directory]')
  .description('Initialize a new Areté workspace')
  .option('--source <source>', 'Installation source: npm, symlink, or local:/path', 'npm')
  .option('--json', 'Output as JSON')
  .action(installCommand);

program
  .command('setup')
  .description('Interactive configuration: API keys, integration credentials')
  .option('--json', 'Output as JSON')
  .action(setupCommand);

program
  .command('update')
  .description('Pull latest skills/tools/integrations from upstream')
  .option('--check', 'Check for updates without applying')
  .option('--json', 'Output as JSON')
  .action(updateCommand);

program
  .command('status')
  .description('Show workspace status, versions, and configured integrations')
  .option('--json', 'Output as JSON')
  .action(statusCommand);

program
  .command('seed')
  .description('Import historical data from integrations')
  .option('--days <n>', 'Number of days to import', parseInt)
  .option('--integration <name>', 'Specific integration to seed from')
  .option('--yes', 'Skip confirmation prompts')
  .option('--json', 'Output as JSON')
  .action(seedCommand);

program
  .command('pull [integration]')
  .description('Fetch latest data from integrations')
  .option('--days <n>', 'Number of days to fetch', '7')
  .option('--json', 'Output as JSON')
  .action(pullCommand);

// Skill Management
const skillCmd = program
  .command('skill')
  .description('Manage skills');

skillCmd
  .command('list')
  .description('List available and installed skills')
  .option('--json', 'Output as JSON')
  .action((opts) => skillCommand('list', opts));

skillCmd
  .command('add <name>')
  .description('Install a skill')
  .option('--json', 'Output as JSON')
  .action((name, opts) => skillCommand('add', { name, ...opts }));

skillCmd
  .command('remove <name>')
  .description('Remove a skill')
  .option('--json', 'Output as JSON')
  .action((name, opts) => skillCommand('remove', { name, ...opts }));

skillCmd
  .command('override <name>')
  .description('Copy skill to skills-local for customization')
  .option('--json', 'Output as JSON')
  .action((name, opts) => skillCommand('override', { name, ...opts }));

// Integration Management
const integrationCmd = program
  .command('integration')
  .description('Manage integrations');

integrationCmd
  .command('list')
  .description('List available integrations and their status')
  .option('--json', 'Output as JSON')
  .action((opts) => integrationCommand('list', opts));

integrationCmd
  .command('add <name>')
  .description('Add an integration')
  .option('--json', 'Output as JSON')
  .action((name, opts) => integrationCommand('add', { name, ...opts }));

integrationCmd
  .command('configure <name>')
  .description('Configure an integration')
  .option('--json', 'Output as JSON')
  .action((name, opts) => integrationCommand('configure', { name, ...opts }));

integrationCmd
  .command('remove <name>')
  .description('Remove an integration')
  .option('--json', 'Output as JSON')
  .action((name, opts) => integrationCommand('remove', { name, ...opts }));

// Legacy Fathom commands (for backwards compatibility)
const fathomCmd = program
  .command('fathom')
  .description('Fathom integration commands (legacy)');

fathomCmd
  .command('list')
  .description('List recent Fathom recordings')
  .option('--days <n>', 'Number of days to look back', '7')
  .option('--json', 'Output as JSON')
  .action((opts) => fathomCommand('list', opts));

fathomCmd
  .command('fetch')
  .description('Fetch and save Fathom recordings')
  .option('--days <n>', 'Number of days to look back', '7')
  .option('--json', 'Output as JSON')
  .action((opts) => fathomCommand('fetch', opts));

fathomCmd
  .command('get <id>')
  .description('Get a specific recording')
  .option('--json', 'Output as JSON')
  .action((id, opts) => fathomCommand('get', { id, ...opts }));

// Parse and execute
program.parse();
