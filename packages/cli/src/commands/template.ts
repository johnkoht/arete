/**
 * Template commands — list, view meeting agendas
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'path';
import { header, section, listItem, error, info } from '../formatters.js';

export function registerTemplateCommands(program: Command): void {
  const templateCmd = program.command('template').description('List and view templates');

  templateCmd
    .command('list <kind>')
    .description('List templates (e.g. meeting-agendas)')
    .option('--json', 'Output as JSON')
    .action(async (kind: string | undefined, opts: { json?: boolean }) => {
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

      if (kind !== 'meeting-agendas') {
        if (opts.json) {
          console.log(
            JSON.stringify({
              success: false,
              error: `Unknown template kind: ${kind}. Use 'meeting-agendas'.`,
            }),
          );
        } else {
          error(`Unknown template kind: ${kind ?? 'none'}. Use 'meeting-agendas'.`);
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const templatesDir = join(paths.root, '.arete', 'templates', 'meeting-agendas');
      const exists = await services.storage.exists(templatesDir);
      const defaultTemplates: { name: string; type: string; description?: string }[] = [
        { name: 'leadership', type: 'leadership', description: 'Leadership/executive meeting' },
        { name: 'customer', type: 'customer', description: 'Customer discovery/feedback' },
        { name: '1:1', type: '1:1', description: 'One-on-one meeting' },
      ];
      const customTemplates: { name: string; type: string; description?: string }[] = [];

      if (exists) {
        const files = await services.storage.list(templatesDir, {
          extensions: ['.md'],
        });
        for (const filePath of files) {
          const base = filePath.split(/[/\\]/).pop() ?? '';
          if (base === 'index.md') continue;
          const type = base.replace(/\.md$/, '');
          const content = await services.storage.read(filePath);
          const descMatch = content?.match(/^#\s+(.+)/m);
          customTemplates.push({
            name: type,
            type,
            description: descMatch?.[1]?.trim(),
          });
        }
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              default: defaultTemplates,
              custom: customTemplates,
            },
            null,
            2,
          ),
        );
        return;
      }

      header('Meeting agenda templates');
      section('Default Templates');
      for (const t of defaultTemplates) {
        listItem(t.name, t.description ?? '—', 1);
      }
      console.log('');
      section('Custom Templates');
      if (customTemplates.length === 0) {
        info('No custom templates. Add .md files under .arete/templates/meeting-agendas/');
      } else {
        for (const t of customTemplates) {
          listItem(t.name, t.description ?? '—', 1);
        }
      }
      console.log('');
    });

  templateCmd
    .command('view <kind>')
    .description('View a template by type')
    .requiredOption('--type <name>', 'Template type (e.g. leadership)')
    .option('--json', 'Output as JSON')
    .action(
      async (
        kind: string | undefined,
        opts: { type?: string; json?: boolean },
      ) => {
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

        const type = opts.type ?? '';
        if (!type) {
          if (opts.json) {
            console.log(JSON.stringify({ success: false, error: 'Missing --type' }));
          } else {
            error('Missing --type. Example: arete template view meeting-agenda --type leadership');
          }
          process.exit(1);
        }

        const paths = services.workspace.getPaths(root);
        const templatePath = join(paths.root, '.arete', 'templates', 'meeting-agendas', `${type}.md`);
        const exists = await services.storage.exists(templatePath);
        if (!exists) {
          if (opts.json) {
            console.log(
              JSON.stringify({ success: false, error: `Template not found: ${type}` }),
            );
          } else {
            error(`Template not found for type: ${type}`);
            info('Run "arete template list meeting-agendas" to see available types.');
          }
          process.exit(1);
        }

        const content = await services.storage.read(templatePath);
        if (opts.json) {
          console.log(
            JSON.stringify({ success: true, type, body: content ?? '' }, null, 2),
          );
        } else {
          header(`${type} (meeting-agenda)`);
          console.log(content ?? '');
        }
      },
    );
}
