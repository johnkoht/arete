/**
 * Krisp MCP — transform search_meetings response to MeetingForSave.
 */
/**
 * Extract nested meeting_notes fields.
 * Krisp returns meeting_notes as an object { detailed_summary, key_points, action_items }
 * but may also place these as top-level fields on the meeting.
 */
function resolveNotes(meeting) {
    const notes = (typeof meeting.meeting_notes === 'object' && meeting.meeting_notes !== null)
        ? meeting.meeting_notes
        : {};
    return {
        detailed_summary: meeting.detailed_summary ?? notes.detailed_summary,
        key_points: meeting.key_points ?? notes.key_points,
        action_items: meeting.action_items ?? notes.action_items,
    };
}
/**
 * Transform a Krisp meeting to MeetingForSave.
 *
 * @param meeting - Raw meeting from search_meetings
 * @param fetchedTranscript - Full transcript from get_multiple_documents (optional)
 */
export function meetingFromKrisp(meeting, fetchedTranscript) {
    // Transcript: prefer fetched full text, fall back to inline segments if present
    let transcript = fetchedTranscript ?? '';
    if (!transcript && Array.isArray(meeting.transcript)) {
        transcript = meeting.transcript
            .map(s => {
            const speaker = s.speaker ?? 'Unknown';
            const text = s.text ?? '';
            const ts = s.timestamp ?? '';
            return ts ? `**[${ts}] ${speaker}**: ${text}` : `**${speaker}**: ${text}`;
        })
            .join('\n\n');
    }
    const notes = resolveNotes(meeting);
    const action_items = (notes.action_items ?? [])
        .filter(item => item.text) // Skip items without text to avoid "undefined"
        .map(item => item.text + (item.assignee ? ` (@${item.assignee})` : ''));
    const highlights = notes.key_points ?? [];
    // Attendees may be plain strings or objects with name/email
    const attendees = (meeting.attendees ?? [])
        .map(a => {
        if (typeof a === 'string')
            return { name: a, email: null };
        return { name: a.name ?? null, email: a.email ?? null };
    });
    if (attendees.length === 0 && meeting.speakers) {
        for (const speaker of meeting.speakers) {
            attendees.push({ name: speaker, email: null });
        }
    }
    return {
        title: meeting.name ?? 'Untitled Meeting',
        date: meeting.date ?? new Date().toISOString().slice(0, 10),
        duration_minutes: 0,
        summary: notes.detailed_summary ?? '',
        transcript,
        action_items,
        highlights,
        attendees,
        url: meeting.url ?? '',
    };
}
//# sourceMappingURL=save.js.map