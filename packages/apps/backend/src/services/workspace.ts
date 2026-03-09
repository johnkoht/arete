/**
 * Workspace service — meeting file operations for the backend.
 * Uses gray-matter for frontmatter parsing and @arete/core for file I/O.
 */

import { join } from 'path';
import fs from 'fs/promises';
import matter from 'gray-matter';
import {
  FileStorageAdapter,
  parseStagedSections,
  parseStagedItemStatus,
  parseStagedItemEdits,
  writeItemStatusToFile,
  commitApprovedItems,
  loadConfig,
  refreshQmdIndex,
} from '@arete/core';
import type { WriteItemStatusOptions } from '@arete/core';
import type { MeetingSummary, FullMeeting } from '../types.js';

const storage = new FileStorageAdapter();

function meetingsDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'resources', 'meetings');
}

function slugToPath(workspaceRoot: string, slug: string): string {
  return join(meetingsDir(workspaceRoot), `${slug}.md`);
}

/**
 * Safely extract a date string from frontmatter.
 * YAML may parse unquoted dates as Date objects, so handle both string and Date.
 */
function extractDate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return '';
}

function parseAttendees(
  raw: unknown
): Array<{ name: string; email: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    if (typeof a === 'string') return { name: a, email: '' };
    if (a && typeof a === 'object') {
      const obj = a as Record<string, unknown>;
      return {
        name: typeof obj['name'] === 'string' ? obj['name'] : '',
        email: typeof obj['email'] === 'string' ? obj['email'] : '',
      };
    }
    return { name: '', email: '' };
  });
}

function extractDuration(fm: Record<string, unknown>, body: string): string {
  // Check frontmatter first
  if (fm['duration'] && typeof fm['duration'] === 'string') {
    return fm['duration'];
  }
  if (fm['duration'] && typeof fm['duration'] === 'number') {
    return `${fm['duration']} minutes`;
  }
  // Try ## Duration section in body
  const sectionMatch = body.match(/^##\s+Duration\s*\n([^\n#]+)/im);
  if (sectionMatch) return sectionMatch[1].trim();
  // Try **Duration**: X format (Krisp style)
  const boldMatch = body.match(/\*\*Duration\*\*:\s*(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (boldMatch) return boldMatch[1].trim();
  return '';
}

function extractSummary(fm: Record<string, unknown>, body: string): string {
  // Check frontmatter first
  if (fm['summary'] && typeof fm['summary'] === 'string') {
    return fm['summary'];
  }
  // Try ## Summary section in body
  const match = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (match) {
    const summaryText = match[1].trim();
    // Skip placeholder text
    if (summaryText && summaryText.toLowerCase() !== 'no summary available.' && summaryText !== '') {
      return summaryText;
    }
  }
  return '';
}

/**
 * Parse a markdown section with list items into an array of item objects.
 * Handles both plain items (- text) and checkbox items (- [ ] text, - [x] text).
 */
function parseListSection(body: string, sectionName: string): Array<{ text: string; completed?: boolean }> {
  // Note: Can't use $ with 'm' flag as it matches end-of-line, not end-of-string
  // Instead, match until next ## header, --- divider, or end of content
  const regex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---)`, 'im');
  let match = body.match(regex);
  
  // If no match with lookahead, try matching to end of string (section is last in file)
  if (!match) {
    const endRegex = new RegExp(`^##\\s+${sectionName}\\s*\\n([\\s\\S]*)$`, 'im');
    match = body.match(endRegex);
  }
  
  if (!match) return [];
  
  const content = match[1];
  const items: Array<{ text: string; completed?: boolean }> = [];
  
  // Match list items: - [ ] text, - [x] text, - [X] text, or just - text
  const lines = content.split('\n');
  for (const line of lines) {
    // Checkbox format: - [ ] or - [x] or - [X]
    const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (checkboxMatch) {
      items.push({
        text: checkboxMatch[2].trim(),
        completed: checkboxMatch[1].toLowerCase() === 'x',
      });
      continue;
    }
    // Plain format: - text
    const plainMatch = line.match(/^-\s+(.+)$/);
    if (plainMatch) {
      items.push({ text: plainMatch[1].trim() });
    }
  }
  
  return items;
}

/**
 * Extract transcript from body (everything under ## Transcript header).
 */
function extractTranscript(body: string): string {
  const match = body.match(/^##\s+Transcript\s*\n([\s\S]*)$/im);
  return match ? match[1].trim() : '';
}

/**
 * Detect meeting status based on content.
 * 
 * Status hierarchy:
 * 1. Explicit frontmatter status takes precedence
 * 2. Has approved_items frontmatter → approved
 * 3. Has "## Staged X" sections → processed (pending review in new UI)
 * 4. Has "## Action Items" (no Staged prefix) with content → approved (old format, already committed)
 * 5. Has Summary/Key Points → processed
 * 6. Otherwise → synced
 * 
 * Returns lowercase status (frontend handles display formatting).
 */
function detectMeetingStatus(fm: Record<string, unknown>, body: string): string {
  // Explicit frontmatter status takes precedence (normalize to lowercase)
  if (typeof fm['status'] === 'string') {
    return fm['status'].toLowerCase();
  }
  
  // Has approved_items in frontmatter → approved
  if (fm['approved_items'] && typeof fm['approved_items'] === 'object') {
    return 'approved';
  }
  
  // Has staged sections → processed (pending review)
  const hasStagedSections = /^##\s+Staged\s+(Action Items|Decisions|Learnings)\s*\n/im.test(body);
  if (hasStagedSections) {
    return 'processed';
  }
  
  // Has non-staged Action Items with real content → approved (old format, already committed)
  const actionItemsMatch = body.match(/^##\s+Action Items\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (actionItemsMatch) {
    const content = actionItemsMatch[1].trim();
    // Skip placeholder text
    if (content && 
        !content.toLowerCase().includes('no action items') &&
        /^-\s+(\[.\]\s+)?/m.test(content)) {  // matches "- " or "- [ ] " or "- [x] "
      return 'approved';
    }
  }
  
  // Has Decisions or Learnings sections with real content → approved
  const decisionsMatch = body.match(/^##\s+Decisions\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (decisionsMatch) {
    const content = decisionsMatch[1].trim();
    if (content && !content.toLowerCase().includes('no decisions') && /^-\s+/m.test(content)) {
      return 'approved';
    }
  }
  
  const learningsMatch = body.match(/^##\s+Learnings\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  if (learningsMatch) {
    const content = learningsMatch[1].trim();
    if (content && !content.toLowerCase().includes('no learnings') && /^-\s+/m.test(content)) {
      return 'approved';
    }
  }
  
  // Has Summary with real content → processed (but no items extracted yet)
  const summaryMatch = body.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  const hasSummary = summaryMatch && 
    summaryMatch[1].trim() && 
    !summaryMatch[1].toLowerCase().includes('no summary available');
  
  // Has Key Points with real content
  const keyPointsMatch = body.match(/^##\s+Key Points\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/im);
  const hasKeyPoints = keyPointsMatch && 
    keyPointsMatch[1].trim() && 
    !keyPointsMatch[1].toLowerCase().includes('no key points');
  
  if (hasSummary || hasKeyPoints) {
    return 'processed';
  }
  
  return 'synced';
}

export async function listMeetings(workspaceRoot: string): Promise<MeetingSummary[]> {
  const dir = meetingsDir(workspaceRoot);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const summaries: MeetingSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const slug = entry.slice(0, -3);
    const filePath = join(dir, entry);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const { data, content } = matter(raw);
      const fm = data as Record<string, unknown>;
      summaries.push({
        slug,
        title: typeof fm['title'] === 'string' ? fm['title'] : slug,
        date: extractDate(fm['date']),
        status: detectMeetingStatus(fm, content),
        attendees: parseAttendees(fm['attendees']),
        duration: extractDuration(fm, content),
        source: typeof fm['source'] === 'string' ? fm['source'] : '',
        recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
      });
    } catch {
      // skip unreadable files
    }
  }

  // Sort by date descending
  summaries.sort((a, b) => b.date.localeCompare(a.date));
  return summaries;
}

export async function getMeeting(
  workspaceRoot: string,
  slug: string
): Promise<FullMeeting | null> {
  const filePath = slugToPath(workspaceRoot, slug);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const { data, content } = matter(raw);
  const fm = data as Record<string, unknown>;
  const stagedSections = parseStagedSections(content);
  const stagedItemStatus = parseStagedItemStatus(raw);
  const stagedItemEdits = parseStagedItemEdits(raw);

  // Parse approved_items from frontmatter if present
  const rawApproved = fm['approved_items'];
  const approvedItems = {
    actionItems: [] as string[],
    decisions: [] as string[],
    learnings: [] as string[],
  };
  if (rawApproved && typeof rawApproved === 'object' && !Array.isArray(rawApproved)) {
    const ra = rawApproved as Record<string, unknown>;
    if (Array.isArray(ra['actionItems'])) approvedItems.actionItems = ra['actionItems'].filter((x): x is string => typeof x === 'string');
    if (Array.isArray(ra['decisions'])) approvedItems.decisions = ra['decisions'].filter((x): x is string => typeof x === 'string');
    if (Array.isArray(ra['learnings'])) approvedItems.learnings = ra['learnings'].filter((x): x is string => typeof x === 'string');
  }

  // Parse sections from body (for old meetings or detailed view)
  const parsedSections = {
    actionItems: parseListSection(content, 'Action Items'),
    decisions: parseListSection(content, 'Decisions'),
    learnings: parseListSection(content, 'Learnings'),
  };

  return {
    slug,
    title: typeof fm['title'] === 'string' ? fm['title'] : slug,
    date: extractDate(fm['date']),
    status: detectMeetingStatus(fm, content),
    attendees: parseAttendees(fm['attendees']),
    duration: extractDuration(fm, content),
    source: typeof fm['source'] === 'string' ? fm['source'] : '',
    recordingUrl: typeof fm['recording_link'] === 'string' ? fm['recording_link'] : '',
    summary: extractSummary(fm, content),
    body: content,
    transcript: extractTranscript(content),
    frontmatter: fm,
    stagedSections,
    stagedItemStatus,
    stagedItemEdits,
    approvedItems,
    parsedSections,
  };
}

export async function deleteMeeting(
  workspaceRoot: string,
  slug: string
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  await fs.unlink(filePath);

  // Refresh QMD index — non-fatal on failure
  try {
    const config = await loadConfig(storage, workspaceRoot);
    await refreshQmdIndex(workspaceRoot, config.qmd_collection ?? 'arete');
  } catch (err) {
    console.error('[backend] QMD refresh failed after delete:', err);
  }
}

export async function updateMeeting(
  workspaceRoot: string,
  slug: string,
  updates: { title?: string; summary?: string }
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;

  if (updates.title !== undefined) fm['title'] = updates.title;
  if (updates.summary !== undefined) fm['summary'] = updates.summary;

  const updated = matter.stringify(parsed.content, fm);
  await fs.writeFile(filePath, updated, 'utf8');
}

export async function updateItemStatus(
  workspaceRoot: string,
  slug: string,
  itemId: string,
  options: WriteItemStatusOptions
): Promise<void> {
  const filePath = slugToPath(workspaceRoot, slug);
  await writeItemStatusToFile(storage, filePath, itemId, options);
}

export async function approveMeeting(
  workspaceRoot: string,
  slug: string
): Promise<FullMeeting> {
  const filePath = slugToPath(workspaceRoot, slug);
  const memoryDir = join(workspaceRoot, '.arete', 'memory', 'items');
  await commitApprovedItems(storage, filePath, memoryDir);
  const meeting = await getMeeting(workspaceRoot, slug);
  if (!meeting) throw new Error(`Meeting not found after approve: ${slug}`);
  return meeting;
}
