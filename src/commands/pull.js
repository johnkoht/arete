/**
 * Pull command - fetch latest data from integrations
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths, getPackageRoot } from '../core/workspace.js';
import { loadConfig } from '../core/config.js';
import { success, error, warn, info, header, listItem } from '../core/utils.js';

/**
 * Integrations that support pulling
 */
const PULLABLE_INTEGRATIONS = {
  fathom: {
    name: 'fathom',
    displayName: 'Fathom',
    description: 'Fetch recent meeting recordings',
    defaultDays: 7,
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
  
  if (workspaceRoot) {
    const workspaceScript = join(workspaceRoot, 'scripts', 'integrations', `${integrationName}.py`);
    if (existsSync(workspaceScript)) {
      return workspaceScript;
    }
  }
  
  const packageRoot = getPackageRoot();
  const packageScript = join(packageRoot, 'scripts', 'integrations', `${integrationName}.py`);
  if (existsSync(packageScript)) {
    return packageScript;
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
 * Pull command handler
 */
export async function pullCommand(integration, options) {
  const { days = 7, json } = options;
  
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
  
  // Determine which integrations to pull from
  let integrationsToPull = [];
  
  if (integration) {
    // Specific integration requested
    const int = PULLABLE_INTEGRATIONS[integration];
    if (!int) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: `Unknown integration: ${integration}` }));
      } else {
        error(`Unknown integration: ${integration}`);
        info('Available: ' + Object.keys(PULLABLE_INTEGRATIONS).join(', '));
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
    
    integrationsToPull = [{ ...int, status }];
  } else {
    // Pull from all active integrations
    for (const [name, intConfig] of Object.entries(PULLABLE_INTEGRATIONS)) {
      const status = getIntegrationStatus(paths, name);
      if (status === 'active') {
        integrationsToPull.push({ ...intConfig, status });
      }
    }
    
    if (integrationsToPull.length === 0) {
      if (json) {
        console.log(JSON.stringify({ 
          success: false, 
          error: 'No active integrations to pull from'
        }));
      } else {
        warn('No active integrations to pull from');
        info('Run "arete integration add <name>" to configure one');
      }
      process.exit(1);
    }
  }
  
  if (!json) {
    header('Pull Latest Data');
    listItem('Integrations', integrationsToPull.map(i => i.displayName).join(', '));
    listItem('Time range', `Last ${days} days`);
    console.log('');
  }
  
  // Run pull for each integration
  const results = [];
  
  for (const int of integrationsToPull) {
    if (!json) {
      info(`Pulling from ${int.displayName}...`);
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
      const args = [int.command || 'fetch', '--days', String(days)];
      if (json) args.push('--json');
      
      await runIntegrationScript(scriptPath, args, { quiet: json });
      
      results.push({ integration: int.name, success: true, days });
      if (!json) {
        success(`${int.displayName} pull complete!`);
      }
    } catch (err) {
      results.push({ integration: int.name, success: false, error: err.message });
      if (!json) {
        error(`${int.displayName} pull failed: ${err.message}`);
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
    const succeeded = results.filter(r => r.success).length;
    if (succeeded === results.length) {
      success('All integrations synced successfully');
    } else {
      warn(`${succeeded}/${results.length} integrations synced`);
    }
    console.log('');
  }
}

export default pullCommand;
