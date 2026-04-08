/**
 * Meeting manifest generator.
 *
 * Produces a single `resources/meetings/MANIFEST.md` that rolls up
 * frontmatter from all meetings within a rolling window (default 90 days).
 * Agents scan this one file instead of N individual meeting files.
 */

import { join, basename } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { StorageAdapter } from '../storage/adapter.js';
import type { WorkspacePaths } from '../models/workspace.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_DAYS = 90;
const MANIFEST_FILENAME = 'MANIFEST.md';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  date: string;
  filename: string;
  title: string;
  importance?: string;
  status?: string;
  area?: string;
  attendee_ids?: string[];
  topics?: string[];
  open_action_items?: number;
  my_commitments?: number;
  their_commitments?: number;
  decisions_count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the date string (YYYY-MM-DD) falls within the window.
 */
function isWithinWindow(dateStr: string, windowDays: number): boolean {
  try {
    const meetingDate = new Date(dateStr + 'T00:00:00Z');
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
    cutoff.setUTCHours(0, 0, 0, 0);
    return meetingDate >= cutoff;
  } catch {
    return false;
  }
}

/**
 * Returns the ISO date of the Monday of the week for a given YYYY-MM-DD date.
 */
function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Parse frontmatter only from a meeting file content.
 * Returns null if no valid frontmatter block found.
 */
function parseFrontmatterBlock(content: string): Record<string, unknown> | null {
  // Stop at the closing --- for performance (don't parse body)
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Format a manifest entry as markdown lines.
 * Missing fields are omitted gracefully.
 */
function formatEntry(entry: ManifestEntry): string {
  const heading = [
    entry.date,
    entry.title || entry.filename.replace(/\.md$/, ''),
    entry.importance,
    entry.status,
  ]
    .filter(Boolean)
    .join(' | ');

  const lines: string[] = [`### ${heading}`, `- file: ${entry.filename}`];

  if (entry.attendee_ids && entry.attendee_ids.length > 0) {
    lines.push(`- people: ${entry.attendee_ids.join(', ')}`);
  }

  if (entry.area) {
    lines.push(`- area: ${entry.area}`);
  }

  if (entry.topics && entry.topics.length > 0) {
    lines.push(`- topics: ${entry.topics.join(', ')}`);
  }

  if (entry.open_action_items !== undefined) {
    const mine = entry.my_commitments ?? 0;
    const theirs = entry.their_commitments ?? 0;
    const decisions = entry.decisions_count !== undefined ? ` | decisions: ${entry.decisions_count}` : '';
    lines.push(`- open_items: ${entry.open_action_items} (mine: ${mine}, theirs: ${theirs})${decisions}`);
  } else if (entry.decisions_count !== undefined) {
    lines.push(`- decisions: ${entry.decisions_count}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate (or refresh) the meeting manifest file.
 *
 * Reads all meeting files within the window, aggregates frontmatter stats,
 * groups by ISO week, and writes `resources/meetings/MANIFEST.md`.
 *
 * Missing frontmatter fields degrade gracefully — entries are omitted or
 * shortened, never thrown.
 */
export async function generateMeetingManifest(
  workspacePaths: WorkspacePaths,
  storage: StorageAdapter,
  options?: { windowDays?: number },
): Promise<{ meetingCount: number }> {
  const windowDays = options?.windowDays ?? DEFAULT_WINDOW_DAYS;
  const meetingsDir = join(workspacePaths.resources, 'meetings');

  // Skip if directory doesn't exist
  if (!(await storage.exists(meetingsDir))) {
    return { meetingCount: 0 };
  }

  const allFiles = await storage.list(meetingsDir, { extensions: ['.md'] });

  // Collect valid entries
  const entries: ManifestEntry[] = [];

  for (const filePath of allFiles) {
    const filename = basename(filePath);

    // Skip the manifest itself
    if (filename === MANIFEST_FILENAME) continue;
    // Skip non-dated files (index.md, etc.)
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const date = dateMatch[1];

    // Filter to window
    if (!isWithinWindow(date, windowDays)) continue;

    // Read and parse frontmatter only
    const content = await storage.read(filePath);
    if (!content) continue;

    const fm = parseFrontmatterBlock(content);
    if (!fm) continue;

    const title = typeof fm.title === 'string' ? fm.title : '';
    const importance = typeof fm.importance === 'string' ? fm.importance : undefined;
    const status = typeof fm.status === 'string' ? fm.status : undefined;
    const area = typeof fm.area === 'string' && fm.area.trim() ? fm.area.trim() : undefined;
    const attendee_ids = Array.isArray(fm.attendee_ids) ? fm.attendee_ids.map(String) : undefined;
    const topics = Array.isArray(fm.topics) && fm.topics.length > 0 ? fm.topics.map(String) : undefined;
    const open_action_items = typeof fm.open_action_items === 'number' ? fm.open_action_items : undefined;
    const my_commitments = typeof fm.my_commitments === 'number' ? fm.my_commitments : undefined;
    const their_commitments = typeof fm.their_commitments === 'number' ? fm.their_commitments : undefined;
    const decisions_count = typeof fm.decisions_count === 'number' ? fm.decisions_count : undefined;

    entries.push({
      date,
      filename,
      title,
      importance,
      status,
      area,
      attendee_ids,
      topics,
      open_action_items,
      my_commitments,
      their_commitments,
      decisions_count,
    });
  }

  // Sort descending by date
  entries.sort((a, b) => b.date.localeCompare(a.date));

  // Compute aggregate header stats
  const totalMeetings = entries.length;
  const openActionItems = entries.reduce((sum, e) => sum + (e.open_action_items ?? 0), 0);
  const myCommitments = entries.reduce((sum, e) => sum + (e.my_commitments ?? 0), 0);
  const theirCommitments = entries.reduce((sum, e) => sum + (e.their_commitments ?? 0), 0);

  // Group by ISO week
  const weekMap = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const week = weekStartDate(entry.date);
    if (!weekMap.has(week)) weekMap.set(week, []);
    weekMap.get(week)!.push(entry);
  }
  // Sort weeks descending
  const sortedWeeks = [...weekMap.keys()].sort((a, b) => b.localeCompare(a));

  // Build frontmatter YAML
  const frontmatterData: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    total_meetings: totalMeetings,
    open_action_items: openActionItems,
    my_commitments: myCommitments,
    their_commitments: theirCommitments,
  };
  const frontmatterStr = stringifyYaml(frontmatterData).trimEnd();

  // Build body
  const bodyLines: string[] = ['# Meeting Manifest', ''];

  for (const week of sortedWeeks) {
    bodyLines.push(`## Week of ${week}`, '');
    const weekEntries = weekMap.get(week)!;
    for (const entry of weekEntries) {
      bodyLines.push(formatEntry(entry), '');
    }
  }

  const manifestContent = `---\n${frontmatterStr}\n---\n\n${bodyLines.join('\n')}`;
  const manifestPath = join(meetingsDir, MANIFEST_FILENAME);

  await storage.write(manifestPath, manifestContent);

  return { meetingCount: totalMeetings };
}
