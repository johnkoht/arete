/**
 * Shared meetings service – save meeting files and update meetings index.
 * Used by Fathom, manual paste, and future recording integrations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WorkspacePaths } from '../types.js';
import { getPackageRoot } from './workspace.js';

/** Normalized meeting shape for saving to markdown (shared across integrations) */
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
}

export interface SaveMeetingOptions {
  integration?: string;
  force?: boolean;
}

export interface SaveMeetingResult {
  saved: boolean;
  path: string | null;
}

const INDEX_MAX_ENTRIES = 20;
const INDEX_ENTRY_REGEX = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s+[–-]\s+(.+)$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatAttendees(attendees: MeetingForSave['attendees']): string {
  if (!Array.isArray(attendees)) return '';
  return attendees
    .map((a) =>
      a && typeof a === 'object' ? (a.name ?? a.email ?? String(a)) : String(a)
    )
    .join(', ');
}

/**
 * Resolve path to integration-meeting.md template.
 */
function getTemplatePath(paths: { templates: string } | null): string {
  const templateRel = join('inputs', 'integration-meeting.md');
  if (paths?.templates) {
    const workspaceTemplate = join(paths.templates, templateRel);
    if (existsSync(workspaceTemplate)) return workspaceTemplate;
  }
  const packageRoot = getPackageRoot();
  return join(packageRoot, 'templates', templateRel);
}

/**
 * Generate filename for the meeting (e.g. 2026-02-05-product-review.md).
 */
export function meetingFilename(meeting: MeetingForSave): string {
  let dateStr = meeting.date;
  if (dateStr && dateStr.includes('T')) dateStr = dateStr.slice(0, 10);
  if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);
  const titleSlug = slugify(meeting.title || 'untitled');
  return `${dateStr}-${titleSlug}.md`;
}

/**
 * Render the meeting markdown from the template.
 */
function renderMeetingTemplate(
  meeting: MeetingForSave,
  templatePath: string,
  integration: string
): string {
  let template = readFileSync(templatePath, 'utf8');
  const keyPoints = meeting.highlights?.length
    ? meeting.highlights.map((h) => `- ${h}`).join('\n')
    : 'No key points captured.';
  const actionItemsStr = meeting.action_items?.length
    ? meeting.action_items.map((a) => `- [ ] ${a}`).join('\n')
    : 'No action items captured.';
  const decisionsStr = 'No decisions captured.';
  const importDate = new Date().toISOString().slice(0, 10);

  const vars: Record<string, string> = {
    title: meeting.title,
    date: meeting.date,
    duration: `${meeting.duration_minutes} minutes`,
    integration,
    import_date: importDate,
    attendees: formatAttendees(meeting.attendees ?? []),
    summary: meeting.summary || 'No summary available.',
    key_points: keyPoints,
    action_items: actionItemsStr,
    decisions: decisionsStr,
    transcript: meeting.transcript || 'No transcript available.',
    meeting_id: String(meeting.recording_id ?? meeting.id ?? ''),
    recording_link: meeting.url ?? '',
    source_link: meeting.url ?? meeting.share_url ?? '',
  };

  for (const [k, v] of Object.entries(vars)) {
    template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return template;
}

/**
 * Save meeting file to outputDir. Returns the saved file path or null if skipped (duplicate).
 */
export function saveMeetingFile(
  meeting: MeetingForSave,
  outputDir: string,
  paths: WorkspacePaths | null,
  options: SaveMeetingOptions = {}
): string | null {
  const { integration = 'Manual', force = false } = options;
  const filename = meetingFilename(meeting);
  const fullPath = join(outputDir, filename);
  if (!force && existsSync(fullPath)) return null;
  mkdirSync(outputDir, { recursive: true });
  const templatePath = getTemplatePath(paths);
  const content = renderMeetingTemplate(meeting, templatePath, integration);
  writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

interface IndexEntry {
  title: string;
  filename: string;
  date: string;
}

function parseIndexEntries(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith('## Recent Meetings')) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.startsWith('## ')) break; // Next section
      const m = line.match(INDEX_ENTRY_REGEX);
      if (m) {
        entries.push({ title: m[1], filename: m[2], date: m[3] });
      }
    }
  }
  return entries;
}

function formatIndexEntries(entries: IndexEntry[]): string {
  if (entries.length === 0) return 'None yet.';
  return entries
    .map((e) => `- [${e.title}](${e.filename}) – ${e.date}`)
    .join('\n');
}

/**
 * Update the meetings index with a new entry. Merges, dedupes by filename, sorts by date desc, limits.
 */
export function updateMeetingsIndex(
  meetingsDir: string,
  newEntry: { filename: string; title: string; date: string }
): void {
  const indexPath = join(meetingsDir, 'index.md');
  let content: string;
  if (existsSync(indexPath)) {
    content = readFileSync(indexPath, 'utf8');
  } else {
    content = `# Meetings Index

Meeting notes and transcripts organized by date.

## Recent Meetings

None yet.
`;
  }

  const entries = parseIndexEntries(content);
  const byFilename = new Map(entries.map((e) => [e.filename, e]));
  byFilename.set(newEntry.filename, {
    title: newEntry.title,
    filename: newEntry.filename,
    date: newEntry.date,
  });
  const merged = Array.from(byFilename.values());
  merged.sort((a, b) => b.date.localeCompare(a.date));
  const limited = merged.slice(0, INDEX_MAX_ENTRIES);
  const sectionContent = formatIndexEntries(limited);

  const sectionStart = content.indexOf('## Recent Meetings');
  if (sectionStart < 0) {
    const appendix = `\n\n## Recent Meetings\n\n${sectionContent}`;
    writeFileSync(indexPath, content.trimEnd() + appendix, 'utf8');
    return;
  }
  const sectionEnd = content.indexOf('\n## ', sectionStart + 1);
  const before = content.slice(0, sectionStart + '## Recent Meetings'.length);
  const after = sectionEnd >= 0 ? content.slice(sectionEnd) : '';

  const newContent =
    before + '\n\n' + sectionContent + (after ? '\n' + after : '');
  writeFileSync(indexPath, newContent, 'utf8');
}

/**
 * Save meeting to outputDir and update the index. Returns result with saved flag and path.
 */
export function saveMeeting(
  meeting: MeetingForSave,
  outputDir: string,
  paths: WorkspacePaths | null,
  options: SaveMeetingOptions = {}
): SaveMeetingResult {
  const savedPath = saveMeetingFile(meeting, outputDir, paths, options);
  if (!savedPath) {
    return { saved: false, path: null };
  }
  updateMeetingsIndex(outputDir, {
    filename: meetingFilename(meeting),
    title: meeting.title,
    date: meeting.date,
  });
  return { saved: true, path: savedPath };
}
