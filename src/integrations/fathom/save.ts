/**
 * Fathom-specific transforms: API response → MeetingForSave.
 * Saving and index updates are handled by src/core/meetings.ts.
 */

import type { FathomMeeting, Invitee, TranscriptSegment } from './types.js';
import type { MeetingForSave } from '../../core/meetings.js';

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

export type { MeetingForSave } from '../../core/meetings.js';
