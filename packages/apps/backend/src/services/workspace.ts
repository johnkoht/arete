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
  writeItemStatusToFile,
  commitApprovedItems,
  loadConfig,
  refreshQmdIndex,
} from '@arete/core';
// WriteItemStatusOptions is not re-exported from @arete/core index
type WriteItemStatusOptions = {
  status: 'approved' | 'skipped' | 'pending';
  editedText?: string;
};
import type { MeetingSummary, FullMeeting } from '../types.js';

const storage = new FileStorageAdapter();

function meetingsDir(workspaceRoot: string): string {
  return join(workspaceRoot, 'resources', 'meetings');
}

function slugToPath(workspaceRoot: string, slug: string): string {
  return join(meetingsDir(workspaceRoot), `${slug}.md`);
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
  if (fm['duration'] && typeof fm['duration'] === 'string') {
    return fm['duration'];
  }
  // Try to extract from ## Duration section in body
  const match = body.match(/^##\s+Duration\s*\n([^\n#]+)/im);
  if (match) return match[1].trim();
  return '';
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
        date: typeof fm['date'] === 'string' ? fm['date'] : '',
        status: typeof fm['status'] === 'string' ? fm['status'] : 'synced',
        attendees: parseAttendees(fm['attendees']),
        duration: extractDuration(fm, content),
        source: typeof fm['source'] === 'string' ? fm['source'] : '',
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

  return {
    slug,
    title: typeof fm['title'] === 'string' ? fm['title'] : slug,
    date: typeof fm['date'] === 'string' ? fm['date'] : '',
    status: typeof fm['status'] === 'string' ? fm['status'] : 'synced',
    attendees: parseAttendees(fm['attendees']),
    duration: extractDuration(fm, content),
    source: typeof fm['source'] === 'string' ? fm['source'] : '',
    summary: typeof fm['summary'] === 'string' ? fm['summary'] : '',
    body: content,
    frontmatter: fm,
    stagedSections,
    stagedItemStatus,
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
