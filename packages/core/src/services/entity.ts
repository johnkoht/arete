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
  MentionSourceType,
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
// Mention / relationship helpers
// ---------------------------------------------------------------------------

function getSourceType(filePath: string, paths: WorkspacePaths): MentionSourceType {
  const meetingsDir = join(paths.resources, 'meetings');
  if (filePath.startsWith(meetingsDir)) return 'meeting';
  if (filePath.startsWith(paths.memory)) return 'memory';
  if (filePath.startsWith(paths.projects)) return 'project';
  return 'context';
}

function extractExcerpt(content: string, entityName: string, chars = 50): string {
  const lowerContent = content.toLowerCase();
  const lowerName = entityName.toLowerCase();
  const idx = lowerContent.indexOf(lowerName);
  if (idx === -1) return '';
  const start = Math.max(0, idx - chars);
  const end = Math.min(content.length, idx + entityName.length + chars);
  let excerpt = content.slice(start, end).replace(/\r?\n/g, ' ').trim();
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';
  return excerpt;
}

function extractDateFromPath(filePath: string): string | undefined {
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

function extractDateFromContent(content: string): string | undefined {
  const fmMatch = content.match(/^---[\s\S]*?date:\s*["']?(\d{4}-\d{2}-\d{2})["']?[\s\S]*?---/);
  return fmMatch ? fmMatch[1] : undefined;
}

function contentContainsEntity(content: string, entityName: string, entitySlug?: string): boolean {
  const lower = content.toLowerCase();
  if (lower.includes(entityName.toLowerCase())) return true;
  if (entitySlug && lower.includes(entitySlug.toLowerCase())) return true;
  return false;
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

interface PersonMemorySignal {
  kind: 'ask' | 'concern';
  topic: string;
  date: string;
  source: string;
}

interface AggregatedPersonSignal {
  topic: string;
  count: number;
  lastMentioned: string;
  sources: string[];
}

interface RefreshPersonMemoryInternalOptions {
  personSlug?: string;
  minMentions: number;
}

const AUTO_PERSON_MEMORY_START = '<!-- AUTO_PERSON_MEMORY:START -->';
const AUTO_PERSON_MEMORY_END = '<!-- AUTO_PERSON_MEMORY:END -->';

function normalizeSignalTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/^[\s:;,.!?-]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .slice(0, 120);
}

function collectSignalsForPerson(
  content: string,
  personName: string,
  date: string,
  source: string,
): PersonMemorySignal[] {
  const signals: PersonMemorySignal[] = [];
  const lines = content.split('\n');
  const personLower = personName.toLowerCase();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();

    const mentionsPerson = lower.includes(personLower);
    if (!mentionsPerson) continue;

    const askMatch = trimmed.match(/\basked\s+(?:about|for|if)\s+(.+?)(?:[.?!]|$)/i);
    if (askMatch) {
      const topic = normalizeSignalTopic(askMatch[1]);
      if (topic.length > 2) {
        signals.push({ kind: 'ask', topic, date, source });
      }
    }

    const concernMatch = trimmed.match(/\b(?:concerned about|worried about|skeptical about|pushed back on)\s+(.+?)(?:[.?!]|$)/i);
    if (concernMatch) {
      const topic = normalizeSignalTopic(concernMatch[1]);
      if (topic.length > 2) {
        signals.push({ kind: 'concern', topic, date, source });
      }
    }

    const speakerMatch = trimmed.match(/^([^:]{2,80}):\s+(.+)$/);
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim().toLowerCase();
      const speech = speakerMatch[2].trim();
      const speechLower = speech.toLowerCase();
      if (!speaker.includes(personLower)) continue;

      const speakerAskMatch = speech.match(/\b(?:can we|could we|what about|how about)\s+(.+?)(?:[.?!]|$)/i);
      if (speakerAskMatch) {
        const topic = normalizeSignalTopic(speakerAskMatch[1]);
        if (topic.length > 2) {
          signals.push({ kind: 'ask', topic, date, source });
        }
      }

      if (speechLower.includes('concerned about') || speechLower.includes('worried about')) {
        const topic = normalizeSignalTopic(
          speech
            .replace(/.*\b(?:concerned about|worried about)\b/i, '')
            .replace(/[.?!].*$/, ''),
        );
        if (topic.length > 2) {
          signals.push({ kind: 'concern', topic, date, source });
        }
      }
    }
  }

  return signals;
}

function aggregateSignals(signals: PersonMemorySignal[], minMentions: number): {
  asks: AggregatedPersonSignal[];
  concerns: AggregatedPersonSignal[];
} {
  const asksByTopic = new Map<string, AggregatedPersonSignal>();
  const concernsByTopic = new Map<string, AggregatedPersonSignal>();

  for (const signal of signals) {
    const targetMap = signal.kind === 'ask' ? asksByTopic : concernsByTopic;
    const existing = targetMap.get(signal.topic);
    if (!existing) {
      targetMap.set(signal.topic, {
        topic: signal.topic,
        count: 1,
        lastMentioned: signal.date,
        sources: [signal.source],
      });
      continue;
    }

    existing.count += 1;
    if (signal.date > existing.lastMentioned) {
      existing.lastMentioned = signal.date;
    }
    if (!existing.sources.includes(signal.source)) {
      existing.sources.push(signal.source);
    }
  }

  const toSorted = (m: Map<string, AggregatedPersonSignal>): AggregatedPersonSignal[] =>
    [...m.values()]
      .filter((item) => item.count >= minMentions)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastMentioned.localeCompare(a.lastMentioned);
      });

  return {
    asks: toSorted(asksByTopic),
    concerns: toSorted(concernsByTopic),
  };
}

function renderPersonMemorySection(
  asks: AggregatedPersonSignal[],
  concerns: AggregatedPersonSignal[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    AUTO_PERSON_MEMORY_START,
    '## Memory Highlights (Auto)',
    '',
    '> Auto-generated from meeting notes/transcripts. Do not edit manually.',
    '',
    `Last refreshed: ${today}`,
    '',
    '### Repeated asks',
  ];

  if (asks.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of asks.slice(0, 8)) {
      lines.push(
        `- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`,
      );
    }
  }

  lines.push('', '### Repeated concerns');
  if (concerns.length === 0) {
    lines.push('- None detected yet.');
  } else {
    for (const item of concerns.slice(0, 8)) {
      lines.push(
        `- **${item.topic}** — mentioned ${item.count} times (last: ${item.lastMentioned}; sources: ${item.sources.slice(0, 3).join(', ')})`,
      );
    }
  }

  lines.push('', AUTO_PERSON_MEMORY_END, '');
  return lines.join('\n');
}

function upsertPersonMemorySection(content: string, section: string): string {
  const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
  const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = content.slice(0, startIndex).trimEnd();
    const after = content.slice(endIndex + AUTO_PERSON_MEMORY_END.length).trimStart();
    const joined = `${before}\n\n${section.trim()}\n\n${after}`.trimEnd();
    return joined + '\n';
  }

  const trimmed = content.trimEnd();
  return `${trimmed}\n\n${section.trim()}\n`;
}

// ---------------------------------------------------------------------------
// EntityService
// ---------------------------------------------------------------------------

export interface ListPeopleOptions {
  category?: PersonCategory;
}

export interface RefreshPersonMemoryOptions {
  personSlug?: string;
  minMentions?: number;
}

export interface RefreshPersonMemoryResult {
  updated: number;
  scannedPeople: number;
  scannedMeetings: number;
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

  async findMentions(entity: ResolvedEntity, workspacePaths: WorkspacePaths): Promise<EntityMention[]> {
    const mentions: EntityMention[] = [];
    const entityName = entity.name;
    const entitySlug = entity.slug;

    const scanDirs: Array<{ dir: string; recursive: boolean }> = [
      { dir: workspacePaths.context, recursive: true },
      { dir: join(workspacePaths.resources, 'meetings'), recursive: false },
      { dir: join(workspacePaths.memory, 'items'), recursive: false },
    ];

    // Scan fixed directories
    for (const { dir, recursive } of scanDirs) {
      const exists = await this.storage.exists(dir);
      if (!exists) continue;

      const filePaths = await this.storage.list(dir, { extensions: ['.md'], recursive });
      for (const filePath of filePaths) {
        const content = await this.storage.read(filePath);
        if (content == null) continue;
        if (!contentContainsEntity(content, entityName, entitySlug)) continue;

        const excerpt = extractExcerpt(content, entityName);
        if (!excerpt) continue;

        const sourceType = getSourceType(filePath, workspacePaths);
        const date = extractDateFromPath(filePath) ?? extractDateFromContent(content);

        mentions.push({
          entity: entityName,
          entityType: entity.type,
          sourcePath: filePath,
          sourceType,
          excerpt,
          date,
        });
      }
    }

    // Scan project directories (projects/active/*)
    const activeDir = join(workspacePaths.projects, 'active');
    const activeExists = await this.storage.exists(activeDir);
    if (activeExists) {
      const projectDirs = await this.storage.listSubdirectories(activeDir);
      for (const projDir of projectDirs) {
        const projFiles = await this.storage.list(projDir, { extensions: ['.md'], recursive: true });
        for (const filePath of projFiles) {
          const content = await this.storage.read(filePath);
          if (content == null) continue;
          if (!contentContainsEntity(content, entityName, entitySlug)) continue;

          const excerpt = extractExcerpt(content, entityName);
          if (!excerpt) continue;

          const date = extractDateFromPath(filePath) ?? extractDateFromContent(content);

          mentions.push({
            entity: entityName,
            entityType: entity.type,
            sourcePath: filePath,
            sourceType: 'project',
            excerpt,
            date,
          });
        }
      }
    }

    // Sort by date (newest first), undated last
    mentions.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    return mentions;
  }

  async getRelationships(entity: ResolvedEntity, workspacePaths: WorkspacePaths): Promise<EntityRelationship[]> {
    const relationships: EntityRelationship[] = [];
    const entityName = entity.name;
    const entitySlug = entity.slug;

    // 1. works_on: Scan project README files for team/owner sections
    const activeDir = join(workspacePaths.projects, 'active');
    const activeExists = await this.storage.exists(activeDir);
    if (activeExists) {
      const projectDirs = await this.storage.listSubdirectories(activeDir);
      for (const projDir of projectDirs) {
        const readmePath = join(projDir, 'README.md');
        const readmeExists = await this.storage.exists(readmePath);
        if (!readmeExists) continue;

        const content = await this.storage.read(readmePath);
        if (content == null) continue;

        const projName = projDir.split(/[/\\]/).pop() ?? '';
        const titleMatch = content.match(/^#\s+(.+)/m);
        const projectTitle = titleMatch ? titleMatch[1].trim() : projName;

        if (this.matchesTeamOrOwner(content, entityName, entitySlug)) {
          relationships.push({
            from: entityName,
            fromType: entity.type,
            to: projectTitle,
            toType: 'project',
            type: 'works_on',
            evidence: readmePath,
          });
        }
      }
    }

    // 2. attended: Scan meeting files for attendees
    const meetingsDir = join(workspacePaths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    if (meetingsExist) {
      const meetingFiles = await this.storage.list(meetingsDir, { extensions: ['.md'] });
      for (const filePath of meetingFiles) {
        const baseName = filePath.split(/[/\\]/).pop() ?? '';
        if (baseName === 'index.md') continue;

        const content = await this.storage.read(filePath);
        if (content == null) continue;

        const parsed = parseFrontmatter(content);
        const meetingTitle = parsed?.frontmatter.title
          ? String(parsed.frontmatter.title)
          : baseName.replace(/\.md$/, '');

        if (this.matchesAttendee(content, parsed, entityName, entitySlug)) {
          relationships.push({
            from: entityName,
            fromType: entity.type,
            to: meetingTitle,
            toType: 'meeting',
            type: 'attended',
            evidence: filePath,
          });
        }
      }
    }

    // 3. mentioned_in: Convert findMentions results to relationships
    const mentions = await this.findMentions(entity, workspacePaths);
    for (const mention of mentions) {
      const sourceName = mention.sourcePath.split(/[/\\]/).pop()?.replace(/\.md$/, '') ?? mention.sourcePath;
      relationships.push({
        from: entityName,
        fromType: entity.type,
        to: sourceName,
        toType: mention.sourceType === 'meeting' ? 'meeting' : 'project',
        type: 'mentioned_in',
        evidence: mention.sourcePath,
      });
    }

    return relationships;
  }

  /**
   * Check if content has team/owner sections mentioning the entity.
   */
  private matchesTeamOrOwner(content: string, entityName: string, entitySlug?: string): boolean {
    const lower = content.toLowerCase();
    const nameLower = entityName.toLowerCase();
    const slugLower = entitySlug?.toLowerCase();

    // Check frontmatter fields: owner, team
    const parsed = parseFrontmatter(content);
    if (parsed) {
      const fm = parsed.frontmatter;
      const owner = typeof fm.owner === 'string' ? fm.owner.toLowerCase() : '';
      const team = typeof fm.team === 'string' ? fm.team.toLowerCase() : '';
      if (owner && (owner.includes(nameLower) || (slugLower && owner.includes(slugLower)))) return true;
      if (team && (team.includes(nameLower) || (slugLower && team.includes(slugLower)))) return true;
    }

    // Check for "Owner:" or "Team:" lines in body
    const ownerPattern = /(?:^|\n)\s*(?:owner|lead):\s*(.+)/gi;
    let match: RegExpExecArray | null;
    while ((match = ownerPattern.exec(content)) !== null) {
      const value = match[1].toLowerCase();
      if (value.includes(nameLower) || (slugLower && value.includes(slugLower))) return true;
    }

    const teamPattern = /(?:^|\n)##\s*team\b[^\n]*\n([\s\S]*?)(?=\n##\s|\n---|$)/gi;
    while ((match = teamPattern.exec(content)) !== null) {
      const section = match[1].toLowerCase();
      if (section.includes(nameLower) || (slugLower && section.includes(slugLower))) return true;
    }

    // Check for "Team:" inline pattern
    const teamLinePattern = /(?:^|\n)\s*team:\s*(.+)/gi;
    while ((match = teamLinePattern.exec(content)) !== null) {
      const value = match[1].toLowerCase();
      if (value.includes(nameLower) || (slugLower && value.includes(slugLower))) return true;
    }

    return false;
  }

  /**
   * Check if meeting content/frontmatter has this entity as an attendee.
   */
  private matchesAttendee(
    content: string,
    parsed: ParsedFrontmatter | null,
    entityName: string,
    entitySlug?: string,
  ): boolean {
    const nameLower = entityName.toLowerCase();
    const slugLower = entitySlug?.toLowerCase();

    // Check frontmatter attendees (string)
    if (parsed) {
      const fm = parsed.frontmatter;
      const attendeesStr = typeof fm.attendees === 'string' ? fm.attendees.toLowerCase() : '';
      if (attendeesStr && (attendeesStr.includes(nameLower) || (slugLower && attendeesStr.includes(slugLower)))) {
        return true;
      }

      // Check frontmatter attendee_ids (array)
      const attendeeIds = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [];
      for (const aid of attendeeIds) {
        const aidLower = aid.toLowerCase();
        if (aidLower === nameLower || aidLower === slugLower) return true;
        if (aidLower.includes(nameLower) || (slugLower && aidLower.includes(slugLower))) return true;
      }

      // Check frontmatter attendees (array)
      const attendeesList = Array.isArray(fm.attendees) ? fm.attendees.map(String) : [];
      for (const att of attendeesList) {
        const attLower = att.toLowerCase();
        if (attLower === nameLower || attLower === slugLower) return true;
        if (attLower.includes(nameLower) || (slugLower && attLower.includes(slugLower))) return true;
      }
    }

    // Check for "Attendees:" line in body
    const attendeePattern = /(?:^|\n)\s*attendees?:\s*(.+)/gi;
    let match: RegExpExecArray | null;
    while ((match = attendeePattern.exec(content)) !== null) {
      const value = match[1].toLowerCase();
      if (value.includes(nameLower) || (slugLower && value.includes(slugLower))) return true;
    }

    return false;
  }

  async refreshPersonMemory(
    workspacePaths: WorkspacePaths | null,
    options: RefreshPersonMemoryOptions = {},
  ): Promise<RefreshPersonMemoryResult> {
    if (!workspacePaths?.people) {
      return { updated: 0, scannedPeople: 0, scannedMeetings: 0 };
    }

    const internalOptions: RefreshPersonMemoryInternalOptions = {
      personSlug: options.personSlug,
      minMentions: options.minMentions && options.minMentions > 0
        ? options.minMentions
        : 2,
    };

    const people = await this.listPeople(workspacePaths);
    const filteredPeople = internalOptions.personSlug
      ? people.filter((p) => p.slug === internalOptions.personSlug)
      : people;

    const meetingsDir = join(workspacePaths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    const meetingFiles = meetingsExist
      ? (await this.storage.list(meetingsDir, { extensions: ['.md'] }))
          .filter((p) => (p.split(/[/\\]/).pop() ?? '') !== 'index.md')
      : [];

    const personSignals = new Map<string, PersonMemorySignal[]>();
    for (const person of filteredPeople) {
      personSignals.set(person.slug, []);
    }

    for (const meetingPath of meetingFiles) {
      const content = await this.storage.read(meetingPath);
      if (!content) continue;

      const parsed = parseFrontmatter(content);
      const fromFilename = extractDateFromPath(meetingPath);
      const dateFromFrontmatter = parsed?.frontmatter.date;
      const date = typeof dateFromFrontmatter === 'string'
        ? dateFromFrontmatter.slice(0, 10)
        : (fromFilename ?? new Date().toISOString().slice(0, 10));

      const source = meetingPath.split(/[/\\]/).pop() ?? meetingPath;
      const attendeeIds = parsed && Array.isArray(parsed.frontmatter.attendee_ids)
        ? parsed.frontmatter.attendee_ids.map(String)
        : [];

      const attendeesRaw = parsed?.frontmatter.attendees;
      const attendeeNames = Array.isArray(attendeesRaw)
        ? attendeesRaw.map(String).map((s) => s.toLowerCase())
        : typeof attendeesRaw === 'string'
          ? attendeesRaw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)
          : [];

      for (const person of filteredPeople) {
        const signals = personSignals.get(person.slug);
        if (!signals) continue;

        const inAttendeeIds = attendeeIds.includes(person.slug);
        const nameLower = person.name.toLowerCase();
        const inAttendeeNames = attendeeNames.some((n) => n.includes(nameLower));
        const mentionedInBody = content.toLowerCase().includes(nameLower);
        if (!inAttendeeIds && !inAttendeeNames && !mentionedInBody) continue;

        signals.push(...collectSignalsForPerson(content, person.name, date, source));
      }
    }

    let updated = 0;
    for (const person of filteredPeople) {
      const category = person.category;
      const personPath = join(workspacePaths.people, category, `${person.slug}.md`);
      const content = await this.storage.read(personPath);
      if (!content) continue;

      const signals = personSignals.get(person.slug) ?? [];
      const aggregated = aggregateSignals(signals, internalOptions.minMentions);
      const section = renderPersonMemorySection(aggregated.asks, aggregated.concerns);
      const nextContent = upsertPersonMemorySection(content, section);
      if (nextContent !== content) {
        await this.storage.write(personPath, nextContent);
        updated += 1;
      }
    }

    return {
      updated,
      scannedPeople: filteredPeople.length,
      scannedMeetings: meetingFiles.length,
    };
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
