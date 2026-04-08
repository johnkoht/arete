/**
 * Meeting context service — assembles context bundles for meeting files.
 *
 * Provides a single function `buildMeetingContext(meetingPath, options)` that:
 * 1. Reads meeting file (title, date, attendees, transcript)
 * 2. Finds linked agenda (via frontmatter or fuzzy match)
 * 3. Resolves attendees to person profiles with stances/openItems
 * 4. Gathers related workspace context via brief service
 *
 * Used by `arete meeting context <file>` CLI command.
 */

import { join, basename, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths, AreaContext } from '../models/index.js';
import type { IntelligenceService } from './intelligence.js';
import type { EntityService } from './entity.js';
import { AreaParserService } from './area-parser.js';
import { parseAgendaItems, getUncheckedAgendaItems } from '../utils/agenda.js';
import type { AgendaItem } from '../utils/agenda.js';
import { findMatchingAgenda, type AgendaMatchResult } from '../integrations/meetings.js';
import { slugifyPersonName } from './entity.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export AgendaItem from utils for convenience (but don't re-declare)
export type { AgendaItem } from '../utils/agenda.js';

/**
 * Resolved attendee with full person context.
 */
export interface ResolvedAttendee {
  slug: string;
  email: string;
  name: string;
  category: string;
  profile: string;
  stances: string[];
  openItems: string[];
  recentMeetings: string[];
}

/**
 * Unknown attendee not found in people directory.
 */
export interface UnknownAttendee {
  email: string;
  name: string;
}

/**
 * Related context from brief service.
 */
export interface RelatedContext {
  goals: Array<{ slug: string; title: string; summary: string }>;
  projects: Array<{ slug: string; title: string; summary: string }>;
  recentDecisions: string[];
  recentLearnings: string[];
}

/**
 * Agenda candidate for user selection when no auto-match found.
 */
export interface AgendaCandidate {
  path: string;
  meetingTitle?: string;
  score: number;
}

/**
 * Complete meeting context bundle.
 */
export interface MeetingContextBundle {
  meeting: {
    path: string;
    title: string;
    date: string;
    attendees: string[];
    transcript: string;
  };
  agenda: {
    path: string;
    items: AgendaItem[];
    unchecked: string[];
  } | null;
  /** Metadata about agenda matching for skill-level prompting */
  agendaMatch?: {
    matchType: 'exact' | 'fuzzy' | 'none';
    confidence: number;
    /** Candidate agendas for user selection when no auto-match */
    candidates: AgendaCandidate[];
  };
  attendees: ResolvedAttendee[];
  unknownAttendees: UnknownAttendee[];
  relatedContext: RelatedContext;
  areaContext?: AreaContext | null;
  warnings: string[];
  /**
   * Existing open tasks from now/week.md and now/tasks.md.
   * Included so the extraction LLM can avoid re-proposing already-tracked tasks.
   * Cap at 20 items to avoid bloating the prompt.
   */
  existingTasks?: string[];
}

/**
 * Options for building meeting context.
 */
export interface BuildMeetingContextOptions {
  /** Skip agenda lookup entirely. */
  skipAgenda?: boolean;
  /** Skip attendee resolution. */
  skipPeople?: boolean;
}

/**
 * Dependencies for buildMeetingContext (DI pattern).
 */
export interface MeetingContextDeps {
  storage: StorageAdapter;
  intelligence: IntelligenceService;
  entity: EntityService;
  paths: WorkspacePaths;
  areaParser?: AreaParserService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface ParsedMeetingFrontmatter {
  title: string;
  date: string;
  attendees: Array<{ name: string; email: string }>;
  attendee_ids?: string[];
  agenda?: string;
  area?: string;
  /** Slugified topic keywords extracted from meeting intelligence. */
  topics?: string[];
  /** Count of open action items (pending + approved, not skipped). */
  open_action_items?: number;
  /** Count of action items where the user owes a counterparty. */
  my_commitments?: number;
  /** Count of action items where a counterparty owes the user. */
  their_commitments?: number;
  /** Count of staged decisions. */
  decisions_count?: number;
  /** Count of staged learnings. */
  learnings_count?: number;
}

export interface ParsedMeetingFile {
  frontmatter: ParsedMeetingFrontmatter;
  body: string;
}

/**
 * Parse meeting file frontmatter and body.
 */
function parseMeetingFile(content: string): ParsedMeetingFile | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  try {
    const fm = parseYaml(match[1]) as Record<string, unknown>;
    const body = match[2];

    // Parse title
    const title = typeof fm.title === 'string' ? fm.title : '';

    // Parse date (handle ISO with time)
    let date = '';
    if (typeof fm.date === 'string') {
      // Extract YYYY-MM-DD portion
      const dateMatch = fm.date.match(/^(\d{4}-\d{2}-\d{2})/);
      date = dateMatch ? dateMatch[1] : fm.date;
    }

    // Parse attendees (array of { name, email } or strings)
    const attendees: Array<{ name: string; email: string }> = [];
    if (Array.isArray(fm.attendees)) {
      for (const a of fm.attendees) {
        if (typeof a === 'string') {
          // Try to parse "Name <email>" format
          const angleMatch = a.match(/^(.+?)\s*<([^>]+)>$/);
          if (angleMatch) {
            attendees.push({ name: angleMatch[1].trim(), email: angleMatch[2].trim() });
          } else if (a.includes('@')) {
            // Just an email
            attendees.push({ name: a.split('@')[0].replace(/[._-]/g, ' '), email: a });
          } else {
            attendees.push({ name: a, email: '' });
          }
        } else if (typeof a === 'object' && a !== null) {
          const obj = a as Record<string, unknown>;
          attendees.push({
            name: typeof obj.name === 'string' ? obj.name : '',
            email: typeof obj.email === 'string' ? obj.email : '',
          });
        }
      }
    }

    // Parse attendee_ids (array of slugs)
    const attendee_ids = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : undefined;

    // Parse agenda path if present
    const agenda = typeof fm.agenda === 'string' ? fm.agenda : undefined;

    // Parse area slug if present
    const area = typeof fm.area === 'string' && fm.area.trim() !== '' ? fm.area.trim() : undefined;

    // Parse agent-facing fields (written by meeting-apply after extraction)
    const topics = Array.isArray(fm.topics) ? fm.topics.map(String) : undefined;
    const open_action_items = typeof fm.open_action_items === 'number' ? fm.open_action_items : undefined;
    const my_commitments = typeof fm.my_commitments === 'number' ? fm.my_commitments : undefined;
    const their_commitments = typeof fm.their_commitments === 'number' ? fm.their_commitments : undefined;
    const decisions_count = typeof fm.decisions_count === 'number' ? fm.decisions_count : undefined;
    const learnings_count = typeof fm.learnings_count === 'number' ? fm.learnings_count : undefined;

    return {
      frontmatter: {
        title, date, attendees, attendee_ids, agenda, area,
        topics, open_action_items, my_commitments, their_commitments,
        decisions_count, learnings_count,
      },
      body,
    };
  } catch {
    return null;
  }
}

/**
 * Extract transcript from meeting body.
 * Looks for ## Transcript section or uses the entire body.
 */
function extractTranscript(body: string): string {
  // Try to find a dedicated Transcript section
  const transcriptMatch = body.match(/^## Transcript\s*\n([\s\S]*?)(?=^## |\Z)/m);
  if (transcriptMatch) {
    return transcriptMatch[1].trim();
  }
  
  // Otherwise return the full body (minus frontmatter-only files)
  return body.trim();
}

/**
 * Parse person file to extract profile summary, stances, and open items.
 */
async function parsePersonFile(
  storage: StorageAdapter,
  personPath: string,
): Promise<{ profile: string; stances: string[]; openItems: string[] } | null> {
  const content = await storage.read(personPath);
  if (!content) return null;

  const stances: string[] = [];
  const openItems: string[] = [];
  let profile = '';

  const lines = content.split('\n');
  let currentSection = '';
  let profileLines: string[] = [];
  let inAutoSection = false;
  let inFrontmatter = false;
  let frontmatterCount = 0;

  for (const line of lines) {
    // Track frontmatter boundaries
    if (line.startsWith('---')) {
      frontmatterCount++;
      if (frontmatterCount === 1) {
        inFrontmatter = true;
      } else if (frontmatterCount === 2) {
        inFrontmatter = false;
      }
      continue;
    }

    // Skip content inside frontmatter
    if (inFrontmatter) continue;

    // Track auto-generated section
    if (line.includes('<!-- AUTO_PERSON_MEMORY:START -->')) {
      inAutoSection = true;
      continue;
    }
    if (line.includes('<!-- AUTO_PERSON_MEMORY:END -->')) {
      inAutoSection = false;
      continue;
    }

    // Track sections
    const sectionMatch = line.match(/^###?\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    // Extract stances
    if (currentSection === 'stances' && line.startsWith('- ') && !line.includes('None detected')) {
      stances.push(line.replace(/^- /, '').trim());
    }

    // Extract open items (both I owe them and they owe me)
    if (
      (currentSection.includes('open items') || currentSection.includes('open commitments')) &&
      line.startsWith('- ') &&
      !line.includes('None detected')
    ) {
      // Strip checkbox syntax and hash comments
      const cleanedItem = line
        .replace(/^- \[[x ]\]\s*/i, '- ')
        .replace(/<!--.*?-->/g, '')
        .replace(/^- /, '')
        .trim();
      if (cleanedItem) {
        openItems.push(cleanedItem);
      }
    }

    // Build profile from non-section content (first paragraph after frontmatter)
    if (!inAutoSection && !currentSection && !line.startsWith('#') && line.trim()) {
      profileLines.push(line.trim());
    }
  }

  // Use first few lines as profile summary
  profile = profileLines.slice(0, 3).join(' ').slice(0, 500);

  return { profile, stances, openItems };
}

/**
 * Calculate YYYY-MM-DD cutoff date string for 60 days before reference date.
 */
function calculateCutoffDateString(referenceDate: Date, daysBack: number = 60): string {
  const cutoff = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate() - daysBack,
  ));
  const yyyy = cutoff.getUTCFullYear();
  const mm = String(cutoff.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(cutoff.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Extract date prefix from meeting filename.
 * Returns null if filename doesn't match YYYY-MM-DD-*.md pattern.
 */
function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : null;
}

/**
 * Find recent meetings for a person by scanning meeting files.
 *
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 */
async function findRecentMeetings(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  personSlug: string,
  personEmail: string,
  limit: number = 5,
  referenceDate?: Date,
): Promise<string[]> {
  const meetingsDir = join(paths.resources, 'meetings');
  if (!(await storage.exists(meetingsDir))) return [];

  const files = await storage.list(meetingsDir, { extensions: ['.md'] });
  const meetingTitles: Array<{ date: string; title: string }> = [];

  // Calculate 60-day cutoff for filtering old files
  const ref = referenceDate ?? new Date();
  const cutoffDateString = calculateCutoffDateString(ref, 60);

  for (const file of files) {
    if (file.endsWith('index.md')) continue;

    // Extract date from filename for early filtering
    const filename = basename(file);
    const fileDate = extractDateFromFilename(filename);

    // Skip files older than 60 days (lexicographic comparison)
    // Boundary: files at exactly 60 days are included (>=), >60 days excluded (<)
    if (fileDate !== null && fileDate < cutoffDateString) {
      continue;
    }

    // Non-standard filenames (no date prefix) are read anyway (graceful fallback)
    const content = await storage.read(file);
    if (!content) continue;

    const parsed = parseMeetingFile(content);
    if (!parsed) continue;

    // Check if person is an attendee (via attendees array)
    const isAttendee = parsed.frontmatter.attendees.some(
      (a) =>
        a.email.toLowerCase() === personEmail.toLowerCase() ||
        slugifyPersonName(a.name) === personSlug,
    );

    // Also check attendee_ids in frontmatter (already parsed, no second YAML parse needed)
    const hasSlug = parsed.frontmatter.attendee_ids?.includes(personSlug) ?? false;

    if (isAttendee || hasSlug) {
      meetingTitles.push({ date: parsed.frontmatter.date, title: parsed.frontmatter.title });
    }
  }

  // Sort by date descending and return titles
  return meetingTitles
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((m) => m.title);
}

/**
 * Find recent meetings for multiple attendees in a single pass through meeting files.
 *
 * This batched version reads each meeting file once regardless of attendee count,
 * reducing file reads from O(A×N) to O(N) where A = attendees, N = meetings.
 *
 * @param storage - StorageAdapter for file access (DI pattern)
 * @param paths - WorkspacePaths for meetings directory location
 * @param attendees - Array of attendee slugs and emails to look up
 * @param limit - Maximum meetings to return per attendee (default 5)
 * @param referenceDate - Pin the "current date" for testability (defaults to now)
 * @returns Map<slug, titles[]> for ALL requested attendees (empty array if no meetings)
 */
async function findRecentMeetingsForAttendees(
  storage: StorageAdapter,
  paths: WorkspacePaths,
  attendees: Array<{ slug: string; email: string }>,
  limit: number = 5,
  referenceDate?: Date,
): Promise<Map<string, string[]>> {
  // Initialize result map with empty arrays for all requested attendees
  const result = new Map<string, Array<{ date: string; title: string }>>();
  for (const attendee of attendees) {
    result.set(attendee.slug, []);
  }

  // Early exit if no attendees or meetings directory doesn't exist
  if (attendees.length === 0) {
    return new Map<string, string[]>();
  }

  const meetingsDir = join(paths.resources, 'meetings');
  if (!(await storage.exists(meetingsDir))) {
    // Return empty arrays for all requested attendees
    const emptyResult = new Map<string, string[]>();
    for (const attendee of attendees) {
      emptyResult.set(attendee.slug, []);
    }
    return emptyResult;
  }

  const files = await storage.list(meetingsDir, { extensions: ['.md'] });

  // Calculate 60-day cutoff for filtering old files (reuses Task 2 logic)
  const ref = referenceDate ?? new Date();
  const cutoffDateString = calculateCutoffDateString(ref, 60);

  // Build lookup structures for fast attendee matching
  const slugSet = new Set(attendees.map((a) => a.slug));
  const emailToSlug = new Map<string, string>();
  for (const attendee of attendees) {
    if (attendee.email) {
      emailToSlug.set(attendee.email.toLowerCase(), attendee.slug);
    }
  }

  // Single pass through meeting files
  for (const file of files) {
    if (file.endsWith('index.md')) continue;

    // Extract date from filename for early filtering
    const filename = basename(file);
    const fileDate = extractDateFromFilename(filename);

    // Skip files older than 60 days (lexicographic comparison)
    // Boundary: files at exactly 60 days are included (>=), >60 days excluded (<)
    if (fileDate !== null && fileDate < cutoffDateString) {
      continue;
    }

    // Non-standard filenames (no date prefix) are read anyway (graceful fallback)
    const content = await storage.read(file);
    if (!content) continue;

    const parsed = parseMeetingFile(content);
    if (!parsed) continue;

    const meetingDate = parsed.frontmatter.date;
    const meetingTitle = parsed.frontmatter.title;

    // Check ALL requested attendees against this single meeting file
    // Track which attendees were found in this meeting to avoid duplicates
    const foundSlugs = new Set<string>();

    // Check attendee_ids first (direct slug match)
    if (parsed.frontmatter.attendee_ids) {
      for (const id of parsed.frontmatter.attendee_ids) {
        if (slugSet.has(id)) {
          foundSlugs.add(id);
        }
      }
    }

    // Check attendees array (email and name match)
    for (const meetingAttendee of parsed.frontmatter.attendees) {
      // Check email match
      if (meetingAttendee.email) {
        const matchedSlug = emailToSlug.get(meetingAttendee.email.toLowerCase());
        if (matchedSlug) {
          foundSlugs.add(matchedSlug);
        }
      }

      // Check name match (slugify and compare)
      const attendeeSlug = slugifyPersonName(meetingAttendee.name);
      if (slugSet.has(attendeeSlug)) {
        foundSlugs.add(attendeeSlug);
      }
    }

    // Add meeting to all matched attendees
    for (const slug of foundSlugs) {
      const meetings = result.get(slug);
      if (meetings) {
        meetings.push({ date: meetingDate, title: meetingTitle });
      }
    }
  }

  // Sort by date descending and limit results for each attendee
  const finalResult = new Map<string, string[]>();
  for (const [slug, meetings] of result) {
    const sortedTitles = meetings
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map((m) => m.title);
    finalResult.set(slug, sortedTitles);
  }

  return finalResult;
}

/**
 * Resolve a single attendee to their person profile.
 *
 * @param precomputedMeetings - Optional Map<slug, titles[]> from findRecentMeetingsForAttendees().
 *                              If provided and contains the person slug, uses that data instead
 *                              of calling findRecentMeetings() (enables batched lookup).
 */
async function resolveAttendee(
  storage: StorageAdapter,
  entity: EntityService,
  paths: WorkspacePaths,
  attendee: { name: string; email: string },
  precomputedMeetings?: Map<string, string[]>,
): Promise<ResolvedAttendee | null> {
  // Try resolution by email first, then by name
  const resolved = await entity.resolveAll(
    attendee.email || attendee.name,
    'person',
    paths,
    1,
  );

  if (resolved.length === 0) return null;

  const person = resolved[0];
  const personPath = person.path;

  // Generate slug from name if not present (slug is optional in ResolvedEntity)
  const personSlug = person.slug ?? slugifyPersonName(person.name);
  const personEmail = attendee.email || (person.metadata.email as string) || '';

  // Parse person file for profile details
  const personDetails = await parsePersonFile(storage, personPath);

  // Find recent meetings - use precomputed data if available, otherwise fall back
  let recentMeetings: string[];
  if (precomputedMeetings && precomputedMeetings.has(personSlug)) {
    // Use batched lookup result
    recentMeetings = precomputedMeetings.get(personSlug) ?? [];
  } else {
    // Fall back to individual lookup (backward compatibility)
    recentMeetings = await findRecentMeetings(
      storage,
      paths,
      personSlug,
      personEmail,
    );
  }

  return {
    slug: personSlug,
    email: personEmail,
    name: person.name,
    category: (person.metadata.category as string) || 'unknown',
    profile: personDetails?.profile || '',
    stances: personDetails?.stances || [],
    openItems: personDetails?.openItems || [],
    recentMeetings,
  };
}

/**
 * Extract related context from brief service response.
 */
function extractRelatedContext(briefingText: string): RelatedContext {
  const result: RelatedContext = {
    goals: [],
    projects: [],
    recentDecisions: [],
    recentLearnings: [],
  };

  const lines = briefingText.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    if (!line.startsWith('- ')) continue;

    const item = line.replace(/^- /, '').trim();

    if (currentSection === 'goal' || currentSection === 'goals') {
      // Parse: **Goal**: title — Source: `path` (relevance: N.NN)
      const goalMatch = item.match(/\*\*Goal\*\*:\s*(.+?)\s*—\s*Source:\s*`([^`]+)`/);
      if (goalMatch) {
        const pathParts = goalMatch[2].split('/');
        const slug = pathParts[pathParts.length - 1]?.replace(/\.md$/, '') || '';
        result.goals.push({
          slug,
          title: goalMatch[1].trim(),
          summary: goalMatch[1].trim(),
        });
      }
    }

    if (currentSection === 'project' || currentSection === 'projects') {
      // Parse: summary — Source: `path`
      const projectMatch = item.match(/(.+?)\s*—\s*Source:\s*`([^`]+)`/);
      if (projectMatch) {
        const pathParts = projectMatch[2].split('/');
        const slug = pathParts[pathParts.length - 1]?.replace(/\.md$/, '')?.replace('/README', '') || '';
        result.projects.push({
          slug,
          title: projectMatch[1].trim(),
          summary: projectMatch[1].trim(),
        });
      }
    }

    if (currentSection === 'relevant memory') {
      // Parse: **Decision**: [date] title — Source: `path`
      // Parse: **Learning**: [date] title — Source: `path`
      const decisionMatch = item.match(/\*\*Decision\*\*:\s*(?:\[[\d-]+\]\s*)?(.+?)\s*—/);
      if (decisionMatch) {
        result.recentDecisions.push(decisionMatch[1].trim());
      }

      const learningMatch = item.match(/\*\*Learning\*\*:\s*(?:\[[\d-]+\]\s*)?(.+?)\s*—/);
      if (learningMatch) {
        result.recentLearnings.push(learningMatch[1].trim());
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Build a complete context bundle for a meeting file.
 *
 * @param meetingPath - Absolute or relative path to the meeting file
 * @param deps - Dependencies (storage, intelligence, entity, paths)
 * @param options - Optional flags to skip agenda or people resolution
 * @returns MeetingContextBundle with all assembled context
 */
export async function buildMeetingContext(
  meetingPath: string,
  deps: MeetingContextDeps,
  options: BuildMeetingContextOptions = {},
): Promise<MeetingContextBundle> {
  const { storage, intelligence, entity, paths, areaParser } = deps;
  const warnings: string[] = [];

  // Create fallback areaParser if not provided (DI pattern)
  const resolvedAreaParser = areaParser ?? new AreaParserService(storage, paths.root);

  // Resolve path
  const absPath = meetingPath.startsWith('/')
    ? meetingPath
    : resolve(paths.root, meetingPath);

  // 1. Read and parse meeting file
  const content = await storage.read(absPath);
  if (!content) {
    throw new Error(`Meeting file not found: ${meetingPath}`);
  }

  const parsed = parseMeetingFile(content);
  if (!parsed) {
    throw new Error(`Failed to parse meeting file: ${meetingPath}`);
  }

  const { frontmatter, body } = parsed;
  const transcript = extractTranscript(body);

  // Build meeting section
  const meeting = {
    path: absPath,
    title: frontmatter.title,
    date: frontmatter.date,
    attendees: frontmatter.attendees.map((a) => a.email || a.name).filter(Boolean),
    transcript,
  };

  // 2. Find agenda
  let agenda: MeetingContextBundle['agenda'] = null;
  let agendaMatch: MeetingContextBundle['agendaMatch'] = undefined;
  
  if (!options.skipAgenda) {
    let agendaPath: string | null = null;
    let matchFromFrontmatter = false;

    // First check frontmatter agenda field (explicit link)
    if (frontmatter.agenda) {
      agendaPath = frontmatter.agenda.startsWith('/')
        ? frontmatter.agenda
        : resolve(paths.root, frontmatter.agenda);
      matchFromFrontmatter = true;
    } else {
      // Try to find matching agenda via date + title
      const matchResult = await findMatchingAgenda(
        storage,
        paths.root,
        frontmatter.date,
        frontmatter.title,
      );
      
      // Store match metadata for skill-level prompting
      agendaMatch = {
        matchType: matchResult.matchType,
        confidence: matchResult.confidence,
        candidates: matchResult.candidates,
      };
      
      // Only auto-link high-confidence matches (exact or fuzzy >= 0.7)
      if (matchResult.matchType === 'exact' || matchResult.confidence >= 0.7) {
        if (matchResult.match) {
          agendaPath = resolve(paths.root, matchResult.match);
        }
      } else if (matchResult.candidates.length > 0) {
        // Low confidence — add warning for skill to handle
        warnings.push(
          `Found ${matchResult.candidates.length} potential agenda(s) for this meeting but confidence is low. ` +
          `Use agendaMatch.candidates to prompt user for selection.`
        );
      }
    }

    if (agendaPath) {
      const agendaContent = await storage.read(agendaPath);
      if (agendaContent) {
        const items = parseAgendaItems(agendaContent);
        const unchecked = getUncheckedAgendaItems(agendaContent);
        agenda = {
          path: agendaPath,
          items,
          unchecked,
        };
        // If matched from frontmatter, set agendaMatch to reflect explicit link
        if (matchFromFrontmatter) {
          agendaMatch = { matchType: 'exact', confidence: 1.0, candidates: [] };
        }
      } else {
        warnings.push(`Agenda file not found: ${agendaPath}`);
      }
    }
  }

  // 3. Resolve attendees
  const resolvedAttendees: ResolvedAttendee[] = [];
  const unknownAttendees: UnknownAttendee[] = [];

  if (!options.skipPeople) {
    // Batch step: collect all potential attendee slugs/emails before the loop
    // We use slugifyPersonName on names to generate slugs for batched lookup
    const attendeesForBatch: Array<{ slug: string; email: string }> = frontmatter.attendees.map(
      (a) => ({
        slug: slugifyPersonName(a.name),
        email: a.email,
      }),
    );

    // Single call to get recent meetings for ALL attendees at once (O(N) instead of O(A×N))
    const precomputedMeetings = await findRecentMeetingsForAttendees(
      storage,
      paths,
      attendeesForBatch,
    );

    for (const attendee of frontmatter.attendees) {
      try {
        const resolved = await resolveAttendee(storage, entity, paths, attendee, precomputedMeetings);
        if (resolved) {
          resolvedAttendees.push(resolved);
        } else {
          unknownAttendees.push({
            email: attendee.email,
            name: attendee.name,
          });
          if (attendee.email || attendee.name) {
            warnings.push(`No profile found for: ${attendee.email || attendee.name}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to resolve attendee ${attendee.name}: ${msg}`);
        unknownAttendees.push({
          email: attendee.email,
          name: attendee.name,
        });
      }
    }
  }

  // 4. Area context resolution — frontmatter area takes precedence over title matching
  let areaContext: AreaContext | null = null;

  // Try frontmatter area first
  if (frontmatter.area) {
    try {
      areaContext = await resolvedAreaParser.getAreaContext(frontmatter.area);
      if (!areaContext) {
        // Frontmatter area slug doesn't match existing area file — warn and fall back
        warnings.push(`Frontmatter area '${frontmatter.area}' not found, falling back to title matching`);
      }
    } catch (err) {
      warnings.push(`Failed to load frontmatter area context: ${frontmatter.area}`);
    }
  }

  // Fall back to title matching if no frontmatter area or frontmatter area invalid
  if (!areaContext) {
    const areaMatch = await resolvedAreaParser.getAreaForMeeting(frontmatter.title);
    if (areaMatch) {
      try {
        areaContext = await resolvedAreaParser.getAreaContext(areaMatch.areaSlug);
        if (!areaContext) {
          warnings.push(`Area file not found: ${areaMatch.areaSlug}`);
        }
      } catch (err) {
        warnings.push(`Failed to load area context: ${areaMatch.areaSlug}`);
      }
    }
  }

  // 5. Get related context via brief service (using meeting title only)
  let relatedContext: RelatedContext = {
    goals: [],
    projects: [],
    recentDecisions: [],
    recentLearnings: [],
  };

  try {
    const briefing = await intelligence.assembleBriefing({
      task: frontmatter.title,
      paths,
    });
    relatedContext = extractRelatedContext(briefing.markdown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Brief service failed: ${msg}`);
    // Continue with empty relatedContext (pre-mortem mitigation)
  }

  // 6. Read existing open tasks from now/week.md and now/tasks.md
  // Included in context so the LLM can avoid re-proposing already-tracked tasks.
  // Capped at 20 tasks total to avoid bloating the prompt.
  const existingTasks: string[] = [];
  const MAX_EXISTING_TASKS = 20;
  const TASK_LINE_PATTERN = /^- \[ \] (.+)$/;

  function extractTaskTexts(content: string): string[] {
    const texts: string[] = [];
    for (const line of content.split('\n')) {
      const m = line.match(TASK_LINE_PATTERN);
      if (m) {
        // Strip @tag(value) metadata to get clean task text
        const clean = m[1].replace(/@[a-zA-Z]+\([^)]*\)/g, '').trim().replace(/\s+/g, ' ');
        if (clean) texts.push(clean);
      }
    }
    return texts;
  }

  try {
    const weekContent = await storage.read(join(paths.now, 'week.md')) ?? '';
    const tasksContent = await storage.read(join(paths.now, 'tasks.md')) ?? '';
    const weekTasks = extractTaskTexts(weekContent);
    const tasksTasks = extractTaskTexts(tasksContent);
    existingTasks.push(...weekTasks, ...tasksTasks);
    // Cap at limit
    existingTasks.splice(MAX_EXISTING_TASKS);
  } catch {
    // Non-fatal: if task files can't be read, continue without them
  }

  return {
    meeting,
    agenda,
    agendaMatch,
    attendees: resolvedAttendees,
    unknownAttendees,
    relatedContext,
    areaContext,
    warnings,
    ...(existingTasks.length > 0 && { existingTasks }),
  };
}

// ---------------------------------------------------------------------------
// Exports for testing (internal functions exposed for unit tests)
// ---------------------------------------------------------------------------

export {
  findRecentMeetings,
  findRecentMeetingsForAttendees,
  calculateCutoffDateString,
  extractDateFromFilename,
  parseMeetingFile,
};
