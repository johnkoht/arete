/**
 * Krisp MCP integration types.
 * Verified against live API responses 2026-02-21
 */
export type KrispAttendee = {
    name?: string;
    email?: string;
};
/** Krisp returns speakers as plain strings, not objects. */
export type KrispSpeaker = string;
export type KrispTranscriptSegment = {
    speaker?: string;
    text?: string;
    timestamp?: string;
};
export type KrispActionItem = {
    text: string;
    assignee?: string;
    due_date?: string;
    completed?: boolean;
};
/**
 * Transcript field from search_meetings — Krisp doesn't inline transcripts.
 * Instead it returns a reference to fetch via getDocument.
 */
export type KrispTranscriptRef = {
    status?: string;
    note?: string;
};
/**
 * Response from search_meetings.
 *
 * Key differences from initial assumptions (verified via live API):
 * - Uses `meeting_id` not `id`
 * - `speakers` are plain strings, not objects
 * - `transcript` is a reference object, not inline segments
 */
export type KrispMeeting = {
    meeting_id: string;
    name?: string;
    date?: string;
    url?: string;
    is_recurring?: boolean;
    attendees?: KrispAttendee[];
    speakers?: KrispSpeaker[];
    transcript?: KrispTranscriptRef | KrispTranscriptSegment[];
    agenda?: string | {
        agenda_id?: string;
        note?: string;
    };
    meeting_notes?: string;
    detailed_summary?: string;
    key_points?: string[];
    action_items?: KrispActionItem[];
};
/** Response from get_document — returns full document content as markdown. */
export type KrispDocument = {
    documentId?: string;
    document?: string;
    [key: string]: unknown;
};
//# sourceMappingURL=types.d.ts.map