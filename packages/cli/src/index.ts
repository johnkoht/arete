#!/usr/bin/env node

/**
 * @arete/cli — thin CLI over @arete/core services
 * Product Management Workspace
 */

import { program } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { registerInstallCommand } from './commands/install.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerStatusCommand } from './commands/status.js';
import { registerRouteCommand } from './commands/route.js';
import {
  registerContextCommand,
  registerMemoryCommand,
  registerResolveCommand,
  registerBriefCommand,
} from './commands/intelligence.js';
import { registerPeopleCommands } from './commands/people.js';
import { registerSkillCommands } from './commands/skill.js';
import { registerToolCommands } from './commands/tool.js';
import { registerIntegrationCommands } from './commands/integration.js';
import { registerPullCommand } from './commands/pull.js';
import { registerMeetingCommands } from './commands/meeting.js';
import { registerTemplateCommands } from './commands/template.js';
import { registerSeedCommand } from './commands/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

program
  .name('arete')
  .description('Areté - Product Management Workspace CLI')
  .version(packageJson.version, '-v, --version', 'Show version number')
  .addHelpText(
    'after',
    `
${chalk.bold('Setup & Workspace')}
  install [directory]              Initialize workspace
  setup                            Configure API keys and credentials
  update                           Update skills, tools, and integrations
  status                           Check workspace health

${chalk.bold('Intelligence')}
  context --for "query"            Get relevant workspace files
  context --inventory              Show freshness dashboard & coverage gaps
  memory search "query"           Search decisions, learnings
  memory timeline "query"         Show temporal view for topic
  resolve "reference"             Resolve person, meeting, project
  brief --for "query" [--skill]   Assemble briefing (context + memory + entities + relationships + temporal)
  route "query"                   Route to skill + model suggestion

${chalk.bold('Skills & Tools')}
  skill list                       List skills
  skill install <source>          Install skill
  skill route "query"              Route to skill
  tool list                        List tools
  tool show <name>                 Show tool details

${chalk.bold('People')}
  people list [--category]         List people
  people show <slug|email>         Show person
  people index                     Regenerate index
  people memory refresh            Refresh person memory highlights

${chalk.bold('Integrations')}
  integration list                 List integrations
  integration configure <name>     Configure integration
  pull calendar [--today]          Pull calendar events
  pull fathom [--days N]           Pull Fathom recordings
  seed [source]                    Import historical data

${chalk.bold('Meetings & Templates')}
  meeting add --file <path>        Add meeting from JSON
  template list meeting-agendas    List templates
  template view meeting-agenda --type <name>  View template
`,
  );

// Register commands
registerInstallCommand(program);
registerSetupCommand(program);
registerUpdateCommand(program);
registerStatusCommand(program);
registerRouteCommand(program);
registerContextCommand(program);
registerMemoryCommand(program);
registerResolveCommand(program);
registerBriefCommand(program);
registerPeopleCommands(program);
registerSkillCommands(program);
registerToolCommands(program);
registerIntegrationCommands(program);
registerPullCommand(program);
registerMeetingCommands(program);
registerTemplateCommands(program);
registerSeedCommand(program);

program.parse();
