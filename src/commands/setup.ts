/**
 * Setup command - interactive configuration
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { success, error, warn, info, header } from '../core/utils.js';
import type { CommandOptions } from '../types.js';

interface SetupIntegration {
  name: string;
  displayName: string;
  description: string;
  tool: string;
  auth: {
    type: string;
    envVar?: string;
    instructions?: string;
  };
  status?: string;
}

/**
 * Available integrations to configure
 */
const AVAILABLE_INTEGRATIONS: SetupIntegration[] = [
  {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Meeting recording and transcription',
    tool: 'meeting-recordings',
    auth: {
      type: 'api_key',
      envVar: 'FATHOM_API_KEY',
      instructions: 'Get your API key from https://fathom.video/settings/api'
    }
  },
  {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Calendar integration for meeting context',
    tool: 'calendar',
    auth: {
      type: 'oauth',
      instructions: 'Requires OAuth setup (coming soon)'
    },
    status: 'coming_soon'
  }
];

/**
 * Load credentials file
 */
function loadCredentials(credentialsPath: string): Record<string, Record<string, string>> {
  if (!existsSync(credentialsPath)) {
    return {};
  }
  try {
    const content = readFileSync(credentialsPath, 'utf8');
    return (parseYaml(content) as Record<string, Record<string, string>>) || {};
  } catch {
    return {};
  }
}

/**
 * Save credentials file
 */
function saveCredentials(credentialsPath: string, credentials: Record<string, unknown>): void {
  const dir = join(credentialsPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(credentialsPath, stringifyYaml(credentials), 'utf8');
}

/**
 * Update integration config status
 */
function updateIntegrationConfig(configPath: string, status: string): void {
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      config = (parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>) || {};
    } catch {
      config = {};
    }
  }
  config.status = status;
  config.updated = new Date().toISOString();
  writeFileSync(configPath, stringifyYaml(config), 'utf8');
}

/**
 * Setup command handler
 */
export async function setupCommand(options: CommandOptions): Promise<void> {
  const { json } = options;
  
  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ 
        success: false, 
        error: 'Not in an Areté workspace'
      }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace first');
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  const credentialsPath = join(paths.credentials, 'credentials.yaml');
  
  if (!json) {
    header('Areté Setup');
    console.log('Configure integrations and credentials for your workspace.');
    console.log('');
  }
  
  if (json) {
    // For JSON mode, just output current state
    const credentials = loadCredentials(credentialsPath);
    console.log(JSON.stringify({
      success: true,
      workspace: workspaceRoot,
      integrations: AVAILABLE_INTEGRATIONS.map(i => ({
        name: i.name,
        configured: !!credentials[i.name]?.api_key,
        status: i.status || 'available'
      }))
    }, null, 2));
    return;
  }
  
  // Interactive setup
  const { selectedIntegrations } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedIntegrations',
      message: 'Which integrations would you like to configure?',
      choices: AVAILABLE_INTEGRATIONS.map(i => ({
        name: `${i.displayName} - ${i.description}${i.status === 'coming_soon' ? chalk.dim(' (coming soon)') : ''}`,
        value: i.name,
        disabled: i.status === 'coming_soon'
      }))
    }
  ]);
  
  if (selectedIntegrations.length === 0) {
    info('No integrations selected. You can run "arete setup" again later.');
    return;
  }
  
  // Load existing credentials
  const credentials = loadCredentials(credentialsPath);
  const configured: string[] = [];
  
  // Configure each selected integration
  for (const integrationName of selectedIntegrations) {
    const integration = AVAILABLE_INTEGRATIONS.find(i => i.name === integrationName)!;
    
    console.log('');
    console.log(chalk.bold(`Configuring ${integration.displayName}...`));
    
    if (integration.auth.type === 'api_key') {
      console.log(chalk.dim(integration.auth.instructions!));
      console.log('');
      
      const existingKey = credentials[integration.name]?.api_key || 
                         process.env[integration.auth.envVar!] || '';
      const maskedKey = existingKey ? '****' + existingKey.slice(-4) : '';
      
      const { apiKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: `Enter ${integration.displayName} API key${maskedKey ? ` (current: ${maskedKey})` : ''}:`,
          mask: '*'
        }
      ]);
      
      if (apiKey) {
        credentials[integration.name] = { api_key: apiKey };
        
        // Update integration config
        const configPath = join(paths.integrations, 'configs', `${integration.name}.yaml`);
        updateIntegrationConfig(configPath, 'active');
        
        configured.push(integration.name);
        success(`${integration.displayName} configured!`);
      } else if (existingKey) {
        info(`Keeping existing ${integration.displayName} configuration`);
        configured.push(integration.name);
      } else {
        warn(`Skipped ${integration.displayName} (no API key provided)`);
      }
    }
  }
  
  // Save credentials
  if (Object.keys(credentials).length > 0) {
    saveCredentials(credentialsPath, credentials);
    console.log('');
    success(`Credentials saved to ${chalk.cyan('.credentials/credentials.yaml')}`);
  }
  
  // Summary
  console.log('');
  if (configured.length > 0) {
    success(`Configured ${configured.length} integration(s): ${configured.join(', ')}`);
    console.log('');
    console.log(chalk.dim('Next steps:'));
    if (configured.includes('fathom')) {
      console.log(`  • ${chalk.cyan('arete fathom list')} - Test Fathom connection`);
      console.log(`  • ${chalk.cyan('arete seed')} - Import historical meetings`);
    }
  } else {
    info('No integrations were configured.');
  }
  
  console.log('');
}

export default setupCommand;
