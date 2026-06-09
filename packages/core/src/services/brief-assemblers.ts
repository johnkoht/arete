/**
 * Phase 9 — Typed-mode brief assemblers.
 *
 * Pure file-system aggregation + structured search. NO LLM calls. NO
 * AIService injection. These helpers are consumed by IntelligenceService
 * to produce PersonBrief / ProjectBrief / AreaBrief / MeetingBrief.
 *
 * Composition order, per-mode caps, truncation markers, and source paths
 * all live here. Markdown rendering lives in `brief-formatters.ts`.
 *
 * Plan: `dev/work/plans/arete-v2-chef-orchestrator/phase-9-brief-primitive-restore/plan.md`
 * ACs: AC1, AC1a, AC2, AC3, AC4, AC4a-d, AC5, AC11
 */

import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { SearchProvider } from '../search/types.js';
import type { CommitmentsService } from './commitments.js';
import type { EntityService } from './entity.js';
import type { TopicMemoryService } from './topic-memory.js';
import { tokenizeSlug } from './topic-memory.js';
import type { AreaParserService } from './area-parser.js';
import type { AreaMemoryService } from './area-memory.js';
import { parseTopicPage, type TopicPageFrontmatter } from '../models/topic-page.js';
import { jaccardSimilarity } from '../utils/similarity.js';
import type {
  WorkspacePaths,
  PersonBrief,
  ProjectBrief,
  AreaBrief,
  MeetingBrief,
  BriefSection,
  AttendeeMiniBrief,
  Commitment,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Global per-brief soft cap (characters). Matches old BRIEF_MAX_CONTEXT_CHARS. */
export const BRIEF_GLOBAL_CAP_CHARS = 12_000;

/** Per-section caps (chars). v2 MC1 — mini-brief truncation drops tail. */
export const PER_SECTION_CAPS: Record<string, number> = {
  attendee_minibrief: 2000,
  project_context: 4000,
  recent_activity: 3000,
  recent_meetings: 3000,
  open_commitments: 2000,
  open_work: 2000,
  wiki_pages: 2000,
  related_wiki: 2000,
  area_memory: 1000,
  memory_highlights: 2000,
  default: 2000,
};

/** Per-mode wiki retrieval cap. Q6 in plan v3 — knock to 5 if too crowded. */
export const WIKI_RETRIEVAL_LIMIT = 7;

/** How many recent meetings to surface in --person and --project briefs. */
export const RECENT_MEETINGS_PER_PERSON = 10;
export const RECENT_MEETINGS_PER_PROJECT = 10;

/** How many group-overlap meetings to surface in --meeting brief. */
export const GROUP_OVERLAP_LIMIT = 3;

/** How many recent meetings per attendee within --meeting mini-brief. */
export const MEETING_MINIBRIEF_RECENT_LIMIT = 5;

// ---------------------------------------------------------------------------
// Frontmatter parsing (local helper — entity.ts has its own private copy)
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(content: string): ParsedFrontmatter | null {
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
// Helpers
// ---------------------------------------------------------------------------

/** Workspace-relative path for source listing. */
export function relativeToRoot(absolutePath: string, root: string): string {
  if (absolutePath.startsWith(root + '/')) {
    return absolutePath.slice(root.length + 1);
  }
  return absolutePath;
}

/** Extract YYYY-MM-DD from a meeting filename (e.g. "2026-04-29-john-lindsay-11.md"). */
export function extractDateFromMeetingPath(filePath: string): string | undefined {
  const base = basename(filePath);
  const match = base.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : undefined;
}

/**
 * Read all meetings under resources/meetings/ once, parse frontmatter,
 * and return a bucketed map keyed by attendee slug (and by attendee name
 * lower-cased as fallback). Avoids O(attendees × meetings) re-reads.
 * Performance note: this implements MC6 from plan v2.
 */
export interface MeetingIndexEntry {
  path: string;
  date: string;
  title: string;
  attendeeIds: string[];
  attendeeNames: string[];
  area?: string;
  projectSlug?: string;
  /** First non-empty body excerpt (post-frontmatter heading or summary). */
  excerpt?: string;
}

export async function loadMeetingIndex(
  storage: StorageAdapter,
  paths: WorkspacePaths,
): Promise<MeetingIndexEntry[]> {
  const meetingsDir = join(paths.resources, 'meetings');
  const exists = await storage.exists(meetingsDir);
  if (!exists) return [];

  const files = await storage.list(meetingsDir, { extensions: ['.md'] });
  const entries: MeetingIndexEntry[] = [];

  for (const filePath of files) {
    const base = basename(filePath);
    if (base === 'index.md') continue;
    const content = await storage.read(filePath);
    if (!content) continue;

    const parsed = parseFrontmatter(content);
    const fm = parsed?.frontmatter ?? {};

    const date =
      (typeof fm.date === 'string' ? fm.date.slice(0, 10) : undefined) ??
      extractDateFromMeetingPath(filePath) ??
      '';
    const title =
      (typeof fm.title === 'string' ? fm.title : '') ||
      base.replace(/\.md$/, '');

    const attendeeIds = Array.isArray(fm.attendee_ids)
      ? fm.attendee_ids.map(String)
      : [];

    const attendeesRaw = fm.attendees;
    const attendeeNames = Array.isArray(attendeesRaw)
      ? attendeesRaw.map((s) => String(s).toLowerCase())
      : typeof attendeesRaw === 'string'
        ? attendeesRaw
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0)
        : [];

    const area = typeof fm.area === 'string' ? fm.area : undefined;
    const projectSlug = typeof fm.project === 'string' ? fm.project : undefined;

    // Pull a short excerpt from the body — first non-empty line after
    // frontmatter, or first H2 (### Summary etc.)
    const body = parsed?.body ?? '';
    let excerpt: string | undefined;
    const firstHeading = body.match(/^##\s+([^\n]+)\n([\s\S]+?)(?=\n##\s|$)/m);
    if (firstHeading) {
      const firstLine = firstHeading[2]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)[0];
      if (firstLine) excerpt = firstLine.slice(0, 200);
    }

    entries.push({
      path: filePath,
      date,
      title,
      attendeeIds,
      attendeeNames,
      area,
      projectSlug,
      excerpt,
    });
  }

  // Newest first (date desc).
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

/** Filter the meeting index to entries where `personSlug` or `personName` appear in attendees. */
export function meetingsForPerson(
  index: MeetingIndexEntry[],
  personSlug: string,
  personName: string,
): MeetingIndexEntry[] {
  const slugLower = personSlug.toLowerCase();
  const nameLower = personName.toLowerCase();
  return index.filter((m) => {
    if (m.attendeeIds.some((id) => id.toLowerCase() === slugLower)) return true;
    if (m.attendeeNames.some((n) => n.includes(nameLower))) return true;
    return false;
  });
}

/** Filter the meeting index by area frontmatter match. */
export function meetingsForArea(
  index: MeetingIndexEntry[],
  areaSlug: string,
): MeetingIndexEntry[] {
  return index.filter((m) => m.area === areaSlug);
}

/** Filter the meeting index by overlap with a group of attendee slugs. */
export function meetingsForGroup(
  index: MeetingIndexEntry[],
  groupSlugs: string[],
  excludePath?: string,
): MeetingIndexEntry[] {
  const slugSet = new Set(groupSlugs.map((s) => s.toLowerCase()));
  return index.filter((m) => {
    if (excludePath && m.path === excludePath) return false;
    const overlap = m.attendeeIds.filter((id) => slugSet.has(id.toLowerCase()));
    // At least 2 of the group present = group meeting
    return overlap.length >= 2;
  });
}

// ---------------------------------------------------------------------------
// Memory highlights extraction (from `## Memory Highlights (Auto)` section)
// ---------------------------------------------------------------------------

/**
 * Extract bullets from the `## Memory Highlights (Auto)` section of a person
 * file. Returns the bullets per sub-section (Asks/Concerns/Stances/etc.) in
 * the order they appear. Drops "None detected yet." placeholders cleanly
 * (AC1a v3 — no bleed of placeholder text into briefs).
 */
export interface MemoryHighlightsExtract {
  asks: string[];
  concerns: string[];
  stances: string[];
  actionItemsIOwe: string[];
  actionItemsTheyOwe: string[];
  relationshipHealth: string[];
}

export function extractMemoryHighlights(content: string): MemoryHighlightsExtract {
  const empty: MemoryHighlightsExtract = {
    asks: [],
    concerns: [],
    stances: [],
    actionItemsIOwe: [],
    actionItemsTheyOwe: [],
    relationshipHealth: [],
  };

  // Locate the block — bounded by AUTO_PERSON_MEMORY markers if present,
  // otherwise from `## Memory Highlights (Auto)` to the next `##` header.
  const startMarker = '<!-- AUTO_PERSON_MEMORY:START -->';
  const endMarker = '<!-- AUTO_PERSON_MEMORY:END -->';
  let block = '';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx >= 0 && endIdx > startIdx) {
    block = content.slice(startIdx + startMarker.length, endIdx);
  } else {
    const heading = content.search(/^##\s+Memory Highlights/m);
    if (heading < 0) return empty;
    const rest = content.slice(heading);
    const nextH2 = rest.slice(2).search(/\n##\s/);
    block = nextH2 > 0 ? rest.slice(0, nextH2 + 2) : rest;
  }
  if (!block) return empty;

  const subsections: Record<string, string> = {};
  const subRe = /^###\s+([^\n]+)\n([\s\S]+?)(?=\n###\s|\n##\s|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = subRe.exec(block)) !== null) {
    subsections[m[1].trim().toLowerCase()] = m[2];
  }

  const NONE_RE = /^-\s*none detected yet\.?\s*$/i;
  function bulletsFor(name: string): string[] {
    const body = subsections[name.toLowerCase()];
    if (!body) return [];
    const bullets: string[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) continue;
      if (NONE_RE.test(trimmed)) continue;
      bullets.push(trimmed.slice(2));
    }
    return bullets;
  }

  return {
    asks: bulletsFor('Repeated asks'),
    concerns: bulletsFor('Repeated concerns'),
    stances: bulletsFor('Stances'),
    actionItemsIOwe: bulletsFor('Open Items (I owe them)').concat(
      bulletsFor('Open Commitments (I owe them)'),
    ),
    actionItemsTheyOwe: bulletsFor('Open Items (They owe me)').concat(
      bulletsFor('Open Commitments (They owe me)'),
    ),
    relationshipHealth: bulletsFor('Relationship Health'),
  };
}

// ---------------------------------------------------------------------------
// Wiki retrieval (retrieveRelevant primary, listAll fallback)
// ---------------------------------------------------------------------------

export interface WikiMatch {
  slug: string;
  area?: string;
  /** 1-line summary derived from bodyForContext. */
  summary: string;
  /** File path for sources. */
  path: string;
}

/**
 * Per-mode wiki retrieval. `retrieveRelevant()` is the primary path; when
 * `searchBackend === 'none'` we fall back to `listAll() + tokenizeSlug()`
 * alias-jaccard. AC5.
 */
export async function retrieveWiki(
  topicMemory: TopicMemoryService,
  paths: WorkspacePaths,
  query: string,
  opts: { limit?: number; area?: string } = {},
): Promise<WikiMatch[]> {
  const limit = opts.limit ?? WIKI_RETRIEVAL_LIMIT;

  // Primary path
  const result = await topicMemory.retrieveRelevant(query, { limit, area: opts.area });
  if (result.searchBackend !== 'none' && result.results.length > 0) {
    return result.results.map((r) => ({
      slug: r.slug,
      area: r.frontmatter.area,
      summary: summarizeWikiBody(r.bodyForContext),
      path: join(paths.memory, 'topics', `${r.slug}.md`),
    }));
  }

  if (result.searchBackend !== 'none') {
    return []; // Provider available but returned nothing — respect that.
  }

  // Fallback path — listAll + tokenizeSlug alias-jaccard
  const { topics } = await topicMemory.listAll(paths);
  if (topics.length === 0) return [];

  const queryTokens = tokenizeSlug(query.toLowerCase().replace(/\s+/g, '-'));
  if (queryTokens.length === 0) return [];

  const scored: Array<{
    slug: string;
    score: number;
    frontmatter: TopicPageFrontmatter;
    bodyForContext: string;
  }> = [];

  for (const topic of topics) {
    const surfaces: string[] = [
      topic.frontmatter.topic_slug,
      ...(topic.frontmatter.aliases ?? []),
    ];

    let best = 0;
    for (const surface of surfaces) {
      const surfaceTokens = tokenizeSlug(
        surface.toLowerCase().replace(/\s+/g, '-'),
      );
      const score = jaccardSimilarity(queryTokens, surfaceTokens);
      if (score > best) best = score;
    }
    // Area match bonus (cheap re-rank to match retrieveRelevant)
    if (opts.area && topic.frontmatter.area === opts.area) best += 0.1;
    if (best > 0) {
      // bodyForContext derived from topic sections (first 800 chars of joined)
      const joined = Object.entries(topic.sections ?? {})
        .map(([name, text]) => `## ${name}\n${text}`)
        .join('\n\n');
      scored.push({
        slug: topic.frontmatter.topic_slug,
        score: best,
        frontmatter: topic.frontmatter,
        bodyForContext: joined.slice(0, 800),
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => ({
    slug: s.slug,
    area: s.frontmatter.area,
    summary: summarizeWikiBody(s.bodyForContext),
    path: join(paths.memory, 'topics', `${s.slug}.md`),
  }));
}

function summarizeWikiBody(body: string): string {
  if (!body) return '';
  // Skip leading blank lines and headings; take the first content line.
  const lines = body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    // Take first sentence (up to a period or 200 chars).
    const periodIdx = t.indexOf('. ');
    if (periodIdx > 20 && periodIdx < 220) return t.slice(0, periodIdx + 1);
    return t.slice(0, 200);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Capping helpers
// ---------------------------------------------------------------------------

/** Cap a list of bullets by character budget. Returns the kept bullets +
 * a count of how many were truncated. Drops oldest first when index suggests
 * recency order isn't already enforced.
 */
export function capBulletsByChars(
  bullets: string[],
  capChars: number,
): { kept: string[]; truncatedCount: number } {
  let used = 0;
  const kept: string[] = [];
  for (const bullet of bullets) {
    const cost = bullet.length + 4; // bullet prefix + newline
    if (used + cost > capChars) break;
    kept.push(bullet);
    used += cost;
  }
  return { kept, truncatedCount: bullets.length - kept.length };
}

/**
 * Apply the global 12K cap to a list of sections — drops trailing sections
 * wholesale once budget exceeded. Returns the kept sections plus the
 * names of dropped sections (for the global truncation marker).
 */
export function capSectionsByGlobalChars(
  sections: BriefSection[],
  capChars: number,
): { kept: BriefSection[]; droppedNames: string[] } {
  let used = 0;
  const kept: BriefSection[] = [];
  const droppedNames: string[] = [];
  for (const section of sections) {
    const cost = sectionCharCost(section);
    if (used + cost > capChars && kept.length > 0) {
      droppedNames.push(section.heading);
      continue;
    }
    kept.push(section);
    used += cost;
  }
  return { kept, droppedNames };
}

function sectionCharCost(section: BriefSection): number {
  let cost = section.heading.length + 4;
  if (section.body) cost += section.body.length + 2;
  for (const bullet of section.bullets) cost += bullet.length + 4;
  if (section.truncated) cost += 60;
  return cost;
}

// ---------------------------------------------------------------------------
// Person brief
// ---------------------------------------------------------------------------

export interface PersonBriefDeps {
  storage: StorageAdapter;
  entities: EntityService;
  commitments: CommitmentsService;
  topicMemory: TopicMemoryService;
  areaParser: AreaParserService;
}

/**
 * Assemble a PersonBrief — pure aggregator.
 * AC1 / AC1a.
 */
export async function assembleBriefForPerson(
  slug: string,
  paths: WorkspacePaths,
  deps: PersonBriefDeps,
): Promise<PersonBrief> {
  // Resolve person file. Walk PEOPLE_CATEGORIES.
  const PEOPLE_CATEGORIES = ['internal', 'customers', 'users'] as const;
  let personFile: { path: string; content: string; category: string } | null = null;
  for (const cat of PEOPLE_CATEGORIES) {
    const candidate = join(paths.people, cat, `${slug}.md`);
    const content = await deps.storage.read(candidate);
    if (content) {
      personFile = { path: candidate, content, category: cat };
      break;
    }
  }
  if (!personFile) {
    return makeEmptyPersonBrief(slug);
  }

  const parsed = parseFrontmatter(personFile.content);
  const fm = parsed?.frontmatter ?? {};
  const personName = (typeof fm.name === 'string' ? fm.name : slug);
  const sources: string[] = [relativeToRoot(personFile.path, paths.root)];

  const metadata: PersonBrief['metadata'] = {
    role: typeof fm.role === 'string' ? fm.role : undefined,
    team: typeof fm.team === 'string' ? fm.team : undefined,
    company: typeof fm.company === 'string' ? fm.company : undefined,
    email: typeof fm.email === 'string' ? fm.email : undefined,
    category: personFile.category,
  };

  const sections: BriefSection[] = [];

  // 1. Recent meetings (most recent first)
  const index = await loadMeetingIndex(deps.storage, paths);
  const personMeetings = meetingsForPerson(index, slug, personName).slice(
    0,
    RECENT_MEETINGS_PER_PERSON,
  );
  if (personMeetings.length > 0) {
    const bullets = personMeetings.map((m) => {
      const rel = relativeToRoot(m.path, paths.root);
      sources.push(rel);
      const excerpt = m.excerpt ? ` — ${m.excerpt}` : '';
      return `**${m.title}** (${m.date}) — \`${rel}\`${excerpt}`;
    });
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.recent_meetings);
    sections.push({
      heading: `Recent meetings (${personMeetings.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 2. Open commitments — both directions
  const allCommitments = await deps.commitments.listForPerson(slug);
  if (allCommitments.length > 0) {
    const bullets = allCommitments.map((c) => renderCommitmentBullet(c));
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.open_commitments);
    sections.push({
      heading: `Open commitments (${allCommitments.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 3. Memory highlights — verbatim from person file (asks/concerns/stances/etc.)
  const highlights = extractMemoryHighlights(personFile.content);
  const highlightBullets: string[] = [];
  if (highlights.stances.length > 0) {
    highlightBullets.push(`**Stances:**`);
    for (const s of highlights.stances) highlightBullets.push(`  - ${s}`);
  }
  if (highlights.asks.length > 0) {
    highlightBullets.push(`**Asks:**`);
    for (const a of highlights.asks) highlightBullets.push(`  - ${a}`);
  }
  if (highlights.concerns.length > 0) {
    highlightBullets.push(`**Concerns:**`);
    for (const c of highlights.concerns) highlightBullets.push(`  - ${c}`);
  }
  if (highlights.actionItemsIOwe.length > 0 || highlights.actionItemsTheyOwe.length > 0) {
    if (highlights.actionItemsIOwe.length > 0) {
      highlightBullets.push(`**Action items (I owe them):**`);
      for (const a of highlights.actionItemsIOwe) highlightBullets.push(`  - ${a}`);
    }
    if (highlights.actionItemsTheyOwe.length > 0) {
      highlightBullets.push(`**Action items (They owe me):**`);
      for (const a of highlights.actionItemsTheyOwe) highlightBullets.push(`  - ${a}`);
    }
  }
  if (highlights.relationshipHealth.length > 0) {
    highlightBullets.push(`**Relationship health:**`);
    for (const h of highlights.relationshipHealth) highlightBullets.push(`  - ${h}`);
  }

  if (highlightBullets.length > 0) {
    const capped = capBulletsByChars(highlightBullets, PER_SECTION_CAPS.memory_highlights);
    sections.push({
      heading: 'Memory highlights',
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 4. Shared areas & projects
  const sharedAreas = new Set<string>();
  for (const m of personMeetings) {
    if (m.area) sharedAreas.add(m.area);
  }
  const projects = await listActiveProjects(deps.storage, paths);
  const sharedProjects = projects.filter(
    (p) => p.area && sharedAreas.has(p.area),
  );
  if (sharedAreas.size > 0 || sharedProjects.length > 0) {
    const bullets: string[] = [];
    if (sharedAreas.size > 0) {
      bullets.push(`**Areas:** ${Array.from(sharedAreas).sort().join(', ')}`);
    }
    if (sharedProjects.length > 0) {
      for (const p of sharedProjects) {
        const rel = relativeToRoot(p.readmePath, paths.root);
        bullets.push(`**${p.name}** (area: ${p.area}) — \`${rel}\``);
        sources.push(rel);
      }
    }
    sections.push({
      heading: 'Shared areas & projects',
      bullets,
    });
  }

  // 5. Related wiki pages
  const aliases = Array.isArray(fm.aliases) ? fm.aliases.map(String) : [];
  const wikiQuery = [personName, ...aliases].filter(Boolean).join(' ');
  try {
    const wiki = await retrieveWiki(deps.topicMemory, paths, wikiQuery);
    if (wiki.length > 0) {
      const bullets = wiki.map((w) => {
        const rel = relativeToRoot(w.path, paths.root);
        sources.push(rel);
        return `**${w.slug}** — ${w.summary || '(no summary)'} — \`${rel}\``;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.related_wiki);
      sections.push({
        heading: `Related wiki pages (${wiki.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  } catch {
    // Wiki retrieval is best-effort — never blocks the brief.
  }

  // Global cap
  const { kept, droppedNames } = capSectionsByGlobalChars(sections, BRIEF_GLOBAL_CAP_CHARS);

  return {
    mode: 'person',
    subject: personName,
    subjectSlug: slug,
    sections: kept,
    sources: Array.from(new Set(sources)),
    truncated: droppedNames.length > 0,
    truncatedSections: droppedNames.length > 0 ? droppedNames : undefined,
    metadata,
  };
}

function renderCommitmentBullet(c: Commitment): string {
  const arrow = c.direction === 'i_owe_them' ? '→' : '←';
  const id = c.id.slice(0, 8);
  const project = c.projectSlug ? ` [${c.projectSlug}]` : '';
  return `\`${id}\` ${arrow} ${c.personName}${project}: ${c.text} _(${c.date})_`;
}

function makeEmptyPersonBrief(slug: string): PersonBrief {
  return {
    mode: 'person',
    subject: slug,
    subjectSlug: slug,
    sections: [],
    sources: [],
    truncated: false,
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Project brief
// ---------------------------------------------------------------------------

export interface ProjectBriefDeps {
  storage: StorageAdapter;
  commitments: CommitmentsService;
  topicMemory: TopicMemoryService;
  areaMemory: AreaMemoryService;
  entities: EntityService;
}

interface ActiveProject {
  slug: string;
  name: string;
  area?: string;
  status?: string;
  started?: string;
  readmePath: string;
  readmeContent: string;
}

async function listActiveProjects(
  storage: StorageAdapter,
  paths: WorkspacePaths,
): Promise<ActiveProject[]> {
  const activeDir = join(paths.projects, 'active');
  const exists = await storage.exists(activeDir);
  if (!exists) return [];
  const subdirs = await storage.listSubdirectories(activeDir);
  const projects: ActiveProject[] = [];
  for (const dir of subdirs) {
    const readmePath = join(dir, 'README.md');
    const content = await storage.read(readmePath);
    if (!content) continue;
    const parsed = parseFrontmatter(content);
    const fm = parsed?.frontmatter ?? {};
    const slug = basename(dir);
    const name = typeof fm.name === 'string' ? fm.name : slug;
    projects.push({
      slug,
      name,
      area: typeof fm.area === 'string' ? fm.area : undefined,
      status: typeof fm.status === 'string' ? fm.status : undefined,
      started: typeof fm.started === 'string' ? fm.started : undefined,
      readmePath,
      readmeContent: content,
    });
  }
  return projects;
}

async function readProjectBySlug(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  slug: string,
): Promise<ActiveProject | null> {
  const readmePath = join(paths.projects, 'active', slug, 'README.md');
  const content = await storage.read(readmePath);
  if (!content) return null;
  const parsed = parseFrontmatter(content);
  const fm = parsed?.frontmatter ?? {};
  return {
    slug,
    name: typeof fm.name === 'string' ? fm.name : slug,
    area: typeof fm.area === 'string' ? fm.area : undefined,
    status: typeof fm.status === 'string' ? fm.status : undefined,
    started: typeof fm.started === 'string' ? fm.started : undefined,
    readmePath,
    readmeContent: content,
  };
}

/** Assemble a ProjectBrief — pure aggregator. AC2. */
export async function assembleBriefForProject(
  slug: string,
  paths: WorkspacePaths,
  deps: ProjectBriefDeps,
): Promise<ProjectBrief> {
  const project = await readProjectBySlug(deps.storage, paths, slug);
  if (!project) {
    return {
      mode: 'project',
      subject: slug,
      subjectSlug: slug,
      sections: [],
      sources: [],
      truncated: false,
      metadata: {},
    };
  }

  const sources: string[] = [relativeToRoot(project.readmePath, paths.root)];
  const metadata: ProjectBrief['metadata'] = {
    area: project.area,
    status: project.status,
    started: project.started,
  };
  const sections: BriefSection[] = [];

  // 1. Project context — README Background + latest Status Updates excerpt
  const parsed = parseFrontmatter(project.readmeContent);
  const body = parsed?.body ?? '';
  const contextChunks: string[] = [];
  const backgroundMatch = body.match(/##\s+Background\s*\n([\s\S]+?)(?=\n##\s|$)/i);
  if (backgroundMatch) contextChunks.push(`**Background:** ${backgroundMatch[1].trim()}`);
  const statusMatch = body.match(/##\s+Status\s+Updates\s*\n([\s\S]+?)(?=\n##\s|$)/i);
  if (statusMatch) {
    // Take first 2 paragraphs
    const updates = statusMatch[1]
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 2);
    if (updates.length > 0) contextChunks.push(`**Status:** ${updates.join('\n\n')}`);
  }
  if (contextChunks.length > 0) {
    const bodyText = contextChunks.join('\n\n');
    const truncated = bodyText.length > PER_SECTION_CAPS.project_context;
    const finalBody = truncated
      ? bodyText.slice(0, PER_SECTION_CAPS.project_context) + '…'
      : bodyText;
    sections.push({
      heading: 'Project context',
      bullets: [],
      body: finalBody,
      truncated,
    });
  }

  // 2. Recent activity — meetings tagged to project's area
  const index = await loadMeetingIndex(deps.storage, paths);
  if (project.area) {
    const areaMeetings = meetingsForArea(index, project.area).slice(
      0,
      RECENT_MEETINGS_PER_PROJECT,
    );
    if (areaMeetings.length > 0) {
      const bullets = areaMeetings.map((m) => {
        const rel = relativeToRoot(m.path, paths.root);
        sources.push(rel);
        const excerpt = m.excerpt ? ` — ${m.excerpt}` : '';
        return `**${m.title}** (${m.date}) — \`${rel}\`${excerpt}`;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.recent_activity);
      sections.push({
        heading: `Recent activity (${areaMeetings.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  }

  // 3. Open work — commitments scoped to area
  if (project.area) {
    const openCommitments = await deps.commitments.listOpen({ area: project.area });
    if (openCommitments.length > 0) {
      // Group by direction.
      const iOwe = openCommitments.filter((c) => c.direction === 'i_owe_them');
      const theyOwe = openCommitments.filter((c) => c.direction === 'they_owe_me');
      const bullets: string[] = [];
      if (iOwe.length > 0) {
        bullets.push(`**I owe (${iOwe.length}):**`);
        for (const c of iOwe) bullets.push(`  - ${renderCommitmentBullet(c)}`);
      }
      if (theyOwe.length > 0) {
        bullets.push(`**They owe (${theyOwe.length}):**`);
        for (const c of theyOwe) bullets.push(`  - ${renderCommitmentBullet(c)}`);
      }
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.open_work);
      sections.push({
        heading: `Open work (${openCommitments.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  }

  // 4. Decisions & learnings — area-tagged items
  if (project.area) {
    const items = await readAreaTaggedMemoryItems(deps.storage, paths, project.area);
    if (items.length > 0) {
      const bullets = items.map((it) => {
        sources.push(relativeToRoot(it.path, paths.root));
        return `**${it.type}** [${it.date ?? 'undated'}]: ${it.text}`;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.default);
      sections.push({
        heading: `Decisions & learnings (${items.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  }

  // 5. Related wiki pages
  const wikiQuery = [project.name, project.area].filter(Boolean).join(' ');
  try {
    const wiki = await retrieveWiki(deps.topicMemory, paths, wikiQuery, { area: project.area });
    if (wiki.length > 0) {
      const bullets = wiki.map((w) => {
        const rel = relativeToRoot(w.path, paths.root);
        sources.push(rel);
        return `**${w.slug}** — ${w.summary || '(no summary)'} — \`${rel}\``;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.related_wiki);
      sections.push({
        heading: `Related wiki pages (${wiki.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  } catch {
    // best-effort
  }

  const { kept, droppedNames } = capSectionsByGlobalChars(sections, BRIEF_GLOBAL_CAP_CHARS);

  return {
    mode: 'project',
    subject: project.name,
    subjectSlug: slug,
    sections: kept,
    sources: Array.from(new Set(sources)),
    truncated: droppedNames.length > 0,
    truncatedSections: droppedNames.length > 0 ? droppedNames : undefined,
    metadata,
  };
}

interface AreaTaggedItem {
  type: 'decision' | 'learning';
  text: string;
  date?: string;
  path: string;
}

async function readAreaTaggedMemoryItems(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  area: string,
): Promise<AreaTaggedItem[]> {
  const items: AreaTaggedItem[] = [];
  for (const [type, file] of [
    ['decision', 'decisions.md'],
    ['learning', 'learnings.md'],
  ] as const) {
    const filePath = join(paths.memory, 'items', file);
    const content = await storage.read(filePath);
    if (!content) continue;

    // Parse `### YYYY-MM-DD: Title` sections, look at trailing `Area:` line
    // or `[area:foo]` tag in section body.
    const sectionRe = /^###\s+(?:(\d{4}-\d{2}-\d{2}):\s*)?([^\n]+)\n([\s\S]+?)(?=\n###\s|$)/gm;
    let m: RegExpExecArray | null;
    while ((m = sectionRe.exec(content)) !== null) {
      const date = m[1];
      const title = m[2].trim();
      const body = m[3];
      // Match `Area: foo` (case-insensitive) or `[area:foo]` tag
      const areaLine = body.match(/^\s*Area:\s*([^\n]+)/im);
      const areaTag = body.match(/\[area:\s*([^\]]+)\]/i);
      const itemArea = (areaLine?.[1] ?? areaTag?.[1] ?? '').trim();
      if (itemArea !== area) continue;
      items.push({ type, text: title, date, path: filePath });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Area brief
// ---------------------------------------------------------------------------

export interface AreaBriefDeps {
  storage: StorageAdapter;
  commitments: CommitmentsService;
  topicMemory: TopicMemoryService;
  areaParser: AreaParserService;
}

/** Assemble an AreaBrief — pure aggregator. AC3. */
export async function assembleBriefForArea(
  slug: string,
  paths: WorkspacePaths,
  deps: AreaBriefDeps,
): Promise<AreaBrief> {
  // 1. Read area memory page
  const areaMemoryPath = join(paths.memory, 'areas', `${slug}.md`);
  const areaMemoryContent = await deps.storage.read(areaMemoryPath);

  const areaContext = await deps.areaParser.getAreaContext(slug);
  const areaName = areaContext?.name ?? slug;

  const sources: string[] = [];
  if (areaMemoryContent) sources.push(relativeToRoot(areaMemoryPath, paths.root));
  if (areaContext?.filePath) sources.push(relativeToRoot(areaContext.filePath, paths.root));

  const sections: BriefSection[] = [];

  // 1. Area memory excerpt
  if (areaMemoryContent) {
    // Strip frontmatter; cap at 1000 chars.
    const parsed = parseFrontmatter(areaMemoryContent);
    const body = (parsed?.body ?? areaMemoryContent).trim();
    const truncated = body.length > PER_SECTION_CAPS.area_memory;
    const finalBody = truncated
      ? body.slice(0, PER_SECTION_CAPS.area_memory) + '…'
      : body;
    sections.push({
      heading: 'Area memory',
      bullets: [],
      body: finalBody,
      truncated,
    });
  }

  // 2. Active projects in this area
  const projects = await listActiveProjects(deps.storage, paths);
  const areaProjects = projects.filter((p) => p.area === slug);
  if (areaProjects.length > 0) {
    const bullets = areaProjects.map((p) => {
      const rel = relativeToRoot(p.readmePath, paths.root);
      sources.push(rel);
      return `**${p.name}** (${p.status ?? 'active'}) — \`${rel}\``;
    });
    sections.push({
      heading: `Active projects (${areaProjects.length})`,
      bullets,
    });
  }

  // 3. Recent meetings
  const index = await loadMeetingIndex(deps.storage, paths);
  const areaMeetings = meetingsForArea(index, slug).slice(0, RECENT_MEETINGS_PER_PROJECT);
  if (areaMeetings.length > 0) {
    const bullets = areaMeetings.map((m) => {
      const rel = relativeToRoot(m.path, paths.root);
      sources.push(rel);
      const excerpt = m.excerpt ? ` — ${m.excerpt}` : '';
      return `**${m.title}** (${m.date}) — \`${rel}\`${excerpt}`;
    });
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.recent_meetings);
    sections.push({
      heading: `Recent meetings (${areaMeetings.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 4. Open commitments tagged with area
  const openCommitments = await deps.commitments.listOpen({ area: slug });
  if (openCommitments.length > 0) {
    const bullets = openCommitments.map(renderCommitmentBullet);
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.open_commitments);
    sections.push({
      heading: `Open commitments (${openCommitments.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 5. Decisions & learnings
  const items = await readAreaTaggedMemoryItems(deps.storage, paths, slug);
  if (items.length > 0) {
    const bullets = items.map((it) => {
      sources.push(relativeToRoot(it.path, paths.root));
      return `**${it.type}** [${it.date ?? 'undated'}]: ${it.text}`;
    });
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.default);
    sections.push({
      heading: `Decisions & learnings (${items.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 6. Related wiki pages
  try {
    const wiki = await retrieveWiki(deps.topicMemory, paths, areaName, { area: slug });
    if (wiki.length > 0) {
      const bullets = wiki.map((w) => {
        const rel = relativeToRoot(w.path, paths.root);
        sources.push(rel);
        return `**${w.slug}** — ${w.summary || '(no summary)'} — \`${rel}\``;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.related_wiki);
      sections.push({
        heading: `Related wiki pages (${wiki.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  } catch {
    // best-effort
  }

  const { kept, droppedNames } = capSectionsByGlobalChars(sections, BRIEF_GLOBAL_CAP_CHARS);

  return {
    mode: 'area',
    subject: areaName,
    subjectSlug: slug,
    sections: kept,
    sources: Array.from(new Set(sources)),
    truncated: droppedNames.length > 0,
    truncatedSections: droppedNames.length > 0 ? droppedNames : undefined,
    metadata: {
      name: areaName,
      status: areaContext?.status,
    },
  };
}

// ---------------------------------------------------------------------------
// Meeting brief
// ---------------------------------------------------------------------------

export interface MeetingBriefDeps {
  storage: StorageAdapter;
  commitments: CommitmentsService;
  topicMemory: TopicMemoryService;
  areaMemory: AreaMemoryService;
  areaParser: AreaParserService;
  entities: EntityService;
  searchProvider?: SearchProvider;
}

export interface MeetingBriefOptions {
  /** Pin project context — skips area inference. AC4a. */
  projectOverride?: string;
  /** Calendar events fetched by caller (optional — when absent, we skip calendar resolution). */
  calendarEvents?: Array<{ title: string; date?: string; attendees?: string[] }>;
}

/**
 * Resolve the meeting input string to a meeting file path or, failing that,
 * to a calendar event. Returns null when nothing resolved (AC4d path).
 *
 * Precedence (v3 — M1 sharpened):
 *  - Inputs matching `^\d{4}-\d{2}-\d{2}-` regex try slug match first, then
 *    agenda match, then calendar match.
 *  - Inputs NOT matching that regex (free-text titles) skip the slug-match
 *    path entirely and go directly to calendar + agenda match.
 */
export async function resolveMeetingInput(
  input: string,
  paths: WorkspacePaths,
  storage: StorageAdapter,
  index: MeetingIndexEntry[],
  calendarEvents?: Array<{ title: string; date?: string; attendees?: string[] }>,
): Promise<
  | { kind: 'meeting-file'; entry: MeetingIndexEntry; content: string }
  | { kind: 'calendar'; event: { title: string; date?: string; attendees?: string[] } }
  | { kind: 'unresolved' }
> {
  const slugLike = /^\d{4}-\d{2}-\d{2}-/.test(input.trim());

  if (slugLike) {
    // Try slug match against meeting files
    const slug = input.trim().toLowerCase().replace(/\.md$/, '');
    const entry = index.find(
      (m) => basename(m.path).replace(/\.md$/, '').toLowerCase() === slug,
    );
    if (entry) {
      const content = await storage.read(entry.path);
      if (content) return { kind: 'meeting-file', entry, content };
    }

    // Try saved agenda match — `now/agenda/<slug>.md`
    const agendaPath = join(paths.now, 'agenda', `${slug}.md`);
    const agendaContent = await storage.read(agendaPath);
    if (agendaContent) {
      // Treat as ad-hoc meeting-file: synthesize an entry shape
      const parsed = parseFrontmatter(agendaContent);
      const fm = parsed?.frontmatter ?? {};
      const synthEntry: MeetingIndexEntry = {
        path: agendaPath,
        date:
          (typeof fm.date === 'string' ? fm.date.slice(0, 10) : '') ||
          slug.slice(0, 10),
        title: typeof fm.title === 'string' ? fm.title : slug,
        attendeeIds: Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [],
        attendeeNames: Array.isArray(fm.attendees)
          ? fm.attendees.map((s) => String(s).toLowerCase())
          : [],
        area: typeof fm.area === 'string' ? fm.area : undefined,
      };
      return { kind: 'meeting-file', entry: synthEntry, content: agendaContent };
    }
  }

  // Free-text title — search by title match against the index (recent first)
  const inputLower = input.trim().toLowerCase();
  const titleMatch = index.find((m) => m.title.toLowerCase() === inputLower);
  if (titleMatch) {
    const content = await storage.read(titleMatch.path);
    if (content) return { kind: 'meeting-file', entry: titleMatch, content };
  }
  // Partial title match (most recent that contains the input string)
  const partialMatch = index.find((m) => m.title.toLowerCase().includes(inputLower));
  if (partialMatch) {
    const content = await storage.read(partialMatch.path);
    if (content) return { kind: 'meeting-file', entry: partialMatch, content };
  }

  // Calendar match
  if (calendarEvents) {
    const calMatch = calendarEvents.find(
      (e) =>
        e.title.toLowerCase() === inputLower ||
        e.title.toLowerCase().includes(inputLower),
    );
    if (calMatch) return { kind: 'calendar', event: calMatch };
  }

  return { kind: 'unresolved' };
}

/** Assemble a MeetingBrief — pure aggregator. AC4 / AC4a / AC4b / AC4c / AC4d. */
export async function assembleBriefForMeeting(
  input: string,
  paths: WorkspacePaths,
  deps: MeetingBriefDeps,
  opts: MeetingBriefOptions = {},
): Promise<MeetingBrief> {
  const index = await loadMeetingIndex(deps.storage, paths);
  const resolution = await resolveMeetingInput(
    input,
    paths,
    deps.storage,
    index,
    opts.calendarEvents,
  );

  if (resolution.kind === 'unresolved') {
    return await buildUnresolvedMeetingBrief(input, paths, deps);
  }

  const sources: string[] = [];
  let title: string;
  let date: string | undefined;
  let area: string | undefined;
  let attendeeIds: string[] = [];
  let attendeeNamesRaw: string[] = [];
  let meetingPath: string | undefined;

  if (resolution.kind === 'meeting-file') {
    title = resolution.entry.title;
    date = resolution.entry.date || undefined;
    area = resolution.entry.area;
    attendeeIds = resolution.entry.attendeeIds;
    attendeeNamesRaw = resolution.entry.attendeeNames;
    meetingPath = resolution.entry.path;
    sources.push(relativeToRoot(resolution.entry.path, paths.root));
  } else {
    title = resolution.event.title;
    date = resolution.event.date;
    attendeeNamesRaw = (resolution.event.attendees ?? []).map((s) =>
      s.toLowerCase(),
    );
  }

  // Resolve attendees to person files. AC4c: unresolved attendees get one-line stubs.
  const allPeople = await deps.entities.listPeople(paths);
  const attendeeMiniBriefs: AttendeeMiniBrief[] = [];
  for (const aid of attendeeIds) {
    const person = allPeople.find((p) => p.slug.toLowerCase() === aid.toLowerCase());
    if (person) {
      attendeeMiniBriefs.push(
        await buildAttendeeMiniBrief(person.slug, person.name, paths, deps, index, sources),
      );
    } else {
      attendeeMiniBriefs.push({
        name: aid,
        resolved: false,
      });
    }
  }
  // Fallback when attendee_ids is empty: try matching attendee names
  if (attendeeIds.length === 0) {
    for (const an of attendeeNamesRaw) {
      const person = allPeople.find(
        (p) => p.name.toLowerCase() === an || p.slug.toLowerCase() === an,
      );
      if (person) {
        attendeeMiniBriefs.push(
          await buildAttendeeMiniBrief(person.slug, person.name, paths, deps, index, sources),
        );
      } else {
        attendeeMiniBriefs.push({
          name: an,
          email: an.includes('@') ? an : undefined,
          resolved: false,
        });
      }
    }
  }

  // Project resolution (C2 deterministic ladder)
  let projectOverride: string | undefined;
  let explicitArea: string | undefined;
  let inferredArea: { slug: string; confidence: number } | undefined;
  let resolvedProjects: ActiveProject[] = [];

  if (opts.projectOverride) {
    const proj = await readProjectBySlug(deps.storage, paths, opts.projectOverride);
    if (proj) {
      resolvedProjects = [proj];
      projectOverride = opts.projectOverride;
    }
    // (Validity already enforced at CLI layer per AC4a M4)
  } else if (area) {
    explicitArea = area;
    const projects = await listActiveProjects(deps.storage, paths);
    resolvedProjects = projects.filter((p) => p.area === area).slice(0, 2);
  } else if (deps.areaParser) {
    try {
      const match = await deps.areaParser.suggestAreaForMeeting({ title });
      if (match && match.confidence >= 0.5) {
        inferredArea = { slug: match.areaSlug, confidence: match.confidence };
        const projects = await listActiveProjects(deps.storage, paths);
        resolvedProjects = projects.filter((p) => p.area === match.areaSlug).slice(0, 2);
      }
    } catch {
      // best-effort
    }
  }

  // Now build sections (composition order respects M2 for mini-briefs above)
  const sections: BriefSection[] = [];

  // 1. Attendees — render mini-briefs
  if (attendeeMiniBriefs.length > 0) {
    const bullets: string[] = [];
    for (const mb of attendeeMiniBriefs) {
      bullets.push(...formatAttendeeMiniBriefBullets(mb));
    }
    const capped = capBulletsByChars(
      bullets,
      PER_SECTION_CAPS.attendee_minibrief * Math.max(1, attendeeMiniBriefs.length),
    );
    sections.push({
      heading: `Attendees (${attendeeMiniBriefs.length})`,
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 2. Meeting area & projects
  if (resolvedProjects.length > 0) {
    const bullets: string[] = [];
    for (const p of resolvedProjects) {
      const rel = relativeToRoot(p.readmePath, paths.root);
      sources.push(rel);
      bullets.push(`**${p.name}** (area: ${p.area ?? '—'}, status: ${p.status ?? '—'}) — \`${rel}\``);
    }
    if (projectOverride) {
      bullets.unshift(`_Project pinned via \`--project ${projectOverride}\`._`);
    } else if (inferredArea) {
      bullets.unshift(
        `_Area inferred: **${inferredArea.slug}** (confidence ${inferredArea.confidence.toFixed(2)})._`,
      );
    }
    const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.project_context);
    sections.push({
      heading: 'Meeting area & projects',
      bullets: capped.kept,
      truncated: capped.truncatedCount > 0,
      truncatedCount: capped.truncatedCount,
    });
  }

  // 3. Recent meetings with this group — cross-attendee overlap
  const groupSlugs = attendeeMiniBriefs
    .filter((mb) => mb.slug)
    .map((mb) => mb.slug as string);
  if (groupSlugs.length >= 2) {
    const overlap = meetingsForGroup(index, groupSlugs, meetingPath).slice(0, GROUP_OVERLAP_LIMIT);
    if (overlap.length > 0) {
      const bullets = overlap.map((m) => {
        const rel = relativeToRoot(m.path, paths.root);
        sources.push(rel);
        const excerpt = m.excerpt ? ` — ${m.excerpt}` : '';
        return `**${m.title}** (${m.date}) — \`${rel}\`${excerpt}`;
      });
      sections.push({
        heading: `Recent meetings with this group (${overlap.length})`,
        bullets,
      });
    }
  }

  // 4. Open commitments touching this group
  if (groupSlugs.length > 0) {
    const groupCommitments = await deps.commitments.listOpen({ personSlugs: groupSlugs });
    if (groupCommitments.length > 0) {
      const bullets = groupCommitments.map(renderCommitmentBullet);
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.open_commitments);
      sections.push({
        heading: `Open commitments touching this group (${groupCommitments.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  }

  // 5. Related wiki pages
  const wikiQuery = [
    title.replace(/^\d{4}-\d{2}-\d{2}-?\s*/, ''),
    ...attendeeMiniBriefs.map((mb) => mb.name),
  ]
    .filter(Boolean)
    .join(' ');
  try {
    const wiki = await retrieveWiki(deps.topicMemory, paths, wikiQuery, {
      area: explicitArea ?? inferredArea?.slug,
    });
    if (wiki.length > 0) {
      const bullets = wiki.map((w) => {
        const rel = relativeToRoot(w.path, paths.root);
        sources.push(rel);
        return `**${w.slug}** — ${w.summary || '(no summary)'} — \`${rel}\``;
      });
      const capped = capBulletsByChars(bullets, PER_SECTION_CAPS.related_wiki);
      sections.push({
        heading: `Related wiki pages (${wiki.length})`,
        bullets: capped.kept,
        truncated: capped.truncatedCount > 0,
        truncatedCount: capped.truncatedCount,
      });
    }
  } catch {
    // best-effort
  }

  const { kept, droppedNames } = capSectionsByGlobalChars(sections, BRIEF_GLOBAL_CAP_CHARS);

  return {
    mode: 'meeting',
    subject: title,
    subjectSlug: meetingPath ? basename(meetingPath).replace(/\.md$/, '') : input,
    sections: kept,
    sources: Array.from(new Set(sources)),
    truncated: droppedNames.length > 0,
    truncatedSections: droppedNames.length > 0 ? droppedNames : undefined,
    metadata: {
      title,
      date,
      attendees: attendeeMiniBriefs.map((mb) => mb.name),
      resolved: true,
      ...(projectOverride !== undefined ? { projectOverride } : {}),
      ...(inferredArea !== undefined ? { inferredArea } : {}),
      ...(explicitArea !== undefined ? { explicitArea } : {}),
    },
    attendeeMiniBriefs,
  };
}

async function buildAttendeeMiniBrief(
  slug: string,
  name: string,
  paths: WorkspacePaths,
  deps: MeetingBriefDeps,
  index: MeetingIndexEntry[],
  sources: string[],
): Promise<AttendeeMiniBrief> {
  // Composition order (M2): highlights → recent meetings → commitments → metadata.
  // Sources are collected into the parent `sources` array.

  // Locate person file
  const PEOPLE_CATEGORIES = ['internal', 'customers', 'users'] as const;
  let personFile: { path: string; content: string } | null = null;
  for (const cat of PEOPLE_CATEGORIES) {
    const candidate = join(paths.people, cat, `${slug}.md`);
    const content = await deps.storage.read(candidate);
    if (content) {
      personFile = { path: candidate, content };
      break;
    }
  }

  let highlights: string[] = [];
  let role: string | undefined;
  if (personFile) {
    sources.push(relativeToRoot(personFile.path, paths.root));
    const parsed = parseFrontmatter(personFile.content);
    const fm = parsed?.frontmatter ?? {};
    role = typeof fm.role === 'string' ? fm.role : undefined;
    const extracted = extractMemoryHighlights(personFile.content);
    // Top 3 stances/asks/concerns combined (highlights-first)
    highlights = [
      ...extracted.stances.slice(0, 2).map((s) => `_stance_: ${s}`),
      ...extracted.asks.slice(0, 1).map((s) => `_ask_: ${s}`),
      ...extracted.concerns.slice(0, 1).map((s) => `_concern_: ${s}`),
    ].slice(0, 3);
  }

  const recent = meetingsForPerson(index, slug, name).slice(0, MEETING_MINIBRIEF_RECENT_LIMIT);
  const commitments = await deps.commitments.listForPerson(slug);

  return {
    slug,
    name,
    resolved: !!personFile,
    role,
    highlights,
    recentMeetings: recent.map((m) => ({
      title: m.title,
      date: m.date,
      path: relativeToRoot(m.path, paths.root),
    })),
    commitments,
  };
}

function formatAttendeeMiniBriefBullets(mb: AttendeeMiniBrief): string[] {
  if (!mb.resolved) {
    const stub = mb.email
      ? `Attendee: ${mb.email} — no person file (consider \`arete people add\`)`
      : `Attendee: ${mb.name} — no person file`;
    return [stub];
  }

  const lines: string[] = [];
  const meta = mb.role ? ` _(${mb.role})_` : '';
  lines.push(`**${mb.name}**${meta}`);

  // Highlights first (M2 — load-bearing signal stays alive when truncation bites)
  if (mb.highlights && mb.highlights.length > 0) {
    for (const h of mb.highlights) lines.push(`  - ${h}`);
  }

  if (mb.recentMeetings && mb.recentMeetings.length > 0) {
    lines.push(`  - _Recent meetings (${mb.recentMeetings.length})_:`);
    for (const r of mb.recentMeetings.slice(0, 3)) {
      lines.push(`    - ${r.title} (${r.date}) — \`${r.path}\``);
    }
  }

  if (mb.commitments && mb.commitments.length > 0) {
    lines.push(`  - _Open commitments (${mb.commitments.length})_:`);
    for (const c of mb.commitments.slice(0, 3)) {
      lines.push(`    - ${renderCommitmentBullet(c)}`);
    }
  }

  return lines;
}

async function buildUnresolvedMeetingBrief(
  input: string,
  paths: WorkspacePaths,
  deps: MeetingBriefDeps,
): Promise<MeetingBrief> {
  const sources: string[] = [];
  const sections: BriefSection[] = [];

  sections.push({
    heading: 'Attendees',
    bullets: ['_(unresolved — no calendar match, no saved file)_'],
  });
  sections.push({
    heading: 'Meeting area & projects',
    bullets: ['_(unresolved — no calendar match, no saved file)_'],
  });

  // Best-effort wiki match against title
  try {
    const wiki = await retrieveWiki(deps.topicMemory, paths, input);
    if (wiki.length > 0) {
      const bullets = wiki.map((w) => {
        const rel = relativeToRoot(w.path, paths.root);
        sources.push(rel);
        return `**${w.slug}** — ${w.summary || '(no summary)'} — \`${rel}\``;
      });
      sections.push({
        heading: `Related wiki pages (${wiki.length})`,
        bullets,
      });
    }
  } catch {
    // best-effort
  }

  return {
    mode: 'meeting',
    subject: input,
    subjectSlug: input,
    sections,
    sources,
    truncated: false,
    metadata: {
      title: input,
      attendees: [],
      resolved: false,
      unresolved: true,
    },
    attendeeMiniBriefs: [],
  };
}
