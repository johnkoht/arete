/**
 * People commands — list, show, index
 */

import {
  createServices,
  PEOPLE_CATEGORIES,
  type PersonCategory,
} from '@arete/core';
import type { Command } from 'commander';
import { join } from 'node:path';
import chalk from 'chalk';
import {
  header,
  section,
  listItem,
  error,
  info,
  formatPath,
} from '../formatters.js';

export function registerPeopleCommands(program: Command): void {
  const peopleCmd = program
    .command('people')
    .description('List and show people');

  peopleCmd
    .command('list')
    .description('List people in the workspace')
    .option('--category <name>', 'Filter: internal, customers, or users')
    .option('--json', 'Output as JSON')
    .action(async (opts: { category?: string; json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      if (!root) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
        } else {
          error('Not in an Areté workspace');
          info('Run "arete install" to create a workspace');
        }
        process.exit(1);
      }

      const paths = services.workspace.getPaths(root);
      const category = parseCategory(opts.category);
      const people = await services.entity.listPeople(paths, category ? { category } : {});

      if (opts.json) {
        console.log(JSON.stringify({ success: true, people, count: people.length }, null, 2));
        return;
      }

      header('People');
      if (people.length === 0) {
        info('No people files yet.');
        console.log(chalk.dim('  Add markdown files under people/internal/, people/customers/, or people/users/'));
        return;
      }

      console.log('');
      console.log(chalk.dim('  Name                    Slug                 Category   Email'));
      console.log(chalk.dim('  ' + '-'.repeat(80)));
      for (const p of people) {
        const name = (p.name + ' ').slice(0, 24).padEnd(24);
        const slug = (p.slug + ' ').slice(0, 20).padEnd(20);
        const cat = p.category.padEnd(10);
        const email = p.email ?? '—';
        console.log(`  ${name} ${slug} ${cat} ${email}`);
      }
      console.log('');
      listItem('Total', String(people.length));
      console.log('');
    });

  peopleCmd
    .command('show <slug-or-email>')
    .description('Show a person by slug or email')
    .option('--category <name>', 'Category when looking up by slug')
    .option('--memory', 'Include auto-generated memory highlights section')
    .option('--json', 'Output as JSON')
    .action(
      async (
        slugOrEmail: string,
        opts: { category?: string; memory?: boolean; json?: boolean },
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

        const paths = services.workspace.getPaths(root);
        const category = parseCategory(opts.category);
        let person = null;

        if (slugOrEmail.includes('@')) {
          person = await services.entity.getPersonByEmail(paths, slugOrEmail);
        } else if (category) {
          person = await services.entity.getPersonBySlug(
            paths,
            category,
            slugOrEmail,
          );
        } else {
          for (const cat of PEOPLE_CATEGORIES) {
            person = await services.entity.getPersonBySlug(
              paths,
              cat,
              slugOrEmail,
            );
            if (person) break;
          }
        }

        if (!person) {
          if (opts.json) {
            console.log(
              JSON.stringify({
                success: false,
                error: 'Person not found',
                slugOrEmail,
              }),
            );
          } else {
            error(`Person not found: ${slugOrEmail}`);
            if (!category) info('Try specifying --category internal|customers|users');
          }
          process.exit(1);
        }

        let memoryHighlights: string | null = null;
        if (opts.memory) {
          const personPath = join(paths.people, person.category, `${person.slug}.md`);
          const personContent = await services.storage.read(personPath);
          memoryHighlights = extractAutoPersonMemorySection(personContent);
        }

        if (opts.json) {
          console.log(JSON.stringify({ success: true, person, memoryHighlights }, null, 2));
          return;
        }

        section(person.name);
        listItem('Slug', person.slug);
        listItem('Category', person.category);
        if (person.email) listItem('Email', person.email);
        if (person.role) listItem('Role', person.role);
        if (person.team) listItem('Team', person.team);
        if (person.company) listItem('Company', person.company);
        console.log('');

        if (opts.memory) {
          if (memoryHighlights) {
            section('Memory Highlights (Auto)');
            console.log(memoryHighlights.trim());
            console.log('');
          } else {
            info('No auto memory highlights found for this person yet.');
            console.log('');
          }
        }

        listItem('File', formatPath(`people/${person.category}/${person.slug}.md`));
        console.log('');
      },
    );

  peopleCmd
    .command('index')
    .description('Regenerate people/index.md')
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
      await services.entity.buildPeopleIndex(paths);
      const people = await services.entity.listPeople(paths);

      if (opts.json) {
        console.log(
          JSON.stringify({
            success: true,
            path: `${paths.people}/index.md`,
            count: people.length,
          }),
        );
        return;
      }

      info(`Updated people/index.md with ${people.length} person(s).`);
    });

  const memoryCmd = peopleCmd
    .command('memory')
    .description('Person memory utilities');

  memoryCmd
    .command('refresh')
    .description('Refresh auto-generated person memory highlights from meetings')
    .option('--person <slug>', 'Refresh only one person by slug')
    .option('--min-mentions <n>', 'Minimum repeated mentions to include (default: 2)')
    .option('--if-stale-days <n>', 'Only refresh when Last refreshed is older than N days')
    .option('--json', 'Output as JSON')
    .action(async (opts: { person?: string; minMentions?: string; ifStaleDays?: string; json?: boolean }) => {
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
      const minMentionsParsed = opts.minMentions ? parseInt(opts.minMentions, 10) : undefined;
      const minMentions = typeof minMentionsParsed === 'number' && !isNaN(minMentionsParsed)
        ? minMentionsParsed
        : undefined;
      const ifStaleDaysParsed = opts.ifStaleDays ? parseInt(opts.ifStaleDays, 10) : undefined;
      const ifStaleDays = typeof ifStaleDaysParsed === 'number' && !isNaN(ifStaleDaysParsed)
        ? ifStaleDaysParsed
        : undefined;

      const result = await services.entity.refreshPersonMemory(paths, {
        personSlug: opts.person,
        minMentions,
        ifStaleDays,
      });

      if (opts.json) {
        console.log(JSON.stringify({ success: true, ...result }, null, 2));
        return;
      }

      info(`Refreshed person memory highlights for ${result.updated} person file(s).`);
      listItem('People scanned', String(result.scannedPeople));
      listItem('Meetings scanned', String(result.scannedMeetings));
      listItem('Skipped (fresh)', String(result.skippedFresh));
      console.log('');
    });
}

function extractAutoPersonMemorySection(content: string | null): string | null {
  if (!content) return null;
  const startMarker = '<!-- AUTO_PERSON_MEMORY:START -->';
  const endMarker = '<!-- AUTO_PERSON_MEMORY:END -->';
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end <= start) return null;

  const sectionStart = start + startMarker.length;
  const section = content.slice(sectionStart, end).trim();
  return section.length > 0 ? section : null;
}

function parseCategory(cat: string | undefined): PersonCategory | undefined {
  if (!cat) return undefined;
  const c = cat.toLowerCase();
  if (PEOPLE_CATEGORIES.includes(c as PersonCategory)) return c as PersonCategory;
  return undefined;
}
