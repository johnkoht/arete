/**
 * Integration management commands
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { getWorkspaceConfigPath } from '../core/config.js';
import { success, error, warn, info, header, listItem } from '../core/utils.js';
import { INTEGRATIONS } from '../integrations/registry.js';
import type { CommandOptions } from '../types.js';

export interface IntegrationOptions extends CommandOptions {
  name?: string;
}

/**
 * Get integration config from workspace
 */
function getIntegrationConfig(configPath: string): Record<string, unknown> | null {
  if (!existsSync(configPath)) return null;
  try {
    return parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * List integrations
 */
async function listIntegrations(options: CommandOptions): Promise<void> {
  const { json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  const paths = workspaceRoot ? getWorkspacePaths(workspaceRoot) : null;
  
  // Get configured integrations
  const configured: Record<string, string> = {};
  if (paths && existsSync(join(paths.integrations, 'configs'))) {
    const configFiles = readdirSync(join(paths.integrations, 'configs'))
      .filter(f => f.endsWith('.yaml'));
    
    for (const file of configFiles) {
      const name = basename(file, '.yaml');
      const config = getIntegrationConfig(join(paths.integrations, 'configs', file));
      if (config) {
        configured[name] = (config.status as string) || 'inactive';
      }
    }
  }
  
  // Build integration list
  const integrations = Object.values(INTEGRATIONS).map(int => ({
    ...int,
    configured: configured[int.name] || null,
    active: configured[int.name] === 'active'
  }));
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      workspace: workspaceRoot,
      integrations
    }, null, 2));
    return;
  }
  
  header('Available Integrations');
  
  // Group by tool
  const byTool: Record<string, typeof integrations> = {};
  for (const int of integrations) {
    for (const tool of int.implements) {
      byTool[tool] = byTool[tool] || [];
      byTool[tool].push(int);
    }
  }
  
  for (const [tool, ints] of Object.entries(byTool)) {
    console.log(chalk.bold(`  ${tool}`));
    for (const int of ints) {
      let status = '';
      if (int.active) {
        status = chalk.green(' [active]');
      } else if (int.configured) {
        status = chalk.yellow(` [${int.configured}]`);
      } else if (int.status === 'planned') {
        status = chalk.dim(' [planned]');
      }
      
      console.log(`    ${chalk.dim('•')} ${int.displayName}${status}`);
      console.log(`      ${chalk.dim(int.description)}`);
    }
    console.log('');
  }
  
  if (!workspaceRoot) {
    console.log(chalk.dim('  Not in a workspace. Run "arete install" first.'));
    console.log('');
  }
}

/**
 * Add an integration
 */
async function addIntegration(options: IntegrationOptions): Promise<void> {
  const { name, json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  
  const integration = INTEGRATIONS[name!];
  if (!integration) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Unknown integration: ${name}` }));
    } else {
      error(`Unknown integration: ${name}`);
      info('Run "arete integration list" to see available integrations');
    }
    process.exit(1);
  }
  
  if (integration.status === 'planned') {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Integration not yet available: ${name}` }));
    } else {
      warn(`${integration.displayName} is planned but not yet available`);
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  const configDir = join(paths.integrations, 'configs');
  const configPath = join(configDir, `${name}.yaml`);
  
  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  
  // Check if already configured
  if (existsSync(configPath)) {
    const existing = getIntegrationConfig(configPath);
    if (existing?.status === 'active') {
      if (json) {
        console.log(JSON.stringify({ success: true, message: 'Integration already active', name }));
      } else {
        info(`${integration.displayName} is already configured and active`);
        info('Use "arete integration configure" to update settings');
      }
      return;
    }
  }
  
  if (!json) {
    console.log('');
    console.log(chalk.bold(`Adding ${integration.displayName}...`));
    console.log(chalk.dim(integration.description));
    console.log('');
  }
  
  // Handle authentication
  const credentials: Record<string, string> = {};
  if (integration.auth.type === 'api_key' && !json) {
    if (integration.auth.instructions) {
      console.log(chalk.dim(integration.auth.instructions));
      console.log('');
    }
    
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter ${integration.displayName} API key:`,
        mask: '*'
      }
    ]);
    
    if (!apiKey) {
      warn('No API key provided. Integration added but inactive.');
    } else {
      credentials[integration.auth.configKey || 'api_key'] = apiKey;
      
      // Save to credentials file
      const credPath = join(paths.credentials, 'credentials.yaml');
      let creds: Record<string, unknown> = {};
      if (existsSync(credPath)) {
        try {
          creds = (parseYaml(readFileSync(credPath, 'utf8')) as Record<string, unknown>) || {};
        } catch { /* empty */ }
      }
      creds[name!] = credentials;
      writeFileSync(credPath, stringifyYaml(creds), 'utf8');
    }
  }
  
  // Create/update integration config
  const config = {
    name: integration.name,
    display_name: integration.displayName,
    implements: integration.implements,
    status: credentials[integration.auth?.configKey || ''] ? 'active' : 'inactive',
    added: new Date().toISOString(),
    auth: {
      type: integration.auth.type,
      env_var: integration.auth.envVar
    }
  };
  
  writeFileSync(configPath, stringifyYaml(config), 'utf8');
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      integration: name,
      status: config.status
    }, null, 2));
  } else {
    console.log('');
    success(`${integration.displayName} added!`);
    listItem('Status', config.status);
    listItem('Implements', integration.implements.join(', '));
    console.log('');
    
    if (config.status === 'active' && name === 'fathom') {
      console.log(chalk.dim('Try it out:'));
      console.log(`  ${chalk.cyan('arete fathom list')} - List recent recordings`);
      console.log('');
    }
  }
}

/**
 * Check if icalBuddy is installed (binary name; Homebrew formula is ical-buddy)
 */
function isIcalBuddyInstalled(): boolean {
  try {
    execSync('which icalBuddy', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of available calendars from icalBuddy
 */
function listCalendars(): string[] {
  try {
    const output = execSync('icalBuddy calendars', { encoding: 'utf8' });
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (err) {
    throw new Error(`Failed to list calendars: ${(err as Error).message}`);
  }
}

/**
 * Configure calendar integration (macOS)
 */
async function configureCalendar(options: CommandOptions): Promise<void> {
  const { json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  
  // Check if icalBuddy is installed (binary; install via brew install ical-buddy)
  if (!isIcalBuddyInstalled()) {
    if (json) {
      console.log(JSON.stringify({ 
        success: false, 
        error: 'icalBuddy not found. Install with: brew install ical-buddy' 
      }));
    } else {
      error('icalBuddy not found');
      console.log('');
      console.log('Install icalBuddy with:');
      console.log(`  ${chalk.cyan('brew install ical-buddy')}`);
      console.log('');
    }
    process.exit(1);
  }
  
  // List available calendars
  let calendars: string[];
  try {
    calendars = listCalendars();
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: (err as Error).message }));
    } else {
      error((err as Error).message);
    }
    process.exit(1);
  }
  
  if (calendars.length === 0) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'No calendars found' }));
    } else {
      warn('No calendars found in macOS Calendar');
    }
    process.exit(1);
  }
  
  if (!json) {
    console.log('');
    console.log(chalk.bold('Available calendars:'));
    calendars.forEach((cal, i) => console.log(`  ${i + 1}. ${cal}`));
    console.log('');
  }
  
  // Prompt user to select calendars
  let selectedCalendars: string[];
  if (json) {
    // In JSON mode, default to all calendars
    selectedCalendars = calendars;
  } else {
    const { selection } = await inquirer.prompt([
      {
        type: 'input',
        name: 'selection',
        message: 'Select calendars (comma-separated numbers, or "all"):',
        default: 'all'
      }
    ]);
    
    if (selection.toLowerCase() === 'all') {
      selectedCalendars = calendars;
    } else {
      const indices = selection
        .split(',')
        .map((s: string) => parseInt(s.trim(), 10) - 1)
        .filter((i: number) => i >= 0 && i < calendars.length);
      selectedCalendars = indices.map((i: number) => calendars[i]);
    }
  }
  
  if (selectedCalendars.length === 0) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'No calendars selected' }));
    } else {
      warn('No calendars selected');
    }
    process.exit(1);
  }
  
  // Write to arete.yaml
  const configPath = getWorkspaceConfigPath(workspaceRoot);
  let config: Record<string, any> = { schema: 1 };
  if (existsSync(configPath)) {
    try {
      config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, any>;
    } catch {
      // Use default
    }
  }
  
  // Update integrations.calendar
  if (!config.integrations) {
    config.integrations = {};
  }
  config.integrations.calendar = {
    provider: 'macos',
    calendars: selectedCalendars
  };
  
  writeFileSync(configPath, stringifyYaml(config), 'utf8');
  
  if (json) {
    console.log(JSON.stringify({
      success: true,
      provider: 'macos',
      calendars: selectedCalendars
    }, null, 2));
  } else {
    console.log('');
    success('Calendar integration configured!');
    listItem('Provider', 'macOS Calendar');
    listItem('Calendars', selectedCalendars.join(', '));
    console.log('');
  }
}

/**
 * Configure an integration
 */
async function configureIntegration(options: IntegrationOptions): Promise<void> {
  const { name } = options;
  
  // Special case: calendar configuration
  if (name === 'calendar') {
    return configureCalendar(options);
  }
  
  // Same as add for other integrations
  return addIntegration(options);
}

/**
 * Remove an integration
 */
async function removeIntegration(options: IntegrationOptions): Promise<void> {
  const { name, json } = options;
  
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  const configPath = join(paths.integrations, 'configs', `${name}.yaml`);
  
  if (!existsSync(configPath)) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Integration not configured: ${name}` }));
    } else {
      warn(`Integration not configured: ${name}`);
    }
    process.exit(1);
  }
  
  // Update status to inactive (don't delete file)
  const config = getIntegrationConfig(configPath) || {};
  config.status = 'inactive';
  config.removed = new Date().toISOString();
  writeFileSync(configPath, stringifyYaml(config), 'utf8');
  
  if (json) {
    console.log(JSON.stringify({ success: true, integration: name, status: 'inactive' }));
  } else {
    success(`${name} integration deactivated`);
    info('Credentials remain in .credentials/ - delete manually if needed');
  }
}

/**
 * Integration command router
 */
export async function integrationCommand(action: string, options: IntegrationOptions): Promise<void> {
  switch (action) {
    case 'list':
      return listIntegrations(options);
    case 'add':
      return addIntegration(options);
    case 'configure':
      return configureIntegration(options);
    case 'remove':
      return removeIntegration(options);
    default:
      error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

export default integrationCommand;
