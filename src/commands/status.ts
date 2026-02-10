/**
 * Status command - show workspace status
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
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

const CONTEXT_STALE_DAYS = 30;

/**
 * Get context files that haven't been modified in 30+ days
 */
function getStaleContextFiles(contextDir: string): string[] {
  if (!existsSync(contextDir)) return [];
  const stale: string[] = [];
  const cutoff = Date.now() - CONTEXT_STALE_DAYS * 24 * 60 * 60 * 1000;
  try {
    const files = readdirSync(contextDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.md') || f.name.startsWith('_')) continue;
      const full = join(contextDir, f.name);
      try {
        const stat = statSync(full);
        if (stat.mtimeMs < cutoff) stale.push(f.name);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return stale;
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
  const skillsList = getSkillsList(paths.agentSkills);
  const status = {
    workspace: {
      path: workspaceRoot,
      version: config.version || 'unknown',
      source: config.source || 'unknown',
      created: config.created || 'unknown',
      ide: config.ide_target || 'cursor'
    },
    skills: {
      list: skillsList,
      count: skillsList.length
    },
    integrations: getIntegrationStatus(join(paths.integrations, 'configs')),
    directories: {
      context: existsSync(paths.context),
      memory: existsSync(paths.memory),
      projects: existsSync(paths.projects),
      people: existsSync(paths.people),
      resources: existsSync(paths.resources)
    },
    contextStale: getStaleContextFiles(paths.context)
  };
  
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
  listItem('IDE', status.workspace.ide);
  
  // Skills
  section('Skills');
  listItem('Skills', status.skills.count.toString());
  if (status.skills.count > 0) {
    console.log('');
    console.log(chalk.dim('  Available skills:'));
    for (const skill of status.skills.list.sort()) {
      console.log(`    ${chalk.dim('•')} ${skill}`);
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
  
  // Context freshness (files not modified in 30+ days)
  if (status.contextStale.length > 0) {
    section('Context Freshness');
    console.log(chalk.dim(`  Files not modified in ${CONTEXT_STALE_DAYS}+ days:`));
    for (const f of status.contextStale) {
      console.log(`  ${chalk.yellow('⚠')} context/${f}`);
    }
    console.log(chalk.dim('  Run periodic-review skill or update these files.'));
    console.log('');
  }

  // Directories
  section('Workspace Directories');
  
  for (const [name, exists] of Object.entries(status.directories)) {
    const icon = exists ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${name}/`);
  }
  
  console.log('');
  
  // Check for ambiguous IDE setup
  const hasCursor = existsSync(join(workspaceRoot, '.cursor'));
  const hasClaude = existsSync(join(workspaceRoot, '.claude'));
  if (hasCursor && hasClaude && !config.ide_target) {
    console.log(chalk.yellow('⚠️  Both .cursor/ and .claude/ directories exist. Set \'ide_target\' in arete.yaml to avoid ambiguity.'));
    console.log('');
  }
}

export default statusCommand;
