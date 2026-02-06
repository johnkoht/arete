/**
 * Status command - show workspace status
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig } from '../core/config.js';
import { success, error, info, header, section, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions } from '../types.js';

interface IntegrationInfo {
  name: string;
  status: string;
  type?: string;
  error?: string;
}

/**
 * Get list of skills in a directory
 */
function getSkillsList(dir: string): string[] {
  if (!existsSync(dir)) return [];
  
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() || d.isSymbolicLink())
    .filter(d => !d.name.startsWith('_'))
    .map(d => d.name);
}

/**
 * Get integration status from configs
 */
function getIntegrationStatus(configsDir: string): IntegrationInfo[] {
  if (!existsSync(configsDir)) return [];
  
  const integrations: IntegrationInfo[] = [];
  const files = readdirSync(configsDir).filter(f => f.endsWith('.yaml'));
  
  for (const file of files) {
    try {
      const content = readFileSync(join(configsDir, file), 'utf8');
      const config = parseYaml(content) as Record<string, string>;
      integrations.push({
        name: config.name || basename(file, '.yaml'),
        status: config.status || 'inactive',
        type: config.type || 'unknown'
      });
    } catch (err) {
      integrations.push({
        name: basename(file, '.yaml'),
        status: 'error',
        error: (err as Error).message
      });
    }
  }
  
  return integrations;
}

/**
 * Status command handler
 */
export async function statusCommand(options: CommandOptions): Promise<void> {
  const { json } = options;
  
  // Find workspace
  const workspaceRoot = findWorkspaceRoot();
  
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ 
        success: false, 
        error: 'Not in an Areté workspace',
        hint: 'Run "arete install" to create a workspace'
      }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace');
    }
    process.exit(1);
  }
  
  const paths = getWorkspacePaths(workspaceRoot);
  const config = loadConfig(workspaceRoot);
  
  // Gather status info
  const status = {
    workspace: {
      path: workspaceRoot,
      version: config.version || 'unknown',
      source: config.source || 'unknown',
      created: config.created || 'unknown'
    },
    skills: {
      core: getSkillsList(paths.skillsCore),
      local: getSkillsList(paths.skillsLocal),
      merged: getSkillsList(paths.skills),
      overrides: [] as string[]
    },
    integrations: getIntegrationStatus(join(paths.integrations, 'configs')),
    directories: {
      context: existsSync(paths.context),
      memory: existsSync(paths.memory),
      projects: existsSync(paths.projects),
      people: existsSync(paths.people),
      resources: existsSync(paths.resources)
    }
  };
  
  // Check for overrides
  status.skills.overrides = status.skills.local.filter(s => 
    status.skills.core.includes(s)
  );
  
  // JSON output
  if (json) {
    console.log(JSON.stringify({
      success: true,
      ...status
    }, null, 2));
    return;
  }
  
  // Human-readable output
  header('Areté Workspace Status');
  
  // Workspace info
  listItem('Path', formatPath(workspaceRoot));
  listItem('Version', status.workspace.version);
  listItem('Source', status.workspace.source);
  
  // Skills
  section('Skills');
  
  const coreCount = status.skills.core.length;
  const localCount = status.skills.local.length;
  const overrideCount = status.skills.overrides.length;
  
  listItem('Core skills', coreCount.toString());
  if (localCount > 0) {
    listItem('Local skills', localCount.toString());
  }
  if (overrideCount > 0) {
    listItem('Overrides', status.skills.overrides.join(', '));
  }
  
  if (coreCount > 0) {
    console.log('');
    console.log(chalk.dim('  Available skills:'));
    const allSkills = [...new Set([...status.skills.core, ...status.skills.local])].sort();
    for (const skill of allSkills) {
      const isOverride = status.skills.overrides.includes(skill);
      const isLocal = status.skills.local.includes(skill) && !status.skills.core.includes(skill);
      let badge = '';
      if (isOverride) badge = chalk.yellow(' (override)');
      else if (isLocal) badge = chalk.green(' (local)');
      console.log(`    ${chalk.dim('•')} ${skill}${badge}`);
    }
  }
  
  // Integrations
  section('Integrations');
  
  if (status.integrations.length === 0) {
    console.log(chalk.dim('  No integrations configured'));
    console.log(chalk.dim('  Run "arete integration add <name>" to add one'));
  } else {
    for (const int of status.integrations) {
      const statusColor = int.status === 'active' ? chalk.green : 
                         int.status === 'error' ? chalk.red : chalk.dim;
      console.log(`  ${chalk.dim('•')} ${int.name}: ${statusColor(int.status)}`);
    }
  }
  
  // Directories
  section('Workspace Directories');
  
  for (const [name, exists] of Object.entries(status.directories)) {
    const icon = exists ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${name}/`);
  }
  
  console.log('');
}

export default statusCommand;
