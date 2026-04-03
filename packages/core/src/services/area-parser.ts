/**
 * AreaParserService — parses area YAML frontmatter and provides meeting-to-area lookup.
 *
 * Areas are persistent work domains that accumulate intelligence across quarters.
 * Each area file (areas/*.md) has YAML frontmatter with recurring_meetings[] for mapping.
 *
 * Uses StorageAdapter for all file I/O (no direct fs calls).
 */

import { join, basename } from 'path';
import { parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { AreaMatch, AreaContext, AreaMemory, RecurringMeeting, AreaFrontmatter } from '../models/entities.js';

// ---------------------------------------------------------------------------
// Confidence constants (exported for testing and documentation)
// ---------------------------------------------------------------------------

/** Confidence for exact recurring meeting title match. */
export const EXACT_TITLE_MATCH_CONFIDENCE = 1.0;

/** Confidence when area name appears in meeting title or summary. */
export const AREA_NAME_MATCH_CONFIDENCE = 0.8;

/** Maximum confidence for keyword overlap matches. */
export const KEYWORD_OVERLAP_MAX_CONFIDENCE = 0.7;

/** Minimum number of overlapping keywords required for a match. */
export const MINIMUM_KEYWORD_OVERLAP = 2;

/** Minimum confidence threshold; matches below this return null. */
export const SUGGESTION_THRESHOLD = 0.5;

/** Maximum characters to use from transcript. */
const TRANSCRIPT_MAX_CHARS = 500;

// ---------------------------------------------------------------------------
// Stop words for keyword filtering
// ---------------------------------------------------------------------------

/** Common stop words filtered from keyword matching. */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its',
  'we', 'our', 'they', 'their', 'you', 'your', 'i', 'my', 'me', 'so', 'if', 'then',
  // Common meeting words that aren't content
  'meeting', 'sync', 'weekly', 'daily', 'monthly', 'call', 'discussion', 'review',
  'update', 'updates', 'standup', 'stand', 'up', 'check', 'team', 'status',
]);

// ---------------------------------------------------------------------------
// Helper functions for keyword matching
// ---------------------------------------------------------------------------

/**
 * Tokenize text with stop word filtering.
 * Lowercase, remove punctuation, split on whitespace, filter stop words.
 */
export function tokenizeWithStopWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 0 && !STOP_WORDS.has(word));
}

/**
 * Compute Jaccard similarity between two word sets.
 * Returns 0-1 where 1 is identical.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Input for area suggestion based on meeting content.
 */
export interface SuggestAreaInput {
  title: string;
  summary?: string;
  transcript?: string;
}

/**
 * Result of frontmatter parsing.
 */
interface ParsedFrontmatter {
  frontmatter: AreaFrontmatter;
  body: string;
}

/**
 * Parse frontmatter from a markdown file.
 * Returns null if no valid frontmatter found.
 */
function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const frontmatter = parseYaml(match[1] ?? '') as AreaFrontmatter;
    return { frontmatter, body: match[2] ?? '' };
  } catch {
    return null;
  }
}

/**
 * Extract a markdown section by header name.
 * Returns content between the header and the next header (or end of document).
 */
function extractSection(body: string, sectionName: string): string | null {
  // Match ## Section Name (case-insensitive)
  const regex = new RegExp(
    `^##\\s+${escapeRegExp(sectionName)}\\s*$([\\s\\S]*?)(?=^##\\s|$(?!\\s))`,
    'mi'
  );
  const match = body.match(regex);
  if (!match || !match[1]) return null;
  return match[1].trim() || null;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a slug from a filename.
 * Removes file extension.
 */
function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '');
}

/**
 * Check if meeting title matches a recurring meeting pattern.
 * Uses case-insensitive substring matching.
 */
function meetingTitleMatches(meetingTitle: string, recurringTitle: string): boolean {
  const normalizedMeeting = meetingTitle.toLowerCase();
  const normalizedRecurring = recurringTitle.toLowerCase();
  return normalizedMeeting.includes(normalizedRecurring);
}

/**
 * AreaParserService provides parsing and lookup for area files.
 *
 * @example
 * ```ts
 * const parser = new AreaParserService(storage, workspaceRoot);
 * const match = await parser.getAreaForMeeting('CoverWhale Sync');
 * // { areaSlug: 'glance-communications', matchType: 'recurring', confidence: 1.0 }
 *
 * const context = await parser.getAreaContext('glance-communications');
 * // { slug: 'glance-communications', name: 'Glance Communications', ... }
 * ```
 */
export class AreaParserService {
  private storage: StorageAdapter;
  private workspaceRoot: string;

  constructor(storage: StorageAdapter, workspaceRoot: string) {
    this.storage = storage;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get the areas directory path.
   */
  private get areasDir(): string {
    return join(this.workspaceRoot, 'areas');
  }

  /**
   * List all area files in the workspace.
   * Excludes template files (starting with _).
   */
  private async listAreaFiles(): Promise<string[]> {
    const files = await this.storage.list(this.areasDir, { extensions: ['.md'] });
    // Exclude template files (starting with _)
    return files.filter(f => !basename(f).startsWith('_'));
  }

  /**
   * Parse a single area file into AreaContext.
   * Returns null if file not found or malformed.
   */
  async parseAreaFile(filePath: string): Promise<AreaContext | null> {
    const content = await this.storage.read(filePath);
    if (!content) return null;

    const parsed = parseFrontmatter(content);
    if (!parsed) return null;

    const { frontmatter, body } = parsed;
    const slug = slugFromFilename(basename(filePath));

    // Extract recurring meetings from frontmatter
    const recurringMeetings: RecurringMeeting[] = [];
    if (Array.isArray(frontmatter.recurring_meetings)) {
      for (const meeting of frontmatter.recurring_meetings) {
        if (meeting && typeof meeting.title === 'string') {
          recurringMeetings.push({
            title: meeting.title,
            attendees: Array.isArray(meeting.attendees) ? meeting.attendees : [],
            frequency: typeof meeting.frequency === 'string' ? meeting.frequency : undefined,
          });
        }
      }
    }

    // Extract markdown sections
    const currentState = extractSection(body, 'Current State');
    const keyDecisions = extractSection(body, 'Key Decisions');
    const backlog = extractSection(body, 'Backlog');
    const activeGoals = extractSection(body, 'Active Goals');
    const activeWork = extractSection(body, 'Active Work');
    const openCommitments = extractSection(body, 'Open Commitments');
    const notes = extractSection(body, 'Notes');

    // Parse memory.md for this area (areas/{slug}/memory.md)
    const memory = await this.parseMemoryFile(slug);

    return {
      slug,
      name: typeof frontmatter.area === 'string' ? frontmatter.area : slug,
      status: typeof frontmatter.status === 'string' ? frontmatter.status : 'active',
      recurringMeetings,
      filePath,
      sections: {
        currentState,
        keyDecisions,
        backlog,
        activeGoals,
        activeWork,
        openCommitments,
        notes,
      },
      memory: memory ?? undefined,
    };
  }

  /**
   * Parse a memory.md file for an area.
   * Returns null if file doesn't exist.
   * Lenient: missing sections return empty arrays.
   */
  async parseMemoryFile(areaSlug: string): Promise<AreaMemory | null> {
    const memoryPath = join(this.areasDir, areaSlug, 'memory.md');
    const content = await this.storage.read(memoryPath);
    if (!content) return null;

    return {
      keywords: this.parseListSection(content, 'keywords') ?? [],
      activePeople: this.parseListSection(content, 'active people') ?? [],
      openWork: this.parseListSection(content, 'open work') ?? [],
      recentlyCompleted: this.parseListSection(content, 'recently completed') ?? [],
      recentDecisions: this.parseListSection(content, 'recent decisions') ?? [],
    };
  }

  /**
   * Parse a markdown section as a bullet list.
   * Case-insensitive matching. Returns null if section not found.
   * Logs warning for malformed sections (no error thrown).
   */
  private parseListSection(content: string, sectionName: string): string[] | null {
    const regex = new RegExp(`^##\\s+${escapeRegExp(sectionName)}\\s*$`, 'im');
    const match = content.match(regex);
    if (!match) return null;

    const startIndex = content.indexOf(match[0]) + match[0].length;
    const nextSection = content.slice(startIndex).search(/^##\s/m);
    const sectionContent = nextSection === -1
      ? content.slice(startIndex)
      : content.slice(startIndex, startIndex + nextSection);

    const items: string[] = [];
    const lines = sectionContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const item = trimmed.slice(2).trim();
        if (item) {
          items.push(item);
        }
      }
    }

    if (items.length === 0) {
      console.warn(`[area-parser] Section "${sectionName}" found but contains no bullet items`);
    }

    return items;
  }

  /**
   * Get area matching a meeting title.
   *
   * Uses case-insensitive substring matching against recurring_meetings[].title.
   * Returns null when no match found.
   * Returns highest-confidence match when multiple match (first match wins for equal confidence).
   *
   * @param meetingTitle - The meeting title to match
   * @returns AreaMatch or null if no match
   */
  async getAreaForMeeting(meetingTitle: string): Promise<AreaMatch | null> {
    const files = await this.listAreaFiles();
    const matches: AreaMatch[] = [];

    for (const filePath of files) {
      const areaContext = await this.parseAreaFile(filePath);
      if (!areaContext) continue;

      for (const recurring of areaContext.recurringMeetings) {
        if (meetingTitleMatches(meetingTitle, recurring.title)) {
          matches.push({
            areaSlug: areaContext.slug,
            matchType: 'recurring',
            confidence: 1.0,
          });
          // Only add one match per area
          break;
        }
      }
    }

    // Return null when no match
    if (matches.length === 0) {
      return null;
    }

    // Sort by confidence descending, first match wins for equal confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  /**
   * Get parsed context for an area by slug.
   *
   * @param areaSlug - The area slug (filename without .md)
   * @returns AreaContext or null if not found
   */
  async getAreaContext(areaSlug: string): Promise<AreaContext | null> {
    const filePath = join(this.areasDir, `${areaSlug}.md`);
    return this.parseAreaFile(filePath);
  }

  /**
   * List all areas in the workspace.
   *
   * @returns Array of AreaContext for all valid area files
   */
  async listAreas(): Promise<AreaContext[]> {
    const files = await this.listAreaFiles();
    const areas: AreaContext[] = [];

    for (const filePath of files) {
      const context = await this.parseAreaFile(filePath);
      if (context) {
        areas.push(context);
      }
    }

    return areas;
  }

  /**
   * Suggest an area for a meeting based on content matching.
   *
   * Matching algorithm (tries ALL methods, returns highest confidence):
   * 1. Exact title match (1.0): Meeting title matches a recurring_meetings[].title
   * 2. Area name match (0.8): Area name appears in meeting title OR summary
   * 3. Keyword overlap (0.5-0.7): Jaccard similarity between meeting content and area's currentState
   *
   * Returns null when:
   * - Input is empty/whitespace-only
   * - No matches found
   * - Highest confidence < SUGGESTION_THRESHOLD (0.5)
   *
   * @param input - Meeting title, summary, and/or transcript
   * @returns AreaMatch or null if no confident match
   */
  async suggestAreaForMeeting(input: SuggestAreaInput): Promise<AreaMatch | null> {
    const { title, summary, transcript } = input;

    // Handle empty/missing content gracefully
    const normalizedTitle = title?.trim() ?? '';
    if (!normalizedTitle) {
      return null;
    }

    const areas = await this.listAreas();
    if (areas.length === 0) {
      return null;
    }

    const matches: AreaMatch[] = [];

    // Build meeting content for keyword matching
    // Truncate transcript to first 500 chars
    const truncatedTranscript = transcript ? transcript.slice(0, TRANSCRIPT_MAX_CHARS) : '';
    const meetingContent = [normalizedTitle, summary ?? '', truncatedTranscript].join(' ');
    const meetingTokens = tokenizeWithStopWords(meetingContent);

    for (const area of areas) {
      // 1. Exact recurring meeting title match (confidence 1.0)
      for (const recurring of area.recurringMeetings) {
        if (meetingTitleMatches(normalizedTitle, recurring.title)) {
          matches.push({
            areaSlug: area.slug,
            matchType: 'recurring',
            confidence: EXACT_TITLE_MATCH_CONFIDENCE,
          });
          break; // Only one match per area for this method
        }
      }

      // 2. Area name match (confidence 0.8)
      const areaNameLower = area.name.toLowerCase();
      const titleLower = normalizedTitle.toLowerCase();
      const summaryLower = (summary ?? '').toLowerCase();

      if (titleLower.includes(areaNameLower) || summaryLower.includes(areaNameLower)) {
        matches.push({
          areaSlug: area.slug,
          matchType: 'inferred',
          confidence: AREA_NAME_MATCH_CONFIDENCE,
        });
      }

      // 3. Keyword overlap with currentState (confidence 0.5-0.7)
      if (area.sections.currentState) {
        const areaTokens = tokenizeWithStopWords(area.sections.currentState);

        if (areaTokens.length > 0 && meetingTokens.length > 0) {
          // Calculate intersection size
          const setA = new Set(meetingTokens);
          const setB = new Set(areaTokens);
          const intersection = [...setA].filter(w => setB.has(w));

          // Require minimum keyword overlap
          if (intersection.length >= MINIMUM_KEYWORD_OVERLAP) {
            const similarity = jaccardSimilarity(meetingTokens, areaTokens);
            const confidence = similarity * KEYWORD_OVERLAP_MAX_CONFIDENCE;

            if (confidence >= SUGGESTION_THRESHOLD) {
              matches.push({
                areaSlug: area.slug,
                matchType: 'inferred',
                confidence,
              });
            }
          }
        }
      }
    }

    // Return null when no match
    if (matches.length === 0) {
      return null;
    }

    // Sort by confidence descending, first match wins for equal confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Only return if above threshold (pre-mortem R1: no low-confidence guesses)
    const best = matches[0];
    if (best.confidence < SUGGESTION_THRESHOLD) {
      return null;
    }

    return best;
  }
}
