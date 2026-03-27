/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */

import { join, basename } from 'path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { CalendarEvent } from './calendar/types.js';

/**
 * Meeting importance levels for triage workflow.
 * - skip: User-assigned only — auto-skip processing entirely
 * - light: Large audience meetings — minimal extraction
 * - normal: Standard meetings — full extraction
 * - important: 1:1s and self-organized — priority processing
 */
export type Importance = 'skip' | 'light' | 'normal' | 'important';

export interface MeetingForSave {
  title: string;
  date: string;
  created_at?: string;
  recording_id?: number;
  id?: number;
  duration_minutes: number;
  summary: string;
  transcript: string;
  action_items: string[];
  highlights: string[];
  attendees?: Array<{ name?: string | null; email?: string | null } | string>;
  url: string;
  share_url?: string;
  agenda?: string; // Relative path to linked agenda file
  /** Lifecycle status written to frontmatter at save time. Default: 'synced'. */
  status?: 'synced' | 'processed' | 'approved';
  /** Meeting importance for triage workflow. 'skip' is user-assigned only. */
  importance?: Importance;
  /** ID of the recurring event series (for recurring meeting detection). */
  recurring_series_id?: string;
}

/**
 * Result of agenda matching with metadata for user prompting.
 */
export interface AgendaMatchResult {
  /** Matched agenda path (relative), or null if no match */
  match: string | null;
  /** How the match was determined */
  matchType: 'exact' | 'fuzzy' | 'none';
  /** Confidence score (1.0 for exact, 0-1 for fuzzy) */
  confidence: number;
  /** All candidate agendas for the same date (for user selection if no match) */
  candidates: Array<{ path: string; meetingTitle?: string; score: number }>;
}

/**
 * Infer meeting importance from calendar event metadata.
 * 
 * Priority rules (first match wins):
 * 1. Organizer is self → 'important'
 * 2. 1:1 meeting (2 attendees) → 'important'
 * 3. Small group (≤3 attendees) → 'normal'
 * 4. Large audience (≥5 attendees, not organizer) → 'light'
 * 5. Default → 'normal'
 * 
 * Modifier: If hasAgenda is true and result would be 'light', upgrade to 'normal'.
 * 
 * Note: Never returns 'skip' — that's user-assigned only.
 */
export function inferMeetingImportance(
  event: CalendarEvent,
  options?: { hasAgenda?: boolean }
): 'light' | 'normal' | 'important' {
  const attendeeCount = event.attendees.length;
  const isOrganizerSelf = event.organizer?.self === true;
  
  let importance: 'light' | 'normal' | 'important';
  
  // Rule 1: Organizer is self → 'important'
  if (isOrganizerSelf) {
    importance = 'important';
  }
  // Rule 2: 1:1 meeting (2 attendees) → 'important'
  else if (attendeeCount === 2) {
    importance = 'important';
  }
  // Rule 3: Small group (≤3 attendees) → 'normal'
  else if (attendeeCount <= 3) {
    importance = 'normal';
  }
  // Rule 4: Large audience (≥5 attendees, not organizer) → 'light'
  else if (attendeeCount >= 5) {
    importance = 'light';
  }
  // Rule 5: Default (4 attendees) → 'normal'
  else {
    importance = 'normal';
  }
  
  // Modifier: hasAgenda upgrades 'light' to 'normal'
  if (options?.hasAgenda && importance === 'light') {
    importance = 'normal';
  }
  
  return importance;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalize a title for fuzzy comparison.
 * Lowercase, strip punctuation, collapse whitespace.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple similarity score between two normalized strings.
 * Returns 0-1 where 1 is identical.
 */
function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  
  if (normA === normB) return 1;
  if (!normA || !normB) return 0;
  
  // Word overlap similarity
  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * Parse frontmatter from markdown content.
 * Returns null if no valid frontmatter found.
 */
function parseAgendaFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Find a matching agenda file for a meeting by date and title.
 * 
 * Matching priority:
 * 1. Exact match on frontmatter `meeting_title` field (from calendar event)
 * 2. Fuzzy match on filename with relaxed threshold
 * 
 * @param storage - Storage adapter
 * @param workspaceRoot - Workspace root path
 * @param date - Meeting date (YYYY-MM-DD or ISO string)
 * @param title - Meeting title (from calendar/Fathom/Krisp)
 * @returns Match result with metadata for user prompting
 */
export async function findMatchingAgenda(
  storage: StorageAdapter,
  workspaceRoot: string,
  date: string,
  title: string
): Promise<AgendaMatchResult> {
  const agendasDir = join(workspaceRoot, 'now', 'agendas');
  
  // Check if agendas directory exists
  if (!(await storage.exists(agendasDir))) {
    return { match: null, matchType: 'none', confidence: 0, candidates: [] };
  }
  
  // List agenda files
  const allFiles = await storage.list(agendasDir, { extensions: ['.md'] });
  const agendaFiles = allFiles.map(f => basename(f));
  
  // Normalize date to YYYY-MM-DD
  const datePrefix = date.includes('T') ? date.slice(0, 10) : date;
  
  // Collect candidates for the same date
  const candidates: AgendaMatchResult['candidates'] = [];
  let exactMatch: { path: string; meetingTitle: string } | null = null;
  
  for (const filename of agendaFiles) {
    // Check date prefix match
    if (!filename.startsWith(datePrefix)) continue;
    
    const relativePath = `now/agendas/${filename}`;
    const fullPath = join(workspaceRoot, relativePath);
    
    // Read and parse frontmatter to check for meeting_title
    const content = await storage.read(fullPath);
    const frontmatter = content ? parseAgendaFrontmatter(content) : null;
    const meetingTitle = frontmatter?.meeting_title as string | undefined;
    
    // Check for exact meeting_title match (case-insensitive)
    if (meetingTitle && meetingTitle.toLowerCase() === title.toLowerCase()) {
      exactMatch = { path: relativePath, meetingTitle };
    }
    
    // Calculate fuzzy score from filename
    const titlePart = filename.slice(11, -3); // Remove date prefix and .md
    const agendaTitle = titlePart.replace(/-/g, ' ');
    const score = titleSimilarity(title, agendaTitle);
    
    candidates.push({
      path: relativePath,
      meetingTitle,
      score
    });
  }
  
  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  // Return exact match if found
  if (exactMatch) {
    return {
      match: exactMatch.path,
      matchType: 'exact',
      confidence: 1.0,
      candidates
    };
  }
  
  // Return best fuzzy match if score > 0.5
  const bestFuzzy = candidates[0];
  if (bestFuzzy && bestFuzzy.score > 0.5) {
    return {
      match: bestFuzzy.path,
      matchType: 'fuzzy',
      confidence: bestFuzzy.score,
      candidates
    };
  }
  
  // If only one candidate for this date, return it with low confidence
  // (let the skill decide whether to prompt user)
  if (candidates.length === 1) {
    return {
      match: candidates[0].path,
      matchType: 'fuzzy',
      confidence: candidates[0].score,
      candidates
    };
  }
  
  // No match - return candidates for user selection
  return {
    match: null,
    matchType: 'none',
    confidence: 0,
    candidates
  };
}

/**
 * Find a matching calendar event for a meeting by date and time.
 * 
 * Matching priority:
 * 1. Same day + time overlap (meeting falls within calendar event window)
 * 2. Same day + fuzzy title match (when times don't match exactly)
 * 
 * @param events - Array of calendar events to search
 * @param meetingDate - Meeting date (YYYY-MM-DD or ISO string)
 * @param meetingTitle - Meeting title for fuzzy matching
 * @returns Matched calendar event or null
 */
export function findMatchingCalendarEvent(
  events: CalendarEvent[],
  meetingDate: string,
  meetingTitle: string
): CalendarEvent | null {
  if (events.length === 0) return null;
  
  // Normalize meeting date to YYYY-MM-DD
  const targetDate = meetingDate.includes('T') ? meetingDate.slice(0, 10) : meetingDate;
  
  // Filter events on the same day
  const sameDayEvents = events.filter(event => {
    const eventDate = event.startTime.toISOString().slice(0, 10);
    return eventDate === targetDate;
  });
  
  if (sameDayEvents.length === 0) return null;
  
  // Single event on this day - return it
  if (sameDayEvents.length === 1) {
    return sameDayEvents[0];
  }
  
  // Multiple events - find best match by title similarity
  let bestMatch: CalendarEvent | null = null;
  let bestScore = 0;
  
  for (const event of sameDayEvents) {
    const score = titleSimilarity(meetingTitle, event.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = event;
    }
  }
  
  // Return best match if reasonable similarity (> 0.3), else first event on the day
  return bestScore > 0.3 ? bestMatch : sameDayEvents[0];
}

/**
 * Simple wrapper that returns just the path (for backward compatibility).
 * Only returns high-confidence matches (exact or fuzzy >= 0.7).
 */
export async function findMatchingAgendaPath(
  storage: StorageAdapter,
  workspaceRoot: string,
  date: string,
  title: string
): Promise<string | null> {
  const result = await findMatchingAgenda(storage, workspaceRoot, date, title);
  // Only return high-confidence matches automatically
  if (result.matchType === 'exact' || result.confidence >= 0.7) {
    return result.match;
  }
  return null;
}

export function meetingFilename(meeting: MeetingForSave): string {
  let dateStr = meeting.date;
  if (dateStr?.includes('T')) dateStr = dateStr.slice(0, 10);
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const titleSlug = slugify(meeting.title || 'untitled');
  return `${dateStr}-${titleSlug}.md`;
}

/**
 * Build the attendees YAML block.
 * Each attendee becomes `{ name: string, email: string }`.
 * Null/undefined values become empty string.
 */
function buildAttendeesYaml(
  attendees: Array<{ name?: string | null; email?: string | null } | string>
): Array<{ name: string; email: string }> {
  return attendees.map((a) => {
    if (typeof a === 'string') {
      return { name: a, email: '' };
    }
    return {
      name: a.name ?? '',
      email: a.email ?? '',
    };
  });
}

export async function saveMeetingFile(
  storage: StorageAdapter,
  meeting: MeetingForSave,
  outputDir: string,
  templateContent: string,
  options: { integration?: string; force?: boolean } = {}
): Promise<string | null> {
  const { integration = 'Manual', force = false } = options;
  const filename = meetingFilename(meeting);
  const fullPath = join(outputDir, filename);

  const exists = await storage.exists(fullPath);
  if (!force && exists) return null;

  const vars: Record<string, string> = {
    title: meeting.title,
    date: meeting.date,
    duration: `${meeting.duration_minutes} minutes`,
    integration,
    import_date: new Date().toISOString().slice(0, 10),
    attendees: (meeting.attendees ?? [])
      .map((a) =>
        a && typeof a === 'object' ? (a.name ?? a.email ?? String(a)) : String(a)
      )
      .join(', '),
    summary: meeting.summary || 'No summary available.',
    key_points: (meeting.highlights ?? [])
      .map((h) => `- ${h}`)
      .join('\n') || 'No key points captured.',
    action_items: (meeting.action_items ?? [])
      .map((a) => `- [ ] ${a}`)
      .join('\n') || 'No action items captured.',
    transcript: meeting.transcript || 'No transcript available.',
    meeting_id: String(meeting.recording_id ?? meeting.id ?? ''),
    recording_link: meeting.url ?? '',
    source_link: meeting.url ?? meeting.share_url ?? '',
  };

  let content = templateContent;
  for (const [k, v] of Object.entries(vars)) {
    content = content.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }

  // Build frontmatter data object
  const frontmatterData: Record<string, unknown> = {
    title: meeting.title,
    date: meeting.date,
    source: integration,
    status: meeting.status ?? 'synced',
  };

  if (meeting.agenda) {
    frontmatterData['agenda'] = meeting.agenda;
  }

  if (meeting.importance) {
    frontmatterData['importance'] = meeting.importance;
  }

  if (meeting.recurring_series_id) {
    frontmatterData['recurring_series_id'] = meeting.recurring_series_id;
  }

  // Write structured attendees array
  const rawAttendees = meeting.attendees ?? [];
  frontmatterData['attendees'] = buildAttendeesYaml(rawAttendees);

  // Serialize using yaml.stringify for round-trip safety
  const frontmatterStr = stringifyYaml(frontmatterData).trimEnd();
  const fullContent = `---\n${frontmatterStr}\n---\n\n${content}`;

  await storage.mkdir(outputDir);
  await storage.write(fullPath, fullContent);
  return fullPath;
}
