/**
 * People commands – list, show, and regenerate people index
 */

import chalk from 'chalk';
import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import {
  listPeople,
  getPersonBySlug,
  getPersonByEmail,
  updatePeopleIndex,
  PEOPLE_CATEGORIES
} from '../core/people.js';
import { error, info, header, section, listItem, formatPath } from '../core/utils.js';
import type { CommandOptions } from '../types.js';
import type { PersonCategory } from '../types.js';

export interface PeopleListOptions extends CommandOptions {
  category?: string;
}

export interface PeopleShowOptions extends CommandOptions {
  category?: string;
}

function parseCategory(cat: string | undefined): PersonCategory | undefined {
  if (!cat) return undefined;
  const c = cat.toLowerCase();
  if (PEOPLE_CATEGORIES.includes(c as PersonCategory)) return c as PersonCategory;
  return undefined;
}

/**
 * arete people list [--category internal|customers|users] [--json]
 */
export async function peopleListCommand(options: PeopleListOptions): Promise<void> {
  const { json, category: categoryOpt } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const category = parseCategory(categoryOpt);
  const people = await listPeople(paths, category ? { category } : {});

  if (json) {
    console.log(JSON.stringify({ success: true, people, count: people.length }, null, 2));
    return;
  }

  header('People');
  if (people.length === 0) {
    info('No people files yet.');
    console.log(chalk.dim('  Add markdown files under people/internal/, people/customers/, or people/users/'));
    console.log(chalk.dim('  Example: people/internal/jane-doe.md with frontmatter (name, email, role, etc.)'));
    return;
  }

  console.log('');
  console.log(chalk.dim('  Name                    Category   Email'));
  console.log(chalk.dim('  ' + '-'.repeat(60)));
  for (const p of people) {
    const name = (p.name + ' ').slice(0, 24).padEnd(24);
    const cat = p.category.padEnd(10);
    const email = p.email ?? '—';
    console.log(`  ${name} ${cat} ${email}`);
  }
  console.log('');
  listItem('Total', String(people.length));
  console.log('');
}

/**
 * arete people show <slug|email> [--category internal|customers|users] [--json]
 */
export async function peopleShowCommand(
  slugOrEmail: string,
  options: PeopleShowOptions
): Promise<void> {
  const { json, category: categoryOpt } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  const category = parseCategory(categoryOpt);
  let person = null;

  if (slugOrEmail.includes('@')) {
    person = await getPersonByEmail(paths, slugOrEmail);
  } else if (category) {
    person = await getPersonBySlug(paths, category, slugOrEmail);
  } else {
    for (const cat of PEOPLE_CATEGORIES) {
      person = await getPersonBySlug(paths, cat, slugOrEmail);
      if (person) break;
    }
  }

  if (!person) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Person not found', slugOrEmail }));
    } else {
      error(`Person not found: ${slugOrEmail}`);
      if (!category) info('Try specifying --category internal|customers|users');
    }
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify({ success: true, person }, null, 2));
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
  listItem('File', formatPath(`people/${person.category}/${person.slug}.md`));
  console.log('');
}

/**
 * arete people index [--json] – regenerate people/index.md from person files
 */
export async function peopleIndexCommand(options: CommandOptions): Promise<void> {
  const { json } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
  }

  const paths = getWorkspacePaths(workspaceRoot);
  await updatePeopleIndex(paths);
  const people = await listPeople(paths);

  if (json) {
    console.log(
      JSON.stringify({
        success: true,
        path: `${paths.people}/index.md`,
        count: people.length
      })
    );
    return;
  }

  info(`Updated people/index.md with ${people.length} person(s).`);
}
