/**
 * arete status — workspace health and versions
 */

import {
  createServices,
  loadConfig,
  getAdapterFromConfig,
} from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { readdirSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { header, listItem, section, error, info, formatPath } from '../formatters.js';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show workspace status and configured integrations')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();

      if (!root) {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: 'Not in an Areté workspace',
              hint: 'Run "arete install" to create a workspace',
            }),
          );
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exit(1);
      }

      const status = await services.workspace.getStatus(root);
      const basePaths = services.workspace.getPaths(root);
      const config = await loadConfig(services.storage, root);
      const adapter = getAdapterFromConfig(config, root);
      const integrationsConfigsDir = join(
        root,
        adapter.integrationsDir(),
        'configs',
      );

      const skillsList = getSkillsList(basePaths.agentSkills);
      const integrations = getIntegrationStatus(integrationsConfigsDir);
      const directories = {
        context: existsSync(basePaths.context),
        memory: existsSync(basePaths.memory),
        projects: existsSync(basePaths.projects),
        people: existsSync(basePaths.people),
        resources: existsSync(basePaths.resources),
      };

      const payload = {
        success: true,
        workspace: {
          path: root,
          version: status.version,
          ide: config.ide_target ?? status.ideTarget ?? 'cursor',
        },
        skills: { list: skillsList, count: skillsList.length },
        integrations,
        directories,
      };

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      header('Areté Workspace Status');
      listItem('Path', formatPath(root));
      listItem('Version', status.version ?? 'unknown');
      listItem('IDE', payload.workspace.ide);

      section('Skills');
      listItem('Skills', payload.skills.count.toString());
      if (payload.skills.count > 0) {
        console.log('');
        console.log(chalk.dim('  Available skills:'));
        for (const skill of payload.skills.list.sort()) {
          console.log(`    ${chalk.dim('•')} ${skill}`);
        }
      }

      section('Integrations');
      if (integrations.length === 0) {
        console.log(chalk.dim('  No integrations configured'));
        console.log(chalk.dim('  Run "arete integration configure <name>" to configure one'));
      } else {
        for (const int of integrations) {
          const statusColor =
            int.status === 'active'
              ? chalk.green
              : int.status === 'error'
                ? chalk.red
                : chalk.dim;
          console.log(
            `  ${chalk.dim('•')} ${int.name}: ${statusColor(int.status)}`,
          );
        }
      }

      section('Workspace Directories');
      for (const [name, exists] of Object.entries(directories)) {
        const icon = exists ? chalk.green('✓') : chalk.red('✗');
        console.log(`  ${icon} ${name}/`);
      }
      console.log('');
    });
}

function getSkillsList(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .filter((d) => !d.name.startsWith('_'))
    .map((d) => d.name);
}

interface IntegrationInfo {
  name: string;
  status: string;
  type?: string;
  error?: string;
}

function getIntegrationStatus(configsDir: string): IntegrationInfo[] {
  if (!existsSync(configsDir)) return [];
  const integrations: IntegrationInfo[] = [];
  const files = readdirSync(configsDir).filter((f) => f.endsWith('.yaml'));

  for (const file of files) {
    try {
      const content = readFileSync(join(configsDir, file), 'utf8');
      const config = parseYaml(content) as Record<string, string>;
      integrations.push({
        name: config.name || file.replace('.yaml', ''),
        status: config.status || 'inactive',
        type: config.type || 'unknown',
      });
    } catch (err) {
      integrations.push({
        name: file.replace('.yaml', ''),
        status: 'error',
        error: (err as Error).message,
      });
    }
  }
  return integrations;
}
