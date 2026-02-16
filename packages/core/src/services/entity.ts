/**
 * EntityService — resolves entity references, relationships, and people management.
 *
 * Ported from src/core/entity-resolution.ts and src/core/people.ts.
 * Uses StorageAdapter for all file I/O (no direct fs imports).
 */

import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type {
  EntityType,
  ResolvedEntity,
  EntityMention,
  EntityRelationship,
  Person,
  PersonCategory,
  WorkspacePaths,
} from '../models/index.js';

const PEOPLE_CATEGORIES: PersonCategory[] = ['internal', 'customers', 'users'];

const INDEX_HEADER = `# People Index

People you work with: internal colleagues, customers, and users.

| Name | Category | Email | Role | Company / Team |
|------|----------|-------|------|----------------|
`;

// ---------------------------------------------------------------------------
// Slugify (exported for compat)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyScore(reference: string, candidate: string): number {
  const refNorm = normalize(reference);
  const candNorm = normalize(candidate);

  if (!refNorm || !candNorm) return 0;
  if (refNorm === candNorm) return 100;

  const refSlug = refNorm.replace(/\s+/g, '-');
  const candSlug = candNorm.replace(/\s+/g, '-');
  if (refSlug === candSlug) return 90;
  if (candNorm.startsWith(refNorm)) return 70;
  if (refNorm.startsWith(candNorm)) return 60;

  const refWords = refNorm.split(' ').filter(w => w.length > 0);
  const candWords = candNorm.split(' ').filter(w => w.length > 0);
  const allFound = refWords.every(rw =>
    candWords.some(cw => cw.includes(rw) || rw.includes(cw))
  );
  if (allFound && refWords.length > 0) return 50;

  const matching = refWords.filter(rw =>
    candWords.some(cw => cw.includes(rw) || rw.includes(cw))
  );
  if (matching.length > 0) return 10 * matching.length;

  return 0;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Person resolution
// ---------------------------------------------------------------------------

async function resolvePerson(
  storage: StorageAdapter,
  reference: string,
  paths: WorkspacePaths
): Promise<ResolvedEntity[]> {
  const results: ResolvedEntity[] = [];
  const refSlug = slugifyPersonName(reference);
  const refLower = reference.toLowerCase().trim();

  for (const cat of PEOPLE_CATEGORIES) {
    const catDir = join(paths.people, cat);
    const exists = await storage.exists(catDir);
    if (!exists) continue;

    const filePaths = await storage.list(catDir, { extensions: ['.md'] });

    for (const filePath of filePaths) {
      const baseName = filePath.split(/[/\\]/).pop() ?? '';
      if (baseName === 'index.md') continue;

      const slug = baseName.replace(/\.md$/, '');

      const content = await storage.read(filePath);
      if (content == null) continue;

      const parsed = parseFrontmatter(content);
      if (!parsed) continue;

      const { frontmatter } = parsed;
      const name = typeof frontmatter.name === 'string' ? frontmatter.name : '';
      const email = typeof frontmatter.email === 'string' ? frontmatter.email : '';
      const role = typeof frontmatter.role === 'string' ? frontmatter.role : '';
      const company = typeof frontmatter.company === 'string' ? frontmatter.company : '';

      let bestScore = 0;
      bestScore = Math.max(bestScore, fuzzyScore(reference, name));
      bestScore = Math.max(bestScore, fuzzyScore(refSlug, slug));
      if (email && refLower === email.toLowerCase()) {
        bestScore = Math.max(bestScore, 95);
      }
      if (email && email.toLowerCase().startsWith(refLower + '@')) {
        bestScore = Math.max(bestScore, 60);
      }

      if (bestScore > 0) {
        results.push({
          type: 'person',
          path: filePath,
          name: name || slug,
          slug,
          metadata: {
            category: cat,
            email: email || undefined,
            role: role || undefined,
            company: company || undefined,
          },
          score: bestScore,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Meeting resolution
// ---------------------------------------------------------------------------

async function resolveMeeting(
  storage: StorageAdapter,
  reference: string,
  paths: WorkspacePaths
): Promise<ResolvedEntity[]> {
  const results: ResolvedEntity[] = [];
  const meetingsDir = join(paths.resources, 'meetings');
  const exists = await storage.exists(meetingsDir);
  if (!exists) return results;

  const filePaths = await storage.list(meetingsDir, { extensions: ['.md'] });
  const refNorm = normalize(reference);

  for (const filePath of filePaths) {
    const baseName = filePath.split(/[/\\]/).pop() ?? '';
    if (baseName === 'index.md') continue;

    const fileBase = baseName.replace(/\.md$/, '');
    let bestScore = fuzzyScore(reference, fileBase);

    let title = '';
    let date = '';
    let attendees = '';
    let attendeeIds: string[] = [];

    const content = await storage.read(filePath);
    if (content != null) {
      const parsed = parseFrontmatter(content);
      if (parsed) {
        const fm = parsed.frontmatter;
        title = typeof fm.title === 'string' ? fm.title : '';
        date = typeof fm.date === 'string' ? fm.date : '';
        attendees = typeof fm.attendees === 'string' ? fm.attendees : '';
        attendeeIds = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [];
      }
    }

    if (title) {
      bestScore = Math.max(bestScore, fuzzyScore(reference, title));
    }
    if (date && refNorm.includes(normalize(date))) {
      bestScore = Math.max(bestScore, 80);
    }
    if (attendees) {
      const attendeeScore = fuzzyScore(reference, attendees);
      if (attendeeScore > 0) {
        bestScore = Math.max(bestScore, Math.min(attendeeScore, 50));
      }
    }
    for (const aid of attendeeIds) {
      if (normalize(aid).includes(refNorm) || refNorm.includes(normalize(aid))) {
        bestScore = Math.max(bestScore, 40);
      }
    }

    if (bestScore > 0) {
      results.push({
        type: 'meeting',
        path: filePath,
        name: title || fileBase,
        slug: fileBase,
        metadata: {
          date,
          attendees,
          attendee_ids: attendeeIds,
        },
        score: bestScore,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Project resolution
// ---------------------------------------------------------------------------

async function resolveProject(
  storage: StorageAdapter,
  reference: string,
  paths: WorkspacePaths
): Promise<ResolvedEntity[]> {
  const results: ResolvedEntity[] = [];
  const projectBases = [
    { dir: join(paths.projects, 'active'), status: 'active' },
    { dir: join(paths.projects, 'archive'), status: 'archived' },
  ] as const;

  for (const { dir, status } of projectBases) {
    const exists = await storage.exists(dir);
    if (!exists) continue;

    const projectDirs = await storage.listSubdirectories(dir);

    for (const projDir of projectDirs) {
      const projName = projDir.split(/[/\\]/).pop() ?? '';
      const readmePath = join(projDir, 'README.md');

      let bestScore = fuzzyScore(reference, projName);
      let title = projName;
      let summary = '';

      const existsReadme = await storage.exists(readmePath);
      if (existsReadme) {
        const content = await storage.read(readmePath);
        if (content != null) {
          try {
            const titleMatch = content.match(/^#\s+(.+)/m);
            if (titleMatch) {
              title = titleMatch[1].trim();
              bestScore = Math.max(bestScore, fuzzyScore(reference, title));
            }
            const parsed = parseFrontmatter(content);
            if (parsed?.frontmatter.title) {
              const fmTitle = String(parsed.frontmatter.title);
              bestScore = Math.max(bestScore, fuzzyScore(reference, fmTitle));
            }
            const refWords = normalize(reference).split(' ').filter(w => w.length > 1);
            const bodyLower = content.toLowerCase();
            const bodyMatches = refWords.filter(w => bodyLower.includes(w));
            if (bodyMatches.length > 0 && bodyMatches.length >= refWords.length * 0.5) {
              bestScore = Math.max(bestScore, 10 * bodyMatches.length);
            }
            const lines = content.replace(/^---[\s\S]*?---\n?/, '').split('\n');
            const nonHeading = lines.filter(l => !l.startsWith('#') && l.trim().length > 0);
            summary = nonHeading.slice(0, 2).join(' ').trim().slice(0, 200);
          } catch {
            // use directory-name scoring only
          }
        }
      }

      if (bestScore > 0) {
        results.push({
          type: 'project',
          path: projDir,
          name: title,
          slug: projName,
          metadata: {
            status,
            summary: summary || undefined,
          },
          score: bestScore,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// People management helpers
// ---------------------------------------------------------------------------

function parseFrontmatterPeople(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    return { frontmatter, body: match[2].trim() };
  } catch {
    return null;
  }
}

async function readPersonFile(
  storage: StorageAdapter,
  category: PersonCategory,
  slug: string,
  filePath: string
): Promise<Person | null> {
  const exists = await storage.exists(filePath);
  if (!exists) return null;

  const content = await storage.read(filePath);
  if (content == null) return null;

  const parsed = parseFrontmatterPeople(content);
  if (!parsed) return null;

  const { frontmatter } = parsed;
  const name = frontmatter.name;
  if (typeof name !== 'string' || !name.trim()) return null;
  const categoryFromFile = frontmatter.category as string | undefined;
  const resolvedCategory =
    categoryFromFile && PEOPLE_CATEGORIES.includes(categoryFromFile as PersonCategory)
      ? (categoryFromFile as PersonCategory)
      : category;

  return {
    slug,
    name: String(name).trim(),
    email: frontmatter.email != null ? String(frontmatter.email) : null,
    role: frontmatter.role != null ? String(frontmatter.role) : null,
    company: frontmatter.company != null ? String(frontmatter.company) : null,
    team: frontmatter.team != null ? String(frontmatter.team) : null,
    category: resolvedCategory,
  };
}

async function listPersonFilesInCategory(
  storage: StorageAdapter,
  peopleDir: string,
  category: PersonCategory
): Promise<string[]> {
  const dir = join(peopleDir, category);
  const exists = await storage.exists(dir);
  if (!exists) return [];

  const filePaths = await storage.list(dir, { extensions: ['.md'] });
  return filePaths
    .map(fp => fp.split(/[/\\]/).pop() ?? '')
    .filter(name => name !== '' && name !== 'index.md')
    .map(name => name.replace(/\.md$/, ''));
}

function escapeTableCell(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s).replace(/\|/g, ' ').replace(/\r?\n/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// EntityService
// ---------------------------------------------------------------------------

export interface ListPeopleOptions {
  category?: PersonCategory;
}

export class EntityService {
  constructor(private storage: StorageAdapter) {}

  async resolve(
    reference: string,
    type: EntityType,
    workspacePaths: WorkspacePaths
  ): Promise<ResolvedEntity | null> {
    if (!reference?.trim()) return null;

    const candidates: ResolvedEntity[] = [];

    if (type === 'person' || type === 'any') {
      candidates.push(...(await resolvePerson(this.storage, reference, workspacePaths)));
    }
    if (type === 'meeting' || type === 'any') {
      candidates.push(...(await resolveMeeting(this.storage, reference, workspacePaths)));
    }
    if (type === 'project' || type === 'any') {
      candidates.push(...(await resolveProject(this.storage, reference, workspacePaths)));
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  async resolveAll(
    reference: string,
    type: EntityType,
    workspacePaths: WorkspacePaths,
    limit = 5
  ): Promise<ResolvedEntity[]> {
    if (!reference?.trim()) return [];

    const candidates: ResolvedEntity[] = [];

    if (type === 'person' || type === 'any') {
      candidates.push(...(await resolvePerson(this.storage, reference, workspacePaths)));
    }
    if (type === 'meeting' || type === 'any') {
      candidates.push(...(await resolveMeeting(this.storage, reference, workspacePaths)));
    }
    if (type === 'project' || type === 'any') {
      candidates.push(...(await resolveProject(this.storage, reference, workspacePaths)));
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, limit);
  }

  async findMentions(_entity: ResolvedEntity): Promise<EntityMention[]> {
    throw new Error('Not implemented');
  }

  async getRelationships(_entity: ResolvedEntity): Promise<EntityRelationship[]> {
    throw new Error('Not implemented');
  }

  async listPeople(
    workspacePaths: WorkspacePaths | null,
    options: ListPeopleOptions = {}
  ): Promise<Person[]> {
    if (!workspacePaths?.people) return [];
    const exists = await this.storage.exists(workspacePaths.people);
    if (!exists) return [];

    const { category } = options;
    const categories = category ? [category] : PEOPLE_CATEGORIES;
    const result: Person[] = [];
    const seenSlugs = new Set<string>();

    for (const cat of categories) {
      const slugs = await listPersonFilesInCategory(
        this.storage,
        workspacePaths.people,
        cat
      );
      for (const slug of slugs) {
        const filePath = join(workspacePaths.people, cat, `${slug}.md`);
        const person = await readPersonFile(this.storage, cat, slug, filePath);
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

  async showPerson(
    slugOrEmail: string,
    workspacePaths: WorkspacePaths | null
  ): Promise<Person | null> {
    if (!workspacePaths?.people) return null;

    if (slugOrEmail.includes('@')) {
      const normalizedEmail = slugOrEmail.trim().toLowerCase();
      for (const category of PEOPLE_CATEGORIES) {
        const slugs = await listPersonFilesInCategory(
          this.storage,
          workspacePaths.people,
          category
        );
        for (const slug of slugs) {
          const filePath = join(workspacePaths.people, category, `${slug}.md`);
          const person = await readPersonFile(this.storage, category, slug, filePath);
          if (person?.email?.toLowerCase() === normalizedEmail) return person;
        }
      }
      return null;
    }

    for (const category of PEOPLE_CATEGORIES) {
      const filePath = join(workspacePaths.people, category, `${slugOrEmail}.md`);
      const person = await readPersonFile(this.storage, category, slugOrEmail, filePath);
      if (person) return person;
    }
    return null;
  }

  async getPersonBySlug(
    workspacePaths: WorkspacePaths | null,
    category: PersonCategory,
    slug: string
  ): Promise<Person | null> {
    if (!workspacePaths?.people) return null;
    const filePath = join(workspacePaths.people, category, `${slug}.md`);
    return readPersonFile(this.storage, category, slug, filePath);
  }

  async getPersonByEmail(
    workspacePaths: WorkspacePaths | null,
    email: string
  ): Promise<Person | null> {
    if (!workspacePaths?.people || !email?.trim()) return null;
    const normalizedEmail = email.trim().toLowerCase();
    for (const category of PEOPLE_CATEGORIES) {
      const slugs = await listPersonFilesInCategory(
        this.storage,
        workspacePaths.people,
        category
      );
      for (const slug of slugs) {
        const filePath = join(workspacePaths.people, category, `${slug}.md`);
        const person = await readPersonFile(this.storage, category, slug, filePath);
        if (person?.email?.toLowerCase() === normalizedEmail) return person;
      }
    }
    return null;
  }

  async buildPeopleIndex(workspacePaths: WorkspacePaths | null): Promise<void> {
    if (!workspacePaths?.people) return;

    const people = await this.listPeople(workspacePaths);
    const indexPath = join(workspacePaths.people, 'index.md');

    if (people.length === 0) {
      const content = INDEX_HEADER + '| (none yet) | — | — | — | — |\n';
      await this.storage.mkdir(workspacePaths.people);
      await this.storage.write(indexPath, content);
      return;
    }

    const rows = people.map(
      p =>
        `| ${escapeTableCell(p.name)} | ${p.category} | ${escapeTableCell(p.email)} | ${escapeTableCell(p.role)} | ${escapeTableCell(p.company ?? p.team ?? null)} |`
    );
    const content = INDEX_HEADER + rows.join('\n') + '\n';
    await this.storage.mkdir(workspacePaths.people);
    await this.storage.write(indexPath, content);
  }
}

export { PEOPLE_CATEGORIES };
