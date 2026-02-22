/**
 * Krisp MCP — transform search_meetings response to MeetingForSave.
 */

import type { MeetingForSave } from '../meetings.js';
import type { KrispMeeting } from './types.js';

export function meetingFromKrisp(meeting: KrispMeeting): MeetingForSave {
  const transcript = (meeting.transcript ?? [])
    .map(s => {
      const speaker = s.speaker ?? 'Unknown';
      const text = s.text ?? '';
      const ts = s.timestamp ?? '';
      return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
    })
    .join('\n\n');

  // Plain strings — saveMeetingFile adds "- [ ]" checkbox formatting
  const action_items = (meeting.action_items ?? [])
    .map(item => item.text + (item.assignee ? ` (@${item.assignee})` : ''));

  const highlights = (meeting.key_points ?? []);

  const attendees = (meeting.attendees ?? [])
    .map(a => ({ name: a.name ?? null, email: a.email ?? null }));

  return {
    title: meeting.name ?? 'Untitled Meeting',
    date: meeting.date ?? new Date().toISOString().slice(0, 10),
    duration_minutes: 0,
    summary: meeting.detailed_summary ?? meeting.meeting_notes ?? '',
    transcript,
    action_items,
    highlights,
    attendees,
    url: meeting.url ?? '',
  };
}
