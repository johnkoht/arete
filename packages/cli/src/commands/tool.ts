/**
 * Tool commands — list, show
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
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
      const tools = await services.tools.list(paths.tools);

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description || undefined,
            lifecycle: t.lifecycle,
            duration: t.duration,
            triggers: t.triggers.length > 0 ? t.triggers : undefined,
          })),
          count: tools.length,
        }, null, 2));
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
      const tool = await services.tools.get(name, paths.tools);

      if (!tool) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: `Tool '${name}' not found` }));
        } else {
          error(`Tool '${name}' not found`);
        }
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          tool: {
            name: tool.name,
            description: tool.description || undefined,
            lifecycle: tool.lifecycle,
            duration: tool.duration,
            triggers: tool.triggers.length > 0 ? tool.triggers : undefined,
            path: tool.path,
          },
        }, null, 2));
        return;
      }

      header(`Tool: ${tool.name}`);
      console.log('');
      if (tool.description) {
        console.log(`Description: ${tool.description}`);
      }
      if (tool.lifecycle) {
        console.log(`Lifecycle: ${tool.lifecycle}`);
      }
      if (tool.duration) {
        console.log(`Duration: ${tool.duration}`);
      }
      if (tool.triggers && tool.triggers.length > 0) {
        console.log(`\nTriggers:`);
        tool.triggers.forEach((t) => listItem(t));
      }
      console.log('');
      listItem('Path', tool.path);
      console.log('');
    });
}
