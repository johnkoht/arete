/**
 * Save Fathom meetings to markdown using the integration-meeting template.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WorkspacePaths } from '../../types.js';
import type { FathomMeeting, MeetingForSave, Invitee, TranscriptSegment } from './types.js';
import { getPackageRoot } from '../../core/workspace.js';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function meetingDurationMinutes(m: FathomMeeting): number {
  const start = m.recording_start_time || m.scheduled_start_time;
  const end = m.recording_end_time || m.scheduled_end_time;
  if (!start || !end) return 0;
  try {
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    return Math.max(0, Math.round((b - a) / 60_000));
  } catch {
    return 0;
  }
}

function formatTranscriptFromList(segments: TranscriptSegment[]): string {
  if (!segments?.length) return '';
  return segments
    .map((s) => {
      const speaker = s.speaker?.display_name ?? 'Unknown';
      const text = s.text ?? '';
      const ts = s.timestamp ?? '';
      return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
    })
    .join('\n\n');
}

/**
 * Convert a List Meetings API item (with include_summary/transcript/action_items) to MeetingForSave.
 */
export function meetingFromListItem(item: FathomMeeting): MeetingForSave {
  const defaultSummary = item.default_summary;
  const summaryStr =
    (defaultSummary && typeof defaultSummary === 'object' && defaultSummary.markdown_formatted) || '';

  const transcriptRaw = item.transcript ?? [];
  const transcriptStr = formatTranscriptFromList(
    Array.isArray(transcriptRaw) ? transcriptRaw : []
  );

  const actionItemsRaw = item.action_items ?? [];
  const actionItemStrs: string[] = [];
  for (const ai of Array.isArray(actionItemsRaw) ? actionItemsRaw : []) {
    if (ai && typeof ai === 'object' && 'description' in ai) actionItemStrs.push(ai.description);
    else if (typeof ai === 'string') actionItemStrs.push(ai);
  }

  const created = item.created_at ?? '';
  const dateStr = typeof created === 'string' && created.length >= 10 ? created.slice(0, 10) : '';

  return {
    title: item.title ?? 'Untitled Meeting',
    date: dateStr,
    created_at: created,
    recording_id: item.recording_id,
    id: item.recording_id,
    duration_minutes: meetingDurationMinutes(item),
    summary: summaryStr,
    transcript: transcriptStr,
    action_items: actionItemStrs,
    highlights: [],
    attendees: item.calendar_invitees ?? [],
    url: item.url ?? '',
    share_url: item.share_url,
  };
}

function formatAttendees(attendees: Invitee[]): string {
  if (!Array.isArray(attendees)) return '';
  return attendees
    .map((a) => (a && typeof a === 'object' ? (a.name ?? a.email ?? String(a)) : String(a)))
    .join(', ');
}

/**
 * Resolve path to integration-meeting.md template (workspace override or package default).
 */
export function getTemplatePath(paths: { templates: string } | null): string {
  const templateRel = join('inputs', 'integration-meeting.md');
  if (paths?.templates) {
    const workspaceTemplate = join(paths.templates, templateRel);
    if (existsSync(workspaceTemplate)) return workspaceTemplate;
  }
  const packageRoot = getPackageRoot();
  return join(packageRoot, 'templates', templateRel);
}

/**
 * Render the meeting markdown from the template.
 */
export function renderMeetingTemplate(meeting: MeetingForSave, templatePath: string): string {
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
    integration: 'Fathom',
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
 * Save meeting to outputDir. Returns the saved file path or null if skipped (duplicate).
 */
export function saveMeeting(
  meeting: MeetingForSave,
  outputDir: string,
  paths: WorkspacePaths | null,
  force: boolean = false
): string | null {
  const fullPath = join(outputDir, meetingFilename(meeting));
  if (!force && existsSync(fullPath)) return null;
  mkdirSync(outputDir, { recursive: true });
  const templatePath = getTemplatePath(paths);
  const content = renderMeetingTemplate(meeting, templatePath);
  writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}
