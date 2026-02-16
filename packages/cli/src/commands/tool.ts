/**
 * Tool commands — list, show
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { header, listItem, error, success } from '../formatters.js';

export function registerToolCommands(program: Command): void {
  const toolCmd = program.command('tool').description('Manage tools');

  toolCmd
    .command('list')
    .description('List available tools')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const tools = await getToolsList(services.storage, paths.tools);

      if (opts.json) {
        console.log(JSON.stringify({ success: true, tools, count: tools.length }, null, 2));
        return;
      }

      if (tools.length === 0) {
        error('No tools found. Run `arete update` to get the latest tools.');
        return;
      }

      header('Available Tools');
      console.log('');
      for (const tool of tools) {
        listItem(`${tool.name}${tool.lifecycle ? ` (${tool.lifecycle})` : ''}`);
        if (tool.description) {
          console.log(`  ${tool.description}`);
        }
        if (tool.duration) {
          console.log(`  Duration: ${tool.duration}`);
        }
        console.log('');
      }
      success(`${tools.length} tool(s) available`);
    });

  toolCmd
    .command('show <name>')
    .description('Show details for a specific tool')
    .option('--json', 'Output as JSON')
    .action(async (name: string, opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const toolPath = join(paths.tools, name);
      const exists = await services.storage.exists(toolPath);
      if (!exists) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Tool '${name}' not found` }));
        } else {
          error(`Tool '${name}' not found`);
        }
        process.exit(1);
      }

      const info = await getToolInfo(services.storage, toolPath);
      if (opts.json) {
        console.log(JSON.stringify({ success: true, tool: info }, null, 2));
        return;
      }

      header(`Tool: ${info.name}`);
      console.log('');
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
        info.triggers.forEach((t) => listItem(t));
      }
      console.log('');
      listItem('Path', toolPath);
      console.log('');
    });
}

interface ToolInfo {
  name: string;
  description?: string;
  lifecycle?: string;
  duration?: string;
  triggers?: string[];
}

async function getToolsList(
  storage: {
    exists: (p: string) => Promise<boolean>;
    listSubdirectories: (dir: string) => Promise<string[]>;
    read: (p: string) => Promise<string | null>;
  },
  toolsDir: string,
): Promise<ToolInfo[]> {
  const exists = await storage.exists(toolsDir);
  if (!exists) return [];
  const subdirs = await storage.listSubdirectories(toolsDir);
  const tools: ToolInfo[] = [];
  for (const subdir of subdirs) {
    const info = await getToolInfo(storage, subdir);
    tools.push(info);
  }
  return tools;
}

async function getToolInfo(
  storage: {
    read: (p: string) => Promise<string | null>;
    exists: (p: string) => Promise<boolean>;
  },
  toolPath: string,
): Promise<ToolInfo> {
  const toolFile = join(toolPath, 'TOOL.md');
  const name = toolPath.split(/[/\\]/).pop() ?? 'unknown';
  const info: ToolInfo = { name };
  const exists = await storage.exists(toolFile);
  if (!exists) return info;
  const content = await storage.read(toolFile);
  if (!content) return info;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match) {
    const { parse: parseYaml } = await import('yaml');
    try {
      const fm = parseYaml(match[1]) as Record<string, unknown>;
      info.description = (fm.description as string) || undefined;
      info.lifecycle = (fm.lifecycle as string) || undefined;
      info.duration = (fm.duration as string) || undefined;
      info.triggers = Array.isArray(fm.triggers) ? (fm.triggers as string[]) : undefined;
    } catch {
      // ignore
    }
  }
  return info;
}
