/**
 * Fathom meeting transform — API response to MeetingForSave.
 */

import type { FathomMeeting } from './types.js';
import type { MeetingForSave } from '../meetings.js';

function meetingDurationMinutes(m: FathomMeeting): number {
  const start = m.recording_start_time || m.scheduled_start_time;
  const end = m.recording_end_time || m.scheduled_end_time;
  if (!start || !end) return 0;
  try {
    return Math.max(
      0,
      Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 60_000
      )
    );
  } catch {
    return 0;
  }
}

export function meetingFromListItem(item: FathomMeeting): MeetingForSave {
  const summaryStr =
    (item.default_summary && typeof item.default_summary === 'object' &&
      item.default_summary.markdown_formatted) ||
    '';

  const transcriptRaw = item.transcript ?? [];
  const transcriptStr = (Array.isArray(transcriptRaw) ? transcriptRaw : [])
    .map((s) => {
      const speaker = s.speaker?.display_name ?? 'Unknown';
      const text = s.text ?? '';
      const ts = s.timestamp ?? '';
      return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
    })
    .join('\n\n');

  const actionItemsRaw = item.action_items ?? [];
  const actionItemStrs: string[] = [];
  for (const ai of Array.isArray(actionItemsRaw) ? actionItemsRaw : []) {
    if (ai && typeof ai === 'object' && 'description' in ai) {
      const desc = (ai as { description?: string }).description;
      if (desc) actionItemStrs.push(desc);
    } else if (typeof ai === 'string') {
      actionItemStrs.push(ai);
    }
  }

  const created = item.created_at ?? '';
  const dateStr =
    typeof created === 'string' && created.length >= 10 ? created.slice(0, 10) : '';

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
