/**
 * arete create — Create workspace entities (areas, etc.)
 */

import {
  createServices,
  loadConfig,
  refreshQmdIndex,
  renderTemplateString,
  type QmdRefreshResult,
} from '@arete/core';
import type { Command } from 'commander';
import { join } from 'node:path';
import {
  header,
  success,
  error,
  info,
  listItem,
} from '../formatters.js';
import { displayQmdResult } from '../lib/qmd-output.js';

/**
 * Validate slug format: lowercase letters, numbers, hyphens only.
 * Must start with a letter, no consecutive hyphens.
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug);
}

export function registerCreateCommands(program: Command): void {
  const createCmd = program
    .command('create')
    .description('Create workspace entities');

  createCmd
    .command('area <slug>')
    .description('Create a new area with file and context directory')
    .option('--name <name>', 'Area name (defaults to titlecased slug)')
    .option('--description <desc>', 'Initial description')
    .option('--meeting-title <title>', 'First recurring meeting title (optional)')
    .option('--skip-qmd', 'Skip automatic qmd index update')
    .option('--json', 'Output as JSON')
    .action(async (
      slug: string,
      opts: {
        name?: string;
        description?: string;
        meetingTitle?: string;
        skipQmd?: boolean;
        json?: boolean;
      }
    ) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();

      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace first');
        }
        process.exit(1);
      }

      // Validate slug format
      if (!isValidSlug(slug)) {
        const errorMsg = `Invalid slug format: "${slug}". Use lowercase letters, numbers, and hyphens (e.g., "glance-communications")`;
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: errorMsg }));
        } else {
          error(errorMsg);
        }
        process.exit(1);
      }

      // Check if area already exists
      const areaPath = join(root, 'areas', `${slug}.md`);
      const contextDir = join(root, 'context', slug);

      const areaExists = await services.storage.exists(areaPath);
      const contextExists = await services.storage.exists(contextDir);

      if (areaExists || contextExists) {
        const existing = [
          areaExists ? `areas/${slug}.md` : null,
          contextExists ? `context/${slug}/` : null,
        ].filter(Boolean).join(' and ');
        const errorMsg = `Area already exists: ${existing}`;
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: errorMsg }));
        } else {
          error(errorMsg);
        }
        process.exit(1);
      }

      // Gather values — interactive if not provided via flags
      let areaName = opts.name;
      let description = opts.description;
      let meetingTitle = opts.meetingTitle;

      if (!opts.json && (!areaName || !description)) {
        // Interactive mode
        const { input } = await import('@inquirer/prompts');

        if (!opts.json) {
          header('Create Area');
          console.log(`Slug: ${slug}`);
          console.log('');
        }

        if (!areaName) {
          // Default to titlecased slug
          const defaultName = slug
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          try {
            areaName = await input({
              message: 'Area name:',
              default: defaultName,
            });
          } catch {
            // User cancelled (Ctrl+C)
            console.log('');
            info('Cancelled');
            process.exit(0);
          }
        }

        if (!description) {
          try {
            description = await input({
              message: 'Initial description (optional):',
              default: '',
            });
          } catch {
            console.log('');
            info('Cancelled');
            process.exit(0);
          }
        }

        if (meetingTitle === undefined) {
          try {
            meetingTitle = await input({
              message: 'First recurring meeting title (optional, press enter to skip):',
              default: '',
            });
          } catch {
            console.log('');
            info('Cancelled');
            process.exit(0);
          }
        }
      }

      // Apply defaults for non-interactive mode
      if (!areaName) {
        areaName = slug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
      if (!description) {
        description = '';
      }
      if (!meetingTitle) {
        meetingTitle = '';
      }

      // Get the area template from workspace
      const templatePath = join(root, 'areas', '_template.md');
      const template = await services.storage.read(templatePath);
      if (!template) {
        const errorMsg = 'Area template not found at areas/_template.md. Run "arete update" to restore it.';
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: errorMsg }));
        } else {
          error(errorMsg);
        }
        process.exit(1);
      }

      // Render the template
      let areaContent = renderTemplateString(template, {
        name: areaName,
        description: description || '<!-- Add description here -->',
        meeting_title: meetingTitle || 'Weekly Sync',
      });

      // If no meeting was specified, remove the recurring_meetings block entirely
      if (!meetingTitle) {
        // Remove the recurring_meetings section from YAML frontmatter
        areaContent = areaContent.replace(
          /recurring_meetings:\n  - title: "Weekly Sync"\n    attendees: \[\]\n    frequency: weekly\n/,
          'recurring_meetings: []\n'
        );
      }

      // Create the area file
      await services.storage.write(areaPath, areaContent);

      // Create the context directory with a placeholder README
      const contextReadmePath = join(contextDir, 'README.md');
      const contextReadmeContent = `# ${areaName}

Context files for the ${areaName} area.

Add meeting notes, research, and other context documents here.
`;
      await services.storage.write(contextReadmePath, contextReadmeContent);

      // Auto-refresh qmd index after writes
      let qmdResult: QmdRefreshResult | undefined;
      if (!opts.skipQmd) {
        const config = await loadConfig(services.storage, root);
        qmdResult = await refreshQmdIndex(root, config.qmd_collection);
      }

      if (opts.json) {
        console.log(JSON.stringify({
          success: true,
          slug,
          areaPath: `areas/${slug}.md`,
          contextDir: `context/${slug}/`,
          name: areaName,
          description: description || null,
          meetingTitle: meetingTitle || null,
          qmd: qmdResult ?? { indexed: false, skipped: true },
        }, null, 2));
        return;
      }

      console.log('');
      success(`Area "${areaName}" created`);
      console.log('');
      listItem('Area file', `areas/${slug}.md`);
      listItem('Context dir', `context/${slug}/`);
      if (meetingTitle) {
        listItem('Recurring meeting', meetingTitle);
      }
      displayQmdResult(qmdResult);
      console.log('');
      info('Next: Edit the area file to add goals, current state, and backlog items.');
      console.log('');
    });
}
