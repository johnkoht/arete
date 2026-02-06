/**
 * Shared utilities for running integration scripts.
 *
 * Extracted from pull.ts, seed.ts, and fathom.ts to eliminate duplication.
 * All integration commands should use these helpers instead of rolling their own.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { findWorkspaceRoot, getPackageRoot } from './workspace.js';
import type { ScriptResult, WorkspacePaths } from '../types.js';

export interface ScriptRunOptions {
  /** If true, capture stdout/stderr instead of inheriting stdio */
  quiet?: boolean;
}

/**
 * Find the Python script for a given integration.
 *
 * Search order:
 * 1. Workspace scripts/integrations/<name>.py
 * 2. CLI package scripts/integrations/<name>.py
 * 3. CLI package integrations/<name>/scripts/fetch.py (future convention)
 */
export function findIntegrationScript(integrationName: string): string | null {
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

  // Try integrations folder structure (future convention)
  const integrationsScript = join(packageRoot, 'integrations', integrationName, 'scripts', 'fetch.py');
  if (existsSync(integrationsScript)) {
    return integrationsScript;
  }

  return null;
}

/**
 * Run an integration's Python script as a child process.
 */
export function runIntegrationScript(
  scriptPath: string,
  args: string[],
  options: ScriptRunOptions = {}
): Promise<ScriptResult> {
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
      proc.stdout!.on('data', (data: Buffer) => { stdout += data; });
      proc.stderr!.on('data', (data: Buffer) => { stderr += data; });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code: code ?? undefined });
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
 * Read the status of an integration from its config YAML file.
 *
 * Returns the status string (e.g. 'active', 'inactive') or null if not found.
 */
export function getIntegrationStatus(
  paths: Pick<WorkspacePaths, 'integrations'>,
  integrationName: string
): string | null {
  const configPath = join(paths.integrations, 'configs', `${integrationName}.yaml`);
  if (!existsSync(configPath)) return null;

  try {
    const config = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, string>;
    return config.status ?? null;
  } catch {
    return null;
  }
}
