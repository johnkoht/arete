/**
 * EntityService — resolves entity references, relationships, and people management.
 *
 * Ported from src/core/entity-resolution.ts and src/core/people.ts.
 * Uses StorageAdapter for all file I/O (no direct fs imports).
 */

import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type {
  EntityType,
  ResolvedEntity,
  EntityMention,
  EntityRelationship,
  MentionSourceType,
  Person,
  PersonCategory,
  PeopleIntelligenceCandidate,
  PeopleIntelligenceDigest,
  PeopleIntelligenceEvidence,
  PeopleIntelligenceFeatureToggles,
  PeopleIntelligenceMetrics,
  PeopleIntelligencePolicy,
  PeopleIntelligenceSnapshot,
  PeopleIntelligenceSuggestion,
  PersonAffiliation,
  PersonRoleLens,
  TrackingIntent,
  WorkspacePaths,
} from '../models/index.js';

const PEOPLE_CATEGORIES: PersonCategory[] = ['internal', 'customers', 'users'];

/**
 * Maximum number of results to request from SearchProvider when pre-filtering
 * meeting candidates for a person. If the provider returns this many results,
 * the index may be incomplete — we fall back to a full scan.
 */
const SEARCH_PROVIDER_CANDIDATE_LIMIT = 100;

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
  const conversationsDir = join(paths.resources, 'conversations');
  // Use trailing '/' to prevent prefix collisions (e.g. 'meetings-archive' matching 'meetings')
  if (filePath.startsWith(meetingsDir + '/')) return 'meeting';
  if (filePath.startsWith(conversationsDir + '/')) return 'conversation';
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

function extractPersonMemorySection(content: string): string | null {
  const startIndex = content.indexOf(AUTO_PERSON_MEMORY_START);
  const endIndex = content.indexOf(AUTO_PERSON_MEMORY_END);
  if (startIndex < 0 || endIndex <= startIndex) return null;

  const start = startIndex + AUTO_PERSON_MEMORY_START.length;
  const section = content.slice(start, endIndex).trim();
  return section.length > 0 ? section : null;
}

function getPersonMemoryLastRefreshed(content: string): string | null {
  const section = extractPersonMemorySection(content);
  if (!section) return null;

  const match = section.match(/Last refreshed:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

function isMemoryStale(lastRefreshed: string | null, ifStaleDays: number | undefined): boolean {
  if (!ifStaleDays || ifStaleDays <= 0) return true;
  if (!lastRefreshed) return true;

  const refreshedAt = new Date(lastRefreshed);
  if (Number.isNaN(refreshedAt.getTime())) return true;

  const now = new Date();
  const diffMs = now.getTime() - refreshedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= ifStaleDays;
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
  ifStaleDays?: number;
}

export interface RefreshPersonMemoryResult {
  updated: number;
  scannedPeople: number;
  scannedMeetings: number;
  skippedFresh: number;
  /** Number of conversation files scanned. Optional for backward compatibility. */
  scannedConversations?: number;
}

export interface PeopleIntelligenceOptions {
  confidenceThreshold?: number;
  internalDomains?: string[];
  defaultTrackingIntent?: TrackingIntent;
  features?: Partial<PeopleIntelligenceFeatureToggles>;
  extractionQualityScore?: number | null;
}

const DEFAULT_FEATURE_TOGGLES: PeopleIntelligenceFeatureToggles = {
  enableExtractionTuning: false,
  enableEnrichment: false,
};

const DEFAULT_POLICY: PeopleIntelligencePolicy = {
  confidenceThreshold: 0.65,
  defaultTrackingIntent: 'track',
  features: DEFAULT_FEATURE_TOGGLES,
};

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizePolicy(input: unknown): PeopleIntelligencePolicy {
  if (!input || typeof input !== 'object') return DEFAULT_POLICY;

  const maybe = input as Record<string, unknown>;
  const thresholdRaw = toNumber(maybe.confidenceThreshold);
  const threshold = thresholdRaw == null ? DEFAULT_POLICY.confidenceThreshold : Math.min(0.95, Math.max(0.05, thresholdRaw));

  const tracking = maybe.defaultTrackingIntent;
  const defaultTrackingIntent: TrackingIntent =
    tracking === 'track' || tracking === 'defer' || tracking === 'ignore'
      ? tracking
      : DEFAULT_POLICY.defaultTrackingIntent;

  const featuresRaw = maybe.features;
  const featuresObj = featuresRaw && typeof featuresRaw === 'object'
    ? (featuresRaw as Record<string, unknown>)
    : {};

  return {
    confidenceThreshold: threshold,
    defaultTrackingIntent,
    features: {
      enableExtractionTuning:
        typeof featuresObj.enableExtractionTuning === 'boolean'
          ? featuresObj.enableExtractionTuning
          : DEFAULT_FEATURE_TOGGLES.enableExtractionTuning,
      enableEnrichment:
        typeof featuresObj.enableEnrichment === 'boolean'
          ? featuresObj.enableEnrichment
          : DEFAULT_FEATURE_TOGGLES.enableEnrichment,
    },
  };
}

function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return match ? match[1] : null;
}

function detectRoleLens(text: string): PersonRoleLens {
  const lower = text.toLowerCase();
  if (/(customer|buyer|prospect|account|renewal|deal)/.test(lower)) return 'customer';
  if (/(user interview|usability|participant|beta user|end user|persona)/.test(lower)) return 'user';
  if (/(partner|reseller|alliance|integrator)/.test(lower)) return 'partner';
  return 'unknown';
}

function computeTriageBurdenMinutes(unknownQueueCount: number): number {
  if (unknownQueueCount <= 0) return 0;
  return Math.max(5, Math.ceil(unknownQueueCount / 5) * 5);
}

function deriveCategory(
  affiliation: PersonAffiliation,
  roleLens: PersonRoleLens,
): PersonCategory | 'unknown_queue' {
  if (affiliation === 'internal') return 'internal';
  if (roleLens === 'customer') return 'customers';
  if (roleLens === 'user') return 'users';
  return 'unknown_queue';
}

function buildRationale(
  affiliation: PersonAffiliation,
  roleLens: PersonRoleLens,
  evidenceCount: number,
  confidence: number,
): string {
  const parts = [
    `Affiliation: ${affiliation}`,
    `Role lens: ${roleLens}`,
    `Evidence items: ${evidenceCount}`,
    `Confidence: ${confidence.toFixed(2)}`,
  ];
  return parts.join(' | ');
}

export class EntityService {
  constructor(private storage: StorageAdapter, private searchProvider?: SearchProvider) {}

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
      { dir: join(workspacePaths.resources, 'conversations'), recursive: false },
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
      return { updated: 0, scannedPeople: 0, scannedMeetings: 0, skippedFresh: 0 };
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

    const refreshablePeople: Person[] = [];
    let skippedFresh = 0;
    for (const person of filteredPeople) {
      const personPath = join(workspacePaths.people, person.category, `${person.slug}.md`);
      const content = await this.storage.read(personPath);
      if (!content) continue;

      const lastRefreshed = getPersonMemoryLastRefreshed(content);
      const stale = isMemoryStale(lastRefreshed, options.ifStaleDays);
      if (!stale) {
        skippedFresh += 1;
        continue;
      }
      refreshablePeople.push(person);
    }

    const meetingsDir = join(workspacePaths.resources, 'meetings');
    const meetingsExist = await this.storage.exists(meetingsDir);
    const meetingFiles = meetingsExist
      ? (await this.storage.list(meetingsDir, { extensions: ['.md'] }))
          .filter((p) => (p.split(/[/\\]/).pop() ?? '') !== 'index.md')
      : [];

    const personSignals = new Map<string, PersonMemorySignal[]>();
    for (const person of refreshablePeople) {
      personSignals.set(person.slug, []);
    }

    // Meeting content cache — keyed by normalized absolute path so that the
    // same physical file is read at most once, regardless of whether the path
    // came from storage.list() (absolute) or SearchProvider (possibly relative).
    const meetingContentCache = new Map<string, string | null>();

    // Pre-compute per-person meeting file candidates (SearchProvider pre-filter).
    // CRITICAL invariant: if SearchProvider returns 0 results for a person,
    // fall back to the full meetingFiles list — never skip scanning entirely.
    const personCandidateMeetings = new Map<string, string[]>();
    for (const person of refreshablePeople) {
      if (this.searchProvider) {
        const results = await this.searchProvider.semanticSearch(person.name, {
          limit: SEARCH_PROVIDER_CANDIDATE_LIMIT,
        });
        // If the provider hit the limit, the index may be incomplete — fall back to full scan.
        if (results.length > 0 && results.length < SEARCH_PROVIDER_CANDIDATE_LIMIT) {
          // Normalize paths: SearchProvider may return relative paths (e.g. from qmd
          // running with cwd: workspaceRoot). resolve() is a no-op for absolute paths.
          personCandidateMeetings.set(
            person.slug,
            results.map((r) => resolve(workspacePaths.root, r.path)),
          );
        } else {
          // 0 results (person not indexed yet) OR limit hit (incomplete) → full scan
          personCandidateMeetings.set(person.slug, meetingFiles);
        }
      } else {
        personCandidateMeetings.set(person.slug, meetingFiles);
      }
    }

    for (const person of refreshablePeople) {
      const signals = personSignals.get(person.slug);
      if (!signals) continue;

      const candidatePaths = personCandidateMeetings.get(person.slug) ?? meetingFiles;

      for (const meetingPath of candidatePaths) {
        // Cache lookup — normalized absolute path as key
        const normalizedPath = resolve(workspacePaths.root, meetingPath);
        let content: string | null | undefined;
        if (meetingContentCache.has(normalizedPath)) {
          content = meetingContentCache.get(normalizedPath);
        } else {
          content = await this.storage.read(normalizedPath);
          meetingContentCache.set(normalizedPath, content ?? null);
        }
        if (!content) continue;

        // parseFrontmatter is called once per person × meeting pair — O(people × meetings)
        // in the worst case. The meetingContentCache above reduces storage.read() to O(meetings),
        // but the parse itself still repeats for meetings shared across multiple people's candidate
        // lists. parseFrontmatter is a regex + YAML parse and is fast in practice; a parsed-result
        // cache would reduce this to O(meetings) if workspaces grow large enough to matter.
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

        const inAttendeeIds = attendeeIds.includes(person.slug);
        const nameLower = person.name.toLowerCase();
        const inAttendeeNames = attendeeNames.some((n) => n.includes(nameLower));
        const mentionedInBody = content.toLowerCase().includes(nameLower);
        if (!inAttendeeIds && !inAttendeeNames && !mentionedInBody) continue;

        signals.push(...collectSignalsForPerson(content, person.name, date, source));
      }
    }

    // Scan conversation files — full body scan (no participant_ids dependency)
    const conversationsDir = join(workspacePaths.resources, 'conversations');
    const conversationsExist = await this.storage.exists(conversationsDir);
    const conversationFiles = conversationsExist
      ? (await this.storage.list(conversationsDir, { extensions: ['.md'] }))
          .filter((p) => (p.split(/[/\\]/).pop() ?? '') !== 'index.md')
      : [];

    for (const convPath of conversationFiles) {
      const content = await this.storage.read(convPath);
      if (!content) continue;

      const parsed = parseFrontmatter(content);
      const fromFilename = extractDateFromPath(convPath);
      const dateFromFrontmatter = parsed?.frontmatter.date;
      const date = typeof dateFromFrontmatter === 'string'
        ? dateFromFrontmatter.slice(0, 10)
        : (fromFilename ?? new Date().toISOString().slice(0, 10));

      const source = convPath.split(/[/\\]/).pop() ?? convPath;

      for (const person of refreshablePeople) {
        const signals = personSignals.get(person.slug);
        if (!signals) continue;

        const nameLower = person.name.toLowerCase();
        const mentionedInBody = content.toLowerCase().includes(nameLower);
        if (!mentionedInBody) continue;

        signals.push(...collectSignalsForPerson(content, person.name, date, source));
      }
    }

    let updated = 0;
    for (const person of refreshablePeople) {
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
      scannedConversations: conversationFiles.length,
      skippedFresh,
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

  async loadPeopleIntelligencePolicy(
    workspacePaths: WorkspacePaths | null,
  ): Promise<PeopleIntelligencePolicy> {
    if (!workspacePaths) return DEFAULT_POLICY;

    const policyPath = join(workspacePaths.context, 'people-intelligence-policy.json');
    const policyContent = await this.storage.read(policyPath);
    if (!policyContent) return DEFAULT_POLICY;

    try {
      const parsed = JSON.parse(policyContent) as unknown;
      return sanitizePolicy(parsed);
    } catch {
      return DEFAULT_POLICY;
    }
  }

  private mergePeopleIntelligencePolicy(
    policy: PeopleIntelligencePolicy,
    options: PeopleIntelligenceOptions,
  ): PeopleIntelligencePolicy {
    const confidenceThreshold = options.confidenceThreshold ?? policy.confidenceThreshold;
    const defaultTrackingIntent = options.defaultTrackingIntent ?? policy.defaultTrackingIntent;
    const features = {
      enableExtractionTuning:
        options.features?.enableExtractionTuning ?? policy.features.enableExtractionTuning,
      enableEnrichment:
        options.features?.enableEnrichment ?? policy.features.enableEnrichment,
    };

    return {
      confidenceThreshold,
      defaultTrackingIntent,
      features,
    };
  }

  async savePeopleIntelligenceSnapshot(
    workspacePaths: WorkspacePaths | null,
    digest: PeopleIntelligenceDigest,
  ): Promise<void> {
    if (!workspacePaths) return;

    const metricsDir = join(workspacePaths.memory, 'metrics');
    await this.storage.mkdir(metricsDir);
    const snapshotPath = join(metricsDir, 'people-intelligence.jsonl');

    const existing = (await this.storage.read(snapshotPath)) ?? '';
    const lines = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(-49);

    const snapshot: PeopleIntelligenceSnapshot = {
      createdAt: new Date().toISOString(),
      metrics: digest.metrics,
      totalCandidates: digest.totalCandidates,
      unknownQueueCount: digest.unknownQueueCount,
    };

    lines.push(JSON.stringify(snapshot));
    await this.storage.write(snapshotPath, lines.join('\n') + '\n');
  }

  async getRecentPeopleIntelligenceSnapshots(
    workspacePaths: WorkspacePaths | null,
    limit = 8,
  ): Promise<PeopleIntelligenceSnapshot[]> {
    if (!workspacePaths) return [];

    const snapshotPath = join(workspacePaths.memory, 'metrics', 'people-intelligence.jsonl');
    const content = await this.storage.read(snapshotPath);
    if (!content) return [];

    const parsed: PeopleIntelligenceSnapshot[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const candidate = JSON.parse(trimmed) as Partial<PeopleIntelligenceSnapshot>;
        if (
          typeof candidate.createdAt === 'string' &&
          candidate.metrics &&
          typeof candidate.totalCandidates === 'number' &&
          typeof candidate.unknownQueueCount === 'number'
        ) {
          parsed.push(candidate as PeopleIntelligenceSnapshot);
        }
      } catch {
        // ignore malformed lines
      }
    }

    return parsed.slice(-limit);
  }

  async suggestPeopleIntelligence(
    candidates: PeopleIntelligenceCandidate[],
    workspacePaths: WorkspacePaths | null,
    options: PeopleIntelligenceOptions = {},
  ): Promise<PeopleIntelligenceDigest> {
    const loadedPolicy = await this.loadPeopleIntelligencePolicy(workspacePaths);
    const policy = this.mergePeopleIntelligencePolicy(loadedPolicy, options);

    const confidenceThreshold = policy.confidenceThreshold;
    const defaultTrackingIntent = policy.defaultTrackingIntent;

    const domains = new Set<string>((options.internalDomains ?? []).map(normalizeDomain));

    if (workspacePaths) {
      const profilePath = join(workspacePaths.context, 'profile.md');
      const profileContent = await this.storage.read(profilePath);
      const profileParsed = profileContent ? parseFrontmatter(profileContent) : null;
      const profileEmail = profileParsed && typeof profileParsed.frontmatter.email === 'string'
        ? profileParsed.frontmatter.email
        : null;
      const profileWebsite = profileParsed && typeof profileParsed.frontmatter.website === 'string'
        ? profileParsed.frontmatter.website
        : null;

      const profileDomain = extractEmailDomain(profileEmail);
      if (profileDomain) domains.add(profileDomain);

      if (profileWebsite) {
        try {
          const host = new URL(profileWebsite.startsWith('http') ? profileWebsite : `https://${profileWebsite}`).hostname;
          domains.add(normalizeDomain(host));
        } catch {
          // ignore invalid website
        }
      }

      const domainHintsPath = join(workspacePaths.context, 'domain-hints.md');
      const domainHintsContent = await this.storage.read(domainHintsPath);
      const domainParsed = domainHintsContent ? parseFrontmatter(domainHintsContent) : null;
      const hints = domainParsed?.frontmatter.domains;
      if (Array.isArray(hints)) {
        for (const hint of hints) {
          if (typeof hint === 'string' && hint.trim()) domains.add(normalizeDomain(hint));
        }
      }
    }

    const existingPeople = workspacePaths ? await this.listPeople(workspacePaths) : [];
    const existingByEmail = new Map<string, Person>();
    for (const person of existingPeople) {
      if (person.email) {
        existingByEmail.set(person.email.toLowerCase(), person);
      }
    }

    const suggestions: PeopleIntelligenceSuggestion[] = [];

    for (const candidate of candidates) {
      const evidence: PeopleIntelligenceEvidence[] = [];
      let confidence = 0.2;
      let affiliation: PersonAffiliation = 'unknown';
      let roleLens: PersonRoleLens = 'unknown';

      const rawMergedText = [candidate.name, candidate.company, candidate.text]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ');
      const mergedText = policy.features.enableExtractionTuning
        ? rawMergedText.replace(/\s+/g, ' ').trim()
        : rawMergedText;

      if (mergedText) {
        const detectedLens = detectRoleLens(mergedText);
        if (detectedLens !== 'unknown') {
          roleLens = detectedLens;
          confidence += 0.25;
          evidence.push({
            kind: 'text-signal',
            source: candidate.source ?? 'candidate-input',
            snippet: `Detected ${detectedLens} signal from text`,
          });
        }
      }

      let enrichmentApplied = false;
      if (policy.features.enableEnrichment) {
        const companySignal = candidate.company?.trim();
        if (companySignal) {
          enrichmentApplied = true;
          confidence += 0.08;
          evidence.push({
            kind: 'enrichment',
            source: candidate.source ?? 'candidate-input',
            snippet: `Enrichment signal: company=${companySignal}`,
          });
          if (roleLens === 'unknown' && /customer|client|buyer/i.test(companySignal)) {
            roleLens = 'customer';
          }
        }
      }

      const emailDomain = extractEmailDomain(candidate.email);
      if (emailDomain) {
        if (domains.has(normalizeDomain(emailDomain))) {
          affiliation = 'internal';
          confidence += 0.45;
          evidence.push({
            kind: 'email-domain',
            source: candidate.source ?? 'candidate-input',
            snippet: `Email domain ${emailDomain} matches internal domain hints`,
          });
        } else {
          affiliation = 'external';
          confidence += 0.2;
          evidence.push({
            kind: 'email-domain',
            source: candidate.source ?? 'candidate-input',
            snippet: `Email domain ${emailDomain} is not recognized as internal`,
          });
        }
      }

      if (candidate.email) {
        const existing = existingByEmail.get(candidate.email.toLowerCase());
        if (existing) {
          evidence.push({
            kind: 'existing-person',
            source: `people/${existing.category}/${existing.slug}.md`,
            snippet: `Matched existing person record (${existing.category})`,
          });
          confidence += 0.2;
          if (existing.category === 'internal') {
            affiliation = 'internal';
          } else if (existing.category === 'customers' && roleLens === 'unknown') {
            roleLens = 'customer';
          } else if (existing.category === 'users' && roleLens === 'unknown') {
            roleLens = 'user';
          }
        }
      }

      if (domains.size > 0) {
        evidence.push({
          kind: 'profile-hint',
          source: 'context/domain-hints.md',
          snippet: `Internal domains available (${domains.size})`,
        });
      }

      confidence = Math.min(confidence, 0.99);
      const initialCategory = deriveCategory(affiliation, roleLens);
      const lowConfidence = confidence < confidenceThreshold;
      const category = lowConfidence ? 'unknown_queue' : initialCategory;
      const recommendationRole = lowConfidence ? 'unknown' : roleLens;
      const trackingIntent: TrackingIntent = lowConfidence ? 'defer' : defaultTrackingIntent;

      const status: 'recommended' | 'needs-review' =
        !lowConfidence && evidence.length > 0 ? 'recommended' : 'needs-review';

      suggestions.push({
        candidate,
        recommendation: {
          affiliation,
          roleLens: recommendationRole,
          trackingIntent,
          category,
        },
        confidence,
        rationale: buildRationale(affiliation, recommendationRole, evidence.length, confidence),
        evidence,
        status,
        enrichmentApplied,
      });
    }

    const unknownQueueCount = suggestions.filter((s) => s.recommendation.category === 'unknown_queue').length;
    const suggestedCount = suggestions.filter((s) => s.status === 'recommended').length;

    const reviewed = suggestions.filter((s) => s.candidate.actualRoleLens && s.recommendation.roleLens !== 'unknown');
    const mismatches = reviewed.filter((s) => s.candidate.actualRoleLens !== s.recommendation.roleLens);
    const misclassificationRate = reviewed.length > 0
      ? mismatches.length / reviewed.length
      : null;

    const metrics: PeopleIntelligenceMetrics = {
      misclassificationRate,
      triageBurdenMinutes: computeTriageBurdenMinutes(unknownQueueCount),
      interruptionComplaintRate: 0,
      unknownQueueRate: suggestions.length > 0 ? unknownQueueCount / suggestions.length : 0,
      extractionQualityScore: options.extractionQualityScore ?? null,
    };

    const digest: PeopleIntelligenceDigest = {
      mode: 'digest',
      totalCandidates: suggestions.length,
      suggestedCount,
      unknownQueueCount,
      suggestions,
      metrics,
      policy,
    };

    await this.savePeopleIntelligenceSnapshot(workspacePaths, digest);
    return digest;
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
