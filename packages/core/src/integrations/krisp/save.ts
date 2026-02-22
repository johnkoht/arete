/**
 * Krisp MCP — transform search_meetings response to MeetingForSave.
 */

import type { MeetingForSave } from '../meetings.js';
import type { KrispMeeting, KrispTranscriptSegment } from './types.js';

/**
 * Transform a Krisp meeting to MeetingForSave.
 *
 * @param meeting - Raw meeting from search_meetings
 * @param fetchedTranscript - Transcript text fetched via getDocument (optional)
 */
export function meetingFromKrisp(meeting: KrispMeeting, fetchedTranscript?: string): MeetingForSave {
  // Transcript: prefer fetched full text, fall back to inline segments if present
  let transcript = fetchedTranscript ?? '';
  if (!transcript && Array.isArray(meeting.transcript)) {
    // Legacy/future: inline transcript segments
    transcript = (meeting.transcript as KrispTranscriptSegment[])
      .map(s => {
        const speaker = s.speaker ?? 'Unknown';
        const text = s.text ?? '';
        const ts = s.timestamp ?? '';
        return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
      })
      .join('\n\n');
  }

  // Plain strings — saveMeetingFile adds "- [ ]" checkbox formatting
  const action_items = (meeting.action_items ?? [])
    .map(item => item.text + (item.assignee ? ` (@${item.assignee})` : ''));

  const highlights = meeting.key_points ?? [];

  // Attendees from attendees field (objects with name/email)
  const attendees = (meeting.attendees ?? [])
    .map(a => ({ name: a.name ?? null, email: a.email ?? null }));

  // Speakers are plain strings in Krisp — add them as attendees if no attendees list
  if (attendees.length === 0 && meeting.speakers) {
    for (const speaker of meeting.speakers) {
      attendees.push({ name: speaker, email: null });
    }
  }

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
