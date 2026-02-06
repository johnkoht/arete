/**
 * People service – list, get, and index people from workspace person files.
 * Person files live under people/{internal|customers|users}/{slug}.md with optional frontmatter.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { WorkspacePaths } from '../types.js';
import type { Person, PersonCategory } from '../types.js';

const PEOPLE_CATEGORIES: PersonCategory[] = ['internal', 'customers', 'users'];
const INDEX_HEADER = `# People Index

People you work with: internal colleagues, customers, and users.

| Name | Category | Email | Role | Company / Team |
|------|----------|-------|------|----------------|
`;

/**
 * Generate a URL-safe slug from a name (e.g. "Jane Doe" -> "jane-doe").
 */
export function slugifyPersonName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unnamed';
}

/**
 * Parse frontmatter and body from a markdown file. Returns { frontmatter, body } or null if no frontmatter block.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    const body = match[2].trim();
    return { frontmatter, body };
  } catch {
    return null;
  }
}

/**
 * Read a single person file and return a Person if frontmatter has name and category.
 */
function readPersonFile(
  category: PersonCategory,
  slug: string,
  filePath: string
): Person | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;
  const { frontmatter } = parsed;
  const name = frontmatter.name;
  if (typeof name !== 'string' || !name.trim()) return null;
  const categoryFromFile = frontmatter.category as string | undefined;
  const resolvedCategory = categoryFromFile && PEOPLE_CATEGORIES.includes(categoryFromFile as PersonCategory)
    ? (categoryFromFile as PersonCategory)
    : category;
  return {
    slug,
    name: String(name).trim(),
    email: frontmatter.email != null ? String(frontmatter.email) : null,
    role: frontmatter.role != null ? String(frontmatter.role) : null,
    company: frontmatter.company != null ? String(frontmatter.company) : null,
    team: frontmatter.team != null ? String(frontmatter.team) : null,
    category: resolvedCategory
  };
}

/**
 * List all person markdown files in a category directory (excludes index.md and non-.md).
 */
function listPersonFilesInCategory(peopleDir: string, category: PersonCategory): string[] {
  const dir = join(peopleDir, category);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.md') && d.name !== 'index.md')
    .map((d) => d.name.replace(/\.md$/, ''));
}

export interface ListPeopleOptions {
  category?: PersonCategory;
}

/**
 * List all people in the workspace, optionally filtered by category.
 */
export function listPeople(
  paths: WorkspacePaths | null,
  options: ListPeopleOptions = {}
): Person[] {
  if (!paths?.people || !existsSync(paths.people)) return [];
  const { category } = options;
  const categories = category ? [category] : PEOPLE_CATEGORIES;
  const result: Person[] = [];
  const seenSlugs = new Set<string>();

  for (const cat of categories) {
    const slugs = listPersonFilesInCategory(paths.people, cat);
    for (const slug of slugs) {
      const filePath = join(paths.people, cat, `${slug}.md`);
      const person = readPersonFile(cat, slug, filePath);
      if (person) {
        const key = `${cat}:${slug}`;
        if (!seenSlugs.has(key)) {
          seenSlugs.add(key);
          result.push(person);
        }
      }
    }
  }

  result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return result;
}

/**
 * Get a person by category and slug. Returns null if not found.
 */
export function getPersonBySlug(
  paths: WorkspacePaths | null,
  category: PersonCategory,
  slug: string
): Person | null {
  if (!paths?.people) return null;
  const filePath = join(paths.people, category, `${slug}.md`);
  return readPersonFile(category, slug, filePath);
}

/**
 * Get a person by email (searches all categories). Returns null if not found.
 */
export function getPersonByEmail(paths: WorkspacePaths | null, email: string): Person | null {
  if (!paths?.people || !email?.trim()) return null;
  const normalizedEmail = email.trim().toLowerCase();
  for (const category of PEOPLE_CATEGORIES) {
    const slugs = listPersonFilesInCategory(paths.people, category);
    for (const slug of slugs) {
      const filePath = join(paths.people, category, `${slug}.md`);
      const person = readPersonFile(category, slug, filePath);
      if (person?.email?.toLowerCase() === normalizedEmail) return person;
    }
  }
  return null;
}

/**
 * Escape a cell for markdown table (no pipes, minimal newlines).
 */
function escapeTableCell(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s).replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
}

/**
 * Regenerate people/index.md from all person files.
 */
export function updatePeopleIndex(paths: WorkspacePaths | null): void {
  if (!paths?.people) return;
  const people = listPeople(paths);
  const indexPath = join(paths.people, 'index.md');

  if (people.length === 0) {
    const content = INDEX_HEADER + '| (none yet) | — | — | — | — |\n';
    mkdirSync(paths.people, { recursive: true });
    writeFileSync(indexPath, content, 'utf8');
    return;
  }

  const rows = people.map(
    (p) =>
      `| ${escapeTableCell(p.name)} | ${p.category} | ${escapeTableCell(p.email)} | ${escapeTableCell(p.role)} | ${escapeTableCell(p.company ?? p.team)} |`
  );
  const content = INDEX_HEADER + rows.join('\n') + '\n';
  mkdirSync(paths.people, { recursive: true });
  writeFileSync(indexPath, content, 'utf8');
}

export { PEOPLE_CATEGORIES };
