/**
 * Seed command - import historical data from integrations
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { findWorkspaceRoot, getWorkspacePaths, getPackageRoot } from '../core/workspace.js';
import { loadConfig } from '../core/config.js';
import { success, error, warn, info, header, listItem, section } from '../core/utils.js';

/**
 * Available integrations that support seeding
 */
const SEEDABLE_INTEGRATIONS = {
  fathom: {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Import meeting recordings and transcripts',
    defaultDays: 60,
    maxDays: 365,
    script: 'fathom.py',
    command: 'fetch'
  }
};

/**
 * Get integration status from config
 */
function getIntegrationStatus(paths, integrationName) {
  const configPath = join(paths.integrations, 'configs', `${integrationName}.yaml`);
  if (!existsSync(configPath)) return null;
  
  try {
    const config = parseYaml(readFileSync(configPath, 'utf8'));
    return config.status;
  } catch {
    return null;
  }
}

/**
 * Find the integration script
 */
function findIntegrationScript(integrationName) {
  const workspaceRoot = findWorkspaceRoot();
  
  // Try workspace first
  if (workspaceRoot) {
    const workspaceScript = join(workspaceRoot, 'scripts', 'integrations', `${integrationName}.py`);
    if (existsSync(workspaceScript)) {
      return workspaceScript;
    }
  }
  
  // Try package root
  const packageRoot = getPackageRoot();
  const packageScript = join(packageRoot, 'scripts', 'integrations', `${integrationName}.py`);
  if (existsSync(packageScript)) {
    return packageScript;
  }
  
  // Try integrations folder structure
  const integrationsScript = join(packageRoot, 'integrations', integrationName, 'scripts', 'fetch.py');
  if (existsSync(integrationsScript)) {
    return integrationsScript;
  }
  
  return null;
}

/**
 * Run integration script
 */
function runIntegrationScript(scriptPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const workspaceRoot = findWorkspaceRoot() || process.cwd();
    
    const proc = spawn('python3', [scriptPath, ...args], {
      stdio: options.quiet ? 'pipe' : 'inherit',
      cwd: workspaceRoot,
      env: { ...process.env, ARETE_WORKSPACE_ROOT: workspaceRoot }
    });
    
    let stdout = '';
    let stderr = '';
    
    if (options.quiet) {
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
    }
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Seed command handler
 */
export async function seedCommand(options) {
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
  const config = loadConfig(workspaceRoot);
  
  if (!json) {
    header('Seed Workspace');
    console.log('Import historical data from your connected integrations.');
    console.log('');
  }
  
  // Get available seedable integrations
  const available = [];
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
  let selectedIntegrations = [];
  
  if (integration) {
    // Specific integration requested
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
    // Non-interactive: use all available
    selectedIntegrations = available;
  } else {
    // Interactive selection
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
          validate: (val) => val > 0 && val <= 365 ? true : 'Enter a number between 1 and 365'
        }
      ]);
      seedDays = customDays;
    } else {
      seedDays = daysChoice;
    }
  }
  
  seedDays = seedDays || 60; // Default
  
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
  const results = [];
  
  for (const int of selectedIntegrations) {
    if (!json) {
      console.log('');
      info(`Seeding from ${int.displayName}...`);
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
      results.push({ integration: int.name, success: false, error: err.message });
      if (!json) {
        error(`${int.displayName} seeding failed: ${err.message}`);
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
    console.log(`  • Check pending items: ${chalk.cyan('memory/pending-review.md')}`);
    console.log(`  • Run ${chalk.cyan('arete status')} to see workspace state`);
    console.log('');
  }
}

export default seedCommand;
