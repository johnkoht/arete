/**
 * Shared meetings service – save meeting files and update meetings index.
 * Used by Fathom, manual paste, and future recording integrations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WorkspacePaths } from '../types.js';
import { getSourcePaths } from './workspace.js';

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
  attendee_ids?: string[];
  company?: string;
  pillar?: string;
  url: string;
  share_url?: string;
  /** Optional topics/themes for the index (keywords or 1–2 sentences). If omitted, derived from summary/highlights. */
  topics?: string;
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
const INDEX_TOPICS_MAX_LEN = 120;

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
  const sourcePaths = getSourcePaths();
  return join(sourcePaths.templates, templateRel);
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
 * Build YAML frontmatter block for meeting files.
 */
function buildMeetingFrontmatter(
  meeting: MeetingForSave,
  integration: string
): string {
  const attendeesStr = formatAttendees(meeting.attendees ?? []);
  const attendeeIds = meeting.attendee_ids ?? [];
  const company = meeting.company ?? '';
  const pillar = meeting.pillar ?? '';
  const lines = [
    '---',
    `title: "${meeting.title.replace(/"/g, '\\"')}"`,
    `date: "${meeting.date}"`,
    `source: "${integration}"`,
    `attendees: "${attendeesStr.replace(/"/g, '\\"')}"`,
    `attendee_ids: [${attendeeIds.map((s) => `"${s}"`).join(', ')}]`,
    `company: "${company.replace(/"/g, '\\"')}"`,
    `pillar: "${pillar.replace(/"/g, '\\"')}"`,
    '---',
  ];
  return lines.join('\n');
}

/**
 * Render the meeting markdown from the template.
 * Prepends YAML frontmatter before the template body.
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
  const frontmatter = buildMeetingFrontmatter(meeting, integration);
  return frontmatter + '\n\n' + template;
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

export interface MeetingIndexEntry {
  title: string;
  filename: string;
  date: string;
  attendees?: string;
  recording_url?: string;
  topics?: string;
}

function deriveTopics(meeting: MeetingForSave): string {
  if (meeting.topics?.trim()) return meeting.topics.trim().slice(0, INDEX_TOPICS_MAX_LEN);
  if (meeting.summary?.trim()) {
    const first = meeting.summary.trim().split(/[.!?]\s+/)[0]?.trim() ?? meeting.summary.trim();
    return first.slice(0, INDEX_TOPICS_MAX_LEN);
  }
  if (meeting.highlights?.length) {
    return meeting.highlights.slice(0, 3).map((h) => (typeof h === 'string' ? h : '').trim()).filter(Boolean).join('; ').slice(0, INDEX_TOPICS_MAX_LEN);
  }
  return '';
}

function parseIndexEntries(content: string): MeetingIndexEntry[] {
  const entries: MeetingIndexEntry[] = [];
  const lines = content.split('\n');
  let inSection = false;
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('## Recent Meetings')) {
      inSection = true;
      inTable = false;
      continue;
    }
    if (inSection && line.startsWith('## ')) break;
    if (!inSection) continue;

    const bulletMatch = line.match(INDEX_ENTRY_REGEX);
    if (bulletMatch) {
      entries.push({ title: bulletMatch[1], filename: bulletMatch[2], date: bulletMatch[3] });
      continue;
    }

    const tableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    if (tableRow) {
      const cells = line.split('|').map((c) => c.trim()).filter((_, i) => i > 0 && i < 6);
      if (cells.length >= 3 && cells[0] !== 'Date' && !/^[-—]+$/.test(cells[0])) {
        const date = cells[0];
        const titleCell = cells[1] ?? '';
        const linkMatch = titleCell.match(/\[([^\]]*)\]\(([^)]+)\)/);
        const title = linkMatch ? linkMatch[1] : titleCell;
        const filename = linkMatch ? linkMatch[2] : '';
        const attendees = cells[2] ?? '';
        const recording = cells[3] ?? '';
        const recordingUrl = recording.startsWith('[') ? recording.match(/\]\((https?:[^)]+)\)/)?.[1] : undefined;
        const topics = cells[4] ?? '';
        if (filename && date) {
          entries.push({
            title,
            filename,
            date,
            attendees: attendees && attendees !== '—' ? attendees : undefined,
            recording_url: recordingUrl || (recording && recording !== '—' ? recording : undefined),
            topics: topics && topics !== '—' ? topics : undefined,
          });
        }
      }
    }
  }
  return entries;
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatIndexEntries(entries: MeetingIndexEntry[]): string {
  if (entries.length === 0) return 'None yet.';
  const header = '| Date | Title | Attendees | Recording | Topics |';
  const separator = '| --- | --- | --- | --- | --- |';
  const rows = entries.map((e) => {
    const title = `[${escapeTableCell(e.title)}](${e.filename})`;
    const attendees = e.attendees ? escapeTableCell(e.attendees) : '—';
    const recording = e.recording_url ? `[recording](${e.recording_url})` : '—';
    const topics = e.topics ? escapeTableCell(e.topics) : '—';
    return `| ${e.date} | ${title} | ${attendees} | ${recording} | ${topics} |`;
  });
  return [header, separator, ...rows].join('\n');
}

/** New index entry shape (optional fields for backward compatibility with callers that only pass filename/title/date). */
export interface MeetingIndexNewEntry {
  filename: string;
  title: string;
  date: string;
  attendees?: string;
  recording_url?: string;
  topics?: string;
}

/**
 * Update the meetings index with a new entry. Merges, dedupes by filename, sorts by date desc, limits.
 * Index is rendered as a markdown table: Date | Title | Attendees | Recording | Topics.
 */
export function updateMeetingsIndex(
  meetingsDir: string,
  newEntry: MeetingIndexNewEntry
): void {
  const indexPath = join(meetingsDir, 'index.md');
  let content: string;
  if (existsSync(indexPath)) {
    content = readFileSync(indexPath, 'utf8');
  } else {
    content = `# Meetings Index

Meeting notes and transcripts organized by date. Scan the table for topics/themes, then open the linked file for details.

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
    attendees: newEntry.attendees,
    recording_url: newEntry.recording_url,
    topics: newEntry.topics,
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
  const dateStr = meeting.date?.includes('T') ? meeting.date.slice(0, 10) : meeting.date;
  updateMeetingsIndex(outputDir, {
    filename: meetingFilename(meeting),
    title: meeting.title,
    date: dateStr,
    attendees: formatAttendees(meeting.attendees ?? []).slice(0, 80) || undefined,
    recording_url: meeting.url?.trim() || meeting.share_url?.trim() || undefined,
    topics: deriveTopics(meeting) || undefined,
  });
  return { saved: true, path: savedPath };
}
