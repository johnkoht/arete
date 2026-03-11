/**
 * Krisp MCP integration types.
 * Updated against live API responses 2026-03-02
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
 * Instead it returns a reference with a status indicator.
 * Fetch full content via get_multiple_documents.
 */
export type KrispTranscriptRef = {
    status?: string;
    note?: string;
};
/**
 * Nested meeting_notes object from search_meetings.
 * Contains pre-computed summaries when available.
 */
export type KrispMeetingNotes = {
    detailed_summary?: string;
    key_points?: string[];
    action_items?: KrispActionItem[];
};
/**
 * Response from search_meetings.
 *
 * Verified against live API 2026-03-02:
 * - Uses `meeting_id` not `id`
 * - `speakers` are plain strings, not objects
 * - `attendees` may be plain strings or objects depending on data availability
 * - `transcript` is a reference object { status }, not inline content
 * - `meeting_notes` is a nested object (may be absent for unprocessed meetings)
 * - `detailed_summary`, `key_points`, `action_items` may appear as top-level
 *   OR nested inside `meeting_notes`
 */
export type KrispMeeting = {
    meeting_id: string;
    name?: string;
    date?: string;
    url?: string;
    is_recurring?: boolean;
    attendees?: (KrispAttendee | string)[];
    speakers?: KrispSpeaker[];
    transcript?: KrispTranscriptRef | KrispTranscriptSegment[];
    agenda?: string | {
        agenda_id?: string;
        note?: string;
    };
    meeting_notes?: string | KrispMeetingNotes;
    detailed_summary?: string;
    key_points?: string[];
    action_items?: KrispActionItem[];
};
/** Single result from get_multiple_documents. */
export type KrispDocumentResult = {
    id: string;
    document: string | null;
};
/** Response from get_multiple_documents — returns full document content as markdown. */
export type KrispDocument = {
    results?: KrispDocumentResult[];
    documentId?: string;
    document?: string;
    [key: string]: unknown;
};
//# sourceMappingURL=types.d.ts.map