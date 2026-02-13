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
// In dev (tsx), __dirname is src/. In dist, it's dist/.
// Either way, package.json is one level up.
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

// Import commands
import { installCommand } from './commands/install.js';
import { setupCommand } from './commands/setup.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';
import { skillCommand } from './commands/skill.js';
import { routeCommand } from './commands/route.js';
import { listTools, showTool } from './commands/tool.js';
import { integrationCommand } from './commands/integration.js';
import { fathomCommand } from './integrations/fathom/index.js';
import { seedCommand } from './commands/seed.js';
import { seedTestDataCommand } from './commands/seed-test-data.js';
import { pullCommand } from './commands/pull.js';
import { pullCalendar } from './commands/pull-calendar.js';
import { meetingAddCommand } from './commands/meeting.js';
import {
  peopleListCommand,
  peopleShowCommand,
  peopleIndexCommand
} from './commands/people.js';
import {
  contextCommand,
  memorySearchCommand,
  resolveCommand,
  briefCommand
} from './commands/intelligence.js';
import { templateListCommand, templateViewCommand } from './commands/template.js';

// Configure program
program
  .name('arete')
  .description('Areté - Product Management Workspace CLI')
  .version(packageJson.version, '-v, --version', 'Show version number')
  .addHelpText('after', `
${chalk.bold('Setup & Workspace')}
  install [directory]              Initialize workspace (--ide cursor|claude)
  setup                            Configure API keys and credentials
  update                           Update skills, tools, and integrations
  status                           Check workspace health and versions

${chalk.bold('Intelligence Services')}
  context --for "query"            Get relevant workspace files for task
  memory search "query"            Search decisions, learnings, observations
  resolve "reference"              Resolve person, meeting, or project
  brief --for "query" [--skill]    Assemble briefing before skill execution
  route "query"                    Route to skill with model suggestion

${chalk.bold('Skills & Tools')}
  skill list                       List available skills
  skill route "query"              Route to best-matching skill
  skill install <source>           Install from skills.sh (owner/repo) or path
  skill set-default <skill> --for <role>  Set preferred skill for role
  skill defaults                   Show role assignments
  tool list                        List available tools
  tool show <name>                 Show tool details and lifecycle

${chalk.bold('Templates')}
  template list meeting-agendas    List meeting agenda templates
  template view meeting-agenda --type <name>  View template structure

${chalk.bold('People')}
  people list [--category]         List people (internal, customers, users)
  people show <slug|email>         Show person details
  people index                     Regenerate people/index.md

${chalk.bold('Meetings')}
  meeting add --file <path>        Add meeting from JSON

${chalk.bold('Integrations')}
  integration configure <name>     Configure integration
  pull calendar [--today|--days N] Pull calendar events
  pull fathom [--days N]           Pull Fathom recordings
  seed [source]                    Import historical data

${chalk.bold('Examples')}
  ${chalk.dim('# Install new workspace')}
  arete install ~/my-pm-workspace

  ${chalk.dim('# Find right skill for task')}
  arete route "create meeting agenda"
  arete skill route "help me prep for my meeting"

  ${chalk.dim('# Search for past decisions')}
  arete memory search "pricing strategy"

  ${chalk.dim('# Get context for discovery work')}
  arete context --for "user onboarding improvements"

  ${chalk.dim('# List meeting agenda templates')}
  arete template list meeting-agendas

  ${chalk.dim('# Pull today\'s calendar')}
  arete pull calendar --today

${chalk.dim('For complete documentation, see GUIDE.md in your workspace after install.')}
`)
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
  .option('--ide <target>', 'Target IDE: cursor or claude', 'cursor')
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
  .command('seed [source]')
  .description('Import data: omit source for integrations, or use "test-data" for dev fixtures')
  .option('--days <n>', 'Number of days to import', parseInt)
  .option('--integration <name>', 'Specific integration to seed from')
  .option('--yes', 'Skip confirmation prompts')
  .option('--force', 'Overwrite existing files (test-data only)')
  .option('--json', 'Output as JSON')
  .action(async (source: string | undefined, opts: Record<string, unknown>) => {
    if (source === 'test-data') {
      return seedTestDataCommand(opts);
    }
    return seedCommand(opts);
  });

program
  .command('pull [integration]')
  .description('Fetch latest data from integrations or calendar')
  .option('--days <n>', 'Number of days to fetch', '7')
  .option('--id <id>', 'Fetch a single Fathom recording by ID (Fathom only)')
  .option('--today', 'Fetch only today\'s events (calendar only)')
  .option('--json', 'Output as JSON')
  .action((integration, opts) => {
    if (integration === 'calendar') {
      return pullCalendar({ today: opts.today, json: opts.json });
    }
    return pullCommand(integration, opts);
  });

// Skill Management
const skillCmd = program
  .command('skill')
  .description('Manage skills');

skillCmd
  .command('list')
  .description('List available and installed skills')
  .option('--json', 'Output as JSON')
  .option('--verbose', 'Show primitives, work_type, category')
  .action((opts) => skillCommand('list', opts));

skillCmd
  .command('add <source>')
  .description('Install a skill (alias for install)')
  .option('--skill <name>', 'For multi-skill repos: specify which skill to install')
  .option('--json', 'Output as JSON')
  .option('--yes', 'Skip prompts (e.g. use for role)')
  .action((source, opts) => skillCommand('install', { name: source, skill: opts.skill, ...opts }));

skillCmd
  .command('remove <name>')
  .description('Remove a skill')
  .option('--json', 'Output as JSON')
  .action((name, opts) => skillCommand('remove', { name, ...opts }));

skillCmd
  .command('install <source>')
  .description('Install a skill from skills.sh (owner/repo) or local path')
  .option('--skill <name>', 'For multi-skill repos: specify which skill to install')
  .option('--json', 'Output as JSON')
  .option('--yes', 'Skip prompts (e.g. use for role)')
  .action((source, opts) => skillCommand('install', { name: source, skill: opts.skill, ...opts }));

skillCmd
  .command('defaults')
  .description('Show which roles have custom skill assignments')
  .option('--json', 'Output as JSON')
  .action((opts) => skillCommand('defaults', opts));

skillCmd
  .command('set-default <skill-name>')
  .description('Use this skill for a role (e.g. create-prd) when routing')
  .requiredOption('--for <role>', 'Role to assign (e.g. create-prd, discovery)')
  .option('--json', 'Output as JSON')
  .action((skillName, opts) => skillCommand('set-default', { name: skillName, role: opts.for, ...opts }));

skillCmd
  .command('unset-default <role>')
  .description('Restore Areté default for a role')
  .option('--json', 'Output as JSON')
  .action((role, opts) => skillCommand('unset-default', { name: role, ...opts }));

skillCmd
  .command('route <query>')
  .description('Route a user message to the best-matching skill (for agents or scripting)')
  .option('--json', 'Output as JSON')
  .action((query, opts) => skillCommand('route', { query, ...opts }));

// Top-level route: skill + model tier suggestion
program
  .command('route <query>')
  .description('Route query to skill and suggest model tier (skill + model in one call)')
  .option('--json', 'Output as JSON')
  .action((query, opts) => routeCommand(query, opts));

// Tool Management
const toolCmd = program
  .command('tool')
  .description('Manage tools');

toolCmd
  .command('list')
  .description('List available tools')
  .option('--json', 'Output as JSON')
  .action((opts) => listTools(opts));

toolCmd
  .command('show <name>')
  .description('Show details for a specific tool')
  .option('--json', 'Output as JSON')
  .action((name, opts) => showTool(name, opts));

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
  .option('--calendars <list>', 'Calendar names to include, comma-separated (calendar only; for non-interactive use e.g. Claude Code)')
  .option('--all', 'Include all calendars (calendar only; for non-interactive use)')
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

// Meeting commands (manual capture, paste-into-chat flow)
const meetingCmd = program
  .command('meeting')
  .description('Add meetings from manual input');

meetingCmd
  .command('add')
  .description('Add a meeting from JSON file or stdin')
  .option('--file <path>', 'Path to JSON file with meeting data')
  .option('--stdin', 'Read JSON from stdin')
  .option('--json', 'Output as JSON')
  .action((opts) => meetingAddCommand(opts));

// Template commands (meeting agendas, etc.)
const templateCmd = program
  .command('template')
  .description('List and view templates');

templateCmd
  .command('list <kind>')
  .description('List templates (e.g. meeting-agendas)')
  .option('--json', 'Output as JSON')
  .action((kind, opts) => templateListCommand(kind, opts));

templateCmd
  .command('view <kind>')
  .description('View a template by type (e.g. meeting-agenda --type leadership)')
  .requiredOption('--type <name>', 'Template type (e.g. leadership, customer)')
  .option('--json', 'Output as JSON')
  .action((kind, opts) => templateViewCommand(kind, opts));

// People management
const peopleCmd = program
  .command('people')
  .description('List and show people (internal, customers, users)');

peopleCmd
  .command('list')
  .description('List people in the workspace')
  .option('--category <name>', 'Filter: internal, customers, or users')
  .option('--json', 'Output as JSON')
  .action((opts) => peopleListCommand(opts));

peopleCmd
  .command('show <slug-or-email>')
  .description('Show a person by slug or email')
  .option('--category <name>', 'Category when looking up by slug')
  .option('--json', 'Output as JSON')
  .action((slugOrEmail, opts) => peopleShowCommand(slugOrEmail, opts));

peopleCmd
  .command('index')
  .description('Regenerate people/index.md from person files')
  .option('--json', 'Output as JSON')
  .action((opts) => peopleIndexCommand(opts));

// Intelligence Services
program
  .command('context')
  .description('Assemble relevant workspace context for a task')
  .requiredOption('--for <query>', 'Task description to get context for')
  .option('--primitives <list>', 'Comma-separated primitives: Problem,User,Solution,Market,Risk')
  .option('--json', 'Output as JSON')
  .action((opts) => contextCommand(opts));

const memoryCmd = program
  .command('memory')
  .description('Search workspace memory');

memoryCmd
  .command('search <query>')
  .description('Search decisions, learnings, and observations')
  .option('--types <list>', 'Comma-separated types: decisions,learnings,observations')
  .option('--limit <n>', 'Max results to return')
  .option('--json', 'Output as JSON')
  .action((query, opts) => memorySearchCommand(query, opts));

program
  .command('resolve <reference>')
  .description('Resolve an ambiguous reference to a workspace entity')
  .option('--type <type>', 'Entity type: person, meeting, project, any', 'any')
  .option('--all', 'Return all matches (not just the best)')
  .option('--json', 'Output as JSON')
  .action((reference, opts) => resolveCommand(reference, opts));

program
  .command('brief')
  .description('Assemble a primitive briefing before running a skill')
  .requiredOption('--for <query>', 'Task description')
  .option('--skill <name>', 'Skill name for the briefing')
  .option('--primitives <list>', 'Comma-separated primitives')
  .option('--json', 'Output as JSON')
  .action((opts) => briefCommand(opts));

// Parse and execute
program.parse();
