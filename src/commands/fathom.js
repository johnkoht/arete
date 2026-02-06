/**
 * Fathom integration commands (legacy compatibility)
 * Wraps the existing Python script
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { findWorkspaceRoot, getPackageRoot } from '../core/workspace.js';
import { error, info, warn } from '../core/utils.js';

/**
 * Find the fathom.py script
 */
function findFathomScript() {
  // Try workspace first
  const workspaceRoot = findWorkspaceRoot();
  if (workspaceRoot) {
    const workspaceScript = join(workspaceRoot, 'scripts', 'integrations', 'fathom.py');
    if (existsSync(workspaceScript)) {
      return workspaceScript;
    }
  }
  
  // Try package root
  const packageRoot = getPackageRoot();
  const packageScript = join(packageRoot, 'scripts', 'integrations', 'fathom.py');
  if (existsSync(packageScript)) {
    return packageScript;
  }
  
  return null;
}

/**
 * Run the fathom Python script
 */
function runFathomScript(args, options = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = findFathomScript();
    
    if (!scriptPath) {
      reject(new Error('Fathom script not found'));
      return;
    }
    
    const workspaceRoot = findWorkspaceRoot() || process.cwd();
    const proc = spawn('python3', [scriptPath, ...args], {
      stdio: options.json ? 'pipe' : 'inherit',
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ARETE_WORKSPACE_ROOT: workspaceRoot
      }
    });
    
    let stdout = '';
    let stderr = '';
    
    if (options.json) {
      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });
    }
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
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
 * List Fathom recordings
 */
async function listRecordings(options) {
  const { days = '7', json } = options;
  
  try {
    const args = ['list', '--days', days];
    if (json) args.push('--json');
    
    await runFathomScript(args, { json });
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: err.message }));
    } else {
      error(err.message);
      info('Make sure you have configured Fathom: arete integration add fathom');
    }
    process.exit(1);
  }
}

/**
 * Fetch Fathom recordings
 */
async function fetchRecordings(options) {
  const { days = '7', json } = options;
  
  try {
    const args = ['fetch', '--days', days];
    if (json) args.push('--json');
    
    await runFathomScript(args, { json });
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: err.message }));
    } else {
      error(err.message);
    }
    process.exit(1);
  }
}

/**
 * Get a specific recording
 */
async function getRecording(options) {
  const { id, json } = options;
  
  try {
    const args = ['get', id];
    if (json) args.push('--json');
    
    await runFathomScript(args, { json });
  } catch (err) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: err.message }));
    } else {
      error(err.message);
    }
    process.exit(1);
  }
}

/**
 * Fathom command router
 */
export async function fathomCommand(action, options) {
  switch (action) {
    case 'list':
      return listRecordings(options);
    case 'fetch':
      return fetchRecordings(options);
    case 'get':
      return getRecording(options);
    default:
      error(`Unknown Fathom action: ${action}`);
      info('Available: list, fetch, get');
      process.exit(1);
  }
}

export default fathomCommand;
