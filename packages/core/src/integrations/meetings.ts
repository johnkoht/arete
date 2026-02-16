/**
 * Meeting save logic — uses StorageAdapter, no direct fs.
 */

import { join } from 'path';
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
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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

  const frontmatter = [
    '---',
    `title: "${meeting.title.replace(/"/g, '\\"')}"`,
    `date: "${meeting.date}"`,
    `source: "${integration}"`,
    '---',
  ].join('\n');

  const fullContent = frontmatter + '\n\n' + content;
  await storage.mkdir(outputDir);
  await storage.write(fullPath, fullContent);
  return fullPath;
}

const DEFAULT_TEMPLATE = `# {title}
**Date**: {date}
**Duration**: {duration}
**Source**: {integration}

## Summary
{summary}

## Key Points
{key_points}

## Action Items
{action_items}

## Transcript
{transcript}
`;
