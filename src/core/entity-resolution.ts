/**
 * Entity Resolution Service — Intelligence Layer (Phase 3)
 *
 * Resolve ambiguous references ("Jane", "that onboarding meeting",
 * "the search project") to specific workspace entities (person files,
 * meeting files, project directories).
 *
 * Formalizes the entity resolution logic previously described in the
 * get_meeting_context pattern (PATTERNS.md).
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import type {
  WorkspacePaths,
  EntityType,
  ResolvedEntity,
} from '../types.js';
import { slugifyPersonName } from './people.js';

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a string for fuzzy comparison: lowercase, strip non-alphanum,
 * collapse whitespace.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how well a candidate matches a reference.
 * Returns 0 for no match, higher for better matches.
 *
 * Scoring:
 * - Exact match (normalized): 100
 * - Slug match: 90
 * - Candidate starts with reference: 70
 * - Reference starts with candidate: 60
 * - All reference words found in candidate: 50
 * - Partial word overlap: 10 * matchingWords
 */
function fuzzyScore(reference: string, candidate: string): number {
  const refNorm = normalize(reference);
  const candNorm = normalize(candidate);

  if (!refNorm || !candNorm) return 0;

  // Exact match
  if (refNorm === candNorm) return 100;

  // Slug match (hyphenated form)
  const refSlug = refNorm.replace(/\s+/g, '-');
  const candSlug = candNorm.replace(/\s+/g, '-');
  if (refSlug === candSlug) return 90;

  // Candidate starts with reference (e.g. "jane" matches "jane doe")
  if (candNorm.startsWith(refNorm)) return 70;

  // Reference starts with candidate (e.g. "jane doe smith" matches "jane doe")
  if (refNorm.startsWith(candNorm)) return 60;

  // All reference words found in candidate
  const refWords = refNorm.split(' ').filter(w => w.length > 0);
  const candWords = candNorm.split(' ').filter(w => w.length > 0);
  const allFound = refWords.every(rw => candWords.some(cw => cw.includes(rw) || rw.includes(cw)));
  if (allFound && refWords.length > 0) return 50;

  // Partial word overlap
  const matching = refWords.filter(rw => candWords.some(cw => cw.includes(rw) || rw.includes(cw)));
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

function resolvePerson(reference: string, paths: WorkspacePaths): ResolvedEntity[] {
  const results: ResolvedEntity[] = [];
  const categories = ['internal', 'customers', 'users'] as const;

  // Also try matching by slug form of the reference
  const refSlug = slugifyPersonName(reference);
  const refLower = reference.toLowerCase().trim();

  for (const cat of categories) {
    const catDir = join(paths.people, cat);
    if (!existsSync(catDir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(catDir, { withFileTypes: true })
        .filter(d => d.isFile() && d.name.endsWith('.md') && d.name !== 'index.md')
        .map(d => d.name);
    } catch {
      continue;
    }

    for (const fileName of entries) {
      const slug = fileName.replace(/\.md$/, '');
      const filePath = join(catDir, fileName);

      let content: string;
      try {
        content = readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const parsed = parseFrontmatter(content);
      if (!parsed) continue;

      const { frontmatter } = parsed;
      const name = typeof frontmatter.name === 'string' ? frontmatter.name : '';
      const email = typeof frontmatter.email === 'string' ? frontmatter.email : '';
      const role = typeof frontmatter.role === 'string' ? frontmatter.role : '';
      const company = typeof frontmatter.company === 'string' ? frontmatter.company : '';

      // Score against name, slug, and email
      let bestScore = 0;
      bestScore = Math.max(bestScore, fuzzyScore(reference, name));
      bestScore = Math.max(bestScore, fuzzyScore(refSlug, slug));

      // Email match (exact, case-insensitive)
      if (email && refLower === email.toLowerCase()) {
        bestScore = Math.max(bestScore, 95);
      }
      // Email prefix match (e.g. "jane" matches "jane@acme.com")
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

function resolveMeeting(reference: string, paths: WorkspacePaths): ResolvedEntity[] {
  const results: ResolvedEntity[] = [];
  const meetingsDir = join(paths.resources, 'meetings');
  if (!existsSync(meetingsDir)) return results;

  let entries: string[];
  try {
    entries = readdirSync(meetingsDir, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith('.md') && d.name !== 'index.md')
      .map(d => d.name);
  } catch {
    return results;
  }

  const refNorm = normalize(reference);

  for (const fileName of entries) {
    const filePath = join(meetingsDir, fileName);

    // Quick filename-based scoring (date and title slug are in the filename)
    const fileBase = fileName.replace(/\.md$/, '');
    let bestScore = fuzzyScore(reference, fileBase);

    // Parse frontmatter for richer matching
    let title = '';
    let date = '';
    let attendees = '';
    let attendeeIds: string[] = [];

    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = parseFrontmatter(content);
      if (parsed) {
        const fm = parsed.frontmatter;
        title = typeof fm.title === 'string' ? fm.title : '';
        date = typeof fm.date === 'string' ? fm.date : '';
        attendees = typeof fm.attendees === 'string' ? fm.attendees : '';
        attendeeIds = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : [];
      }
    } catch {
      // use filename-only scoring
    }

    // Score against title
    if (title) {
      bestScore = Math.max(bestScore, fuzzyScore(reference, title));
    }

    // Score against date (exact date match is strong)
    if (date && refNorm.includes(normalize(date))) {
      bestScore = Math.max(bestScore, 80);
    }

    // Score against attendees
    if (attendees) {
      const attendeeScore = fuzzyScore(reference, attendees);
      if (attendeeScore > 0) {
        bestScore = Math.max(bestScore, Math.min(attendeeScore, 50));
      }
    }

    // Score against attendee_ids (slug match)
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

function resolveProject(reference: string, paths: WorkspacePaths): ResolvedEntity[] {
  const results: ResolvedEntity[] = [];
  const projectBases = [
    { dir: join(paths.projects, 'active'), status: 'active' },
    { dir: join(paths.projects, 'archive'), status: 'archived' },
  ];

  for (const { dir, status } of projectBases) {
    if (!existsSync(dir)) continue;

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map(d => d.name);
    } catch {
      continue;
    }

    for (const projName of projectDirs) {
      const projDir = join(dir, projName);
      const readmePath = join(projDir, 'README.md');

      // Score against directory name
      let bestScore = fuzzyScore(reference, projName);

      // Score against README content if available
      let title = projName;
      let summary = '';
      if (existsSync(readmePath)) {
        try {
          const content = readFileSync(readmePath, 'utf8');
          // Extract title from first # heading
          const titleMatch = content.match(/^#\s+(.+)/m);
          if (titleMatch) {
            title = titleMatch[1].trim();
            bestScore = Math.max(bestScore, fuzzyScore(reference, title));
          }
          // Also check frontmatter
          const parsed = parseFrontmatter(content);
          if (parsed?.frontmatter.title) {
            const fmTitle = String(parsed.frontmatter.title);
            bestScore = Math.max(bestScore, fuzzyScore(reference, fmTitle));
          }
          // Check if reference words appear in the README body
          const refWords = normalize(reference).split(' ').filter(w => w.length > 1);
          const bodyLower = content.toLowerCase();
          const bodyMatches = refWords.filter(w => bodyLower.includes(w));
          if (bodyMatches.length > 0 && bodyMatches.length >= refWords.length * 0.5) {
            bestScore = Math.max(bestScore, 10 * bodyMatches.length);
          }

          // Extract first paragraph as summary
          const lines = content.replace(/^---[\s\S]*?---\n?/, '').split('\n');
          const nonHeading = lines.filter(l => !l.startsWith('#') && l.trim().length > 0);
          summary = nonHeading.slice(0, 2).join(' ').trim().slice(0, 200);
        } catch {
          // use directory-name scoring only
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
// Main function
// ---------------------------------------------------------------------------

/**
 * Resolve an ambiguous reference to a workspace entity.
 *
 * @param reference - Ambiguous name/description (e.g. "Jane", "onboarding meeting", "search project")
 * @param entityType - Type of entity to search for, or 'any' for all types
 * @param paths - Workspace paths
 * @returns The best matching ResolvedEntity, or null if no match found
 */
export function resolveEntity(
  reference: string,
  entityType: EntityType,
  paths: WorkspacePaths,
): ResolvedEntity | null {
  if (!reference?.trim()) return null;

  const candidates: ResolvedEntity[] = [];

  if (entityType === 'person' || entityType === 'any') {
    candidates.push(...resolvePerson(reference, paths));
  }
  if (entityType === 'meeting' || entityType === 'any') {
    candidates.push(...resolveMeeting(reference, paths));
  }
  if (entityType === 'project' || entityType === 'any') {
    candidates.push(...resolveProject(reference, paths));
  }

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Resolve an ambiguous reference and return all matching entities (ranked).
 *
 * @param reference - Ambiguous name/description
 * @param entityType - Type of entity to search for, or 'any'
 * @param paths - Workspace paths
 * @param limit - Maximum results to return (default 5)
 * @returns Array of matching ResolvedEntity, sorted by score descending
 */
export function resolveEntities(
  reference: string,
  entityType: EntityType,
  paths: WorkspacePaths,
  limit = 5,
): ResolvedEntity[] {
  if (!reference?.trim()) return [];

  const candidates: ResolvedEntity[] = [];

  if (entityType === 'person' || entityType === 'any') {
    candidates.push(...resolvePerson(reference, paths));
  }
  if (entityType === 'meeting' || entityType === 'any') {
    candidates.push(...resolveMeeting(reference, paths));
  }
  if (entityType === 'project' || entityType === 'any') {
    candidates.push(...resolveProject(reference, paths));
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}
