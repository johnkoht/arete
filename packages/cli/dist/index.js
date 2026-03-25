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
import { registerUpdateCommand } from './commands/update.js';
import { registerStatusCommand } from './commands/status.js';
import { registerRouteCommand } from './commands/route.js';
import { registerContextCommand, registerMemoryCommand, registerResolveCommand, registerBriefCommand, } from './commands/intelligence.js';
import { registerPeopleCommands } from './commands/people.js';
import { registerSkillCommands } from './commands/skill.js';
import { registerToolCommands } from './commands/tool.js';
import { registerIntegrationCommands } from './commands/integration.js';
import { registerPullCommand } from './commands/pull.js';
import { registerMeetingCommands } from './commands/meeting.js';
import { registerTemplateCommands } from './commands/template.js';
import { registerSeedCommand } from './commands/seed.js';
import { registerOnboardCommand } from './commands/onboard.js';
import { registerIndexSearchCommand } from './commands/index-search.js';
import { registerAvailabilityCommands } from './commands/availability.js';
import { registerCalendarCommands } from './commands/calendar.js';
import { registerCommitmentsCommand } from './commands/commitments.js';
import { registerViewCommand } from './commands/view.js';
import { registerDailyCommand } from './commands/daily.js';
import { registerMomentumCommand } from './commands/momentum.js';
import { registerCredentialsCommand } from './commands/credentials.js';
import { registerConfigCommand } from './commands/config.js';
import { registerSearchCommand } from './commands/search.js';
import { registerCreateCommands } from './commands/create.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
program
    .name('arete')
    .description('Areté - Product Management Workspace CLI')
    .version(packageJson.version, '-v, --version', 'Show version number')
    .addHelpText('after', `
${chalk.bold('Setup & Workspace')}
  install [directory]              Initialize workspace
  onboard                          Quick identity setup (name, email, company)
  update                           Update skills, tools, and integrations
  index                            Re-index the search collection
  create area <slug>               Create a new area with file and context directory
  status                           Check workspace health

${chalk.bold('Intelligence')}
  search "query"                   Search across workspace (semantic)
  search "query" --scope <scope>   Limit to scope (memory|meetings|context|projects|people)
  search "query" --timeline        Show temporal view with themes
  search "query" --answer          AI synthesis of results
  daily                            Morning intelligence brief
  momentum [--person <slug>]       Commitment and relationship momentum
  context --for "query"            ${chalk.dim('[DEPRECATED]')} Use: search "query"
  context --inventory              Show freshness dashboard & coverage gaps
  memory search "query"            ${chalk.dim('[DEPRECATED]')} Use: search --scope memory
  memory timeline "query"          ${chalk.dim('[DEPRECATED]')} Use: search --timeline
  resolve "reference"              Resolve person, meeting, project
  brief --for "query" [--skill]    Assemble briefing (context + memory + entities + relationships + temporal)
  route "query"                    Route to skill + model suggestion

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
  people intelligence digest       Batch people classification suggestions
  people memory refresh            Refresh person memory highlights

${chalk.bold('Integrations')}
  integration list                 List integrations
  integration configure <name>     Configure integration
  pull calendar [--today]          Pull calendar events
  pull fathom [--days N]           Pull Fathom recordings
  seed [source]                    Import historical data

${chalk.bold('Commitments')}
  commitments list [--direction]   List open commitments
  commitments resolve <id>         Resolve or drop a commitment

${chalk.bold('Availability & Calendar')}
  availability find --with <name>  Find mutual availability with a colleague
  calendar create --title <title>  Create a calendar event

${chalk.bold('Meetings & Templates')}
  view [--port <port>]             Open meeting triage UI in browser (arete view)
  meeting add --file <path>        Add meeting from JSON
  template list meeting-agendas    List templates
  template view meeting-agenda --type <name>  View template

${chalk.bold('AI Configuration')}
  credentials set <provider>       Set API key for a provider
  credentials show                 Show configured providers (keys masked)
  credentials test                 Test provider connections
  config show ai                   Show AI tier/task configuration
  config set <path> <value>        Set AI config (ai.tiers.<tier>, ai.tasks.<task>)
`);
// Register commands
registerInstallCommand(program);
registerOnboardCommand(program);
registerUpdateCommand(program);
registerIndexSearchCommand(program);
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
registerAvailabilityCommands(program);
registerCalendarCommands(program);
registerCommitmentsCommand(program);
registerViewCommand(program);
registerDailyCommand(program);
registerMomentumCommand(program);
registerCredentialsCommand(program);
registerConfigCommand(program);
registerSearchCommand(program);
registerCreateCommands(program);
program.parse();
//# sourceMappingURL=index.js.map