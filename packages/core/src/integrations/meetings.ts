/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */

import { join, basename } from 'path';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/index.js';

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
 * Find a matching agenda file for a meeting by date and title.
 * Requires exact date match and title similarity > 0.7.
 * 
 * @param storage - Storage adapter
 * @param workspaceRoot - Workspace root path
 * @param date - Meeting date (YYYY-MM-DD)
 * @param title - Meeting title
 * @returns Relative path to agenda if found, null otherwise
 */
export async function findMatchingAgenda(
  storage: StorageAdapter,
  workspaceRoot: string,
  date: string,
  title: string
): Promise<string | null> {
  const agendasDir = join(workspaceRoot, 'now', 'agendas');
  
  // Check if agendas directory exists
  if (!(await storage.exists(agendasDir))) {
    return null;
  }
  
  // List agenda files
  const allFiles = await storage.list(agendasDir, { extensions: ['.md'] });
  const agendaFiles = allFiles.map(f => basename(f));
  
  // Normalize date to YYYY-MM-DD
  const datePrefix = date.includes('T') ? date.slice(0, 10) : date;
  
  // Filter by date prefix and find best title match
  let bestMatch: { path: string; score: number } | null = null;
  
  for (const filename of agendaFiles) {
    // Check date prefix match
    if (!filename.startsWith(datePrefix)) continue;
    
    // Extract title from filename: YYYY-MM-DD-title.md -> title
    const titlePart = filename.slice(11, -3); // Remove date prefix and .md
    const agendaTitle = titlePart.replace(/-/g, ' ');
    
    const score = titleSimilarity(title, agendaTitle);
    
    if (score > 0.7 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        path: `now/agendas/${filename}`,
        score
      };
    }
  }
  
  return bestMatch?.path ?? null;
}

export function meetingFilename(meeting: MeetingForSave): string {
  let dateStr = meeting.date;
  if (dateStr?.includes('T')) dateStr = dateStr.slice(0, 10);
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const titleSlug = slugify(meeting.title || 'untitled');
  return `${dateStr}-${titleSlug}.md`;
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

  const frontmatterLines = [
    '---',
    `title: "${meeting.title.replace(/"/g, '\\"')}"`,
    `date: "${meeting.date}"`,
    `source: "${integration}"`,
  ];
  
  if (meeting.agenda) {
    frontmatterLines.push(`agenda: "${meeting.agenda}"`);
  }
  
  frontmatterLines.push('---');
  const frontmatter = frontmatterLines.join('\n');

  const fullContent = frontmatter + '\n\n' + content;
  await storage.mkdir(outputDir);
  await storage.write(fullPath, fullContent);
  return fullPath;
}


