/**
 * Tool management commands
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { success, error, header, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions, WorkType, SkillCategory } from '../types.js';

export interface ToolOptions extends CommandOptions {
  name?: string;
  verbose?: boolean;
}

export interface ToolInfo {
  name: string;
  description?: string;
  lifecycle?: 'time-bound' | 'condition-bound' | 'cyclical' | 'one-time';
  duration?: string;
  path?: string;
  id?: string;
  triggers?: string[];
  // Computed for routing
  work_type?: WorkType;
  category?: SkillCategory;
}

/**
 * Get tool info from TOOL.md
 */
function getToolInfo(toolPath: string): ToolInfo {
  const toolFile = join(toolPath, 'TOOL.md');
  if (!existsSync(toolFile)) {
    return { name: basename(toolPath) };
  }

  let info: ToolInfo = { name: basename(toolPath) };
  try {
    const content = readFileSync(toolFile, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
      info = {
        name: (frontmatter.name as string) || basename(toolPath),
        description: (frontmatter.description as string) || '',
        lifecycle: (frontmatter.lifecycle as ToolInfo['lifecycle']) || 'one-time',
        duration: (frontmatter.duration as string) || undefined,
        triggers: Array.isArray(frontmatter.triggers) ? (frontmatter.triggers as string[]) : undefined,
      };
    }
  } catch (err) {
    // Return minimal info on parse error
  }

  info.path = toolPath;
  info.id = basename(toolPath);
  return info;
}

/**
 * Get list of tools from directory
 */
function getToolsList(dir: string): ToolInfo[] {
  if (!existsSync(dir)) return [];
  
  const entries = readdirSync(dir, { withFileTypes: true });
  const tools: ToolInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip template and hidden dirs
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const toolPath = join(dir, entry.name);
    const info = getToolInfo(toolPath);
    tools.push(info);
  }

  return tools;
}

/**
 * Get merged tools for routing (with computed work_type)
 */
export function getMergedToolsForRouting(paths: ReturnType<typeof getWorkspacePaths>): ToolInfo[] {
  const tools = getToolsList(paths.tools);
  
  // Map lifecycle to work_type for routing compatibility
  const LIFECYCLE_TO_WORK_TYPE: Record<string, WorkType> = {
    'time-bound': 'planning',
    'condition-bound': 'delivery',
    'cyclical': 'planning',
    'one-time': 'operations',
  };

  return tools.map(tool => ({
    ...tool,
    work_type: tool.lifecycle ? LIFECYCLE_TO_WORK_TYPE[tool.lifecycle] : 'operations',
    category: 'default' as SkillCategory, // Tools are default category
  }));
}

/**
 * List available tools
 */
export async function listTools(opts: ToolOptions) {
  const root = findWorkspaceRoot();
  if (!root) {
    error('Not in an Areté workspace');
    return;
  }

  const paths = getWorkspacePaths(root);
  const tools = getToolsList(paths.tools);

  if (tools.length === 0) {
    error('No tools found. Run `arete update` to get the latest tools.');
    return;
  }

  header('Available Tools');
  console.log();

  for (const tool of tools) {
    listItem(`${tool.name}${tool.lifecycle ? ` (${tool.lifecycle})` : ''}`);
    if (tool.description) {
      console.log(`  ${tool.description}`);
    }
    if (tool.duration) {
      console.log(`  Duration: ${tool.duration}`);
    }
    console.log();
  }

  success(`${tools.length} tool${tools.length === 1 ? '' : 's'} available`);
}

/**
 * Show details for a specific tool
 */
export async function showTool(toolName: string, opts: ToolOptions) {
  const root = findWorkspaceRoot();
  if (!root) {
    error('Not in an Areté workspace');
    return;
  }

  const paths = getWorkspacePaths(root);
  const toolPath = join(paths.tools, toolName);
  
  if (!existsSync(toolPath)) {
    error(`Tool '${toolName}' not found`);
    return;
  }

  const info = getToolInfo(toolPath);
  
  header(`Tool: ${info.name}`);
  console.log();
  
  if (info.description) {
    console.log(`Description: ${info.description}`);
  }
  if (info.lifecycle) {
    console.log(`Lifecycle: ${info.lifecycle}`);
  }
  if (info.duration) {
    console.log(`Duration: ${info.duration}`);
  }
  if (info.triggers && info.triggers.length > 0) {
    console.log(`\nTriggers:`);
    info.triggers.forEach(t => listItem(t));
  }
  
  console.log();
  console.log(`Path: ${formatPath(toolPath)}`);
}
