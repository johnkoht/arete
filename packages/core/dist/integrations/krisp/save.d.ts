/**
 * Krisp MCP — transform search_meetings response to MeetingForSave.
 */
import type { MeetingForSave } from '../meetings.js';
import type { KrispMeeting } from './types.js';
/**
 * Transform a Krisp meeting to MeetingForSave.
 *
 * @param meeting - Raw meeting from search_meetings
 * @param fetchedTranscript - Full transcript from get_multiple_documents (optional)
 */
export declare function meetingFromKrisp(meeting: KrispMeeting, fetchedTranscript?: string): MeetingForSave;
//# sourceMappingURL=save.d.ts.map